#!/usr/bin/env node
/**
 * Repeatable CLI to train 3D Gaussian Splats using Spirula Studio (CUDA backend)
 * on a remote Google Colab GPU with per-architecture binary caching and local .spz compression.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  GPU_ARCH_MAP,
  REPO_ROOT,
  SCRIPTS_DIR,
  convertPlyToSpz,
  execRemoteScript,
  parseGpuLadder,
  provisionColabSession,
  resolveColmapZip,
  runStreaming,
  sanitizeSlug,
  timestampSlug,
} from './lib/colab-common.mjs';

const WORKER_SCRIPT = path.join(SCRIPTS_DIR, 'colab-spirula-cuda-train.py');
const CACHE_DIR = path.join(os.homedir(), '.cache', 'artifacture', 'spirula-cuda');

function printHelp() {
  console.log(`Usage: spirula-colab [options]

Options:
  --data <path>          Local COLMAP directory (images/ + sparse/) or .zip archive
  --preset <subdir>      HF dataset subdir (e.g. tandt/truck, db/playroom) [default: tandt/truck]
  --hf-repo <repo>       HF dataset repo [default: alexmkwizu/gaussian_training_datasets]
  --gpu <type>           Preferred Colab GPU (prepended to --gpus ladder)
  --gpus <list>          Comma-separated fallback GPU ladder [default: T4,L4,A100]
  --attempt-timeout <s>  Per-attempt provisioning timeout seconds [default: 35]
  --steps <n>            Training iterations [default: 7000]
  --run-name <name>      Run identifier [default: <dataset>-<timestamp>]
  --out <dir>            Output folder [default: ./out/spirula-colab/<run-name>]
  --session <name>       Colab session name [default: spirula-<timestamp>]
  --reuse-session        Reuse an existing Colab session instead of creating a new one
  --keep                 Keep Colab VM running after training completes
  --rebuild              Ignore local cached binary and recompile from source on Colab
  --full-camera-matrix   Compile all camera/distortion models (slower first compile)
  --primitive <name>     Spirula primitive [default: 3dgs]
  --eval-mode <mode>     interval | none [default: interval]
  --eval-interval <n>    Eval interval [default: 8]
  --no-spz               Skip local .ply -> .spz compression
  --sh-spz               Preserve spherical harmonics when encoding .spz
  -h, --help             Show this help message`);
}

function parseArgs(argv) {
  const opts = {
    data: null,
    preset: 'tandt/truck',
    hfRepo: 'alexmkwizu/gaussian_training_datasets',
    gpu: null,
    gpus: 'T4,L4,A100',
    attemptTimeout: 35,
    steps: 7000,
    runName: null,
    out: null,
    session: null,
    reuseSession: false,
    keep: false,
    rebuild: false,
    fullCameraMatrix: false,
    primitive: '3dgs',
    evalMode: 'interval',
    evalInterval: 8,
    noSpz: false,
    shSpz: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return argv[i];
    };
    switch (arg) {
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;
      case '--data': opts.data = next(); break;
      case '--preset': opts.preset = next(); break;
      case '--hf-repo': opts.hfRepo = next(); break;
      case '--gpu': opts.gpu = next(); break;
      case '--gpus': opts.gpus = next(); break;
      case '--attempt-timeout': opts.attemptTimeout = Number(next()); break;
      case '--steps': opts.steps = Number.parseInt(next(), 10); break;
      case '--run-name': opts.runName = next(); break;
      case '--out': opts.out = next(); break;
      case '--session': opts.session = next(); break;
      case '--reuse-session': opts.reuseSession = true; break;
      case '--keep': opts.keep = true; break;
      case '--rebuild': opts.rebuild = true; break;
      case '--full-camera-matrix': opts.fullCameraMatrix = true; break;
      case '--primitive': opts.primitive = next(); break;
      case '--eval-mode': opts.evalMode = next(); break;
      case '--eval-interval': opts.evalInterval = Number.parseInt(next(), 10); break;
      case '--no-spz': opts.noSpz = true; break;
      case '--sh-spz': opts.shSpz = true; break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const stamp = timestampSlug();
  const baseLabel = opts.data
    ? path.basename(path.resolve(REPO_ROOT, opts.data)).replace(/\.zip$/i, '')
    : opts.preset.split('/').pop() || 'scene';
  const runName = opts.runName ? sanitizeSlug(opts.runName) : `${sanitizeSlug(baseLabel)}-${stamp}`;
  const outDir = opts.out ? path.resolve(REPO_ROOT, opts.out) : path.join(REPO_ROOT, 'out', 'spirula-colab', runName);
  const sessionName = opts.session || `spirula-${stamp}`;
  const ladder = parseGpuLadder(opts.gpu, opts.gpus, 'T4,L4,A100');

  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'spirula-colab-'));

  let localZip = null;
  let datasetLabel = opts.preset;
  if (opts.data) {
    const resolved = resolveColmapZip(opts.data, tempDir);
    localZip = resolved.zipPath;
    datasetLabel = resolved.datasetLabel;
  }

  let session = null;
  const cleanup = () => {
    session?.stop();
    rmSync(tempDir, { recursive: true, force: true });
  };
  const onSignal = () => { cleanup(); process.exit(130); };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    session = await provisionColabSession({
      sessionName,
      gpus: ladder,
      reuseSession: opts.reuseSession,
      attemptTimeoutSec: opts.attemptTimeout,
      keep: opts.keep,
    });

    const gpuKey = session.gpuRequested === 'existing' ? ladder[0] : session.gpuRequested;
    const arch = GPU_ARCH_MAP[gpuKey] || 'sm75';
    const suffix = opts.fullCameraMatrix ? '-full' : '';
    const cachedBinPath = path.join(CACHE_DIR, `spirula-cuda-${arch}${suffix}`);

    if (existsSync(cachedBinPath) && !opts.rebuild) {
      console.log(`[spirula-colab] Uploading cached binary: ${cachedBinPath}`);
      await runStreaming('colab', ['upload', '-s', sessionName, cachedBinPath, '/content/spirula-cuda-bin']);
    }
    if (localZip) {
      console.log(`[spirula-colab] Uploading dataset (${(statSync(localZip).size / 1e6).toFixed(2)} MB)...`);
      await runStreaming('colab', ['upload', '-s', sessionName, localZip, '/content/dataset.zip']);
    }

    const remoteOutPly = '/content/spirula-out.ply';
    const remoteMetaJson = '/content/spirula-run-meta.json';
    const workerArgs = [
      '--binary', '/content/spirula-cuda-bin',
      '--run-name', runName,
      '--steps', String(opts.steps),
      '--primitive', opts.primitive,
      '--eval-mode', opts.evalMode,
      '--eval-interval', String(opts.evalInterval),
      '--out-ply', remoteOutPly,
      '--bench-json', remoteMetaJson,
      '--dataset-label', datasetLabel,
    ];
    if (opts.rebuild) workerArgs.push('--rebuild');
    if (opts.fullCameraMatrix) workerArgs.push('--full-camera-matrix');
    if (localZip) {
      workerArgs.push('--data-zip', '/content/dataset.zip');
    } else {
      workerArgs.push('--hf-repo', opts.hfRepo, '--hf-subdir', opts.preset, '--data-dir', `/content/datasets/${opts.preset}`);
    }

    await execRemoteScript(sessionName, WORKER_SCRIPT, '/content/colab-spirula-cuda-train.py', workerArgs);

    const localPly = path.join(outDir, `${runName}.ply`);
    const localMeta = path.join(outDir, 'meta.json');
    await runStreaming('colab', ['download', '-s', sessionName, remoteOutPly, localPly]);
    await runStreaming('colab', ['download', '-s', sessionName, remoteMetaJson, localMeta]);

    const meta = JSON.parse(readFileSync(localMeta, 'utf-8'));
    if (meta.built_from_source) {
      const capTag = meta.compute_cap ? `sm${String(meta.compute_cap).replace(/\./g, '')}` : arch;
      const saveBinPath = path.join(CACHE_DIR, `spirula-cuda-${capTag}${suffix}`);
      await runStreaming('colab', ['download', '-s', sessionName, '/content/spirula-cuda-bin', saveBinPath]);
      chmodSync(saveBinPath, 0o755);
    }

    if (!opts.noSpz) {
      const localSpz = path.join(outDir, `${runName}.spz`);
      if (await convertPlyToSpz(localPly, localSpz, opts.shSpz)) {
        meta.out_spz = localSpz;
        meta.spz_bytes = statSync(localSpz).size;
        writeFileSync(localMeta, `${JSON.stringify(meta, null, 2)}\n`);
      }
    }

    console.log(`\n[spirula-colab] Done -> ${localPly}`);
    if (opts.keep) console.log(`[spirula-colab] VM kept alive. Stop with: colab stop -s ${sessionName}`);
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    cleanup();
  }
}

await main();

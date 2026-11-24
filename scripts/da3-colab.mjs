#!/usr/bin/env node
/**
 * Repeatable CLI for pose-free feed-forward 3DGS via ByteDance-Seed Depth Anything 3 on Colab GPU.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  REPO_ROOT,
  SCRIPTS_DIR,
  convertPlyToSpz,
  execRemoteScript,
  parseGpuLadder,
  provisionColabSession,
  runCmdSync,
  runStreaming,
  sanitizeSlug,
  timestampSlug,
} from './lib/colab-common.mjs';

const WORKER_SCRIPT = path.join(SCRIPTS_DIR, 'colab-da3-3dgs.py');

function printHelp() {
  console.log(`Usage: da3-colab [options]

Options:
  --images <dir|zip>     Local folder of unposed photos/frames or .zip archive
  --preset <subdir>      HF image source when --images omitted [default: tandt/truck]
  --model-id <hf_id>     DA3 checkpoint [default: depth-anything/DA3-GIANT-1.1]
  --num-views <n>        Max evenly sampled views [default: 12]
  --gpu <type>           Preferred Colab GPU
  --gpus <list>          Comma-separated fallback GPU ladder [default: T4,L4,A100]
  --out <dir>            Output folder [default: ./out/da3-colab/<name>-<timestamp>]
  --session <name>       Colab session name [default: da3-<timestamp>]
  --reuse-session        Reuse active Colab session if present
  --keep                 Keep Colab VM running after finish
  --no-spz               Skip local .ply -> .spz conversion
  -h, --help             Show this help`);
}

function parseArgs(argv) {
  const opts = {
    images: null,
    preset: 'tandt/truck',
    modelId: 'depth-anything/DA3-GIANT-1.1',
    numViews: 12,
    gpu: null,
    gpus: 'T4,L4,A100',
    out: null,
    session: null,
    reuseSession: false,
    keep: false,
    noSpz: false,
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
      case '--images': opts.images = next(); break;
      case '--preset': opts.preset = next(); break;
      case '--model-id': opts.modelId = next(); break;
      case '--num-views': opts.numViews = Number.parseInt(next(), 10); break;
      case '--gpu': opts.gpu = next(); break;
      case '--gpus': opts.gpus = next(); break;
      case '--out': opts.out = next(); break;
      case '--session': opts.session = next(); break;
      case '--reuse-session': opts.reuseSession = true; break;
      case '--keep': opts.keep = true; break;
      case '--no-spz': opts.noSpz = true; break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const stamp = timestampSlug();
  const baseLabel = opts.images
    ? path.basename(path.resolve(REPO_ROOT, opts.images)).replace(/\.zip$/i, '')
    : opts.preset.split('/').pop() || 'scene';
  const outDir = opts.out
    ? path.resolve(REPO_ROOT, opts.out)
    : path.join(REPO_ROOT, 'out', 'da3-colab', `${sanitizeSlug(baseLabel)}-${stamp}`);
  const sessionName = opts.session || `da3-${stamp}`;

  mkdirSync(outDir, { recursive: true });
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'da3-colab-'));
  let session = null;
  const cleanup = () => {
    session?.stop();
    rmSync(tempDir, { recursive: true, force: true });
  };
  const onSignal = () => { cleanup(); process.exit(130); };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    let localZip = null;
    if (opts.images) {
      const abs = path.resolve(REPO_ROOT, opts.images);
      if (!existsSync(abs)) throw new Error(`--images path not found: ${abs}`);
      if (statSync(abs).isDirectory()) {
        localZip = path.join(tempDir, 'images.zip');
        runCmdSync('zip', ['-rq', localZip, '.'], abs);
      } else {
        localZip = abs;
      }
    }

    session = await provisionColabSession({
      sessionName,
      gpus: parseGpuLadder(opts.gpu, opts.gpus),
      reuseSession: opts.reuseSession,
      keep: opts.keep,
    });

    const args = [
      '--model-id', opts.modelId,
      '--num-views', String(opts.numViews),
      '--out-ply', '/content/da3-out.ply',
      '--meta-json', '/content/da3-meta.json',
    ];
    if (localZip) {
      await runStreaming('colab', ['upload', '-s', sessionName, localZip, '/content/da3_images.zip']);
      args.push('--images-zip', '/content/da3_images.zip');
    } else {
      args.push('--hf-subdir', opts.preset);
    }

    await execRemoteScript(sessionName, WORKER_SCRIPT, '/content/colab-da3-3dgs.py', args);

    const localPly = path.join(outDir, `${sanitizeSlug(baseLabel)}-da3.ply`);
    const localMeta = path.join(outDir, 'meta.json');
    await runStreaming('colab', ['download', '-s', sessionName, '/content/da3-out.ply', localPly]);
    await runStreaming('colab', ['download', '-s', sessionName, '/content/da3-meta.json', localMeta]);

    const meta = JSON.parse(readFileSync(localMeta, 'utf-8'));
    if (!opts.noSpz) {
      const localSpz = path.join(outDir, `${sanitizeSlug(baseLabel)}-da3.spz`);
      if (await convertPlyToSpz(localPly, localSpz, false)) {
        meta.out_spz = localSpz;
        meta.spz_bytes = statSync(localSpz).size;
        writeFileSync(localMeta, `${JSON.stringify(meta, null, 2)}\n`);
      }
    }
    console.log(`\n[da3-colab] Done -> ${meta.out_spz || localPly} (${meta.splat_count?.toLocaleString?.()} splats in ${meta.infer_sec}s)`);
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    cleanup();
  }
}

await main();

#!/usr/bin/env node
/**
 * Repeatable CLI for floater-free gsplat MCMC-3DGS training on a Colab CUDA GPU.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
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

const WORKER_SCRIPT = path.join(SCRIPTS_DIR, 'colab-mcmc-3dgs.py');

function printHelp() {
  console.log(`Usage: mcmc-colab [options]

Options:
  --data <dir|zip>       Local COLMAP directory (images/ + sparse/) or .zip archive
  --preset <subdir>      HF dataset subdir [default: tandt/truck]
  --hf-repo <repo>       HF dataset repo [default: alexmkwizu/gaussian_training_datasets]
  --steps <n>            Training steps [default: 3000]
  --cap-max <n>          MCMC splat budget cap [default: 300000]
  --gpu <type>           Preferred Colab GPU
  --gpus <list>          Comma-separated fallback GPU ladder [default: T4,L4,A100]
  --out <dir>            Output folder [default: ./out/mcmc-colab/<name>-<timestamp>]
  --session <name>       Colab session name [default: mcmc-<timestamp>]
  --reuse-session        Reuse active Colab session if present
  --keep                 Keep Colab VM running after finish
  --no-spz               Skip local .ply -> .spz conversion
  --sh-spz               Preserve SH bands when writing .spz
  -h, --help             Show this help`);
}

function parseArgs(argv) {
  const opts = {
    data: null,
    preset: 'tandt/truck',
    hfRepo: 'alexmkwizu/gaussian_training_datasets',
    steps: 3000,
    capMax: 300000,
    gpu: null,
    gpus: 'T4,L4,A100',
    out: null,
    session: null,
    reuseSession: false,
    keep: false,
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
      case '--steps': opts.steps = Number.parseInt(next(), 10); break;
      case '--cap-max': opts.capMax = Number.parseInt(next(), 10); break;
      case '--gpu': opts.gpu = next(); break;
      case '--gpus': opts.gpus = next(); break;
      case '--out': opts.out = next(); break;
      case '--session': opts.session = next(); break;
      case '--reuse-session': opts.reuseSession = true; break;
      case '--keep': opts.keep = true; break;
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
  const outDir = opts.out
    ? path.resolve(REPO_ROOT, opts.out)
    : path.join(REPO_ROOT, 'out', 'mcmc-colab', `${sanitizeSlug(baseLabel)}-${stamp}`);
  const sessionName = opts.session || `mcmc-${stamp}`;

  mkdirSync(outDir, { recursive: true });
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'mcmc-colab-'));
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
    if (opts.data) {
      localZip = resolveColmapZip(opts.data, tempDir).zipPath;
    }

    session = await provisionColabSession({
      sessionName,
      gpus: parseGpuLadder(opts.gpu, opts.gpus),
      reuseSession: opts.reuseSession,
      keep: opts.keep,
    });

    const args = [
      '--steps', String(opts.steps),
      '--cap-max', String(opts.capMax),
      '--out-ply', '/content/mcmc-out.ply',
      '--meta-json', '/content/mcmc-meta.json',
    ];
    if (localZip) {
      await runStreaming('colab', ['upload', '-s', sessionName, localZip, '/content/mcmc_ds.zip']);
      args.push('--data-zip', '/content/mcmc_ds.zip');
    } else {
      args.push('--hf-repo', opts.hfRepo, '--hf-subdir', opts.preset, '--data-dir', `/content/datasets/${opts.preset}`);
    }

    await execRemoteScript(sessionName, WORKER_SCRIPT, '/content/colab-mcmc-3dgs.py', args);

    const localPly = path.join(outDir, `${sanitizeSlug(baseLabel)}-mcmc.ply`);
    const localMeta = path.join(outDir, 'meta.json');
    await runStreaming('colab', ['download', '-s', sessionName, '/content/mcmc-out.ply', localPly]);
    await runStreaming('colab', ['download', '-s', sessionName, '/content/mcmc-meta.json', localMeta]);

    const meta = JSON.parse(readFileSync(localMeta, 'utf-8'));
    if (!opts.noSpz) {
      const localSpz = path.join(outDir, `${sanitizeSlug(baseLabel)}-mcmc.spz`);
      if (await convertPlyToSpz(localPly, localSpz, opts.shSpz)) {
        meta.out_spz = localSpz;
        meta.spz_bytes = statSync(localSpz).size;
        writeFileSync(localMeta, `${JSON.stringify(meta, null, 2)}\n`);
      }
    }
    console.log(`\n[mcmc-colab] Done -> ${localPly} (PSNR=${meta.avg_psnr} dB, SSIM=${meta.avg_ssim}, ${meta.splat_count?.toLocaleString?.()} splats)`);
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    cleanup();
  }
}

await main();

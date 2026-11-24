#!/usr/bin/env node
/**
 * Repeatable CLI for single-image 3DGS synthesis via Apple SHARP on a Colab CUDA GPU.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  REPO_ROOT,
  SCRIPTS_DIR,
  convertPlyToSpz,
  execRemoteScript,
  parseGpuLadder,
  provisionColabSession,
  runStreaming,
  sanitizeSlug,
  timestampSlug,
} from './lib/colab-common.mjs';

const WORKER_SCRIPT = path.join(SCRIPTS_DIR, 'colab-sharp-splat.py');

function printHelp() {
  console.log(`Usage: sharp-colab --input <image.png|jpg> [options]

Options:
  --input <path>         Input image path (required)
  --gpu <type>           Preferred Colab GPU
  --gpus <list>          Comma-separated fallback GPU ladder [default: T4,L4,A100]
  --out <dir>            Output folder [default: ./out/sharp-colab/<name>-<timestamp>]
  --session <name>       Colab session name [default: sharp-<timestamp>]
  --reuse-session        Reuse active Colab session if present
  --keep                 Keep Colab VM running after finish
  --no-spz               Skip local .ply -> .spz conversion
  -h, --help             Show this help`);
}

function parseArgs(argv) {
  const opts = {
    input: null,
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
      case '--input': opts.input = next(); break;
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
  if (!opts.input) throw new Error('--input <image> is required');
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const inputAbs = path.resolve(REPO_ROOT, opts.input);
  if (!existsSync(inputAbs)) throw new Error(`Input file not found: ${inputAbs}`);
  const baseName = sanitizeSlug(path.parse(inputAbs).name);
  const stamp = timestampSlug();
  const outDir = opts.out
    ? path.resolve(REPO_ROOT, opts.out)
    : path.join(REPO_ROOT, 'out', 'sharp-colab', `${baseName}-${stamp}`);
  const sessionName = opts.session || `sharp-${stamp}`;

  mkdirSync(outDir, { recursive: true });
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'sharp-colab-'));
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
      gpus: parseGpuLadder(opts.gpu, opts.gpus),
      reuseSession: opts.reuseSession,
      keep: opts.keep,
    });
    const remoteIn = `/content/sharp_input${path.extname(inputAbs) || '.png'}`;
    const remoteOut = '/content/sharp_out.ply';
    await runStreaming('colab', ['upload', '-s', sessionName, inputAbs, remoteIn]);
    await execRemoteScript(sessionName, WORKER_SCRIPT, '/content/colab-sharp-splat.py', [
      '--input', remoteIn,
      '--output', remoteOut,
    ]);
    const localPly = path.join(outDir, `${baseName}.ply`);
    await runStreaming('colab', ['download', '-s', sessionName, remoteOut, localPly]);
    const meta = {
      backend: 'apple-ml-sharp',
      input: inputAbs,
      ply_path: localPly,
      ply_bytes: statSync(localPly).size,
    };
    if (!opts.noSpz) {
      const localSpz = path.join(outDir, `${baseName}.spz`);
      if (await convertPlyToSpz(localPly, localSpz, false)) {
        meta.spz_path = localSpz;
        meta.spz_bytes = statSync(localSpz).size;
      }
    }
    writeFileSync(path.join(outDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
    console.log(`\n[sharp-colab] Done -> ${meta.spz_path || localPly}`);
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    cleanup();
  }
}

await main();

#!/usr/bin/env node
/**
 * Repeatable CLI for real NVIDIA Warp CUDA MLS-MPM physics & destruction VFX on 3D Gaussian Splats.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  REPO_ROOT,
  SCRIPTS_DIR,
  convertPlyToSpz,
  convertSpzToPly,
  execRemoteScript,
  parseGpuLadder,
  provisionColabSession,
  runStreaming,
  sanitizeSlug,
  timestampSlug,
  uploadFile,
} from './lib/colab-common.mjs';

const WORKER_SCRIPT = path.join(SCRIPTS_DIR, 'colab-physgs-mpm.py');

function printHelp() {
  console.log(`Usage: physgs-colab --input <scene.ply|spz> [options]

Options:
  --input <path>         Input 3DGS .ply or .spz path (required)
  --preset <name>        shatter | blast | smoke_dissolve | elastic_drop [default: shatter]
  --roi <spec>           auto | all | radius:<r> | sphere:x,y,z,r | box:x0,y0,z0,x1,y1,z1 [default: auto]
  --flip-x               Flip 180 deg around X before simulating (OpenCV Y-down scans)
  --up <ux,uy,uz>        Gravity-up normal vector in coordinates after --flip-x
  --max-particles <n>    Max hero MPM particles [default: 150000]
  --frames <n>           Keyframes to export [default: 54]
  --fps <n>              Trajectory FPS [default: 15]
  --grid <n>             MPM background grid resolution [default: 64]
  --substeps <n>         MPM substeps per frame [default: 64]
  --gpu <type>           Preferred Colab GPU
  --gpus <list>          Comma-separated fallback GPU ladder [default: T4,L4,A100]
  --out <dir>            Output folder [default: ./out/physgs-colab/<name>-<timestamp>]
  --session <name>       Colab session name [default: physgs-<timestamp>]
  --reuse-session        Reuse active Colab session if present
  --keep                 Keep Colab VM running after finish
  -h, --help             Show this help`);
}

function parseArgs(argv) {
  const opts = {
    input: null,
    preset: 'shatter',
    roi: 'auto',
    flipX: false,
    up: null,
    maxParticles: 150000,
    frames: 54,
    fps: 15,
    grid: 64,
    substeps: 64,
    gpu: null,
    gpus: 'T4,L4,A100',
    out: null,
    session: null,
    reuseSession: false,
    keep: false,
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
      case '--preset': opts.preset = next(); break;
      case '--roi': opts.roi = next(); break;
      case '--flip-x': opts.flipX = true; break;
      case '--up': opts.up = next(); break;
      case '--max-particles': opts.maxParticles = Number.parseInt(next(), 10); break;
      case '--frames': opts.frames = Number.parseInt(next(), 10); break;
      case '--fps': opts.fps = Number(next()); break;
      case '--grid': opts.grid = Number.parseInt(next(), 10); break;
      case '--substeps': opts.substeps = Number.parseInt(next(), 10); break;
      case '--gpu': opts.gpu = next(); break;
      case '--gpus': opts.gpus = next(); break;
      case '--out': opts.out = next(); break;
      case '--session': opts.session = next(); break;
      case '--reuse-session': opts.reuseSession = true; break;
      case '--keep': opts.keep = true; break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!opts.input) throw new Error('--input <scene.ply|spz> is required');
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const inputAbs = path.resolve(REPO_ROOT, opts.input);
  if (!existsSync(inputAbs)) throw new Error(`Input file not found: ${inputAbs}`);
  const stamp = timestampSlug();
  const baseName = sanitizeSlug(path.parse(inputAbs).name);
  const outDir = opts.out
    ? path.resolve(REPO_ROOT, opts.out)
    : path.join(REPO_ROOT, 'out', 'physgs-colab', `${baseName}-${opts.preset}-${stamp}`);
  const sessionName = opts.session || `physgs-${stamp}`;

  mkdirSync(outDir, { recursive: true });
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'physgs-colab-'));
  let session = null;
  const cleanup = () => {
    session?.stop();
    rmSync(tempDir, { recursive: true, force: true });
  };
  const onSignal = () => { cleanup(); process.exit(130); };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    let uploadPly = inputAbs;
    if (inputAbs.toLowerCase().endsWith('.spz')) {
      uploadPly = path.join(tempDir, 'input.ply');
      console.log(`[physgs-colab] Converting ${path.basename(inputAbs)} -> .ply for CUDA Warp input...`);
      await convertSpzToPly(inputAbs, uploadPly, false);
    }

    session = await provisionColabSession({
      sessionName,
      gpus: parseGpuLadder(opts.gpu, opts.gpus),
      reuseSession: opts.reuseSession,
      keep: opts.keep,
    });

    const remoteIn = '/content/physgs_input.ply';
    const remoteOutDir = '/content/physgs_out';
    console.log(`[physgs-colab] Uploading ${path.basename(uploadPly)} (${(statSync(uploadPly).size / 1e6).toFixed(2)} MB)...`);
    await uploadFile(sessionName, uploadPly, remoteIn);

    const args = [
      '--input', remoteIn,
      '--out-dir', remoteOutDir,
      '--preset', opts.preset,
      '--roi', opts.roi,
      '--max-particles', String(opts.maxParticles),
      '--frames', String(opts.frames),
      '--fps', String(opts.fps),
      '--grid', String(opts.grid),
      '--substeps', String(opts.substeps),
    ];
    if (opts.flipX) args.push('--flip-x');
    if (opts.up) args.push('--up', opts.up);

    await execRemoteScript(sessionName, WORKER_SCRIPT, '/content/colab-physgs-mpm.py', args);

    for (const fname of ['mpm-dynamic.ply', 'mpm-traj.bin', 'meta.json']) {
      await runStreaming('colab', ['download', '-s', sessionName, `${remoteOutDir}/${fname}`, path.join(outDir, fname)]);
    }

    const meta = JSON.parse(readFileSync(path.join(outDir, 'meta.json'), 'utf-8'));
    if (meta.static_particles > 0) {
      await runStreaming('colab', ['download', '-s', sessionName, `${remoteOutDir}/mpm-static.ply`, path.join(outDir, 'mpm-static.ply')]);
      await convertPlyToSpz(path.join(outDir, 'mpm-static.ply'), path.join(outDir, 'mpm-static.spz'), false);
      meta.static_spz_bytes = statSync(path.join(outDir, 'mpm-static.spz')).size;
    } else {
      meta.static_spz_bytes = 0;
    }
    await convertPlyToSpz(path.join(outDir, 'mpm-dynamic.ply'), path.join(outDir, 'mpm-dynamic.spz'), false);
    meta.dynamic_spz_bytes = statSync(path.join(outDir, 'mpm-dynamic.spz')).size;
    writeFileSync(path.join(outDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);

    console.log(`\n[physgs-colab] Done -> ${outDir}`);
    console.log(`  Simulated particles: ${meta.num_particles.toLocaleString()} (static bg: ${meta.static_particles.toLocaleString()})`);
    console.log(`  CUDA Warp time:      ${meta.sim_sec}s (${meta.ms_per_frame} ms/frame on ${meta.gpu_name})`);
    console.log(`  Trajectory size:     ${(meta.traj_bytes / 1e6).toFixed(2)} MB (mpm-traj.bin)`);
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    cleanup();
  }
}

await main();

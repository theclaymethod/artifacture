/**
 * Shared Colab CLI provisioning (bounded fallback ladder), streaming execution,
 * dataset zipping, and local .ply <-> .spz conversion helpers.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SCRIPTS_DIR = path.resolve(LIB_DIR, '..');
export const REPO_ROOT = path.resolve(SCRIPTS_DIR, '..');
export const RADIX_CORE_PATH = '/Users/claytonkim/dev/radix/dist/radix-core.module.js';

export const GPU_ARCH_MAP = {
  T4: 'sm75',
  L4: 'sm89',
  A100: 'sm80',
  H100: 'sm90',
};

export function timestampSlug() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

export function sanitizeSlug(raw) {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'run'
  );
}

export function runCmdSync(bin, args, cwd = REPO_ROOT) {
  const res = spawnSync(bin, args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (res.status !== 0) {
    throw new Error(
      `Command failed (${res.status}): ${bin} ${args.join(' ')}\n${res.stdout || ''}\n${res.stderr || ''}`.trim(),
    );
  }
  return res.stdout || '';
}

export function runStreaming(bin, args, { stdinText = null, cwd = REPO_ROOT, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      env,
      stdio: [stdinText !== null ? 'pipe' : 'ignore', 'inherit', 'inherit'],
    });
    if (stdinText !== null && child.stdin) {
      child.stdin.write(stdinText);
      child.stdin.end();
    }
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed (${code}): ${bin} ${args.join(' ')}`));
      }
    });
  });
}

export function parseGpuLadder(gpuSingle, gpusCsv, fallbackDefault = 'T4,L4,A100') {
  const list = (gpusCsv || fallbackDefault)
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (gpuSingle) {
    const g = gpuSingle.trim().toUpperCase();
    return [g, ...list.filter((x) => x !== g)];
  }
  return list;
}

export async function provisionColabSession({
  sessionName,
  gpus = ['T4', 'L4', 'A100'],
  reuseSession = false,
  attemptTimeoutSec = 60,
  keep = false,
}) {
  if (reuseSession) {
    const sessOut = runCmdSync('colab', ['sessions'], REPO_ROOT);
    if (sessOut.includes(sessionName)) {
      console.log(`[colab-workflow] Reusing active Colab session: ${sessionName}`);
      return {
        sessionName,
        created: false,
        gpuRequested: 'existing',
        stop: () => {
          if (!keep) {
            spawnSync('colab', ['stop', '-s', sessionName], { encoding: 'utf-8', stdio: 'inherit' });
          }
        },
      };
    }
  }

  let chosenGpu = null;
  let lastErr = null;

  for (const gpu of gpus) {
    console.log(`[colab-workflow] Provisioning ${gpu} (${sessionName}, timeout=${attemptTimeoutSec}s)...`);
    const env = {
      ...process.env,
      COLAB_CLI_ASSIGN_RETRIES: '0',
      COLAB_CLI_REQUEST_TIMEOUT: String(Math.min(45, attemptTimeoutSec)),
    };
    const res = spawnSync('colab', ['new', '-s', sessionName, '--gpu', gpu], {
      cwd: REPO_ROOT,
      env,
      encoding: 'utf-8',
      timeout: attemptTimeoutSec * 1000,
    });
    if (res.stdout) process.stdout.write(res.stdout);
    if (res.stderr) process.stderr.write(res.stderr);
    if (res.status === 0) {
      chosenGpu = gpu;
      break;
    }
    lastErr = res.error?.message || `exit ${res.status}: ${(res.stderr || res.stdout || '').trim()}`;
    // Clean any partial assignment before falling through the GPU ladder
    spawnSync('colab', ['stop', '-s', sessionName], { encoding: 'utf-8', stdio: 'ignore' });
  }

  if (!chosenGpu) {
    throw new Error(`Failed to allocate Colab GPU from ladder [${gpus.join(', ')}]: ${lastErr}`);
  }

  return {
    sessionName,
    created: true,
    gpuRequested: chosenGpu,
    stop: () => {
      if (!keep) {
        console.log(`[colab-workflow] Stopping Colab session ${sessionName}...`);
        const stopRes = spawnSync('colab', ['stop', '-s', sessionName], {
          encoding: 'utf-8',
          stdio: 'inherit',
        });
        if (stopRes.status !== 0) {
          console.warn(`[colab-workflow] Warning: colab stop -s ${sessionName} exited ${stopRes.status}`);
        }
      }
    },
  };
}

export async function uploadFile(sessionName, localPath, remotePath, chunkBytes = 25 * 1024 * 1024) {
  const size = statSync(localPath).size;
  if (size <= chunkBytes) {
    await runStreaming('colab', ['upload', '-s', sessionName, localPath, remotePath]);
    return;
  }
  const tmpParts = mkdtempSync(path.join(os.tmpdir(), 'colab-up-'));
  try {
    const buf = readFileSync(localPath);
    const numParts = Math.ceil(buf.length / chunkBytes);
    const remoteParts = [];
    for (let i = 0; i < numParts; i += 1) {
      const partLocal = path.join(tmpParts, `part.${i}`);
      const partRemote = `${remotePath}.part${i}`;
      writeFileSync(partLocal, buf.subarray(i * chunkBytes, Math.min(buf.length, (i + 1) * chunkBytes)));
      await runStreaming('colab', ['upload', '-s', sessionName, partLocal, partRemote]);
      remoteParts.push(partRemote);
    }
    const assemblePy = [
      'import os',
      `parts = ${JSON.stringify(remoteParts)}`,
      `with open(${JSON.stringify(remotePath)}, 'wb') as out:`,
      '    for p in parts:',
      '        with open(p, "rb") as f: out.write(f.read())',
      '        os.remove(p)',
    ].join('\n');
    await runStreaming('colab', ['exec', '-s', sessionName, '--timeout', '0'], { stdinText: assemblePy });
  } finally {
    rmSync(tmpParts, { recursive: true, force: true });
  }
}

export async function execRemoteScript(sessionName, localScriptPath, remoteScriptPath, argvList) {
  await runStreaming('colab', ['upload', '-s', sessionName, localScriptPath, remoteScriptPath]);
  const sentinel = '__COLAB_REMOTE_OK__';
  const driverPy = [
    'import subprocess, sys',
    `cmd = [sys.executable, "-u", ${[remoteScriptPath, ...argvList].map((a) => JSON.stringify(String(a))).join(', ')}]`,
    'proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)',
    'for line in proc.stdout:',
    '    sys.stdout.write(line)',
    '    sys.stdout.flush()',
    'rc = proc.wait()',
    'if rc != 0:',
    '    raise RuntimeError(f"Remote script exited with code {rc}")',
    `print(${JSON.stringify(sentinel)}, flush=True)`,
  ].join('\n');
  let sawOk = false;
  await new Promise((resolve, reject) => {
    const child = spawn('colab', ['exec', '-s', sessionName, '--timeout', '0'], {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.write(driverPy);
    child.stdin.end();
    child.stdout.on('data', (chunk) => {
      const s = chunk.toString();
      if (s.includes(sentinel)) sawOk = true;
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0 || !sawOk) {
        reject(new Error(`Remote execution failed for ${remoteScriptPath} (exit=${code}, ok=${sawOk})`));
      } else {
        resolve();
      }
    });
  });
}

export function resolveColmapZip(dataInput, tempDir) {
  const abs = path.resolve(REPO_ROOT, dataInput);
  if (!existsSync(abs)) {
    throw new Error(`--data path does not exist: ${abs}`);
  }
  const st = statSync(abs);
  if (st.isFile()) {
    if (!abs.toLowerCase().endsWith('.zip')) {
      throw new Error(`Expected directory or .zip file for --data, got ${abs}`);
    }
    return { zipPath: abs, datasetLabel: path.basename(abs, '.zip') };
  }
  if (!existsSync(path.join(abs, 'images')) || !existsSync(path.join(abs, 'sparse'))) {
    throw new Error(`COLMAP directory ${abs} must contain images/ and sparse/`);
  }
  const zipPath = path.join(tempDir, 'dataset.zip');
  console.log(`[colab-workflow] Compressing local COLMAP dataset ${abs}...`);
  runCmdSync('zip', ['-rq', zipPath, 'images', 'sparse'], abs);
  return { zipPath, datasetLabel: path.basename(abs) };
}

export async function convertPlyToSpz(plyPath, spzPath, keepSh = false) {
  if (!existsSync(RADIX_CORE_PATH)) {
    console.warn(`[colab-workflow] Radix core not found at ${RADIX_CORE_PATH}; skipping .spz export.`);
    return false;
  }
  const { SplatFiles } = await import(RADIX_CORE_PATH);
  const plyBuf = readFileSync(plyPath);
  const bytes = new Uint8Array(plyBuf.buffer, plyBuf.byteOffset, plyBuf.byteLength);
  const { splats, shPalette } = await SplatFiles.decode(bytes, {
    name: path.basename(plyPath),
    sh: keepSh ? 'ext' : false,
  });
  const spzBytes = await SplatFiles.encode(splats, 'spz', {
    sh: keepSh ? 'ext' : false,
    shPalette: keepSh ? shPalette : undefined,
  });
  writeFileSync(spzPath, spzBytes);
  return true;
}

export async function convertSpzToPly(spzPath, plyPath, keepSh = false) {
  if (!existsSync(RADIX_CORE_PATH)) {
    throw new Error(`Radix core required to decode ${spzPath} -> .ply`);
  }
  const { SplatFiles } = await import(RADIX_CORE_PATH);
  const spzBuf = readFileSync(spzPath);
  const bytes = new Uint8Array(spzBuf.buffer, spzBuf.byteOffset, spzBuf.byteLength);
  const { splats, shPalette } = await SplatFiles.decode(bytes, {
    name: path.basename(spzPath),
    sh: keepSh ? 'ext' : false,
  });
  const plyBytes = await SplatFiles.encode(splats, 'ply', {
    sh: keepSh ? 'ext' : false,
    shPalette: keepSh ? shPalette : undefined,
  });
  writeFileSync(plyPath, plyBytes);
}

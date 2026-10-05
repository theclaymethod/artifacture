import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { engineById } from './engines.mjs';
import { nativeTheme, bridgePsychopompThemes } from './themes.mjs';

export const root = path.resolve(import.meta.dirname, '../..');
export const engineHome = path.resolve(process.env.ARTIFACTURE_ENGINE_HOME ?? path.join(os.homedir(), '.cache/artifacture/engines'));
export const hash = value => createHash('sha256').update(value).digest('hex');
export const exists = file => fs.access(file).then(() => true, () => false);

export async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const output = [];
    const child = spawn(command, args, { cwd: options.cwd ?? root, env: { ...process.env, ...options.env }, stdio: ['ignore', options.capture ? 'pipe' : 'inherit', 'inherit'] });
    if (options.capture) child.stdout.on('data', chunk => output.push(chunk));
    child.on('error', error => reject(new Error(`${command}: ${error.message}`)));
    child.on('exit', code => code === 0 ? resolve(Buffer.concat(output).toString()) : reject(new Error(`${path.basename(command)} exited with ${code}.`)));
  });
}

export function paths(id) {
  const engine = engineById(id);
  const directory = path.join(engineHome, `${id}-${engine.version}`);
  const bin = process.platform === 'win32' ? 'Scripts' : 'bin';
  return { directory, receipt: path.join(directory, 'artifacture-runtime.json'), python: path.join(directory, bin, process.platform === 'win32' ? 'python.exe' : 'python'), source: directory, executable: path.join(directory, 'target/release', process.platform === 'win32' ? 'psychopomp.exe' : 'psychopomp') };
}

export function rustEnvironment() {
  const cargo = path.join(engineHome, 'cargo');
  return { RUSTUP_HOME: path.join(engineHome, 'rustup'), CARGO_HOME: cargo, PATH: `${path.join(cargo, 'bin')}${path.delimiter}${process.env.PATH ?? ''}` };
}

export async function setupEngine(id) {
  const engine = engineById(id), runtime = paths(id);
  await fs.mkdir(engineHome, { recursive: true });
  await run('ffmpeg', ['-version'], { capture: true });
  await run('ffprobe', ['-version'], { capture: true });
  let receipt;
  if (id === 'manim') {
    // Native prerequisites stay explicit; never invoke sudo or change a shell profile.
    await run('pkg-config', ['--exists', 'cairo', 'pangocairo']);
    if (!await exists(runtime.python)) await run('uv', ['venv', '--python', engine.python, runtime.directory]);
    const lock = path.join(import.meta.dirname, 'manim.lock');
    await run('uv', ['pip', 'sync', '--python', runtime.python, '--require-hashes', lock]);
    const version = (await run(runtime.python, ['-c', 'import manim; print(manim.__version__)'], { capture: true })).trim();
    if (version !== engine.version) throw new Error('Installed Manim does not match its pin.');
    receipt = { engine: id, version, python: (await run(runtime.python, ['--version'], { capture: true })).trim(), dependenciesSha256: hash(await fs.readFile(lock)) };
  } else {
    if (process.platform === 'win32') throw new Error('Psychopomp setup currently supports macOS and Linux. Windows setup is not implemented.');
    if (!await exists(path.join(runtime.source, 'Cargo.lock'))) {
      await fs.mkdir(runtime.source, { recursive: true });
      const archive = path.join(engineHome, `psychopomp-${engine.version}.tar.gz`);
      const response = await fetch(`https://codeload.github.com/kitlangton/psychopomp/tar.gz/${engine.version}`);
      if (!response.ok) throw new Error(`Psychopomp download failed: ${response.status}.`);
      await fs.writeFile(archive, Buffer.from(await response.arrayBuffer()));
      await run('tar', ['-xzf', archive, '--strip-components=1', '-C', runtime.source]);
    }
    const env = rustEnvironment(), rustup = path.join(env.CARGO_HOME, 'bin', process.platform === 'win32' ? 'rustup.exe' : 'rustup');
    if (!await exists(rustup)) {
      const response = await fetch('https://sh.rustup.rs');
      if (!response.ok) throw new Error(`Rust installer download failed: ${response.status}.`);
      const installer = path.join(engineHome, 'rustup-init.sh');
      await fs.writeFile(installer, await response.text());
      await run('sh', [installer, '-y', '--no-modify-path', '--profile', 'minimal', '--default-toolchain', engine.rust], { env });
    } else await run(rustup, ['toolchain', 'install', engine.rust, '--profile', 'minimal'], { env });
    const themes = await Promise.all(engine.themes.map(name => nativeTheme(root, name)));
    const themeBridgeSha256 = await bridgePsychopompThemes(runtime.source, themes);
    await run('cargo', [`+${engine.rust}`, 'build', '--locked', '--release', '-p', 'psychopomp-render'], { cwd: runtime.source, env });
    receipt = { engine: id, version: engine.version, rust: engine.rust, cargoLockSha256: hash(await fs.readFile(path.join(runtime.source, 'Cargo.lock'))), themeBridgeSha256, tokensSha256: themes[0].tokensSha256, adapter: 'Artifacture paint-only themes v1' };
  }
  await fs.writeFile(runtime.receipt, JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}

export async function readyEngine(id) {
  const runtime = paths(id), engine = engineById(id);
  const receipt = JSON.parse(await fs.readFile(runtime.receipt, 'utf8').catch(error => {
    if (error.code === 'ENOENT') throw new Error(`Run artifacture engine setup ${id} first. See docs/native-engines.md for native prerequisites.`);
    throw error;
  }));
  if (receipt.engine !== id || receipt.version !== engine.version || !await exists(id === 'manim' ? runtime.python : runtime.executable)) throw new Error(`Native runtime is incomplete. Run artifacture engine setup ${id}.`);
  if (id === 'manim' && receipt.dependenciesSha256 !== hash(await fs.readFile(path.join(import.meta.dirname, 'manim.lock')))) throw new Error('Manim dependency lock changed. Run artifacture engine setup manim.');
  if (id === 'psychopomp') {
    const theme = await nativeTheme(root, 'hairline');
    if (receipt.tokensSha256 !== theme.tokensSha256 || receipt.themeBridgeSha256 !== hash(await fs.readFile(path.join(runtime.source, 'crates/psychopomp-render/src/render/theme.rs')))) throw new Error('Psychopomp theme bridge changed. Run artifacture engine setup psychopomp.');
  }
  return { ...runtime, receipt };
}

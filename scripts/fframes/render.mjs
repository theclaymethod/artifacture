import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { hash, exists, run, rustEnvironment, engineHome } from '../video-engines/runtime.mjs';

export async function renderNativeProject(project) {
  const files = ['Cargo.toml', 'Cargo.lock', 'src/main.rs'];
  const contents = await Promise.all(files.map(file => fs.readFile(path.join(project, file))));
  const key = hash(Buffer.concat(contents)), cache = path.join(engineHome, 'fframes', key);
  const executable = path.join(cache, 'renderer');
  const cached = await exists(executable), buildStarted = performance.now();
  if (!cached) {
    await fs.mkdir(path.join(cache, 'src'), { recursive: true });
    for (let i = 0; i < files.length; i++) await fs.writeFile(path.join(cache, files[i]), contents[i]);
    const managed = rustEnvironment();
    const useManaged = await exists(path.join(managed.CARGO_HOME, 'bin/cargo')) && await exists(path.join(managed.RUSTUP_HOME, `toolchains/1.99.0-${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-apple-darwin`));
    const target = path.join(engineHome, 'fframes/target');
    await run('cargo', [...(useManaged ? ['+1.99.0'] : []), 'build', '--release', '--locked', '--manifest-path', path.join(cache, 'Cargo.toml'), '--target-dir', target], { env: useManaged ? managed : {}, capture: true });
    const staged = `${executable}.${process.pid}.tmp`;
    await fs.copyFile(path.join(target, 'release/artifacture-fframes'), staged);
    await fs.chmod(staged, 0o755);
    await fs.rename(staged, executable);
  }
  const buildSeconds = (performance.now() - buildStarted) / 1000;
  const common = ['--frames', path.join(project, 'frames.json'), '--fonts', path.join(project, 'media')];
  const options = { cwd: project, capture: true };
  const inspectPath = path.join(project, 'inspect.json');
  try {
    const { stdout } = await promisify(execFile)(executable, [...common, 'inspect', '--all-frames', '--fail-on', 'warning', '--json'], { cwd: project, maxBuffer: 16 * 1024 * 1024 });
    await fs.writeFile(inspectPath, stdout);
  } catch (error) {
    if (error.stdout) await fs.writeFile(inspectPath, error.stdout);
    throw new Error(`Native inspection failed. See ${inspectPath}: ${error.stderr || error.message}`);
  }
  await run(executable, [...common, 'strip', '-n', '12', '--json'], options);
  const started = performance.now();
  const render = JSON.parse(await run(executable, [...common, 'render', '-o', path.join(project, 'out.mp4'), '--json'], options));
  const receipt = { cacheKey: key, cached, buildSeconds, renderWallSeconds: (performance.now() - started) / 1000, render };
  await fs.writeFile(path.join(project, 'render.json'), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}

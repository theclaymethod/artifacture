#!/usr/bin/env node
import { readFile, mkdir, mkdtemp, rename, rm, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const root = path.resolve(import.meta.dirname, '..');
const sources = JSON.parse(await readFile(path.join(root, 'tools/visual-sources.json'), 'utf8'));
const [name = 'list', ...args] = process.argv.slice(2);

async function git(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; let errors = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { errors += chunk; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(output.trim()) : reject(new Error(`git failed: ${errors.trim()}`)));
  });
}

async function main() {
  if (name === 'list') {
    if (args.some(argument => argument !== '--json')) throw new Error('Usage: artifacture source list [--json]');
    console.log(args.includes('--json') ? JSON.stringify(sources, null, 2) : Object.entries(sources).map(([key, source]) => `${key}: ${source.bundledPath ? 'bundled original source' : source.nativePackage ? 'installed native package' : 'pinned external reference'}${source.license ? ` (${source.license})` : ''}`).join('\n'));
    return;
  }
  if (args.length || !Object.hasOwn(sources, name)) throw new Error('Usage: artifacture source <name>. List names with artifacture source list.');
  const source = sources[name];
  if (source.license) console.error(`${name}: ${source.license}. Preserve the original notice and obey its use/redistribution terms.`);
  if (source.bundledPath) {
    const directory = path.join(root, source.bundledPath);
    await access(directory);
    console.log(directory);
    return;
  }
  if (source.nativePackage) {
    const manifest = import.meta.resolve(`${source.nativePackage}/package.json`);
    const { fileURLToPath } = await import('node:url');
    console.log(path.dirname(fileURLToPath(manifest)));
    return;
  }
  if (!source.repository || !/^[a-f0-9]{40}$/.test(source.revision ?? '')) {
    console.log(source.url ?? source.repository);
    return;
  }
  // External originals are cached separately, never relicensed or copied into a consumer's MIT module tree.
  const base = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'artifacture', 'sources');
  const directory = path.join(base, `${name}-${source.revision}`);
  if (await access(directory).then(() => true, () => false)) {
    if (await git(['rev-parse', 'HEAD'], directory) !== source.revision) throw new Error(`Cached ${name} revision changed. Use a fresh source cache.`);
    console.log(directory);
    return;
  }
  await mkdir(base, { recursive: true });
  const staging = await mkdtemp(path.join(base, `${name}-install-`));
  try {
    await git(['clone', '--no-checkout', '--filter=blob:none', '--depth', '1', source.repository, staging], root);
    await git(['fetch', '--depth', '1', 'origin', source.revision], staging);
    await git(['checkout', '--detach', source.revision], staging);
    await rename(staging, directory);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  console.log(directory);
}
main().catch(error => { console.error(`artifacture source: ${error.message}`); process.exitCode = 1; });

#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { archify } = JSON.parse(await readFile(path.join(root, 'tools/visual-sources.json'), 'utf8'));
const cache = path.join(root, 'node_modules/.cache/artifacture/archify');
const checkout = path.join(cache, archify.revision);
const runtime = path.join(checkout, 'archify');
const cli = path.join(runtime, 'bin/archify.mjs');
const [command, ...args] = process.argv.slice(2);

async function run(executable, argv, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, argv, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function applyTheme() {
  const target = path.join(runtime, 'assets/template.html');
  const css = await readFile(path.join(root, 'tools/archify-theme.css'), 'utf8');
  const original = (await readFile(target, 'utf8'))
    .replace(/\n\/\* artifacture-theme:start \*\/[\s\S]*?\/\* artifacture-theme:end \*\/\n/g, '')
    .replace('family=JetBrains+Mono', 'family=Inter:wght@400;500;600;700&family=JetBrains+Mono')
    .replace(/(?:family=Inter:wght@400;500;600;700&){2,}/g, 'family=Inter:wght@400;500;600;700&');
  if (!original.includes('</style>')) throw new Error('Archify template has no style boundary.');
  const themed = original.replace('</style>', () => `\n/* artifacture-theme:start */\n${css}/* artifacture-theme:end */\n</style>`);
  await writeFile(target, themed);
}

async function setup() {
  if (await exists(cli)) {
    await applyTheme();
    console.log(`Archify ${archify.version} is ready at ${runtime}`);
    return;
  }
  await mkdir(cache, { recursive: true });
  const candidate = await mkdtemp(path.join(cache, '.install-'));
  try {
    for (const argv of [
      ['init', '--quiet', candidate],
      ['-C', candidate, 'remote', 'add', 'origin', archify.repository],
      ['-C', candidate, 'fetch', '--quiet', '--depth=1', 'origin', archify.revision],
      ['-C', candidate, 'checkout', '--quiet', '--detach', 'FETCH_HEAD'],
    ]) {
      if (await run('git', argv) !== 0) throw new Error('Could not install the pinned Archify revision.');
    }
    const release = JSON.parse(await readFile(path.join(candidate, 'archify/package.json'), 'utf8'));
    if (release.version !== archify.version) throw new Error('Archify version does not match the integration manifest.');
    await access(path.join(candidate, 'archify/bin/archify.mjs'));
    try { await rename(candidate, checkout); }
    catch (error) {
      // Another setup may have completed while this checkout was downloading.
      if (!await exists(cli)) throw error;
    }
    await applyTheme();
    console.log(`Installed Archify ${archify.version} at ${runtime}`);
  } finally {
    await rm(candidate, { recursive: true, force: true });
  }
}

try {
  if (!command || command === '--help' || command === 'help') {
    console.log(`Artifacture's pinned Archify integration\n\n  npm run ve:archify -- setup\n  npm run ve:archify -- path\n  npm run ve:archify -- guide "API request with cache fallback" --json\n  npm run ve:archify -- validate architecture source.json --json\n  npm run ve:archify -- deliver architecture source.json output.html --json\n\nOther commands and arguments pass through to Archify.\nValidation, rendering and delivery use showcase quality unless explicitly set.\nSetup requires Git and network access; rendering uses the installed runtime.`);
  } else if (command === 'setup') {
    if (args.length) throw new Error('setup takes no arguments.');
    await setup();
  } else {
    if (!await exists(cli)) throw new Error('Archify is not installed. Run npm run ve:archify -- setup.');
    if (command === 'path') {
      if (args.length) throw new Error('path takes no arguments.');
      console.log(runtime);
    } else {
      const qualityCommands = ['render', 'validate', 'deliver', 'preview', 'compare'];
      const forwarded = [command, ...args];
      if (qualityCommands.includes(command) && !args.some((arg) => arg === '--quality' || arg.startsWith('--quality='))) {
        forwarded.push('--quality', 'showcase');
      }
      process.exitCode = await run(process.execPath, [cli, ...forwarded]);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}

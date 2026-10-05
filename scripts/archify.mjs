#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { archify } = JSON.parse(await readFile(path.join(root, 'tools/visual-sources.json'), 'utf8'));
const cache = path.join(root, 'node_modules/.cache/artifacture/archify');
const checkout = path.join(cache, archify.revision);
const runtime = path.join(checkout, 'archify');
const cli = path.join(runtime, 'bin/archify.mjs');
const [command, ...args] = process.argv.slice(2);
const execute = promisify(execFile);

function replaceOnce(source, fragment, replacement) {
  if (source.split(fragment).length !== 2) throw new Error('Pinned Archify template does not match the Hairline adapter.');
  return source.replace(fragment, replacement);
}

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
  // Start from the pinned source every time, including ordinary renders. Cache
  // edits and prior adapter output cannot accumulate or bypass these guards.
  const { stdout } = await execute('git', ['-C', checkout, 'show', `${archify.revision}:archify/assets/template.html`], { maxBuffer: 2 * 1024 * 1024 });
  let template = replaceOnce(stdout,
    "var PRESETS = ['classic', 'signal-flow', 'blueprint', 'editorial'];",
    "var PRESETS = ['classic', 'signal-flow'];");
  template = replaceOnce(template,
    `var LABELS = {
        classic: viewerText('viewer.preset.classic.short'),
        'signal-flow': viewerText('viewer.preset.flow.short'),
        blueprint: viewerText('viewer.preset.blueprint'),
        editorial: viewerText('viewer.preset.editorial')
      };`,
    `var LABELS = {
        classic: 'Hairline',
        'signal-flow': viewerText('viewer.preset.flow.short')
      };`);
  template = replaceOnce(template, '{{i18n:viewer.preset.classic}}', 'Hairline');
  template = replaceOnce(template, '{{i18n:viewer.preset.classic.hint}}', 'Fine gray strokes on white');
  for (const preset of ['blueprint', 'editorial']) {
    const option = new RegExp(`        <button class="preset-option" data-preset-value="${preset}"[\\s\\S]*?</button>\\n`, 'g');
    if ([...template.matchAll(option)].length !== 1) throw new Error(`Pinned Archify template has no unique ${preset} option.`);
    template = template.replace(option, '');
  }
  template = replaceOnce(template,
    '        <div class="preset-menu-heading" role="presentation"><span>{{i18n:viewer.preset.identity}}</span><span>{{i18n:viewer.preset.cycles}}</span></div>\n', '');
  template = replaceOnce(template,
    "theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';",
    "theme = document.documentElement.getAttribute('data-preset') === 'classic' ? 'light' : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');");
  template = replaceOnce(template,
    "return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';",
    "return html.getAttribute('data-preset') === 'classic' ? 'light' : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');");
  template = replaceOnce(template,
    "if (urlOverride() || saved === 'light' || saved === 'dark') return;",
    "if (html.getAttribute('data-preset') === 'classic' || urlOverride() || saved === 'light' || saved === 'dark') return;");
  template = template.replaceAll('family=JetBrains+Mono', 'family=Inter:wght@400;500;600;700&family=JetBrains+Mono');
  template = replaceOnce(template, '</style>', `\n/* artifacture-theme:start */\n${css}/* artifacture-theme:end */\n</style>`);
  if (await readFile(target, 'utf8') !== template) {
    const candidateDirectory = await mkdtemp(path.join(path.dirname(target), '.artifacture-theme-'));
    try {
      const candidate = path.join(candidateDirectory, 'template.html');
      await writeFile(candidate, template);
      await rename(candidate, target);
    } finally {
      await rm(candidateDirectory, { recursive: true, force: true });
    }
  }
}

async function rejectRetiredSources() {
  const inputPaths = command === 'compare' ? args.slice(1, 3) : args.slice(1, 2);
  for (const input of inputPaths) {
    let source;
    // Leave malformed input and path diagnostics to the upstream CLI.
    try { source = JSON.parse(await readFile(input, 'utf8')); } catch { continue; }
    if (['blueprint', 'editorial'].includes(source?.meta?.visual_preset)) {
      throw new Error(`Archify preset "${source.meta.visual_preset}" is retired. Set meta.visual_preset to "classic" for Hairline or "signal-flow".`);
    }
  }
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
      if (qualityCommands.includes(command)) {
        await rejectRetiredSources();
        await applyTheme();
      }
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

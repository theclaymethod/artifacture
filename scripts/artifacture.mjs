#!/usr/bin/env node
import { access, lstat, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { planWorkspace, applyPlan, packageRoot } from './components/copier.mjs';

const help = `Usage:
  artifacture init <directory>
  artifacture add <block...> [--cwd <project>]
  artifacture list [--query <text>] [--json]
  artifacture export <source.mdx|source.tsx> --out <output.html>
  artifacture video <source.tsx> --out <output.html> [--audio <recording> --audio-start <seconds>]
  artifacture fframes <source.tsx> --out <new-project-directory> [--fps <integer>] [--render]
  artifacture engine list [--json]
  artifacture engine setup <manim|psychopomp>
  artifacture engine scaffold <engine> <directory> [--theme <preset>]
  artifacture engine render <job.json> --out <directory>
  artifacture verify <artifact.html> [--json <report.json>]

init and add install required npm packages and import styles automatically.
Use --dry-run to preview or --no-install to manage packages yourself.
Use --entry <file> when your app has a custom entry point.
Copied components remain editable; changed files are never overwritten.
`;

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Command failed (${code}): ${path.basename(command)} ${args.join(' ')}`)));
  });
}

function npm(args, cwd) {
  return process.env.npm_execpath
    ? run(process.execPath, [process.env.npm_execpath, ...args], cwd)
    : run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, cwd);
}

async function regularFile(root, relative) {
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(root + path.sep)) throw new Error(`App entry must be inside the project: ${relative}`);
  let current = root;
  for (const segment of path.relative(root, absolute).split(path.sep)) {
    current = path.join(current, segment);
    const stat = await lstat(current).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!stat) return null;
    if (stat.isSymbolicLink()) throw new Error(`Symlink paths are not supported: ${current}`);
  }
  const stat = await lstat(absolute);
  return stat.isFile() ? absolute : null;
}

async function planStyles(plan, requestedEntry) {
  if (!plan.stylesheets.length) return null;
  const candidates = requestedEntry ? [requestedEntry] : ['src/main.tsx', 'src/main.jsx', 'src/index.tsx', 'src/index.jsx', 'src/app/layout.tsx', 'app/layout.tsx'];
  for (const candidate of candidates) {
    const relative = path.relative(plan.root, path.resolve(plan.root, candidate)).split(path.sep).join('/');
    const planned = plan.entries.find(entry => entry.relative === relative);
    const file = planned?.destination ?? await regularFile(plan.root, relative);
    if (!file) continue;
    const original = planned?.content.toString() ?? await readFile(file, 'utf8');
    const imported = new Set([...original.matchAll(/\bimport\s*(?:[^;\n]*?\sfrom\s*)?["']([^"']+)["']/g)].map(match => path.resolve(path.dirname(file), match[1])));
    const missing = plan.stylesheets.filter(stylesheet => !imported.has(path.join(plan.root, stylesheet)));
    const imports = missing.map(stylesheet => {
      let reference = path.relative(path.dirname(file), path.join(plan.root, stylesheet)).split(path.sep).join('/');
      if (!reference.startsWith('.')) reference = './' + reference;
      return `import ${JSON.stringify(reference)};\n`;
    }).join('');
    // Preserve a Next.js client directive before adding side-effect imports.
    const directive = original.match(/^(?:\s*["']use client["'];?\s*)/);
    const content = directive ? directive[0] + imports + original.slice(directive[0].length) : imports + original;
    return missing.length ? { file, original, content } : null;
  }
  throw new Error('Cannot find the app entry. Retry with --entry <file>, for example --entry src/main.tsx. No files were written.');
}

async function installPackages(plan) {
  if (plan.command === 'init') {
    const ready = await access(path.join(plan.root, 'node_modules/.bin/vite')).then(() => true, () => false);
    if (!ready) await npm(['install', '--no-audit', '--no-fund'], plan.root);
    return;
  }
  let installed = false;
  for (const kind of ['dependency', 'devDependency']) {
    const missing = plan.requirements.filter(requirement => requirement.kind === kind && !requirement.declared);
    if (!missing.length) continue;
    await npm(['install', ...(kind === 'devDependency' ? ['--save-dev'] : []), '--no-audit', '--no-fund', ...missing.map(requirement => `${requirement.name}@${requirement.tested}`)], plan.root);
    installed = true;
  }
  if (!installed && plan.requirements.length) {
    const present = await Promise.all(plan.requirements.map(requirement => access(path.join(plan.root, 'node_modules', requirement.name, 'package.json')).then(() => true, () => false)));
    if (present.some(value => !value)) await npm(['install', '--no-audit', '--no-fund'], plan.root);
  }
}

async function copy(command, args) {
  const blocks = [];
  let directory;
  let entry;
  let dryRun = false;
  let install = true;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--dry-run') dryRun = true;
    else if (argument === '--no-install') install = false;
    else if (argument === '--cwd' || argument === '--entry') {
      const value = args[++index];
      if (!value || value.startsWith('-')) throw new Error(`${argument} requires a path.`);
      if (argument === '--cwd') directory = value;
      else entry = value;
    } else if (argument.startsWith('-')) throw new Error(`Unknown option: ${argument}`);
    else blocks.push(argument);
  }
  if (command === 'init') {
    if (blocks.length !== 1 || directory) throw new Error('Usage: artifacture init <directory>');
    directory = blocks[0];
  } else if (!blocks.length) throw new Error('Usage: artifacture add <block...> [--cwd <project>]');
  const plan = await planWorkspace({ command, directory: directory ?? process.cwd(), blocks });
  const styles = await planStyles(plan, entry);
  const creates = plan.entries.filter(item => item.action === 'create');
  if (dryRun) {
    console.log(`Dry run: ${plan.root}\n${creates.length} files to create.`);
    for (const item of creates) console.log(`  ${item.relative}`);
    if (styles) console.log(`  Import styles in ${path.relative(plan.root, styles.file)}`);
    if (install) console.log('Ensure required npm packages are installed.');
    return;
  }
  await applyPlan(plan);
  if (styles) {
    if (await readFile(styles.file, 'utf8') !== styles.original) throw new Error('App entry changed during copying. Retry to add styles without losing your edits.');
    await writeFile(styles.file, styles.content);
  }
  if (install) await installPackages(plan);
  console.log(`Ready: ${plan.root}\n${creates.length} files created.`);
  if (command === 'init') console.log(`\nNext: cd ${path.relative(process.cwd(), plan.root) || '.'} && npm run dev`);
  else console.log(`Import components from ./${plan.sourceDirectory}/ using the named exports shown by artifacture list.`);
}

async function ensureBrowser() {
  const { chromium } = await import('playwright-core');
  if (await access(chromium.executablePath()).then(() => true, () => false)) return;
  console.error('Installing Chromium for Artifacture verification…');
  const cli = path.join(path.dirname(fileURLToPath(import.meta.resolve('playwright-core/package.json'))), 'cli.js');
  await run(process.execPath, [cli, 'install', 'chromium'], packageRoot);
}

const runtimeCommands = {
  export: 'scripts/ve-mdx/export.mjs',
  'export-static': 'scripts/ve-mdx/export-static.mjs',
  video: 'scripts/ve-mdx/graphic-video.mjs',
  fframes: 'scripts/ve-mdx/fframes-video.mjs',
  chart: 'scripts/lieflat-chart.mjs',
  archify: 'scripts/archify.mjs',
  verify: 'plugins/visual-explainer/scripts/verify/ve-verify.mjs',
  finalize: 'plugins/visual-explainer/scripts/verify/ve-finalize.mjs',
  pdf: 'plugins/visual-explainer/scripts/export-slides-pdf.mjs',
};

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('Artifacture requires Node.js 22.12 or newer.');
  const [command = 'help', ...args] = process.argv.slice(2);
  if (['help', '--help', '-h'].includes(command) || args.includes('--help') || args.includes('-h')) console.log(help);
  else if (command === 'path') console.log(packageRoot);
  else if (command === 'list') await import(pathToFileURL(path.join(packageRoot, 'scripts/components.mjs')).href);
  else if (command === 'engine') await run(process.execPath, [path.join(packageRoot, 'scripts/video-engines.mjs'), ...args], process.cwd());
  else if (command === 'init' || command === 'add') await copy(command, args);
  else if (Object.hasOwn(runtimeCommands, command)) {
    if (command === 'archify') {
      await run(process.execPath, [path.join(packageRoot, runtimeCommands[command]), ...args], process.cwd());
      return;
    }
    if (!args.length || (command !== 'finalize' && args[0].startsWith('-'))) throw new Error(`${command} requires a source or artifact path.`);
    const resolvedArgs = args.map((argument, index) => (index === 0 && command !== 'finalize') || (command === 'pdf' && index === 1) || ['--out', '--audio', '--truth', '--json', '--screens', '--report', '--verdicts', '--output'].includes(args[index - 1]) ? path.resolve(argument) : argument);
    if (command === 'pdf' || (command === 'verify' && !args.includes('--static-only'))) await ensureBrowser();
    await run(process.execPath, [path.join(packageRoot, runtimeCommands[command]), ...resolvedArgs], packageRoot);
  } else throw new Error(`Unknown command: ${command}. Run artifacture help.`);
}

main().catch(error => {
  console.error(`artifacture: ${error.message}`);
  process.exitCode = 1;
});

import { cp, lstat, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templatesRoot = path.join(packageRoot, 'templates');
const json = async file => JSON.parse(await readFile(file, 'utf8'));

export async function catalog() {
  const folders = (await readdir(templatesRoot, { withFileTypes: true })).filter(item => item.isDirectory());
  return Promise.all(folders.map(item => json(path.join(templatesRoot, item.name, 'template.json'))));
}

export async function references() {
  return json(path.join(templatesRoot, 'references.json'));
}

export async function info(id) {
  const template = (await catalog()).find(item => item.id === id);
  const sources = await references();
  if (!template) {
    const reference = sources.find(item => item.id === id);
    if (reference) return { ...reference, type: 'reference' };
    throw new Error(`Unknown template or reference: ${id}. Run artifacture list.`);
  }
  const directory = path.join(templatesRoot, template.id);
  const manifest = template.type === 'project' ? await json(path.join(directory, 'project/package.json')) : null;
  const entry = {
    ...template,
    references: template.references.map(name => sources.find(item => item.id === name)),
    workflow: await readFile(path.join(directory, 'WORKFLOW.md'), 'utf8'),
  };
  if (manifest) Object.assign(entry, { dependencies: manifest.dependencies, devDependencies: manifest.devDependencies, scripts: manifest.scripts });
  return entry;
}

export function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: false });
    child.on('error', error => reject(new Error(`${command}: ${error.message}`)));
    child.on('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} failed (${signal ?? code}). The workspace is retained; fix the native tool error and retry its command.`)));
  });
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

async function requireNewDirectory(directory) {
  const existing = await lstat(directory).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (existing) throw new Error(`Destination already exists: ${directory}. Choose a new directory; existing work is never overwritten.`);
}

export async function init(directory, id, { install = true, skills = true, dryRun = false } = {}) {
  const template = (await catalog()).find(item => item.id === id);
  if (!template) throw new Error(`Unknown template: ${id}. Run artifacture list.`);
  if (template.type === 'recipe') throw new Error(`${id} is a workflow recipe. Run artifacture info ${id} and select its native project starter.`);
  const destination = path.resolve(directory);
  await requireNewDirectory(destination);
  const name = path.basename(destination).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^[^a-z]+/, '') || 'explanation';
  if (dryRun) {
    console.log(JSON.stringify({ template: id, destination, install, skills: install && skills ? template.skills : [], nativeScaffold: template.type === 'fframes' ? ['cargo-fframes', 'new', name, '--dir', destination, '--yes', '--template', 'multi-scene'] : null }, null, 2));
    return;
  }
  await mkdir(path.dirname(destination), { recursive: true });
  if (template.type === 'fframes') {
    // The upstream tool owns Cargo configuration, media and renderer setup.
    await run('cargo-fframes', ['new', name, '--dir', destination, '--yes', '--template', 'multi-scene'], process.cwd());
  } else {
    await cp(path.join(templatesRoot, id, 'project'), destination, { recursive: true, force: false, errorOnExist: true });
    await rename(path.join(destination, 'gitignore'), path.join(destination, '.gitignore'));
    const manifest = await json(path.join(destination, 'package.json'));
    manifest.name = name;
    await writeFile(path.join(destination, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  }
  await cp(path.join(templatesRoot, id, 'WORKFLOW.md'), path.join(destination, 'WORKFLOW.md'), { force: false, errorOnExist: true });
  if (install && template.type === 'project') await run(npm, ['install', '--no-audit', '--no-fund'], destination);
  if (install && skills) {
    for (const source of template.skills ?? []) await run(npx, ['--yes', 'skills', 'add', source, '--yes'], destination);
  }
  console.log(`Created ${destination}\nRead WORKFLOW.md. ${template.type === 'fframes' ? 'Use the generated Cargo project commands. Install cargo-fframes with Cargo if you need this starter on another machine.' : 'Run npm run dev, npm run build, or npm run export in the workspace.'}`);
}

export async function installSkill(directory) {
  const destination = path.resolve(directory);
  await requireNewDirectory(destination);
  await mkdir(path.dirname(destination), { recursive: true });
  await mkdir(destination);
  await mkdir(path.join(destination, 'scripts'));
  await mkdir(path.join(destination, 'references'));
  const source = path.join(packageRoot, 'plugins/visual-explainer');
  await cp(path.join(source, 'SKILL.md'), path.join(destination, 'SKILL.md'), { force: false, errorOnExist: true });
  await cp(path.join(source, 'scripts/artifacture.mjs'), path.join(destination, 'scripts/artifacture.mjs'), { force: false, errorOnExist: true });
  await cp(path.join(source, 'references/animation-skills.md'), path.join(destination, 'references/animation-skills.md'), { force: false, errorOnExist: true });
  await cp(path.join(source, 'references/video-capture-and-edit.md'), path.join(destination, 'references/video-capture-and-edit.md'), { force: false, errorOnExist: true });
  console.log(`Installed the entry skill at ${destination}. Native skills are fetched only for selected templates.`);
}

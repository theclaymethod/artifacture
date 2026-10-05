import { lstat, readFile, readdir, mkdir, open, unlink, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBlocks, validateRelativePath } from './registry.mjs';
import { defaultBlocks, defaultConfig, workspaceDependencies, workspaceDevDependencies, workspaceFiles } from './workspace.mjs';

export const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

// JSON metadata and CLI paths enter from outside this package.
/* oxlint-disable anti-slop/no-runtime-typeof */
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
/* oxlint-enable anti-slop/no-runtime-typeof */

async function statIfPresent(file) {
  try { return await lstat(file); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}

async function inspectPath(file) {
  const absolute = path.resolve(file);
  const { root } = path.parse(absolute);
  const segments = absolute.slice(root.length).split(path.sep).filter(Boolean);
  let current = root;
  let stat = await lstat(root);
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    stat = await statIfPresent(current);
    if (!stat) return undefined;
    if (stat.isSymbolicLink()) throw new Error(`Symlink paths are not supported: ${current}`);
    if (index < segments.length - 1 && !stat.isDirectory()) throw new Error(`An ancestor is not a directory: ${current}`);
  }
  return stat;
}

async function readJson(file, label) {
  const stat = await inspectPath(file);
  if (!stat?.isFile()) throw new Error(`${label} must be a regular file: ${file}`);
  let value;
  try { value = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { throw new Error(`Cannot read ${label}: ${error.message}`); }
  if (!isRecord(value)) throw new Error(`${label} must contain a JSON object.`);
  return value;
}

function dependencyDeclarations(manifest, label) {
  const declarations = {};
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const values = manifest[section];
    if (values === undefined) continue;
    if (!isRecord(values) || Object.values(values).some((value) => value !== String(value) || !value.trim())) throw new Error(`${label} ${section} must contain nonempty dependency strings.`);
    Object.assign(declarations, values);
  }
  return declarations;
}

export async function readTestedVersions(names) {
  const manifest = await readJson(path.join(packageRoot, 'package.json'), 'Artifacture package.json');
  const versions = dependencyDeclarations(manifest, 'Artifacture package.json');
  for (const name of names) if (!versions[name]) throw new Error(`Artifacture package.json does not declare a tested version for ${name}.`);
  return Object.fromEntries(names.map((name) => [name, versions[name]]));
}

function checkedConfig(value) {
  if (value.schemaVersion !== 1 || Object.keys(value).some((key) => !['schemaVersion', 'sourceDirectory'].includes(key))) throw new Error('artifacture.json needs schemaVersion: 1 and sourceDirectory only.');
  validateRelativePath(value.sourceDirectory, 'artifacture.json sourceDirectory');
  return value;
}

function confinedDestination(root, relative) {
  validateRelativePath(relative, 'Destination');
  const destination = path.resolve(root, relative);
  if (!destination.startsWith(root + path.sep)) throw new Error(`Destination escapes the project: ${relative}`);
  return destination;
}

async function unexpectedPaths(root, entries) {
  const expectedFiles = new Set(entries.map((entry) => entry.relative));
  const expectedDirectories = new Set();
  for (const file of expectedFiles) {
    let directory = path.posix.dirname(file);
    while (directory !== '.') { expectedDirectories.add(directory); directory = path.posix.dirname(directory); }
  }
  const unexpected = [];
  const visit = async (directory, prefix = '') => {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix + item.name;
      if (item.isDirectory() && expectedDirectories.has(relative)) await visit(path.join(directory, item.name), relative + '/');
      else if (!item.isFile() || !expectedFiles.has(relative)) unexpected.push(relative);
    }
  };
  await visit(root);
  return unexpected;
}

export async function planWorkspace({ command, directory, blocks }) {
  if (!['init', 'add'].includes(command)) throw new Error(`Unsupported copy operation: ${command}`);
  const root = path.resolve(directory);
  const selection = resolveBlocks(command === 'init' ? defaultBlocks : blocks);
  const rootStat = await inspectPath(root);
  if (rootStat && !rootStat.isDirectory()) throw new Error(`Project path is not a directory: ${root}`);
  if (command === 'add' && !rootStat) throw new Error(`Project directory does not exist: ${root}`);
  const configFile = path.join(root, 'artifacture.json');
  const configStat = await inspectPath(configFile);
  const config = configStat ? checkedConfig(await readJson(configFile, 'artifacture.json')) : defaultConfig;
  if (command === 'init' && config.sourceDirectory !== defaultConfig.sourceDirectory) throw new Error(`init expects sourceDirectory: ${defaultConfig.sourceDirectory}. Use add for a configured project.`);
  const dependencies = [...new Set([...selection.dependencies, ...(command === 'init' ? workspaceDependencies : [])])];
  const devDependencies = [...new Set([...selection.devDependencies, ...(command === 'init' ? workspaceDevDependencies : [])])];
  const versions = await readTestedVersions([...dependencies, ...devDependencies]);
  const template = command === 'init' ? workspaceFiles(path.basename(root), versions) : new Map();
  if (command === 'add' && !configStat) template.set('artifacture.json', JSON.stringify(defaultConfig, null, 2) + '\n');
  const projectManifest = command === 'add' ? await readJson(path.join(root, 'package.json'), 'Project package.json') : JSON.parse(template.get('package.json'));
  const declared = dependencyDeclarations(projectManifest, 'Project package.json');
  const entries = [...template].map(([relative, content]) => ({ relative, content: Buffer.from(content), origin: 'workspace' }));
  for (const file of selection.files) {
    const sourceFile = confinedDestination(path.resolve(packageRoot), file.source);
    const sourceStat = await inspectPath(sourceFile);
    if (!sourceStat?.isFile()) throw new Error(`Missing regular component source: ${file.source}`);
    entries.push({ relative: `${config.sourceDirectory}/${file.destination}`, content: await readFile(sourceFile), origin: file.source });
  }
  const conflicts = [];
  const destinations = new Set();
  for (const entry of entries) {
    entry.destination = confinedDestination(root, entry.relative);
    if (destinations.has(entry.destination)) throw new Error(`Duplicate planned destination: ${entry.relative}`);
    destinations.add(entry.destination);
    try {
      const stat = await inspectPath(entry.destination);
      if (!stat) entry.action = 'create';
      else if (stat.isFile() && (await readFile(entry.destination)).equals(entry.content)) entry.action = 'unchanged';
      else { entry.action = 'conflict'; conflicts.push(`${entry.relative}: existing content differs or is not a regular file`); }
    } catch (error) { entry.action = 'conflict'; conflicts.push(`${entry.relative}: ${error.message}`); }
  }
  if (command === 'init' && rootStat) {
    const templateUnchanged = entries.filter((entry) => entry.origin === 'workspace').every((entry) => entry.action === 'unchanged');
    if (!templateUnchanged) {
      const unexpected = await unexpectedPaths(root, entries);
      if (unexpected.length) conflicts.push(`init refuses an unrelated nonempty directory: ${unexpected.join(', ')}`);
    }
  }
  if (conflicts.length) throw new Error(`No files were written. Resolve these conflicts:\n${conflicts.map((conflict) => `  ${conflict}`).join('\n')}`);
  return {
    command, root, sourceDirectory: config.sourceDirectory, entries,
    blocks: selection.blocks.filter((id) => !id.startsWith('__')),
    requirements: [...dependencies.map((name) => ({ name, kind: 'dependency', tested: versions[name], declared: declared[name] })), ...devDependencies.map((name) => ({ name, kind: 'devDependency', tested: versions[name], declared: declared[name] }))],
    stylesheets: selection.stylesheets.map((name) => `${config.sourceDirectory}/${name}`),
  };
}

async function ensureDirectory(directory, createdDirectories) {
  const stat = await inspectPath(directory);
  if (stat) { if (!stat.isDirectory()) throw new Error(`Not a directory: ${directory}`); return; }
  await ensureDirectory(path.dirname(directory), createdDirectories);
  try {
    await mkdir(directory);
    const created = await inspectPath(directory);
    createdDirectories.push({ path: directory, dev: created.dev, ino: created.ino });
  } catch (error) {
    if (error.code !== 'EEXIST' || !(await inspectPath(directory))?.isDirectory()) throw error;
  }
}

async function rollback(createdFiles, createdDirectories) {
  const remaining = [];
  for (const entry of [...createdFiles].reverse()) {
    try {
      const stat = await inspectPath(entry.destination);
      if (!stat) continue;
      if (!entry.completed) throw new Error('Incomplete write has uncertain bytes.');
      if (stat.dev !== entry.dev || stat.ino !== entry.ino || !stat.isFile() || !(await readFile(entry.destination)).equals(entry.content)) throw new Error('Created file changed during rollback.');
      await unlink(entry.destination);
    } catch { remaining.push(entry.destination); }
  }
  for (const entry of [...createdDirectories].reverse()) {
    try {
      const stat = await inspectPath(entry.path);
      if (stat?.isDirectory() && stat.dev === entry.dev && stat.ino === entry.ino) await rmdir(entry.path);
    } catch { /* Retain directories that are no longer empty or owned by this invocation. */ }
  }
  return remaining;
}

async function revalidateEntries(entries) {
  const changed = [];
  for (const entry of entries) {
    try {
      const stat = await inspectPath(entry.destination);
      if (!stat?.isFile() || !(await readFile(entry.destination)).equals(entry.content)) changed.push(entry.relative);
    } catch (error) { changed.push(`${entry.relative}: ${error.message}`); }
  }
  if (changed.length) throw new Error(`Destinations changed after planning:\n${changed.map((file) => `  ${file}`).join('\n')}`);
}

export async function applyPlan(plan) {
  const createdFiles = [];
  const createdDirectories = [];
  try {
    await revalidateEntries(plan.entries.filter((entry) => entry.action === 'unchanged'));
    for (const entry of plan.entries) {
      if (entry.action === 'unchanged') continue;
      await ensureDirectory(path.dirname(entry.destination), createdDirectories);
      await inspectPath(entry.destination);
      const handle = await open(entry.destination, 'wx');
      const created = { ...entry, completed: false };
      createdFiles.push(created);
      try {
        const stat = await handle.stat();
        created.dev = stat.dev;
        created.ino = stat.ino;
        await handle.writeFile(entry.content);
        created.completed = true;
      } finally { await handle.close(); }
    }
    await revalidateEntries(plan.entries);
  } catch (error) {
    const remaining = await rollback(createdFiles, createdDirectories);
    const recovery = remaining.length ? `Recoverable files remain: ${remaining.join(', ')}` : createdFiles.length ? 'Files created by this invocation were rolled back.' : 'No files were created.';
    throw new Error(`Copy failed: ${error.message}\n${recovery}`);
  }
  return createdFiles.length;
}

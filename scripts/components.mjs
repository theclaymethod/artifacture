#!/usr/bin/env node
import path from 'node:path';
import { componentRegistry, publicBlockIds, resolveBlocks } from './components/registry.mjs';
import { planWorkspace, applyPlan, readTestedVersions } from './components/copier.mjs';
import { defaultConfig } from './components/workspace.mjs';

const help = `Artifacture copies editable components and creates React workspaces.

Usage:
  artifacture list [--query <text>] [--json]
  artifacture init <directory> [--dry-run]
  artifacture add <block...> --cwd <project> [--dry-run]
  artifacture help

Files are created only. Identical copies are left untouched; conflicts stop
the whole plan. No packages are installed and no network requests are made.
`;

function parseArguments(argv) {
  const [command, ...args] = argv;
  if (!command || ['help', '--help', '-h'].includes(command)) return { command: 'help' };
  if (!['list', 'init', 'add'].includes(command)) throw new Error(`Unknown command: ${command}. Run artifacture help.`);
  const positionals = [];
  let dryRun = false;
  let json = false;
  let query;
  let cwd;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') return { command: 'help' };
    if (argument === '--dry-run' && command !== 'list' && !dryRun) dryRun = true;
    else if (argument === '--json' && command === 'list' && !json) json = true;
    else if (argument === '--query' && command === 'list' && query === undefined) {
      query = args[++index];
      if (!query?.trim() || query.startsWith('--')) throw new Error('--query requires capability, primitive, variant, or API text.');
    }
    else if (argument === '--cwd' && command === 'add' && cwd === undefined) {
      cwd = args[++index];
      if (!cwd || cwd.startsWith('--')) throw new Error('--cwd requires a project directory.');
    } else if (argument.startsWith('-')) throw new Error(`Unsupported or repeated option: ${argument}`);
    else positionals.push(argument);
  }
  if (command === 'list' && positionals.length) throw new Error('list does not accept positional arguments.');
  if (command === 'init' && positionals.length !== 1) throw new Error('init requires one directory.');
  if (command === 'add' && (!positionals.length || !cwd)) throw new Error('add requires component blocks and --cwd <project>.');
  return { command, dryRun, json, query, directory: command === 'init' ? positionals[0] : cwd, blocks: positionals };
}

async function listBlocks(json, query) {
  const catalog = [];
  const defaultImportBase = `./${path.posix.relative('src', defaultConfig.sourceDirectory)}`;
  for (const id of publicBlockIds) {
    const block = componentRegistry[id];
    const searchable = [id, block.description, ...block.capabilities, ...block.primitives, ...block.variants.flatMap(variant => [variant.name, variant.api, variant.parameter]), ...block.reuseLevels, ...block.delivery, ...block.entryPoints.flatMap((entry) => [entry.module, ...entry.exports, ...(entry.types ?? [])])].join(' ').toLowerCase();
    if (query && !query.toLowerCase().trim().split(/\s+/).every((term) => searchable.includes(term))) continue;
    const selection = resolveBlocks([id]);
    const versions = await readTestedVersions([...selection.dependencies, ...selection.devDependencies]);
    catalog.push({
      id, description: block.description,
      capabilities: block.capabilities, primitives: block.primitives, variants: block.variants, reuseLevels: block.reuseLevels, delivery: block.delivery,
      entryPoints: block.entryPoints.map((entry) => ({ ...entry, defaultImport: `${defaultImportBase}/${entry.module}` })),
      constraints: block.constraints, examples: block.examples,
      sourceDirectory: { default: defaultConfig.sourceDirectory, configuredBy: 'artifacture.json sourceDirectory', defaultImportsRelativeTo: 'src' },
      files: selection.files,
      dependencies: Object.fromEntries(selection.dependencies.map((name) => [name, versions[name]])),
      devDependencies: Object.fromEntries(selection.devDependencies.map((name) => [name, versions[name]])),
      installCommands: [
        ...(selection.dependencies.length ? [`npm install ${selection.dependencies.map((name) => `${name}@${versions[name]}`).join(' ')}`] : []),
        ...(selection.devDependencies.length ? [`npm install -D ${selection.devDependencies.map((name) => `${name}@${versions[name]}`).join(' ')}`] : []),
      ],
      stylesheets: selection.stylesheets,
      addCommand: `artifacture add ${id} --cwd .`,
    });
  }
  if (json) console.log(JSON.stringify(catalog, null, 2));
  else for (const block of catalog) {
    console.log(`${block.id.padEnd(21)} ${block.description}`);
    console.log(`  ${block.entryPoints.filter(entry => entry.exports.length).map(entry => `${entry.module}: ${entry.exports.join(', ')}`).join('; ')}`);
    if (block.variants.length) console.log(`  Variants: ${block.variants.map(variant => `${variant.name} (${variant.api}.${variant.parameter})`).join(', ')}`);
  }
}

function printRequirements(plan) {
  console.log('\nPackage requirements (tested declarations; caller ranges are not semver-checked):');
  for (const requirement of plan.requirements) console.log(`  ${requirement.name}: tested ${requirement.tested}; ${requirement.declared ? `declared ${requirement.declared}` : 'missing'}`);
  for (const kind of ['dependency', 'devDependency']) {
    const missing = plan.requirements.filter((requirement) => requirement.kind === kind && !requirement.declared);
    if (missing.length) console.log(`  npm install${kind === 'devDependency' ? ' -D' : ''} ${missing.map((requirement) => `${requirement.name}@${requirement.tested}`).join(' ')}`);
  }
  console.log('\nImport these stylesheets from your app entry using the appropriate relative paths:');
  for (const stylesheet of plan.stylesheets) console.log(`  ${stylesheet}`);
  if (plan.command === 'init') console.log('\nNext: run npm install, then npm run dev in the project directory.');
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.command === 'help') console.log(help);
  else if (options.command === 'list') await listBlocks(options.json, options.query);
  else {
    const plan = await planWorkspace(options);
    const creates = plan.entries.filter((entry) => entry.action === 'create').length;
    const unchanged = plan.entries.length - creates;
    if (!options.dryRun) await applyPlan(plan);
    console.log(`${options.dryRun ? 'Dry run' : 'Complete'}: ${plan.root}\n${creates} file${creates === 1 ? '' : 's'} ${options.dryRun ? 'to create' : 'created'}; ${unchanged} unchanged.`);
    for (const entry of plan.entries) console.log(`  ${entry.action.padEnd(9)} ${entry.relative}`);
    printRequirements(plan);
  }
} catch (error) {
  console.error(`artifacture: ${error.message}`);
  process.exitCode = 1;
}

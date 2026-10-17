#!/usr/bin/env node
import { catalog, info, init, installSkill, references } from './templates.mjs';

const help = `Artifacture: editable templates and native rendering workflows.

  artifacture list [--kind diagram|slides|video|reference] [--query text] [--json]
  artifacture info <template-or-reference> [--json]
  artifacture init <new-directory> --template <id> [--no-install] [--no-skills] [--dry-run]
  artifacture skills install [new-skill-directory]

Workspaces own their package manifests, lockfiles, source and renderer commands.
FFrames is preferred for native video. Use HyperFrames for browser compositions.
Native video scaffolding requires cargo-fframes on PATH (cargo install cargo-fframes --locked).
--no-install copies source without installing packages or skills.
`;

function parse(args, valued, switches) {
  const options = {};
  const positionals = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (valued.includes(arg)) {
      if (options[arg] !== undefined) throw new Error(`Repeated option: ${arg}`);
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value.`);
      options[arg] = value;
    } else if (switches.includes(arg)) options[arg] = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else positionals.push(arg);
  }
  return { options, positionals };
}

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('Artifacture requires Node 22.12 or newer.');
  const [command = 'help', ...args] = process.argv.slice(2);
  if (['help', '-h', '--help'].includes(command) || args.includes('--help')) return console.log(help);
  if (command === 'list') {
    const { options, positionals } = parse(args, ['--kind', '--query'], ['--json']);
    if (positionals.length) throw new Error('list does not accept positional arguments.');
    const kind = options['--kind'];
    if (kind && !['diagram', 'slides', 'video', 'reference'].includes(kind)) throw new Error(`Unknown kind: ${kind}`);
    const entries = kind === 'reference' ? await references() : await catalog();
    const matches = entries.filter(item => (!kind || kind === 'reference' || item.kind === kind) && (!options['--query'] || `${item.id} ${item.purpose}`.toLowerCase().includes(options['--query'].toLowerCase())));
    const compact = matches.map(({ id, purpose, kind, type, output, preview, url }) => ({ id, purpose, ...(kind ? { kind, type, output, preview } : { url }) }));
    return console.log(options['--json'] ? JSON.stringify(compact, null, 2) : compact.map(item => `${item.id}: ${item.purpose}${item.type === 'recipe' ? ' (recipe)' : ''}`).join('\n'));
  }
  if (command === 'info') {
    const { options, positionals } = parse(args, [], ['--json']);
    if (positionals.length !== 1) throw new Error('info requires one template or reference ID.');
    const entry = await info(positionals[0]);
    return console.log(options['--json'] ? JSON.stringify(entry, null, 2) : `${entry.purpose}\n\n${entry.workflow ?? `${entry.url}\n${entry.install}\n${entry.limitations ?? ''}`}\n${entry.references ? entry.references.map(ref => `${ref.id}: ${ref.url}\n${ref.install}`).join('\n\n') : ''}`);
  }
  if (command === 'init') {
    const { options, positionals } = parse(args, ['--template'], ['--no-install', '--no-skills', '--dry-run']);
    if (positionals.length !== 1 || !options['--template']) throw new Error('Usage: artifacture init <new-directory> --template <id>');
    return init(positionals[0], options['--template'], { install: !options['--no-install'], skills: !options['--no-skills'], dryRun: !!options['--dry-run'] });
  }
  if (command === 'skills' && args[0] === 'install') {
    const { positionals } = parse(args.slice(1), [], []);
    if (positionals.length > 1) throw new Error('skills install accepts at most one new directory.');
    return installSkill(positionals[0] ?? '.agents/skills/visual-explainer');
  }
  throw new Error(`Unknown command: ${command}. Run artifacture help. Legacy source scripts remain available in a contributor checkout; see docs/workspaces.md for migration.`);
}

main().catch(error => { console.error(`artifacture: ${error.message}`); process.exitCode = 1; });

#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { engines, engineById } from './video-engines/engines.mjs';
import { setupEngine, paths, exists, readyEngine } from './video-engines/runtime.mjs';
import { renderNativeJob } from './video-engines/render.mjs';

const help = `Usage:
  artifacture engine list [--json]
  artifacture engine setup <manim|psychopomp>
  artifacture engine scaffold <manim|psychopomp> <directory> [--theme <preset>]
  artifacture engine render <job.json> --out <directory>

Native runtimes are optional and pinned in ~/.cache/artifacture/engines.
Render outputs preserve source, a playable clip, selected stills and provenance.
See docs/native-engines.md for system prerequisites and compositing limits.
`;

try {
  const [command = 'help', ...args] = process.argv.slice(2);
  if (['help', '--help', '-h'].includes(command)) console.log(help);
  else if (command === 'list') {
    if (args.length && (args.length !== 1 || args[0] !== '--json')) throw new Error('Usage: artifacture engine list [--json]');
    const catalog = await Promise.all(Object.values(engines).map(async engine => {
      let ready = false, setupReason;
      try { await readyEngine(engine.id); ready = true; } catch (error) { setupReason = error.message; }
      return { ...engine, installed: await exists(paths(engine.id).receipt), ready, setupReason, setupCommand: `artifacture engine setup ${engine.id}`, scaffoldCommand: `artifacture engine scaffold ${engine.id} my-${engine.id}-scene` };
    }));
    if (args.includes('--json')) console.log(JSON.stringify(catalog, null, 2));
    else catalog.forEach(engine => console.log(`${engine.name}: ${engine.input}\n  ${engine.ready ? 'Ready' : 'Setup required'}; pinned ${engine.version}\n  ${engine.capabilities.join(', ')}`));
  } else if (command === 'setup') {
    if (args.length !== 1) throw new Error('Usage: artifacture engine setup <manim|psychopomp>');
    const receipt = await setupEngine(args[0]);
    console.log(`Ready: ${receipt.engine} ${receipt.version}`);
  } else if (command === 'scaffold') {
    if (![2, 4].includes(args.length) || (args.length === 4 && args[2] !== '--theme')) throw new Error('Usage: artifacture engine scaffold <engine> <directory> [--theme <preset>]');
    const engine = engineById(args[0]), directory = path.resolve(args[1]), theme = args[3] ?? 'hairline';
    if (!engine.themes.includes(theme)) throw new Error(`Unsupported native theme: ${theme}.`);
    if (await exists(directory)) throw new Error('Scaffold directory already exists; choose a new directory.');
    const job = JSON.parse(await fs.readFile(path.join(import.meta.dirname, `video-engines/templates/${engine.id}.job.json`), 'utf8'));
    const source = path.join(import.meta.dirname, 'video-engines/templates', job.source);
    job.theme = theme;
    await fs.mkdir(directory, { recursive: true });
    await fs.copyFile(source, path.join(directory, job.source));
    await fs.writeFile(path.join(directory, `${engine.id}.job.json`), JSON.stringify(job, null, 2) + '\n');
    console.log(`Created ${directory}\nNext: artifacture engine render ${path.join(directory, `${engine.id}.job.json`)} --out ${path.join(directory, 'render')}`);
  } else if (command === 'render') {
    if (args.length !== 3 || args[1] !== '--out') throw new Error('Usage: artifacture engine render <job.json> --out <directory>');
    const manifest = await renderNativeJob(path.resolve(args[0]), path.resolve(args[2]));
    console.log(`Rendered ${manifest.asset.duration}s ${manifest.asset.engine} clip, ${manifest.asset.stills.length} stills, and provenance in ${path.resolve(args[2])}`);
  } else throw new Error(`Unknown engine command: ${command}.\n${help}`);
} catch (error) {
  console.error(`artifacture engine: ${error.message}`);
  process.exitCode = 1;
}

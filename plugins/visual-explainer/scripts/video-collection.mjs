#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readCollection, scaffoldCollection } from '../video/collection.mjs';
import { modeHelp } from '../video/modes.mjs';

const help = 'Usage: video-collection.mjs modes | check MANIFEST.json [--repo DIR] | scaffold MANIFEST.json --out NEW-DIR [--repo DIR]';
const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'modes' && !args.length) { console.log(JSON.stringify(modeHelp(), null, 2)); }
  else if (command === 'check' || command === 'scaffold') {
    const filename = args.shift();
    if (!filename || filename.startsWith('--')) throw new Error(help);
    const options = {};
    while (args.length) {
      const flag = args.shift();
      if (!['--repo', '--out'].includes(flag) || Object.hasOwn(options, flag)) throw new Error(help);
      const value = args.shift();
      if (!value || value.startsWith('--')) throw new Error(help);
      options[flag] = value;
    }
    if (command === 'check' && options['--out']) throw new Error(help);
    if (command === 'scaffold' && !options['--out']) throw new Error(help);
    const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
    const checked = await readCollection(path.resolve(filename), { repositoryRoot: path.resolve(options['--repo'] ?? process.cwd()) });
    const result = command === 'check' ? { valid: true, manifestSha256: checked.manifestSha256, episodes: checked.manifest.episodes.map((episode) => episode.id), evidence: checked.evidence.map(({ id, binding }) => ({ id, binding })) } : await scaffoldCollection(checked, { outputRoot: options['--out'], runtimeRoot });
    console.log(JSON.stringify(result, null, 2));
  } else throw new Error(help);
} catch (error) { console.error(error.message); process.exitCode = 1; }

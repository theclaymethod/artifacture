#!/usr/bin/env node
// The markdown side of a trust-map explainer: the PR-body section, from the same rules as the
// data components (visual-explainer-mdx/trust-map-rules.ts), so the PR body and the page give the
// same merge answer.
//
//   node scripts/ve-mdx/trust-map.mjs pr-section --map trust-map.json --refs refs.resolved.json \
//       [--explain explain.json] [--explainer-url URL] --out pr-section.md
// The merge verdict, the promise strengths and the ready gates come from the derived block of the refs.
import { readFileSync, writeFileSync } from 'node:fs';
import { prSection, promiseRows } from '../../visual-explainer-mdx/trust-map-rules.ts';

const [command, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i += 2) {
  if (!rest[i].startsWith('--') || rest[i + 1] === undefined) throw new Error(`trust-map: bad argument ${rest[i]}`);
  args[rest[i].slice(2)] = rest[i + 1];
}
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));

try {
  if (command !== 'pr-section') throw new Error('usage: trust-map.mjs pr-section --map M --refs R [--explain E] [--explainer-url U] --out F');
  if (!args.map || !args.refs || !args.out) throw new Error('pr-section needs --map, --refs and --out');
  const data = json(args.map);
  const refs = json(args.refs);
  const text = prSection(data, refs, args.explain ? json(args.explain) : {}, args['explainer-url'] ?? null);
  writeFileSync(args.out, text);
  console.log(`wrote ${args.out}`);
  console.log('promises: ' + promiseRows(data, refs).map((r) => `${r.promise.id} ${r.strength}`).join(', '));
} catch (error) {
  console.error(`trust-map: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

#!/usr/bin/env node
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const directory = path.join(root, 'plugins/visual-explainer/vendor/chalkboarding/examples');
const examples = {};
for (const file of (await readdir(directory)).sort()) {
  if (!file.endsWith('.html')) continue;
  const html = await readFile(path.join(directory, file), 'utf8');
  examples[file.slice(0, -5)] = { title: html.match(/<title>(.*?)<\/title>/s)?.[1] ?? file, html };
}
const output = path.join(root, 'visual-explainer-mdx/chalkboard-examples.ts');
const content = `// Generated from unchanged Chalkboarding documents; PencilPete is not included.\nexport const chalkboardExamples = ${JSON.stringify(examples)} as const;\nexport type ChalkboardExample = keyof typeof chalkboardExamples;\n`;
if (process.argv.includes('--check')) {
  if (await readFile(output, 'utf8') !== content) throw new Error('Original Chalkboarding examples are stale. Run npm run build:chalkboard-examples.');
} else await writeFile(output, content);
console.log(`${Object.keys(examples).length} original Chalkboarding documents.`);

#!/usr/bin/env node
import { readFile, readdir, mkdir, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const output = 'plugins/visual-explainer/assets/runtime.json.gz';
const roots = ['LICENSE', 'README.md', 'DESIGN.md', 'package.json', 'package-lock.json', 'tsconfig.json', 'oxlint.config.ts', '.nvmrc', '.claude-plugin', 'scripts', 'visual-explainer-mdx', 'plugins/visual-explainer', 'tools', 'examples', 'evals', 'docs/research/primitive-candidates-2026-10-04.md', 'docs/research/diagram-design-integration.md'];
const excluded = new Set([output, 'scripts/build-skill-runtime.mjs']);
const files = [];

async function collect(relative) {
  if (excluded.has(relative)) return;
  const file = path.join(root, relative);
  const stat = await lstat(file);
  if (stat.isDirectory()) {
    for (const entry of (await readdir(file)).sort()) {
      if (['node_modules', '.DS_Store', 'out', 'rendered', 'runs', '.ve-mdx-tmp'].includes(entry)) continue;
      await collect(`${relative}/${entry}`);
    }
    return;
  }
  if (!stat.isFile()) throw new Error(`Runtime sources must be regular files: ${relative}`);
  let content = await readFile(file);
  if (relative === 'package.json') {
    const manifest = JSON.parse(content);
    for (const script of ['build:skill-runtime', 'check:skill-runtime', 'prepack']) delete manifest.scripts[script];
    manifest.scripts['check:fast'] = manifest.scripts['check:fast'].replace('npm run check:skill-runtime && ', '');
    content = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  }
  files.push({ path: relative, content: content.toString('base64'), mode: stat.mode & 0o111 ? 0o755 : 0o644 });
}

if (process.argv.slice(2).some(argument => argument !== '--check') || process.argv.length > 3) throw new Error('Usage: node scripts/build-skill-runtime.mjs [--check]');
for (const relative of roots) await collect(relative);
for (const entry of (await readdir(path.join(root, 'docs'))).sort()) if (entry.endsWith('.md')) await collect(`docs/${entry}`);
files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
const payload = Buffer.from(JSON.stringify({ version: 1, files }));
const archive = gzipSync(payload, { level: 9 });
if (process.argv.includes('--check')) {
  const current = await readFile(path.join(root, output)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (!current || !gunzipSync(current).equals(payload)) throw new Error('The bundled skill runtime is stale. Run npm run build:skill-runtime after editing runtime sources.');
} else {
  await mkdir(path.dirname(path.join(root, output)), { recursive: true });
  await writeFile(path.join(root, output), archive);
}
console.log(`${process.argv.includes('--check') ? 'Verified' : 'Bundled'} ${files.length} runtime files (${archive.length} compressed bytes).`);

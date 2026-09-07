#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const usage = 'Usage: npm run ve:chart -- <chart.json> --out <chart.html>';

// This is the JSON input boundary; primitive checks establish the chart envelope.
/* oxlint-disable anti-slop/no-runtime-typeof */
function envelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Chart input must be a JSON object.');
  if (typeof value.title !== 'string' || !value.title.trim()) throw new Error('Chart input needs a nonempty title.');
  if (value.description !== undefined && typeof value.description !== 'string') throw new Error('Chart description must be text.');
  if (value.source !== undefined) {
    if (!value.source || typeof value.source.label !== 'string' || !value.source.label.trim()) throw new Error('Chart source needs a nonempty label.');
    if (value.source.url !== undefined) {
      let url;
      try { url = new URL(value.source.url); } catch { throw new Error('Chart source URL must be an absolute http or https URL.'); }
      if (typeof value.source.url !== 'string' || !['http:', 'https:'].includes(url.protocol)) throw new Error('Chart source URL must use http or https.');
    }
  }
  return { title: value.title, description: value.description, source: value.source, spec: value.spec };
}
/* oxlint-enable anti-slop/no-runtime-typeof */

function exportChart(source, out) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(repoRoot, 'scripts/ve-mdx/export.mjs'), source, '--out', out], { cwd: repoRoot, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Chart export failed (${code ?? 'interrupted'}).`)));
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { console.log(usage); return; }
  if (args.length !== 3 || args[1] !== '--out' || !args[0] || !args[2]) throw new Error(usage);
  const input = path.resolve(args[0]);
  const output = path.resolve(args[2]);
  if (input === output) throw new Error('Chart output must differ from its editable JSON input.');
  if (!output.endsWith('.html')) throw new Error('Chart output must end in .html.');
  const props = envelope(JSON.parse(await fs.readFile(input, 'utf8')));
  // Reuse the component's validator and render path. Invalid data never replaces a prior export.
  const server = await createServer({ root: repoRoot, appType: 'custom', logLevel: 'error', plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false } });
  try {
    const { LieflatChart, validateLieflatChartSpec } = await server.ssrLoadModule('/visual-explainer-mdx/lieflat-charts.tsx');
    validateLieflatChartSpec(props.spec);
    renderToStaticMarkup(React.createElement(LieflatChart, props));
  } finally { await server.close(); }

  const tempRoot = path.join(repoRoot, '.ve-mdx-tmp');
  await fs.mkdir(tempRoot, { recursive: true });
  const temp = await fs.mkdtemp(path.join(tempRoot, 'lieflat-chart-'));
  try {
    const source = path.join(temp, 'chart.tsx');
    const built = path.join(temp, 'chart.html');
    const component = path.join(repoRoot, 'visual-explainer-mdx/components');
    await fs.writeFile(source, `import React from 'react';\nimport { LieflatChart } from ${JSON.stringify(component)};\nconst chart = ${JSON.stringify(props)};\nexport default function Chart() { return <main data-ve-preset="lieflat" style={{maxWidth:1120,margin:'0 auto',padding:'clamp(20px,5vw,72px)',fontFamily:'var(--ve-font-body)'}}><LieflatChart {...chart} /></main>; }\n`);
    await exportChart(source, built);
    await fs.mkdir(path.dirname(output), { recursive: true });
    // Stage beside the destination so rename stays atomic across filesystem boundaries.
    const staged = `${output}.${path.basename(temp)}.tmp`;
    try {
      await fs.copyFile(built, staged, fs.constants.COPYFILE_EXCL);
      await fs.rename(staged, output);
    } finally { await fs.rm(staged, { force: true }); }
    console.log(`Generated ${output}`);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });

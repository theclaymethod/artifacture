#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const repoRoot = process.cwd();
const outputs = [
  ['examples/visual-explainer-mdx/pipeline.mdx', 'dist/visual-explainer-mdx/pipeline.html'],
  ['examples/visual-explainer-mdx/interactive.tsx', 'dist/visual-explainer-mdx/interactive.html'],
  ['examples/visual-explainer-mdx/web-diagram.mdx', 'dist/visual-explainer-mdx/web-diagram.html'],
  ['examples/visual-explainer-mdx/slide-deck.mdx', 'dist/visual-explainer-mdx/slide-deck.html'],
  ['examples/visual-explainer-mdx/visual-plan.mdx', 'dist/visual-explainer-mdx/visual-plan.html'],
  ['examples/visual-explainer-mdx/review-report.mdx', 'dist/visual-explainer-mdx/review-report.html'],
  ['examples/visual-explainer-mdx/poster-card.tsx', 'dist/visual-explainer-mdx/poster-card.html'],
  ['examples/visual-explainer-mdx/magazine-deck.mdx', 'dist/visual-explainer-mdx/magazine-deck.html'],
  ['examples/visual-explainer-mdx/preset-gallery.mdx', 'dist/visual-explainer-mdx/preset-gallery.html'],
  ['examples/visual-explainer-mdx/diagram-canvas.mdx', 'dist/visual-explainer-mdx/diagram-canvas.html'],
  ['examples/visual-explainer-mdx/code-walkthrough.mdx', 'dist/visual-explainer-mdx/code-walkthrough.html'],
  ['examples/visual-explainer-mdx/mermaid-block.mdx', 'dist/visual-explainer-mdx/mermaid-block.html'],
  ['examples/visual-explainer-mdx/diff-terminal-json.mdx', 'dist/visual-explainer-mdx/diff-terminal-json.html'],
  ['examples/visual-explainer-mdx/explain-diff-demo.mdx', 'dist/visual-explainer-mdx/explain-diff-demo.html'],
];

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/ve-mdx/export.mjs', ...args], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`export failed with exit code ${code}`));
    });
  });
}

async function assertGenerated(filePath) {
  const html = await fs.readFile(path.resolve(repoRoot, filePath), 'utf8');
  const shell = html.replace(/<script\b[\s\S]*?<\/script>/g, '<script></script>');
  const failures = [];
  if (!html.includes('visual-explainer-mdx')) failures.push('missing generator marker');
  if (!html.includes('<style>')) failures.push('CSS was not inlined');
  if (!html.includes('<script type="module">')) failures.push('JS was not inlined');
  if (/<script[^>]+src=["']\.?\/assets\//.test(shell) || /<link[^>]+href=["']\.?\/assets\//.test(shell)) {
    failures.push('external build asset reference remains');
  }
  if (!html.includes('id="root"')) failures.push('missing React root');
  if (failures.length) throw new Error(`${filePath}: ${failures.join(', ')}`);
}

for (const [source, out] of outputs) {
  await run([source, '--out', out]);
  await assertGenerated(out);
}

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['scripts/ve-mdx/check-integrity.mjs'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  child.on('exit', (code) => {
    if (code === 0) resolve();
    else reject(new Error(`integrity fixture check failed with exit code ${code}`));
  });
});

console.log('ve:check passed');

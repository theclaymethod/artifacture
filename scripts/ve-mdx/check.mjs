#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { parseHTML } from 'linkedom';
import { sharedComponents } from './integrity.mjs';

const repoRoot = process.cwd();
const MIN_BODY_TEXT_LENGTH = 200;
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

function runStatic(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/ve-mdx/export-static.mjs', ...args], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`static export failed with exit code ${code}`));
    });
  });
}

// Visible document text after scripts/styles are stripped. Catches a React
// tree that renders empty (or near-empty) without tripping any of the shape
// checks. Uses documentElement rather than body: linkedom does not
// foster-parent a fragment root (e.g. a bare <main>...</main>, which is what
// ExplainerShell/SlideDeck compositions render) into <body> the way a browser
// parser would, so body.textContent would silently read 0 for those roots.
function documentTextLength(html) {
  const { document } = parseHTML(html);
  for (const el of [...document.querySelectorAll('script, style')]) el.remove();
  const text = (document.documentElement?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text.length;
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

// check.mjs's `outputs` are client-hydrated (CSR): the raw build artifact is
// always just `<div id="root"></div>` plus a bundled module script — the
// real page text only exists once that script runs in a browser. Measuring
// "visible text" on that raw file is a no-op (it reads 0 chars for every
// source, working or broken), so it cannot catch a component whose React
// tree renders empty. Instead, render the same SOURCE through
// export-static.mjs's renderToStaticMarkup path (already wired in below) to
// an ephemeral temp file and measure THAT — a faithful, deterministic,
// browser-free reflection of what the component tree actually produces.
async function assertSourceRendersContent(sourcePath) {
  const tempOut = path.join(repoRoot, '.ve-mdx-tmp', `content-probe-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  await fs.mkdir(path.dirname(tempOut), { recursive: true });
  try {
    await runStatic([sourcePath, '--out', tempOut]);
    const html = await fs.readFile(tempOut, 'utf8');
    const textLength = documentTextLength(html);
    if (textLength <= MIN_BODY_TEXT_LENGTH) {
      throw new Error(`${sourcePath}: rendered content is only ${textLength} chars (need > ${MIN_BODY_TEXT_LENGTH}) — React tree may be rendering empty`);
    }
  } finally {
    await fs.rm(tempOut, { force: true });
  }
}

// export-static.mjs renders the source's own returned tree via
// renderToStaticMarkup — there is no build shell, no injected generator
// marker, no id="root", and no bundled <script type="module">. Its documented
// contract (plugins/visual-explainer/references/hyperframes.md) is a
// Hyperframes composition root carrying data-composition-id, so that
// attribute is this leg's equivalent of assertGenerated's id="root" check.
async function assertStaticGenerated(filePath) {
  const html = await fs.readFile(path.resolve(repoRoot, filePath), 'utf8');
  const failures = [];
  if (!html.includes('<style>')) failures.push('CSS was not inlined');
  if (!/\sdata-composition-id\s*=/.test(html)) failures.push('missing Hyperframes composition root (data-composition-id)');
  if (/<script[^>]+src=["']\.?\/assets\//.test(html) || /<link[^>]+href=["']\.?\/assets\//.test(html)) {
    failures.push('external build asset reference remains');
  }
  const textLength = documentTextLength(html);
  if (textLength <= MIN_BODY_TEXT_LENGTH) {
    failures.push(`body text content is only ${textLength} chars (need > ${MIN_BODY_TEXT_LENGTH}) — composition may be rendering empty`);
  }
  if (failures.length) throw new Error(`${filePath}: ${failures.join(', ')}`);
}

// Roster-sync guard (plan 008 step 5): components.tsx's named exports,
// integrity.mjs's sharedComponents set, and SKILL.md's bulleted roster are
// three hand-maintained lists describing the same 17 components with no
// automatic sync between them. A component added to one but not another
// silently produces false integrity failures (sharedComponents) or stale
// docs (SKILL.md). This does not derive one list from another — deriving
// integrity.mjs's set from the module at runtime means importing TSX into a
// plain-node context, which is messier than a guard (deferred; see plan
// 008's maintenance notes) — it only asserts the lists still agree.
async function assertRosterInSync() {
  const componentsSource = await fs.readFile(path.resolve(repoRoot, 'visual-explainer-mdx/components.tsx'), 'utf8');
  const exported = new Set([...componentsSource.matchAll(/^export function (\w+)/gm)].map((match) => match[1]));

  const missingFromShared = [...exported].filter((name) => !sharedComponents.has(name));
  const missingFromExports = [...sharedComponents].filter((name) => !exported.has(name));
  if (missingFromShared.length || missingFromExports.length) {
    const details = [];
    if (missingFromShared.length) details.push(`components.tsx exports not in integrity.mjs's sharedComponents: ${missingFromShared.join(', ')}`);
    if (missingFromExports.length) details.push(`integrity.mjs's sharedComponents not exported by components.tsx: ${missingFromExports.join(', ')}`);
    throw new Error(`Component roster out of sync — ${details.join('; ')}`);
  }

  // SKILL.md's roster is prose documentation (a bullet list with inline prop
  // hints appended), more brittle to parse reliably than a source export
  // list, so a mismatch here is a warning rather than a build failure.
  const skillDoc = await fs.readFile(path.resolve(repoRoot, 'plugins/visual-explainer/SKILL.md'), 'utf8');
  const documented = new Set([...skillDoc.matchAll(/^- (\w+)\(/gm)].map((match) => match[1]));
  const missingFromSkill = [...exported].filter((name) => !documented.has(name));
  const extraInSkill = [...documented].filter((name) => !exported.has(name));
  if (missingFromSkill.length || extraInSkill.length) {
    const details = [];
    if (missingFromSkill.length) details.push(`not documented in SKILL.md: ${missingFromSkill.join(', ')}`);
    if (extraInSkill.length) details.push(`documented in SKILL.md but not exported: ${extraInSkill.join(', ')}`);
    console.warn(`WARN: component roster vs SKILL.md drift — ${details.join('; ')}`);
  }
}

await assertRosterInSync();
console.log('component roster in sync');

for (const [source, out] of outputs) {
  await run([source, '--out', out]);
  await assertGenerated(out);
  await assertSourceRendersContent(source);
}

const staticExample = [
  'examples/visual-explainer-mdx/video-longform.tsx',
  'dist/visual-explainer-mdx/video-longform-static.html',
];
await runStatic([staticExample[0], '--out', staticExample[1]]);
await assertStaticGenerated(staticExample[1]);
console.log('static export ok');

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

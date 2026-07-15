#!/usr/bin/env node
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolve } from 'node:path';
import { runBrowserStage } from './browser.mjs';
import { checks } from './checks/browser.mjs';

const fileArg = process.argv[2];
if (!fileArg) {
  console.error('Usage: node plugins/visual-explainer/scripts/verify/lib/browser-dev.mjs <file.html> [--profile page|slides|magazine|poster|video-comp] [--preset name] [--screens dir]');
  process.exit(2);
}

const filePath = resolve(fileArg);
const args = parseArgs(process.argv.slice(3));
const html = await readFile(filePath, 'utf8');
const profile = args.profile || detectProfile(html, filePath);
const preset = args.preset || detectPreset(html);
const screensDir = args.screens || await mkdtemp(path.join(tmpdir(), 've-browser-dev-'));

const ctx = {
  filePath,
  html,
  profile,
  preset,
  flags: detectFlags(html),
  browser: null
};

const started = Date.now();
await runBrowserStage(ctx, { screensDir, profile });
const elapsed = Date.now() - started;

const rows = [];
for (const [id, check] of Object.entries(checks)) {
  const result = check.run(ctx);
  const worst = worstStatus(result.map((item) => item.status));
  rows.push({ id, status: worst, result });
}

console.log(`file: ${filePath}`);
console.log(`profile: ${profile}`);
console.log(`preset: ${preset}`);
console.log(`screens: ${screensDir}`);
console.log(`runs: ${ctx.browser.runs.map((run) => `${run.viewport}-${run.scheme}${run.reducedMotion ? '-reduced-motion' : ''}`).join(', ')}`);
console.log(`elapsed_ms: ${elapsed}`);
console.log('');

for (const row of rows) {
  const evidence = row.result.find((item) => item.status !== 'pass')?.evidence || row.result[0]?.evidence || '';
  console.log(`${row.status.padEnd(5)} ${row.id}${evidence ? ` - ${truncate(evidence, 240)}` : ''}`);
}

console.log('');
console.log('screenshots:');
for (const run of ctx.browser.runs) {
  console.log(`- ${run.screenshotPath}`);
  console.log(`- ${run.fullScreenshotPath}`);
}

function parseArgs(raw) {
  const parsed = {};
  for (let i = 0; i < raw.length; i += 1) {
    const arg = raw[i];
    if (arg === '--profile') parsed.profile = raw[++i];
    else if (arg === '--preset') parsed.preset = raw[++i];
    else if (arg === '--screens') parsed.screens = resolve(raw[++i]);
  }
  return parsed;
}

function detectProfile(html, filePath) {
  const base = path.basename(filePath);
  if (/magazine-deck/i.test(base)) return 'magazine';
  if (/slide-deck/i.test(base)) return 'slides';
  if (/poster/i.test(base)) return 'poster';
  if (/video-comp|hyperframes|data-hf|__timelines|9\s*:\s*16|1080\s*x\s*1920/i.test(html)) return 'video-comp';
  if (/--poster|data-poster|w-\[\d+px\][\s\S]*h-\[\d+px\]|poster/i.test(html) && /poster/i.test(path.basename(filePath))) return 'poster';
  if (/data-ve-presentation/i.test(html)) return 'page'; // fixed-stage decks never scroll-snap
  if (/class=["'][^"']*\bmag\b[^"']*["']|scroll-snap-type\s*:\s*x\s+mandatory|--magazine/i.test(html)) return 'magazine';
  if (/section[^>]+class=["'][^"']*\bslide\b|scroll-snap-type\s*:\s*y\s+mandatory|\bdeck-hints\b/i.test(html)) return 'slides';
  return 'page';
}

function detectPreset(html) {
  if (/font-family\s*:[^;{}]*Doto|--font-[\w-]+\s*:[^;{}]*Doto|data-preset=["']nothing["']/i.test(html)) return 'nothing';
  if (/mono-industrial|data-preset=["']mono-industrial["']|--mono-/i.test(html)) return 'mono-industrial';
  if (/blueprint/i.test(html)) return 'blueprint';
  if (/editorial/i.test(html)) return 'editorial';
  if (/paper-ink/i.test(html)) return 'paper-ink';
  if (/terminal/i.test(html)) return 'terminal';
  return 'custom';
}

function detectFlags(html) {
  return {
    hasMermaid: /class=["'][^"']*\bmermaid\b|mermaid\.initialize/i.test(html),
    hasInlineSvgDiagram: /<svg\b/i.test(html),
    hasDiagramRoleTags: /data-diagram-role=/i.test(html),
    hasAnimations: /@keyframes|animation\s*:|gsap|requestAnimationFrame/i.test(html)
  };
}

function worstStatus(statuses) {
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('warn')) return 'warn';
  if (statuses.includes('skip')) return 'skip';
  return 'pass';
}

function truncate(value, limit) {
  const oneLine = String(value).replace(/\s+/g, ' ');
  return oneLine.length > limit ? `${oneLine.slice(0, limit - 1)}…` : oneLine;
}

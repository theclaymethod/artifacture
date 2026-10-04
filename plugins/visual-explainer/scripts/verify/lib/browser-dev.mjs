#!/usr/bin/env node
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolve } from 'node:path';
import { runBrowserStage } from './browser.mjs';
import { checks } from './checks/browser.mjs';
import { buildContext } from './context.mjs';

const fileArg = process.argv[2];
if (!fileArg) {
  console.error('Usage: node plugins/visual-explainer/scripts/verify/lib/browser-dev.mjs <file.html> [--profile page|slides|magazine|poster|video-comp] [--preset name] [--screens dir]');
  process.exit(2);
}

const filePath = resolve(fileArg);
const args = parseArgs(process.argv.slice(3));
const ctx = await buildContext(filePath, args);
const { profile, preset } = ctx;
const screensDir = args.screens || await mkdtemp(path.join(tmpdir(), 've-browser-dev-'));

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

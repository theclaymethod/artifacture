#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const budgets = JSON.parse(readFileSync(new URL('./budgets.json', import.meta.url), 'utf8'));
const maxSeconds = Number(process.env.ARTIFACTURE_CHECK_MAX_SECONDS || budgets.canonical_max_seconds);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const started = performance.now();

for (const script of ['check:fast', 've:eval', 've:eval-presentation']) {
  const result = spawnSync(npm, ['run', script], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const elapsedSeconds = (performance.now() - started) / 1000;
process.stdout.write(`Canonical check completed in ${elapsedSeconds.toFixed(2)}s (budget ${maxSeconds}s).\n`);
if (elapsedSeconds > maxSeconds) {
  console.error('Canonical check exceeded its checked-in runtime budget. Diagnose before raising the budget.');
  process.exitCode = 1;
}

#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';

const budgets = JSON.parse(readFileSync(new URL('./budgets.json', import.meta.url), 'utf8'));
const maxSeconds = Number(process.env.ARTIFACTURE_CHECK_MAX_SECONDS || budgets.canonical_max_seconds);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const started = performance.now();

async function run(script) {
  const stageStarted = performance.now();
  await new Promise((resolve, reject) => {
    const child = spawn(npm, ['run', script], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      console.log(`${script} finished in ${((performance.now() - stageStarted) / 1000).toFixed(2)}s.`);
      if (code === 0) resolve();
      else reject(new Error(`${script} failed (${signal ?? code})`));
    });
  });
}

async function runEvals() {
  await run('ve:eval');
  await run('ve:eval-presentation');
}

try {
  await run('check:static');
  const cpus = availableParallelism();
  if (cpus >= 4) {
    // Keep export builds busy alongside browser work on larger machines.
    // Each lane owns its outputs; wait for every lane's cleanup on failure.
    const lanes = cpus >= 8
      ? [run('ve:check'), run('ve:eval'), run('test').then(() => run('ve:eval-presentation'))]
      : [run('check:browser'), runEvals()];
    const results = await Promise.allSettled(lanes);
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map((result) => result.reason), 'Check lanes failed');
  } else {
    await run('check:browser');
    await runEvals();
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

const elapsedSeconds = (performance.now() - started) / 1000;
process.stdout.write(`Canonical check completed in ${elapsedSeconds.toFixed(2)}s (budget ${maxSeconds}s).\n`);
if (elapsedSeconds > maxSeconds) {
  console.error('Canonical check exceeded its checked-in runtime budget. Diagnose before raising the budget.');
  process.exitCode = 1;
}

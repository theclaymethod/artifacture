#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const repoRoot = process.cwd();
const fixtures = [
  'scripts/ve-mdx/fixtures/bad-edge.mdx',
  'scripts/ve-mdx/fixtures/clipped-viewbox.mdx',
  'scripts/ve-mdx/fixtures/bad-diff.mdx',
  'scripts/ve-mdx/fixtures/missing-codeblock.mdx',
  'scripts/ve-mdx/fixtures/malicious-nodes-exec.mdx',
  'scripts/ve-mdx/fixtures/malicious-template-interpolation.mdx',
];

// malicious-nodes-exec.mdx embeds a payload that, if it were ever executed by
// the integrity preflight (e.g. a regression back to Function()-eval), would
// write this canary file. It must never exist after a clean run.
const canaryPath = '/tmp/p002-canary';

function runExport(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/ve-mdx/export.mjs', ...args], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

await fs.rm(canaryPath, { force: true });

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 've-mdx-integrity-'));
try {
  for (const fixture of fixtures) {
    const strictOut = path.join(tmp, `${path.basename(fixture)}.strict.html`);
    const strict = await runExport([fixture, '--out', strictOut]);
    if (strict.code === 0) throw new Error(`${fixture}: strict export unexpectedly passed`);
    if (!strict.stderr.includes('visual-explainer integrity failed')) {
      throw new Error(`${fixture}: strict export did not report integrity failure\n${strict.stderr}`);
    }

    const draftOut = path.join(tmp, `${path.basename(fixture)}.draft.html`);
    const draft = await runExport([fixture, '--out', draftOut, '--draft']);
    if (draft.code !== 0) throw new Error(`${fixture}: draft export failed\n${draft.stderr}`);
    if (!draft.stderr.includes('visual-explainer draft warnings')) {
      throw new Error(`${fixture}: draft export did not report warnings\n${draft.stderr}`);
    }
  }

  const canaryExists = await fs.access(canaryPath).then(() => true, () => false);
  if (canaryExists) {
    throw new Error(`${canaryPath} exists — malicious-nodes-exec.mdx's payload executed; the integrity preflight is unsafe`);
  }
} finally {
  await fs.rm(tmp, { force: true, recursive: true });
}

console.log('ve-mdx integrity fixtures passed');

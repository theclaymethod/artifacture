import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { resolveReactForExport } from './export.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function symlinkReactModules(targetNodeModules) {
  mkdirSync(targetNodeModules, { recursive: true });
  for (const pkg of ['react', 'react-dom']) {
    symlinkSync(join(repoRoot, 'node_modules', pkg), join(targetNodeModules, pkg), 'dir');
  }
}

function runExport(source, out) {
  return spawnSync(process.execPath, ['scripts/ve-mdx/export.mjs', source, '--out', out], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

test('resolveReactForExport adds aliases only for sources outside the repo', () => {
  const inRepo = join(repoRoot, 'examples/visual-explainer-mdx/interactive.tsx');
  const inRepoResolve = resolveReactForExport(inRepo, repoRoot);
  assert.deepEqual(inRepoResolve.dedupe, ['react', 'react-dom']);
  assert.equal(inRepoResolve.alias, undefined);

  const external = join(tmpdir(), 'outside-deck', 'deck.tsx');
  const externalResolve = resolveReactForExport(external, repoRoot);
  assert.deepEqual(externalResolve.dedupe, ['react', 'react-dom']);
  assert.equal(externalResolve.alias.react, join(repoRoot, 'node_modules/react'));
  assert.equal(externalResolve.alias['react-dom'], join(repoRoot, 'node_modules/react-dom'));
  assert.equal(externalResolve.alias['react-dom/client'], join(repoRoot, 'node_modules/react-dom/client.js'));
});

test('external source with local react/node_modules bundles a single React runtime', async () => {
  const root = mkdtempSync(join(tmpdir(), 've-export-react-'));
  try {
    symlinkReactModules(join(root, 'node_modules'));
    const source = join(root, 'external-hook.tsx');
    writeFileSync(
      source,
      `import { useState } from 'react';\nexport default function ExternalHook() {\n  const [n] = useState(42);\n  return <p id="hook-count">{n}</p>;\n}\n`,
    );
    const out = join(root, 'out.html');
    const run = runExport(source, out);
    assert.equal(run.status, 0, run.stderr || run.stdout);

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto(pathToFileURL(out).href, { waitUntil: 'load' });
      await page.waitForSelector('#hook-count', { timeout: 10_000 });
      assert.equal(await page.textContent('#hook-count'), '42');
      assert.equal(errors.length, 0, errors.join('\n'));
    } finally {
      await browser.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

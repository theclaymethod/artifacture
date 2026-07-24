import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('client export dedupes React when the source lives in another package tree', () => {
  const externalRoot = mkdtempSync(path.join(os.tmpdir(), 'artifacture-react-singleton-'));
  try {
    mkdirSync(path.join(externalRoot, 'node_modules'), { recursive: true });
    cpSync(
      path.join(REPO_ROOT, 'node_modules/react'),
      path.join(externalRoot, 'node_modules/react'),
      { recursive: true },
    );

    const source = path.join(externalRoot, 'external-deck.tsx');
    const output = path.join(externalRoot, 'external-deck.html');
    writeFileSync(
      source,
      `import React, { useState } from 'react';

export default function ExternalDeck() {
  const [slide] = useState('one');
  return <main data-ve-presentation data-slide-id={slide}>External deck</main>;
}
`,
    );

    const result = spawnSync(
      process.execPath,
      ['scripts/ve-mdx/export.mjs', source, '--out', output, '--draft'],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const html = readFileSync(output, 'utf8');
    const hookImplementations = html.match(/useState=function/g) ?? [];
    assert.equal(
      hookImplementations.length,
      1,
      `expected one React hook implementation, found ${hookImplementations.length}`,
    );
  } finally {
    rmSync(externalRoot, { recursive: true, force: true });
  }
});

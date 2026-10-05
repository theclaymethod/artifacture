import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(ROOT, 'evals/fixtures/deck-review/presentation-states.html');
const CLI = path.join(ROOT, 'plugins/visual-explainer/scripts/verify/ve-verify.mjs');

function verify(artifact, reportPath, args = [], stateFilter) {
  const result = spawnSync(process.execPath, [CLI, artifact, '--json', reportPath, '--quiet', ...args], {
    cwd: ROOT, encoding: 'utf8',
    env: { ...process.env, ARTIFACTURE_DECK_REVIEW_STATES: stateFilter || '' },
  });
  assert.notEqual(result.status, 2, result.stderr);
  return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
}

test('public verifier runs keep separately bound screenshot evidence', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacture-browser-evidence-'));
  const evidenceDirs = [];
  try {
    const artifact = path.join(workDir, 'poster.html');
    fs.writeFileSync(artifact, '<!doctype html><html><body><main><h1>Poster</h1></main></body></html>');
    const first = verify(artifact, path.join(workDir, 'first.json'), ['--profile', 'poster']);
    evidenceDirs.push(first.review_contract.capture_root);
    const firstPath = first.review_contract.evidence.find((entry) => entry.kind === 'screenshot').path;
    const firstEvidence = fs.readFileSync(firstPath);
    const second = verify(artifact, path.join(workDir, 'second.json'), ['--profile', 'poster']);
    evidenceDirs.push(second.review_contract.capture_root);
    const secondPath = second.review_contract.evidence.find((entry) => entry.kind === 'screenshot').path;
    assert.equal(first.review_contract.inventory_provenance, 'browser-rendered');
    assert.ok(first.review_contract.inventory.items.some((item) => item.text === 'Poster'));
    assert.ok(second.review_contract.inventory.items.some((item) => item.text === 'Poster'));
    assert.notEqual(first.review_contract.capture_root, second.review_contract.capture_root);
    assert.notEqual(firstPath, secondPath);
    assert.deepEqual(fs.readFileSync(firstPath), firstEvidence, 'a later CLI run must not overwrite bound evidence');
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
    for (const directory of evidenceDirs) fs.rmSync(directory, { recursive: true, force: true });
  }
});

for (const slideId of ['slide-two', 'a'.repeat(80)]) {
  test(`public verifier captures presentation base, drill and progressive states with a ${slideId.length}-character slide id`, () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacture-deck-review-'));
    try {
      const artifact = path.join(workDir, 'deck.html');
      fs.writeFileSync(artifact, fs.readFileSync(FIXTURE, 'utf8').replaceAll('slide-two', slideId));
      const report = verify(artifact, path.join(workDir, 'report.json'), ['--screens', path.join(workDir, 'screens')]);
      const reviewSets = report.review_contract.evidence.filter((entry) => entry.kind === 'deck-manifest')
        .map((entry) => JSON.parse(fs.readFileSync(entry.path, 'utf8')));
      assert.ok(reviewSets.some((manifest) => manifest.scheme === 'light'));
      assert.ok(reviewSets.some((manifest) => manifest.scheme === 'dark'));
      for (const reviewSet of reviewSets) {
        assert.deepEqual(reviewSet.units.map((unit) => unit.state_id), [
          'slide-one--base', 'slide-one--drill--evidence', `${slideId}--base`, `${slideId}--state--1`,
          `${slideId}--drill--state-1-progressive-evidence`,
        ]);
        assert.ok(reviewSet.units.every((unit) => fs.statSync(unit.screenshot_path).size > 0));
        assert.deepEqual(reviewSet.review_groups.map((group) => [group.purpose, group.state_ids]), [
          ['state-continuity', ['slide-one--base', 'slide-one--drill--evidence']],
          ['state-continuity', [`${slideId}--base`, `${slideId}--state--1`]],
          ['state-continuity', [`${slideId}--base`, `${slideId}--drill--state-1-progressive-evidence`]],
          ['adjacent-slide-variety', ['slide-one--base', `${slideId}--base`]],
        ]);
      }
      assert.deepEqual(reviewSets[0].review_groups, reviewSets.at(-1).review_groups);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });
}

test('public bounded recapture retains paired context and rejects stale or unpaired requests', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacture-deck-recapture-'));
  try {
    const artifact = path.join(workDir, 'deck.html');
    fs.copyFileSync(FIXTURE, artifact);
    const validFilter = 'slide-two--base,slide-two--drill--state-1-progressive-evidence';
    const report = verify(artifact, path.join(workDir, 'paired.json'), ['--screens', path.join(workDir, 'screens')], validFilter);
    const manifests = report.review_contract.evidence.filter((entry) => entry.kind === 'deck-manifest')
      .map((entry) => JSON.parse(fs.readFileSync(entry.path, 'utf8')));
    assert.ok(manifests.length > 0);
    for (const manifest of manifests) {
      assert.deepEqual(manifest.units.map((unit) => unit.state_id), validFilter.split(','));
      assert.deepEqual(manifest.review_groups.map((group) => group.state_ids), [validFilter.split(',')]);
    }
    for (const [name, filter, reason] of [
      ['stale', 'slide-two--base,missing--state', /did not capture requested states: missing--state/],
      ['unpaired', 'slide-two--base', /requires paired evidence/],
      ['orphan', 'slide-two--drill--state-1-progressive-evidence', /requires two distinct states/],
    ]) {
      const rejected = verify(artifact, path.join(workDir, `${name}.json`), ['--screens', path.join(workDir, 'screens')], filter);
      assert.equal(rejected.review_contract.complete, false);
      assert.match(rejected.review_contract.missing.join('\n'), reason);
      assert.ok(rejected.checks.some((check) => check.status === 'fail'), 'a capture failure must retain its mechanics report');
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import test from 'node:test';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const CLI = resolve(import.meta.dirname, 'check.mjs');
const MANIFEST = resolve(import.meta.dirname, 'run-manifest.mjs');
const PREPARE = resolve(import.meta.dirname, 'prepare-review.mjs');
const VERIFIER = resolve(REPO_ROOT, 'plugins/visual-explainer/scripts/verify/ve-verify.mjs');

test('product review CLIs bind exported artifacts to real verifier evidence and leave judgments pending', () => {
  const workDir = mkdtempSync(join(tmpdir(), 'artifacture-product-review-'));
  try {
    const truth = join(REPO_ROOT, 'examples/visual-explainer-mdx/artifacture-system-map-brief.md');
    const task = basename(truth, '.md');
    const benchmarkPath = join(workDir, 'benchmark.json');
    const judgmentsPath = join(workDir, 'judgments.json');
    writeFileSync(benchmarkPath, JSON.stringify({
      schema_version: 1,
      id: 'system-map-e2e',
      cases: [{ id: 'system-map', task: truth, profile: 'page', dimensions: ['correctness', 'clarity'] }],
    }));
    const run = (script, args) => spawnSync(process.execPath, [script, ...args], {
      cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
    });
    const manifests = [];
    let baselineArtifact;
    let capturedEvidence;
    for (const role of ['baseline', 'candidate']) {
      const runDir = join(workDir, role);
      const cell = join(runDir, 'codex', task);
      mkdirSync(cell, { recursive: true });
      const artifact = join(cell, 'artifact.html');
      if (baselineArtifact) copyFileSync(baselineArtifact, artifact);
      else {
        const exported = run(join(REPO_ROOT, 'scripts/ve-mdx/export.mjs'), [
          join(REPO_ROOT, 'examples/visual-explainer-mdx/artifacture-system-map.tsx'), '--out', artifact,
        ]);
        assert.equal(exported.status, 0, exported.stderr);
        baselineArtifact = artifact;
      }
      const reportPath = join(cell, 'report.json');
      const verified = run(VERIFIER, [artifact, '--truth', truth, '--json', reportPath,
        '--screens', join(cell, 'screens'), '--quiet']);
      assert.notEqual(verified.status, 2, verified.stderr);
      const report = JSON.parse(readFileSync(reportPath, 'utf8'));
      assert.equal(report.review_contract.complete, true, JSON.stringify(report.review_contract.missing));
      const screenshots = report.review_contract.evidence.filter((entry) => entry.kind === 'screenshot');
      assert.ok(screenshots.length > 0, 'browser capture must emit screenshots');
      capturedEvidence = screenshots[0].path;
      assert.deepEqual(readFileSync(capturedEvidence).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      writeFileSync(join(cell, 'meta.json'), JSON.stringify({ model_slug: 'codex', model_kind: 'codex-cli' }));
      const manifestPath = join(workDir, `${role}.manifest.json`);
      const manifested = run(MANIFEST, ['--benchmark', benchmarkPath, '--run-dir', runDir,
        '--run-id', role, '--output', manifestPath]);
      assert.equal(manifested.status, 0, manifested.stderr);
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      assert.equal(manifest.cases[0].artifact.sha256, report.review_contract.artifact_sha256);
      assert.deepEqual(manifest.cases[0].evidence.map((entry) => entry.sha256), report.review_contract.evidence_sha256);
      manifests.push(manifestPath);
    }
    const prepared = run(PREPARE, ['--benchmark', benchmarkPath, '--baseline-manifest', manifests[0],
      '--candidate-manifest', manifests[1], '--output', judgmentsPath]);
    assert.equal(prepared.status, 0, prepared.stderr);
    const judgments = JSON.parse(readFileSync(judgmentsPath, 'utf8'));
    assert.equal(judgments.review.status, 'pending-human-review');
    assert.ok(judgments.comparisons.every((comparison) => comparison.verdict === 'tie' && comparison.basis === 'byte-identical-artifact'));
    const checked = run(CLI, ['--benchmark', benchmarkPath, '--judgments', judgmentsPath, '--json']);
    assert.equal(checked.status, 1, checked.stderr);
    assert.equal(JSON.parse(checked.stdout).status, 'pending-human-review');

    // Mutation of actual captured output must stop rebinding the run.
    const evidenceBytes = readFileSync(capturedEvidence);
    for (const mutation of ['changed', 'deleted']) {
      if (mutation === 'changed') writeFileSync(capturedEvidence, Buffer.concat([evidenceBytes, Buffer.from('changed')]));
      else rmSync(capturedEvidence);
      const rebound = run(MANIFEST, ['--benchmark', benchmarkPath, '--run-dir', join(workDir, 'candidate'),
        '--run-id', 'candidate', '--output', join(workDir, 'rebound.json')]);
      assert.equal(rebound.status, 2, `stale ${mutation} screenshot must reject the manifest`);
      assert.match(rebound.stderr, /review evidence changed|ENOENT|Stale review evidence/);
      writeFileSync(capturedEvidence, evidenceBytes);
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test('the default product benchmark is pending until a human compares artifacts', () => {
  const result = spawnSync(process.execPath, [CLI, '--json'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.benchmark_id, 'artifacture-product-v1');
  assert.equal(report.status, 'pending-human-review');
  assert.equal(report.comparisons, 0);
});

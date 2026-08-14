import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const CLI = resolve(REPO_ROOT, 'plugins/visual-explainer/scripts/verify/ve-verify.mjs');
const FINALIZER = resolve(REPO_ROOT, 'plugins/visual-explainer/scripts/verify/ve-finalize.mjs');

test('the public verifier rejects profiles outside the closed CLI set', () => {
  const workDir = mkdtempSync(join(tmpdir(), 'artifacture-profile-'));
  try {
    const artifact = join(workDir, 'artifact.html');
    writeFileSync(artifact, '<main><h1>Artifact</h1></main>');
    const result = spawnSync(process.execPath, [
      CLI, artifact, '--profile', 'unknown', '--static-only', '--quiet',
    ], { cwd: REPO_ROOT, encoding: 'utf8' });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /Unsupported profile "unknown"/);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test('the public verifier reports unparseable HTML as a mandatory error', () => {
  const workDir = mkdtempSync(join(tmpdir(), 'artifacture-html-parse-'));
  try {
    const artifact = join(workDir, 'artifact.html');
    const reportPath = join(workDir, 'report.json');
    writeFileSync(artifact, '<!--');
    const result = spawnSync(process.execPath, [
      CLI, artifact, '--json', reportPath, '--static-only', '--quiet',
    ], { cwd: REPO_ROOT, encoding: 'utf8' });

    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    const parseCheck = report.checks.find((check) => check.id === 'artifact-html-parse');
    assert.equal(parseCheck?.status, 'fail');
    assert.equal(parseCheck?.severity, 'error');
    assert.ok(report.summary.errors >= 1);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test('mechanics-only reaches a seeded deck check without running complete-deck review', () => {
  const workDir = mkdtempSync(join(tmpdir(), 'artifacture-mechanics-'));
  try {
    const reportPath = join(workDir, 'report.json');
    const screensDir = join(workDir, 'screens');
    const fixture = resolve(REPO_ROOT, 'evals/fixtures/violations/deck-navigation-shell-safe-controls.html');
    const result = spawnSync(process.execPath, [
      CLI,
      fixture,
      '--json', reportPath,
      '--screens', screensDir,
      '--mechanics-only',
      '--quiet',
    ], { cwd: REPO_ROOT, encoding: 'utf8' });

    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    assert.equal(
      report.checks.find((check) => check.id === 'deck-navigation-shell-safe-controls')?.status,
      'fail',
    );
    assert.equal(
      readdirSync(screensDir).some((name) => name.startsWith('deck-review-')),
      false,
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test('the public verifier binds review verdicts to artifact, truth, inventory, and screenshots', () => {
  const workDir = mkdtempSync(join(tmpdir(), 'artifacture-review-contract-'));
  try {
    const artifact = join(workDir, 'artifact.html');
    const truth = join(workDir, 'brief.md');
    const screens = join(workDir, 'screens');
    const firstReport = join(workDir, 'first.json');
    const secondReport = join(workDir, 'second.json');
    writeFileSync(artifact, `<!doctype html><html><body><main><p>Loading…</p></main><script>document.querySelector('main').innerHTML='<h1>Bound claim</h1><p>One grounded fact.</p>'</script></body></html>`);
    writeFileSync(truth, '# Brief\nOne grounded fact.\n');

    const run = (report) => spawnSync(process.execPath, [
      CLI, artifact, '--truth', truth, '--json', report, '--screens', screens, '--quiet',
    ], { cwd: REPO_ROOT, encoding: 'utf8' });
    const first = run(firstReport);
    assert.notEqual(first.status, 2, first.stderr);
    const contract = JSON.parse(readFileSync(firstReport, 'utf8')).review_contract;
    assert.equal(contract.complete, true);
    assert.match(contract.sha256, /^[a-f0-9]{64}$/);
    assert.match(contract.artifact_sha256, /^[a-f0-9]{64}$/);
    assert.match(contract.truth.sha256, /^[a-f0-9]{64}$/);
    assert.equal(contract.inventory.items.length, 2);
    assert.equal(contract.inventory_provenance, 'browser-rendered');
    assert.ok(contract.evidence.length > 0);

    const verdicts = join(workDir, 'verdicts.json');
    const finalized = join(workDir, 'final.json');
    const firstParsed = JSON.parse(readFileSync(firstReport, 'utf8'));
    writeFileSync(verdicts, JSON.stringify({
      schema_version: 1,
      review_contract_sha256: contract.sha256,
      passes: firstParsed.llm_passes_required.map((pass) => ({ pass, status: 'pass', findings: [] })),
    }));
    const finalizedResult = spawnSync(process.execPath, [
      FINALIZER, '--report', firstReport, '--verdicts', verdicts, '--out', finalized,
    ], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.notEqual(finalizedResult.status, 2, finalizedResult.stderr);

    writeFileSync(truth, '# Brief\nA changed source of truth.\n');
    const second = run(secondReport);
    assert.notEqual(second.status, 2, second.stderr);
    const changed = JSON.parse(readFileSync(secondReport, 'utf8')).review_contract;
    assert.notEqual(changed.sha256, contract.sha256);
    assert.notEqual(changed.truth.sha256, contract.truth.sha256);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

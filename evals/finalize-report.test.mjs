import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { buildContext } from '../plugins/visual-explainer/scripts/verify/lib/context.mjs';
import { buildReport } from '../plugins/visual-explainer/scripts/verify/lib/report.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const CLI = resolve(REPO_ROOT, 'plugins/visual-explainer/scripts/verify/ve-finalize.mjs');
const VERIFY_CLI = resolve(REPO_ROOT, 'plugins/visual-explainer/scripts/verify/ve-verify.mjs');

async function fixture(t) {
  const workDir = mkdtempSync(join(tmpdir(), 'artifacture-finalize-'));
  t.after(() => rmSync(workDir, { recursive: true, force: true }));
  const artifact = join(workDir, 'artifact.html');
  const truth = join(workDir, 'brief.md');
  const screenshot = join(workDir, '1440x900.png');
  const reportPath = join(workDir, 'report.json');
  const verdictsPath = join(workDir, 'verdicts.json');
  const outPath = join(workDir, 'final.json');
  writeFileSync(artifact, '<!doctype html><html><body><main><h1>Artifact</h1><p>Grounded fact.</p></main></body></html>');
  writeFileSync(truth, '# Brief\nGrounded fact.\n');
  writeFileSync(screenshot, 'pixels');
  const ctx = await buildContext(artifact, { truth });
  const report = buildReport(ctx, [], [screenshot]);
  writeFileSync(reportPath, JSON.stringify(report));
  const run = (passes, contractSha = report.review_contract.sha256) => {
    writeFileSync(verdictsPath, JSON.stringify({
      schema_version: 1,
      review_contract_sha256: contractSha,
      passes,
    }));
    return spawnSync(process.execPath, [
      CLI, '--report', reportPath, '--verdicts', verdictsPath, '--out', outPath,
    ], { cwd: REPO_ROOT, encoding: 'utf8' });
  };
  return { artifact, truth, screenshot, report, reportPath, outPath, run };
}

test('a mechanics-clean report cannot become verified while its visual pass is missing', async (t) => {
  const { outPath, report, run } = await fixture(t);
  const result = run([]);
  assert.equal(result.status, 1, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(outPath, 'utf8')).verification, {
    status: 'incomplete',
    required_passes: report.llm_passes_required,
    completed_passes: [],
    missing_passes: report.llm_passes_required,
    evidence_missing: [],
    findings: [],
  });
});

test('a mechanics-clean report becomes verified after its bound pass succeeds', async (t) => {
  const { outPath, report, run } = await fixture(t);
  const result = run(report.llm_passes_required.map((pass) => ({ pass, status: 'pass', findings: [] })));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(outPath, 'utf8')).verification.status, 'verified');
});

test('a skipped required pass is disclosed as incomplete', async (t) => {
  const { outPath, report, run } = await fixture(t);
  const result = run(report.llm_passes_required.map((pass) => ({ pass, status: 'skipped', findings: [] })));
  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(readFileSync(outPath, 'utf8')).verification.status, 'incomplete');
});

test('a stale verdict contract cannot verify a different report', async (t) => {
  const { report, run } = await fixture(t);
  const result = run(
    report.llm_passes_required.map((pass) => ({ pass, status: 'pass', findings: [] })),
    'b'.repeat(64),
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /does not match the report review contract/);
});

test('a fabricated self-declared contract is rejected', async (t) => {
  const { report, reportPath, run } = await fixture(t);
  report.review_contract.sha256 = 'a'.repeat(64);
  writeFileSync(reportPath, JSON.stringify(report));
  const result = run(
    report.llm_passes_required.map((pass) => ({ pass, status: 'pass', findings: [] })),
    'a'.repeat(64),
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /identity is invalid/);
});

for (const [name, field, replacement, message] of [
  ['artifact', 'artifact', '<h1>changed artifact</h1>', /artifact changed/],
  ['truth brief', 'truth', '# Brief\nChanged truth.\n', /truth brief changed/],
  ['screenshot evidence', 'screenshot', 'changed pixels', /review evidence changed/],
]) {
  test(`finalization rejects ${name} mutation after capture`, async (t) => {
    const state = await fixture(t);
    writeFileSync(state[field], replacement);
    const result = state.run(state.report.llm_passes_required.map((pass) => ({ pass, status: 'pass', findings: [] })));
    assert.equal(result.status, 2);
    assert.match(result.stderr, message);
  });
}

test('an empty heading-only truth file cannot complete a review contract', async (t) => {
  const workDir = mkdtempSync(join(tmpdir(), 'artifacture-empty-truth-'));
  t.after(() => rmSync(workDir, { recursive: true, force: true }));
  const artifact = join(workDir, 'artifact.html');
  const truth = join(workDir, 'brief.md');
  const screenshot = join(workDir, '1440x900.png');
  writeFileSync(artifact, '<main><h1>Artifact</h1><p>Claim</p></main>');
  writeFileSync(truth, '# Empty brief\n\n');
  writeFileSync(screenshot, 'pixels');
  const report = buildReport(await buildContext(artifact, { truth }), [], [screenshot]);
  assert.equal(report.review_contract.complete, false);
  assert.deepEqual(report.review_contract.missing, ['truth-brief']);
});

test('a fixed-stage deck finalizes with page mechanics and slides review semantics', async (t) => {
  const workDir = mkdtempSync(join(tmpdir(), 'artifacture-fixed-stage-'));
  t.after(() => rmSync(workDir, { recursive: true, force: true }));
  const artifact = join(workDir, 'deck.html');
  const truth = join(workDir, 'brief.md');
  const screenshot = join(workDir, 'deck.png');
  const manifest = join(workDir, 'deck-review.json');
  const reportPath = join(workDir, 'report.json');
  const verifierReportPath = join(workDir, 'verifier-report.json');
  const verdictsPath = join(workDir, 'verdicts.json');
  const outPath = join(workDir, 'final.json');
  writeFileSync(artifact, '<!doctype html><html><body><main data-ve-presentation="true"><h1>Deck</h1><p>Grounded fact.</p></main></body></html>');
  writeFileSync(truth, '# Brief\nGrounded fact.\n');
  writeFileSync(screenshot, 'pixels');
  writeFileSync(manifest, '{}');

  const verifyResult = spawnSync(process.execPath, [
    VERIFY_CLI, artifact, '--truth', truth, '--json', verifierReportPath, '--static-only', '--quiet',
  ], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.notEqual(verifyResult.status, 2, verifyResult.stderr);
  const verifierReport = JSON.parse(readFileSync(verifierReportPath, 'utf8'));
  assert.equal(verifierReport.profile, 'page');
  assert.equal(verifierReport.mechanics_profile, 'page');
  assert.equal(verifierReport.review_profile, 'slides');
  assert.deepEqual(verifierReport.llm_passes_required, ['artifact-review:slides']);

  const ctx = await buildContext(artifact, { truth });
  ctx.browser = { runs: [{ deckReview: { manifestPath: manifest } }] };
  const report = buildReport(ctx, [], [screenshot]);
  assert.equal(report.profile, 'page');
  assert.equal(report.mechanics_profile, 'page');
  assert.equal(report.review_profile, 'slides');
  assert.equal(report.review_contract.profile, 'slides');
  assert.equal(report.review_contract.mechanics_profile, 'page');
  assert.equal(report.review_contract.review_profile, 'slides');
  assert.deepEqual(report.llm_passes_required, ['artifact-review:slides']);
  assert.equal(report.review_contract.complete, true);

  writeFileSync(reportPath, JSON.stringify(report));
  writeFileSync(verdictsPath, JSON.stringify({
    schema_version: 1,
    review_contract_sha256: report.review_contract.sha256,
    passes: [{ pass: 'artifact-review:slides', status: 'pass', findings: [] }],
  }));
  const result = spawnSync(process.execPath, [
    CLI, '--report', reportPath, '--verdicts', verdictsPath, '--out', outPath,
  ], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(outPath, 'utf8')).verification.status, 'verified');
});

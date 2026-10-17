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
      readdirSync(report.review_contract.capture_root).some((name) => name.startsWith('deck-review-')),
      false,
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test('the public verifier and finalizer bind review decisions to live artifact and capture evidence', () => {
  const workDir = mkdtempSync(join(tmpdir(), 'artifacture-review-contract-'));
  try {
    const artifact = join(workDir, 'artifact.html');
    const truth = join(workDir, 'brief.md');
    const screens = join(workDir, 'screens');
    const firstReport = join(workDir, 'first.json');
    const cleanPage = readFileSync(resolve(REPO_ROOT, 'evals/fixtures/clean/page.html'), 'utf8');
    writeFileSync(artifact, cleanPage.replace(/<main>[\s\S]*?<\/main>/,
      `<main><p>Loading…</p></main><script>document.querySelector('main').innerHTML='<h1>Bound claim</h1><p>One grounded fact.</p>'</script>`));
    writeFileSync(truth, '# Brief\nOne grounded fact.\n');
    const run = (report, extra = []) => spawnSync(process.execPath, [
      CLI, artifact, '--truth', truth, '--json', report, '--screens', screens, '--quiet', ...extra,
    ], { cwd: REPO_ROOT, encoding: 'utf8' });
    const first = run(firstReport);
    assert.notEqual(first.status, 2, first.stderr);
    const report = JSON.parse(readFileSync(firstReport, 'utf8'));
    const contract = report.review_contract;
    assert.equal(contract.complete, true, JSON.stringify(contract.missing));
    assert.equal(contract.inventory_provenance, 'browser-rendered');
    assert.deepEqual(contract.inventory.items.map((item) => item.text), ['Bound claim', 'One grounded fact.']);
    assert.ok(contract.evidence.some((entry) => entry.kind === 'screenshot'));
    const verdicts = join(workDir, 'verdicts.json');
    const bundle = {
      schema_version: 1,
      review_contract_sha256: contract.sha256,
      passes: report.llm_passes_required.map((pass) => ({ pass, status: 'pass', findings: [] })),
    };
    writeFileSync(verdicts, JSON.stringify(bundle));
    const finalize = (name, source = firstReport) => {
      const output = join(workDir, `${name}.final.json`);
      const result = spawnSync(process.execPath, [FINALIZER, '--report', source,
        '--verdicts', verdicts, '--out', output], { cwd: REPO_ROOT, encoding: 'utf8' });
      return { result, output };
    };
    const accepted = finalize('accepted');
    assert.equal(accepted.result.status, 0, accepted.result.stderr);
    assert.equal(JSON.parse(readFileSync(accepted.output, 'utf8')).verification.status, 'verified');

    for (const [name, passes] of [
      ['missing-verdict', bundle.passes.slice(1)],
      ['skipped-verdict', bundle.passes.map((entry, index) => index ? entry : { ...entry, status: 'skipped' })],
    ]) {
      writeFileSync(verdicts, JSON.stringify({ ...bundle, passes }));
      const { result, output } = finalize(name);
      assert.equal(result.status, 1, result.stderr);
      const finalized = JSON.parse(readFileSync(output, 'utf8'));
      assert.notEqual(finalized.verification.status, 'verified');
      assert.ok(finalized.verification.missing_passes.includes(bundle.passes[0].pass));
    }
    writeFileSync(verdicts, JSON.stringify({ ...bundle, review_contract_sha256: '0'.repeat(64) }));
    const stale = finalize('stale-verdict');
    assert.equal(stale.result.status, 2);
    assert.match(stale.result.stderr, /does not match.*review contract/);
    writeFileSync(verdicts, JSON.stringify(bundle));

    const screenshot = contract.evidence.find((entry) => entry.kind === 'screenshot').path;
    for (const [name, path] of [
      ['artifact', artifact], ['artifact-snapshot', contract.artifact_snapshot],
      ['truth', truth], ['truth-snapshot', contract.truth_snapshot], ['screenshot', screenshot],
    ]) {
      const bytes = readFileSync(path);
      for (const mutation of ['changed', 'deleted']) {
        if (mutation === 'changed') writeFileSync(path, Buffer.concat([bytes, Buffer.from('changed')]));
        else rmSync(path);
        const { result } = finalize(`${name}-${mutation}`);
        assert.equal(result.status, 2, `${name} ${mutation}: ${result.stderr}`);
        assert.match(result.stderr, /changed after|changed after capture|ENOENT/);
        writeFileSync(path, bytes);
      }
    }
    const alteredReport = join(workDir, 'tampered-summary.json');
    writeFileSync(alteredReport, JSON.stringify({ ...report, summary: { ...report.summary, passed: report.summary.passed + 1 } }));
    const tampered = finalize('tampered-summary', alteredReport);
    assert.equal(tampered.result.status, 2);
    assert.match(tampered.result.stderr, /mechanics summary does not match/);

    writeFileSync(truth, '# Brief\nA changed source of truth.\n');
    const secondReport = join(workDir, 'second.json');
    const second = run(secondReport);
    assert.notEqual(second.status, 2, second.stderr);
    const changed = JSON.parse(readFileSync(secondReport, 'utf8')).review_contract;
    assert.notEqual(changed.sha256, contract.sha256);
    assert.notEqual(changed.truth.sha256, contract.truth.sha256);

    // Keep empty-deck failures in this same CLI/evidence flow, with fresh reports.
    for (const [name, marker, profile] of [
      ['empty-slides', '', 'slides'],
      ['missing-stage', ' data-ve-presentation="true"', 'page'],
    ]) {
      writeFileSync(artifact, `<!doctype html><html><body><main${marker}><h1>Empty deck</h1><p>Grounded fact.</p></main></body></html>`);
      const reportPath = join(workDir, `${name}.json`);
      const result = run(reportPath, ['--profile', profile]);
      assert.notEqual(result.status, 2, result.stderr);
      const empty = JSON.parse(readFileSync(reportPath, 'utf8'));
      assert.ok(empty.checks.some((check) => check.status === 'fail'), 'mechanics failures must remain in the saved report');
      assert.equal(empty.review_contract.complete, false);
      assert.ok(empty.review_contract.missing.includes('paired-deck-manifest'));
      assert.ok(empty.review_contract.missing.some((item) => item.startsWith('capture-incomplete: ')));
      writeFileSync(verdicts, JSON.stringify({
        schema_version: 1, review_contract_sha256: empty.review_contract.sha256,
        passes: empty.llm_passes_required.map((pass) => ({ pass, status: 'pass', findings: [] })),
      }));
      const finalized = finalize(name, reportPath);
      assert.equal(finalized.result.status, 1, finalized.result.stderr);
      assert.notEqual(JSON.parse(readFileSync(finalized.output, 'utf8')).verification.status, 'verified');
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { evaluateBenchmark } from './check.mjs';
import { reviewContractSha256 } from '../../plugins/visual-explainer/scripts/verify/lib/report.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const CLI = resolve(import.meta.dirname, 'check.mjs');

const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

function bindRun(workDir, benchmark, role, runId) {
  const runRoot = join(workDir, runId);
  const cases = benchmark.cases.map((benchmarkCase) => {
    const caseRoot = join(runRoot, benchmarkCase.id);
    mkdirSync(caseRoot, { recursive: true });
    const artifact = join(caseRoot, 'artifact.html');
    const report = join(caseRoot, 'report.json');
    const screenshot = join(caseRoot, '1440x900.png');
    const truth = join(workDir, benchmarkCase.task);
    mkdirSync(resolve(truth, '..'), { recursive: true });
    writeFileSync(artifact, `<h1>${role} ${benchmarkCase.id}</h1>`);
    writeFileSync(screenshot, `${role}-pixels`);
    writeFileSync(truth, `# Brief\nTruth for ${benchmarkCase.id}.\n`);
    const contract = {
      schema_version: 1,
      artifact_sha256: digest(artifact),
      profile: benchmarkCase.profile,
      preset: 'custom',
      truth_sha256: digest(truth),
      inventory_sha256: 'c'.repeat(64),
      evidence_sha256: [digest(screenshot)],
      required_passes: [`artifact-review:${benchmarkCase.profile}`],
      complete: true,
      missing: [],
      truth: { path: truth, sha256: digest(truth), claims: [`Truth for ${benchmarkCase.id}.`] },
      inventory: { sha256: 'c'.repeat(64), items: [{ role: 'h1', text: benchmarkCase.id }] },
      evidence: [{ path: screenshot, sha256: digest(screenshot) }],
    };
    contract.sha256 = reviewContractSha256(contract);
    writeFileSync(report, JSON.stringify({
      file: artifact,
      profile: benchmarkCase.profile,
      preset: 'custom',
      summary: { errors: 0 },
      llm_passes_required: contract.required_passes,
      review_contract: contract,
    }));
    const ref = (path) => ({ path: path.slice(workDir.length + 1), sha256: digest(path) });
    return {
      case_id: benchmarkCase.id,
      task: benchmarkCase.task?.replace(/\.md$/, '') || '',
      profile: benchmarkCase.profile || null,
      model: { slug: 'codex', kind: 'codex-cli', id: null },
      truth_sha256: contract.truth_sha256,
      review_contract_sha256: contract.sha256,
      mechanics_errors: 0,
      artifact: ref(artifact),
      report: ref(report),
      evidence: [ref(screenshot)],
      screenshots: [ref(screenshot)],
    };
  });
  const manifestPath = join(workDir, `${role}.manifest.json`);
  writeFileSync(manifestPath, `${JSON.stringify({
    schema_version: 1,
    benchmark_id: benchmark.id,
    run_id: runId,
    cases,
  })}\n`);
  return { manifest: `${role}.manifest.json`, sha256: digest(manifestPath) };
}

test('aggregate wins cannot hide a regression in one artifact case', () => {
  const workDir = mkdtempSync(join(tmpdir(), 'artifacture-product-benchmark-'));
  try {
    const benchmarkPath = join(workDir, 'benchmark.json');
    const judgmentsPath = join(workDir, 'judgments.json');
    const benchmark = {
      schema_version: 1,
      id: 'representative-artifacts-v1',
      cases: [
        { id: 'architecture', task: 'architecture.md', profile: 'page', dimensions: ['correctness', 'clarity'] },
        { id: 'walkthrough', task: 'walkthrough.md', profile: 'page', dimensions: ['correctness', 'clarity'] },
      ],
    };
    writeFileSync(benchmarkPath, `${JSON.stringify(benchmark)}\n`);
    writeFileSync(judgmentsPath, `${JSON.stringify({
      schema_version: 1,
      benchmark_id: 'representative-artifacts-v1',
      baseline_run: 'baseline-v1',
      candidate_run: 'candidate-v1',
      runs: {
        baseline: bindRun(workDir, benchmark, 'baseline', 'baseline-v1'),
        candidate: bindRun(workDir, benchmark, 'candidate', 'candidate-v1'),
      },
      review: {
        status: 'human-reviewed',
        reviewer: 'fixture-reviewer',
        reviewed_at: '2026-08-04T12:00:00Z',
      },
      comparisons: [
        { case_id: 'architecture', dimension: 'correctness', verdict: 'candidate' },
        { case_id: 'architecture', dimension: 'clarity', verdict: 'candidate' },
        { case_id: 'walkthrough', dimension: 'correctness', verdict: 'baseline' },
        { case_id: 'walkthrough', dimension: 'clarity', verdict: 'candidate' },
      ],
    })}\n`);

    const result = spawnSync(process.execPath, [
      CLI,
      '--benchmark', benchmarkPath,
      '--judgments', judgmentsPath,
      '--json',
    ], { cwd: REPO_ROOT, encoding: 'utf8' });

    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(result.stdout), {
      benchmark_id: 'representative-artifacts-v1',
      baseline_run: 'baseline-v1',
      candidate_run: 'candidate-v1',
      status: 'regressed',
      cases: 2,
      comparisons: 4,
      wins: 3,
      ties: 0,
      losses: 1,
      regressions: [{ case_id: 'walkthrough', dimension: 'correctness' }],
    });
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test('a human-review claim is incomplete until every case dimension is judged', () => {
  const workDir = mkdtempSync(join(tmpdir(), 'artifacture-product-benchmark-'));
  try {
    const benchmarkPath = join(workDir, 'benchmark.json');
    const judgmentsPath = join(workDir, 'judgments.json');
    const benchmark = {
      schema_version: 1,
      id: 'representative-artifacts-v1',
      cases: [
        { id: 'architecture', task: 'architecture.md', profile: 'page', dimensions: ['correctness', 'clarity'] },
        { id: 'walkthrough', task: 'walkthrough.md', profile: 'page', dimensions: ['correctness', 'clarity'] },
      ],
    };
    writeFileSync(benchmarkPath, `${JSON.stringify(benchmark)}\n`);
    writeFileSync(judgmentsPath, `${JSON.stringify({
      schema_version: 1,
      benchmark_id: 'representative-artifacts-v1',
      baseline_run: 'baseline-v1',
      candidate_run: 'candidate-v1',
      runs: {
        baseline: bindRun(workDir, benchmark, 'baseline', 'baseline-v1'),
        candidate: bindRun(workDir, benchmark, 'candidate', 'candidate-v1'),
      },
      review: {
        status: 'human-reviewed',
        reviewer: 'fixture-reviewer',
        reviewed_at: '2026-08-04T12:00:00Z',
      },
      comparisons: [
        { case_id: 'architecture', dimension: 'correctness', verdict: 'tie' },
        { case_id: 'architecture', dimension: 'clarity', verdict: 'candidate' },
        { case_id: 'walkthrough', dimension: 'correctness', verdict: 'tie' },
      ],
    })}\n`);

    const result = spawnSync(process.execPath, [
      CLI,
      '--benchmark', benchmarkPath,
      '--judgments', judgmentsPath,
      '--json',
    ], { cwd: REPO_ROOT, encoding: 'utf8' });

    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(result.stdout), {
      benchmark_id: 'representative-artifacts-v1',
      baseline_run: 'baseline-v1',
      candidate_run: 'candidate-v1',
      status: 'incomplete-human-review',
      cases: 2,
      comparisons: 3,
      wins: 1,
      ties: 2,
      losses: 0,
      regressions: [],
      missing: [{ case_id: 'walkthrough', dimension: 'clarity' }],
    });
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test('model or synthetic judgments cannot qualify as human review', () => {
  const workDir = mkdtempSync(join(tmpdir(), 'artifacture-product-benchmark-'));
  try {
    const benchmarkPath = join(workDir, 'benchmark.json');
    const judgmentsPath = join(workDir, 'judgments.json');
    writeFileSync(benchmarkPath, `${JSON.stringify({
      schema_version: 1,
      id: 'representative-artifacts-v1',
      cases: [{ id: 'architecture', dimensions: ['shipping-quality'] }],
    })}\n`);
    writeFileSync(judgmentsPath, `${JSON.stringify({
      schema_version: 1,
      benchmark_id: 'representative-artifacts-v1',
      review: { status: 'model-reviewed', reviewer: 'vision-judge' },
      comparisons: [
        { case_id: 'architecture', dimension: 'shipping-quality', verdict: 'candidate' },
      ],
    })}\n`);

    const result = spawnSync(process.execPath, [
      CLI,
      '--benchmark', benchmarkPath,
      '--judgments', judgmentsPath,
      '--json',
    ], { cwd: REPO_ROOT, encoding: 'utf8' });

    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).status, 'pending-human-review');
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test('human-reviewed status requires bound runs, reviewer metadata, and unique valid comparisons', () => {
  const benchmark = {
    id: 'representative-artifacts-v1',
    cases: [{ id: 'architecture', dimensions: ['shipping-quality'] }],
  };
  const result = evaluateBenchmark(benchmark, {
    benchmark_id: 'representative-artifacts-v1',
    baseline_run: 'same-run',
    candidate_run: 'same-run',
    review: { status: 'human-reviewed', reviewer: '', reviewed_at: 'not-a-date' },
    comparisons: [
      { case_id: 'architecture', dimension: 'shipping-quality', verdict: 'candidate' },
      { case_id: 'architecture', dimension: 'shipping-quality', verdict: 'tie' },
    ],
  });

  assert.equal(result.status, 'invalid-human-review');
  assert.deepEqual(result.problems, [
    'baseline_run and candidate_run must be distinct non-empty ids',
    'reviewer is required',
    'reviewed_at must be an ISO timestamp',
    'duplicate comparison: architecture/shipping-quality',
  ]);
});

test('all ties do not claim that a product-changing candidate improved the product', () => {
  const benchmark = { id: 'representative-artifacts-v1', cases: [{ id: 'architecture', dimensions: ['clarity'] }] };
  const result = evaluateBenchmark(benchmark, {
    benchmark_id: benchmark.id,
    baseline_run: 'baseline-v1',
    candidate_run: 'candidate-v1',
    review: { status: 'human-reviewed', reviewer: 'human', reviewed_at: '2026-08-04T12:00:00Z' },
    comparisons: [{ case_id: 'architecture', dimension: 'clarity', verdict: 'tie' }],
  });
  assert.equal(result.status, 'no-improvement');
});

test('all ties pass an explicitly scoped non-regression review', () => {
  const benchmark = { id: 'representative-artifacts-v1', cases: [{ id: 'architecture', dimensions: ['clarity'] }] };
  const result = evaluateBenchmark(benchmark, {
    benchmark_id: benchmark.id,
    baseline_run: 'baseline-v1',
    candidate_run: 'candidate-v1',
    review: {
      status: 'human-reviewed',
      acceptance: 'non-regression',
      reviewer: 'human',
      reviewed_at: '2026-08-04T12:00:00Z',
    },
    comparisons: [{ case_id: 'architecture', dimension: 'clarity', verdict: 'tie' }],
  });
  assert.equal(result.status, 'passed');
});

test('a human review cannot pass after a bound artifact is changed', () => {
  const workDir = mkdtempSync(join(tmpdir(), 'artifacture-product-benchmark-'));
  try {
    const benchmark = { schema_version: 1, id: 'representative-artifacts-v1', cases: [{ id: 'architecture', task: 'architecture.md', profile: 'page', dimensions: ['clarity'] }] };
    const benchmarkPath = join(workDir, 'benchmark.json');
    const judgmentsPath = join(workDir, 'judgments.json');
    writeFileSync(benchmarkPath, JSON.stringify(benchmark));
    const baseline = bindRun(workDir, benchmark, 'baseline', 'baseline-v1');
    const candidate = bindRun(workDir, benchmark, 'candidate', 'candidate-v1');
    writeFileSync(join(workDir, 'candidate-v1', 'architecture', 'artifact.html'), '<h1>tampered</h1>');
    writeFileSync(judgmentsPath, JSON.stringify({
      benchmark_id: benchmark.id,
      baseline_run: 'baseline-v1',
      candidate_run: 'candidate-v1',
      runs: { baseline, candidate },
      review: { status: 'human-reviewed', reviewer: 'human', reviewed_at: '2026-08-04T12:00:00Z' },
      comparisons: [{ case_id: 'architecture', dimension: 'clarity', verdict: 'candidate' }],
    }));
    const result = spawnSync(process.execPath, [CLI, '--benchmark', benchmarkPath, '--judgments', judgmentsPath, '--json'], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).status, 'invalid-human-review');
    assert.match(JSON.parse(result.stdout).problems.join('\n'), /artifact sha256 does not match/);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test('a run cannot substitute stale screenshots from a different artifact', () => {
  const workDir = mkdtempSync(join(tmpdir(), 'artifacture-product-benchmark-'));
  try {
    const benchmark = { schema_version: 1, id: 'representative-artifacts-v1', cases: [{ id: 'architecture', task: 'architecture.md', profile: 'page', dimensions: ['clarity'] }] };
    const benchmarkPath = join(workDir, 'benchmark.json');
    const judgmentsPath = join(workDir, 'judgments.json');
    writeFileSync(benchmarkPath, JSON.stringify(benchmark));
    const baseline = bindRun(workDir, benchmark, 'baseline', 'baseline-v1');
    const candidate = bindRun(workDir, benchmark, 'candidate', 'candidate-v1');
    const baselineManifest = JSON.parse(readFileSync(join(workDir, baseline.manifest), 'utf8'));
    const candidatePath = join(workDir, candidate.manifest);
    const candidateManifest = JSON.parse(readFileSync(candidatePath, 'utf8'));
    candidateManifest.cases[0].screenshots = baselineManifest.cases[0].screenshots;
    writeFileSync(candidatePath, JSON.stringify(candidateManifest));
    candidate.sha256 = digest(candidatePath);
    writeFileSync(judgmentsPath, JSON.stringify({
      benchmark_id: benchmark.id,
      baseline_run: 'baseline-v1',
      candidate_run: 'candidate-v1',
      runs: { baseline, candidate },
      review: { status: 'human-reviewed', reviewer: 'human', reviewed_at: '2026-08-04T12:00:00Z' },
      comparisons: [{ case_id: 'architecture', dimension: 'clarity', verdict: 'candidate' }],
    }));
    const result = spawnSync(process.execPath, [CLI, '--benchmark', benchmarkPath, '--judgments', judgmentsPath, '--json'], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'invalid-human-review');
    assert.match(report.problems.join('\n'), /screenshots do not match contract-bound evidence/);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test('the default product benchmark is explicitly pending until a human compares artifacts', () => {
  const result = spawnSync(process.execPath, [CLI, '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.benchmark_id, 'artifacture-product-v1');
  assert.equal(report.status, 'pending-human-review');
  assert.equal(report.cases, 6);
  assert.equal(report.comparisons, 0);
});

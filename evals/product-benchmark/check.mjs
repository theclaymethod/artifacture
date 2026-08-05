#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sha256 } from './run-manifest.mjs';
import { reviewContractSha256 } from '../../plugins/visual-explainer/scripts/verify/lib/report.mjs';

const BENCHMARK_ROOT = fileURLToPath(new URL('.', import.meta.url));

export function evaluateBenchmark(benchmark, judgments, runProblems = []) {
  const comparisons = judgments.comparisons || [];
  const acceptance = judgments.review?.acceptance || 'improvement';
  const expected = new Set(benchmark.cases.flatMap((benchmarkCase) =>
    benchmarkCase.dimensions.map((dimension) => `${benchmarkCase.id}\u0000${dimension}`)));
  const observed = new Set(
    comparisons.map((comparison) => `${comparison.case_id}\u0000${comparison.dimension}`),
  );
  const missing = benchmark.cases.flatMap((benchmarkCase) =>
    benchmarkCase.dimensions
      .filter((dimension) => !observed.has(`${benchmarkCase.id}\u0000${dimension}`))
      .map((dimension) => ({ case_id: benchmarkCase.id, dimension })));
  const regressions = comparisons
    .filter((comparison) => comparison.verdict === 'baseline')
    .map(({ case_id, dimension }) => ({ case_id, dimension }));
  const count = (verdict) => comparisons.filter((comparison) => comparison.verdict === verdict).length;
  const problems = [...runProblems];
  if (judgments.review?.status === 'human-reviewed') {
    if (!['improvement', 'non-regression'].includes(acceptance)) {
      problems.push('review.acceptance must be improvement or non-regression');
    }
    if (judgments.benchmark_id !== benchmark.id) problems.push('benchmark_id does not match benchmark');
    if (!judgments.baseline_run || !judgments.candidate_run || judgments.baseline_run === judgments.candidate_run) {
      problems.push('baseline_run and candidate_run must be distinct non-empty ids');
    }
    if (!String(judgments.review?.reviewer || '').trim()) problems.push('reviewer is required');
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(judgments.review?.reviewed_at || '') ||
      !Number.isFinite(Date.parse(judgments.review?.reviewed_at || ''))
    ) problems.push('reviewed_at must be an ISO timestamp');

    const seen = new Set();
    for (const comparison of comparisons) {
      const key = `${comparison.case_id}\u0000${comparison.dimension}`;
      const label = `${comparison.case_id}/${comparison.dimension}`;
      if (!expected.has(key)) problems.push(`unknown comparison: ${label}`);
      if (seen.has(key)) problems.push(`duplicate comparison: ${label}`);
      seen.add(key);
      if (!['candidate', 'baseline', 'tie'].includes(comparison.verdict)) problems.push(`invalid verdict for ${label}`);
    }
  }

  const report = {
    benchmark_id: benchmark.id,
    baseline_run: judgments.baseline_run ?? null,
    candidate_run: judgments.candidate_run ?? null,
    status: judgments.review?.status !== 'human-reviewed'
      ? 'pending-human-review'
      : problems.length
      ? 'invalid-human-review'
      : missing.length
      ? 'incomplete-human-review'
      : regressions.length
      ? 'regressed'
      : acceptance === 'improvement' && count('candidate') === 0
      ? 'no-improvement'
      : 'passed',
    cases: benchmark.cases.length,
    comparisons: comparisons.length,
    wins: count('candidate'),
    ties: count('tie'),
    losses: regressions.length,
    regressions,
  };
  if (missing.length) report.missing = missing;
  if (problems.length) report.problems = problems;
  return report;
}

function validateFileRef(ref, manifestPath, label, problems) {
  if (!ref?.path || !/^[a-f0-9]{64}$/.test(ref?.sha256 || '')) {
    problems.push(`${label} must include path and sha256`);
    return;
  }
  const path = resolve(dirname(manifestPath), ref.path);
  if (!existsSync(path)) problems.push(`${label} file is missing`);
  else if (sha256(path) !== ref.sha256) problems.push(`${label} sha256 does not match file`);
}

export function validateBoundRuns(benchmark, judgments, judgmentsPath, benchmarkPath = join(dirname(judgmentsPath), 'benchmark.json')) {
  const problems = [];
  const manifests = {};
  for (const role of ['baseline', 'candidate']) {
    const binding = judgments.runs?.[role];
    const expectedId = judgments[`${role}_run`];
    if (!binding?.manifest || !/^[a-f0-9]{64}$/.test(binding?.sha256 || '')) {
      problems.push(`${role} run must bind a manifest path and sha256`);
      continue;
    }
    const manifestPath = resolve(dirname(judgmentsPath), binding.manifest);
    if (!existsSync(manifestPath)) {
      problems.push(`${role} manifest is missing`);
      continue;
    }
    if (sha256(manifestPath) !== binding.sha256) problems.push(`${role} manifest sha256 does not match file`);
    let manifest;
    try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { problems.push(`${role} manifest is invalid JSON`); continue; }
    manifests[role] = manifest;
    if (manifest.benchmark_id !== benchmark.id) problems.push(`${role} manifest benchmark_id does not match benchmark`);
    if (manifest.run_id !== expectedId) problems.push(`${role} manifest run_id does not match ${role}_run`);
    const byId = new Map((manifest.cases || []).map((item) => [item.case_id, item]));
    if (byId.size !== (manifest.cases || []).length) problems.push(`${role} manifest has duplicate cases`);
    for (const benchmarkCase of benchmark.cases) {
      const item = byId.get(benchmarkCase.id);
      if (!item) { problems.push(`${role} manifest is missing case ${benchmarkCase.id}`); continue; }
      if (item.task !== basename(benchmarkCase.task || '', '.md')) problems.push(`${role}/${benchmarkCase.id} task does not match benchmark`);
      if (item.profile !== benchmarkCase.profile) problems.push(`${role}/${benchmarkCase.id} profile does not match benchmark`);
      validateFileRef(item.artifact, manifestPath, `${role}/${benchmarkCase.id} artifact`, problems);
      validateFileRef(item.report, manifestPath, `${role}/${benchmarkCase.id} report`, problems);
      const reportPath = resolve(dirname(manifestPath), item.report?.path || '');
      let reportData = null;
      try { reportData = JSON.parse(readFileSync(reportPath, 'utf8')); } catch { problems.push(`${role}/${benchmarkCase.id} report is invalid JSON`); }
      const contract = reportData?.review_contract;
      if (!contract || reviewContractSha256(contract) !== contract.sha256) problems.push(`${role}/${benchmarkCase.id} report review contract is invalid`);
      if (!contract?.complete) problems.push(`${role}/${benchmarkCase.id} report review contract is incomplete`);
      if (contract?.sha256 !== item.review_contract_sha256) problems.push(`${role}/${benchmarkCase.id} manifest does not bind report review contract`);
      if (contract?.artifact_sha256 !== item.artifact?.sha256) problems.push(`${role}/${benchmarkCase.id} report is not bound to artifact`);
      const taskPath = resolve(dirname(benchmarkPath), benchmarkCase.task);
      if (!existsSync(taskPath) || contract?.truth_sha256 !== sha256(taskPath) || item.truth_sha256 !== contract?.truth_sha256) {
        problems.push(`${role}/${benchmarkCase.id} report is not bound to benchmark truth`);
      }
      if (role === 'candidate' && Number(item.mechanics_errors) > 0) problems.push(`candidate/${benchmarkCase.id} has mechanics errors`);
      if (!Array.isArray(item.evidence) || JSON.stringify(item.evidence.map((entry) => entry.sha256)) !== JSON.stringify(contract?.evidence_sha256)) {
        problems.push(`${role}/${benchmarkCase.id} manifest evidence does not match report contract`);
      } else item.evidence.forEach((ref, index) => validateFileRef(ref, manifestPath, `${role}/${benchmarkCase.id} evidence ${index + 1}`, problems));
      if (!Array.isArray(item.screenshots) || item.screenshots.length === 0) {
        problems.push(`${role}/${benchmarkCase.id} has no screenshot evidence`);
      } else {
        const expectedScreenshots = (item.evidence || []).filter((ref) => /\.png$/i.test(ref.path || ''));
        const refIdentity = (refs) => refs.map(({ path, sha256: hash }) => ({ path, sha256: hash }));
        if (JSON.stringify(refIdentity(item.screenshots)) !== JSON.stringify(refIdentity(expectedScreenshots))) {
          problems.push(`${role}/${benchmarkCase.id} screenshots do not match contract-bound evidence`);
        }
        item.screenshots.forEach((ref, index) => validateFileRef(ref, manifestPath, `${role}/${benchmarkCase.id} screenshot ${index + 1}`, problems));
        if (!item.screenshots.some((ref) => /1440x900/.test(ref.path))) problems.push(`${role}/${benchmarkCase.id} lacks desktop screenshot evidence`);
        if (
          benchmarkCase.dimensions.includes('mobile-usability')
          && !item.screenshots.some((ref) => /390x844/.test(ref.path))
        ) problems.push(`${role}/${benchmarkCase.id} lacks mobile screenshot evidence`);
      }
    }
    for (const item of manifest.cases || []) {
      if (!benchmark.cases.some((benchmarkCase) => benchmarkCase.id === item.case_id)) problems.push(`${role} manifest has unknown case ${item.case_id}`);
    }
  }
  if (manifests.baseline && manifests.candidate) {
    const candidateById = new Map(manifests.candidate.cases.map((item) => [item.case_id, item]));
    for (const baseline of manifests.baseline.cases) {
      const candidate = candidateById.get(baseline.case_id);
      if (candidate && JSON.stringify(candidate.model) !== JSON.stringify(baseline.model)) {
        problems.push(`model differs between runs for ${baseline.case_id}`);
      }
    }
    const baselineById = new Map(manifests.baseline.cases.map((item) => [item.case_id, item]));
    for (const comparison of judgments.comparisons || []) {
      const baseline = baselineById.get(comparison.case_id);
      const candidate = candidateById.get(comparison.case_id);
      if (
        comparison.verdict !== 'tie'
        && baseline?.artifact?.sha256
        && baseline.artifact.sha256 === candidate?.artifact?.sha256
      ) problems.push(`non-tie verdict compares identical artifacts: ${comparison.case_id}/${comparison.dimension}`);
    }
  }
  return problems;
}

function valueFor(argv, flag, fallback) {
  const index = argv.indexOf(flag);
  if (index === -1) return fallback;
  if (!argv[index + 1]) throw new Error(`${flag} is required`);
  return argv[index + 1];
}

function main(argv = process.argv.slice(2)) {
  const benchmarkPath = resolve(valueFor(argv, '--benchmark', join(BENCHMARK_ROOT, 'benchmark.json')));
  const judgmentsPath = resolve(valueFor(argv, '--judgments', join(BENCHMARK_ROOT, 'judgments.pending.json')));
  const benchmark = JSON.parse(readFileSync(benchmarkPath, 'utf8'));
  const judgments = JSON.parse(readFileSync(judgmentsPath, 'utf8'));
  const runProblems = judgments.review?.status === 'human-reviewed'
    ? validateBoundRuns(benchmark, judgments, judgmentsPath, benchmarkPath)
    : [];
  const report = evaluateBenchmark(benchmark, judgments, runProblems);
  process.stdout.write(`${JSON.stringify(report, null, argv.includes('--json') ? 2 : 0)}\n`);
  process.exitCode = report.status === 'passed' ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    main();
  } catch (error) {
    console.error(error.message || String(error));
    process.exitCode = 2;
  }
}

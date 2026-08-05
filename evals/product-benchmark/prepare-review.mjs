#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sha256 } from './run-manifest.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

export function prepareReview({ benchmark, baselineManifest, candidateManifest }) {
  if (baselineManifest.benchmark_id !== benchmark.id || candidateManifest.benchmark_id !== benchmark.id) {
    throw new Error('both manifests must target the selected benchmark');
  }
  if (!baselineManifest.run_id || !candidateManifest.run_id || baselineManifest.run_id === candidateManifest.run_id) {
    throw new Error('baseline and candidate manifests require distinct run_id values');
  }
  const baselineByCase = new Map((baselineManifest.cases || []).map((entry) => [entry.case_id, entry]));
  const candidateByCase = new Map((candidateManifest.cases || []).map((entry) => [entry.case_id, entry]));
  const comparisons = [];
  const changedCases = [];
  for (const benchmarkCase of benchmark.cases) {
    const baseline = baselineByCase.get(benchmarkCase.id);
    const candidate = candidateByCase.get(benchmarkCase.id);
    if (!baseline?.artifact?.sha256 || !candidate?.artifact?.sha256) {
      throw new Error(`both manifests must contain artifact hashes for ${benchmarkCase.id}`);
    }
    if (baseline.artifact.sha256 === candidate.artifact.sha256) {
      comparisons.push(...benchmarkCase.dimensions.map((dimension) => ({
        case_id: benchmarkCase.id,
        dimension,
        verdict: 'tie',
        basis: 'byte-identical-artifact',
      })));
    } else changedCases.push(benchmarkCase.id);
  }
  return { comparisons, changedCases };
}

function valueFor(argv, flag, fallback = null) {
  const index = argv.indexOf(flag);
  if (index === -1) return fallback;
  if (!argv[index + 1]) throw new Error(`${flag} is required`);
  return argv[index + 1];
}

function main(argv = process.argv.slice(2)) {
  const benchmarkPath = resolve(valueFor(argv, '--benchmark', `${ROOT}/benchmark.json`));
  const baselinePath = resolve(valueFor(argv, '--baseline-manifest'));
  const candidatePath = resolve(valueFor(argv, '--candidate-manifest'));
  const output = resolve(valueFor(argv, '--output'));
  const acceptance = valueFor(argv, '--acceptance', 'improvement');
  if (!['improvement', 'non-regression'].includes(acceptance)) {
    throw new Error('--acceptance must be improvement or non-regression');
  }
  const benchmark = JSON.parse(readFileSync(benchmarkPath, 'utf8'));
  const baselineManifest = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const candidateManifest = JSON.parse(readFileSync(candidatePath, 'utf8'));
  const prepared = prepareReview({ benchmark, baselineManifest, candidateManifest });
  const review = {
    schema_version: 1,
    benchmark_id: benchmark.id,
    baseline_run: baselineManifest.run_id,
    candidate_run: candidateManifest.run_id,
    runs: {
      baseline: { manifest: relative(dirname(output), baselinePath), sha256: sha256(baselinePath) },
      candidate: { manifest: relative(dirname(output), candidatePath), sha256: sha256(candidatePath) },
    },
    review: { status: 'pending-human-review', acceptance, reviewer: null, reviewed_at: null },
    comparisons: prepared.comparisons,
  };
  writeFileSync(output, `${JSON.stringify(review, null, 2)}\n`);
  process.stdout.write(`Prepared ${review.comparisons.length} proven ties; human review remains for: ${prepared.changedCases.join(', ') || 'none'}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try { main(); } catch (error) { console.error(error.message || String(error)); process.exitCode = 2; }
}

#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { reviewContractSha256 } from '../../plugins/visual-explainer/scripts/verify/lib/report.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

export function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function fileRef(path, manifestPath) {
  return { path: relative(dirname(manifestPath), path), sha256: sha256(path), bytes: statSync(path).size };
}

export function buildRunManifest({ benchmark, benchmarkRoot = ROOT, runDir, model = 'codex', output, runId = basename(runDir) }) {
  const cases = benchmark.cases.map((benchmarkCase) => {
    const task = basename(benchmarkCase.task, '.md');
    const cell = join(runDir, model, task);
    const artifact = join(cell, 'artifact.html');
    const report = join(cell, 'report.json');
    const metaPath = join(cell, 'meta.json');
    for (const required of [artifact, report, metaPath]) {
      if (!existsSync(required)) throw new Error(`Missing benchmark run file: ${required}`);
    }
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    const reportData = JSON.parse(readFileSync(report, 'utf8'));
    const contract = reportData.review_contract;
    if (!contract || reviewContractSha256(contract) !== contract.sha256) throw new Error(`Invalid review contract for ${benchmarkCase.id}`);
    if (!contract.complete) throw new Error(`Incomplete review contract for ${benchmarkCase.id}`);
    if (contract.artifact_sha256 !== sha256(artifact)) throw new Error(`Report is not bound to artifact for ${benchmarkCase.id}`);
    const truthPath = resolve(benchmarkRoot, benchmarkCase.task);
    if (!existsSync(truthPath) || contract.truth_sha256 !== sha256(truthPath)) throw new Error(`Report is not bound to task truth for ${benchmarkCase.id}`);
    const evidence = contract.evidence.map((entry) => {
      if (!existsSync(entry.path) || sha256(entry.path) !== entry.sha256) throw new Error(`Stale review evidence for ${benchmarkCase.id}`);
      return fileRef(entry.path, output);
    });
    const screenshots = evidence.filter((entry) => /\.png$/i.test(entry.path));
    if (screenshots.length === 0) throw new Error(`No screenshots found for ${benchmarkCase.id}`);
    return {
      case_id: benchmarkCase.id,
      task,
      profile: benchmarkCase.profile,
      model: {
        slug: meta.model_slug,
        kind: meta.model_kind,
        id: meta.model_id ?? null,
      },
      prompt_sha256: meta.prompt?.sha256 ?? null,
      truth_sha256: contract.truth_sha256,
      review_contract_sha256: contract.sha256,
      mechanics_errors: Number(reportData.summary?.errors || 0),
      artifact: fileRef(artifact, output),
      report: fileRef(report, output),
      evidence,
      screenshots,
    };
  });
  return { schema_version: 1, benchmark_id: benchmark.id, run_id: runId, cases };
}

function valueFor(argv, flag, fallback = null) {
  const index = argv.indexOf(flag);
  if (index === -1) return fallback;
  if (!argv[index + 1]) throw new Error(`${flag} is required`);
  return argv[index + 1];
}

function main(argv = process.argv.slice(2)) {
  const benchmarkPath = resolve(valueFor(argv, '--benchmark', join(ROOT, 'benchmark.json')));
  const runDir = resolve(valueFor(argv, '--run-dir'));
  const output = resolve(valueFor(argv, '--output'));
  const benchmark = JSON.parse(readFileSync(benchmarkPath, 'utf8'));
  const manifest = buildRunManifest({
    benchmark,
    benchmarkRoot: dirname(benchmarkPath),
    runDir,
    output,
    model: valueFor(argv, '--model', 'codex'),
    runId: valueFor(argv, '--run-id', basename(runDir)),
  });
  writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${output}\nsha256 ${sha256(output)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try { main(); } catch (error) { console.error(error.message || String(error)); process.exitCode = 2; }
}

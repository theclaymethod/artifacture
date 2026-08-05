#!/usr/bin/env node
import crypto from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseHTML } from 'linkedom';
import { buildRenderedInventory, buildTruthRecord } from './lib/context.mjs';
import { reviewContractSha256 } from './lib/report.mjs';

export function finalizeReport(report, verdictBundle) {
  validateInputs(report, verdictBundle);
  const requiredPasses = report.llm_passes_required || [];
  const passes = verdictBundle.passes || [];
  const completedPasses = passes
    .filter((entry) => entry.status === 'pass' || entry.status === 'fail')
    .map((entry) => entry.pass);
  const completedSet = new Set(completedPasses);
  const missingPasses = requiredPasses.filter((pass) => !completedSet.has(pass));
  const findings = passes.flatMap((entry) => entry.findings || []);
  const failedPass = passes.some((entry) => entry.status === 'fail');
  const mechanicsFailed = Number(report.summary?.errors || 0) > 0;
  const evidenceMissing = report.review_contract.missing || [];
  const status = mechanicsFailed || failedPass || findings.length
    ? 'failed'
    : missingPasses.length || !report.review_contract.complete ? 'incomplete' : 'verified';

  return {
    ...report,
    verification: {
      status,
      required_passes: requiredPasses,
      completed_passes: completedPasses,
      missing_passes: missingPasses,
      evidence_missing: evidenceMissing,
      findings,
    },
  };
}

function validateInputs(report, verdictBundle) {
  const contract = report.review_contract;
  if (!/^[a-f0-9]{64}$/.test(contract?.sha256 || '')) {
    throw new Error('report requires a valid review_contract');
  }
  if (reviewContractSha256(contract) !== contract.sha256) {
    throw new Error('report review_contract identity is invalid');
  }
  if (
    contract.profile !== report.profile
    || contract.preset !== report.preset
    || JSON.stringify(contract.required_passes) !== JSON.stringify(report.llm_passes_required || [])
  ) throw new Error('report metadata does not match review_contract');
  const artifact = readFileSync(report.file);
  if (sha256(artifact) !== contract.artifact_sha256) throw new Error('artifact changed after review capture');
  const staticInventory = buildRenderedInventory(parseHTML(artifact.toString('utf8')).document);
  const inventory = contract.inventory_provenance === 'browser-rendered'
    ? contract.inventory
    : staticInventory;
  if (
    !['static', 'browser-rendered'].includes(contract.inventory_provenance)
    || !inventory?.items?.length
    || sha256(JSON.stringify(inventory.items)) !== contract.inventory_sha256
    || inventory.sha256 !== contract.inventory_sha256
    || inventory.sha256 !== contract.inventory?.sha256
  ) throw new Error('rendered inventory does not match artifact');
  let truth = null;
  if (contract.truth?.path) {
    const truthText = readFileSync(contract.truth.path, 'utf8');
    truth = buildTruthRecord(contract.truth.path, truthText);
    if (
      truth.sha256 !== contract.truth_sha256
      || truth.sha256 !== contract.truth.sha256
    ) throw new Error('truth brief changed after review capture');
  } else if (contract.truth_sha256) throw new Error('review contract truth identity is invalid');
  if (
    !Array.isArray(contract.evidence)
    || JSON.stringify(contract.evidence.map((entry) => entry.sha256)) !== JSON.stringify(contract.evidence_sha256)
  ) throw new Error('review evidence identity is invalid');
  for (const evidence of contract.evidence) {
    if (sha256(readFileSync(evidence.path)) !== evidence.sha256) throw new Error('review evidence changed after capture');
  }
  const expectedComplete = (contract.missing || []).length === 0
    && (truth?.claims.length || 0) > 0
    && inventory.items.length > 0
    && contract.evidence.length > 0;
  if (contract.complete !== expectedComplete) throw new Error('review contract completeness is inconsistent');
  if (verdictBundle?.schema_version !== 1 || !Array.isArray(verdictBundle.passes)) {
    throw new Error('verdict bundle requires schema_version=1 and passes[]');
  }
  if (verdictBundle.review_contract_sha256 !== report.review_contract.sha256) {
    throw new Error('verdict bundle does not match the report review contract');
  }
  const required = new Set(report.llm_passes_required || []);
  const seen = new Set();
  for (const entry of verdictBundle.passes) {
    if (!required.has(entry.pass)) throw new Error(`unknown verdict pass: ${entry.pass}`);
    if (seen.has(entry.pass)) throw new Error(`duplicate verdict pass: ${entry.pass}`);
    seen.add(entry.pass);
    if (!['pass', 'fail', 'skipped'].includes(entry.status)) throw new Error(`invalid verdict status for ${entry.pass}`);
    if (!Array.isArray(entry.findings)) throw new Error(`findings[] is required for ${entry.pass}`);
    if (entry.status === 'pass' && entry.findings.length) throw new Error(`passing verdict cannot contain findings: ${entry.pass}`);
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function valueFor(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1 || !argv[index + 1]) throw new Error(`${flag} is required`);
  return argv[index + 1];
}

function main(argv = process.argv.slice(2)) {
  const report = JSON.parse(readFileSync(valueFor(argv, '--report'), 'utf8'));
  const verdicts = JSON.parse(readFileSync(valueFor(argv, '--verdicts'), 'utf8'));
  const outPath = valueFor(argv, '--out');
  const finalReport = finalizeReport(report, verdicts);
  writeFileSync(outPath, `${JSON.stringify(finalReport, null, 2)}\n`);
  process.stdout.write(`${finalReport.verification.status}\n`);
  process.exitCode = finalReport.verification.status === 'verified' ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    main();
  } catch (error) {
    console.error(error.message || String(error));
    process.exitCode = 2;
  }
}

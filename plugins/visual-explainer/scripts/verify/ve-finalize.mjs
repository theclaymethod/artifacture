#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseReviewReport, parseVerdicts } from './lib/review-contract.mjs';

export function finalizeReport(report, verdictBundle) {
  report = parseReviewReport(report);
  verdictBundle = parseVerdicts(verdictBundle, report);
  const requiredPasses = report.llm_passes_required;
  const passes = verdictBundle.passes;
  const completedPasses = passes
    .filter((entry) => entry.status === 'pass' || entry.status === 'fail')
    .map((entry) => entry.pass);
  const completedSet = new Set(completedPasses);
  const missingPasses = requiredPasses.filter((pass) => !completedSet.has(pass));
  const findings = passes.flatMap((entry) => entry.findings || []);
  const failedPass = passes.some((entry) => entry.status === 'fail');
  const mechanicsFailed = report.summary.errors > 0;
  const evidenceMissing = report.review_contract.missing;
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

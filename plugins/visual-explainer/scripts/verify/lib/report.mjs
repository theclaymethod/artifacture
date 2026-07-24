import fs from 'node:fs/promises';

export function buildReport(ctx, checks, screenshots = []) {
  const summary = { errors: 0, warns: 0, skipped: 0, passed: 0 };
  for (const check of checks) {
    if (check.status === 'pass') summary.passed += 1;
    else if (check.status === 'skip' || check.status === 'skipped-static' || check.status === 'llm-required' || check.status === 'transcript') summary.skipped += 1;
    else if (check.status === 'unimplemented') summary.warns += 1;
    else if (check.status === 'warn') summary.warns += 1;
    else if (check.status === 'fail' && check.severity === 'error') summary.errors += 1;
    else if (check.status === 'fail') summary.warns += 1;
  }

  return {
    file: ctx.filePath,
    profile: ctx.profile,
    preset: ctx.preset,
    summary,
    checks,
    screenshots,
    llm_passes_required: llmPassesFor(ctx, checks),
  };
}

export async function writeJsonReport(report, outPath) {
  await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
}

export function printHumanReport(report, { quiet = false } = {}) {
  if (quiet) return;
  const failing = report.checks.filter((check) => ['fail', 'warn', 'unimplemented'].includes(check.status));
  console.log(`${report.file}`);
  console.log(`profile=${report.profile} preset=${report.preset} errors=${report.summary.errors} warns=${report.summary.warns} skipped=${report.summary.skipped} passed=${report.summary.passed}`);
  for (const check of failing.slice(0, 80)) {
    const where = check.where ? ` ${check.where}` : '';
    const evidence = check.evidence ? ` - ${check.evidence}` : '';
    console.log(`${check.status.toUpperCase().padEnd(13)} ${check.severity.padEnd(5)} ${check.id}${where}${evidence}`);
  }
  if (failing.length > 80) console.log(`... ${failing.length - 80} more findings`);
}

function llmPassesFor(ctx, checks) {
  const required = new Set();
  if (checks.some((check) => check.stage === 'llm-pass' && check.status === 'llm-required')) {
    const aesthetic = ctx.preset === 'custom' ? ctx.presetHint || 'custom' : ctx.preset;
    required.add('hierarchy');
    required.add(`aesthetic-${aesthetic}`);
    required.add('completeness');
    required.add('copy');
    if (['page', 'slides', 'magazine'].includes(ctx.profile)) required.add('visual-tells');
  }
  const hasReviewUnits =
    ['slides', 'magazine'].includes(ctx.profile) ||
    /data-ve-presentation/i.test(ctx.html) ||
    /<section(?:\s|>)/i.test(ctx.html);
  if (
    hasReviewUnits &&
    checks.some(
      (check) =>
        check.id === 'operating-model-fit' &&
        check.status === 'llm-required',
    )
  ) {
    required.add('operating-model');
  }
  return Array.from(required);
}

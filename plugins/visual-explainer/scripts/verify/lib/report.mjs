import fs from 'node:fs/promises';
import { buildReviewContract, parseMechanics } from './review-contract.mjs';
import { buildLlmDispatchPlan } from './model-policy.mjs';
import { detectReviewProfile } from './profile.mjs';

export function buildReport(ctx, checks, screenshots = []) {
  const effectiveChecks = ctx.htmlParseError
    ? [{
      id: 'artifact-html-parse',
      stage: 'static-dom',
      severity: 'error',
      status: 'fail',
      evidence: `HTML could not be parsed: ${ctx.htmlParseError}`,
      where: ctx.filePath,
      fix_hint: 'Repair the HTML so DOM verification can run.',
    }, ...checks]
    : checks;
  const { summary } = parseMechanics(effectiveChecks);

  const llmPasses = llmPassesFor(ctx);
  const reviewContract = buildReviewContract({ ...ctx, reviewProfile: ctx.reviewProfile || detectReviewProfile(ctx.mechanicsProfile || ctx.profile, ctx.html || '') }, effectiveChecks, screenshots, llmPasses);
  const mechanicsProfile = ctx.mechanicsProfile || ctx.profile;
  const reviewProfile = ctx.reviewProfile || detectReviewProfile(mechanicsProfile, ctx.html || '');
  return {
    file: ctx.filePath,
    profile: mechanicsProfile,
    mechanics_profile: mechanicsProfile,
    review_profile: reviewProfile,
    preset: ctx.preset,
    summary,
    checks: effectiveChecks,
    screenshots,
    llm_passes_required: llmPasses,
    llm_dispatch_plan: buildLlmDispatchPlan(llmPasses),
    review_contract: reviewContract,
  };
}

export async function writeJsonReport(report, outPath) {
  await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
}

export function printHumanReport(report, { quiet = false } = {}) {
  if (quiet) return;
  const failing = report.checks.filter((check) => ['fail', 'warn', 'unimplemented'].includes(check.status));
  console.log(`${report.file}`);
  console.log(`mechanics_profile=${report.mechanics_profile || report.profile} review_profile=${report.review_profile || report.profile} preset=${report.preset} errors=${report.summary.errors} warns=${report.summary.warns} skipped=${report.summary.skipped} passed=${report.summary.passed}`);
  for (const check of failing.slice(0, 80)) {
    const where = check.where ? ` ${check.where}` : '';
    const evidence = check.evidence ? ` - ${check.evidence}` : '';
    console.log(`${check.status.toUpperCase().padEnd(13)} ${check.severity.padEnd(5)} ${check.id}${where}${evidence}`);
  }
  if (failing.length > 80) console.log(`... ${failing.length - 80} more findings`);
  const fallbacks = (report.llm_dispatch_plan || []).filter(
    (entry) => entry.owner === 'artifacture' && entry.status === 'fallback-required',
  );
  if (fallbacks.length > 0) {
    console.log(`LLM ROUTES     ${fallbacks.length} Artifacture pass(es) require a disclosed best-available fallback`);
  }
}

function llmPassesFor(ctx) {
  const required = new Set();
  const mechanicsProfile = ctx.mechanicsProfile || ctx.profile;
  const reviewProfile = ctx.reviewProfile || detectReviewProfile(mechanicsProfile, ctx.html || '');
  if (['page', 'slides', 'magazine', 'poster', 'video-comp'].includes(reviewProfile)) {
    required.add(`artifact-review:${reviewProfile}`);
  }
  if (declaresCheck(ctx.html || '', ['impeccable', 'impeccable:critique'])) required.add('impeccable:critique');
  if (declaresCheck(ctx.html || '', ['unslop', 'unslop:cleanup', 'unslop:cleanup-report'])) required.add('unslop:cleanup-report');
  if (declaresCheck(ctx.html || '', ['artifacture:slop-gap'])) {
    required.add('artifacture:slop-gap');
  }
  return Array.from(required);
}

function declaresCheck(html, acceptedTokens) {
  for (const match of html.matchAll(/\bdata-ve-checks\s*=\s*["']([^"']+)["']/gi)) {
    const tokens = match[1]
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean);
    if (acceptedTokens.some((token) => tokens.includes(token))) return true;
  }
  return false;
}

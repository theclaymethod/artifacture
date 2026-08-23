import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
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
  const summary = { errors: 0, warns: 0, skipped: 0, passed: 0 };
  for (const check of effectiveChecks) {
    if (check.status === 'pass') summary.passed += 1;
    else if (check.status === 'skip' || check.status === 'skipped-static') summary.skipped += 1;
    else if (check.status === 'unimplemented') summary.warns += 1;
    else if (check.status === 'warn') summary.warns += 1;
    else if (check.status === 'fail' && check.severity === 'error') summary.errors += 1;
    else if (check.status === 'fail') summary.warns += 1;
  }

  const llmPasses = llmPassesFor(ctx);
  const reviewContract = buildReviewContract(ctx, screenshots, llmPasses);
  const mechanicsProfile = ctx.mechanicsProfile || ctx.profile;
  const reviewProfile = ctx.reviewProfile || detectReviewProfile(mechanicsProfile, ctx.html || '');
  return {
    file: ctx.filePath,
    // Legacy alias: mechanics profile.
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

function buildReviewContract(ctx, screenshots, requiredPasses) {
  const mechanicsProfile = ctx.mechanicsProfile || ctx.profile;
  const reviewProfile = ctx.reviewProfile || detectReviewProfile(mechanicsProfile, ctx.html || '');
  const deckManifests = (ctx.browser?.runs || [])
    .map((run) => run.deckReview?.manifestPath)
    .filter(Boolean);
  const evidence = [...screenshots, ...deckManifests].map((filePath) => ({
    path: filePath,
    sha256: hashFile(filePath),
  }));
  const missing = [];
  if (!ctx.truth?.sha256 || !ctx.truth?.claims?.length) missing.push('truth-brief');
  if (!ctx.renderedInventory?.items?.length) missing.push('rendered-inventory');
  if (screenshots.length === 0) missing.push('screenshots');
  if (reviewProfile === 'slides' && deckManifests.length === 0) missing.push('paired-deck-manifest');

  const contract = {
    schema_version: 1,
    artifact_sha256: sha256(ctx.html || ''),
    mechanics_profile: mechanicsProfile,
    review_profile: reviewProfile,
    // Legacy alias: review profile.
    profile: reviewProfile,
    preset: ctx.preset,
    truth_sha256: ctx.truth?.sha256 || null,
    inventory_sha256: ctx.renderedInventory?.sha256 || null,
    inventory_provenance: ctx.renderedInventory?.provenance || null,
    evidence_sha256: evidence.map((entry) => entry.sha256),
    required_passes: requiredPasses,
  };
  return {
    ...contract,
    sha256: reviewContractSha256(contract),
    complete: missing.length === 0 && evidence.every((entry) => entry.sha256),
    missing,
    truth: ctx.truth,
    inventory: ctx.renderedInventory,
    evidence,
  };
}

export function reviewContractIdentity(contract) {
  const identity = {
    schema_version: contract.schema_version,
    artifact_sha256: contract.artifact_sha256,
    profile: contract.profile,
    preset: contract.preset,
    truth_sha256: contract.truth_sha256,
    inventory_sha256: contract.inventory_sha256,
    inventory_provenance: contract.inventory_provenance,
    evidence_sha256: contract.evidence_sha256,
    required_passes: contract.required_passes,
  };
  // Preserve the identity of legacy reports while binding explicit profile
  // semantics for newly generated contracts.
  if ('mechanics_profile' in contract) identity.mechanics_profile = contract.mechanics_profile;
  if ('review_profile' in contract) identity.review_profile = contract.review_profile;
  return identity;
}

export function reviewContractSha256(contract) {
  return sha256(JSON.stringify(reviewContractIdentity(contract)));
}

function hashFile(filePath) {
  try {
    return sha256(readFileSync(filePath));
  } catch {
    return null;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
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

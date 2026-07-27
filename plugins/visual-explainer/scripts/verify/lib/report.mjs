import fs from 'node:fs/promises';
import { buildLlmDispatchPlan } from './model-policy.mjs';

// Artifacture extracts evidence and delegates general craft/prose judgment to
// the installed skills that own it. These ids are routing signals, not a second
// implementation of Impeccable or Unslop.
const IMPECCABLE_CRITIQUE_CANDIDATE_IDS = new Set([
  'forbidden-body-font',
  'forbidden-accent-colors',
  'forbidden-gradient-text-headings',
  'forbidden-glow-pulse-animations',
  'no-emoji-in-ui-chrome',
  'no-three-dot-window-chrome',
  'prose-accent-overuse',
  'gradient-hero-background',
  'decorative-blur-orbs',
  'glassmorphism-default-surface',
  'nested-cards',
  'side-stripe-border',
  'cream-sand-background',
  'reflex-reject-fonts',
  'rainbow-accent-palette',
  'scroll-reveal-spam',
  'bounce-elastic-easing',
  'fake-loading-theater',
  'mixed-icon-systems',
  'inline-emoji-bullets',
  'copy-paste-drop-shadow',
  'uniform-descriptor-gloss',
  'hero-metric-template',
  'card-as-universal-wrapper',
  'decorative-svg-sparing-use',
  'font-pairing-same-classification',
  'default-accent-reflex',
]);

const UNSLOP_CANDIDATE_IDS = new Set([
  'unslop-prose-phrases',
  'copy-slop-phrases',
  'unslop-prose-style',
  'title-claim-function',
  'copy-redundancy',
  'jargon-undefined',
]);

const DELEGATED_CANDIDATE_IDS = new Set([
  ...IMPECCABLE_CRITIQUE_CANDIDATE_IDS,
  ...UNSLOP_CANDIDATE_IDS,
]);

export function delegatedOwnerForCheck(id) {
  if (IMPECCABLE_CRITIQUE_CANDIDATE_IDS.has(id)) return 'impeccable';
  if (UNSLOP_CANDIDATE_IDS.has(id)) return 'unslop';
  return null;
}

export function buildReport(ctx, checks, screenshots = []) {
  const summary = { errors: 0, warns: 0, skipped: 0, passed: 0 };
  for (const check of checks) {
    if (check.status === 'pass') summary.passed += 1;
    else if (check.status === 'skip' || check.status === 'skipped-static' || check.status === 'llm-required' || check.status === 'transcript' || check.status === 'delegated-candidate') summary.skipped += 1;
    else if (check.status === 'unimplemented') summary.warns += 1;
    else if (check.status === 'warn') summary.warns += 1;
    else if (check.status === 'fail' && check.severity === 'error') summary.errors += 1;
    else if (check.status === 'fail') summary.warns += 1;
  }

  const llmPasses = llmPassesFor(ctx, checks);
  return {
    file: ctx.filePath,
    profile: ctx.profile,
    preset: ctx.preset,
    summary,
    checks,
    screenshots,
    llm_passes_required: llmPasses,
    llm_dispatch_plan: buildLlmDispatchPlan(llmPasses),
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
  const blocked = (report.llm_dispatch_plan || []).filter(
    (entry) => entry.owner === 'artifacture' && entry.status !== 'ready',
  );
  if (blocked.length > 0) {
    console.log(`LLM ROUTES     ${blocked.length} Artifacture pass(es) skipped: no eval-qualified model`);
  }
}

function llmPassesFor(ctx, checks) {
  const required = new Set();
  if (
    checks.some(
      (check) =>
        check.stage === 'llm-pass' &&
        check.status === 'llm-required' &&
        !DELEGATED_CANDIDATE_IDS.has(check.id),
    )
  ) {
    const aesthetic = ctx.preset === 'custom' ? ctx.presetHint || 'custom' : ctx.preset;
    required.add('hierarchy');
    if (aesthetic !== 'custom') required.add(`aesthetic-${aesthetic}`);
    required.add('completeness');
  }
  if (checks.some((check) => check.id.startsWith('diagram-') && check.status === 'llm-required')) {
    required.add('diagram');
  }
  if (checks.some((check) => check.id.startsWith('poster-') && check.status === 'llm-required')) {
    required.add('poster');
  }
  if (shouldDelegate(ctx, checks, IMPECCABLE_CRITIQUE_CANDIDATE_IDS, ['impeccable', 'impeccable:critique'])) {
    required.add('impeccable:critique');
  }
  if (shouldDelegate(ctx, checks, UNSLOP_CANDIDATE_IDS, ['unslop', 'unslop:cleanup', 'unslop:cleanup-report'])) {
    required.add('unslop:cleanup-report');
  }
  if (declaresCheck(ctx.html || '', ['artifacture:slop-gap'])) {
    required.add('artifacture:slop-gap');
  }
  const hasDeckReviewUnits =
    ctx.profile === 'slides' ||
    /data-ve-presentation/i.test(ctx.html || '');
  if (hasDeckReviewUnits) required.add('deck-review');
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

function shouldDelegate(ctx, checks, candidateIds, explicitTokens) {
  if (
    candidateIds === IMPECCABLE_CRITIQUE_CANDIDATE_IDS &&
    !['page', 'slides', 'magazine', 'poster'].includes(ctx.profile)
  ) return false;
  if (declaresCheck(ctx.html || '', explicitTokens)) return true;
  return checks.some(
    (check) =>
      candidateIds.has(check.id) &&
      ['warn', 'fail', 'llm-required', 'delegated-candidate'].includes(check.status),
  );
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

#!/usr/bin/env node
// Regression suite for the 31 llm-pass/transcript catalog checks that
// evals/run.mjs cannot exercise (it filters to static-text/static-dom/browser
// stages by design — see plans/007-DESIGN-NOTE.md for why).
//
// Mechanism (design note, mechanism A "stub judge" + one real-algorithm
// exception): the production verifier never calls a model in-process — see
// engine.mjs's stage handling for llm-pass/transcript, which only marks a
// status without invoking anything. The actual model call happens outside
// this codebase, via a Task-agent protocol that reads a rubric file and
// returns a JSON verdict `{pass, findings:[{check_id, evidence, fix}]}`
// (schema repeated verbatim across every file in scripts/verify/rubrics/).
// Since there is no existing parser for that verdict shape to reuse or
// stub, this runner owns a small purpose-built version of it, scoped
// entirely to evals/ — it does not modify the verifier.
//
// Two fixture families, mirroring evals/run.mjs's fixture/expectation split:
//   1. Canned-judge checks (5 of the 6): evals/fixtures/rubrics/<id>/{fire,clean}.json
//      each holding a canned judge_response. deriveStatus() below is the
//      plumbing under test: does a finding tagged with this check's id
//      correctly flip it to fail (per its checks.json severity), and does
//      an empty findings list correctly leave it passing.
//   2. reel-caption-matches-transcript: implements the REAL deterministic
//      word-overlap scorer from checks.json's spec/impl_hint (the common
//      case needs no model at all; only the 85-90% borderline band would
//      need an LLM tie-break, which this runner does not exercise).

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport } from '../plugins/visual-explainer/scripts/verify/lib/report.mjs';

const EVAL_ROOT = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(EVAL_ROOT, '..');
const RUBRICS_FIXTURES_ROOT = join(EVAL_ROOT, 'fixtures', 'rubrics');
const OPERATING_MODEL_ROUTING_CASES = join(
  RUBRICS_FIXTURES_ROOT,
  'operating-model-fit',
  'routing-cases.jsonl',
);

const checksCatalog = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'plugins/visual-explainer/scripts/verify/checks.json'), 'utf8'),
).checks;

const severityById = new Map(checksCatalog.map((check) => [check.id, check.severity]));

// The first implementation slice from plan 007 step 3, extended with the
// operating-model routing contract: 7 checks. The
// 13 error-severity uncovered checks are the priority pool this was drawn
// from. `mode: 'stub'` checks are asserted via deriveStatus() against a
// canned judge_response fixture; `mode: 'algorithm'` runs the real scorer.
const SLICE = [
  { id: 'text-visibly-clipped', mode: 'stub' },
  { id: 'fixed-ui-obscures-content', mode: 'stub' },
  { id: 'diagram-type-coherent', mode: 'stub' },
  { id: 'preset-both-mode-visual', mode: 'stub' },
  { id: 'deck-content-completeness', mode: 'stub' },
  { id: 'title-claim-function', mode: 'stub' },
  { id: 'operating-model-fit', mode: 'stub' },
  { id: 'reel-caption-matches-transcript', mode: 'algorithm' },
];

// --- Mechanism A plumbing: verdict -> check status -------------------------
// Mirrors the actionable-result-to-status logic engine.mjs:64-75 applies to
// static-text/static-dom/browser results, adapted for a rubric verdict
// instead of a stage implementation's return value.
export function deriveStatus(checkId, judgeResponse, severity) {
  if (!judgeResponse || !Array.isArray(judgeResponse.findings)) {
    throw new Error(`malformed judge response for ${checkId}: missing findings array`);
  }
  const finding = judgeResponse.findings.find((entry) => entry.check_id === checkId);
  if (!finding) return { status: 'pass', evidence: 'ok' };
  const status = severity === 'warn' ? 'warn' : 'fail';
  return { status, evidence: finding.evidence || '', fix_hint: finding.fix || '' };
}

function runStubCheck(id) {
  const severity = severityById.get(id);
  if (!severity) throw new Error(`checks.json has no entry for ${id} (catalog drift?)`);
  const dir = join(RUBRICS_FIXTURES_ROOT, id);
  const rows = [];
  for (const caseName of ['fire', 'clean']) {
    const fixturePath = join(dir, `${caseName}.json`);
    if (!existsSync(fixturePath)) {
      rows.push({ id, caseName, status: 'error', message: `missing fixture ${fixturePath}` });
      continue;
    }
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    const result = deriveStatus(id, fixture.judge_response, severity);
    const expected = caseName === 'fire' ? (severity === 'warn' ? 'warn' : 'fail') : 'pass';
    const pass = result.status === expected;
    rows.push({
      id,
      caseName,
      status: pass ? 'pass' : 'FAIL',
      message: pass ? `derived=${result.status}` : `expected=${expected} derived=${result.status}`,
    });
  }
  return rows;
}

// --- Real algorithm: word-overlap scorer for caption vs. transcript --------
// Per checks.json's impl_hint: "Normalize both streams; sliding-window
// overlap ratio per caption." A full sliding-window implementation is
// overkill for proving the plumbing works; a multiset overlap ratio over
// normalized words is a faithful, order-tolerant approximation of the same
// idea and is what's implemented here.
const OVERLAP_THRESHOLD = 0.9;

export function normalizeWords(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function overlapRatio(captionWords, transcriptWords) {
  if (captionWords.length === 0) return 1;
  const pool = [...transcriptWords];
  let matched = 0;
  for (const word of captionWords) {
    const idx = pool.indexOf(word);
    if (idx !== -1) {
      matched += 1;
      pool.splice(idx, 1);
    }
  }
  return matched / captionWords.length;
}

function runTranscriptCheck(id) {
  const severity = severityById.get(id);
  if (!severity) throw new Error(`checks.json has no entry for ${id} (catalog drift?)`);
  const dir = join(RUBRICS_FIXTURES_ROOT, id);
  const rows = [];
  for (const caseName of ['fire', 'clean']) {
    const captionsPath = join(dir, caseName, 'captions.json');
    const transcriptPath = join(dir, caseName, 'transcript.json');
    if (!existsSync(captionsPath) || !existsSync(transcriptPath)) {
      rows.push({ id, caseName, status: 'error', message: `missing fixture under ${join(dir, caseName)}` });
      continue;
    }
    const { segments } = JSON.parse(readFileSync(captionsPath, 'utf8'));
    const { words } = JSON.parse(readFileSync(transcriptPath, 'utf8'));
    const captionText = segments.map((segment) => segment.text).join(' ');
    const captionWords = normalizeWords(captionText);
    const transcriptWords = words.map((word) => normalizeWords(word.text)[0]).filter(Boolean);
    const ratio = overlapRatio(captionWords, transcriptWords);
    const derivedStatus = ratio < OVERLAP_THRESHOLD ? (severity === 'warn' ? 'warn' : 'fail') : 'pass';
    const expected = caseName === 'fire' ? (severity === 'warn' ? 'warn' : 'fail') : 'pass';
    const pass = derivedStatus === expected;
    rows.push({
      id,
      caseName,
      status: pass ? 'pass' : 'FAIL',
      message: pass
        ? `ratio=${ratio.toFixed(2)} derived=${derivedStatus}`
        : `expected=${expected} derived=${derivedStatus} ratio=${ratio.toFixed(2)}`,
    });
  }
  return rows;
}

// --- Operating-model contract: routing set + section pass selection --------

function readJsonl(path) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${path}:${index + 1}: ${error.message}`);
      }
    });
}

function runOperatingModelRoutingCases() {
  const allowedTreatments = new Set([
    'none',
    'relational',
    'operating-model',
    'simulated-surface',
  ]);
  const allowedUnitTypes = new Set(['slide', 'section']);
  const cases = readJsonl(OPERATING_MODEL_ROUTING_CASES);
  const seenIds = new Set();
  const rows = [];

  for (const fixture of cases) {
    const errors = [];
    if (!fixture.id || seenIds.has(fixture.id)) errors.push('id must be present and unique');
    if (!allowedUnitTypes.has(fixture.unit_type)) errors.push('unit_type must be slide or section');
    if (!allowedTreatments.has(fixture.expected_treatment)) errors.push('invalid expected_treatment');
    if (typeof fixture.expected_applicable !== 'boolean') errors.push('expected_applicable must be boolean');
    if (fixture.expected_applicable !== (fixture.expected_treatment !== 'none')) {
      errors.push('expected_applicable must be false only for treatment=none');
    }
    if (!fixture.narrative_job || !fixture.visible_claim || !fixture.rationale) {
      errors.push('narrative_job, visible_claim, and rationale are required');
    }
    seenIds.add(fixture.id);
    rows.push({
      id: 'operating-model-routing-case',
      caseName: fixture.id || 'missing-id',
      status: errors.length ? 'FAIL' : 'pass',
      message: errors.length
        ? errors.join('; ')
        : `${fixture.unit_type} -> ${fixture.expected_treatment}`,
    });
  }

  const coverageAssertions = [
    ['covers-slide-units', cases.some((fixture) => fixture.unit_type === 'slide')],
    ['covers-section-units', cases.some((fixture) => fixture.unit_type === 'section')],
    ...Array.from(allowedTreatments, (treatment) => [
      `covers-${treatment}`,
      cases.some((fixture) => fixture.expected_treatment === treatment),
    ]),
  ];
  for (const [caseName, pass] of coverageAssertions) {
    rows.push({
      id: 'operating-model-routing-coverage',
      caseName,
      status: pass ? 'pass' : 'FAIL',
      message: pass ? 'covered' : 'missing',
    });
  }
  return rows;
}

function runOperatingModelPassSelectionCases() {
  const operatingModelCheck = {
    id: 'operating-model-fit',
    stage: 'llm-pass',
    status: 'llm-required',
    severity: 'warn',
  };
  const cases = [
    {
      name: 'sectioned-page',
      ctx: { profile: 'page', preset: 'custom', presetHint: '', html: '<main><section>Case review</section></main>', filePath: 'sectioned.html' },
      expected: true,
    },
    {
      name: 'simple-page',
      ctx: { profile: 'page', preset: 'custom', presetHint: '', html: '<main><div>One statement</div></main>', filePath: 'simple.html' },
      expected: false,
    },
    {
      name: 'vertical-deck',
      ctx: { profile: 'slides', preset: 'custom', presetHint: '', html: '<main></main>', filePath: 'slides.html' },
      expected: true,
    },
    {
      name: 'presentation-stage',
      ctx: { profile: 'page', preset: 'custom', presetHint: '', html: '<main data-ve-presentation></main>', filePath: 'stage.html' },
      expected: true,
    },
  ];

  return cases.map(({ name, ctx, expected }) => {
    const report = buildReport(ctx, [operatingModelCheck]);
    const actual = report.llm_passes_required.includes('operating-model');
    return {
      id: 'operating-model-pass-selection',
      caseName: name,
      status: actual === expected ? 'pass' : 'FAIL',
      message: `expected=${expected} actual=${actual}`,
    };
  });
}

// --- Driver ------------------------------------------------------------

const catalogIds = new Set(checksCatalog.map((check) => check.id));
const missingFromCatalog = SLICE.filter((entry) => !catalogIds.has(entry.id));
if (missingFromCatalog.length) {
  console.error(`Slice references ids not present in checks.json: ${missingFromCatalog.map((e) => e.id).join(', ')}`);
  process.exit(2);
}

const allRows = [];
for (const entry of SLICE) {
  const rows = entry.mode === 'algorithm' ? runTranscriptCheck(entry.id) : runStubCheck(entry.id);
  allRows.push(...rows);
}
allRows.push(...runOperatingModelRoutingCases());
allRows.push(...runOperatingModelPassSelectionCases());

console.log('check_id,case,status,detail');
for (const row of allRows) {
  console.log(`${row.id},${row.caseName},${row.status},${row.message}`);
}

const failures = allRows.filter((row) => row.status !== 'pass');
if (failures.length) {
  console.error('\nFailures:');
  for (const failure of failures) {
    console.error(`- ${failure.id} (${failure.caseName}): ${failure.message}`);
  }
  process.exit(1);
}

const checksCovered = new Set(allRows.map((row) => row.id)).size;
console.log(`\nAll ${allRows.length} assertions passed across ${checksCovered} check families.`);

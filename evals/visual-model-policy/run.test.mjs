import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  appendRawRecord,
  buildBatchRequest,
  buildExperimentPlan,
  criterionPromptFor,
  evaluateProviderResponse,
  runExperiment,
} from './run.mjs';

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'artifacture-visual-run-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const imagePath = path.join(dir, 'layout:clip:fire.png');
  await fs.writeFile(imagePath, Buffer.from('not-a-real-png'));
  return {
    dir,
    case: {
      case_id: 'layout:clip:fire',
      state_id: 'layout:clip:fire',
      family: 'layout',
      criterion_id: 'text-visibly-clipped',
      human_label: 'fire',
      hard_negative: false,
      image: { id: 'layout:clip:fire', path: imagePath, detail: 'high' },
      regions: [{ id: 'mobile-heading', label: 'Mobile heading' }],
      visible_text: 'A heading is visibly chopped',
      truth_excerpt: 'The full heading must remain readable.',
      adjudication_notes: 'Characters are cut off without an intentional ellipsis.',
    },
  };
}

test('batch requests put immutable evidence before one criterion suffix and hide labels', async (t) => {
  const { case: evalCase } = await fixture(t);
  const request = await buildBatchRequest({
    provider: 'test-provider',
    model: 'test-small',
    imageDetail: 'high',
    pass: 'layout',
    criterionId: 'text-visibly-clipped',
    criterionPrompt: 'Judge only visible text clipping.',
    cases: [evalCase],
  });

  assert.equal(request.prefix_manifest.images[0].id, evalCase.image.id);
  assert.deepEqual(Object.keys(request.prefix), [
    'tools_json',
    'system_text',
    'shared_instructions',
    'design_system_text',
    'images',
  ]);
  assert.equal(request.suffix.pass, 'layout');
  assert.deepEqual(request.suffix.criteria, ['text-visibly-clipped']);
  assert.equal(request.suffix.cases[0].state_id, evalCase.state_id);
  assert.equal(JSON.stringify(request).includes('human_label'), false);
  assert.equal(JSON.stringify(request).includes('adjudication_notes'), false);
});

test('the committed corpus uses label-blind evidence ids', async () => {
  const { expandCorpus, loadCorpus } = await import('./corpus.mjs');
  const cases = expandCorpus(await loadCorpus());
  assert.equal(cases.some((entry) => /fire|clean/.test(entry.case_id)), false);
  assert.equal(cases.some((entry) => /fire|clean/.test(entry.image.id)), false);
});

test('provider verdicts are scored only when they use stable image and region ids', async (t) => {
  const { case: evalCase } = await fixture(t);
  const response = {
    raw_text: JSON.stringify({
      verdicts: [{
        state_id: evalCase.state_id,
        pass: false,
        findings: [{
          check_id: 'text-visibly-clipped',
          image_id: evalCase.image.id,
          region_id: 'mobile-heading',
          evidence: 'The final characters are cut by the right edge.',
          fix: 'Allow wrapping.',
        }],
      }],
    }),
    telemetry: {
      latency_ms: 120,
      time_to_first_token_ms: 40,
      input_tokens: 200,
      cache_read_tokens: 150,
      cache_write_tokens: 0,
      output_tokens: 40,
      actual_cost_usd: 0.0002,
    },
  };

  const evaluated = evaluateProviderResponse({
    response,
    cases: [evalCase],
    criterionId: 'text-visibly-clipped',
  });
  assert.equal(evaluated.json_valid, true);
  assert.equal(evaluated.observations[0].predicted_label, 'fire');
  assert.equal(evaluated.observations[0].grounded, true);

  const ungrounded = evaluateProviderResponse({
    response: {
      ...response,
      raw_text: response.raw_text.replace('mobile-heading', 'unknown-region'),
    },
    cases: [evalCase],
    criterionId: 'text-visibly-clipped',
  });
  assert.equal(ungrounded.observations[0].grounded, false);

  const foreignState = evaluateProviderResponse({
    response: {
      ...response,
      raw_text: JSON.stringify({
        verdicts: [
          ...JSON.parse(response.raw_text).verdicts,
          {
            state_id: 'foreign-state',
            pass: true,
            findings: [],
          },
        ],
      }),
    },
    cases: [evalCase],
    criterionId: 'text-visibly-clipped',
  });
  assert.equal(foreignState.json_valid, false);
  assert.match(foreignState.observations[0].validation_error, /unknown state_id/);
});

test('raw record writes append and never replace earlier measurements', async (t) => {
  const { dir } = await fixture(t);
  const recordsPath = path.join(dir, 'records.jsonl');
  await appendRawRecord(recordsPath, { schema_version: 1, request_id: 'request-1' });
  await appendRawRecord(recordsPath, { schema_version: 1, request_id: 'request-2' });
  const lines = (await fs.readFile(recordsPath, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(lines.map((line) => line.request_id), ['request-1', 'request-2']);
});

test('criterion suffix extraction excludes sibling family questions', () => {
  const rubric = `Questions:
- [text-visibly-clipped] Is text cut off?
- [layout-repeated-track-symmetry] Do peer tracks drift?

Verdict JSON schema: {...}`;
  const prompt = criterionPromptFor(rubric, 'text-visibly-clipped');
  assert.match(prompt, /Is text cut off/);
  assert.doesNotMatch(prompt, /peer tracks drift/);
});

test('the staged ladder runs one candidate and wraps randomized tails into full batches', () => {
  const cases = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
    case_id: id,
    family: 'layout',
    criterion_id: 'text-visibly-clipped',
    rubric: '/rubric.md',
  }));
  const plan = buildExperimentPlan({
    run_candidate: 'nano',
    candidates: [
      { id: 'nano', provider: 'test', rank: 1, class: 'small' },
      { id: 'frontier', provider: 'test', rank: 2, class: 'large' },
    ],
    batch_sizes: [4],
    replicates: 1,
    image_detail: 'high',
  }, cases);
  assert.equal(plan.length, 2);
  assert.equal(plan[0].model, 'nano');
  assert.equal(plan.every((entry) => entry.actual_batch_size === 4), true);
  assert.equal(plan.every((entry) => new Set(entry.cases).size === 4), true);
  assert.deepEqual(
    [...new Set(plan.flatMap((entry) => entry.cases.map((item) => item.case_id)))].sort(),
    ['a', 'b', 'c', 'd', 'e'],
  );
});

test('the candidate ladder enforces smallest-first progress and stops after escalation', () => {
  const cases = ['fire-a', 'clean-a'].map((id) => ({
    case_id: id,
    family: 'layout',
    criterion_id: 'text-visibly-clipped',
    rubric: '/rubric.md',
  }));
  const candidates = [
    { id: 'nano', provider: 'test', rank: 1, class: 'small' },
    { id: 'mini', provider: 'test', rank: 2, class: 'medium' },
    { id: 'frontier', provider: 'test', rank: 3, class: 'large' },
  ];
  assert.throws(
    () => buildExperimentPlan({
      id: 'ladder',
      run_candidate: 'mini',
      candidates,
      batch_sizes: [1],
      replicates: 1,
      image_detail: 'high',
    }, cases),
    /next smallest untested candidate nano/,
  );
  assert.doesNotThrow(() => buildExperimentPlan({
    id: 'ladder',
    run_candidate: 'mini',
    candidates,
    ladder_state: {
      completed_candidates: [{
        id: 'nano',
        pass_evidence: {
          layout: { status: 'qualified', evidence_sha256: 'a'.repeat(64) },
        },
      }],
    },
    batch_sizes: [1],
    replicates: 1,
    image_detail: 'high',
  }, cases));
  assert.throws(
    () => buildExperimentPlan({
      id: 'ladder',
      run_candidate: 'frontier',
      candidates,
      ladder_state: {
        completed_candidates: [
          {
            id: 'nano',
            pass_evidence: {
              layout: { status: 'qualified', evidence_sha256: 'a'.repeat(64) },
            },
          },
          {
            id: 'mini',
            pass_evidence: {
              layout: { status: 'qualified', evidence_sha256: 'b'.repeat(64) },
            },
          },
        ],
      },
      batch_sizes: [1],
      replicates: 1,
      image_detail: 'high',
    }, cases),
    /stop its ladder/,
  );
});

test('an unknown pass cannot become an empty successful experiment', async () => {
  const { loadCorpus } = await import('./corpus.mjs');
  const corpus = await loadCorpus();
  await assert.rejects(
    () => runExperiment({
      experiment: {
        id: 'unknown-pass',
        corpus_path: new URL('./corpus.json', import.meta.url).pathname,
        run_candidate: 'nano',
        candidates: [{ id: 'nano', provider: 'fixture', rank: 1 }],
        batch_sizes: [1],
        replicates: 1,
        image_detail: 'high',
        passes: ['not-a-family'],
      },
      corpus,
      dryRun: true,
      recordsPath: '/tmp/unused-visual-records.jsonl',
    }),
    /known corpus family|unknown pass/,
  );
});

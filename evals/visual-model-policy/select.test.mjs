import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_THRESHOLDS,
  metricsFor,
  qualificationFor,
  selectVisualModelPolicy,
} from './select.mjs';

const candidates = [
  { id: 'nano', rank: 1, class: 'small', provider: 'test' },
  { id: 'mini', rank: 2, class: 'medium', provider: 'test' },
  { id: 'frontier', rank: 3, class: 'large', provider: 'test' },
];

function result(overrides = {}) {
  return {
    pass: 'layout',
    model: 'nano',
    batch_size: 1,
    runs: 3,
    cases: 100,
    positives: 40,
    negatives: 60,
    tp: 38,
    fp: 2,
    tn: 58,
    fn: 2,
    grounded: 39,
    grounding_total: 40,
    json_valid: 100,
    responses: 100,
    abstentions: 1,
    total_cost_usd: 0.1,
    p95_latency_ms: 5000,
    unique_cases: 20,
    unique_positives: 10,
    unique_negatives: 10,
    adjudication_complete: true,
    synthetic: false,
    telemetry_complete: true,
    experiment_complete: true,
    ...overrides,
  };
}

test('computes precision, recall, silence, grounding, validity, and cost', () => {
  assert.deepEqual(metricsFor(result()), {
    precision: 0.95,
    recall: 0.95,
    silence_accuracy: 58 / 60,
    grounding_accuracy: 39 / 40,
    json_validity: 1,
    abstention_rate: 0.01,
    cost_per_case_usd: 0.001,
    p95_latency_ms: 5000,
  });
});

test('rejects a cheap batch when recall falls below the gate', () => {
  const outcome = qualificationFor(result({ batch_size: 4, tp: 32, fn: 8 }));
  assert.equal(outcome.qualified, false);
  assert.match(outcome.reasons.join('\n'), /recall/);
});

test('selects the smallest qualified model before a cheaper larger model', () => {
  const policy = selectVisualModelPolicy({
    candidates,
    results: [
      result({ model: 'nano', batch_size: 2, total_cost_usd: 0.2 }),
      result({ model: 'mini', batch_size: 8, total_cost_usd: 0.05 }),
    ],
  });
  assert.equal(policy.routes.layout.model, 'nano');
  assert.equal(policy.routes.layout.batch_size, 2);
  assert.equal(policy.routes.layout.escalation_chain[0].model, 'mini');
});

test('selects the empirically cheapest qualified batch within one model', () => {
  const policy = selectVisualModelPolicy({
    candidates,
    results: [
      result({ model: 'nano', batch_size: 1, total_cost_usd: 0.2 }),
      result({ model: 'nano', batch_size: 2, total_cost_usd: 0.08 }),
      result({ model: 'nano', batch_size: 4, total_cost_usd: 0.04, tp: 30, fn: 10 }),
    ],
  });
  assert.equal(policy.routes.layout.model, 'nano');
  assert.equal(policy.routes.layout.batch_size, 2);
});

test('blocks a pass when no model has enough positive and negative evidence', () => {
  const policy = selectVisualModelPolicy({
    candidates,
    results: [result({
      cases: 8,
      positives: 4,
      negatives: 4,
      tp: 4,
      fp: 0,
      tn: 4,
      fn: 0,
      grounded: 4,
      grounding_total: 4,
      json_valid: 8,
      responses: 8,
      abstentions: 0,
    })],
  });
  assert.equal(policy.routes.layout, undefined);
  assert.equal(policy.blocked.layout.reason, 'no-eval-qualified-model');
  assert.match(policy.blocked.layout.evaluated[0].reasons.join('\n'), /positives/);
});

test('allows stricter per-run thresholds without changing the selector', () => {
  const policy = selectVisualModelPolicy({
    candidates,
    thresholds: { ...DEFAULT_THRESHOLDS, recall: 0.98 },
    results: [
      result({ model: 'nano' }),
      result({ model: 'mini', tp: 40, fn: 0 }),
    ],
  });
  assert.equal(policy.routes.layout.model, 'mini');
});

test('keeps routes independent by check family', () => {
  const policy = selectVisualModelPolicy({
    candidates,
    results: [
      result({ pass: 'layout', model: 'nano' }),
      result({ pass: 'operating-model', model: 'nano', tp: 30, fn: 10 }),
      result({ pass: 'operating-model', model: 'mini' }),
    ],
  });
  assert.equal(policy.routes.layout.model, 'nano');
  assert.equal(policy.routes['operating-model'].model, 'mini');
});

test('rejects internally inconsistent empirical counts', () => {
  assert.throws(
    () => selectVisualModelPolicy({
      candidates,
      results: [result({ tp: 40, fn: 2 })],
    }),
    /tp \+ fn must equal positives/,
  );
});

test('requires explicit finite cost measurements', () => {
  const missingCost = result();
  delete missingCost.total_cost_usd;
  assert.throws(
    () => selectVisualModelPolicy({ candidates, results: [missingCost] }),
    /result requires total_cost_usd/,
  );
});

test('blocks an otherwise accurate model when cost exceeds the gate', () => {
  const policy = selectVisualModelPolicy({
    candidates,
    thresholds: { max_cost_per_case_usd: 0.0005 },
    results: [result()],
  });
  assert.equal(policy.routes.layout, undefined);
  assert.match(policy.blocked.layout.evaluated[0].reasons.join('\n'), /cost_per_case_usd/);
});

test('requires grounding observations', () => {
  assert.throws(
    () => selectVisualModelPolicy({
      candidates,
      results: [result({ grounded: 0, grounding_total: 0 })],
    }),
    /grounding_total must be a positive integer/,
  );
});

test('repeated observations cannot substitute for independent labeled cases', () => {
  const policy = selectVisualModelPolicy({
    candidates,
    results: [result({
      unique_cases: 8,
      unique_positives: 4,
      unique_negatives: 4,
    })],
  });
  assert.equal(policy.routes.layout, undefined);
  assert.match(policy.blocked.layout.evaluated[0].reasons.join('\n'), /unique_positives/);
});

test('blocks measurements with pending human adjudication', () => {
  const policy = selectVisualModelPolicy({
    candidates,
    results: [result({ adjudication_complete: false })],
  });
  assert.equal(policy.routes.layout, undefined);
  assert.match(policy.blocked.layout.evaluated[0].reasons.join('\n'), /adjudication_complete/);
});

test('blocks synthetic dry-run evidence', () => {
  const policy = selectVisualModelPolicy({
    candidates,
    results: [result({ synthetic: true })],
  });
  assert.equal(policy.routes.layout, undefined);
  assert.match(policy.blocked.layout.evaluated[0].reasons.join('\n'), /synthetic/);
});

test('blocks incomplete provider telemetry', () => {
  const policy = selectVisualModelPolicy({
    candidates,
    results: [result({ telemetry_complete: false })],
  });
  assert.equal(policy.routes.layout, undefined);
  assert.match(policy.blocked.layout.evaluated[0].reasons.join('\n'), /telemetry_complete/);
});

test('blocks an incomplete experiment request matrix', () => {
  const policy = selectVisualModelPolicy({
    candidates,
    results: [result({ experiment_complete: false })],
  });
  assert.match(policy.blocked.layout.evaluated[0].reasons.join('\n'), /experiment_complete/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildLlmDispatchPlan,
  resolveVisualModelPolicy,
} from './model-policy.mjs';
import '../../../../../evals/deck-review-set.browser.test.mjs';
import '../../../../../evals/deck-review-report.test.mjs';

function generatedPolicy(routes) {
  return {
    schema_version: 1,
    policy: 'smallest-eval-qualified-model-first',
    source_sha256: 'a'.repeat(64),
    thresholds: { recall: 0.9 },
    routes,
  };
}

function measuredRoute(overrides = {}) {
  return {
    model: 'tiny-vision',
    batch_size: 2,
    metrics: {
      precision: 0.95,
      recall: 0.95,
      silence_accuracy: 0.96,
      grounding_accuracy: 0.97,
      json_validity: 1,
      abstention_rate: 0,
      cost_per_case_usd: 0.001,
      p95_latency_ms: 5000,
    },
    evidence: { runs: 3, cases: 100, positives: 40, negatives: 60 },
    escalation_chain: [],
    escalation_triggers: ['explicit-abstain'],
    ...overrides,
  };
}

test('resolves the explicit policy before home and repository defaults', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacture-policy-'));
  const explicit = path.join(root, 'explicit.json');
  fs.writeFileSync(explicit, JSON.stringify(generatedPolicy({
    layout: measuredRoute(),
  })));
  const resolved = resolveVisualModelPolicy({
    env: { ARTIFACTURE_VISUAL_MODEL_POLICY: explicit },
    homeDir: path.join(root, 'home'),
    repoRoot: path.join(root, 'repo'),
  });
  assert.equal(resolved.source, explicit);
  assert.equal(resolved.policy.routes.layout.model, 'tiny-vision');
  fs.rmSync(root, { recursive: true, force: true });
});

test('builds ready Artifacture routes and independent companion routes', () => {
  const plan = buildLlmDispatchPlan(
    ['hierarchy', 'impeccable:critique', 'unslop:cleanup-report'],
    {
      source: '/policy.json',
      policy: generatedPolicy({
        layout: measuredRoute({ model_class: 'small', provider: 'test' }),
      }),
    },
  );
  assert.equal(plan[0].status, 'ready');
  assert.equal(plan[0].model, 'tiny-vision');
  assert.equal(plan[1].status, 'delegate-to-installed-skill');
  assert.equal(plan[2].owner, 'unslop');
});

test('skips an Artifacture pass instead of falling back to the host model', () => {
  const [entry] = buildLlmDispatchPlan(
    ['operating-model'],
    { source: null, policy: null },
  );
  assert.deepEqual(entry, {
    pass: 'operating-model',
    owner: 'artifacture',
    status: 'skipped',
    reason: 'no-eval-qualified-model',
    policy_source: null,
  });
});

test('does not borrow layout qualification for an aesthetic pass', () => {
  const [entry] = buildLlmDispatchPlan(
    ['aesthetic-nothing'],
    { source: '/policy.json', policy: generatedPolicy({ layout: measuredRoute() }) },
  );
  assert.equal(entry.status, 'skipped');
  assert.equal(entry.reason, 'no-eval-qualified-model');
});

test('does not borrow layout qualification for deck review', () => {
  const [entry] = buildLlmDispatchPlan(
    ['deck-review'],
    { source: '/policy.json', policy: generatedPolicy({ layout: measuredRoute() }) },
  );
  assert.equal(entry.status, 'skipped');
  assert.equal(entry.reason, 'no-eval-qualified-model');
});

test('deck review refuses a route that was not qualified on paired evidence', () => {
  const [entry] = buildLlmDispatchPlan(
    ['deck-review'],
    { source: '/policy.json', policy: generatedPolicy({ 'deck-review': measuredRoute({ batch_size: 1 }) }) },
  );
  assert.equal(entry.status, 'skipped');
  assert.equal(entry.reason, 'deck-review-requires-paired-evidence');
});

test('deck review accepts an independently qualified paired-evidence route', () => {
  const [entry] = buildLlmDispatchPlan(
    ['deck-review'],
    { source: '/policy.json', policy: generatedPolicy({ 'deck-review': measuredRoute({ batch_size: 2 }) }) },
  );
  assert.equal(entry.status, 'ready');
  assert.equal(entry.batch_size, 2);
});

test('rejects a hand-written route without selector provenance and measurements', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacture-policy-'));
  const explicit = path.join(root, 'hand-written.json');
  fs.writeFileSync(explicit, JSON.stringify({
    schema_version: 1,
    routes: { layout: { model: 'tiny-vision', batch_size: 2 } },
  }));
  assert.throws(
    () => resolveVisualModelPolicy({
      env: { ARTIFACTURE_VISUAL_MODEL_POLICY: explicit },
      homeDir: path.join(root, 'home'),
      repoRoot: path.join(root, 'repo'),
    }),
    /invalid or non-selector visual model policy/,
  );
  fs.rmSync(root, { recursive: true, force: true });
});

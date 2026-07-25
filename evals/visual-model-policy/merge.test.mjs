import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeMeasurements } from './merge.mjs';

function measurement(model, contract, completedCandidates = []) {
  return {
    schema_version: 1,
    source: {
      corpus_id: 'corpus',
      corpus_sha256: 'a'.repeat(64),
      experiment_contract_id: contract,
      experiment_complete: true,
      ladder_state: { completed_candidates: completedCandidates },
    },
    thresholds: { recall: 0.9 },
    candidates: [
      { id: 'nano', provider: 'fixture', rank: 1 },
      { id: 'mini', provider: 'fixture', rank: 2 },
    ],
    results: [{
      pass: 'layout',
      model,
      batch_size: 1,
      image_detail: 'high',
      runs: 3,
      cases: 20,
      positives: 10,
      negatives: 10,
      unique_cases: 20,
      unique_positives: 10,
      unique_negatives: 10,
      tp: 10,
      fp: 0,
      tn: 10,
      fn: 0,
      grounded: 10,
      grounding_total: 10,
      json_valid: 20,
      responses: 20,
      abstentions: 0,
      total_cost_usd: 0.01,
      p95_latency_ms: 100,
      adjudication_complete: true,
      synthetic: false,
      telemetry_complete: true,
      experiment_complete: true,
    }],
    pending_adjudication: [],
  };
}

test('merges independently complete candidate measurements for selection', () => {
  const nanoHash = 'd'.repeat(64);
  const miniHash = 'e'.repeat(64);
  const merged = mergeMeasurements([
    measurement('nano', 'b'.repeat(64)),
    measurement('mini', 'c'.repeat(64), [{
      id: 'nano',
      pass_evidence: {
        layout: { status: 'qualified', evidence_sha256: nanoHash },
      },
    }]),
  ], { sourceSha256: [nanoHash, miniHash] });
  assert.deepEqual(merged.results.map((entry) => entry.model), ['mini', 'nano']);
  assert.equal(merged.source.measurement_sets, 2);
  assert.deepEqual(merged.source.experiment_contract_ids, [
    'b'.repeat(64),
    'c'.repeat(64),
  ]);
});

test('refuses corpus drift and incomplete request matrices', () => {
  const drifted = measurement('mini', 'c'.repeat(64));
  drifted.source.corpus_sha256 = 'd'.repeat(64);
  assert.throws(
    () => mergeMeasurements(
      [measurement('nano', 'b'.repeat(64)), drifted],
      { sourceSha256: ['d'.repeat(64), 'e'.repeat(64)] },
    ),
    /identical corpus contract/,
  );
  const incomplete = measurement('nano', 'b'.repeat(64));
  incomplete.source.experiment_complete = false;
  assert.throws(
    () => mergeMeasurements([incomplete], { sourceSha256: ['d'.repeat(64)] }),
    /complete experiment and corpus contract/,
  );
});

test('refuses a higher candidate without contiguous bound lower-rank evidence', () => {
  assert.throws(
    () => mergeMeasurements(
      [measurement('mini', 'c'.repeat(64))],
      { sourceSha256: ['e'.repeat(64)] },
    ),
    /contiguous smallest-first candidate prefix/,
  );
  assert.throws(
    () => mergeMeasurements(
      [
        measurement('nano', 'b'.repeat(64)),
        measurement('mini', 'c'.repeat(64)),
      ],
      { sourceSha256: ['d'.repeat(64), 'e'.repeat(64)] },
    ),
    /does not bind verified evidence/,
  );
});

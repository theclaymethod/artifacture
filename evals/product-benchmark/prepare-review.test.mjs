import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareReview } from './prepare-review.mjs';

test('review preparation proves byte-identical cases as ties and leaves changed cases for a human', () => {
  const benchmark = {
    id: 'product-v1',
    cases: [
      { id: 'same', dimensions: ['correctness', 'clarity'] },
      { id: 'changed', dimensions: ['correctness', 'clarity'] },
    ],
  };
  const manifest = (runId, changedHash) => ({
    benchmark_id: benchmark.id,
    run_id: runId,
    cases: [
      { case_id: 'same', artifact: { sha256: 'a'.repeat(64) } },
      { case_id: 'changed', artifact: { sha256: changedHash } },
    ],
  });
  const prepared = prepareReview({
    benchmark,
    baselineManifest: manifest('baseline', 'b'.repeat(64)),
    candidateManifest: manifest('candidate', 'c'.repeat(64)),
  });
  assert.deepEqual(prepared.changedCases, ['changed']);
  assert.deepEqual(prepared.comparisons, [
    { case_id: 'same', dimension: 'correctness', verdict: 'tie', basis: 'byte-identical-artifact' },
    { case_id: 'same', dimension: 'clarity', verdict: 'tie', basis: 'byte-identical-artifact' },
  ]);
});

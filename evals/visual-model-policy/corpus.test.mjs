import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evidenceSha256,
  expandCorpus,
  loadCorpus,
  validateCorpus,
} from './corpus.mjs';

const REQUIRED_FAMILIES = [
  'layout',
  'deck-review',
  'diagram',
  'aesthetic',
  'operating-model',
  'artifact-slop-gap',
];

test('the visual seed corpus covers every owned family without claiming graduation readiness', async () => {
  const corpus = await loadCorpus();
  const summary = validateCorpus(corpus);

  assert.deepEqual(Object.keys(summary.families).sort(), [...REQUIRED_FAMILIES].sort());
  assert.equal(summary.label_review.status, 'pending-human-review');
  assert.equal(summary.graduation_status, 'seed');
  assert.equal(summary.capture_provenance.status, 'synthetic-fixtures');
  assert.deepEqual(summary.target_batch_sizes, [1, 2]);
  for (const family of REQUIRED_FAMILIES) {
    assert.ok(summary.families[family].fire >= 6, `${family} fire cases`);
    assert.ok(summary.families[family].clean >= 6, `${family} clean cases`);
    assert.equal(
      summary.families[family].hard_negatives,
      summary.families[family].clean,
      `${family} hard negatives`,
    );
    for (const [criterionId, counts] of Object.entries(summary.families[family].criteria)) {
      assert.ok(counts.fire >= 1, `${family}:${criterionId} fire evidence`);
      assert.ok(counts.clean >= 1, `${family}:${criterionId} clean evidence`);
      assert.ok(
        counts.fire + counts.clean >= 2,
        `${family}:${criterionId} supports the target batch size`,
      );
    }
  }
});

test('layout corpus covers clipping, crowding, dead space, and symmetry', async () => {
  const cases = expandCorpus(await loadCorpus()).filter((entry) => entry.family === 'layout');
  assert.deepEqual(
    [...new Set(cases.map((entry) => entry.criterion_id))].sort(),
    [
      'layout-repeated-track-symmetry',
      'slide-single-focal-point',
      'sparse-diagram-slide',
      'text-visibly-clipped',
    ],
  );
});

test('every case exposes stable evidence identity, a named region, and adjudication notes', async () => {
  const cases = expandCorpus(await loadCorpus());
  assert.equal(cases.length, 84);
  for (const entry of cases) {
    assert.match(entry.case_id, /^[a-z0-9][a-z0-9:-]+$/);
    assert.match(entry.state_id, /^[a-z0-9][a-z0-9:-]+$/);
    assert.match(entry.image.id, /^[a-z0-9][a-z0-9:-]+$/);
    assert.ok(entry.image.path.endsWith(`${entry.image.id}.png`));
    assert.ok(entry.regions.length > 0);
    assert.ok(entry.regions.every((region) => region.id && region.label));
    assert.ok(['fire', 'clean'].includes(entry.human_label));
    assert.ok(entry.adjudication_notes.length >= 20);
    assert.ok(entry.viewport.width > 0 && entry.viewport.height > 0);
  }
});

test('source-conditioned cases distinguish evidence context even when pixels match', () => {
  const imageSha256 = 'a'.repeat(64);
  const unsupported = evidenceSha256(imageSha256, {
    visible_text: 'Confidence 87%',
    truth_excerpt: 'No measurement exists for the displayed confidence.',
  });
  const supported = evidenceSha256(imageSha256, {
    visible_text: 'Confidence 87%',
    truth_excerpt: '87 of 100 checks passed in the attached evaluation run.',
  });

  assert.notEqual(unsupported, supported);
  assert.equal(
    unsupported,
    evidenceSha256(imageSha256, {
      visible_text: 'Confidence 87%',
      truth_excerpt: 'No measurement exists for the displayed confidence.',
    }),
  );
});

test('the owned corpus cannot absorb delegated skill criteria', async () => {
  const corpus = await loadCorpus();
  corpus.families[0].pairs[0].criterion_id = 'impeccable:critique';
  assert.throws(
    () => validateCorpus(corpus),
    /delegated criterion impeccable:critique is outside Artifacture's eval ownership/,
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  expandCorpus,
  loadCorpus,
  validateCorpus,
} from './corpus.mjs';

const REQUIRED_FAMILIES = [
  'layout',
  'diagram',
  'aesthetic',
  'operating-model',
  'artifact-slop-gap',
];

test('the visual corpus has independent graduation evidence for every owned family', async () => {
  const corpus = await loadCorpus();
  const summary = validateCorpus(corpus);

  assert.deepEqual(Object.keys(summary.families).sort(), [...REQUIRED_FAMILIES].sort());
  assert.equal(summary.label_review.status, 'pending-human-review');
  for (const family of REQUIRED_FAMILIES) {
    assert.ok(summary.families[family].fire >= 10, `${family} fire cases`);
    assert.ok(summary.families[family].clean >= 10, `${family} clean cases`);
    assert.equal(
      summary.families[family].hard_negatives,
      summary.families[family].clean,
      `${family} hard negatives`,
    );
    for (const [criterionId, counts] of Object.entries(summary.families[family].criteria)) {
      assert.ok(counts.fire >= 2, `${family}:${criterionId} fire cases support batch 4`);
      assert.ok(counts.clean >= 2, `${family}:${criterionId} clean cases support batch 4`);
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
  assert.equal(cases.length, 112);
  for (const entry of cases) {
    assert.match(entry.case_id, /^[a-z0-9][a-z0-9:-]+$/);
    assert.match(entry.state_id, /^[a-z0-9][a-z0-9:-]+$/);
    assert.match(entry.image.id, /^[a-z0-9][a-z0-9:-]+$/);
    assert.ok(entry.image.path.endsWith(`${entry.image.id}.png`));
    assert.ok(entry.regions.length > 0);
    assert.ok(entry.regions.every((region) => region.id && region.label));
    assert.ok(['fire', 'clean'].includes(entry.human_label));
    assert.ok(entry.adjudication_notes.length >= 20);
  }
});

test('the owned corpus cannot absorb delegated skill criteria', async () => {
  const corpus = await loadCorpus();
  corpus.families[0].pairs[0].criterion_id = 'impeccable:critique';
  assert.throws(
    () => validateCorpus(corpus),
    /delegated criterion impeccable:critique is outside Artifacture's eval ownership/,
  );
});

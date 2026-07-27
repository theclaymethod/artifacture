import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReport } from '../plugins/visual-explainer/scripts/verify/lib/report.mjs';

function context(overrides = {}) {
  return {
    filePath: '/tmp/artifact.html',
    profile: 'page',
    preset: 'custom',
    presetHint: 'custom',
    html: '<main>ordinary page</main>',
    ...overrides,
  };
}

test('routes fixed-stage presentations through the dedicated deck review pass', () => {
  const report = buildReport(context({
    html: '<div data-ve-presentation="true"></div>',
  }), []);
  assert.ok(report.llm_passes_required.includes('deck-review'));
  assert.equal(
    report.llm_dispatch_plan.find((entry) => entry.pass === 'deck-review')?.reason,
    'no-eval-qualified-model',
  );
});

test('routes slide decks but leaves magazines and ordinary pages alone', () => {
  const slides = buildReport(context({ profile: 'slides' }), []);
  assert.ok(slides.llm_passes_required.includes('deck-review'));

  const magazine = buildReport(context({ profile: 'magazine' }), []);
  assert.equal(magazine.llm_passes_required.includes('deck-review'), false);

  const page = buildReport(context(), []);
  assert.equal(page.llm_passes_required.includes('deck-review'), false);
});

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

test('routes fixed-stage presentations through the profile-aware artifact review', () => {
  const report = buildReport(context({
    html: '<div data-ve-presentation="true"></div>',
  }), []);
  assert.deepEqual(report.llm_passes_required, ['artifact-review:slides']);
  const route = report.llm_dispatch_plan[0];
  assert.equal(route?.status, 'fallback-required');
  assert.equal(route?.reason, 'no-eval-qualified-model');
  assert.equal(route?.selection, 'best-available-model');
  assert.equal(route?.batch_size, 2);
});

test('routes every visual profile through exactly one matching artifact review', () => {
  const slides = buildReport(context({ profile: 'slides' }), []);
  assert.deepEqual(slides.llm_passes_required, ['artifact-review:slides']);

  const magazine = buildReport(context({ profile: 'magazine' }), []);
  assert.deepEqual(magazine.llm_passes_required, ['artifact-review:magazine']);

  const page = buildReport(context(), []);
  assert.deepEqual(page.llm_passes_required, ['artifact-review:page']);
});

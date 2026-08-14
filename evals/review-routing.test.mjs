import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildReport } from '../plugins/visual-explainer/scripts/verify/lib/report.mjs';

const catalog = JSON.parse(readFileSync(
  new URL('../plugins/visual-explainer/scripts/verify/checks.json', import.meta.url),
  'utf8',
)).checks;

test('every mechanics catalog row is executable by the verifier', () => {
  assert.deepEqual(
    catalog.filter((check) => ['llm-pass', 'transcript'].includes(check.stage)),
    [],
  );
});

function context(profile, html = '<main><p>Useful prose.</p></main>') {
  return {
    profile,
    preset: 'custom',
    presetHint: '',
    html,
    filePath: `${profile}.html`,
  };
}

test('many visual criteria collapse into one profile-aware artifact review', () => {
  const report = buildReport(context('slides'), [
    { id: 'hierarchy-squint-test', stage: 'llm-pass', status: 'llm-required', severity: 'error' },
    { id: 'deck-content-completeness', stage: 'llm-pass', status: 'llm-required', severity: 'error' },
  ]);

  assert.deepEqual(report.llm_passes_required, ['artifact-review:slides']);
});

test('ordinary artifacts do not need local taste or prose detectors to get reviewed', () => {
  const report = buildReport(context('page'), []);
  assert.deepEqual(report.llm_passes_required, ['artifact-review:page']);
});

test('companion skills remain explicit opt-ins owned by their installed skills', () => {
  const report = buildReport(context(
    'page',
    '<main data-ve-checks="impeccable:critique unslop:cleanup-report"></main>',
  ), []);

  assert.deepEqual(report.llm_passes_required, [
    'artifact-review:page',
    'impeccable:critique',
    'unslop:cleanup-report',
  ]);
});

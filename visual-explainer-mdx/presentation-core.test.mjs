import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import {
  DRILL_DISMISS_GUARD_SELECTOR,
  clampSlideIndex,
  fitStage,
  shouldDismissDrillSheet,
  solidTint,
  tint,
} from './presentation-core.ts';

/* ------------------------------------------------------------------ */
/* fitStage — the scale-to-fit math behind the fixed 1920×1080 stage    */
/* ------------------------------------------------------------------ */

test('fitStage: exact-fit viewport scales 1:1 with no letterbox', () => {
  assert.deepEqual(fitStage(1920, 1080), { scale: 1, left: 0, top: 0 });
});

test('fitStage: width-constrained viewport letterboxes top and bottom', () => {
  const fit = fitStage(960, 1080);
  assert.equal(fit.scale, 0.5);
  assert.equal(fit.left, 0);
  assert.equal(fit.top, (1080 - 1080 * 0.5) / 2);
});

test('fitStage: height-constrained viewport letterboxes left and right', () => {
  const fit = fitStage(1920, 540);
  assert.equal(fit.scale, 0.5);
  assert.equal(fit.top, 0);
  assert.equal(fit.left, (1920 - 1920 * 0.5) / 2);
});

test('fitStage: scale is min(w/stageW, h/stageH) for arbitrary viewports', () => {
  for (const [w, h] of [[1440, 900], [1396, 900], [800, 1000], [2560, 1440], [375, 812]]) {
    const fit = fitStage(w, h);
    const expected = Math.min(w / 1920, h / 1080);
    assert.ok(Math.abs(fit.scale - expected) < 1e-12, `scale for ${w}x${h}`);
    // Centered letterbox: stage rect fits inside the viewport with equal margins.
    assert.ok(Math.abs(fit.left * 2 + 1920 * fit.scale - w) < 1e-9);
    assert.ok(Math.abs(fit.top * 2 + 1080 * fit.scale - h) < 1e-9);
  }
});

test('fitStage: honors custom stage dimensions', () => {
  const fit = fitStage(800, 800, 1600, 400);
  assert.equal(fit.scale, 0.5);
  assert.equal(fit.left, 0);
  assert.equal(fit.top, (800 - 400 * 0.5) / 2);
});

test('fitStage: unmeasured (0x0) container clamps to scale 0, never NaN/negative', () => {
  const fit = fitStage(0, 0);
  assert.equal(fit.scale, 0);
  assert.ok(Number.isFinite(fit.left) && Number.isFinite(fit.top));
});

test('fitStage: rejects non-positive stage dimensions', () => {
  assert.throws(() => fitStage(100, 100, 0, 1080));
  assert.throws(() => fitStage(100, 100, 1920, -1));
});

/* ------------------------------------------------------------------ */
/* clampSlideIndex                                                      */
/* ------------------------------------------------------------------ */

test('clampSlideIndex: clamps into [0, count-1] and pins empty decks to 0', () => {
  assert.equal(clampSlideIndex(-3, 5), 0);
  assert.equal(clampSlideIndex(2, 5), 2);
  assert.equal(clampSlideIndex(99, 5), 4);
  assert.equal(clampSlideIndex(0, 0), 0);
  assert.equal(clampSlideIndex(4, 0), 0);
});

/* ------------------------------------------------------------------ */
/* shouldDismissDrillSheet — the click-anywhere-to-close guard          */
/* ------------------------------------------------------------------ */

function sheetDom() {
  const { document } = parseHTML(`
    <div data-drill-open="true">
      <p id="prose">Plain prose closes the sheet.</p>
      <div id="panel"><span id="panel-text">nested passive text</span></div>
      <button id="btn"><span id="btn-inner">label</span></button>
      <a id="link" href="#x"><span id="link-inner">anchor</span></a>
      <input id="input" />
      <select id="select"><option id="option">a</option></select>
      <textarea id="textarea"></textarea>
      <div data-interactive="true" id="optout"><em id="optout-inner">guarded region</em></div>
      <button data-drill-target="other" id="trigger"><span id="trigger-inner">open other</span></button>
    </div>`);
  return document;
}

test('guard: clicks on passive prose, panels, and the sheet itself dismiss', () => {
  const doc = sheetDom();
  for (const id of ['prose', 'panel', 'panel-text']) {
    assert.equal(shouldDismissDrillSheet(doc.getElementById(id)), true, `#${id} should dismiss`);
  }
  assert.equal(shouldDismissDrillSheet(doc.querySelector('[data-drill-open]')), true, 'sheet surface should dismiss');
});

test('guard: clicks on interactive elements never dismiss', () => {
  const doc = sheetDom();
  for (const id of ['btn', 'link', 'input', 'select', 'option', 'textarea', 'optout', 'trigger']) {
    assert.equal(shouldDismissDrillSheet(doc.getElementById(id)), false, `#${id} should be guarded`);
  }
});

test('guard: clicks on descendants of interactive elements never dismiss', () => {
  const doc = sheetDom();
  for (const id of ['btn-inner', 'link-inner', 'optout-inner', 'trigger-inner']) {
    assert.equal(shouldDismissDrillSheet(doc.getElementById(id)), false, `#${id} should be guarded via closest()`);
  }
});

test('guard: a still-mounted drill trigger ([data-drill-target]) is guarded so the opening click cannot re-close the sheet', () => {
  const doc = sheetDom();
  assert.equal(shouldDismissDrillSheet(doc.getElementById('trigger')), false);
});

test('guard: null/closest-less targets fail safe (dismiss)', () => {
  assert.equal(shouldDismissDrillSheet(null), true);
  assert.equal(shouldDismissDrillSheet(undefined), true);
  assert.equal(shouldDismissDrillSheet({}), true);
});

test('guard: selector covers exactly the documented element classes', () => {
  assert.equal(
    DRILL_DISMISS_GUARD_SELECTOR,
    'button, a, input, select, textarea, [data-interactive], [data-drill-target]',
  );
});

/* ------------------------------------------------------------------ */
/* tint / solidTint                                                     */
/* ------------------------------------------------------------------ */

test('tint: appends the alpha suffix', () => {
  assert.equal(tint('#336699', '10'), '#33669910');
});

test('solidTint: composites fg over bg into an opaque hex', () => {
  assert.equal(solidTint('#336699', '#FFFFFF', '10'), '#F2F5F9');
  assert.equal(solidTint('#204060', '#F0F0E8', '20'), '#D6DAD7');
  assert.equal(solidTint('#000000', '#FFFFFF', '00'), '#FFFFFF');
  assert.equal(solidTint('#000000', '#FFFFFF', 'FF'), '#000000');
});

test('solidTint: rejects non-hex inputs (CSS vars must use the .ve-pres-solid idiom instead)', () => {
  assert.throws(() => solidTint('var(--ve-accent)', '#FFFFFF', '10'));
  assert.throws(() => solidTint('#336699', 'white', '10'));
});

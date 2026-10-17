import { prepareCodeDiff, createCodeDiffScene, focusCodeDiff, createCodeDiffTransition } from '../../visual-explainer-mdx/code-diff';
import { composeGraphics } from '../../visual-explainer-mdx/graphics-composition';
import { createGraphicScene } from '../../visual-explainer-mdx/graphics-types';
import { defineGraphicMotion } from '../../visual-explainer-mdx/graphic-motion';
import { createSlideScene, sequenceSlides } from '../../visual-explainer-mdx/graphic-slides';

export const before = `export async function read(key) {
  const value = await cache.get(key);
  if (value) return value;

  const fresh = await storage.get(key);
  await cache.set(key, fresh);
  return fresh;
}`;

export const after = `export async function read(key) {
  const value = await cache.get(key);
  if (value !== null) return value;

  const fresh = await storage.get(key);
  if (fresh !== null) {
    await cache.set(key, fresh);
  }
  return fresh;
}`;

export const diff = prepareCodeDiff({ before, after, context: 1 });
export const duration = 12;
const common = { diff, filename: 'cache.ts (example)', title: 'Preserve cached zero. Keep missing values out.', description: 'An illustrative cache reader: zero counts as a cache hit; null is not written back. Line numbers identify the authored snippet.', fontSize: 22, columnWidth: 13.4, lineHeight: 38, padding: 26 };
export const split = createCodeDiffScene({ ...common, id: 'review-split', bounds: { x: 0, y: 0, width: 1400, height: 560 }, mode: 'split' });
export const splitMotion = focusCodeDiff(split, { duration, beats: [{ changeId: diff.changeIds[0], start: 1, end: 4.5 }, { changeId: diff.changeIds[1], start: 6, end: 10.5 }] });
export const unified = createCodeDiffScene({ ...common, id: 'review-unified', bounds: { x: 0, y: 0, width: 800, height: 660 }, mode: 'unified' });
export const unifiedMotion = focusCodeDiff(unified, { duration, beats: [{ changeId: diff.changeIds[0], start: 1, end: 4.5 }, { changeId: diff.changeIds[1], start: 6, end: 10.5 }] });
export const edit = createCodeDiffTransition({ ...common, id: 'review-edit', bounds: { x: 0, y: 0, width: 800, height: 580 }, duration, start: 3, transition: 1.2 });
export const reverse = createCodeDiffTransition({ ...common, id: 'review-reverse', bounds: { x: 0, y: 0, width: 800, height: 580 }, duration, start: 3, transition: 1.2, direction: 'reverse' });

export function createDiffReviewSequence(narrow = false) {
  const cachedValue = Number('0');
  const cacheHit = (value: number | null) => value !== null;
  const result = createGraphicScene({
    id: 'cached-zero-proof', title: 'The input is still zero', description: 'These expressions evaluate the authored example. This demonstrates predicate behavior, not a measured application benchmark.',
    bounds: { x: 0, y: 0, width: 640, height: 440 }, objects: [
      { id: 'input', kind: 'illustration', primitives: [{ kind: 'text', x: 40, y: 60, lines: ['Cached value'], size: 32, leading: 42, font: 'body', fill: 'ink' }, { kind: 'text', x: 40, y: 155, lines: ['0'], size: 100, leading: 110, font: 'mono', fill: 'ink' }] },
      { id: 'old-result', kind: 'illustration', primitives: [{ kind: 'text', x: 40, y: 250, lines: [`Boolean(0) = ${Boolean(cachedValue)}`, 'Read storage again.'], size: 30, leading: 52, font: 'mono', fill: 'ink' }] },
      { id: 'new-result', kind: 'illustration', primitives: [{ kind: 'text', x: 40, y: 250, lines: [`0 !== null = ${cacheHit(cachedValue)}`, 'Return cached zero.'], size: 30, leading: 52, font: 'mono', fill: 'ink' }, { kind: 'path', d: 'M 40 330 L 470 330', stroke: 'accent', fill: 'none', strokeRole: 'active' }] },
    ],
  });
  const resultMotion = defineGraphicMotion(result, { duration, tracks: [
    { target: 'old-result', property: 'opacity', start: 3, duration: .3, from: 1, to: 0, ease: 'smooth' },
    { target: 'new-result', property: 'opacity', start: 4.6, duration: .3, from: 0, to: 1, ease: 'smooth' },
  ] });
  const composition = composeGraphics({
    id: 'diff-review-composition', title: edit.scene.title, description: edit.scene.description, duration,
    bounds: { x: 0, y: 0, width: narrow ? 800 : 1500, height: narrow ? 1090 : 630 },
    instances: [
      { id: 'edit', scene: edit.scene, motion: edit.motion, frame: { x: 0, y: 0, width: 800, height: 580 }, clip: 'frame' },
      { id: 'result', scene: result, motion: resultMotion, frame: narrow ? { x: 0, y: 620, width: 800, height: 440 } : { x: 860, y: 100, width: 640, height: 440 }, clip: 'frame' },
    ],
  });
  const slide = createSlideScene({ id: narrow ? 'diff-review-portrait' : 'diff-review-landscape', title: 'Zero is a value.', explanation: 'Change the condition. Preserve the input. Replay the outcome.', graphic: composition.scene, width: narrow ? 1080 : 1920, height: narrow ? 1920 : 1080, preset: 'iso', appearance: 'light' });
  return sequenceSlides(slide.id, [{ slide, motion: composition.motion, duration }]);
}

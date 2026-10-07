import React, { useEffect, useState } from 'react';
import { GraphicCanvas } from '../../visual-explainer-mdx/graphics';
import { createGraphicScene, type GraphicScene } from '../../visual-explainer-mdx/graphics-types';
import { prepareGraphicRoute } from '../../visual-explainer-mdx/graphic-routes';
import { defineGraphicMotion, sampleScene, type GraphicMotionTrack } from '../../visual-explainer-mdx/graphic-motion';
import { followPath } from '../../visual-explainer-mdx/teaching-motion';
import { comparisonWipe } from '../../visual-explainer-mdx/comparison-motion';
import { createSourceScene } from '../../visual-explainer-mdx/source-scenes';
import { focusSourceRange } from '../../visual-explainer-mdx/narrated-motion';
import { normalizeNarrationCues, type NarrationCue } from '../../visual-explainer-mdx/narration-cues';
import { composeGraphics } from '../../visual-explainer-mdx/graphics-composition';
import { createSlideScene, sequenceSlides } from '../../visual-explainer-mdx/graphic-slides';
import { createQuantityFigure, quantityFigureAnchors, quantitySourceVersions, motionReviewTiming } from './motion-review-source';
import '../../visual-explainer-mdx/themes.css';

export type MotionReviewTiming = Readonly<{
  duration: number; audioStart: number; audioDuration: number; cues: readonly NarrationCue[];
  wordCues?: readonly Readonly<{ text: string; start: number; end: number }>[];
}>;

/** A contradiction, its cause, a correction, and two concrete checks on one clock. */
export function createMotionReview(timing: MotionReviewTiming = motionReviewTiming, narrow = false) {
  const { duration } = timing;
  const cues = normalizeNarrationCues(timing.cues, { duration });
  const byId = Object.fromEntries(cues.map(cue => [cue.id, cue]));
  for (const id of ['hook', 'trace', 'broken', 'contrast', 'fix', 'replay', 'close']) if (!byId[id]) throw new Error(`Missing story cue: ${id}`);
  const normalized = (word: string) => word.toLowerCase().replace(/[^a-z0-9]/g, '');
  const atWord = (phase: string, word: string, fraction: number, occurrence = 0) => {
    const cue = byId[phase];
    const observed = timing.wordCues?.filter(item => item.start >= cue.start - .001 && item.start < cue.end && normalized(item.text) === normalized(word))[occurrence];
    if (timing.wordCues && !observed) throw new Error(`Missing aligned word ${phase}:${word}:${occurrence}`);
    return observed?.start ?? cue.start + (cue.end - cue.start) * fraction;
  };
  const cacheArrival = atWord('trace', 'zero', .18);
  const handlerArrival = atWord('trace', 'line', .75);
  const beforeSave = atWord('broken', 'save', .94);
  const editStart = byId.fix.start, editEnd = editStart + .65;
  const fixedRuleStart = atWord('fix', 'Now', .3);
  const replayCache = atWord('replay', 'cache', .34);
  const replayHandler = atWord('replay', 'handler', .48);
  const storageArrival = atWord('replay', 'storage', .69);
  const missingExample = atWord('replay', 'missing', .81);
  if (fixedRuleStart < editEnd || storageArrival + .3 >= missingExample) throw new Error('Narration leaves no stable interval for correction and counterexample.');
  const a = quantityFigureAnchors;
  const route = prepareGraphicRoute({ start: a.request, tolerance: .08, segments: [
    { kind: 'line', to: a.handler },
    { kind: 'quadratic', control: { x: 182, y: 77 }, to: a.cache },
    { kind: 'quadratic', control: { x: 168, y: 163 }, to: a.handler },
    { kind: 'quadratic', control: { x: 262, y: 98 }, to: a.storage },
    { kind: 'quadratic', control: { x: 296, y: 211 }, to: a.result },
  ] });
  let previousIndex = -1;
  const distances = [a.request, a.handler, a.cache, a.handler, a.storage, a.result].map(point => {
    const index = route.points.findIndex((candidate, index) => index > previousIndex && candidate.x === point.x && candidate.y === point.y);
    if (index < 0) throw new Error('Prepared route omitted an authored endpoint.');
    previousIndex = index;
    return route.cumulativeLengths[index] / route.length;
  });
  const [requestDistance, handlerIn, cacheDistance, handlerOut, storageDistance, resultDistance] = distances;
  const figure = (written: 0 | 1) => {
    const base = createQuantityFigure(written);
    return createGraphicScene({ ...base, objects: [
      ...base.objects,
      { id: 'request-route-guide', kind: 'illustration', primitives: [{ kind: 'path', d: route.d, fill: 'none', stroke: 'frame', strokeRole: 'guide', dash: '2 3' }] },
      { id: 'request-route', kind: 'illustration', primitives: [{ kind: 'path', d: route.d, fill: 'none', stroke: 'accent', strokeRole: 'active' }] },
      { id: 'request-carrier', kind: 'illustration', meaning: 'The cart count travels between its owners.', primitives: [{ kind: 'circle', x: 0, y: 0, radius: 3.8, fill: 'accent', stroke: 'background', strokeWidth: 1.1 }] },
    ] });
  };
  const before = figure(1), after = figure(0);
  const source = createSourceScene({
    id: 'cached-quantity-source', title: 'Preserve the empty cart',
    description: 'The illustrative handler reads a cached cart quantity, applies a default, saves it, and returns it.',
    bounds: { x: 0, y: 0, width: 660, height: 460 },
    layout: { x: 16, y: 52, fontSize: 32, columnWidth: 19.2, lineHeight: 48 },
    versions: quantitySourceVersions,
    ranges: [
      { id: 'cache-read', version: 'before', start: { line: 1, column: 1 }, end: { line: 1, column: 'const cached = cache.get(key);'.length + 1 } },
      { id: 'before-operator', version: 'before', start: { line: 2, column: 'const quantity = cached '.length + 1 }, end: { line: 2, column: 'const quantity = cached '.length + 3 } },
      { id: 'after-operator', version: 'after', start: { line: 2, column: 'const quantity = cached '.length + 1 }, end: { line: 2, column: 'const quantity = cached '.length + 3 } },
      { id: 'after-assignment', version: 'after', start: { line: 2, column: 1 }, end: { line: 2, column: 'const quantity = cached ?? 1;'.length + 1 } },
    ],
  });
  const fixedRule = {
    ...byId.fix, id: 'fixed-rule', start: fixedRuleStart,
    text: 'Now the default applies only to null or undefined. Zero survives.',
    sourceInterval: { start: fixedRuleStart - timing.audioStart, end: byId.fix.sourceInterval?.end ?? byId.fix.end - timing.audioStart },
  };
  const focus = focusSourceRange(source, before, {
    duration, cues: [byId.trace, byId.broken, fixedRule, byId.replay],
    edits: [{ from: 'before', to: 'after', start: editStart, duration: editEnd - editStart }],
    bindings: [
      { cueId: 'trace', rangeId: 'cache-read', target: 'cache' },
      { cueId: 'broken', rangeId: 'before-operator', target: 'handler' },
      { cueId: 'fixed-rule', rangeId: 'after-operator', target: 'handler' },
      { cueId: 'replay', rangeId: 'after-assignment', target: 'handler' },
    ],
  });
  // Reveal each literal line when it first matters; the later identity edit keeps
  // ownership of its opacity channel during the correction itself.
  const lineShows = [byId.trace.start, atWord('trace', 'This', .68), 0, atWord('broken', 'That', .78)];
  const sourceTracks: GraphicMotionTrack[] = Object.entries(source.layouts.before).map(([target, origin]) => {
    const row = Math.round((origin.y - 52) / 48);
    return { target, property: 'opacity', start: row >= 3 ? lineShows[3] : lineShows[row], duration: .22, from: 0, to: 1, ease: 'smooth' };
  });
  const sourceScene = createGraphicScene({ ...source.scene, objects: [...source.scene.objects, {
    id: 'story:question', kind: 'illustration', meaning: 'Zero becomes one. Where did the extra item come from?',
    primitives: [
      { kind: 'text', x: 330, y: 180, lines: ['0 → 1'], size: 104, leading: 110, font: 'mono', anchor: 'middle', fill: 'ink' },
      { kind: 'text', x: 330, y: 255, lines: ['Where did the extra', 'item come from?'], size: 36, leading: 44, font: 'body', anchor: 'middle', fill: 'ink' },
    ],
  }] });
  const sourceMotion = defineGraphicMotion(sourceScene, { duration, tracks: [
    ...sourceTracks, ...focus.sourceMotion.tracks,
    { target: 'story:question', property: 'opacity', start: 0, duration: .3, from: 0, to: 1, ease: 'smooth' },
    { target: 'story:question', property: 'opacity', start: byId.trace.start - .25, duration: .25, from: 1, to: 0, ease: 'smooth' },
  ] });
  const requestMotion = followPath(before, {
    duration, target: 'request-carrier', route, trace: 'request-route',
    traversal: { mode: 'timestamp', ease: 'linear', keys: [
      { at: 0, distance: requestDistance },
      { at: byId.trace.start, distance: requestDistance },
      { at: byId.trace.start + (cacheArrival - byId.trace.start) * .45, distance: handlerIn },
      { at: cacheArrival, distance: cacheDistance },
      { at: handlerArrival, distance: handlerOut },
      { at: atWord('broken', 'fallback', .6), distance: handlerOut },
      { at: beforeSave, distance: storageDistance },
      { at: byId.broken.end, distance: storageDistance },
      { at: byId.replay.start - .3, distance: storageDistance },
      { at: byId.replay.start, distance: requestDistance },
      { at: byId.replay.start + (replayCache - byId.replay.start) * .4, distance: handlerIn },
      { at: replayCache, distance: cacheDistance },
      { at: replayHandler, distance: handlerOut },
      { at: storageArrival, distance: storageDistance },
      { at: missingExample - .4, distance: resultDistance },
    ] },
  });
  const intervals = (target: string, property: 'opacity' | 'highlight', spans: readonly (readonly [number, number])[]): GraphicMotionTrack[] => {
    const active = (time: number) => spans.some(([start, end]) => time >= start && (time < end || end === duration && time === duration)) ? 1 : 0;
    const boundaries = [...new Set([0, duration, ...spans.flatMap(pair => [...pair])])].sort((a, b) => a - b);
    return boundaries.slice(1).map((end, index) => ({ target, property, interpolation: 'step-end', start: boundaries[index], duration: end - boundaries[index], from: active(boundaries[index]), to: active(end) }));
  };
  const visibleMotion: GraphicMotionTrack[] = [
    ...intervals('storage', 'highlight', [[byId.hook.start, byId.hook.end], [beforeSave, byId.broken.end], [storageArrival, missingExample]]),
    ...intervals('result', 'highlight', [[byId.close.start, duration]]),
    ...intervals('value:returned', 'opacity', [[missingExample - .4, duration]]),
    ...['request-carrier', 'request-route', 'request-route-guide'].flatMap(target => intervals(target, 'opacity', [[byId.trace.start, byId.broken.end], [byId.replay.start, missingExample]])),
  ];
  const figureMotion = defineGraphicMotion(before, { duration, tracks: [...requestMotion.tracks, ...focus.diagramMotion.tracks, ...visibleMotion] });
  // The saved count changes only once the corrected request reaches storage.
  const comparison = comparisonWipe({
    id: 'quantity-comparison', title: 'How zero becomes one',
    description: 'The count stays one until the corrected zero actually reaches storage.',
    before, after, beforeMotion: figureMotion, afterMotion: figureMotion,
    registration: ['base', 'request', 'handler', 'cache', 'storage', 'result'],
    duration, start: storageArrival, transition: .3, from: 0, to: 1, axis: 'x', ease: 'smooth',
  });
  const equation = (id: string, lines: readonly string[], size = 38) => ({
    id, kind: 'illustration' as const, meaning: lines.join(' '),
    primitives: [{ kind: 'text' as const, x: narrow ? 330 : 730, y: 44, lines, size, leading: 52, font: 'mono' as const, anchor: 'middle' as const, fill: 'ink' as const }],
  });
  const annotations = createGraphicScene({
    id: 'literal-cases', title: 'Evaluate the actual cases', description: 'Zero and a missing value select different branches.',
    bounds: { x: 0, y: 0, width: narrow ? 660 : 1460, height: narrow ? 160 : 145 }, objects: [
      equation('equation:wrong', ['0  ||  1  →  1'], 46),
      equation('equation:meaning', narrow ? ['0: empty cart', 'null / undefined:', 'no saved quantity'] : ['0: empty cart', 'null / undefined: no saved quantity'], 34),
      equation('equation:fixed', ['0  ??  1  →  0'], 46),
      equation('equation:both', narrow ? ['0 ?? 1 → 0', 'null ?? 1 → 1'] : ['0 ?? 1 → 0     ·     null ?? 1 → 1'], 38),
    ],
  });
  const annotationMotion = defineGraphicMotion(annotations, { duration, tracks: [
    ...intervals('equation:wrong', 'opacity', [[byId.broken.start, byId.broken.end]]),
    ...intervals('equation:meaning', 'opacity', [[byId.contrast.start, byId.contrast.end]]),
    ...intervals('equation:fixed', 'opacity', [[editEnd, missingExample]]),
    ...intervals('equation:both', 'opacity', [[missingExample, duration]]),
  ] });
  const composition = composeGraphics({
    id: 'motion-review-figure', title: comparison.scene.title,
    description: 'An empty cart silently becomes one item. Trace the cause, change the condition, and prove zero and missing separately.',
    bounds: narrow ? { x: 0, y: 0, width: 660, height: 1165 } : { x: 0, y: 0, width: 1460, height: 635 }, duration,
    instances: [
      { id: 'figure', ...comparison, frame: { x: 0, y: 0, width: 660, height: 460 }, clip: 'frame' },
      { id: 'source', scene: sourceScene, motion: sourceMotion, frame: narrow ? { x: 0, y: 500, width: 660, height: 460 } : { x: 735, y: 0, width: 725, height: 460 }, clip: 'frame' },
      { id: 'cases', scene: annotations, motion: annotationMotion, frame: { x: 0, y: narrow ? 990 : 490, width: narrow ? 660 : 1460, height: narrow ? 175 : 145 }, clip: 'frame' },
    ],
  });
  const slide = createSlideScene({
    id: 'keep-zero', title: 'How zero becomes one.', explanation: 'An empty cart should stay empty.',
    graphic: composition.scene, width: 1920, height: 1080, preset: 'iso', appearance: 'light',
  });
  const sequence = sequenceSlides('artifacture-motion-review', [{ slide, motion: composition.motion, duration }]);
  const moments = { cacheArrival, handlerArrival, beforeSave, editStart, editEnd, fixedRuleStart, replayCache, replayHandler, storageArrival, missingExample };
  return { ...composition, sequence, source, route, cues, moments, receipt: { cues: focus.cues, bindings: focus.bindings, moments } };
}

export const review = createMotionReview();
export const narrowReview = createMotionReview(motionReviewTiming, true);
export const sequence = review.sequence;

type Theme = 'iso' | '3b1b' | 'mono-color' | 'algebrica';
const themes: readonly Readonly<{ id: Theme; label: string }>[] = [
  { id: 'iso', label: 'ISO' }, { id: '3b1b', label: '3b1b' },
  { id: 'mono-color', label: 'Mono Color' }, { id: 'algebrica', label: 'Algebrica' },
];

export default function MotionReview() {
  const [time, setTime] = useState(0);
  const [theme, setTheme] = useState<Theme>('iso');
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => setNarrow(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const currentCue = review.cues.find(cue => time >= cue.start && time < cue.end);
  const prepared = narrow ? narrowReview : review;
  const scene: GraphicScene = sampleScene(prepared.scene, prepared.motion, time);
  const setFiniteTime = (value: number) => { if (Number.isFinite(value)) setTime(Math.max(0, Math.min(sequence.duration, value))); };
  const chapter = (id: string) => review.cues.find(cue => cue.id === id)!.start;
  return <main data-ve-preset={theme} style={{ minHeight: '100vh', background: 'var(--ve-bg)', color: 'var(--ve-text)', fontFamily: 'var(--ve-font-body)', padding: 'clamp(24px,5vw,72px)' }}>
    <div style={{ maxWidth: 1400, margin: 'auto' }}>
      <h1 style={{ fontSize: 'clamp(36px,5vw,66px)', lineHeight: 1.05, fontWeight: 500, margin: '0 0 20px' }}>How zero becomes one.</h1>
      <p style={{ fontSize: 21, maxWidth: '64ch', lineHeight: 1.5 }}>An empty cart should stay empty. Find the line that changes its quantity, correct its condition, and check both zero and a missing value.</p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0' }}>Theme <select aria-label="Theme" value={theme} onChange={event => { const selected = themes.find(item => item.id === event.target.value); if (selected) setTheme(selected.id); }} style={{ font: 'inherit', padding: '8px 12px', color: 'var(--ve-text)', background: 'var(--ve-bg)', border: '1px solid var(--ve-rule)' }}>{themes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <GraphicCanvas scene={scene} instancePrefix="motion-review-interactive" style={{ width: '100%', height: 'auto', minHeight: 280 }} />
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', marginTop: 28 }}>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>Time <input aria-label="Time" type="number" min="0" max={sequence.duration} step="0.01" value={time} onChange={event => setFiniteTime(Number(event.target.value))} style={{ width: 112, padding: '8px 12px', font: 'inherit', color: 'var(--ve-text)', background: 'var(--ve-bg)', border: '1px solid var(--ve-rule)' }} /> seconds</label>
        <input aria-label="Explore time" type="range" min="0" max={sequence.duration} step="0.01" value={time} onChange={event => setFiniteTime(Number(event.target.value))} style={{ flex: '1 1 300px', accentColor: 'var(--ve-accent)' }} />
      </div>
      <nav aria-label="Explanation moments" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 22 }}>{[
        ['See the wrong count', chapter('hook')], ['Trace zero', chapter('trace')], ['Explain ||', chapter('broken')],
        ['Zero versus missing', chapter('contrast')], ['Change the condition', review.moments.editEnd + .1],
        ['Replay the fix', review.moments.storageArrival + .4], ['Check a missing value', review.moments.missingExample + .1],
      ].map(([label, at]) => <button key={label} type="button" onClick={() => setFiniteTime(Number(at))} style={{ font: 'inherit', padding: '10px 14px', color: 'var(--ve-text)', background: 'var(--ve-bg)', border: '1px solid var(--ve-rule)', cursor: 'pointer' }}>{label}</button>)}</nav>
      <p aria-live="polite" style={{ maxWidth: '74ch', lineHeight: 1.6, fontSize: 19, minHeight: '3.2em' }}>{currentCue?.text ?? 'Select a moment or move time to follow the explanation.'}</p>
      <details style={{ marginTop: 26 }}><summary>Use these blocks</summary><pre style={{ overflowX: 'auto', padding: 20, lineHeight: 1.7, fontFamily: 'var(--ve-font-mono)', background: 'var(--ve-panel)' }}><code>artifacture add follow-path comparison-wipe source-range-focus --cwd ./explainer</code></pre><p>The route, registered comparison, and exact source ranges compile to the same GraphicMotion data used by this film.</p></details>
      <p style={{ marginTop: 32, lineHeight: 1.6 }}>The cart handler is illustrative. <a href="../" style={{ color: 'var(--ve-accent)' }}>Watch the narrated film</a>.</p>
    </div>
  </main>;
}

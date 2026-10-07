import { createIsoScene, projectIsoPoint, type IsoPart } from '../../visual-explainer-mdx/iso-scene';
import { createGraphicScene } from '../../visual-explainer-mdx/graphics-types';
import { defineGraphicMotion } from '../../visual-explainer-mdx/graphic-motion';
import { prepareGraphicRoute } from '../../visual-explainer-mdx/graphic-routes';

export const duration = 5.6;
const windows = Array.from({ length: 15 }, (_, i) => ({ face: 'front' as const, x: 10 + (i % 3) * 18, y: 14 + Math.floor(i / 3) * 23, width: 10, height: 14, radius: 1, live: true }));
export const parts: readonly IsoPart[] = [
  { id: 'plate', meaning: 'The circuit shares one physical ground.', origin: { x: 0, y: 0, z: 0 }, size: { width: 260, depth: 210, height: 8 }, radius: 9 },
  { id: 'tower', meaning: 'The receiver lights only when power arrives.', origin: { x: 55, y: 36, z: 8 }, size: { width: 76, depth: 75, height: 148 }, radius: 4, details: [...windows, ...Array.from({ length: 5 }, (_, i) => ({ face: 'top' as const, x: 12, y: 12 + i * 10, width: 52, height: 2, radius: 1 }))] },
  { id: 'switch', meaning: 'The switch launches the signal.', origin: { x: 172, y: 154, z: 8 }, size: { width: 46, depth: 34, height: 14 }, radius: 3, details: [{ face: 'top', x: 10, y: 8, width: 26, height: 18, radius: 3, live: true }] },
];
const physical = createIsoScene({ id: 'iso-signal', title: 'Power follows the circuit', description: 'A switch sends a signal along the ground plane. The tower lights when the signal arrives.', parts, bounds: { x: -210, y: -160, width: 480, height: 435 } });
const from = projectIsoPoint({ x: 174, y: 169, z: 10 });
const bend = projectIsoPoint({ x: 107, y: 169, z: 10 });
const to = projectIsoPoint({ x: 107, y: 112, z: 10 });
export const route = prepareGraphicRoute({ start: from, segments: [{ kind: 'line', to: bend }, { kind: 'line', to }] });
// Ground wire is below the physical parts; a small carrier rides its exact path.
export const scene = createGraphicScene({ ...physical, objects: [
  physical.objects[0],
  { id: 'wire', kind: 'illustration', primitives: [{ kind: 'path', d: route.d, fill: 'none', stroke: 'illustration-muted', strokeRole: 'detail' }] },
  { id: 'trace', kind: 'illustration', primitives: [{ kind: 'path', d: route.d, fill: 'none', stroke: 'accent', strokeRole: 'active' }] },
  { id: 'signal', kind: 'illustration', primitives: [{ kind: 'circle', x: from.x, y: from.y, radius: 2.2, fill: 'live', glow: true }], state: { opacity: 1, reveal: 1, highlight: true, x: 0, y: 0 } },
  ...physical.objects.slice(1),
] });
export const motion = defineGraphicMotion(scene, { duration, tracks: [
  { target: 'tower', property: 'translation', start: 0, duration: .4, from: { x: 0, y: -28 }, to: { x: 0, y: 0 }, ease: 'soft-land' },
  { target: 'switch', property: 'translation', start: .1, duration: .37, from: { x: 0, y: -20 }, to: { x: 0, y: 0 }, ease: 'snap-settle' },
  { target: 'switch', property: 'translation', start: .7, duration: .1, from: { x: 0, y: 0 }, to: { x: 0, y: 3 }, ease: 'gentle-in' },
  { target: 'switch', property: 'translation', start: .8, duration: .17, from: { x: 0, y: 3 }, to: { x: 0, y: 0 }, ease: 'soft-land' },
  { target: 'switch', property: 'highlight', start: .7, duration: .1, from: 0, to: 1, interpolation: 'step-end' },
  { target: 'trace', property: 'reveal', start: .8, duration: 1.2, from: 0, to: 1, ease: 'glide' },
  { target: 'signal', property: 'opacity', start: .7, duration: .1, from: 0, to: 1, interpolation: 'step-end' },
  { target: 'signal', property: 'route', route, anchor: from, start: .8, duration: 1.2, from: 0, to: 1, ease: 'glide' },
  { target: 'tower', property: 'highlight', start: 2 - 1 / 30, duration: 1 / 30, from: 0, to: 1, interpolation: 'step-end' },
  { target: 'signal', property: 'opacity', start: 2, duration: .2, from: 1, to: 0, ease: 'soft-in-out' },
  { target: 'switch', property: 'highlight', start: 2 - 1 / 30, duration: 1 / 30, from: 1, to: 0, interpolation: 'step-end' },
  { target: 'switch', property: 'translation', start: 3.9, duration: .1, from: { x: 0, y: 0 }, to: { x: 0, y: 3 }, ease: 'gentle-in' },
  { target: 'switch', property: 'translation', start: 4, duration: .17, from: { x: 0, y: 3 }, to: { x: 0, y: 0 }, ease: 'soft-land' },
  // De-energize on the new press, then accelerate the trace back out.
  { target: 'tower', property: 'highlight', start: 3.9, duration: .1, from: 1, to: 0, interpolation: 'step-end' },
  { target: 'trace', property: 'reveal', start: 4, duration: .43, from: 1, to: 0, ease: 'accel-exit' },
] });

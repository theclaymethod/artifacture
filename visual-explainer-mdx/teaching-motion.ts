import { defineGraphicMotion, type GraphicMotion, type GraphicMotionTrack } from './graphic-motion';
import type { GraphicScene } from './graphics-types';
import { validateGraphicRoute, type GraphicPoint, type PreparedGraphicRoute } from './graphic-routes';

export type RouteTimestamp = Readonly<{ at: number; distance: number; focus?: string }>;
export type FollowPathInput = Readonly<{
  duration: number; target: string; route: PreparedGraphicRoute; anchor?: GraphicPoint; trace?: string; initialFocus?: string;
  traversal:
    | Readonly<{ mode: 'distance'; start: number; duration: number; from?: number; to?: number; ease?: 'linear' | 'smooth'; arrivalFocus?: string }>
    | Readonly<{ mode: 'timestamp'; keys: readonly RouteTimestamp[]; ease?: 'linear' | 'smooth' }>;
}>;

/** Compile distance traversal and exact arrival focus into the shared scene clock. */
export function followPath(scene: GraphicScene, input: FollowPathInput): GraphicMotion {
  validateGraphicRoute(input.route);
  const carrier = scene.objects.find(object => object.id === input.target);
  if (!carrier || carrier.kind !== 'illustration') throw new Error('A path carrier must be a declared illustration.');
  if (input.trace) {
    const trace = scene.objects.find(object => object.id === input.trace);
    const placement = (object: typeof carrier) => { const value = object.placement ?? { x: 0, y: 0, scale: 1 }; return [value.x, value.y, value.scale]; };
    if (!trace || trace.primitives.length !== 1 || trace.primitives[0].kind !== 'path' || trace.primitives[0].d !== input.route.d || JSON.stringify(placement(trace)) !== JSON.stringify(placement(carrier)) || trace.state?.x || trace.state?.y) throw new Error('A route trace needs the exact prepared path and the carrier placement, without translation.');
  }
  const traversal = input.traversal;
  const keys: readonly RouteTimestamp[] = traversal.mode === 'distance' ? [
    { at: traversal.start, distance: traversal.from ?? 0 },
    { at: traversal.start + traversal.duration, distance: traversal.to ?? 1, focus: traversal.arrivalFocus },
  ] : traversal.keys;
  if (!['distance', 'timestamp'].includes(traversal.mode) || keys.length < 2 || keys.some((key, index) => !Number.isFinite(key.at) || key.at < 0 || key.at > input.duration || !Number.isFinite(key.distance) || key.distance < 0 || key.distance > 1 || index > 0 && key.at <= keys[index - 1].at)) throw new Error('Traversal keys need increasing finite times and normalized route distances.');
  const tracks: GraphicMotionTrack[] = [];
  for (let index = 1; index < keys.length; index++) {
    const previous = keys[index - 1], next = keys[index];
    const timing = { start: previous.at, duration: next.at - previous.at, from: previous.distance, to: next.distance, ease: traversal.ease };
    tracks.push({ ...timing, target: input.target, property: 'route', route: input.route, anchor: input.anchor });
    if (input.trace) tracks.push({ ...timing, target: input.trace, property: 'reveal' });
  }
  const changes = keys.filter(key => key.focus !== undefined).map(key => ({ at: key.at, focus: key.focus! }));
  const targets = new Set([...(input.initialFocus ? [input.initialFocus] : []), ...changes.map(change => change.focus)]);
  for (const target of targets) {
    let current = input.initialFocus === target ? 1 : 0, previous = 0;
    for (const change of changes) {
      const next = change.focus === target ? 1 : 0;
      if (change.at > previous) tracks.push({ target, property: 'highlight', interpolation: 'step-end', start: previous, duration: change.at - previous, from: current, to: next });
      current = next; previous = change.at;
    }
    if (previous < input.duration) tracks.push({ target, property: 'highlight', interpolation: 'step-end', start: previous, duration: input.duration - previous, from: current, to: current });
  }
  return defineGraphicMotion(scene, { duration: input.duration, tracks });
}

export type OrderedMotionInput = Readonly<{ targets: readonly string[]; duration: number; start?: number; step?: number; transition?: number }>;
function timing(input: OrderedMotionInput) {
  const start = input.start ?? 0, transition = input.transition ?? .3;
  const step = input.step ?? Math.max(transition, (input.duration - start - transition) / Math.max(1, input.targets.length));
  if (!input.targets.length || new Set(input.targets).size !== input.targets.length || !Number.isFinite(start) || start < 0 || !Number.isFinite(step) || step < transition || !Number.isFinite(transition) || transition <= 0) throw new Error('Ordered motion needs unique targets and finite nonoverlapping steps.');
  return { start, transition, step };
}
function fitTransition(start: number, duration: number, limit: number): number {
  const excess = start + duration - limit;
  return excess > 0 && excess <= Number.EPSILON * 8 * Math.max(1, Math.abs(start), Math.abs(limit)) ? limit - start : duration;
}
export function revealInOrder(scene: GraphicScene, input: OrderedMotionInput & Readonly<{ property?: 'opacity' | 'reveal' }>): GraphicMotion {
  const { start, transition, step } = timing(input);
  return defineGraphicMotion(scene, { duration: input.duration, tracks: input.targets.map((target, order) => ({ target, property: input.property ?? 'opacity', start: start + order * step, duration: fitTransition(start + order * step, transition, input.duration), from: 0, to: 1, ease: 'smooth' })) });
}
export function focusInOrder(scene: GraphicScene, input: OrderedMotionInput): GraphicMotion {
  const { start, transition, step } = timing(input);
  const tracks: GraphicMotionTrack[] = [];
  for (const [order, target] of input.targets.entries()) {
    tracks.push({ target, property: 'highlight', start: start + order * step, duration: fitTransition(start + order * step, transition, order < input.targets.length - 1 ? Math.min(input.duration, start + (order + 1) * step) : input.duration), from: 0, to: 1 });
    if (order < input.targets.length - 1) tracks.push({ target, property: 'highlight', start: start + (order + 1) * step, duration: fitTransition(start + (order + 1) * step, transition, input.duration), from: 1, to: 0 });
  }
  return defineGraphicMotion(scene, { duration: input.duration, tracks });
}

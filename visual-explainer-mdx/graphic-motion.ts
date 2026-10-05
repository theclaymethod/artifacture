import type { GraphicBounds, GraphicClip, GraphicObject, GraphicScene } from './graphics-types';
import { createGraphicScene, validateGraphicBounds, validateGraphicScene } from './graphics-types';
import { sampleGraphicRoute, validateGraphicRoute, type GraphicPoint, type PreparedGraphicRoute } from './graphic-routes';
import { intersectGraphicClips } from './graphic-clips';

type Timing = Readonly<{ target: string; start: number; duration: number; ease?: 'linear' | 'smooth' }>;
export type GraphicMotionTrack = Timing & (
  | Readonly<{ property: 'opacity' | 'reveal'; from: number; to: number; interpolation?: 'step-end' }>
  | Readonly<{ property: 'highlight'; from: number; to: number; interpolation?: 'threshold' | 'step-end' }>
  | Readonly<{ property: 'translation'; from: GraphicPoint; to: GraphicPoint }>
  | Readonly<{ property: 'route'; route: PreparedGraphicRoute; anchor?: GraphicPoint; from: number; to: number }>
  | Readonly<{ property: 'mask'; bounds: GraphicBounds; axis: 'x' | 'y'; side: 'start' | 'end'; from: number; to: number }>
);
export type GraphicMotion = Readonly<{ duration: number; tracks: readonly GraphicMotionTrack[] }>;

export function defineGraphicMotion(scene: GraphicScene, motion: GraphicMotion): GraphicMotion {
  validateMotion(scene, motion);
  const result = structuredClone(motion);
  for (const track of result.tracks) {
    if (track.property === 'translation') { Object.freeze(track.from); Object.freeze(track.to); }
    if (track.property === 'route') {
      track.route.points.forEach(Object.freeze); Object.freeze(track.route.points); Object.freeze(track.route.cumulativeLengths); Object.freeze(track.route);
      if (track.anchor) Object.freeze(track.anchor);
    }
    if (track.property === 'mask') Object.freeze(track.bounds);
    Object.freeze(track);
  }
  Object.freeze(result.tracks);
  return Object.freeze(result);
}
function channel(track: GraphicMotionTrack): string {
  return `${track.target}:${track.property === 'route' ? 'translation' : track.property === 'mask' ? 'clip' : track.property}`;
}

function validateMotion(scene: GraphicScene, motion: GraphicMotion) {
  validateGraphicScene(scene);
  if (!Number.isFinite(motion.duration) || motion.duration <= 0) throw new Error('Motion duration must be finite and positive.');
  const objects = new Map(scene.objects.map((object) => [object.id, object]));
  const intervals = new Map<string, GraphicMotionTrack[]>();
  for (const track of motion.tracks) {
    const object = objects.get(track.target);
    if (!object) throw new Error(`Unknown motion target: ${track.target}`);
    if (!['opacity', 'reveal', 'highlight', 'translation', 'route', 'mask'].includes(track.property)) throw new Error(`Unsupported motion property: ${track.property}`);
    if (track.ease !== undefined && track.ease !== 'linear' && track.ease !== 'smooth') throw new Error(`Unsupported motion ease: ${track.ease}`);
    if (!Number.isFinite(track.start) || track.start < 0 || !Number.isFinite(track.duration) || track.duration <= 0 || track.start + track.duration > motion.duration) throw new Error(`Motion track exceeds its finite duration: ${track.target}`);
    if (track.property === 'translation') {
      if ([track.from.x, track.from.y, track.to.x, track.to.y].some((n) => !Number.isFinite(n))) throw new Error(`Translation must be finite: ${track.target}`);
    } else if ([track.from, track.to].some((n) => !Number.isFinite(n) || n < 0 || n > 1)) throw new Error(`Opacity, reveal, and highlight values must be between zero and one: ${track.target}`);
    if (track.property === 'route') {
      validateGraphicRoute(track.route);
      if (track.anchor && [track.anchor.x, track.anchor.y].some(n => !Number.isFinite(n))) throw new Error(`Route anchors must be finite: ${track.target}`);
      const anchor = track.anchor ?? { x: 0, y: 0 };
      if (track.route.points.some(point => !Number.isFinite(point.x - anchor.x) || !Number.isFinite(point.y - anchor.y))) throw new Error(`Route translation exceeds finite geometry: ${track.target}`);
    }
    if (track.property === 'mask') {
      validateGraphicBounds(track.bounds);
      if (!['x', 'y'].includes(track.axis) || !['start', 'end'].includes(track.side)) throw new Error(`Unsupported comparison mask: ${track.target}`);
    }
    if (track.property === 'highlight' && track.interpolation !== undefined && !['threshold', 'step-end'].includes(track.interpolation)) throw new Error(`Unsupported highlight interpolation: ${track.target}`);
    if ((track.property === 'opacity' || track.property === 'reveal') && track.interpolation !== undefined && track.interpolation !== 'step-end') throw new Error(`Unsupported scalar interpolation: ${track.target}`);
    if (track.property === 'reveal' && object.primitives.some((p) => p.kind !== 'path')) throw new Error(`Reveal supports path-only objects: ${track.target}`);
    if ((track.property === 'translation' || track.property === 'route') && object.kind !== 'illustration') throw new Error(`Translation supports illustration objects. Relayout diagrams through createDiagramScene: ${track.target}`);
    const key = channel(track);
    const previous = intervals.get(key) ?? [];
    if (previous.some((p) => track.start < p.start + p.duration && p.start < track.start + track.duration)) throw new Error(`Overlapping tracks for ${key}.`);
    intervals.set(key, [...previous, track]);
  }
}

export function sampleScene(input: GraphicScene, motion: GraphicMotion, authoredSeconds: number): GraphicScene {
  const base = createGraphicScene(input);
  validateMotion(base, motion);
  if (!Number.isFinite(authoredSeconds) || authoredSeconds < 0) throw new Error('Authored time must be finite and nonnegative.');
  const time = Math.min(authoredSeconds, motion.duration);
  const grouped = new Map<string, GraphicMotionTrack[]>();
  for (const track of motion.tracks) {
    const key = channel(track);
    grouped.set(key, [...(grouped.get(key) ?? []), track]);
  }
  const states = new Map<string, NonNullable<GraphicObject['state']>>();
  const clips = new Map<string, GraphicClip | undefined>();
  const baseClips = new Map(base.objects.map(object => [object.id, object.clip]));
  const baseStates = new Map(base.objects.map((object) => [object.id, object.state]));
  for (const tracks of grouped.values()) {
    tracks.sort((a, b) => a.start - b.start);
    const track = tracks.filter((t) => t.start <= time).at(-1) ?? tracks[0];
    let progress = Math.min(1, Math.max(0, (time - track.start) / track.duration));
    if (track.ease === 'smooth') progress = progress * progress * (3 - 2 * progress);
    const state = { ...(states.get(track.target) ?? baseStates.get(track.target) ?? { opacity: 1, reveal: 1, highlight: false, x: 0, y: 0 }) };
    if (track.property === 'translation') {
      state.x = interpolate(track.from.x, track.to.x, progress);
      state.y = interpolate(track.from.y, track.to.y, progress);
    } else if (track.property === 'route') {
      const point = sampleGraphicRoute(track.route, interpolate(track.from, track.to, progress));
      state.x = point.x - (track.anchor?.x ?? 0);
      state.y = point.y - (track.anchor?.y ?? 0);
    } else if (track.property === 'mask') {
      const fraction = interpolate(track.from, track.to, progress);
      const amount = track.side === 'start' ? fraction : 1 - fraction;
      const bounds = track.bounds;
      const maskBounds = {
        x: bounds.x + (track.axis === 'x' && track.side === 'end' ? bounds.width * fraction : 0),
        y: bounds.y + (track.axis === 'y' && track.side === 'end' ? bounds.height * fraction : 0),
        width: track.axis === 'x' ? bounds.width * amount : bounds.width,
        height: track.axis === 'y' ? bounds.height * amount : bounds.height,
      };
      const mask: GraphicClip = maskBounds.width > 0 && maskBounds.height > 0 ? { kind: 'rect', bounds: maskBounds } : { kind: 'empty' };
      clips.set(track.target, intersectGraphicClips(baseClips.get(track.target), mask));
      continue;
    } else {
      const value = interpolate(track.from, track.to, progress);
      if (track.property === 'highlight') state.highlight = track.interpolation === 'step-end' ? (time < track.start + track.duration ? track.from : track.to) >= 0.5 : track.to < track.from ? value > 0.5 : value >= 0.5;
      else state[track.property] = track.interpolation === 'step-end' ? (time < track.start + track.duration ? track.from : track.to) : value;
    }
    states.set(track.target, Object.freeze(state));
  }
  return createGraphicScene({ ...base, objects: base.objects.map(object => {
    if (!states.has(object.id) && !clips.has(object.id)) return object;
    if (!clips.has(object.id)) return { ...object, state: states.get(object.id) };
    if (!states.has(object.id)) return { ...object, clip: clips.get(object.id) };
    return { ...object, state: states.get(object.id), clip: clips.get(object.id) };
  }) });
}

function interpolate(from: number, to: number, progress: number) {
  if (progress === 0) return from;
  if (progress === 1) return to;
  return Math.min(Math.max(from * (1 - progress) + to * progress, Math.min(from, to)), Math.max(from, to));
}

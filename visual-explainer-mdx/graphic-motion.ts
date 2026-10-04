import type { GraphicObject, GraphicScene } from './graphics-types';
import { createGraphicScene, validateGraphicScene } from './graphics-types';

type Timing = Readonly<{ target: string; start: number; duration: number; ease?: 'linear' | 'smooth' }>;
export type GraphicMotionTrack = Timing & (
  | Readonly<{ property: 'opacity' | 'reveal' | 'highlight'; from: number; to: number }>
  | Readonly<{ property: 'translation'; from: Readonly<{ x: number; y: number }>; to: Readonly<{ x: number; y: number }> }>
);
export type GraphicMotion = Readonly<{ duration: number; tracks: readonly GraphicMotionTrack[] }>;

export function defineGraphicMotion(scene: GraphicScene, motion: GraphicMotion): GraphicMotion {
  validateMotion(scene, motion);
  const result = structuredClone(motion);
  result.tracks.forEach((track) => {
    if (track.property === 'translation') { Object.freeze(track.from); Object.freeze(track.to); }
    Object.freeze(track);
  });
  Object.freeze(result.tracks);
  return Object.freeze(result);
}

function validateMotion(scene: GraphicScene, motion: GraphicMotion) {
  validateGraphicScene(scene);
  if (!Number.isFinite(motion.duration) || motion.duration <= 0) throw new Error('Motion duration must be finite and positive.');
  const objects = new Map(scene.objects.map((object) => [object.id, object]));
  const intervals = new Map<string, GraphicMotionTrack[]>();
  for (const track of motion.tracks) {
    const object = objects.get(track.target);
    if (!object) throw new Error(`Unknown motion target: ${track.target}`);
    if (!['opacity', 'reveal', 'highlight', 'translation'].includes(track.property)) throw new Error(`Unsupported motion property: ${track.property}`);
    if (track.ease !== undefined && track.ease !== 'linear' && track.ease !== 'smooth') throw new Error(`Unsupported motion ease: ${track.ease}`);
    if (!Number.isFinite(track.start) || track.start < 0 || !Number.isFinite(track.duration) || track.duration <= 0 || track.start + track.duration > motion.duration) throw new Error(`Motion track exceeds its finite duration: ${track.target}`);
    if (track.property === 'translation') {
      if ([track.from.x, track.from.y, track.to.x, track.to.y].some((n) => !Number.isFinite(n))) throw new Error(`Translation must be finite: ${track.target}`);
    } else if ([track.from, track.to].some((n) => !Number.isFinite(n) || n < 0 || n > 1)) throw new Error(`Opacity, reveal, and highlight values must be between zero and one: ${track.target}`);
    if (track.property === 'reveal' && object.primitives.some((p) => p.kind !== 'path')) throw new Error(`Reveal supports path-only objects: ${track.target}`);
    if (track.property === 'translation' && object.kind !== 'illustration') throw new Error(`Translation supports illustration objects. Relayout diagrams through createDiagramScene: ${track.target}`);
    const key = `${track.target}:${track.property}`;
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
    const key = `${track.target}:${track.property}`;
    grouped.set(key, [...(grouped.get(key) ?? []), track]);
  }
  const states = new Map<string, NonNullable<GraphicObject['state']>>();
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
    } else {
      const value = interpolate(track.from, track.to, progress);
      if (track.property === 'highlight') state.highlight = value >= 0.5;
      else state[track.property] = value;
    }
    states.set(track.target, Object.freeze(state));
  }
  return Object.freeze({ ...base, objects: Object.freeze(base.objects.map((object) => states.has(object.id) ? Object.freeze({ ...object, state: states.get(object.id) }) : object)) });
}

function interpolate(from: number, to: number, progress: number) {
  if (progress === 0) return from;
  if (progress === 1) return to;
  return Math.min(Math.max(from * (1 - progress) + to * progress, Math.min(from, to)), Math.max(from, to));
}

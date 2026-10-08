import { sampleScene, type GraphicMotion } from './graphic-motion';
import type { GraphicBounds, GraphicObject, GraphicScene } from './graphics-types';
import { objectBounds } from './graphic-bounds';
import { sampleCamera, widestCamera, type CameraKey } from './graphic-camera';

/** Same shape as a camera key, so frameScene output can be passed as GraphicMotion.camera. */
export type FrameKey = CameraKey;
export type SceneFramingOptions = Readonly<{
  /** Output aspect ratio as width / height. */
  aspect?: number;
  /** Fraction of the frame height kept clear at the top, for example for kinetic type. */
  reserveTop?: number;
  /** Seconds of upcoming arrivals framed before they appear. */
  lookahead?: number;
  /** Seconds after an object stops changing before it may leave the frame; omit to keep everything. */
  memory?: number;
  /** Padding around the framed content, as a factor of its size. */
  padding?: number;
  minWidth?: number;
  maxWidth?: number;
  /** Sample spacing in seconds. */
  step?: number;
  /** Preset whose fonts measure text; defaults to ISO. */
  preset?: string;
}>;

type Box = { x0: number; y0: number; x1: number; y1: number };

const union = (a: Box | null, b: Box | null): Box | null => !a ? b : !b ? a : { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
function objectBox(object: GraphicObject, preset?: string): Box | null {
  const bounds = objectBounds(object, { preset });
  return bounds && { x0: bounds.x, y0: bounds.y, x1: bounds.x + bounds.width, y1: bounds.y + bounds.height };
}

/**
 * Camera keys (usable as `GraphicMotion.camera`) that keep everything visible in frame, plus anything arriving within the lookahead,
 * placed below a reserved top band. With `memory`, content that stopped changing longer ago may
 * leave as a sequence moves on. Smoothing never shrinks a frame below its raw content.
 */
export function frameScene(scene: GraphicScene, motion: GraphicMotion, options: SceneFramingOptions = {}): readonly FrameKey[] {
  const { aspect = 16 / 9, reserveTop = 0, lookahead = .7, memory = Infinity, padding = 1.22, minWidth = 0, maxWidth = Infinity, step = .1, preset } = options;
  if (!(aspect > 0) || !(reserveTop >= 0 && reserveTop < .9) || !(lookahead >= 0) || !(memory > 0) || !(padding >= 1) || !(minWidth >= 0) || !(maxWidth >= minWidth) || !(step > 0)) throw new Error('Framing needs a positive aspect and step, padding of at least 1, and ordered width limits.');
  const first = new Map<string, number>(), last = new Map<string, number>();
  for (const track of motion.tracks) {
    first.set(track.target, Math.min(first.get(track.target) ?? Infinity, track.start));
    last.set(track.target, Math.max(last.get(track.target) ?? 0, track.start + track.duration));
  }
  const times: number[] = [];
  for (let t = 0; t <= motion.duration + 1e-6; t += step) times.push(Math.min(t, motion.duration));
  const visible = times.map(t => sampleScene(scene, motion, t).objects.filter(object => (object.state?.opacity ?? 1) > .1));
  const raw = times.map((t, i) => {
    let box: Box | null = null;
    for (let j = i; j < times.length && times[j] <= t + lookahead; j++) for (const object of visible[j]) {
      if (j > i && (first.get(object.id) ?? 0) > t + lookahead) continue;
      if (last.has(object.id) && last.get(object.id)! < times[j] - memory) continue;
      box = union(box, objectBox(object, preset));
    }
    return box ?? { x0: scene.bounds.x, y0: scene.bounds.y, x1: scene.bounds.x + scene.bounds.width, y1: scene.bounds.y + scene.bounds.height };
  });
  const span = 4;
  return Object.freeze(raw.map((box, i) => {
    const window = raw.slice(Math.max(0, i - span), i + span + 1);
    const average = window.reduce((sum, b) => ({ x0: sum.x0 + b.x0 / window.length, y0: sum.y0 + b.y0 / window.length, x1: sum.x1 + b.x1 / window.length, y1: sum.y1 + b.y1 / window.length }), { x0: 0, y0: 0, x1: 0, y1: 0 });
    const content = union(average, box)!;
    const w = (content.x1 - content.x0) * padding, h = (content.y1 - content.y0) * padding;
    const width = Math.min(maxWidth, Math.max(minWidth, w, h * aspect / (1 - reserveTop)));
    const height = width / aspect;
    return Object.freeze({ t: times[i], cx: (content.x0 + content.x1) / 2, cy: (content.y0 + content.y1) / 2 - height * reserveTop / 2, width, ease: 'linear' as const });
  }));
}

/** The view box at an authored time, eased between keys. Each key's ease shapes the move into it. */
export function sampleFrame(keys: readonly FrameKey[], authoredSeconds: number, aspect = 16 / 9): GraphicBounds {
  return sampleCamera(keys, authoredSeconds, aspect);
}

/** The widest framing in a set of keys, for a still, a poster or a slide of the same beat. */
export function widestFrame(keys: readonly FrameKey[], aspect = 16 / 9): GraphicBounds {
  return widestCamera(keys, aspect);
}

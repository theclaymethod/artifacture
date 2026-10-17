import { sampleScene, type GraphicMotion } from './graphic-motion';
import type { GraphicBounds, GraphicObject, GraphicPrimitive, GraphicScene } from './graphics-types';
import { sampleMotionEase, type MotionEase } from './motion-eases';

export type FrameKey = Readonly<{ t: number; cx: number; cy: number; width: number; ease?: MotionEase }>;
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
}>;

type Box = { x0: number; y0: number; x1: number; y1: number };

function points(list: readonly (readonly [number, number])[]): Box | null {
  if (!list.length) return null;
  const xs = list.map(point => point[0]), ys = list.map(point => point[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Approximate primitive bounds in scene units; text width is estimated from its characters. */
function primitiveBox(primitive: GraphicPrimitive): Box | null {
  switch (primitive.kind) {
    case 'rect': return { x0: primitive.x, y0: primitive.y, x1: primitive.x + primitive.width, y1: primitive.y + primitive.height };
    case 'circle': return { x0: primitive.x - primitive.radius, y0: primitive.y - primitive.radius, x1: primitive.x + primitive.radius, y1: primitive.y + primitive.radius };
    case 'line': return points([[primitive.x1, primitive.y1], [primitive.x2, primitive.y2]]);
    case 'polygon': return points(primitive.points.map(point => [point.x, point.y] as const));
    case 'path': {
      const values = (primitive.d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number), pairs: [number, number][] = [];
      for (let i = 0; i + 1 < values.length; i += 2) pairs.push([values[i], values[i + 1]]);
      // Relative commands would mislead a coordinate scan; frame their start point generously.
      if (/[a-df-z]/.test(primitive.d)) { const [x, y] = pairs[0] ?? [0, 0]; return { x0: x - 30, y0: y - 30, x1: x + 30, y1: y + 30 }; }
      return points(pairs);
    }
    case 'text': {
      const width = Math.max(...primitive.lines.map(line => line.length)) * primitive.size * (primitive.font === 'mono' ? .62 : .55);
      const x0 = primitive.anchor === 'middle' ? primitive.x - width / 2 : primitive.x;
      return { x0, y0: primitive.y - primitive.size * .85, x1: x0 + width, y1: primitive.y + (primitive.lines.length - 1) * primitive.leading + primitive.size * .25 };
    }
    default: return null;
  }
}

const union = (a: Box | null, b: Box | null): Box | null => !a ? b : !b ? a : { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };

function objectBox(object: GraphicObject): Box | null {
  const box = object.primitives.reduce<Box | null>((acc, primitive) => union(acc, primitiveBox(primitive)), null);
  const dx = object.state?.x ?? 0, dy = object.state?.y ?? 0;
  return box && { x0: box.x0 + dx, y0: box.y0 + dy, x1: box.x1 + dx, y1: box.y1 + dy };
}

/**
 * Camera keys that keep everything visible in frame, plus anything arriving within the lookahead,
 * placed below a reserved top band. With `memory`, content that stopped changing longer ago may
 * leave as a sequence moves on. Smoothing never shrinks a frame below its raw content.
 */
export function frameScene(scene: GraphicScene, motion: GraphicMotion, options: SceneFramingOptions = {}): readonly FrameKey[] {
  const { aspect = 16 / 9, reserveTop = 0, lookahead = .7, memory = Infinity, padding = 1.22, minWidth = 0, maxWidth = Infinity, step = .1 } = options;
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
      box = union(box, objectBox(object));
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
  if (!keys.length || !Number.isFinite(authoredSeconds) || !(aspect > 0)) throw new Error('Sampling a frame needs keys, a finite time and a positive aspect.');
  let at: Omit<FrameKey, 't' | 'ease'> = keys[keys.length - 1];
  if (authoredSeconds < keys[0].t) at = keys[0];
  else for (let i = 0; i < keys.length - 1; i++) if (authoredSeconds >= keys[i].t && authoredSeconds < keys[i + 1].t) {
    const a = keys[i], b = keys[i + 1], u = sampleMotionEase(b.ease ?? 'smooth', Math.min(1, Math.max(0, (authoredSeconds - a.t) / Math.max(1e-3, b.t - a.t))));
    at = { cx: a.cx + (b.cx - a.cx) * u, cy: a.cy + (b.cy - a.cy) * u, width: a.width + (b.width - a.width) * u };
    break;
  }
  return Object.freeze({ x: at.cx - at.width / 2, y: at.cy - at.width / aspect / 2, width: at.width, height: at.width / aspect });
}

/** The widest framing in a set of keys, for a still, a poster or a slide of the same beat. */
export function widestFrame(keys: readonly FrameKey[], aspect = 16 / 9): GraphicBounds {
  if (!keys.length) throw new Error('Choosing a frame needs at least one key.');
  return sampleFrame([keys.reduce((best, key) => key.width > best.width ? key : best, keys[0])], 0, aspect);
}

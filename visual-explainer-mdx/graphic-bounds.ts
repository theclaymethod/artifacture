import type { GraphicBounds, GraphicObject, GraphicPrimitive } from './graphics-types';
import { measureText } from './text-metrics';

export type BoundsOptions = Readonly<{ preset?: string }>;

const fromPoints = (points: readonly (readonly [number, number])[]): GraphicBounds | null => {
  if (!points.length) return null;
  const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};

/** Union of two bounds; either may be null. */
export function unionBounds(a: GraphicBounds | null, b: GraphicBounds | null): GraphicBounds | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

/** Rest bounds of one primitive in its object's coordinates. Text uses measured glyph widths. */
export function primitiveBounds(primitive: GraphicPrimitive, options: BoundsOptions = {}): GraphicBounds | null {
  switch (primitive.kind) {
    case 'rect': return { x: primitive.x, y: primitive.y, width: primitive.width, height: primitive.height };
    case 'circle': return { x: primitive.x - primitive.radius, y: primitive.y - primitive.radius, width: primitive.radius * 2, height: primitive.radius * 2 };
    case 'line': return fromPoints([[primitive.x1, primitive.y1], [primitive.x2, primitive.y2]]);
    case 'polygon': return fromPoints(primitive.points.map(point => [point.x, point.y] as const));
    case 'path': {
      const values = (primitive.d.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? []).map(Number), pairs: [number, number][] = [];
      for (let i = 0; i + 1 < values.length; i += 2) pairs.push([values[i], values[i + 1]]);
      // Relative commands and arcs would mislead a coordinate scan; frame their start point generously.
      if (/[a-df-z]|A/.test(primitive.d)) { const [x, y] = pairs[0] ?? [0, 0]; return { x: x - 30, y: y - 30, width: 60, height: 60 }; }
      return fromPoints(pairs);
    }
    case 'text': {
      const width = primitive.textLength ?? Math.max(...primitive.lines.map(line => measureText(line, { size: primitive.size, font: primitive.font, weight: primitive.weight, preset: options.preset }).width));
      const x = primitive.anchor === 'middle' ? primitive.x - width / 2 : primitive.anchor === 'end' ? primitive.x - width : primitive.x;
      const y = primitive.y - primitive.size * .8;
      return { x, y, width, height: (primitive.lines.length - 1) * primitive.leading + primitive.size * 1.05 };
    }
    default: return null;
  }
}

/** Bounds of an object in scene coordinates, including its placement and current state translation and scale. */
export function objectBounds(object: GraphicObject, options: BoundsOptions = {}): GraphicBounds | null {
  const local = object.primitives.reduce<GraphicBounds | null>((acc, primitive) => unionBounds(acc, primitiveBounds(primitive, options)), null);
  if (!local) return null;
  const state = object.state;
  const s = state?.scale ?? 1, ox = state?.originX ?? 0, oy = state?.originY ?? 0;
  const scaled = s === 1 ? local : { x: ox + (local.x - ox) * s, y: oy + (local.y - oy) * s, width: local.width * s, height: local.height * s };
  const moved = { ...scaled, x: scaled.x + (state?.x ?? 0), y: scaled.y + (state?.y ?? 0) };
  const placement = object.placement;
  return placement ? { x: placement.x + moved.x * placement.scale, y: placement.y + moved.y * placement.scale, width: moved.width * placement.scale, height: moved.height * placement.scale } : moved;
}

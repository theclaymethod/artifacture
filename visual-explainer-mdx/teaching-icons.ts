import type { GraphicFont, GraphicObject, GraphicPaint, GraphicPrimitive } from './graphics-types';
import type { IsoPart, IsoPoint } from './iso-scene';
import { measureText, wrapText } from './text-metrics';

type State = NonNullable<GraphicObject['state']>;
type Base = Readonly<{ id: string; x: number; y: number; state?: Partial<State>; meaning?: string }>;

const ink = { fill: 'background', stroke: 'illustration-ink', strokeRole: 'structure' } as const;
const detail = { fill: 'none', stroke: 'illustration-muted', strokeRole: 'detail' } as const;
const object = (base: Base, primitives: GraphicPrimitive[]): GraphicObject => ({
  id: base.id, kind: 'illustration', meaning: base.meaning, primitives,
  state: { opacity: 1, reveal: 1, highlight: false, x: 0, y: 0, ...base.state },
});

/** A rounded message box sized to its measured, wrapped text. `x, y` is the top-left corner. */
export function messageBubble(input: Base & Readonly<{ text: string; size?: number; maxWidth?: number; padding?: number; font?: GraphicFont; preset?: string; stroke?: GraphicPaint }>): GraphicObject {
  const { size = 16, maxWidth = 320, padding = 14, font = 'body', preset } = input;
  const lines = wrapText(input.text, maxWidth - padding * 2, { size, font, preset });
  const width = Math.max(...lines.map(line => measureText(line, { size, font, preset }).width)) + padding * 2;
  const leading = size * 1.3, height = (lines.length - 1) * leading + size * 1.05 + padding * 2;
  return object(input, [
    { kind: 'rect', x: input.x, y: input.y, width, height, radius: Math.min(12, height / 4), ...ink, stroke: input.stroke ?? 'illustration-ink' },
    { kind: 'text', x: input.x + padding, y: input.y + padding + size * .8, lines, leading, size, font, fill: 'ink' },
  ]);
}

/** A document page: a frame, a title in mono, and one bar per line given as fractions of the width. */
export function docPage(input: Base & Readonly<{ width?: number; title?: string; lines?: readonly number[]; size?: number }>): GraphicObject {
  const { width = 140, title = 'SKILL.md', lines = [.8, .6, .9, .7], size = 13 } = input;
  const top = input.y + size * 2.6, step = size * 1.15;
  return object(input, [
    { kind: 'rect', x: input.x, y: input.y, width, height: size * 2.6 + lines.length * step + size * .6, radius: 6, ...ink },
    { kind: 'text', x: input.x + size, y: input.y + size * 1.6, lines: [title], leading: size, size, font: 'mono', weight: 600, fill: 'ink' },
    ...lines.map((fraction, i): GraphicPrimitive => ({ kind: 'path', d: `M ${input.x + size} ${top + i * step} L ${input.x + size + (width - size * 2) * fraction} ${top + i * step}`, ...detail })),
  ]);
}

/** A person: a head and shoulders. `x, y` is the centre of the head. */
export function personIcon(input: Base & Readonly<{ size?: number }>): GraphicObject {
  const r = (input.size ?? 24) / 2;
  return object(input, [
    { kind: 'circle', x: input.x, y: input.y, radius: r, ...ink },
    { kind: 'path', d: `M ${input.x - r * 2} ${input.y + r * 4} Q ${input.x} ${input.y + r * 1.2} ${input.x + r * 2} ${input.y + r * 4}`, fill: 'none', stroke: 'illustration-ink', strokeRole: 'structure' },
  ]);
}

/** A pass mark. Uses the accent unless another paint is given. */
export function checkMark(input: Base & Readonly<{ size?: number; paint?: GraphicPaint }>): GraphicObject {
  const s = (input.size ?? 16) / 2;
  return object(input, [{ kind: 'path', d: `M ${input.x - s} ${input.y} L ${input.x - s * .25} ${input.y + s * .75} L ${input.x + s} ${input.y - s * .75}`, fill: 'none', stroke: input.paint ?? 'accent', strokeRole: 'active' }]);
}

/** A failure mark in the fault paint. */
export function crossMark(input: Base & Readonly<{ size?: number; paint?: GraphicPaint }>): GraphicObject {
  const s = (input.size ?? 16) / 2;
  return object(input, [{ kind: 'path', d: `M ${input.x - s} ${input.y - s} L ${input.x + s} ${input.y + s} M ${input.x + s} ${input.y - s} L ${input.x - s} ${input.y + s}`, fill: 'none', stroke: input.paint ?? 'fault', strokeRole: 'active' }]);
}

/** A browser window: frame, toolbar rule and three window controls. `x, y` is the top-left corner. */
export function browserWindow(input: Base & Readonly<{ width?: number; height?: number }>): GraphicObject {
  const { width = 150, height = 100 } = input, bar = Math.min(20, height * .2);
  return object(input, [
    { kind: 'rect', x: input.x, y: input.y, width, height, radius: 6, ...ink },
    { kind: 'line', x1: input.x, x2: input.x + width, y1: input.y + bar, y2: input.y + bar, stroke: 'illustration-ink', strokeRole: 'structure' },
    ...[0, 1, 2].map((i): GraphicPrimitive => ({ kind: 'circle', x: input.x + 12 + i * 10, y: input.y + bar / 2, radius: 2.5, ...detail })),
  ]);
}

/** A magnifying glass. `x, y` is the centre of the lens. */
export function searchIcon(input: Base & Readonly<{ radius?: number }>): GraphicObject {
  const r = input.radius ?? 26, k = r * .72;
  return object(input, [
    { kind: 'circle', x: input.x, y: input.y, radius: r, ...ink },
    { kind: 'line', x1: input.x + k, y1: input.y + k, x2: input.x + r * 1.6, y2: input.y + r * 1.6, stroke: 'illustration-ink', strokeRole: 'structure' },
  ]);
}

/** A film frame with a play mark, or a label when one is given. `x, y` is the top-left corner. */
export function filmFrame(input: Base & Readonly<{ width?: number; height?: number; label?: string; size?: number }>): GraphicObject {
  const { width = 160, height = 90, size = 16 } = input, cx = input.x + width / 2, cy = input.y + height / 2, p = height * .18;
  return object(input, [
    { kind: 'rect', x: input.x, y: input.y, width, height, radius: 6, ...ink },
    input.label
      ? { kind: 'text', x: cx, y: cy + size * .35, lines: [input.label], leading: size, size, weight: 600, anchor: 'middle', fill: 'ink' }
      : { kind: 'polygon', points: [{ x: cx - p * .8, y: cy - p }, { x: cx + p, y: cy }, { x: cx - p * .8, y: cy + p }], fill: 'none', stroke: 'illustration-ink', strokeRole: 'structure' },
  ]);
}

/** Pages offset behind one another, newest in front. `x, y` is the top-left of the front page. */
export function versionStack(input: Base & Readonly<{ count?: number; width?: number; height?: number; offset?: number }>): GraphicObject {
  const { count = 3, width = 140, height = 90, offset = 10 } = input;
  if (!Number.isSafeInteger(count) || count < 1 || count > 12) throw new Error('A version stack holds 1–12 pages.');
  return object(input, Array.from({ length: count }, (_, k): GraphicPrimitive => {
    const back = count - 1 - k;
    return { kind: 'rect', x: input.x + back * offset, y: input.y - back * offset, width, height, radius: 6, ...ink };
  }));
}

/** An ISO page: a thin slab with line details on its top face, for `createIsoScene`. */
export function isoPagePart(input: Readonly<{ id: string; origin: IsoPoint; width?: number; depth?: number; lines?: readonly number[]; active?: boolean; meaning?: string }>): IsoPart {
  const { width = 150, depth = 110, lines = [.6, .8, .5] } = input;
  return { id: input.id, meaning: input.meaning, origin: input.origin, size: { width, depth, height: 8 }, radius: 4, active: input.active,
    details: lines.map((fraction, i) => ({ face: 'top' as const, x: 14, y: 14 + i * 16, width: Math.max(4, (width - 28) * fraction), height: i ? 4 : 6, radius: 2, live: input.active && i === 0 })) };
}

/** ISO pages stacked upward, one part per version; the newest is on top. */
export function isoVersionStackParts(input: Readonly<{ id: string; origin: IsoPoint; count?: number; spacing?: number; width?: number; depth?: number }>): readonly IsoPart[] {
  const { count = 4, spacing = 14 } = input;
  if (!Number.isSafeInteger(count) || count < 1 || count > 12) throw new Error('An ISO version stack holds 1–12 pages.');
  return Array.from({ length: count }, (_, i) => isoPagePart({ id: `${input.id}-${i}`, origin: { ...input.origin, z: input.origin.z + i * spacing }, width: input.width, depth: input.depth }));
}

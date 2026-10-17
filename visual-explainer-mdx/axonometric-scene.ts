import { defineGraphicMotion, type GraphicMotion, type GraphicMotionTrack } from './graphic-motion';
import { createGraphicScene, type GraphicObject, type GraphicPrimitive, type GraphicScene } from './graphics-types';

// Projection and diagram grammar adapted from Cathryn Lavery's MIT diagram-design.
// See DIAGRAM-DESIGN-LICENSE and the pinned source in references/axonometric.md.
export type AxonometricRect = Readonly<{ x: number; y: number; width: number; depth: number; radius?: number }>;
export type AxonometricBox = Readonly<{ id: string; rect: AxonometricRect; height: number; label?: string; active?: boolean; phase?: number }>;
export type AxonometricMark = Readonly<{ id: string; rect: AxonometricRect; label?: string; active?: boolean }>;
type Identity = Readonly<{ id: string; title: string; description: string; labelSize?: number }>;
export type AxonometricPlanInput = Identity & Readonly<{ plate: AxonometricRect; thickness?: number; boxes: readonly AxonometricBox[]; marks?: readonly AxonometricMark[] }>;
export type ExplodedPart = Readonly<{ id: string; label: string; rect: AxonometricRect; z: number; thickness: number; level: number; active?: boolean; kind?: 'solid' | 'tray'; wall?: number }>;
export type ExplodedSceneInput = Identity & Readonly<{ parts: readonly ExplodedPart[]; gap?: number }>;
type Point = Readonly<{ x: number; y: number }>;
type Tag = Readonly<{ id: string; x: number; y: number; width: number; height: number; label: string; active?: boolean }>;

export function projectAxonometric(x: number, y: number, z: number): Point {
  return { x: x - y, y: (x + y) / 2 - z };
}
function finite(values: readonly number[], name: string) {
  if (values.some(n => !Number.isFinite(n) || Math.abs(n) > 1000000)) throw new Error(`${name} must be finite model units within ±1,000,000.`);
}
function rectangle(rect: AxonometricRect) {
  finite([rect.x, rect.y, rect.width, rect.depth, rect.radius ?? 0], 'Axonometric rectangle');
  if (rect.width <= 0 || rect.depth <= 0 || (rect.radius ?? 0) < 0 || (rect.radius ?? 0) > Math.min(rect.width, rect.depth) / 2) throw new Error('Axonometric rectangles need positive dimensions and a fitting corner radius.');
}
function identity(input: Identity, entries: readonly { id: string; active?: boolean }[]) {
  if (!entries.length || entries.length > 48) throw new Error('Axonometric scenes need 1–48 elements.');
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!entry.id?.trim() || ids.has(entry.id)) throw new Error('Axonometric element IDs must be nonempty and unique.');
    ids.add(entry.id);
  }
  if (entries.filter(entry => entry.active).length > 1) throw new Error('Choose one focal element.');
  const size = input.labelSize ?? 20;
  if (!Number.isFinite(size) || size < 14 || size > 48) throw new Error('Axonometric labelSize must be from 14 to 48.');
  return size;
}
function contains(outer: AxonometricRect, inner: AxonometricRect) {
  if (inner.x < outer.x || inner.y < outer.y || inner.x + inner.width > outer.x + outer.width || inner.y + inner.depth > outer.y + outer.depth) return false;
  const r = outer.radius ?? 0;
  return r === 0 || footprint(inner).every(p => {
    const cx = Math.max(outer.x + r, Math.min(p.x, outer.x + outer.width - r));
    const cy = Math.max(outer.y + r, Math.min(p.y, outer.y + outer.depth - r));
    return Math.hypot(p.x - cx, p.y - cy) <= r + .000001;
  });
}
function overlaps(a: AxonometricRect, b: AxonometricRect) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.depth && b.y < a.y + a.depth;
}
function arc(cx: number, cy: number, r: number, from: number, to: number) {
  return Array.from({ length: 9 }, (_, at) => {
    const angle = from + (to - from) * at / 8;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}
function footprint(rect: AxonometricRect): Point[] {
  const { x, y, width: w, depth: d } = rect, r = rect.radius ?? 0;
  return [
    ...arc(x + w - r, y + r, r, -Math.PI / 2, 0),
    ...arc(x + w - r, y + d - r, r, 0, Math.PI / 2),
    ...arc(x + r, y + d - r, r, Math.PI / 2, Math.PI),
    ...arc(x + r, y + r, r, Math.PI, Math.PI * 1.5),
  ];
}
function face(rect: AxonometricRect, z: number) {
  return footprint(rect).map(p => projectAxonometric(p.x, p.y, z));
}
function fronts(rect: AxonometricRect) {
  const { x, y, width: w, depth: d } = rect, r = rect.radius ?? 0;
  return [
    [...arc(x + r, y + d - r, r, Math.PI * .75, Math.PI / 2), ...arc(x + w - r, y + d - r, r, Math.PI / 2, Math.PI / 4)],
    [...arc(x + w - r, y + d - r, r, Math.PI / 4, 0), ...arc(x + w - r, y + r, r, 0, -Math.PI / 4)],
  ];
}
function polygon(points: readonly Point[], fill: 'background' | 'solid-lit' | 'solid-shade' | 'accent-background', stroke = true): GraphicPrimitive {
  return { kind: 'polygon', points, fill, stroke: stroke ? 'illustration-ink' : undefined, strokeRole: 'structure', strokeWidth: stroke ? 1 : undefined };
}
function sides(rect: AxonometricRect, z: number, thickness: number) {
  return fronts(rect).map((edge, index) => polygon([
    ...edge.map(p => projectAxonometric(p.x, p.y, z + thickness)),
    ...[...edge].reverse().map(p => projectAxonometric(p.x, p.y, z)),
  ], index === 0 ? 'solid-lit' : 'solid-shade'));
}
function top(rect: AxonometricRect, z: number, active = false) {
  const points = face(rect, z);
  return [polygon(points, 'background'), ...(active ? [polygon(points, 'accent-background', false)] : [])];
}
function prism(rect: AxonometricRect, z: number, thickness: number, active = false) {
  return [...sides(rect, z, thickness), ...top(rect, z + thickness, active)];
}
function tag(id: string, label: string, at: Point, size: number, active?: boolean): Tag {
  if (!label.trim() || label.length > 40) throw new Error('Use a nonempty part name of at most 40 characters.');
  return { id, label, x: at.x, y: at.y, width: Math.max(size * 2, Array.from(label).length * size * .65 + 20), height: size + 14, active };
}
function tagObject(item: Tag, size: number): GraphicObject {
  return { id: `label:${item.id}`, kind: 'illustration', meaning: item.label, primitives: [
    { kind: 'rect', x: item.x - item.width / 2, y: item.y - item.height / 2, width: item.width, height: item.height, fill: 'background', stroke: item.active ? 'accent' : 'frame', strokeWidth: 1 },
    { kind: 'text', x: item.x, y: item.y + size * .34, lines: [item.label], leading: size * 1.25, size, weight: 600, anchor: 'middle', fill: 'ink' },
  ] };
}
function finish(input: Identity, objects: GraphicObject[], extra: readonly Point[] = []): GraphicScene {
  const points = [...extra, ...objects.flatMap(object => object.primitives.flatMap(p => {
    if (p.kind === 'polygon') return p.points;
    if (p.kind === 'rect') return [{ x: p.x, y: p.y }, { x: p.x + p.width, y: p.y + p.height }];
    if (p.kind === 'line') return [{ x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 }];
    return [];
  }))];
  const x = Math.min(...points.map(p => p.x)) - 24, y = Math.min(...points.map(p => p.y)) - 40;
  const width = Math.max(...points.map(p => p.x)) - x + 24, height = Math.max(...points.map(p => p.y)) - y + 24;
  return createGraphicScene({ id: input.id, title: input.title, description: input.description, bounds: { x, y, width, height }, objects });
}
function hull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = (values: readonly Point[]) => {
    const result: Point[] = [];
    for (const point of values) {
      while (result.length > 1 && cross(result.at(-2)!, result.at(-1)!, point) <= 0) result.pop();
      result.push(point);
    }
    return result.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}
function screenOverlap(a: readonly Point[], b: readonly Point[]) {
  for (const outline of [a, b]) for (let at = 0; at < outline.length; at++) {
    const p = outline[at], q = outline[(at + 1) % outline.length], axis = { x: p.y - q.y, y: q.x - p.x };
    const left = a.map(p => p.x * axis.x + p.y * axis.y), right = b.map(p => p.x * axis.x + p.y * axis.y);
    if (Math.max(...left) <= Math.min(...right) + .000001 || Math.max(...right) <= Math.min(...left) + .000001) return false;
  }
  return true;
}
function orderBoxes(boxes: readonly AxonometricBox[], z: number) {
  const outlines = boxes.map(box => hull([...face(box.rect, z), ...face(box.rect, z + box.height)]));
  const incoming = boxes.map(() => new Set<number>());
  boxes.forEach((a, i) => boxes.forEach((b, j) => {
    if (i !== j && (a.rect.x + a.rect.width <= b.rect.x || a.rect.y + a.rect.depth <= b.rect.y) && screenOverlap(outlines[i], outlines[j])) incoming[j].add(i);
  }));
  const remaining = new Set(boxes.map((_, i) => i)), result: AxonometricBox[] = [];
  while (remaining.size) {
    const next = [...remaining].find(i => incoming[i].size === 0);
    if (next === undefined) throw new Error('Plan occlusion forms a cycle; move or split the overlapping projections.');
    result.push(boxes[next]); remaining.delete(next); incoming.forEach(edges => edges.delete(next));
  }
  return result;
}

export function createAxonometricPlan(input: AxonometricPlanInput): GraphicScene {
  const marks = input.marks ?? [], size = identity(input, [...input.boxes, ...marks]), thickness = input.thickness ?? 8;
  rectangle(input.plate); finite([thickness], 'Plate thickness');
  if (thickness <= 0) throw new Error('Plate thickness must be positive.');
  const tags: Tag[] = [];
  for (const item of [...input.boxes, ...marks]) {
    rectangle(item.rect);
    if (!contains(input.plate, item.rect)) throw new Error(`Element extends past the plate: ${item.id}`);
    const height = input.boxes.find(box => box.id === item.id)?.height ?? 0;
    if (item.label !== undefined) tags.push(tag(item.id, item.label, projectAxonometric(item.rect.x + item.rect.width / 2, item.rect.y + item.rect.depth / 2, thickness + height), size, item.active));
  }
  input.boxes.forEach((box, at) => {
    finite([box.height], 'Box height');
    if (box.height <= 0 || (box.phase !== undefined && (!Number.isInteger(box.phase) || box.phase < 0 || box.phase > 23))) throw new Error('Boxes need positive height and an integer phase from 0 to 23.');
    if (input.boxes.slice(at + 1).some(other => overlaps(box.rect, other.rect))) throw new Error(`Plan footprints overlap: ${box.id}`);
  });
  tags.forEach((a, at) => {
    if (tags.slice(at + 1).some(b => Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 8 && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + 8)) throw new Error(`Plan labels overlap; move their footprints or shorten names: ${a.id}`);
  });
  const objects: GraphicObject[] = [{ id: 'plate', kind: 'illustration', primitives: prism(input.plate, 0, thickness) }];
  for (const mark of marks) objects.push({ id: `mark:${mark.id}`, kind: 'illustration', primitives: [polygon(face(mark.rect, thickness), 'solid-lit', false), ...(mark.active ? [polygon(face(mark.rect, thickness), 'accent-background', false)] : [])] });
  for (const box of orderBoxes(input.boxes, thickness)) objects.push({ id: `box:${box.id}`, kind: 'illustration', meaning: box.label, primitives: prism(box.rect, thickness, box.height, box.active) });
  objects.push(...tags.map(item => tagObject(item, size)));
  return finish(input, objects);
}
export function createAxonometricPlanMotion(input: AxonometricPlanInput, duration = 4): GraphicMotion {
  const scene = createAxonometricPlan(input), phases = [...new Set(input.boxes.map(box => box.phase ?? 0))].sort((a, b) => a - b);
  if (phases.some(phase => input.boxes.filter(box => (box.phase ?? 0) === phase).length > 2)) throw new Error('A plan reveal supports at most two boxes per phase; give additional boxes another phase.');
  const tracks: GraphicMotionTrack[] = [];
  for (const box of input.boxes) {
    const start = phases.indexOf(box.phase ?? 0) * duration * .6 / phases.length, settle = duration * .25;
    for (const target of [`box:${box.id}`, ...(box.label ? [`label:${box.id}`] : [])]) {
      tracks.push({ target, property: 'opacity', start, duration: settle, from: 0, to: 1, ease: 'smooth' });
      tracks.push({ target, property: 'translation', start, duration: settle, from: { x: 0, y: -16 }, to: { x: 0, y: 0 }, ease: 'smooth' });
    }
  }
  return defineGraphicMotion(scene, { duration, tracks });
}
function trayInner(part: ExplodedPart): AxonometricRect {
  const wall = part.wall ?? 6, r = part.rect.radius ?? 0;
  finite([wall], 'Tray wall');
  if (wall <= 0 || wall * 2 >= Math.min(part.rect.width, part.rect.depth) || wall >= part.thickness) throw new Error('Tray walls must fit inside its footprint and thickness.');
  return { x: part.rect.x + wall, y: part.rect.y + wall, width: part.rect.width - wall * 2, depth: part.rect.depth - wall * 2, radius: Math.max(0, r - wall) };
}
function trayBack(part: ExplodedPart, z: number) {
  const inner = trayInner(part), floor = z + (part.wall ?? 6), rim = z + part.thickness;
  return [...prism(part.rect, z, part.thickness, part.active), polygon(face(inner, rim), 'solid-shade'), ...top(inner, floor)];
}
function trayFront(part: ExplodedPart, z: number) {
  const outer = fronts(part.rect), inner = fronts(trayInner(part)), rim = z + part.thickness;
  return [...sides(part.rect, z, part.thickness), ...outer.map((edge, at) => polygon([
    ...edge.map(p => projectAxonometric(p.x, p.y, rim)), ...[...inner[at]].reverse().map(p => projectAxonometric(p.x, p.y, rim)),
  ], 'background'))];
}
function exploded(input: ExplodedSceneInput) {
  const size = identity(input, input.parts), parts = [...input.parts].sort((a, b) => a.level - b.level || a.rect.x + a.rect.y - b.rect.x - b.rect.y);
  if (parts.length < 2 || parts.length > 5) throw new Error('An exploded view needs 2–5 parts.');
  const levels = [...new Set(parts.map(part => part.level))];
  if (levels.length < 2 || levels.some((level, at) => level !== at)) throw new Error('Exploded levels must be contiguous integers starting at zero, with at least two levels.');
  for (const part of parts) {
    rectangle(part.rect); finite([part.z, part.thickness], 'Part height');
    if (!part.label?.trim() || part.label.length > 40 || part.z < 0 || part.thickness <= 0 || (part.kind !== undefined && !['solid', 'tray'].includes(part.kind))) throw new Error('Parts need a short name, nonnegative assembled z, positive thickness, and solid or tray kind.');
    if (part.kind === 'tray') trayInner(part);
  }
  parts.forEach((a, at) => parts.slice(at + 1).forEach(b => {
    if (!overlaps(a.rect, b.rect) || a.z >= b.z + b.thickness || b.z >= a.z + a.thickness) return;
    const tray = a.kind === 'tray' ? a : b.kind === 'tray' ? b : undefined, inside = tray === a ? b : a;
    if (!tray || !contains(trayInner(tray), inside.rect) || inside.z < tray.z + (tray.wall ?? 6) || inside.level < tray.level) throw new Error(`Assembled parts intersect: ${a.id}, ${b.id}`);
  }));
  const minimumGap = Math.ceil(Math.max(36, ...parts.map(p => (p.rect.width + p.rect.depth) * .375), ...parts.filter(p => p.kind !== 'tray').map(p => p.thickness * 3)) / 4) * 4;
  finite([input.gap ?? minimumGap], 'Explode gap');
  if (input.gap !== undefined && input.gap < minimumGap) throw new Error(`Explode gap must be at least ${minimumGap} model units.`);
  let gap = input.gap ?? minimumGap;
  const resolve = () => parts.map(part => {
    const z = part.z + part.level * gap, r = part.rect.radius ?? 0;
    const at = projectAxonometric(part.rect.x + part.rect.width - r + r / Math.SQRT2, part.rect.y + r - r / Math.SQRT2, z + part.thickness / 2);
    return { part, z, at, outline: hull([...face(part.rect, z), ...face(part.rect, z + part.thickness)]) };
  });
  let resolved = resolve();
  for (let attempt = 0; attempt < 256; attempt++) {
    const crowded = resolved.some((a, at) => resolved.slice(at + 1).some(b => Math.abs(a.at.y - b.at.y) < Math.max(36, size * 1.5))) || resolved.some(a => resolved.some(b => {
      if (a === b || a.at.x >= Math.max(...b.outline.map(p => p.x))) return false;
      const crossings = b.outline.flatMap((p, at) => {
        const q = b.outline[(at + 1) % b.outline.length];
        return (p.y > a.at.y) !== (q.y > a.at.y) ? [p.x + (a.at.y - p.y) * (q.x - p.x) / (q.y - p.y)] : [];
      });
      return crossings.length > 0 && Math.max(...crossings) > a.at.x + 6;
    }));
    if (!crowded) return { size, parts, gap, resolved };
    if (input.gap !== undefined || attempt === 255) throw new Error('Exploded leaders or labels collide; increase the gap or move same-level parts in plan.');
    gap += 4; resolved = resolve();
  }
  throw new Error('Could not resolve exploded clearance.');
}
export function createExplodedScene(input: ExplodedSceneInput): GraphicScene {
  const { size, resolved } = exploded(input), objects: GraphicObject[] = [];
  const labelX = Math.max(...resolved.flatMap(item => item.outline.map(p => p.x))) + 36;
  const bottom = resolved[0], topY = Math.min(...resolved.flatMap(item => item.outline.map(p => p.y))), bottomY = Math.max(...bottom.outline.map(p => p.y));
  const extremes = [Math.min(...bottom.outline.map(p => p.x)), Math.max(...bottom.outline.map(p => p.x))];
  objects.push({ id: 'traces', kind: 'illustration', primitives: extremes.map(x => ({ kind: 'line', x1: x, x2: x, y1: bottomY, y2: topY, stroke: 'frame', strokeWidth: .8, dash: '4 3' })) });
  const pending: { after: number; object: GraphicObject }[] = [];
  resolved.forEach(({ part, z }, at) => {
    objects.push({ id: `part:${part.id}`, kind: 'illustration', meaning: part.label, primitives: part.kind === 'tray' ? trayBack(part, z) : prism(part.rect, z, part.thickness, part.active) });
    if (part.kind === 'tray') {
      const after = Math.max(at, ...resolved.flatMap((item, index) => item.part !== part && contains(trayInner(part), item.part.rect) && item.part.z < part.z + part.thickness ? [index] : []));
      pending.push({ after, object: { id: `front:${part.id}`, kind: 'illustration', primitives: trayFront(part, z) } });
    }
    objects.push(...pending.filter(item => item.after === at).map(item => item.object));
  });
  const extra: Point[] = [];
  for (const { part, at } of resolved) {
    const width = Array.from(part.label).length * size * .65;
    extra.push({ x: labelX + width, y: at.y + size }, { x: labelX, y: at.y - size });
    objects.push({ id: `label:${part.id}`, kind: 'illustration', meaning: part.label, primitives: [
      { kind: 'circle', x: at.x, y: at.y, radius: 2, fill: part.active ? 'accent' : 'illustration-ink' },
      { kind: 'line', x1: at.x + 6, x2: labelX - 12, y1: at.y, y2: at.y, stroke: part.active ? 'accent' : 'frame', strokeWidth: .8 },
      { kind: 'text', x: labelX, y: at.y + size * .34, lines: [part.label], leading: size * 1.25, size, weight: 600, fill: 'ink' },
    ] });
    extra.push(...face(part.rect, part.z), ...face(part.rect, part.z + part.thickness));
  }
  return finish(input, objects, extra);
}
export function createExplodedMotion(input: ExplodedSceneInput, duration = 4): GraphicMotion {
  const { parts, gap } = exploded(input), scene = createExplodedScene(input), maxLevel = Math.max(...parts.map(part => part.level)), tracks: GraphicMotionTrack[] = [];
  for (const part of parts) {
    const start = (maxLevel - part.level) / maxLevel * duration * .4, settle = duration * .3;
    if (part.level > 0) for (const target of [`part:${part.id}`, ...(part.kind === 'tray' ? [`front:${part.id}`] : [])]) tracks.push({ target, property: 'translation', start, duration: settle, from: { x: 0, y: part.level * gap }, to: { x: 0, y: 0 }, ease: 'smooth' });
    tracks.push({ target: `label:${part.id}`, property: 'opacity', start: start + settle, duration: duration * .1, from: 0, to: 1, ease: 'smooth' });
  }
  tracks.push({ target: 'traces', property: 'opacity', start: duration * .7, duration: duration * .1, from: 0, to: 1 });
  return defineGraphicMotion(scene, { duration, tracks });
}

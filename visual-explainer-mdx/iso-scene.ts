import { createGraphicScene, type GraphicBounds, type GraphicPrimitive, type GraphicScene } from './graphics-types';

// Projection adapted from Tolga Cohce's iso-figure (MIT). Geometry is flattened
// into the shared primitive model; no pointer runtime, CSS clock or gallery shell.
// Keep ISO-FIGURE-LICENSE and ISO-GLOW-LICENSE beside this leaf.
export type IsoPoint = Readonly<{ x: number; y: number; z: number }>;
export type IsoFace = 'top' | 'front' | 'side';
export type IsoDetail = Readonly<{ face: IsoFace; x: number; y: number; width: number; height: number; radius?: number; live?: boolean }>;
export type IsoPart = Readonly<{
  id: string; meaning?: string; origin: IsoPoint;
  size: Readonly<{ width: number; depth: number; height: number }>;
  radius?: number; active?: boolean; details?: readonly IsoDetail[];
}>;
export type IsoSceneInput = Readonly<{ id: string; title: string; description: string; parts: readonly IsoPart[]; bounds?: GraphicBounds }>;

export function projectIsoPoint({ x, y, z }: IsoPoint) {
  if (![x, y, z].every(Number.isFinite)) throw new Error('ISO points must be finite.');
  return { x: (x - y) * Math.cos(Math.PI / 6), y: (x + y) * .5 - z };
}

function facePoint(face: IsoFace, origin: IsoPoint, u: number, v: number) {
  return projectIsoPoint({ x: origin.x + (face === 'side' ? 0 : u), y: origin.y + (face === 'top' ? v : face === 'side' ? -u : 0), z: origin.z - (face === 'top' ? 0 : v) });
}

function roundedFace(face: IsoFace, origin: IsoPoint, x: number, y: number, w: number, h: number, radius: number): string {
  const r = Math.min(radius, w / 2, h / 2), point = (u: number, v: number) => {
    const p = facePoint(face, origin, x + u, y + v); return `${p.x} ${p.y}`;
  };
  return `M ${point(r, 0)} L ${point(w - r, 0)} Q ${point(w, 0)} ${point(w, r)} L ${point(w, h - r)} Q ${point(w, h)} ${point(w - r, h)} L ${point(r, h)} Q ${point(0, h)} ${point(0, h - r)} L ${point(0, r)} Q ${point(0, 0)} ${point(r, 0)} Z`;
}

/** Three visible opaque faces, face-local details, one causal live part. */
export function createIsoScene(input: IsoSceneInput): GraphicScene {
  if (!input.parts.length || input.parts.length > 128) throw new Error('An ISO scene needs 1–128 parts.');
  if (input.parts.filter(part => part.active).length > 1) throw new Error('An ISO scene has at most one active part.');
  const corners: Readonly<{ x: number; y: number }>[] = [];
  const parts = [...input.parts].sort((a, b) => a.origin.x + a.origin.y - b.origin.x - b.origin.y || a.origin.z - b.origin.z);
  const objects = parts.map(part => {
    const { x, y, z } = part.origin, { width: w, depth: d, height: h } = part.size, r = part.radius ?? 3;
    if (![x, y, z, w, d, h, r].every(Number.isFinite) || Math.min(w, d, h) <= 0 || r < 0 || (part.details?.length ?? 0) > 256) throw new Error(`Invalid ISO part: ${part.id}`);
    for (const dx of [0, w]) for (const dy of [0, d]) for (const dz of [0, h]) corners.push(projectIsoPoint({ x: x + dx, y: y + dy, z: z + dz }));
    const faces = {
      side: { origin: { x: x + w, y: y + d, z: z + h }, width: d, height: h },
      front: { origin: { x, y: y + d, z: z + h }, width: w, height: h },
      top: { origin: { x, y, z: z + h }, width: w, height: d },
    };
    const primitives: GraphicPrimitive[] = [];
    for (const face of ['side', 'front', 'top'] as const) {
      const plane = faces[face];
      primitives.push({ kind: 'path', d: roundedFace(face, plane.origin, 0, 0, plane.width, plane.height, face === 'top' ? r : Math.min(r, h / 4)), fill: 'background', stroke: 'illustration-ink', strokeRole: 'structure' });
      for (const detail of part.details?.filter(detail => detail.face === face) ?? []) {
        const radius = detail.radius ?? 0;
        if (![detail.x, detail.y, detail.width, detail.height, radius].every(Number.isFinite) || Math.min(detail.width, detail.height) <= 0 || Math.min(detail.x, detail.y, radius) < 0 || detail.x + detail.width > plane.width || detail.y + detail.height > plane.height) throw new Error(`ISO detail exceeds ${part.id}/${face}.`);
        primitives.push({ kind: 'path', d: roundedFace(face, plane.origin, detail.x, detail.y, detail.width, detail.height, radius), fill: detail.live ? 'live' : 'none', stroke: detail.live ? 'live' : 'illustration-muted', strokeRole: 'detail', glow: detail.live });
      }
    }
    if (part.details?.some(detail => !['side', 'front', 'top'].includes(detail.face))) throw new Error(`Unsupported ISO face: ${part.id}`);
    return { id: part.id, kind: 'illustration' as const, meaning: part.meaning, state: { opacity: 1, reveal: 1, highlight: part.active ?? false, x: 0, y: 0 }, primitives };
  });
  const minX = Math.min(...corners.map(p => p.x)), minY = Math.min(...corners.map(p => p.y));
  const maxX = Math.max(...corners.map(p => p.x)), maxY = Math.max(...corners.map(p => p.y));
  const padding = Math.max(16, Math.max(maxX - minX, maxY - minY) * .1);
  const bounds = input.bounds ?? { x: minX - padding, y: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 };
  if (minX < bounds.x || minY < bounds.y || maxX > bounds.x + bounds.width || maxY > bounds.y + bounds.height) throw new Error('ISO frame clips the rest geometry.');
  return createGraphicScene({ id: input.id, title: input.title, description: input.description, bounds, objects });
}

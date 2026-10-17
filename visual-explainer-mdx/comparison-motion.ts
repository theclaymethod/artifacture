import { createGraphicScene, type GraphicObject, type GraphicPrimitive, type GraphicScene } from './graphics-types';
import { defineGraphicMotion, type GraphicMotion, type GraphicMotionTrack } from './graphic-motion';
import { composeGraphics, type GraphicComposition } from './graphics-composition';

export type ComparisonWipeInput = Readonly<{
  id: string; title: string; description: string; before: GraphicScene; after: GraphicScene;
  beforeMotion?: GraphicMotion; afterMotion?: GraphicMotion; registration: readonly string[];
  duration: number; start: number; transition: number; from: number; to: number; axis?: 'x' | 'y'; ease?: GraphicMotionTrack['ease'];
}>;

function primitiveGeometry(p: GraphicPrimitive) {
  switch (p.kind) {
    case 'rect': return [p.kind, p.x, p.y, p.width, p.height, p.radius ?? 0];
    case 'circle': return [p.kind, p.x, p.y, p.radius];
    case 'polygon': return [p.kind, p.points.map(point => [point.x, point.y])];
    case 'path': return [p.kind, p.d, p.arrow];
    case 'line': return [p.kind, p.x1, p.y1, p.x2, p.y2];
    case 'text': return [p.kind, p.x, p.y, p.leading, p.size, p.weight, p.anchor ?? 'start', p.font ?? 'body', p.textLength, p.lines.length, p.label ?? false];
  }
}
function registrationGeometry(object: GraphicObject): string {
  const placement = object.placement ?? { scale: 1, x: 0, y: 0 };
  return JSON.stringify([object.kind, [placement.scale, placement.x, placement.y], object.state?.x ?? 0, object.state?.y ?? 0,
    object.primitives.map(primitiveGeometry)]);
}

/** Compare independently scoped figures with complementary, registered masks. */
export function comparisonWipe(input: ComparisonWipeInput): GraphicComposition {
  const before = createGraphicScene(input.before), after = createGraphicScene(input.after);
  if (JSON.stringify([before.bounds.x, before.bounds.y, before.bounds.width, before.bounds.height]) !== JSON.stringify([after.bounds.x, after.bounds.y, after.bounds.width, after.bounds.height])) throw new Error('Compared scenes must share identical bounds.');
  if (!input.registration.length || new Set(input.registration).size !== input.registration.length) throw new Error('A comparison needs unique registered object IDs.');
  for (const id of input.registration) {
    const a = before.objects.find(object => object.id === id), b = after.objects.find(object => object.id === id);
    if (!a || !b || registrationGeometry(a) !== registrationGeometry(b)) throw new Error(`Comparison registration geometry differs: ${id}`);
  }
  const sideMotion = (scene: GraphicScene, motion: GraphicMotion | undefined, side: 'start' | 'end') => {
    const base = defineGraphicMotion(scene, motion ?? { duration: input.duration, tracks: [] });
    if (base.duration > input.duration || base.tracks.some(track => track.property === 'mask')) throw new Error('Comparison sides must fit the duration and have no existing mask tracks.');
    return defineGraphicMotion(scene, { duration: input.duration, tracks: [...base.tracks, ...scene.objects.map(object => ({ target: object.id, property: 'mask' as const, bounds: scene.bounds, axis: input.axis ?? 'x', side, start: input.start, duration: input.transition, from: input.from, to: input.to, ease: input.ease }))] });
  };
  return composeGraphics({ id: input.id, title: input.title, description: input.description, bounds: before.bounds, duration: input.duration, instances: [
    { id: 'before', scene: before, motion: sideMotion(before, input.beforeMotion, 'end'), frame: before.bounds, clip: 'frame' },
    { id: 'after', scene: after, motion: sideMotion(after, input.afterMotion, 'start'), frame: before.bounds, clip: 'frame' },
  ] });
}

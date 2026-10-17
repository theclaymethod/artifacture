import { createGraphicScene, validateGraphicBounds, type GraphicBounds, type GraphicObject, type GraphicPlacement, type GraphicScene } from './graphics-types';
import { defineGraphicMotion, type GraphicMotion, type GraphicMotionTrack } from './graphic-motion';
import { intersectGraphicClips, transformGraphicBounds, transformGraphicClip } from './graphic-clips';

export type GraphicInstance = Readonly<{
  id: string;
  scene: GraphicScene;
  motion?: GraphicMotion;
  frame: GraphicBounds;
  align?: Readonly<{ x: 'start' | 'center' | 'end'; y: 'start' | 'center' | 'end' }>;
  clip: 'none' | 'frame';
}>;
export type GraphicCompositionInput = Readonly<{
  id: string;
  title: string;
  description: string;
  bounds: GraphicBounds;
  duration: number;
  instances: readonly GraphicInstance[];
}>;
export type GraphicComposition = Readonly<{ scene: GraphicScene; motion: GraphicMotion }>;

/** Fit complete scene instances uniformly; bind their local motion to one clock. */
export function composeGraphics(input: GraphicCompositionInput): GraphicComposition {
  if (!input.instances.length) throw new Error('A composition needs at least one instance.');
  validateGraphicBounds(input.bounds);
  if (!Number.isFinite(input.duration) || input.duration <= 0) throw new Error('Composition duration must be finite and positive.');
  const instances = new Set<string>();
  const objects: GraphicObject[] = [];
  const tracks: GraphicMotionTrack[] = [];
  let nextOrder = 0;
  for (const instance of input.instances) {
    if (instance.id !== String(instance.id) || !instance.id.trim() || instances.has(instance.id)) throw new Error(`Instance IDs must be unique: ${instance.id}`);
    instances.add(instance.id);
    if (instance.clip !== 'none' && instance.clip !== 'frame') throw new Error(`Unsupported instance clip: ${instance.id}`);
    const source = createGraphicScene(instance.scene);
    const motion = defineGraphicMotion(source, instance.motion ?? { duration: input.duration, tracks: [] });
    if (motion.duration > input.duration) throw new Error(`Instance motion exceeds composition duration: ${instance.id}`);
    const placement = fitPlacement(source.bounds, instance.frame, instance.align);
    const sourceNodes = new Map(source.objects.flatMap(object => object.node ? [[object.node.order, object.node] as const] : []));
    const orders = new Map([...sourceNodes.values()].map(node => [node.id, nextOrder++]));
    const identity = (local: string) => scopeIdentity({ instance: instance.id, local });
    for (const object of source.objects) {
      objects.push({
        ...object,
        id: identity(object.id),
        node: object.node ? { ...object.node, id: identity(object.node.id), order: orders.get(object.node.id)! } : undefined,
        edge: object.edge ? {
          ...object.edge,
          id: object.edge.id === undefined ? undefined : identity(object.edge.id),
          fromOrder: orders.get(sourceNodes.get(object.edge.fromOrder)!.id)!,
          toOrder: orders.get(sourceNodes.get(object.edge.toOrder)!.id)!,
        } : undefined,
        placement: mergePlacement(placement, object.placement),
        clip: intersectGraphicClips(transformGraphicClip(object.clip, placement), instance.clip === 'frame' ? { kind: 'rect', bounds: instance.frame } : undefined),
      });
    }
    tracks.push(...motion.tracks.map(track => track.property === 'mask'
      ? { ...track, target: identity(track.target), bounds: transformGraphicBounds(track.bounds, placement) }
      : { ...track, target: identity(track.target) }));
  }
  const scene = createGraphicScene({ id: input.id, title: input.title, description: input.description, bounds: input.bounds, objects });
  return Object.freeze({ scene, motion: defineGraphicMotion(scene, { duration: input.duration, tracks }) });
}

// A length prefix is injective even when local IDs already contain scoped IDs.
// Addresses stay private; authors bind motion before instancing the source.
function scopeIdentity(address: Readonly<{ instance: string; local: string }>): string {
  return `${address.instance.length}:${address.instance}/${address.local}`;
}

function fitPlacement(source: GraphicBounds, frame: GraphicBounds, align: GraphicInstance['align']): GraphicPlacement {
  validateGraphicBounds(frame);
  const fractions = { start: 0, center: 0.5, end: 1 };
  const xAlign = align?.x ?? 'center';
  const yAlign = align?.y ?? 'center';
  if (!Object.hasOwn(fractions, xAlign) || !Object.hasOwn(fractions, yAlign)) throw new Error('Unsupported graphic alignment.');
  const scale = Math.min(frame.width / source.width, frame.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  const x = frame.x + (frame.width - width) * fractions[xAlign] - source.x * scale;
  const y = frame.y + (frame.height - height) * fractions[yAlign] - source.y * scale;
  if ([scale, width, height, x, y].some(n => !Number.isFinite(n)) || scale <= 0 || width <= 0 || height <= 0) throw new Error('Graphic fit exceeds finite geometry.');
  return { scale, x, y };
}

function mergePlacement(outer: GraphicPlacement, inner?: GraphicPlacement): GraphicPlacement {
  return inner ? { scale: outer.scale * inner.scale, x: outer.x + outer.scale * inner.x, y: outer.y + outer.scale * inner.y } : outer;
}

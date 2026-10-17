import { validateGraphicBounds, type GraphicBounds, type GraphicClip, type GraphicPlacement } from './graphics-types';

export function transformGraphicBounds(input: GraphicBounds, placement: GraphicPlacement): GraphicBounds {
  const bounds = { x: placement.x + placement.scale * input.x, y: placement.y + placement.scale * input.y, width: placement.scale * input.width, height: placement.scale * input.height };
  validateGraphicBounds(bounds);
  return bounds;
}

export function transformGraphicClip(clip: GraphicClip | undefined, placement: GraphicPlacement): GraphicClip | undefined {
  if (!clip || clip.kind === 'empty') return clip;
  return { kind: 'rect', bounds: transformGraphicBounds(clip.bounds, placement) };
}

export function intersectGraphicClips(a: GraphicClip | undefined, b: GraphicClip | undefined): GraphicClip | undefined {
  if (a?.kind === 'empty' || b?.kind === 'empty') return { kind: 'empty' };
  if (!a) return b;
  if (!b) return a;
  const x = Math.max(a.bounds.x, b.bounds.x), y = Math.max(a.bounds.y, b.bounds.y);
  const width = Math.min(a.bounds.x + a.bounds.width, b.bounds.x + b.bounds.width) - x;
  const height = Math.min(a.bounds.y + a.bounds.height, b.bounds.y + b.bounds.height) - y;
  return width > 0 && height > 0 ? { kind: 'rect', bounds: { x, y, width, height } } : { kind: 'empty' };
}

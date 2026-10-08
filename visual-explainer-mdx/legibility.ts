import type { GraphicBounds, GraphicScene } from './graphics-types';

export type LegibilityOptions = Readonly<{
  /** Rendered width of the scene's view box in pixels, for example 1920 for a full-frame 1080p film. */
  outputWidth: number;
  /** Smallest acceptable on-screen text size in pixels; 24 px is the video minimum at 1080p. */
  minTextPx?: number;
  /** The view box actually shown, when a camera frames part of the scene. Defaults to scene bounds. */
  view?: GraphicBounds;
}>;
export type LegibilityViolation = Readonly<{ object: string; text: string; px: number }>;

/**
 * Report text that renders smaller than `minTextPx` on screen. Size is the text primitive's size
 * times its placement scale, converted through the shown view box to output pixels.
 */
export function inspectLegibility(scene: GraphicScene, options: LegibilityOptions): readonly LegibilityViolation[] {
  const { outputWidth, minTextPx = 24, view = scene.bounds } = options;
  if (!(outputWidth > 0) || !(minTextPx > 0) || !(view.width > 0)) throw new Error('Legibility needs a positive output width, minimum size and view width.');
  const pxPerUnit = outputWidth / view.width, small: LegibilityViolation[] = [];
  for (const object of scene.objects) {
    if ((object.state?.opacity ?? 1) <= 0) continue;
    const scale = (object.placement?.scale ?? 1) * (object.state?.scale ?? 1);
    for (const primitive of object.primitives) {
      if (primitive.kind !== 'text') continue;
      const px = primitive.size * scale * pxPerUnit;
      if (px < minTextPx) small.push({ object: object.id, text: primitive.lines.join(' '), px: Number(px.toFixed(1)) });
    }
  }
  return Object.freeze(small.sort((a, b) => a.px - b.px).map(violation => Object.freeze(violation)));
}

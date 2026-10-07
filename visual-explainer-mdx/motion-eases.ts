// Monotone curves adapted from motionmaxxing runtime/motion.js (Apache-2.0).
// Modified: named TypeScript functions, bounded input, no GSAP or playback clock.
// Keep MOTIONMAXXING-LICENSE and MOTIONMAXXING-NOTICE beside this leaf.
const curves = {
  linear: (t: number) => t,
  smooth: (t: number) => t * t * (3 - 2 * t),
  'soft-land': (t: number) => (1 - Math.exp(-3.41 * t)) / (1 - Math.exp(-3.41)),
  'snap-settle': (t: number) => (.942 * (1 - Math.exp(-t / .118)) + .058 * t) / (.942 * (1 - Math.exp(-1 / .118)) + .058),
  glide: (t: number) => 1 - (1 - t) ** 1.7,
  whip: (t: number) => 1 - (1 - t) ** 2.52,
  'soft-in-out': (t: number) => t ** 1.42 / (t ** 1.42 + (1 - t) ** 1.42),
  'gentle-in': (t: number) => t ** 2.07,
  'accel-exit': (t: number) => t ** 2.6,
  'crash-out': (t: number) => t ** 3.97,
};
export type MotionEase = keyof typeof curves;
export const motionEaseNames = Object.freeze(Object.keys(curves).filter((key): key is MotionEase => Object.hasOwn(curves, key)));
export function sampleMotionEase(ease: MotionEase, progress: number): number {
  if (!Object.hasOwn(curves, ease)) throw new Error(`Unsupported motion ease: ${ease}`);
  if (!Number.isFinite(progress)) throw new Error('Motion progress must be finite.');
  return progress <= 0 ? 0 : progress >= 1 ? 1 : curves[ease](progress);
}

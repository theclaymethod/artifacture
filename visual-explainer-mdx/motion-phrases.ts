import type { GraphicMotionTrack } from './graphic-motion';
import type { GraphicPoint } from './graphic-routes';
import type { MotionEase } from './motion-eases';

export type ArriveOptions = Readonly<{
  /** Offset the object travels from, in its own coordinates. */
  from?: GraphicPoint;
  /** Seconds of movement; the opacity step is a third of this. */
  duration?: number;
  ease?: MotionEase;
  /** Start slightly oversize and settle to 1, scaling about this point. */
  overshoot?: Readonly<{ scale: number; origin: GraphicPoint }>;
}>;
export type LeaveOptions = Readonly<{ to?: GraphicPoint; duration?: number; ease?: MotionEase }>;

const ZERO = { x: 0, y: 0 } as const;

/**
 * Arrive by moving: a short opacity step under a decelerating move (Motionmaxxing's arrival law).
 * The object should rest at opacity 0 before `at`.
 */
export function arrive(target: string, at: number, options: ArriveOptions = {}): readonly GraphicMotionTrack[] {
  const { from = { x: 0, y: 24 }, duration = .36, ease = 'snap-settle', overshoot } = options;
  if (!Number.isFinite(at) || at < 0 || !(duration > 0)) throw new Error('Arrivals need a nonnegative start and positive duration.');
  const tracks: GraphicMotionTrack[] = [
    { target, property: 'opacity', start: at, duration: Math.max(1 / 30, duration / 3), from: 0, to: 1, ease: 'smooth' },
    { target, property: 'translation', start: at, duration, from, to: ZERO, ease },
  ];
  if (overshoot) tracks.push({ target, property: 'scale', start: at, duration, from: overshoot.scale, to: 1, origin: overshoot.origin, ease: 'soft-land' });
  return Object.freeze(tracks);
}

/** Leave by accelerating away and fading over the second half (Motionmaxxing's exit law). */
export function leave(target: string, at: number, options: LeaveOptions = {}): readonly GraphicMotionTrack[] {
  const { to = { x: 0, y: -24 }, duration = .3, ease = 'accel-exit' } = options;
  if (!Number.isFinite(at) || at < 0 || !(duration > 0)) throw new Error('Departures need a nonnegative start and positive duration.');
  return Object.freeze([
    { target, property: 'translation', start: at, duration, from: ZERO, to, ease },
    { target, property: 'opacity', start: at + duration / 2, duration: duration / 2, from: 1, to: 0, ease: 'gentle-in' },
  ] satisfies GraphicMotionTrack[]);
}

/** Stagger arrivals for several targets, `gap` seconds apart, in the order given. */
export function arriveInOrder(targets: readonly string[], at: number, gap = .06, options: ArriveOptions = {}): readonly GraphicMotionTrack[] {
  if (!(gap >= 0)) throw new Error('Stagger gaps must be nonnegative.');
  return Object.freeze(targets.flatMap((target, i) => arrive(target, at + i * gap, options)));
}

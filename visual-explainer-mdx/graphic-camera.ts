import type { GraphicBounds } from './graphics-types';
import { motionEaseNames, sampleMotionEase, type MotionEase } from './motion-eases';

/** A camera pose: view-box centre and width at an authored time. The ease shapes the move into this key. */
export type CameraKey = Readonly<{ t: number; cx: number; cy: number; width: number; ease?: MotionEase }>;

export function validateCameraKeys(keys: readonly CameraKey[], duration: number): void {
  if (!keys.length) throw new Error('A camera needs at least one key.');
  keys.forEach((key, i) => {
    if (![key.t, key.cx, key.cy, key.width].every(Number.isFinite) || key.width <= 0 || key.t < 0 || key.t > duration + 1e-9) throw new Error(`Camera keys need finite times inside the motion and positive widths: ${i}`);
    if (i && key.t < keys[i - 1].t) throw new Error('Camera keys must be in time order.');
    if (key.ease !== undefined && !motionEaseNames.includes(key.ease)) throw new Error(`Unsupported camera ease: ${key.ease}`);
  });
}

/** The camera's view box at an authored time, with the given aspect ratio (width / height). */
export function sampleCamera(keys: readonly CameraKey[], authoredSeconds: number, aspect: number): GraphicBounds {
  if (!keys.length || !Number.isFinite(authoredSeconds) || !(aspect > 0)) throw new Error('Sampling a camera needs keys, a finite time and a positive aspect.');
  let at: Pick<CameraKey, 'cx' | 'cy' | 'width'> = keys[keys.length - 1];
  if (authoredSeconds < keys[0].t) at = keys[0];
  else for (let i = 0; i < keys.length - 1; i++) if (authoredSeconds >= keys[i].t && authoredSeconds < keys[i + 1].t) {
    const a = keys[i], b = keys[i + 1], u = sampleMotionEase(b.ease ?? 'smooth', Math.min(1, Math.max(0, (authoredSeconds - a.t) / Math.max(1e-3, b.t - a.t))));
    at = { cx: a.cx + (b.cx - a.cx) * u, cy: a.cy + (b.cy - a.cy) * u, width: a.width + (b.width - a.width) * u };
    break;
  }
  return Object.freeze({ x: at.cx - at.width / 2, y: at.cy - at.width / aspect / 2, width: at.width, height: at.width / aspect });
}

/** The widest camera pose, for a still, a poster or a slide of the same beat. */
export function widestCamera(keys: readonly CameraKey[], aspect: number): GraphicBounds {
  if (!keys.length) throw new Error('Choosing a camera pose needs at least one key.');
  return sampleCamera([keys.reduce((best, key) => key.width > best.width ? key : best, keys[0])], 0, aspect);
}

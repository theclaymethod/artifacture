// Monotone interpolation adapted from LemoLab's core/lib.js at 54be47b.
// Copyright (c) 2026 LemoLab. MIT notice: LEMO-LICENSE.
export type ScalarKey = readonly [seconds: number, value: number];
export type VectorKey = readonly [seconds: number, values: readonly number[]];
export type ValueSampler<T> = (authoredSeconds: number) => T;

function validateTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Authored time must be finite and nonnegative.');
}
export function createMonotoneTrack(keys: readonly ScalarKey[]): ValueSampler<number> {
  if (!keys.length) throw new Error('A value track needs at least one key.');
  for (const [index, key] of keys.entries()) {
    validateTime(key[0]);
    if (!Number.isFinite(key[1]) || (index && key[0] <= keys[index - 1][0])) throw new Error('Keys need finite values and strictly increasing times.');
  }
  const xs = keys.map(key => key[0]), values = keys.map(key => key[1]);
  const n = keys.length, slopes: number[] = [], signs: number[] = [], tangents = Array.from({ length: n }, () => -Infinity);
  // Log magnitudes keep tiny and huge adjacent segments from erasing each other.
  for (let i = 0; i < n - 1; i++) {
    const delta = values[i + 1] - values[i], magnitude = Math.max(Math.abs(values[i]), Math.abs(values[i + 1]));
    signs.push(Math.sign(values[i + 1] - values[i]));
    slopes.push(delta === 0 ? -Infinity : (Number.isFinite(delta) ? Math.log(Math.abs(delta)) : Math.log(Math.abs(values[i + 1] / magnitude - values[i] / magnitude)) + Math.log(magnitude)) - Math.log(xs[i + 1] - xs[i]));
  }
  if (n > 1) { tangents[0] = slopes[0]; tangents[n - 1] = slopes[n - 2]; }
  for (let i = 1; i < n - 1; i++) {
    if (!signs[i] || signs[i - 1] !== signs[i]) continue;
    const maximum = Math.max(slopes[i - 1], slopes[i]);
    tangents[i] = maximum + Math.log1p(Math.exp(Math.min(slopes[i - 1], slopes[i]) - maximum)) - Math.LN2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (!signs[i]) { tangents[i] = tangents[i + 1] = -Infinity; continue; }
    const a = tangents[i] - slopes[i], b = tangents[i + 1] - slopes[i], maximum = Math.max(a, b);
    if (maximum === -Infinity) continue;
    const length = maximum + Math.log(Math.hypot(Math.exp(a - maximum), Math.exp(b - maximum)));
    if (length > Math.log(3)) { tangents[i] += Math.log(3) - length; tangents[i + 1] += Math.log(3) - length; }
  }
  return seconds => {
    validateTime(seconds);
    if (seconds <= xs[0]) return values[0];
    if (seconds >= xs[n - 1]) return values[n - 1];
    let i = 0; while (seconds > xs[i + 1]) i++;
    if (seconds === xs[i + 1]) return values[i + 1];
    if (!signs[i]) return values[i];
    const h = xs[i + 1] - xs[i], u = (seconds - xs[i]) / h, u2 = u * u, u3 = u2 * u;
    const magnitude = Math.max(Math.abs(values[i]), Math.abs(values[i + 1])), y0 = values[i] / magnitude, y1 = values[i + 1] / magnitude;
    const a = Math.exp(tangents[i] - slopes[i]), b = Math.exp(tangents[i + 1] - slopes[i]);
    const result = (2 * u3 - 3 * u2 + 1) * y0 + (-2 * u3 + 3 * u2) * y1 + ((u3 - 2 * u2 + u) * a + (u3 - u2) * b) * (y1 - y0);
    return Math.max(Math.min(y0, y1), Math.min(Math.max(y0, y1), result)) * magnitude;
  };
}
export function createVectorTrack(keys: readonly VectorKey[]): ValueSampler<readonly number[]> {
  if (!keys.length || !keys[0][1].length || keys.some(key => key[1].length !== keys[0][1].length)) throw new Error('Vector keys need equal nonempty dimensions.');
  const samplers = keys[0][1].map((_, component) => createMonotoneTrack(keys.map(key => [key[0], key[1][component]])));
  return seconds => Object.freeze(samplers.map(sample => sample(seconds)));
}

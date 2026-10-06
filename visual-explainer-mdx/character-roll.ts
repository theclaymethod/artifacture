import { createDotMatrixScene, type DotMatrixInput } from './dot-matrix';
import { punctumLines, punctumMask } from './punctum-text';
import { defineGraphicMotion, type GraphicMotion, type GraphicMotionTrack } from './graphic-motion';
import type { GraphicScene } from './graphics-types';

export type CharacterRollInput = Omit<DotMatrixInput, 'text' | 'columns' | 'rows'> & Readonly<{ from: string; to: string; start?: number; tick?: number; stagger?: number; steps?: number; hold?: number }>;
export type CharacterRollChange = Readonly<{ time: number; row: number; column: number; character: string }>;
export type PreparedCharacterRoll = Readonly<{ scene: GraphicScene; finalScene: GraphicScene; motion: GraphicMotion; changes: readonly CharacterRollChange[]; completion: number }>;

const drum = Array.from(' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.-/');

function intervalDuration(start: number, end: number): number {
  const duration = end - start;
  if (start + duration <= end) return duration;
  // Choose the immediately smaller duration when binary addition overshoots the authored boundary.
  const encoded = new DataView(new ArrayBuffer(8));
  encoded.setFloat64(0, duration);
  encoded.setBigUint64(0, encoded.getBigUint64(0) - 1n);
  return encoded.getFloat64(0);
}

export function createCharacterRoll(input: CharacterRollInput): PreparedCharacterRoll {
  const before = punctumLines(input.from), after = punctumLines(input.to);
  const columns = Math.max(...[...before, ...after].map(line => line.length)), rows = Math.max(before.length, after.length);
  const start = input.start ?? .3, tick = input.tick ?? .065, stagger = input.stagger ?? .045, steps = input.steps ?? 7, hold = input.hold ?? .6;
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(tick) || tick < .01 || !Number.isFinite(stagger) || stagger < 0 || !Number.isSafeInteger(steps) || steps < 1 || steps > 16 || !Number.isFinite(hold) || hold <= 0) throw new Error('Roll timing needs a nonnegative start/stagger, tick ≥ .01, 1–16 steps and a positive hold.');
  if (start + (rows + columns - 2) * stagger + steps * tick + hold > 120) throw new Error('Character rolls must fit within 120 seconds.');
  const prepared = createDotMatrixScene({ ...input, text: input.from, columns, rows });
  const finalScene = createDotMatrixScene({ ...input, text: input.to, columns, rows }).scene;
  const tracks: GraphicMotionTrack[] = [], changes: CharacterRollChange[] = [];
  let completion = start;
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const from = before[row]?.[col] ?? ' ', to = after[row]?.[col] ?? ' ';
    if (from === to) continue;
    const stop = drum.indexOf(to.toUpperCase()), destination = stop < 0 ? (row * columns + col) % drum.length : stop;
    const states = Array.from({ length: steps }, (_, step) => Object.freeze({ time: start + (row + col) * stagger + (step + 1) * tick, character: step === steps - 1 ? to : drum[(destination - steps + step + 1 + drum.length) % drum.length], row, column: col }));
    changes.push(...states);
    completion = Math.max(completion, states.at(-1)!.time);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 5; x++) {
      let previous = punctumMask(from)[y][x] === '#' ? 1 : 0, previousTime = 0;
      for (const state of states) {
        const value = punctumMask(state.character)[y][x] === '#' ? 1 : 0;
        if (value === previous) continue;
        tracks.push({ target: `dot:${row}:${col}:${y}:${x}`, property: 'opacity', from: previous, to: value, interpolation: 'step-end', start: previousTime, duration: intervalDuration(previousTime, state.time) });
        previous = value; previousTime = state.time;
      }
    }
  }
  const motion = defineGraphicMotion(prepared.scene, { duration: completion + hold, tracks });
  changes.sort((a, b) => a.time - b.time || a.row - b.row || a.column - b.column);
  return Object.freeze({ scene: prepared.scene, finalScene, motion, changes: Object.freeze(changes), completion });
}

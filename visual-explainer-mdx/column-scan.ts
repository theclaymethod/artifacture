import { createDotMatrixScene, type DotMatrixInput } from './dot-matrix';
import { createGraphicScene, type GraphicScene, type GraphicObject } from './graphics-types';
import { defineGraphicMotion, type GraphicMotion, type GraphicMotionTrack } from './graphic-motion';

export type ColumnScanInput = DotMatrixInput & Readonly<{ start?: number; step?: number; hold?: number; mode?: 'reveal' | 'read' }>;
export type DotScanEvent = Readonly<{ id: string; target: string; time: number; row: number; column: number; frequency: number }>;
export type PreparedColumnScan = Readonly<{ scene: GraphicScene; finalScene: GraphicScene; motion: GraphicMotion; events: readonly DotScanEvent[]; completion: number }>;

export function createColumnScan(input: ColumnScanInput): PreparedColumnScan {
  const prepared = createDotMatrixScene(input), start = input.start ?? .3, step = input.step ?? .09, hold = input.hold ?? .6, mode = input.mode ?? 'reveal';
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(step) || step < .01 || !Number.isFinite(hold) || hold <= 0 || !['reveal', 'read'].includes(mode)) throw new Error('Scan timing needs a nonnegative start, step ≥ .01, positive hold, and reveal/read mode.');
  const lastColumn = (prepared.columns - 1) * 6 + 4, completion = start + (lastColumn + 1) * step, duration = completion + hold;
  if (duration > 120) throw new Error('Column scans must fit within 120 seconds.');
  const tracks: GraphicMotionTrack[] = [], events: DotScanEvent[] = [], accents: GraphicObject[] = [];
  const cells = new Map(prepared.cells.map(cell => [cell.id, cell]));
  const objects: GraphicObject[] = prepared.scene.objects.map(object => {
    const cell = cells.get(object.id);
    if (!cell?.lit) return object;
    const time = start + cell.column * step;
    const event = Object.freeze({ id: `scan:${cell.id}`, target: cell.id, time, row: cell.characterRow * 10 + cell.dotRow, column: cell.column, frequency: 220 * 2 ** ((8 - cell.dotRow) / 12) });
    const state = { opacity: time === 0 ? 1 : 0, reveal: 1, highlight: false, x: 0, y: 0 };
    events.push(event);
    if (mode === 'reveal' && time > 0) tracks.push({ target: object.id, property: 'opacity', from: 0, to: 1, interpolation: 'step-end', start: 0, duration: time });
    accents.push({ ...object, id: event.id, primitives: object.primitives.map(primitive => ({ ...primitive, fill: 'accent' })), state });
    if (time > 0) tracks.push({ target: event.id, property: 'opacity', from: 0, to: 1, interpolation: 'step-end', start: 0, duration: time });
    tracks.push({ target: event.id, property: 'opacity', from: 1, to: 0, start: time, duration: step * .8, ease: 'smooth' });
    return mode === 'reveal' ? { ...object, state } : object;
  });
  objects.push(...accents);
  const x = prepared.pitch * 1.5;
  objects.push({ id: 'scan-head', kind: 'illustration', primitives: [{ kind: 'path', d: `M ${x} ${prepared.pitch * .5} V ${prepared.scene.bounds.height - prepared.pitch * .5}`, fill: 'none', stroke: 'accent', strokeRole: 'guide' }], state: { opacity: start === 0 ? 1 : 0, reveal: 1, highlight: false, x: 0, y: 0 } });
  if (start > 0) tracks.push({ target: 'scan-head', property: 'opacity', from: 0, to: 1, interpolation: 'step-end', start: 0, duration: start });
  tracks.push({ target: 'scan-head', property: 'translation', from: { x: 0, y: 0 }, to: { x: lastColumn * prepared.pitch, y: 0 }, start, duration: lastColumn * step });
  tracks.push({ target: 'scan-head', property: 'opacity', from: 1, to: 0, start: completion - step, duration: step });
  events.sort((a, b) => a.time - b.time || a.row - b.row);
  const scene = createGraphicScene({ ...prepared.scene, objects });
  return Object.freeze({ scene, finalScene: prepared.scene, motion: defineGraphicMotion(scene, { duration, tracks }), events: Object.freeze(events), completion });
}

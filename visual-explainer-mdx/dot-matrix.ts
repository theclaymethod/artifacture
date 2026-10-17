import { punctumAxes, punctumLines, punctumMask } from './punctum-text';
import { createGraphicScene, type GraphicScene, type GraphicObject, type GraphicPaint } from './graphics-types';

export type DotMatrixInput = Pick<GraphicScene, 'id' | 'title' | 'description'> & Readonly<{
  text: string;
  pitch?: number;
  weight?: number;
  roundness?: number;
  lattice?: boolean;
  paint?: 'ink' | 'accent';
  columns?: number;
  rows?: number;
}>;
export type DotMatrixCell = Readonly<{ id: string; character: string; characterRow: number; characterColumn: number; dotRow: number; dotColumn: number; column: number; lit: boolean }>;
export type PreparedDotMatrix = Readonly<{ scene: GraphicScene; cells: readonly DotMatrixCell[]; text: string; columns: number; rows: number; pitch: number }>;


function dotSize(weight: number, roundness: number, pitch: number): number {
  const interpolate = (thin: number, regular: number) => weight <= 400 ? thin + (regular - thin) * (weight - 100) / 300 : regular + (50 - regular) * (weight - 400) / 500;
  const square = interpolate(11, 27), round = interpolate(12, 30);
  return 2 * pitch * (square + (round - square) * roundness / 100) / 100;
}

export function createDotMatrixScene(input: DotMatrixInput): PreparedDotMatrix {
  const lines = punctumLines(input.text);
  const columns = input.columns ?? Math.max(...lines.map(line => line.length)), rows = input.rows ?? lines.length;
  if (!Number.isSafeInteger(columns) || columns < Math.max(...lines.map(line => line.length)) || columns > 32 || !Number.isSafeInteger(rows) || rows < lines.length || rows > 8) throw new Error('The dot grid must contain the text, with 1–32 columns and 1–8 rows.');
  const pitch = input.pitch ?? 16, weight = input.weight ?? 300, roundness = input.roundness ?? 100;
  if (!Number.isFinite(pitch) || pitch < 2 || pitch > 128) throw new Error('Dot pitch must be 2–128 scene units.');
  punctumAxes(weight, roundness);
  if (input.paint !== undefined && input.paint !== 'ink' && input.paint !== 'accent') throw new Error('Dot paint must be ink or accent.');
  if (input.lattice !== undefined && input.lattice !== true && input.lattice !== false) throw new Error('Lattice must be boolean.');
  const objects: GraphicObject[] = [], cells: DotMatrixCell[] = [];
  const lattice: GraphicObject['primitives'][number][] = [];
  const size = dotSize(weight, roundness, pitch), padding = pitch * 1.5;
  const dot = (x: number, y: number, fill: GraphicPaint): GraphicObject['primitives'][number] => ({ kind: 'rect', x: x - size / 2, y: y - size / 2, width: size, height: size, radius: size / 2 * roundness / 100, fill });
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const character = lines[row]?.[col] ?? ' ', mask = punctumMask(character);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 5; x++) {
      const id = `dot:${row}:${col}:${y}:${x}`, lit = mask[y][x] === '#';
      const px = padding + (col * 6 + x) * pitch, py = padding + (row * 10 + y) * pitch;
      cells.push(Object.freeze({ id, character, characterRow: row, characterColumn: col, dotRow: y, dotColumn: x, column: col * 6 + x, lit }));
      if (input.lattice) lattice.push({ kind: 'circle', x: px, y: py, radius: pitch * .07, fill: 'frame' });
      objects.push({ id, kind: 'illustration', primitives: [dot(px, py, input.paint ?? 'ink')], state: { opacity: lit ? 1 : 0, reveal: 1, highlight: false, x: 0, y: 0 } });
    }
  }
  if (lattice.length) objects.unshift({ id: 'lattice', kind: 'illustration', primitives: lattice });
  const scene = createGraphicScene({ id: input.id, title: input.title, description: input.description, bounds: { x: 0, y: 0, width: (columns * 6 + 1) * pitch, height: (rows * 10 + 1) * pitch }, objects });
  return Object.freeze({ scene, cells: Object.freeze(cells), text: input.text, columns, rows, pitch });
}

import { createGraphicScene, validateGraphicBounds, type GraphicBounds, type GraphicObject, type GraphicScene } from './graphics-types';
import type { GraphicPoint } from './graphic-routes';

export type SourcePart = Readonly<{ id: string; text: string }>;
export type SourceVersion = Readonly<{ id: string; lines: readonly (readonly SourcePart[])[] }>;
export type SourcePosition = Readonly<{ line: number; column: number }>;
export type SourceRange = Readonly<{ id: string; version: string; start: SourcePosition; end: SourcePosition }>;
export type SourceLayout = Readonly<{ x: number; y: number; fontSize: number; columnWidth: number; lineHeight: number }>;
export type SourceCell = Readonly<{ id: string; partId: string; index: number; character: string }>;
export type SourceSceneInput = Readonly<{ id: string; title: string; description: string; bounds: GraphicBounds; layout: SourceLayout; versions: readonly SourceVersion[]; ranges: readonly SourceRange[] }>;
export type PreparedSourceScene = Readonly<{
  scene: GraphicScene; versions: readonly SourceVersion[]; initialVersion: string;
  cells: Readonly<Record<string, SourceCell>>;
  layouts: Readonly<Record<string, Readonly<Record<string, GraphicPoint>>>>;
  ranges: Readonly<Record<string, Readonly<{ version: string; bounds: readonly GraphicBounds[]; cellIds: readonly string[]; targets: readonly string[] }>>>;
}>;

const cellIdentity = (partId: string, index: number) => `source:cell:${partId.length}:${partId}/${index}`;

/** Literal source cells and exact versioned selection geometry, without a lexer. */
export function createSourceScene(input: SourceSceneInput): PreparedSourceScene {
  validateGraphicBounds(input.bounds);
  const { layout, bounds } = input;
  if (Object.values(layout).some(value => !Number.isFinite(value)) || layout.fontSize <= 0 || layout.columnWidth <= 0 || layout.lineHeight < layout.fontSize || layout.x < bounds.x || layout.y < bounds.y || !input.versions.length) throw new Error('Source layout needs finite monospace metrics inside its bounds.');
  const versions = structuredClone(input.versions);
  const versionIds = new Set<string>(), texts = new Map<string, string>();
  const cells: Record<string, SourceCell> = Object.create(null);
  const layouts: Record<string, Record<string, GraphicPoint>> = Object.create(null);
  const lineCells: Record<string, string[][]> = Object.create(null);
  const origins: Record<string, GraphicPoint> = Object.create(null);
  for (const version of versions) {
    if (version.id !== String(version.id) || !version.id.trim() || versionIds.has(version.id) || !version.lines.length) throw new Error('Source versions need unique IDs and at least one line.');
    versionIds.add(version.id);
    const partIds = new Set<string>();
    layouts[version.id] = Object.create(null);
    lineCells[version.id] = [];
    for (const [row, parts] of version.lines.entries()) {
      const rowCells: string[] = [];
      for (const part of parts) {
        if (part.id !== String(part.id) || !part.id.trim() || partIds.has(part.id) || part.text !== String(part.text) || !/^[\x20-\x7e]+$/.test(part.text)) throw new Error('Source parts need unique semantic IDs and nonempty printable ASCII text, including literal spaces.');
        partIds.add(part.id);
        if (texts.has(part.id) && texts.get(part.id) !== part.text) throw new Error(`A reused source part must preserve exact text: ${part.id}`);
        texts.set(part.id, part.text);
        for (let index = 0; index < part.text.length; index++) {
          const id = cellIdentity(part.id, index);
          const origin = { x: layout.x + rowCells.length * layout.columnWidth, y: layout.y + row * layout.lineHeight };
          cells[id] ??= { id, partId: part.id, index, character: part.text[index] };
          layouts[version.id][id] = origin;
          origins[id] ??= origin;
          rowCells.push(id);
        }
      }
      if (layout.x + rowCells.length * layout.columnWidth > bounds.x + bounds.width || layout.y + (row + 1) * layout.lineHeight > bounds.y + bounds.height) throw new Error(`Source version exceeds its authored bounds: ${version.id}`);
      lineCells[version.id].push(rowCells);
    }
    if (!lineCells[version.id].some(row => row.length)) throw new Error(`A source version must contain literal character cells: ${version.id}`);
  }
  const ranges: Record<string, { version: string; bounds: GraphicBounds[]; cellIds: string[]; targets: string[] }> = Object.create(null);
  const markers: GraphicObject[] = [];
  for (const range of input.ranges) {
    if (range.id !== String(range.id) || !range.id.trim() || Object.hasOwn(ranges, range.id) || !versionIds.has(range.version)) throw new Error('Source ranges need unique IDs and a declared version.');
    const rows = lineCells[range.version];
    for (const position of [range.start, range.end]) if (!Number.isSafeInteger(position.line) || position.line < 1 || position.line > rows.length || !Number.isSafeInteger(position.column) || position.column < 1 || position.column > rows[position.line - 1].length + 1) throw new Error(`Source range position exceeds its literal line: ${range.id}`);
    if (range.end.line < range.start.line || range.end.line === range.start.line && range.end.column <= range.start.column) throw new Error(`Source range must have ordered exclusive endpoints: ${range.id}`);
    const selected: string[] = [], boxes: GraphicBounds[] = [], targets: string[] = [];
    for (let row = range.start.line - 1; row < range.end.line; row++) {
      const start = row === range.start.line - 1 ? range.start.column - 1 : 0;
      const end = row === range.end.line - 1 ? range.end.column - 1 : rows[row].length;
      if (end <= start) continue;
      const box = { x: layout.x + start * layout.columnWidth, y: layout.y + row * layout.lineHeight, width: (end - start) * layout.columnWidth, height: layout.lineHeight };
      validateGraphicBounds(box);
      const id = `source:range:${range.id.length}:${range.id}/${boxes.length}`;
      selected.push(...rows[row].slice(start, end)); boxes.push(box); targets.push(id);
      markers.push({ id, kind: 'illustration', meaning: `Exact source range ${range.id}`, primitives: [{ kind: 'rect', ...box, radius: 2, fill: 'accent-background', stroke: 'accent', strokeRole: 'detail' }], state: { opacity: 0, reveal: 1, highlight: false, x: 0, y: 0 } });
    }
    if (!selected.length) throw new Error(`Source ranges must select character cells, not only newlines: ${range.id}`);
    ranges[range.id] = { version: range.version, bounds: boxes, cellIds: selected, targets };
  }
  const initialVersion = versions[0].id;
  const objects: GraphicObject[] = [...markers, ...Object.values(cells).map(cell => ({
    id: cell.id, kind: 'illustration' as const,
    primitives: [{ kind: 'text' as const, x: origins[cell.id].x, y: origins[cell.id].y + layout.fontSize, lines: [cell.character], size: layout.fontSize, leading: layout.lineHeight, font: 'mono' as const, fill: 'ink' as const, textLength: layout.columnWidth }],
    state: { opacity: Object.hasOwn(layouts[initialVersion], cell.id) ? 1 : 0, reveal: 1, highlight: false, x: 0, y: 0 },
  }))];
  const scene = createGraphicScene({ id: input.id, title: input.title, description: input.description, bounds, objects });
  for (const version of versions) {
    for (const line of version.lines) { line.forEach(Object.freeze); Object.freeze(line); }
    Object.freeze(version.lines); Object.freeze(version);
  }
  Object.values(cells).forEach(Object.freeze);
  for (const version of Object.values(layouts)) { Object.values(version).forEach(Object.freeze); Object.freeze(version); }
  for (const range of Object.values(ranges)) {
    range.bounds.forEach(Object.freeze); Object.freeze(range.bounds); Object.freeze(range.cellIds); Object.freeze(range.targets); Object.freeze(range);
  }
  return Object.freeze({ scene, versions: Object.freeze(versions), initialVersion, cells: Object.freeze(cells), layouts: Object.freeze(layouts), ranges: Object.freeze(ranges) });
}

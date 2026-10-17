import { createGraphicScene, type GraphicObject, type GraphicPrimitive, type GraphicScene } from './graphics-types';

export type SceneIdentity = Readonly<{ id: string; title: string; description: string }>;
export type SceneItem = Readonly<{ id: string; label: string }>;
export type SequenceMessage = SceneItem & Readonly<{ from: string; to: string; dashed?: boolean }>;
export type StateTransition = SceneItem & Readonly<{ from: string; to: string }>;
export type PlotPoint = Readonly<{ x: number; y: number }>;
export type PlotSeries = SceneItem & Readonly<{ points: readonly (PlotPoint | null)[]; emphasis?: boolean }>;
export type PlotSceneInput = SceneIdentity & Readonly<{ series: readonly PlotSeries[]; variant?: 'line' | 'scatter'; xLabel: string; yLabel: string; xDomain?: readonly [number, number]; yDomain?: readonly [number, number] }>;
export type TokenItem = SceneItem & Readonly<{ state?: 'neutral' | 'accepted' | 'rejected' }>;
export type TimedEvent = SceneItem & Readonly<{ time: number }>;
export type GridCell = Readonly<{ id: string; value: number | null }>;

function items(values: readonly SceneItem[], label: string) {
  if (!values.length) throw new Error(`${label} must not be empty.`);
  const ids = new Set<string>();
  for (const item of values) {
    if (!item.id?.trim() || !item.label?.trim() || ids.has(item.id)) throw new Error(`${label} need unique IDs and nonempty labels.`);
    ids.add(item.id);
  }
}
function words(value: string, columns: number): string[] {
  const lines: string[] = [];
  for (const word of value.trim().split(/\s+/)) {
    const last = lines.at(-1);
    if (last && last.length + word.length + 1 <= columns) lines[lines.length - 1] = `${last} ${word}`;
    else for (let at = 0; at < word.length; at += columns) lines.push(word.slice(at, at + columns));
  }
  return lines;
}
function text(x: number, y: number, label: string, columns = 24, anchor: 'start' | 'middle' = 'middle'): GraphicPrimitive {
  return { kind: 'text', x, y, lines: words(label, columns), leading: 20, size: 16, anchor, fill: 'ink' };
}
function scene(input: SceneIdentity, width: number, height: number, objects: GraphicObject[]): GraphicScene {
  return createGraphicScene({ ...input, bounds: { x: 0, y: 0, width, height }, objects });
}
function node(item: SceneItem, order: number, x: number, y: number, width: number, height: number): GraphicObject {
  const lines = words(item.label, Math.max(8, Math.floor((width - 24) / 9)));
  return { id: `node:${item.id}`, kind: 'node', node: { id: item.id, order, label: item.label }, primitives: [
    { kind: 'rect', x, y, width, height, radius: 'node', fill: 'node-background', stroke: 'node-stroke', strokeRole: 'structure', role: 'node' },
    { kind: 'text', x: x + width / 2, y: y + height / 2 - (lines.length - 1) * 10 + 5, lines, leading: 20, size: 16, anchor: 'middle', fill: 'ink', label: true },
  ] };
}

export function createSequenceScene(input: SceneIdentity & Readonly<{ participants: readonly SceneItem[]; messages: readonly SequenceMessage[] }>): GraphicScene {
  items(input.participants, 'Participants');
  if (input.participants.length < 2) throw new Error('A sequence needs at least two participants.');
  if (input.messages.length) items(input.messages, 'Messages');
  const orders = new Map(input.participants.map((item, order) => [item.id, order]));
  const column = Math.max(190, ...input.participants.map(item => Math.min(400, item.label.length * 9 + 40)));
  const header = Math.max(64, ...input.participants.map(item => words(item.label, Math.floor((column - 52) / 9)).length * 20 + 28));
  const rows = input.messages.map(message => {
    const from = orders.get(message.from), to = orders.get(message.to);
    if (from === undefined || to === undefined) throw new Error(`Unknown message participant: ${message.id}`);
    const span = Math.max(1, Math.abs(to - from));
    return { message, from, to, lines: words(message.label, Math.floor((span * column - 32) / 9)) };
  });
  const height = header + 60 + rows.reduce((sum, row) => sum + row.lines.length * 20 + 44, 0);
  const objects: GraphicObject[] = input.participants.flatMap((item, order) => [
    node(item, order, 24 + order * column, 16, column - 48, header),
    { id: `lifeline:${item.id}`, kind: 'illustration', primitives: [{ kind: 'path', d: `M ${order * column + column / 2} ${header + 16} V ${height - 24}`, fill: 'none', stroke: 'frame', strokeRole: 'guide', dash: '4 6' }] },
  ]);
  let y = header + 56;
  for (const { message, from, to, lines } of rows) {
    const x1 = from * column + column / 2, x2 = to * column + column / 2;
    y += lines.length * 20;
    const d = from === to ? `M ${x1} ${y} h 64 v 24 h -64` : `M ${x1} ${y} L ${x2} ${y}`;
    objects.push({ id: `message:${message.id}`, kind: 'edge', edge: { id: message.id, fromOrder: from, toOrder: to }, meaning: message.label, primitives: [{ kind: 'path', d, fill: 'none', stroke: 'ink', strokeRole: 'structure', arrow: 'end', dash: message.dashed ? '5 5' : undefined }] });
    objects.push({ id: `message-label:${message.id}`, kind: 'edge-label', primitives: [{ kind: 'text', x: from === to ? x1 + 72 : (x1 + x2) / 2, y: y - lines.length * 20, lines, leading: 20, size: 16, anchor: from === to ? 'start' : 'middle', fill: 'ink' }] });
    y += 44;
  }
  const selfGutter = Math.max(0, ...rows.filter(row => row.from === row.to).map(row => 72 + Math.max(...row.lines.map(line => line.length)) * 9 + 24 - column / 2));
  return scene(input, input.participants.length * column + selfGutter, height, objects);
}

export function createStateScene(input: SceneIdentity & Readonly<{ states: readonly SceneItem[]; transitions: readonly StateTransition[]; active?: string }>): GraphicScene {
  items(input.states, 'States');
  if (input.transitions.length) items(input.transitions, 'Transitions');
  const orders = new Map(input.states.map((item, order) => [item.id, order]));
  if (input.active !== undefined && !orders.has(input.active)) throw new Error('Active state must resolve.');
  const longest = Math.max(...input.states.map(item => item.label.length));
  const width = Math.max(140, Math.min(260, longest * 9 + 28));
  const height = Math.max(...input.states.map(item => words(item.label, Math.floor((width - 24) / 9)).length * 20 + 32));
  const transitionHeight = Math.max(20, ...input.transitions.map(item => words(item.label, 20).length * 20));
  const chord = Math.hypot(width, height) + transitionHeight * 2 + 100;
  const radius = input.states.length === 1 ? 130 : Math.max(130, chord / (2 * Math.sin(Math.PI / input.states.length)));
  const cx = radius + Math.max(width / 2, 100) + 100, cy = radius + height / 2 + transitionHeight + 100;
  const centers = input.states.map((_, order) => ({ x: cx + radius * Math.sin(order * Math.PI * 2 / input.states.length), y: cy - radius * Math.cos(order * Math.PI * 2 / input.states.length) }));
  const objects: GraphicObject[] = input.states.map((item, order) => ({ ...node(item, order, centers[order].x - width / 2, centers[order].y - height / 2, width, height), state: { opacity: 1, reveal: 1, highlight: input.active === item.id, x: 0, y: 0 } }));
  const pairCounts = new Map<string, { count: number; from: number }>();
  for (const transition of input.transitions) {
    const from = orders.get(transition.from), to = orders.get(transition.to);
    if (from === undefined || to === undefined) throw new Error(`Unknown state transition endpoint: ${transition.id}`);
    const a = centers[from], b = centers[to];
    const key = [from, to].sort().join(':');
    const previous = pairCounts.get(key);
    const count = previous?.count ?? 0; pairCounts.set(key, { count: count + 1, from });
    if (count > 1 || (count && from === to)) throw new Error('At most two transitions may connect a state pair; use a sequence for repeated messages.');
    const dx = b.x - a.x, dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length, uy = dy / length;
    const trim = Math.min(width / 2 / Math.max(Math.abs(ux), .0001), height / 2 / Math.max(Math.abs(uy), .0001));
    const x1 = a.x + ux * trim, y1 = a.y + uy * trim, x2 = b.x - ux * trim, y2 = b.y - uy * trim;
    const bend = count && previous?.from === from ? 44 : -44;
    const mx = (a.x + b.x) / 2 - uy * bend, my = (a.y + b.y) / 2 + ux * bend;
    const d = from === to ? `M ${a.x + width / 2} ${a.y} c 70 -80 70 80 0 20` : `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
    objects.unshift({ id: `transition:${transition.id}`, kind: 'edge', edge: { id: transition.id, fromOrder: from, toOrder: to }, primitives: [{ kind: 'path', d, fill: 'none', stroke: 'ink', strokeRole: 'structure', arrow: 'end' }] });
    const labelLines = words(transition.label, 20);
    const labelX = from === to ? a.x + width / 4 : mx;
    const labelY = from === to ? a.y - height / 2 - labelLines.length * 10 - 24 : my - 12;
    const labelWidth = Math.max(...labelLines.map(line => line.length)) * 9 + 16;
    objects.push({ id: `transition-label:${transition.id}`, kind: 'edge-label', primitives: [
      { kind: 'rect', x: labelX - labelWidth / 2, y: labelY - labelLines.length * 10 - 8, width: labelWidth, height: labelLines.length * 20 + 12, fill: 'background', role: 'arrow-label-mask' },
      { kind: 'text', x: labelX, y: labelY - (labelLines.length - 1) * 10 + 5, lines: labelLines, leading: 20, size: 16, anchor: 'middle', fill: 'ink' },
    ] });
  }
  return scene(input, cx * 2, cy * 2, objects);
}

export function createLayerScene(input: SceneIdentity & Readonly<{ layers: readonly SceneItem[] }>): GraphicScene {
  items(input.layers, 'Layers');
  const width = Math.max(440, ...input.layers.map(item => item.label.length * 9 + 80)) + input.layers.length * 40;
  const height = input.layers.length * 76 + 100;
  const objects = input.layers.map((item, order): GraphicObject => {
    const inset = 20 + order * 20, top = 20 + order * 76;
    return { id: `layer:${item.id}`, kind: 'illustration', meaning: item.label, primitives: [
      { kind: 'rect', x: inset, y: top, width: width - inset * 2, height: height - top - 20, radius: 'node', fill: 'node-background', stroke: 'node-stroke', strokeRole: 'structure' },
      text(inset + 24, top + 34, item.label, Math.floor((width - inset * 2 - 48) / 9), 'start'),
    ] };
  });
  return scene(input, width, height, objects);
}

function domain(values: readonly number[], explicit?: readonly [number, number]): readonly [number, number] {
  if (explicit) {
    if (explicit.some(n => !Number.isFinite(n)) || explicit[0] >= explicit[1]) throw new Error('Plot domains must be finite and increasing.');
    return explicit;
  }
  const low = Math.min(...values), high = Math.max(...values);
  if (low !== high) return [low, high];
  const padding = Math.max(1, Math.abs(low) * .01);
  return [Number.isFinite(low - padding) ? low - padding : low, Number.isFinite(high + padding) ? high + padding : high];
}
function fraction(value: number, range: readonly [number, number]): number {
  const span = range[1] - range[0];
  if (Number.isFinite(span)) return (value - range[0]) / span;
  const magnitude = Math.max(Math.abs(range[0]), Math.abs(range[1]));
  return (value / magnitude - range[0] / magnitude) / (range[1] / magnitude - range[0] / magnitude);
}
export function createPlotScene(input: PlotSceneInput): GraphicScene {
  items(input.series, 'Plot series');
  if (input.variant !== undefined && !['line', 'scatter'].includes(input.variant)) throw new Error('Plot variant must be line or scatter.');
  const points = input.series.flatMap(series => series.points.filter((point): point is PlotPoint => point !== null));
  if (!points.length || points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error('Plots need finite observed points.');
  if (!input.xLabel.trim() || !input.yLabel.trim()) throw new Error('Plots need meaningful axis labels.');
  if (input.series.filter(series => series.emphasis).length > 1) throw new Error('Emphasize at most one plot series.');
  const xd = domain(points.map(point => point.x), input.xDomain), yd = domain(points.map(point => point.y), input.yDomain);
  if (points.some(point => point.x < xd[0] || point.x > xd[1] || point.y < yd[0] || point.y > yd[1])) throw new Error('Plot domains must contain all observed points.');
  const top = 70 + (words(input.yLabel, 40).length - 1) * 20, bottom = top + 230;
  const x = (value: number) => 92 + fraction(value, xd) * 520;
  const y = (value: number) => bottom - fraction(value, yd) * 230;
  const objects: GraphicObject[] = [{ id: 'axes', kind: 'illustration', primitives: [
    { kind: 'path', d: `M 92 ${top - 12} V ${bottom} H 628`, stroke: 'muted', strokeRole: 'guide', fill: 'none' },
    text(350, bottom + 50, input.xLabel, 40), text(24, 28, input.yLabel, 40, 'start'),
    text(92, bottom + 24, String(xd[0]), 16), text(612, bottom + 24, String(xd[1]), 16), text(70, bottom + 6, String(yd[0]), 16), text(70, top + 6, String(yd[1]), 16),
  ] }];
  let legendY = bottom + 66 + words(input.xLabel, 40).length * 20;
  for (const [order, series] of input.series.entries()) {
    let d = '', connected = false;
    const marks: GraphicPrimitive[] = [];
    for (const point of series.points) {
      if (point === null) { connected = false; continue; }
      d += `${connected ? ' L' : ' M'} ${x(point.x)} ${y(point.y)}`; connected = true;
      marks.push({ kind: 'circle', x: x(point.x), y: y(point.y), radius: 3.5, fill: series.emphasis ? 'accent' : 'ink' });
    }
    if (input.variant !== 'scatter' && d) objects.push({ id: `series:${series.id}`, kind: 'illustration', meaning: series.label, primitives: [{ kind: 'path', d: d.trim(), fill: 'none', stroke: series.emphasis ? 'accent' : 'ink', strokeRole: 'data', dash: order ? '5 4' : undefined }] });
    objects.push({ id: `points:${series.id}`, kind: 'illustration', meaning: series.label, primitives: marks });
    objects.push({ id: `legend:${series.id}`, kind: 'illustration', primitives: [
      { kind: 'path', d: `M 92 ${legendY} h 28`, fill: 'none', stroke: series.emphasis ? 'accent' : 'ink', strokeRole: 'data', dash: order ? '5 4' : undefined },
      text(132, legendY + 5, series.label, 56, 'start'),
    ] });
    legendY += Math.max(28, words(series.label, 56).length * 20 + 14);
  }
  return scene(input, 680, legendY + 20, objects);
}

export function createTokenScene(input: SceneIdentity & Readonly<{ tokens: readonly TokenItem[]; columns?: number }>): GraphicScene {
  items(input.tokens, 'Tokens');
  const columns = input.columns ?? 5;
  if (!Number.isSafeInteger(columns) || columns < 1 || columns > 20) throw new Error('Token columns must be an integer from 1 to 20.');
  const cellWidth = Math.max(112, ...input.tokens.map(token => Math.min(320, token.label.length * 10 + 32)));
  const cellHeight = Math.max(68, ...input.tokens.map(token => words(token.label, Math.floor((cellWidth - 24) / 9)).length * 20 + 32));
  const objects = input.tokens.map((token, order): GraphicObject => {
    if (token.state !== undefined && !['neutral', 'accepted', 'rejected'].includes(token.state)) throw new Error('Unknown token state.');
    const x = 20 + order % columns * (cellWidth + 12), y = 20 + Math.floor(order / columns) * (cellHeight + 12);
    const object = node(token, order, x, y, cellWidth, cellHeight);
    return { ...object, id: `token:${token.id}`, primitives: [...object.primitives, ...(token.state === 'rejected' ? [{ kind: 'path' as const, d: `M ${x + 10} ${y + cellHeight - 14} L ${x + cellWidth - 10} ${y + 14}`, fill: 'none' as const, stroke: 'ink' as const, strokeRole: 'detail' as const }] : [])], state: { opacity: 1, reveal: 1, highlight: token.state === 'accepted', x: 0, y: 0 } };
  });
  return scene(input, Math.min(columns, input.tokens.length) * (cellWidth + 12) + 28, Math.ceil(input.tokens.length / columns) * (cellHeight + 12) + 28, objects);
}

export function createPlayheadScene(input: SceneIdentity & Readonly<{ events: readonly TimedEvent[]; duration: number; unit?: string }>): GraphicScene {
  items(input.events, 'Timeline events');
  if (!Number.isFinite(input.duration) || input.duration <= 0 || input.events.some(event => !Number.isFinite(event.time) || event.time < 0 || event.time > input.duration)) throw new Error('Events must fit a positive finite timeline.');
  const width = 720;
  const rowHeights = input.events.map(event => Math.max(64, words(event.label, 16).length * 20 + 28));
  const height = rowHeights.reduce((sum, row) => sum + row, 100);
  const objects: GraphicObject[] = [{ id: 'axis', kind: 'illustration', primitives: [{ kind: 'path', d: `M 180 36 H 660`, fill: 'none', stroke: 'muted', strokeRole: 'guide' }, text(180, 24, `0${input.unit ? ` ${input.unit}` : ''}`, 20), text(660, 24, `${input.duration}${input.unit ? ` ${input.unit}` : ''}`, 20)] }];
  let rowY = 82;
  for (const [order, event] of input.events.entries()) {
    const x = 180 + event.time / input.duration * 480, y = rowY;
    objects.push({ id: `event:${event.id}`, kind: 'illustration', meaning: `${event.label} at ${event.time}`, primitives: [text(20, y + 5, event.label, 16, 'start'), { kind: 'path', d: `M 180 ${y} H 660`, fill: 'none', stroke: 'frame', strokeRole: 'guide' }, { kind: 'circle', x, y, radius: 5, fill: 'ink' }, text(x, y + 26, String(event.time), 12)] });
    rowY += rowHeights[order];
  }
  objects.push({ id: 'playhead', kind: 'illustration', primitives: [{ kind: 'path', d: `M 180 36 V ${height - 32}`, fill: 'none', stroke: 'accent', strokeRole: 'active' }] });
  return scene(input, width, height, objects);
}

export function createGridScene(input: SceneIdentity & Readonly<{ cells: readonly GridCell[]; columns: number; domain: readonly [number, number] }>): GraphicScene {
  if (!input.cells.length || !Number.isSafeInteger(input.columns) || input.columns < 1 || input.columns > 32 || input.cells.length > 1024) throw new Error('A grid needs cells and 1–32 columns, at most 1024 cells.');
  const range = domain([], input.domain), ids = new Set<string>();
  const size = 28, gap = 5, objects: GraphicObject[] = [];
  for (const [order, cell] of input.cells.entries()) {
    if (!cell.id?.trim() || ids.has(cell.id) || (cell.value !== null && (!Number.isFinite(cell.value) || cell.value < range[0] || cell.value > range[1]))) throw new Error('Grid cells need unique IDs and finite in-domain values or null.');
    ids.add(cell.id);
    const x = 20 + order % input.columns * (size + gap), y = 20 + Math.floor(order / input.columns) * (size + gap);
    const value = cell.value === null ? null : fraction(cell.value, range);
    objects.push({ id: `cell:${cell.id}`, kind: 'illustration', meaning: cell.value === null ? 'Unobserved' : String(cell.value), primitives: [
      { kind: 'rect', x, y, width: size, height: size, stroke: 'frame', strokeRole: 'guide', fill: 'none' },
      ...(value === null ? [{ kind: 'path' as const, d: `M ${x} ${y + size} L ${x + size} ${y}`, fill: 'none' as const, stroke: 'muted' as const, strokeRole: 'detail' as const }] : value > 0 ? [{ kind: 'rect' as const, x, y: y + size * (1 - value), width: size, height: size * value, fill: 'accent' as const }] : []),
    ] });
  }
  return scene(input, Math.min(input.columns, input.cells.length) * (size + gap) + 35, Math.ceil(input.cells.length / input.columns) * (size + gap) + 35, objects);
}

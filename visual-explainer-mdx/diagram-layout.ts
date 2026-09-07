import type { DiagramCanvasProps, DiagramEdge, DiagramNode, DiagramNodeGlyph } from './diagram-types';

export const diagramTypography = { labelSize: 16, labelLeading: 22, detailSize: 14, detailLeading: 20, edgeSize: 14, edgeLeading: 20 };

export type LaidOutNode = DiagramNode & {
  x: number;
  y: number;
  width: number;
  height: number;
  rank: number;
  row: number;
  order: number;
  isAccented: boolean;
  labelLines: string[];
  detailLines: string[];
  textHeight: number;
};

type Point = { x: number; y: number };
type Rect = Point & { width: number; height: number };
type Orientation = 'horizontal' | 'vertical';
type LaidOutEdge = { edge: DiagramEdge; from: LaidOutNode; to: LaidOutNode; path: Point[]; label?: EdgeLabelLayout };
type EdgeLabelLayout = Point & { width: number; height: number; lines: string[]; anchor: Point; leader?: boolean };
type LaneLayout = Rect & { id: string; label: string; lines: string[]; orientation: Orientation; divider: boolean };

const snap = (value: number) => Math.ceil(value / 4) * 4;
const padding = 40;
const nodeGap = 40;

export function layoutDiagram(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  layout: NonNullable<DiagramCanvasProps['layout']>,
  lanes?: DiagramCanvasProps['lanes'],
  dates?: string[],
  direction: NonNullable<DiagramCanvasProps['direction']> = 'auto',
) {
  const rankMap = computeRanks(nodes, edges);
  const orderedDates = [...new Set([...(dates ?? []), ...nodes.flatMap((node) => node.date ? [node.date] : [])])];
  const dateIndex = new Map(orderedDates.map((date, index) => [date, index]));
  const measured = nodes.map((node, order): LaidOutNode => ({
    ...node,
    ...measureDiagramNode(node),
    x: 0,
    y: 0,
    rank: layout === 'timeline' ? node.date ? dateIndex.get(node.date)! : orderedDates.length + order : rankMap.get(node.id) ?? 0,
    row: 0,
    order,
    isAccented: Boolean(node.accent),
  }));
  const ranks = [...new Set(measured.map((node) => node.rank))].sort((a, b) => a - b);
  const orientation: Orientation = direction !== 'auto' ? direction
    : layout === 'timeline' ? 'horizontal'
      : layout === 'tree' || ranks.length > 4 ? 'vertical' : 'horizontal';
  const edgeLabels = edges.flatMap((edge) => edge.label ? [measureEdgeLabel(edge.label)] : []);
  const rankGap = Math.max(88, ...edgeLabels.map((label) => (orientation === 'horizontal' ? label.width : label.height) + 48));
  const laneList = layout === 'swimlane' ? [...(lanes ?? [])] : [];
  if (layout === 'swimlane') {
    const declared = new Set(laneList.map((lane) => lane.id));
    for (const node of nodes) {
      const id = node.lane ?? 'default';
      if (!declared.has(id)) {
        laneList.push({ id, label: node.lane ?? 'Unassigned' });
        declared.add(id);
      }
    }
  }
  const laneRects: LaneLayout[] = [];
  if (layout === 'swimlane') {
    placeSwimlanes(measured, ranks, laneList, orientation, rankGap, laneRects);
  } else {
    const header = layout === 'timeline' ? Math.max(48, ...orderedDates.map((date) => wrapDiagramText(date, 152, 14).length * 20 + 24)) : 0;
    placeRanks(measured, ranks, edges, orientation, rankGap, header);
  }
  const byId = new Map(measured.map((node) => [node.id, node]));
  const routed = edges.flatMap((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    return from && to ? [{ edge, from, to, path: edgeRoute(from, to, orientation, measured) }] : [];
  });
  const timeline = layout === 'timeline' ? ranks.flatMap((rank) => {
    const label = orderedDates[rank];
    const group = measured.filter((node) => node.rank === rank);
    if (!label || !group.length) return [];
    const first = group[0]!;
    const width = orientation === 'horizontal' ? first.width : Math.max(...group.map((node) => node.width));
    const lines = wrapDiagramText(label, width, 14);
    const top = orientation === 'horizontal' ? Math.min(...measured.map((node) => node.y)) : first.y;
    return [{ label, lines, x: first.x + first.width / 2, y: top - 12 - (lines.length - 1) * 20 }];
  }) : [];
  const timelineRects = timeline.map((tick) => {
    const width = Math.max(...tick.lines.map((line) => textWidth(line, 14)));
    return { x: tick.x - width / 2, y: tick.y - 16, width, height: tick.lines.length * 20 };
  });
  const connectedEdges = placeEdgeLabels(routed, measured, laneRects, timelineRects);
  const content: Rect[] = [
    ...measured.map(nodeRect),
    ...laneRects,
    ...timelineRects,
    ...connectedEdges.flatMap(({ path, label }) => [
      ...path.map((point) => ({ ...point, width: 0, height: 0 })),
      ...(label ? [labelRect(label)] : []),
    ]),
  ];
  const minX = Math.min(0, ...content.map((rect) => rect.x - padding));
  const minY = Math.min(0, ...content.map((rect) => rect.y - padding));
  const maxX = Math.max(240, ...content.map((rect) => rect.x + rect.width + padding));
  const maxY = Math.max(120, ...content.map((rect) => rect.y + rect.height + padding));
  return {
    nodes: measured,
    edges: connectedEdges,
    lanes: laneRects,
    laneLabels: new Map(laneList.map((lane) => [lane.id, lane.label])),
    timeline,
    dense: nodes.length >= 7 || edges.length >= 10,
    orientation,
    viewBox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
  };
}

function measureDiagramNode(node: DiagramNode) {
  const glyph = nodeGlyph(node);
  const preferred = Math.max(textWidth(node.label, 16), textWidth(node.detail ?? '', 14));
  const textWidthLimit = glyph === 'diamond' ? 172 : 224;
  const contentWidth = snap(Math.max(112, Math.min(textWidthLimit, preferred)));
  const labelLines = wrapDiagramText(node.label, contentWidth, 16);
  const detailLines = node.detail ? wrapDiagramText(node.detail, contentWidth, 14) : [];
  const textHeight = labelLines.length * 22 + (detailLines.length ? 8 + detailLines.length * 20 : 0);
  // A diamond's inscribed text rectangle has half its outer width and height.
  const width = snap(glyph === 'diamond' ? (contentWidth + 16) * 2 : contentWidth + 40);
  const height = snap(glyph === 'diamond' ? (textHeight + 20) * 2 : textHeight + (glyph === 'dot' ? 52 : 36));
  return { width, height, labelLines, detailLines, textHeight };
}

function placeRanks(nodes: LaidOutNode[], ranks: number[], edges: DiagramEdge[], orientation: Orientation, rankGap: number, header: number) {
  const groups = ranks.map((rank) => nodes.filter((node) => node.rank === rank));
  const order = new Map(nodes.map((node) => [node.id, node.order]));
  // Alternate sweeps to align branches with their neighbours while keeping ties stable.
  for (let pass = 0; pass < 4; pass += 1) {
    const forward = pass % 2 === 0;
    for (const group of forward ? groups : [...groups].reverse()) {
      const score = (node: LaidOutNode) => {
        const neighbours = edges.flatMap((edge) => forward && edge.to === node.id ? [edge.from] : !forward && edge.from === node.id ? [edge.to] : []);
        return neighbours.length ? neighbours.reduce((sum, id) => sum + (order.get(id) ?? 0), 0) / neighbours.length : order.get(node.id) ?? 0;
      };
      group.sort((a, b) => score(a) - score(b) || a.order - b.order);
      group.forEach((node, index) => order.set(node.id, index));
    }
  }
  const crossSize = (node: LaidOutNode) => orientation === 'horizontal' ? node.height : node.width;
  const mainSize = (node: LaidOutNode) => orientation === 'horizontal' ? node.width : node.height;
  const groupSizes = groups.map((group) => group.reduce((sum, node) => sum + crossSize(node), 0) + Math.max(0, group.length - 1) * nodeGap);
  const span = Math.max(0, ...groupSizes);
  let main = padding + (orientation === 'vertical' ? header : 0);
  groups.forEach((group, index) => {
    let cross = padding + (span - groupSizes[index]!) / 2 + (orientation === 'horizontal' ? header : 0);
    const extent = Math.max(...group.map(mainSize));
    group.forEach((node, row) => {
      node.x = snap(orientation === 'horizontal' ? main + (extent - node.width) / 2 : cross);
      node.y = snap(orientation === 'horizontal' ? cross : main + (extent - node.height) / 2);
      node.row = row;
      cross += crossSize(node) + nodeGap;
    });
    main += extent + rankGap;
  });
}

function placeSwimlanes(nodes: LaidOutNode[], ranks: number[], lanes: NonNullable<DiagramCanvasProps['lanes']>, orientation: Orientation, rankGap: number, rects: LaneLayout[]) {
  const vertical = orientation === 'vertical';
  const mainSize = (node: LaidOutNode) => vertical ? node.height : node.width;
  const crossSize = (node: LaidOutNode) => vertical ? node.width : node.height;
  const group = (lane: string, rank: number) => nodes.filter((node) => (node.lane ?? 'default') === lane && node.rank === rank);
  const laneSpans = lanes.map((lane) => Math.max(176, ...ranks.map((rank) => {
    const members = group(lane.id, rank);
    return members.reduce((sum, node) => sum + crossSize(node), 0) + Math.max(0, members.length - 1) * nodeGap;
  })) + 64);
  const headerLines = lanes.map((lane, index) => wrapDiagramText(lane.label, vertical ? laneSpans[index]! - 48 : 240, 14));
  const headerHeight = Math.max(48, ...headerLines.map((lines) => lines.length * 20 + 24));
  const rankExtents = ranks.map((rank) => Math.max(0, ...nodes.filter((node) => node.rank === rank).map(mainSize)));
  const mainSpan = rankExtents.reduce((sum, extent) => sum + extent, 0) + Math.max(0, ranks.length - 1) * rankGap;
  let laneStart = padding;
  lanes.forEach((lane, laneIndex) => {
    const span = laneSpans[laneIndex]!;
    let main = padding + (vertical ? headerHeight : 0);
    ranks.forEach((rank, rankIndex) => {
      const members = group(lane.id, rank);
      const used = members.reduce((sum, node) => sum + crossSize(node), 0) + Math.max(0, members.length - 1) * nodeGap;
      let cross = laneStart + (span - used) / 2 + (vertical ? 0 : headerHeight);
      members.forEach((node) => {
        node.x = snap(vertical ? cross : main + (rankExtents[rankIndex]! - node.width) / 2);
        node.y = snap(vertical ? main + (rankExtents[rankIndex]! - node.height) / 2 : cross);
        node.row = laneIndex;
        cross += crossSize(node) + nodeGap;
      });
      main += rankExtents[rankIndex]! + rankGap;
    });
    rects.push({ id: lane.id, label: lane.label, lines: headerLines[laneIndex]!, orientation, divider: laneIndex < lanes.length - 1,
      x: vertical ? laneStart : padding - 16, y: vertical ? padding - 16 : laneStart,
      width: vertical ? span : mainSpan + 32, height: vertical ? mainSpan + headerHeight + 32 : span + headerHeight });
    laneStart += span + (vertical ? 0 : headerHeight);
  });
}

function computeRanks(nodes: DiagramNode[], edges: DiagramEdge[]) {
  const ids = new Set(nodes.map((node) => node.id));
  const outgoing = new Map<string, string[]>(nodes.map((node) => [node.id, []]));
  for (const edge of edges) if (ids.has(edge.from) && ids.has(edge.to)) outgoing.get(edge.from)!.push(edge.to);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const acyclic = new Map<string, string[]>(nodes.map((node) => [node.id, []]));
  const sorted: string[] = [];
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visiting.add(id);
    for (const child of outgoing.get(id) ?? []) {
      if (visiting.has(child)) continue;
      visit(child);
      acyclic.get(id)!.push(child);
    }
    visiting.delete(id);
    visited.add(id);
    sorted.push(id);
  };
  // Start at sources so a feedback loop cannot reorder an otherwise acyclic branch.
  const targets = new Set(edges.map((edge) => edge.to));
  nodes.filter((node) => !targets.has(node.id)).forEach((node) => visit(node.id));
  nodes.forEach((node) => visit(node.id));
  const ranks = new Map(nodes.map((node) => [node.id, 0]));
  for (const id of sorted.reverse()) for (const child of acyclic.get(id)!) ranks.set(child, Math.max(ranks.get(child)!, ranks.get(id)! + 1));
  return ranks;
}

function edgeRoute(from: LaidOutNode, to: LaidOutNode, orientation: Orientation, nodes: LaidOutNode[]): Point[] {
  const sameRank = from.rank === to.rank;
  const horizontal = sameRank ? orientation === 'vertical' : orientation === 'horizontal';
  const positive = horizontal ? to.x + to.width / 2 >= from.x + from.width / 2 : to.y + to.height / 2 >= from.y + from.height / 2;
  const startSide = from.id === to.id ? 'right' : horizontal ? positive ? 'right' : 'left' : positive ? 'bottom' : 'top';
  const endSide = from.id === to.id ? nodeGlyph(to) === 'dot' ? 'left' : 'bottom' : horizontal ? positive ? 'left' : 'right' : positive ? 'top' : 'bottom';
  const start = port(from, startSide);
  const end = port(to, endSide);
  const obstacles = nodes.map((node) => expandRect(nodeRect(node), 12));
  const middle = orthogonalRoute(start.exit, end.exit, obstacles);
  return simplifyPath([start.point, start.exit, ...middle, end.exit, end.point]);
}

function port(node: LaidOutNode, requested: 'left' | 'right' | 'top' | 'bottom') {
  const dot = nodeGlyph(node) === 'dot';
  const side = dot ? requested === 'top' || requested === 'left' ? 'left' : 'right' : requested;
  const cx = node.x + node.width / 2;
  const cy = dot ? node.y + 12 : node.y + node.height / 2;
  if (side === 'left' || side === 'right') {
    const sign = side === 'left' ? -1 : 1;
    return { point: { x: cx + sign * ((dot ? 12 : node.width / 2) + 8), y: cy }, exit: { x: cx + sign * (node.width / 2 + 24), y: cy } };
  }
  const sign = side === 'top' ? -1 : 1;
  return { point: { x: cx, y: cy + sign * (node.height / 2 + 8) }, exit: { x: cx, y: cy + sign * (node.height / 2 + 24) } };
}

function segmentClear(a: Point, b: Point, obstacles: Rect[]) {
  return obstacles.every((rect) => a.x === b.x
    ? a.x <= rect.x || a.x >= rect.x + rect.width || Math.max(a.y, b.y) <= rect.y || Math.min(a.y, b.y) >= rect.y + rect.height
    : a.y <= rect.y || a.y >= rect.y + rect.height || Math.max(a.x, b.x) <= rect.x || Math.min(a.x, b.x) >= rect.x + rect.width);
}

function orthogonalRoute(start: Point, end: Point, obstacles: Rect[]): Point[] {
  const midX = snap((start.x + end.x) / 2);
  const midY = snap((start.y + end.y) / 2);
  const direct = [
    [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end],
    [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end],
    [start, { x: end.x, y: start.y }, end],
    [start, { x: start.x, y: end.y }, end],
  ];
  for (const path of direct) if (path.slice(1).every((point, index) => segmentClear(path[index]!, point, obstacles))) return simplifyPath(path);
  const xs = [...new Set([start.x, end.x, ...obstacles.flatMap((rect) => [rect.x, rect.x + rect.width])])].sort((a, b) => a - b);
  const ys = [...new Set([start.y, end.y, ...obstacles.flatMap((rect) => [rect.y, rect.y + rect.height])])].sort((a, b) => a - b);
  const width = xs.length;
  const startIndex = ys.indexOf(start.y) * width + xs.indexOf(start.x);
  const endIndex = ys.indexOf(end.y) * width + xs.indexOf(end.x);
  const pointAt = (index: number): Point => ({ x: xs[index % width]!, y: ys[Math.floor(index / width)]! });
  const heap: { key: number; cost: number; score: number }[] = [];
  const push = (item: typeof heap[number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent]!.score <= item.score) break;
      heap[i] = heap[parent]!;
      i = parent;
    }
    heap[i] = item;
  };
  const pop = () => {
    const first = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1]!.score < heap[child]!.score) child += 1;
        if (heap[child]!.score >= last.score) break;
        heap[i] = heap[child]!;
        i = child;
      }
      heap[i] = last;
    }
    return first;
  };
  const costs = new Map<number, number>();
  const previous = new Map<number, number>();
  for (const direction of [0, 1]) {
    const key = startIndex * 2 + direction;
    costs.set(key, 0);
    push({ key, cost: 0, score: 0 });
  }
  while (heap.length) {
    const current = pop();
    if (costs.get(current.key) !== current.cost) continue;
    const index = Math.floor(current.key / 2);
    if (index === endIndex) {
      const path: Point[] = [];
      let key: number | undefined = current.key;
      while (key !== undefined) {
        path.push(pointAt(Math.floor(key / 2)));
        key = previous.get(key);
      }
      return simplifyPath(path.reverse());
    }
    const point = pointAt(index);
    const x = index % width;
    const y = Math.floor(index / width);
    for (const [nx, ny, direction] of [[x - 1, y, 0], [x + 1, y, 0], [x, y - 1, 1], [x, y + 1, 1]]) {
      if (nx! < 0 || nx! >= width || ny! < 0 || ny! >= ys.length) continue;
      const nextIndex = ny! * width + nx!;
      const next = pointAt(nextIndex);
      if (!segmentClear(point, next, obstacles)) continue;
      const cost = current.cost + Math.abs(next.x - point.x) + Math.abs(next.y - point.y) + (current.key % 2 === direction ? 0 : 24);
      const key = nextIndex * 2 + direction!;
      if (cost >= (costs.get(key) ?? Infinity)) continue;
      costs.set(key, cost);
      previous.set(key, current.key);
      push({ key, cost, score: cost + Math.abs(next.x - end.x) + Math.abs(next.y - end.y) });
    }
  }
  return [start, end];
}

function simplifyPath(path: Point[]) {
  const result: Point[] = [];
  for (const point of path) {
    const last = result.at(-1);
    if (last?.x === point.x && last.y === point.y) continue;
    const before = result.at(-2);
    if (before && last && ((before.x === last.x && last.x === point.x) || (before.y === last.y && last.y === point.y))) result.pop();
    result.push(point);
  }
  return result;
}

function measureEdgeLabel(label: string) {
  const lines = wrapDiagramText(label, 200, diagramTypography.edgeSize);
  return { lines, width: snap(Math.max(...lines.map((line) => textWidth(line, 14))) + 20), height: lines.length * 20 + 12 };
}

function placeEdgeLabels(edges: LaidOutEdge[], nodes: LaidOutNode[], lanes: LaneLayout[], headers: Rect[]) {
  const occupied = [
    ...headers.map((rect) => expandRect(rect, 4)),
    ...nodes.map((node) => expandRect(nodeRect(node), 8)),
    ...lanes.map((lane) => ({ x: lane.x, y: lane.y, width: lane.width, height: lane.lines.length * 20 + 24 })),
  ];
  return edges.map((item, index) => {
    if (!item.edge.label) return item;
    const size = measureEdgeLabel(item.edge.label);
    const others = edges.flatMap((other, otherIndex) => otherIndex === index ? [] : other.path.slice(1).map((point, i) => {
      const start = other.path[i]!;
      return { x: Math.min(start.x, point.x) - 2, y: Math.min(start.y, point.y) - 2, width: Math.abs(point.x - start.x) + 4, height: Math.abs(point.y - start.y) + 4 };
    }));
    const label = findLabelSlot(item.path, size, [...occupied, ...others]);
    occupied.push(expandRect(labelRect(label), 8));
    return { ...item, label };
  });
}

function findLabelSlot(path: Point[], size: ReturnType<typeof measureEdgeLabel>, occupied: Rect[]): EdgeLabelLayout {
  const segments = path.slice(1).map((end, index) => ({ start: path[index]!, end }));
  segments.sort((a, b) => Math.hypot(b.end.x - b.start.x, b.end.y - b.start.y) - Math.hypot(a.end.x - a.start.x, a.end.y - a.start.y));
  const fits = (label: EdgeLabelLayout) => occupied.every((rect) => !rectsIntersect(labelRect(label), rect));
  for (const { start, end } of segments) {
    const horizontal = start.y === end.y;
    for (const t of [0.5, 0.35, 0.65]) {
      const anchor = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
      for (const offset of [0, -(horizontal ? size.height : size.width) / 2 - 8, (horizontal ? size.height : size.width) / 2 + 8]) {
        const label = { ...size, x: anchor.x + (horizontal ? 0 : offset), y: anchor.y + (horizontal ? offset : 0), anchor, leader: offset !== 0 };
        if (fits(label)) return label;
      }
    }
  }
  const middle = segments[0];
  const anchor = middle ? { x: (middle.start.x + middle.end.x) / 2, y: (middle.start.y + middle.end.y) / 2 } : path[0] ?? { x: 0, y: 0 };
  // Always make room for the full label; a busy graph must never erase its meaning.
  const y = Math.max(anchor.y, ...occupied.map((rect) => rect.y + rect.height)) + size.height / 2 + 24;
  return { ...size, x: anchor.x, y, anchor, leader: true };
}

export function edgePath(points: Point[]) {
  if (!points.length) return '';
  let result = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const before = points[index - 1]!;
    const point = points[index]!;
    const after = points[index + 1]!;
    const incoming = Math.hypot(point.x - before.x, point.y - before.y);
    const outgoing = Math.hypot(after.x - point.x, after.y - point.y);
    const radius = Math.min(8, incoming / 2, outgoing / 2);
    const a = { x: point.x + (before.x - point.x) * radius / incoming, y: point.y + (before.y - point.y) * radius / incoming };
    const b = { x: point.x + (after.x - point.x) * radius / outgoing, y: point.y + (after.y - point.y) * radius / outgoing };
    result += ` L ${a.x} ${a.y} Q ${point.x} ${point.y} ${b.x} ${b.y}`;
  }
  if (points.length > 1) result += ` L ${points.at(-1)!.x} ${points.at(-1)!.y}`;
  return result;
}

function nodeGlyph(node: DiagramNode): DiagramNodeGlyph { return node['shape'] ?? 'rect'; }
function nodeRect(node: LaidOutNode): Rect { return { x: node.x, y: node.y, width: node.width, height: node.height }; }
function labelRect(label: EdgeLabelLayout): Rect { return { x: label.x - label.width / 2, y: label.y - label.height / 2, width: label.width, height: label.height }; }
function expandRect(rect: Rect, amount: number): Rect { return { x: rect.x - amount, y: rect.y - amount, width: rect.width + amount * 2, height: rect.height + amount * 2 }; }
function rectsIntersect(a: Rect, b: Rect) { return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y; }

export function labelLeaderEndpoint(label: EdgeLabelLayout): Point {
  const dx = label.anchor.x - label.x;
  const dy = label.anchor.y - label.y;
  const scale = 1 / (Math.max(Math.abs(dx) / (label.width / 2), Math.abs(dy) / (label.height / 2)) || 1);
  return { x: label.x + dx * scale, y: label.y + dy * scale };
}

export function mobileConnectorEdges(edges: LaidOutEdge[], nodeOrder: Map<string, number>, index: number) {
  return edges.filter(({ edge }) => {
    const from = nodeOrder.get(edge.from);
    const to = nodeOrder.get(edge.to);
    return from !== undefined && to !== undefined && Math.max(0, Math.max(from, to) - 1) === index;
  });
}

// Conservative font estimates keep layout deterministic during server rendering.
function textWidth(value: string, fontSize: number) {
  return Array.from(value).reduce((width, char) => width + (/\s/u.test(char) ? 0.34 : /[ilI.,'`:;!|]/u.test(char) ? 0.34 : /[MW@#%&]/u.test(char) ? 0.94 : char.codePointAt(0)! > 0x2e7f ? 1.05 : 0.66) * fontSize, 0);
}

function wrapDiagramText(value: string, maxWidth: number, fontSize: number) {
  const lines: string[] = [];
  for (const paragraph of String(value).split('\n')) {
    let line = '';
    for (const word of paragraph.trim().split(/\s+/u).filter(Boolean)) {
      if (line && textWidth(`${line} ${word}`, fontSize) <= maxWidth) {
        line += ` ${word}`;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      for (const char of Array.from(word)) {
        if (line && textWidth(line + char, fontSize) > maxWidth) {
          lines.push(line);
          line = '';
        }
        line += char;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [''];
}

export function splitSvgText(value: string, maxChars: number, options: { ellipsis?: boolean; maxLines?: number } = {}) {
  const lines = String(value).split('\n').flatMap((line) => wrapWords(line, maxChars));
  if (!options.maxLines || lines.length <= options.maxLines) return lines;
  const visible = lines.slice(0, options.maxLines);
  if (options.ellipsis) visible[visible.length - 1] = `${Array.from(visible.at(-1)!).slice(0, Math.max(0, maxChars - 1)).join('').trimEnd()}…`;
  return visible;
}

export function wrapWords(value: string, maxChars: number) {
  const limit = Math.max(1, Math.floor(maxChars));
  const lines: string[] = [];
  let line = '';
  for (const word of value.trim().split(/\s+/u).filter(Boolean)) {
    if (line && Array.from(`${line} ${word}`).length <= limit) { line += ` ${word}`; continue; }
    if (line) lines.push(line);
    const chars = Array.from(word);
    while (chars.length > limit) lines.push(chars.splice(0, limit).join(''));
    line = chars.join('');
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

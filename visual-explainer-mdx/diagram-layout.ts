import type { DiagramNode, DiagramEdge, DiagramCanvasProps } from './components';

export type LaidOutNode = DiagramNode & {
  x: number;
  y: number;
  width: number;
  height: number;
  rank: number;
  row: number;
  order: number;
  isAccented: boolean;
};

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type SwimlaneOrientation = 'horizontal' | 'vertical';

type LaidOutEdge = {
  edge: DiagramEdge;
  from: LaidOutNode;
  to: LaidOutNode;
  path: Point[];
  label?: EdgeLabelLayout;
};

type EdgeLabelLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  anchor: Point;
  leader?: boolean;
};

type LegendEntry = {
  label: string;
  accent?: boolean;
  dashed?: boolean;
};

export function layoutDiagram(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  layout: NonNullable<DiagramCanvasProps['layout']>,
  lanes?: DiagramCanvasProps['lanes'],
  dates?: string[],
) {
  const rankMap = computeRanks(nodes, edges);
  const dense = nodes.length >= 7 || edges.length >= 10;
  const nodeHeight = dense ? 76 : 96;
  const columnGap = layout === 'timeline' ? 180 : layout === 'swimlane' ? (dense ? 176 : 204) : dense ? 204 : 240;
  const rowGap = layout === 'tree' ? 128 : layout === 'swimlane' ? (dense ? 164 : 176) : dense ? 112 : 144;
  const padding = { top: 64, right: 64, bottom: 72, left: 72 };
  const laneList = layout === 'swimlane'
    ? lanes ?? Array.from(new Set(nodes.map((node) => node.lane ?? 'default'))).map((id) => ({ id, label: id }))
    : [];
  const laneIndex = new Map(laneList.map((lane, index) => [lane.id, index]));
  const rankValues = Array.from(new Set(nodes.map((node, declarationIndex) => rankForNode(node, declarationIndex, layout, rankMap, dates)))).sort((a, b) => a - b);
  const rankIndex = new Map(rankValues.map((rank, index) => [rank, index]));
  const swimlaneOrientation: SwimlaneOrientation = layout === 'swimlane' && rankValues.length > 4 ? 'vertical' : 'horizontal';
  const swimlaneRankGap = dense ? 34 : 42;
  const swimlaneColumnPitch = swimlaneOrientation === 'vertical'
    ? laneList.length <= 6
      ? Math.max(136, Math.floor((960 - padding.left - padding.right) / Math.max(1, laneList.length)))
      : dense ? 168 : 184
    : columnGap;
  const swimlaneNodeMax = swimlaneOrientation === 'vertical' ? Math.max(124, Math.min(164, swimlaneColumnPitch - 32)) : 240;
  const orderedDates = dates ?? Array.from(new Set(nodes.map((node) => node.date).filter(Boolean))) as string[];
  const dateIndex = new Map(orderedDates.map((date, index) => [date, index]));
  const rankCounts = new Map<number, number>();
  const laneRankCounts = new Map<string, number>();
  let accentsUsed = 0;
  const measured = nodes.map((node, declarationIndex) => {
    const rank = layout === 'timeline' && node.date ? dateIndex.get(node.date) ?? declarationIndex : rankMap.get(node.id) ?? declarationIndex;
    const inRank = rankCounts.get(rank) ?? 0;
    rankCounts.set(rank, inRank + 1);
    const wrapsDenseFlow = dense && layout !== 'swimlane' && layout !== 'timeline';
    const wrapColumns = 4;
    const rankBand = wrapsDenseFlow ? Math.floor(rank / wrapColumns) : 0;
    const visualRank = wrapsDenseFlow
      ? rankBand % 2 === 0
        ? rank % wrapColumns
        : wrapColumns - 1 - (rank % wrapColumns)
      : rank;
    const laneKey = `${node.lane ?? 'default'}::${rank}`;
    const laneStack = layout === 'swimlane' ? laneRankCounts.get(laneKey) ?? 0 : 0;
    if (layout === 'swimlane') laneRankCounts.set(laneKey, laneStack + 1);
    const row = layout === 'swimlane' ? laneIndex.get(node.lane ?? 'default') ?? 0 : inRank + rankBand * 2;
    const { width, height } = measureDiagramNode(node, dense, nodeHeight, swimlaneNodeMax);
    const isAccented = Boolean(node.accent && accentsUsed < 2);
    if (isAccented) accentsUsed += 1;
    return { ...node, x: 0, y: 0, width, height, rank, row, order: declarationIndex, visualRank, laneStack, inRank, isAccented };
  });
  const laidOut = swimlaneOrientation === 'vertical'
    ? layoutVerticalSwimlane(measured, laneIndex, rankIndex, padding, swimlaneColumnPitch, swimlaneRankGap)
    : measured.map((node) => ({
      ...node,
      x: padding.left + node.visualRank * columnGap,
      y: padding.top + node.row * rowGap + (layout === 'timeline' && node.row % 2 ? 58 : 0) + node.laneStack * (nodeHeight + 16),
    }));
  const byId = new Map(laidOut.map((node) => [node.id, node]));
  const connectedEdgePairs = edges.flatMap((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    return from && to ? [{ edge, from, to }] : [];
  });
  const minX = Math.min(...laidOut.map((node) => node.x), padding.left) - padding.left;
  const minY = Math.min(...laidOut.map((node) => node.y), padding.top) - padding.top;
  const maxX = Math.max(...laidOut.map((node) => node.x + node.width), padding.left + 520) + padding.right;
  const maxY = Math.max(...laidOut.map((node) => node.y + node.height), padding.top + 300) + padding.bottom;
  const bounds = { minX, minY, maxX, maxY };
  const connectedEdges = placeEdgeLabels(
    connectedEdgePairs.map(({ edge, from, to }) => ({
      edge,
      from,
      to,
      path: edgeRoute(from, to, swimlaneOrientation === 'vertical' && layout === 'swimlane' ? 'vertical' : 'horizontal'),
    })),
    laidOut,
    bounds,
    dense,
  );
  const finalMaxX = Math.max(maxX, ...connectedEdges.flatMap(({ label }) => label ? [label.x + label.width / 2 + 24] : []));
  const finalMaxY = Math.max(maxY, ...connectedEdges.flatMap(({ label }) => label ? [label.y + label.height / 2 + 32] : []));
  const bodyBottom = finalMaxY - 56;
  const laneRects = laneList.map((lane, index) => swimlaneOrientation === 'vertical' ? ({
    id: lane.id,
    label: lane.label.toUpperCase(),
    orientation: 'vertical' as const,
    divider: index < laneList.length - 1,
    x: padding.left + index * swimlaneColumnPitch - swimlaneColumnPitch / 2 + 8,
    y: minY + 22,
    width: swimlaneColumnPitch,
    height: bodyBottom - minY - 28,
  }) : ({
    id: lane.id,
    label: lane.label.toUpperCase(),
    orientation: 'horizontal' as const,
    divider: false,
    x: minX + 18,
    y: padding.top + index * rowGap - 28,
    width: finalMaxX - minX - 36,
    height: rowGap,
  }));
  const shapeSet = new Set(nodes.map((node) => node.shape ?? 'rect'));
  const styleSet = new Set(edges.map((edge) => edge.style ?? 'solid'));
  const legendEntries: LegendEntry[] = [];
  if (nodes.some((node) => node.accent)) legendEntries.push({ label: 'FOCAL', accent: true });
  if (styleSet.has('solid') && styleSet.size > 1) legendEntries.push({ label: 'SOLID' });
  if (styleSet.has('dashed')) legendEntries.push({ label: 'DASHED', dashed: true });
  if (styleSet.has('bidirectional')) legendEntries.push({ label: 'TWO-WAY' });
  if (shapeSet.size > 1) legendEntries.push({ label: 'SHAPES VARY' });
  return {
    nodes: laidOut,
    edges: connectedEdges,
    lanes: laneRects,
    laneLabels: new Map(laneList.map((lane) => [lane.id, lane.label.toUpperCase()])),
    dense,
    orientation: swimlaneOrientation,
    bodyBottom,
    legend: {
      x: minX + 28,
      y: finalMaxY - 24,
      entries: legendEntries.slice(0, 5),
      // Entries start after the measured meta text ("SWIMLANE / 8 nodes / 12 edges")
      // instead of a fixed offset that collides with longer meta strings.
      entryStartX: minX + 28 + `${layout.toUpperCase()} / ${nodes.length} nodes / ${edges.length} edges`.length * 6.6 + 32,
    },
    viewBox: { x: minX, y: minY, width: finalMaxX - minX, height: finalMaxY - minY },
  };
}

function rankForNode(
  node: DiagramNode,
  declarationIndex: number,
  layout: NonNullable<DiagramCanvasProps['layout']>,
  rankMap: Map<string, number>,
  dates?: string[],
) {
  if (layout !== 'timeline' || !node.date) return rankMap.get(node.id) ?? declarationIndex;
  const orderedDates = dates ?? [];
  const dateIndex = new Map(orderedDates.map((date, index) => [date, index]));
  return dateIndex.get(node.date) ?? declarationIndex;
}

function measureDiagramNode(node: DiagramNode, dense: boolean, nodeHeight: number, maxWidth = 240) {
  const width = node.shape === 'dot'
    ? 32
    : dense
      ? Math.max(124, Math.min(Math.min(152, maxWidth), node.label.length * 8 + 48))
      : Math.max(Math.min(152, maxWidth), Math.min(maxWidth, node.label.length * 10 + 72, (node.detail?.length ?? 0) * 5 + 72));
  const compact = width <= 140;
  const detailMaxLines = compact ? 2 : 3;
  const labelLineCount = node.shape === 'dot' ? 1 : splitSvgText(node.label, compact ? 15 : 20, { maxLines: 2 }).length;
  const detailLineCount = node.detail && node.shape !== 'dot' ? splitSvgText(node.detail, compact ? 17 : 28, { ellipsis: true, maxLines: detailMaxLines }).length : 0;
  const textBottom = (compact ? 59 : 72) + Math.max(0, labelLineCount - 1) * (compact ? 16 : 18) + (detailLineCount > 0 ? (detailLineCount - 1) * 13 + 12 : 0);
  const height = node.shape === 'dot' ? 42 : Math.max(nodeHeight, textBottom + 14);
  return { width, height };
}

function layoutVerticalSwimlane<T extends LaidOutNode & { laneStack: number }>(
  measured: T[],
  laneIndex: Map<string, number>,
  rankIndex: Map<number, number>,
  padding: { top: number; left: number },
  columnPitch: number,
  rowGap: number,
) {
  const groupMap = new Map<string, T[]>();
  for (const node of measured) {
    const key = `${node.lane ?? 'default'}::${node.rank}`;
    groupMap.set(key, [...groupMap.get(key) ?? [], node]);
  }
  const rowHeights = new Map<number, number>();
  for (const [key, group] of groupMap) {
    const rank = Number(key.split('::').at(-1));
    const sideBySideWidth = group.reduce((sum, node) => sum + node.width, 0) + Math.max(0, group.length - 1) * 12;
    const groupHeight = sideBySideWidth <= columnPitch - 32
      ? Math.max(...group.map((node) => node.height))
      : group.reduce((sum, node) => sum + node.height, 0) + Math.max(0, group.length - 1) * 16;
    const rankRow = rankIndex.get(rank) ?? rank;
    rowHeights.set(rankRow, Math.max(rowHeights.get(rankRow) ?? 0, groupHeight));
  }
  const rankY = new Map<number, number>();
  let cursorY = padding.top + 54;
  const rankRows = Array.from(new Set([...rankIndex.values()])).sort((a, b) => a - b);
  for (const rankRow of rankRows) {
    rankY.set(rankRow, cursorY);
    cursorY += (rowHeights.get(rankRow) ?? 96) + rowGap;
  }
  const groupPositions = new Map<string, Map<string, Point>>();
  for (const [key, group] of groupMap) {
    const rank = Number(key.split('::').at(-1));
    const rankRow = rankIndex.get(rank) ?? rank;
    const sideBySideWidth = group.reduce((sum, node) => sum + node.width, 0) + Math.max(0, group.length - 1) * 12;
    const fitsSideBySide = sideBySideWidth <= columnPitch - 32;
    const lane = laneIndex.get(group[0]?.lane ?? 'default') ?? 0;
    const laneCenter = padding.left + lane * columnPitch;
    const y = rankY.get(rankRow) ?? padding.top;
    const positions = new Map<string, Point>();
    if (fitsSideBySide) {
      let x = laneCenter - sideBySideWidth / 2;
      for (const node of group) {
        positions.set(node.id, { x, y });
        x += node.width + 12;
      }
    } else {
      let stackY = y;
      for (const node of group) {
        positions.set(node.id, { x: laneCenter - node.width / 2, y: stackY });
        stackY += node.height + 16;
      }
    }
    groupPositions.set(key, positions);
  }
  return measured.map((node) => {
    const key = `${node.lane ?? 'default'}::${node.rank}`;
    const point = groupPositions.get(key)?.get(node.id) ?? { x: padding.left, y: padding.top };
    return { ...node, x: point.x, y: point.y };
  });
}

function edgeRoute(from: LaidOutNode, to: LaidOutNode, orientation: SwimlaneOrientation): Point[] {
  const start = edgePoint(from, to, orientation, true);
  const end = edgePoint(to, from, orientation, false);
  if (Math.abs(start.x - end.x) < 4 || Math.abs(start.y - end.y) < 4) return [start, end];
  if (orientation === 'vertical') {
    const midY = Math.round((start.y + end.y) / 2 / 4) * 4;
    return [{ ...start }, { x: start.x, y: midY }, { x: end.x, y: midY }, { ...end }];
  }
  const midX = Math.round((start.x + end.x) / 2 / 4) * 4;
  return [{ ...start }, { x: midX, y: start.y }, { x: midX, y: end.y }, { ...end }];
}

function placeEdgeLabels(edges: Array<Omit<LaidOutEdge, 'label'>>, nodes: LaidOutNode[], bounds: { minX: number; minY: number; maxX: number; maxY: number }, dense: boolean): LaidOutEdge[] {
  const occupied = nodes.map((node) => expandRect(nodeRect(node), 5));
  const laidOut = edges.map((item) => {
    const lines = item.edge.label ? splitSvgText(item.edge.label, dense ? 18 : 24).slice(0, 2) : [];
    if (!lines.length) return item;
    const width = Math.max(64, Math.min(dense ? 128 : 168, Math.max(...lines.map((line) => line.length)) * 6 + 24));
    const height = lines.length > 1 ? 34 : 22;
    const label = findLabelSlot(item.path, width, height, occupied, bounds, lines);
    occupied.push(expandRect(labelRect(label), 4));
    return { ...item, label };
  });
  const overlaps = collectLabelOverlaps(laidOut.filter((edge): edge is LaidOutEdge => Boolean(edge.label)), nodes);
  if (overlaps.length && typeof console !== 'undefined') {
    console.warn(`DiagramCanvas edge-label overlap avoided incompletely: ${overlaps.slice(0, 4).join(', ')}`);
  }
  return laidOut;
}

function findLabelSlot(path: Point[], width: number, height: number, occupied: Rect[], bounds: { minX: number; minY: number; maxX: number; maxY: number }, lines: string[]): EdgeLabelLayout {
  const tValues = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74];
  const offsets = [0, -16, 16, -24, 24];
  for (const t of tValues) {
    const sample = pointAtPath(path, t);
    for (const offset of offsets) {
      const candidate = labelFromSample(sample, width, height, lines, offset);
      if (labelFits(candidate, occupied, bounds)) return candidate;
    }
  }
  const anchor = pointAtPath(path, 0.5);
  for (const yOffset of [28, 44, 60, 76, 96, 116]) {
    const x = clamp(anchor.point.x, bounds.minX + width / 2 + 12, bounds.maxX - width / 2 - 12);
    const y = anchor.point.y + yOffset;
    const candidate = { x, y, width, height, lines, anchor: anchor.point, leader: true };
    if (labelFits(candidate, occupied, { ...bounds, maxY: bounds.maxY + 160 })) return candidate;
  }
  return { x: anchor.point.x, y: anchor.point.y + 116, width, height, lines, anchor: anchor.point, leader: true };
}

function labelFromSample(sample: { point: Point; tangent: Point }, width: number, height: number, lines: string[], offset: number): EdgeLabelLayout {
  const length = Math.hypot(sample.tangent.x, sample.tangent.y) || 1;
  const normal = { x: -sample.tangent.y / length, y: sample.tangent.x / length };
  const x = sample.point.x + normal.x * offset;
  const y = sample.point.y + normal.y * offset;
  return {
    x,
    y,
    width,
    height,
    lines,
    anchor: sample.point,
    leader: Math.hypot(x - sample.point.x, y - sample.point.y) > 20,
  };
}

function pointAtPath(path: Point[], t: number) {
  const segments = path.slice(1).map((point, index) => {
    const start = path[index]!;
    const length = Math.hypot(point.x - start.x, point.y - start.y);
    return { start, end: point, length };
  });
  const total = segments.reduce((sum, segment) => sum + segment.length, 0) || 1;
  let remaining = total * t;
  for (const segment of segments) {
    if (remaining <= segment.length || segment === segments.at(-1)) {
      const local = segment.length ? remaining / segment.length : 0;
      return {
        point: {
          x: segment.start.x + (segment.end.x - segment.start.x) * local,
          y: segment.start.y + (segment.end.y - segment.start.y) * local,
        },
        tangent: { x: segment.end.x - segment.start.x, y: segment.end.y - segment.start.y },
      };
    }
    remaining -= segment.length;
  }
  return { point: path[0] ?? { x: 0, y: 0 }, tangent: { x: 1, y: 0 } };
}

function labelFits(label: EdgeLabelLayout, occupied: Rect[], bounds: { minX: number; minY: number; maxX: number; maxY: number }) {
  const rect = labelRect(label);
  if (rect.x < bounds.minX + 8 || rect.x + rect.width > bounds.maxX - 8 || rect.y < bounds.minY + 8 || rect.y + rect.height > bounds.maxY + 8) return false;
  return occupied.every((other) => !rectsIntersect(rect, other));
}

function collectLabelOverlaps(edges: LaidOutEdge[], nodes: LaidOutNode[]) {
  const nodeRects = nodes.map((node) => ({ id: node.id, rect: nodeRect(node) }));
  const labels = edges.flatMap((edge, index) => edge.label ? [{ id: `${edge.edge.from}->${edge.edge.to}#${index}`, rect: labelRect(edge.label) }] : []);
  const overlaps: string[] = [];
  for (const label of labels) {
    for (const node of nodeRects) {
      if (rectsIntersect(label.rect, node.rect)) overlaps.push(`${label.id} over ${node.id}`);
    }
  }
  for (let i = 0; i < labels.length; i += 1) {
    for (let j = i + 1; j < labels.length; j += 1) {
      if (rectsIntersect(labels[i]!.rect, labels[j]!.rect)) overlaps.push(`${labels[i]!.id} over ${labels[j]!.id}`);
    }
  }
  return overlaps;
}

function computeRanks(nodes: DiagramNode[], edges: DiagramEdge[]) {
  const ids = new Set(nodes.map((node) => node.id));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) continue;
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }
  const ranks = new Map<string, number>();
  const queue = nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0).map((node) => node.id);
  for (const id of queue) ranks.set(id, 0);
  while (queue.length) {
    const id = queue.shift()!;
    const nextRank = (ranks.get(id) ?? 0) + 1;
    for (const child of outgoing.get(id) ?? []) {
      ranks.set(child, Math.max(ranks.get(child) ?? 0, nextRank));
      incoming.set(child, (incoming.get(child) ?? 1) - 1);
      if ((incoming.get(child) ?? 0) === 0) queue.push(child);
    }
  }
  nodes.forEach((node, index) => {
    if (!ranks.has(node.id)) ranks.set(node.id, index);
  });
  return ranks;
}

function edgePoint(node: LaidOutNode, toward: LaidOutNode, orientation: SwimlaneOrientation, isStart: boolean) {
  const gap = 8;
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const tx = toward.x + toward.width / 2;
  const ty = toward.y + toward.height / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (orientation === 'vertical' && node.rank !== toward.rank) {
    const forward = toward.rank > node.rank;
    if ((isStart && forward) || (!isStart && !forward)) return { x: cx, y: node.y + node.height + gap };
    return { x: cx, y: node.y - gap };
  }
  if (Math.abs(dx) > Math.abs(dy)) return { x: cx + Math.sign(dx) * (node.width / 2 + gap), y: cy };
  return { x: cx, y: cy + Math.sign(dy) * (node.height / 2 + gap) };
}

export function edgePath(points: Point[]) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function nodeRect(node: LaidOutNode): Rect {
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

function labelRect(label: EdgeLabelLayout): Rect {
  return { x: label.x - label.width / 2, y: label.y - label.height / 2, width: label.width, height: label.height };
}

export function labelLeaderEndpoint(label: EdgeLabelLayout): Point {
  const rect = labelRect(label);
  const center = { x: label.x, y: label.y };
  const dx = label.anchor.x - center.x;
  const dy = label.anchor.y - center.y;
  if (Math.abs(dx) * rect.height > Math.abs(dy) * rect.width) {
    return {
      x: dx > 0 ? rect.x + rect.width : rect.x,
      y: clamp(center.y + dy * (rect.width / 2) / (Math.abs(dx) || 1), rect.y, rect.y + rect.height),
    };
  }
  return {
    x: clamp(center.x + dx * (rect.height / 2) / (Math.abs(dy) || 1), rect.x, rect.x + rect.width),
    y: dy > 0 ? rect.y + rect.height : rect.y,
  };
}

function expandRect(rect: Rect, amount: number): Rect {
  return { x: rect.x - amount, y: rect.y - amount, width: rect.width + amount * 2, height: rect.height + amount * 2 };
}

function rectsIntersect(a: Rect, b: Rect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function mobileConnectorEdges(edges: LaidOutEdge[], nodeOrder: Map<string, number>, index: number) {
  const nextIndex = index + 1;
  const incoming = edges.filter(({ edge }) => {
    const fromIndex = nodeOrder.get(edge.from);
    const toIndex = nodeOrder.get(edge.to);
    return fromIndex !== undefined && toIndex === nextIndex && fromIndex < toIndex;
  });
  if (incoming.length) return incoming.slice(0, 3);
  return edges.filter(({ edge }) => {
    const fromIndex = nodeOrder.get(edge.from);
    const toIndex = nodeOrder.get(edge.to);
    return fromIndex === index && toIndex !== undefined && toIndex > fromIndex;
  }).slice(0, 3);
}

export function splitSvgText(value: string, maxChars: number, options: { ellipsis?: boolean; maxLines?: number } = {}) {
  const explicit = String(value).split(/\n/g);
  const lines = explicit.flatMap((line) => wrapWords(line, maxChars)).filter((line) => line.length > 0);
  if (!options.maxLines || lines.length <= options.maxLines) return lines.length ? lines : [''];
  const visible = lines.slice(0, options.maxLines);
  if (options.ellipsis) visible[visible.length - 1] = withEllipsis(visible[visible.length - 1]!, maxChars);
  return visible.length ? visible : [''];
}

export function wrapWords(value: string, maxChars: number) {
  const normalized = value.replace(/\s*·\s*/gu, ' · ').replace(/\s+\/\s+/gu, ' / ');
  const words = normalized.split(/(\s+)/).filter((part) => part.length > 0);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const compact = /^\s+$/.test(word) ? ' ' : word;
    const candidate = `${current}${compact}`;
    if (current && candidate.trim().length > maxChars) {
      const line = cleanWrappedLine(current);
      if (line) lines.push(line);
      current = isDanglingSeparator(compact) ? '' : compact.trimStart();
    } else {
      current = candidate;
    }
  }
  const line = cleanWrappedLine(current);
  if (line) lines.push(line);
  return balanceWrappedLines(lines, maxChars);
}

function balanceWrappedLines(lines: string[], maxChars: number) {
  if (lines.length < 2) return lines.length ? lines : [''];
  const balanced = [...lines];
  for (let index = balanced.length - 1; index > 0; index -= 1) {
    const line = balanced[index]!;
    if (line.length > 8) continue;
    const previous = balanced[index - 1]!;
    const previousWords = previous.split(/\s+/);
    if (previousWords.length < 2) continue;
    const moved = previousWords.pop()!;
    const candidate = cleanWrappedLine(`${moved} ${line}`);
    if (candidate.length > maxChars) continue;
    balanced[index - 1] = cleanWrappedLine(previousWords.join(' '));
    balanced[index] = candidate;
  }
  return balanced.filter((line) => line.length > 0);
}

function cleanWrappedLine(value: string) {
  return value.trim().replace(/^[·,/]\s*/u, '').replace(/\s*[·,/]\s*$/u, '').trim();
}

function isDanglingSeparator(value: string) {
  return /^[\s·,/]+$/u.test(value);
}

function withEllipsis(value: string, maxChars: number) {
  const clean = cleanWrappedLine(value);
  if (clean.length + 1 <= maxChars) return `${clean}…`;
  const clipped = clean.slice(0, Math.max(1, maxChars - 1));
  const boundary = Math.max(clipped.lastIndexOf(' '), clipped.lastIndexOf('·'), clipped.lastIndexOf('/'), clipped.lastIndexOf(','));
  const base = boundary > 4 ? clipped.slice(0, boundary) : clipped;
  return `${cleanWrappedLine(base)}…`;
}

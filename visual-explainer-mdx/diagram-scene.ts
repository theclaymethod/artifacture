import { diagramTypography as type, edgePath, labelLeaderEndpoint, layoutDiagram, type LaidOutNode } from './diagram-layout';
import type { DiagramCanvasProps } from './diagram-types';
import { createGraphicScene } from './graphics-types';
import type { GraphicObject, GraphicPrimitive, GraphicScene } from './graphics-types';

export function createDiagramScene(input: DiagramCanvasProps & { id: string }): GraphicScene {
  const diagram = layoutDiagram(input.nodes, input.edges, input.layout ?? 'flow', input.lanes, input.dates, input.direction ?? 'auto');
  return diagramSceneFromLayout(diagram, input);
}

export function diagramSceneFromLayout(diagram: ReturnType<typeof layoutDiagram>, input: Pick<DiagramCanvasProps, 'title' | 'description'> & { id: string }): GraphicScene {
  const objects: GraphicObject[] = [];
  for (const lane of diagram.lanes) {
    const x = lane.orientation === 'vertical' ? lane.x + lane.width / 2 : lane.x + 16;
    const primitives: GraphicPrimitive[] = [];
    if (lane.orientation === 'vertical') {
      if (lane.divider) primitives.push({ kind: 'line', x1: lane.x + lane.width, x2: lane.x + lane.width, y1: lane.y, y2: lane.y + lane.height, stroke: 'frame' });
      primitives.push({ kind: 'line', x1: lane.x + 16, x2: lane.x + lane.width - 16, y1: lane.y + lane.lines.length * 20 + 20, y2: lane.y + lane.lines.length * 20 + 20, stroke: 'frame' });
    } else primitives.push({ kind: 'line', x1: lane.x, x2: lane.x + lane.width, y1: lane.y, y2: lane.y, stroke: 'frame' });
    primitives.push({ kind: 'text', x, y: lane.y + 24, lines: lane.lines, leading: 20, size: 14, weight: 600, anchor: lane.orientation === 'vertical' ? 'middle' : 'start', fill: 'ink' });
    objects.push({ id: `lane:${lane.id}`, kind: 'lane', meaning: lane.label, primitives });
  }
  diagram.timeline.forEach((tick, index) => objects.push({ id: `tick:${index}`, kind: 'tick', meaning: tick.label, primitives: [{ kind: 'text', x: tick.x, y: tick.y, lines: tick.lines, leading: 20, size: 14, weight: 600, anchor: 'middle', fill: 'ink' }] }));
  const edgeIds = diagram.edges.map(({ edge }, index) => `edge:${edge.id ?? `${edge.from}:${edge.to}:${index}`}`);
  diagram.edges.forEach(({ edge, from, to, path }, index) => objects.push({
    id: edgeIds[index], kind: 'edge', meaning: edge.label,
    edge: { id: edge.id, fromOrder: from.order, toOrder: to.order, sourceAnchor: nodeAnchor(from, path[0]), targetAnchor: nodeAnchor(to, path.at(-1)) },
    primitives: [{ kind: 'path', d: edgePath(path), fill: 'none', stroke: from.isAccented || to.isAccented ? 'accent' : 'muted', strokeWidth: 1.5, dash: edge.style === 'dashed' ? '6 5' : undefined, arrow: edge.style === 'bidirectional' ? 'both' : 'end' }],
  }));
  diagram.edges.forEach(({ label }, index) => {
    if (!label) return;
    const primitives: GraphicPrimitive[] = [];
    if (label.leader) { const end = labelLeaderEndpoint(label); primitives.push({ kind: 'line', x1: label.anchor.x, x2: end.x, y1: label.anchor.y, y2: end.y, stroke: 'muted', strokeWidth: 1 }); }
    primitives.push({ kind: 'rect', x: label.x - label.width / 2, y: label.y - label.height / 2, width: label.width, height: label.height, fill: 'background', role: 'arrow-label-mask' });
    primitives.push({ kind: 'text', x: label.x, y: label.y - (label.lines.length - 1) * type.edgeLeading / 2 + 5, lines: label.lines, leading: type.edgeLeading, size: type.edgeSize, anchor: 'middle', fill: 'ink' });
    objects.push({ id: `${edgeIds[index]}:label`, kind: 'edge-label', primitives });
  });
  diagram.nodes.forEach((node) => objects.push({ id: `node:${node.id}`, kind: 'node', node: { id: node.id, order: node.order, label: node.label }, meaning: node.detail, primitives: nodePrimitives(node) }));
  if (!diagram.nodes.length) objects.push({ id: 'empty', kind: 'illustration', primitives: [{ kind: 'text', x: 40, y: 64, lines: ['No nodes to display.'], leading: 20, size: 16, fill: 'muted' }] });
  const description = input.description ?? diagram.nodes.map((node) => {
    const targets = diagram.edges.filter(({ edge }) => edge.from === node.id).map(({ edge, to }) => `${edge.label ? `${edge.label}: ` : ''}${to.label}${edge.style === 'bidirectional' ? ' (both directions)' : ''}`);
    return `${node.label}${node.detail ? `: ${node.detail}` : ''}.${targets.length ? ` Connects to ${targets.join('; ')}.` : ''}`;
  }).join(' ');
  return createGraphicScene({ id: input.id, title: input.title ?? 'Diagram', description: description || 'No nodes to display.', bounds: diagram.viewBox, objects });
}

function nodePrimitives(item: LaidOutNode): GraphicPrimitive[] {
  const glyph = item['shape'] ?? 'rect';
  const centered = glyph === 'diamond' || glyph === 'oval' || glyph === 'dot';
  const x = centered ? item.x + item.width / 2 : item.x + 20;
  const top = glyph === 'dot' ? item.y + 40 : item.y + (item.height - item.textHeight) / 2;
  const stroke = item.isAccented ? 'accent' : 'node-stroke';
  const fill = item.isAccented ? 'accent-background' : 'node-background';
  const outline: GraphicPrimitive = glyph === 'diamond' ? { kind: 'polygon', points: [{ x: item.x + item.width / 2, y: item.y }, { x: item.x + item.width, y: item.y + item.height / 2 }, { x: item.x + item.width / 2, y: item.y + item.height }, { x: item.x, y: item.y + item.height / 2 }], fill, stroke, strokeWidth: 1.5, role: 'node' }
    : glyph === 'dot' ? { kind: 'circle', x: item.x + item.width / 2, y: item.y + 12, radius: 12, fill: stroke, role: 'node' }
      : { kind: 'rect', x: item.x, y: item.y, width: item.width, height: item.height, radius: glyph === 'oval' ? item.height / 2 : 'node', fill, stroke, strokeWidth: 1.5, role: 'node' };
  return [outline,
    { kind: 'text', x, y: top + 16, lines: item.labelLines, leading: type.labelLeading, size: type.labelSize, weight: 600, anchor: centered ? 'middle' : 'start', fill: 'ink', label: true },
    ...(item.detailLines.length ? [{ kind: 'text' as const, x, y: top + item.labelLines.length * type.labelLeading + 8 + 14, lines: item.detailLines, leading: type.detailLeading, size: type.detailSize, anchor: centered ? 'middle' as const : 'start' as const, fill: 'muted' as const }] : []),
  ];
}

function nodeAnchor(node: LaidOutNode, point?: { x: number; y: number }) {
  if (!point) return undefined;
  const dot = node['shape'] === 'dot';
  const cx = node.x + node.width / 2;
  const cy = dot ? node.y + 12 : node.y + node.height / 2;
  const halfWidth = dot ? 12 : node.width / 2;
  const halfHeight = dot ? 12 : node.height / 2;
  if (Math.abs(point.y - cy) < 0.5) {
    if (point.x < cx - halfWidth) return 'left-center';
    if (point.x > cx + halfWidth) return 'right-center';
  }
  if (Math.abs(point.x - cx) < 0.5) {
    if (point.y < cy - halfHeight) return 'top-center';
    if (point.y > cy + halfHeight) return 'bottom-center';
  }
  return undefined;
}

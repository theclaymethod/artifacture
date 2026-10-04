import React, { useId, type CSSProperties } from 'react';
import type { GraphicObject, GraphicPaint, GraphicPrimitive, GraphicScene } from './graphics-types';
export { createGraphicScene } from './graphics-types';

const paints = {
  none: 'none', background: 'var(--ve-diagram-bg)', ink: 'var(--ve-diagram-ink)', muted: 'var(--ve-diagram-muted)',
  frame: 'var(--ve-diagram-frame)', 'node-background': 'var(--ve-node-bg)', 'node-stroke': 'var(--ve-node-stroke)',
  accent: 'var(--ve-accent)', 'accent-background': 'var(--ve-diagram-accent-fill)',
} satisfies Record<GraphicPaint, string>;

function paint(role: GraphicPaint | undefined, highlight: boolean, stroke = false) {
  if (!role) return undefined;
  if (highlight && ((stroke && role !== 'none' && role !== 'frame') || role === 'node-stroke')) return paints.accent;
  if (highlight && role === 'node-background') return paints['accent-background'];
  return paints[role];
}

function Primitive({ primitive: p, object, prefix, arrowId }: { primitive: GraphicPrimitive; object: GraphicObject; prefix: string; arrowId: string }) {
  const highlight = object.state?.highlight ?? false;
  const style = { fill: paint(p.fill, highlight), stroke: paint(p.stroke, highlight, true), strokeWidth: p.strokeWidth, strokeDasharray: p.dash };
  const node = p.role === 'node' && object.node ? { 'data-diagram-id': `ve-node-${prefix}-${object.node.order}`, 'data-ve-node-id': object.node.id } : {};
  const semantics = { 'data-diagram-role': p.role, ...node };
  switch (p.kind) {
    case 'rect': return <rect {...style} {...semantics} x={p.x} y={p.y} width={p.width} height={p.height} rx={p.radius === 'node' ? 'var(--ve-node-radius, 6)' : p.radius} />;
    case 'circle': return <circle {...style} {...semantics} cx={p.x} cy={p.y} r={p.radius} />;
    case 'polygon': return <polygon {...style} {...semantics} points={p.points.map(({ x, y }) => `${x},${y}`).join(' ')} />;
    case 'line': return <line {...style} {...semantics} x1={p.x1} x2={p.x2} y1={p.y1} y2={p.y2} />;
    case 'text': return <text {...style} className={p.label ? 've-diagram-node-label' : undefined} fontFamily="var(--ve-font-body)" fontSize={p.size} fontWeight={p.weight} textAnchor={p.anchor ?? 'start'} x={p.x} y={p.y}>{p.lines.map((line, index) => <tspan key={index} dy={index ? p.leading : 0} x={p.x}>{line}</tspan>)}</text>;
    case 'path': {
      const edge = object.edge;
      const reveal = object.state?.reveal ?? 1;
      return <path {...style} d={p.d} data-diagram-role={edge ? 'arrow' : undefined} data-ve-edge-id={edge?.id} data-diagram-source={edge ? `ve-node-${prefix}-${edge.fromOrder}` : undefined} data-diagram-target={edge ? `ve-node-${prefix}-${edge.toOrder}` : undefined} data-diagram-source-anchor={edge?.sourceAnchor} data-diagram-target-anchor={edge?.targetAnchor} markerEnd={p.arrow && reveal === 1 ? `url(#${arrowId})` : undefined} markerStart={p.arrow === 'both' && reveal === 1 ? `url(#${arrowId})` : undefined} strokeLinecap="round" strokeLinejoin="round" pathLength={reveal < 1 ? 1 : undefined} strokeDasharray={reveal < 1 ? `1 1` : p.dash} strokeDashoffset={reveal < 1 ? 1 - reveal : undefined} />;
    }
  }
}

export function GraphicCanvas({ scene, instancePrefix, className = 'h-auto w-full', style }: { scene: GraphicScene; instancePrefix?: string; className?: string; style?: CSSProperties }) {
  const reactId = useId().replace(/:/g, '');
  const prefix = instancePrefix ?? reactId;
  const arrowId = `ve-arrow-${prefix}`;
  const titleId = `ve-diagram-title-${prefix}`;
  const descId = `ve-diagram-desc-${prefix}`;
  const { bounds } = scene;
  return <svg aria-labelledby={`${titleId} ${descId}`} className={className} data-diagram-role="diagram" data-graphic-scene={scene.id} role="img" style={style} viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`} width="100%" xmlns="http://www.w3.org/2000/svg">
    <title id={titleId}>{scene.title}</title><desc id={descId}>{scene.description}</desc>
    <defs><marker id={arrowId} markerHeight="7" markerWidth="7" orient="auto-start-reverse" refX="9" refY="5" viewBox="0 0 10 10"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
    <rect fill={paints.background} height={bounds.height} width={bounds.width} x={bounds.x} y={bounds.y} />
    <g data-diagram-role="layer">{scene.objects.map((object) => <g key={object.id} data-graphic-object={object.id} data-diagram-role={object.kind === 'edge-label' ? 'arrow-label' : object.kind === 'lane' ? 'lane' : undefined} data-ve-label={object.node?.label} opacity={object.state?.opacity} transform={object.state && (object.state.x || object.state.y) ? `translate(${object.state.x} ${object.state.y})` : undefined}>{object.primitives.map((primitive, index) => <Primitive key={index} primitive={primitive} object={object} prefix={prefix} arrowId={arrowId} />)}</g>)}</g>
  </svg>;
}

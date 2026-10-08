import { useId, type CSSProperties } from 'react';
import type { GraphicBounds, GraphicConnector, GraphicConnectorSide, GraphicFont, GraphicObject, GraphicPaint, GraphicPrimitive, GraphicScene } from './graphics-types';
import { objectBounds } from './graphic-bounds';
export { createGraphicScene } from './graphics-types';

const paints = {
  none: 'none', background: 'var(--ve-diagram-bg)', ink: 'var(--ve-diagram-ink)', muted: 'var(--ve-diagram-muted)',
  frame: 'var(--ve-diagram-frame)', 'node-background': 'var(--ve-node-bg)', 'node-stroke': 'var(--ve-node-stroke)',
  'illustration-ink': 'var(--ve-illustration-ink)', 'illustration-muted': 'var(--ve-illustration-muted)',
  accent: 'var(--ve-accent)', live: 'var(--ve-accent)', 'accent-background': 'var(--ve-diagram-accent-fill)',
  'solid-lit': 'color-mix(in srgb, var(--ve-diagram-ink) 7%, var(--ve-diagram-bg))',
  'solid-shade': 'color-mix(in srgb, var(--ve-diagram-ink) 15%, var(--ve-diagram-bg))',
  attention: 'var(--ve-attention)', fault: 'var(--ve-fault)',
} satisfies Record<GraphicPaint, string>;

const fonts = {
  body: 'var(--ve-font-body)', display: 'var(--ve-font-display)',
  math: 'var(--ve-font-math)', mono: 'var(--ve-font-mono)',
} satisfies Record<GraphicFont, string>;

function paint(role: GraphicPaint | undefined, highlight: boolean, stroke = false) {
  if (!role) return undefined;
  if (role === 'live') return highlight ? paints.accent : paints['illustration-muted'];
  if (role === 'illustration-muted' || role === 'attention' || role === 'fault') return paints[role];
  if (highlight && ((stroke && role !== 'none' && role !== 'frame') || role === 'node-stroke')) return paints.accent;
  if (highlight && role === 'node-background') return paints['accent-background'];
  return paints[role];
}

function strokeToken(stroke: GraphicPaint | undefined, strokeRole: GraphicPrimitive['strokeRole'], illustration: boolean, highlight: boolean) {
  const role = strokeRole ?? (stroke === 'illustration-muted' ? 'detail' : stroke === 'accent' || highlight ? 'active' : 'structure');
  const token = role === 'guide' ? 'detail' : role === 'data' || role === 'structure' ? '' : role;
  return `var(--ve-${illustration ? 'illustration' : 'graphic'}-${token ? `${token}-` : ''}stroke)`;
}

/** `strokeScale` multiplies widths so lines keep their on-screen weight when a camera changes the view box. */
const scaledToken = (token: string, strokeScale?: number) => strokeScale === undefined || strokeScale === 1 ? token : `calc(${token} * ${strokeScale})`;

function primitiveStrokeWidth(p: GraphicPrimitive, object: GraphicObject, strokeScale?: number) {
  if (p.strokeWidth !== undefined) return p.strokeWidth * (strokeScale ?? 1);
  if (!p.stroke || p.stroke === 'none') return undefined;
  return scaledToken(strokeToken(p.stroke, p.strokeRole, object.kind === 'illustration', object.state?.highlight ?? false), strokeScale);
}

function Primitive({ primitive: p, object, prefix, arrowId, glowId, strokeScale }: { primitive: GraphicPrimitive; object: GraphicObject; prefix: string; arrowId: string; glowId: string; strokeScale?: number }) {
  const highlight = object.state?.highlight ?? false;
  const style = { fill: paint(p.fill, highlight), stroke: paint(p.stroke, highlight, true), strokeWidth: primitiveStrokeWidth(p, object, strokeScale), strokeDasharray: p.dash, filter: p.glow && highlight ? `url(#${glowId})` : undefined };
  const node = p.role === 'node' && object.node ? { 'data-diagram-id': `ve-node-${prefix}-${object.node.order}`, 'data-ve-node-id': object.node.id } : {};
  const semantics = { 'data-diagram-role': p.role, ...node };
  switch (p.kind) {
    case 'rect': return <rect {...style} {...semantics} x={p.x} y={p.y} width={p.width} height={p.height} rx={p.radius === 'node' ? 'var(--ve-node-radius, 6)' : p.radius} />;
    case 'circle': return <circle {...style} {...semantics} cx={p.x} cy={p.y} r={p.radius} />;
    case 'polygon': return <polygon {...style} {...semantics} points={p.points.map(({ x, y }) => `${x},${y}`).join(' ')} />;
    case 'line': return <line {...style} {...semantics} x1={p.x1} x2={p.x2} y1={p.y1} y2={p.y2} />;
    case 'text': return <text {...style} className={p.label ? 've-diagram-node-label' : undefined} data-graphic-font={p.font ?? 'body'} fontFamily={fonts[p.font ?? 'body']} fontSize={p.size} fontWeight={p.weight} textAnchor={p.anchor ?? 'start'} textLength={p.textLength} lengthAdjust={p.textLength === undefined ? undefined : 'spacingAndGlyphs'} xmlSpace={p.textLength === undefined ? undefined : 'preserve'} x={p.x} y={p.y}>{p.lines.map((line, index) => <tspan key={index} dy={index ? p.leading : 0} x={p.x}>{line}</tspan>)}</text>;
    case 'path': {
      const edge = object.edge;
      const reveal = object.state?.reveal ?? 1;
      return <path {...style} {...semantics} d={p.d} data-diagram-role={edge ? 'arrow' : p.role} data-ve-edge-id={edge?.id} data-diagram-source={edge ? `ve-node-${prefix}-${edge.fromOrder}` : undefined} data-diagram-target={edge ? `ve-node-${prefix}-${edge.toOrder}` : undefined} data-diagram-source-anchor={edge?.sourceAnchor} data-diagram-target-anchor={edge?.targetAnchor} markerEnd={p.arrow && reveal === 1 ? `url(#${arrowId})` : undefined} markerStart={p.arrow === 'both' && reveal === 1 ? `url(#${arrowId})` : undefined} strokeLinecap="round" strokeLinejoin="round" pathLength={reveal < 1 ? 1 : undefined} strokeDasharray={reveal < 1 ? `1 1` : p.dash} strokeDashoffset={reveal < 1 ? 1 - reveal : undefined} />;
    }
  }
}

const center = (b: GraphicBounds) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
function edgePoint(b: GraphicBounds, side: Exclude<GraphicConnectorSide, 'auto'>, gap: number) {
  const c = center(b);
  return side === 'top' ? { x: c.x, y: b.y - gap } : side === 'bottom' ? { x: c.x, y: b.y + b.height + gap } : side === 'left' ? { x: b.x - gap, y: c.y } : { x: b.x + b.width + gap, y: c.y };
}
function autoSide(from: GraphicBounds, to: GraphicBounds): Exclude<GraphicConnectorSide, 'auto'> {
  const a = center(from), b = center(to), dx = b.x - a.x, dy = b.y - a.y;
  return Math.abs(dx) * from.height >= Math.abs(dy) * from.width ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top');
}
const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' } as const;

/** The connector's current path between its objects' edges, or null while either endpoint is invisible. */
export function connectorPath(scene: GraphicScene, connector: GraphicConnector, preset?: string): Readonly<{ d: string; opacity: number }> | null {
  const from = scene.objects.find(object => object.id === connector.from), to = scene.objects.find(object => object.id === connector.to);
  const a = from && objectBounds(from, { preset }), b = to && objectBounds(to, { preset });
  if (!a || !b) return null;
  const opacity = Math.min(from.state?.opacity ?? 1, to.state?.opacity ?? 1);
  if (opacity <= 0) return null;
  const fromSide = !connector.fromSide || connector.fromSide === 'auto' ? autoSide(a, b) : connector.fromSide;
  const toSide = !connector.toSide || connector.toSide === 'auto' ? (connector.fromSide && connector.fromSide !== 'auto' ? autoSide(b, a) : opposite[fromSide]) : connector.toSide;
  const gap = connector.gap ?? 6, start = edgePoint(a, fromSide, gap), end = edgePoint(b, toSide, gap);
  const bend = connector.bend ?? 0, dx = end.x - start.x, dy = end.y - start.y;
  const d = bend ? `M ${start.x} ${start.y} Q ${(start.x + end.x) / 2 - dy * bend} ${(start.y + end.y) / 2 + dx * bend} ${end.x} ${end.y}` : `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  return { d, opacity };
}

export function GraphicCanvas({ scene, instancePrefix, className = 'h-auto w-full', style, strokeScale, preset }: { scene: GraphicScene; instancePrefix?: string; className?: string; style?: CSSProperties; strokeScale?: number; preset?: string }) {
  const reactId = useId().replace(/:/g, '');
  const prefix = instancePrefix ?? reactId;
  const arrowId = `ve-arrow-${prefix}`;
  const glowId = `ve-live-glow-${prefix}`;
  const titleId = `ve-diagram-title-${prefix}`;
  const descId = `ve-diagram-desc-${prefix}`;
  const { bounds } = scene;
  return <svg aria-labelledby={`${titleId} ${descId}`} className={className} data-diagram-role="diagram" data-graphic-scene={scene.id} role="img" style={style} viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`} width="100%" xmlns="http://www.w3.org/2000/svg">
    <title id={titleId}>{scene.title}</title><desc id={descId}>{scene.description}</desc>
    <defs><marker id={arrowId} markerHeight="7" markerWidth="7" orient="auto-start-reverse" refX="9" refY="5" viewBox="0 0 10 10"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker>
      {scene.objects.some(object => object.primitives.some(p => p.glow)) ? <filter id={glowId} x="-100%" y="-100%" width="300%" height="300%" colorInterpolationFilters="sRGB"><feGaussianBlur stdDeviation="2.3" /><feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge></filter> : null}
      {scene.objects.map((object, index) => object.clip ? <clipPath key={object.id} id={`ve-clip-${prefix}-${index}`} clipPathUnits="userSpaceOnUse">{object.clip.kind === 'rect' ? <rect {...object.clip.bounds} /> : <rect width="0" height="0" />}</clipPath> : null)}
    </defs>
    <rect fill={paints.background} height={bounds.height} width={bounds.width} x={bounds.x} y={bounds.y} />
    <g data-diagram-role="layer">{scene.objects.map((object, index) => {
      const transforms = [
        object.placement ? `translate(${object.placement.x} ${object.placement.y}) scale(${object.placement.scale})` : '',
        object.state && (object.state.x || object.state.y) ? `translate(${object.state.x} ${object.state.y})` : '',
        object.state?.scale !== undefined && object.state.scale !== 1 ? `translate(${object.state.originX ?? 0} ${object.state.originY ?? 0}) scale(${object.state.scale}) translate(${-(object.state.originX ?? 0)} ${-(object.state.originY ?? 0)})` : '',
      ].filter(Boolean).join(' ');
      const drawing = <g key={object.id} data-graphic-object={object.id} data-diagram-role={object.kind === 'edge-label' ? 'arrow-label' : object.kind === 'lane' ? 'lane' : undefined} data-ve-label={object.node?.label} opacity={object.state?.opacity} transform={transforms || undefined}>{object.primitives.map((primitive, at) => <Primitive key={at} primitive={primitive} object={object} prefix={prefix} arrowId={arrowId} glowId={glowId} strokeScale={strokeScale} />)}</g>;
      return object.clip ? <g key={object.id} clipPath={`url(#ve-clip-${prefix}-${index})`}>{drawing}</g> : drawing;
    })}{(scene.connectors ?? []).map(connector => {
      const path = connectorPath(scene, connector, preset);
      if (!path) return null;
      const stroke = paint(connector.stroke ?? 'illustration-muted', false, true);
      return <path key={connector.id} data-graphic-connector={connector.id} d={path.d} fill="none" opacity={path.opacity < 1 ? path.opacity : undefined} stroke={stroke} strokeWidth={scaledToken(strokeToken(connector.stroke ?? 'illustration-muted', connector.strokeRole, true, false), strokeScale)} strokeDasharray={connector.dash} strokeLinecap="round" strokeLinejoin="round" markerEnd={connector.arrow === 'none' ? undefined : `url(#${arrowId})`} markerStart={connector.arrow === 'both' ? `url(#${arrowId})` : undefined} />;
    })}</g>
  </svg>;
}

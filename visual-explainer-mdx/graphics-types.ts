export type GraphicBounds = Readonly<{ x: number; y: number; width: number; height: number }>;
export type GraphicPlacement = Readonly<{ scale: number; x: number; y: number }>;
export type GraphicClip = Readonly<{ kind: 'empty' }> | Readonly<{ kind: 'rect'; bounds: GraphicBounds }>;
const graphicPaintRoles = { none: true, background: true, ink: true, muted: true, frame: true, 'node-background': true, 'node-stroke': true, 'illustration-ink': true, 'illustration-muted': true, accent: true, live: true, 'accent-background': true, 'solid-lit': true, 'solid-shade': true };
export type GraphicPaint = keyof typeof graphicPaintRoles;
const graphicFonts = { body: true, display: true, math: true, mono: true };
const graphicStrokeRoles = { structure: true, detail: true, guide: true, data: true, active: true };
export type GraphicFont = keyof typeof graphicFonts;
export type GraphicStrokeRole = keyof typeof graphicStrokeRoles;
type PrimitiveStyle = Readonly<{ fill?: GraphicPaint; stroke?: GraphicPaint; strokeWidth?: number; strokeRole?: GraphicStrokeRole; glow?: boolean; dash?: string; role?: 'node' | 'arrow-label-mask' }>;
export type GraphicPrimitive = PrimitiveStyle & (
  | Readonly<{ kind: 'rect'; x: number; y: number; width: number; height: number; radius?: number | 'node' }>
  | Readonly<{ kind: 'circle'; x: number; y: number; radius: number }>
  | Readonly<{ kind: 'polygon'; points: readonly Readonly<{ x: number; y: number }>[] }>
  | Readonly<{ kind: 'path'; d: string; arrow?: 'end' | 'both' }>
  | Readonly<{ kind: 'line'; x1: number; x2: number; y1: number; y2: number }>
  | Readonly<{ kind: 'text'; x: number; y: number; lines: readonly string[]; leading: number; size: number; weight?: number; anchor?: 'start' | 'middle'; label?: boolean; font?: GraphicFont; textLength?: number }>
);
export type GraphicObject = Readonly<{
  id: string;
  kind: 'node' | 'edge' | 'edge-label' | 'lane' | 'tick' | 'illustration';
  primitives: readonly GraphicPrimitive[];
  meaning?: string;
  placement?: GraphicPlacement;
  /** Resolved clip in this scene's coordinates, outside placement and motion. */
  clip?: GraphicClip;
  node?: Readonly<{ id: string; order: number; label: string }>;
  edge?: Readonly<{ id?: string; fromOrder: number; toOrder: number; sourceAnchor?: string; targetAnchor?: string }>;
  state?: Readonly<{ opacity: number; reveal: number; highlight: boolean; x: number; y: number }>;
}>;
export type GraphicScene = Readonly<{
  id: string;
  title: string;
  description: string;
  bounds: GraphicBounds;
  objects: readonly GraphicObject[];
}>;

export function validateGraphicScene(scene: GraphicScene): void {
  if ([scene.id, scene.title, scene.description].some((value) => value !== String(value) || !value.trim())) throw new Error('Graphic scenes need an ID, title, and accessible description.');
  validateGraphicBounds(scene.bounds);
  const ids = new Set<string>();
  const nodeIds = new Set<string>();
  const nodeOrders = new Set<number>();
  const edgeIds = new Set<string>();
  for (const object of scene.objects) {
    if (object.id !== String(object.id) || !object.id.trim() || ids.has(object.id)) throw new Error(`Graphic object IDs must be unique: ${object.id}`);
    ids.add(object.id);
    if (!['node', 'edge', 'edge-label', 'lane', 'tick', 'illustration'].includes(object.kind)) throw new Error(`Unsupported graphic object kind: ${object.kind}`);
    if (object.node) {
      const node = object.node;
      if (object.kind !== 'node' || !Number.isSafeInteger(node.order) || node.order < 0 || node.id !== String(node.id) || !node.id.trim() || node.label !== String(node.label) || !node.label.trim() || nodeIds.has(node.id) || nodeOrders.has(node.order)) throw new Error(`Invalid or duplicate node identity: ${object.id}`);
      const outlines = object.primitives.filter(p => p.role === 'node');
      if (outlines.length !== 1 || !['rect', 'circle', 'polygon', 'path'].includes(outlines[0].kind)) throw new Error(`A node needs one physical node primitive: ${object.id}`);
      nodeIds.add(node.id);
      nodeOrders.add(node.order);
    }
    if (object.edge && (object.kind !== 'edge' || [object.edge.fromOrder, object.edge.toOrder].some((n) => !Number.isSafeInteger(n) || n < 0))) throw new Error(`Invalid edge relationship: ${object.id}`);
    if (object.edge?.id !== undefined) {
      const id = object.edge.id;
      if (id !== String(id) || !id.trim() || edgeIds.has(id)) throw new Error(`Invalid or duplicate edge identity: ${object.id}`);
      edgeIds.add(id);
    }
    if (object.placement && ([object.placement.scale, object.placement.x, object.placement.y].some(n => !Number.isFinite(n)) || object.placement.scale <= 0)) throw new Error(`Invalid graphic placement: ${object.id}`);
    if (object.clip) {
      if (object.clip.kind === 'rect') validateGraphicBounds(object.clip.bounds);
      else if (object.clip.kind !== 'empty') throw new Error(`Unsupported graphic clip: ${object.id}`);
    }
    if (object.state) {
      const state = object.state;
      if ([state.opacity, state.reveal].some((n) => !Number.isFinite(n) || n < 0 || n > 1) || !Number.isFinite(state.x) || !Number.isFinite(state.y) || ![true, false].includes(state.highlight)) throw new Error(`Invalid graphic state: ${object.id}`);
    }
    for (const primitive of object.primitives) validatePrimitive(primitive, object.id);
  }
  for (const object of scene.objects) if (object.edge && (!nodeOrders.has(object.edge.fromOrder) || !nodeOrders.has(object.edge.toOrder))) throw new Error(`Edge endpoints must resolve inside their scene: ${object.id}`);
}

export function validateGraphicBounds(bounds: GraphicBounds): void {
  if ([bounds.x, bounds.y, bounds.width, bounds.height, bounds.x + bounds.width, bounds.y + bounds.height].some(n => !Number.isFinite(n)) || bounds.width <= 0 || bounds.height <= 0) throw new Error('Graphic bounds must be finite and have positive size.');
}

export function createGraphicScene(scene: GraphicScene): GraphicScene {
  validateGraphicScene(scene);
  return freezeScene(structuredClone(scene));
}

function validatePrimitive(p: GraphicPrimitive, id: string) {
  const fail = (reason: string): never => { throw new Error(`${reason}: ${id}`); };
  if (!['rect', 'circle', 'polygon', 'path', 'line', 'text'].includes(p.kind)) fail(`Unsupported primitive ${p.kind}`);
  const finite = (values: readonly number[]) => { if (values.some((n) => !Number.isFinite(n))) fail('Non-finite geometry'); };
  if (p.strokeWidth !== undefined) finite([p.strokeWidth]);
  if (p.glow !== undefined && p.glow !== true && p.glow !== false) fail('Glow must be boolean');
  if (p.strokeRole !== undefined && !Object.hasOwn(graphicStrokeRoles, p.strokeRole)) fail(`Unsupported stroke role ${p.strokeRole}`);
  for (const role of [p.fill, p.stroke]) if (role !== undefined && !Object.hasOwn(graphicPaintRoles, role)) fail(`Unsupported paint ${role}`);
  if (p.role !== undefined && p.role !== 'node' && p.role !== 'arrow-label-mask') fail(`Unsupported primitive role ${p.role}`);
  if (p.strokeWidth !== undefined && p.strokeWidth <= 0) fail('Stroke width must be positive');
  if (p.dash !== undefined && (!/^[\d. ,]+$/.test(p.dash) || p.dash.split(/[ ,]+/).some((n) => !Number.isFinite(Number(n)) || Number(n) < 0))) fail('Invalid stroke dash');
  switch (p.kind) {
    case 'rect':
      finite([p.x, p.y, p.width, p.height, ...(p.radius !== undefined && p.radius !== 'node' ? [p.radius] : [])]);
      if (p.width <= 0 || p.height <= 0 || (p.radius !== undefined && p.radius !== 'node' && p.radius < 0)) fail('Invalid rectangle dimensions');
      break;
    case 'circle': finite([p.x, p.y, p.radius]); if (p.radius <= 0) fail('Circle radius must be positive'); break;
    case 'polygon': if (p.points.length < 3 || p.points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) fail('Invalid polygon'); break;
    case 'path':
      validatePath(p.d, id);
      if (p.arrow !== undefined && p.arrow !== 'end' && p.arrow !== 'both') fail('Unsupported arrow');
      break;
    case 'text':
      if (p.font !== undefined && !Object.hasOwn(graphicFonts, p.font)) fail(`Unsupported graphic font ${p.font}`);
      finite([p.x, p.y, p.size, p.leading, ...(p.weight !== undefined ? [p.weight] : [])]);
      if (p.size <= 0 || p.leading <= 0 || !p.lines.length || p.lines.some((line) => line !== String(line)) || (p.anchor !== undefined && p.anchor !== 'start' && p.anchor !== 'middle')) fail('Invalid text geometry');
      if (p.textLength !== undefined && (!Number.isFinite(p.textLength) || p.textLength <= 0 || p.lines.length !== 1)) fail('Text length requires one line and positive finite width');
      break;
    case 'line': finite([p.x1, p.x2, p.y1, p.y2]); break;
  }
}

function validatePath(path: string, id: string) {
  if (path !== String(path)) throw new Error(`Invalid SVG path: ${id}`);
  const token = /[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;
  const tokens = path.match(token) ?? [];
  if (!tokens.length || !/^[Mm]$/.test(tokens[0] ?? '') || path.replace(token, '').replace(/[\s,]/g, '')) throw new Error(`Unsupported SVG path: ${id}`);
  const sizes = new Map([['M', 2], ['L', 2], ['H', 1], ['V', 1], ['C', 6], ['S', 4], ['Q', 4], ['T', 2], ['A', 7], ['Z', 0]]);
  for (let i = 0; i < tokens.length;) {
    const command = tokens[i++].toUpperCase();
    if (!sizes.has(command)) throw new Error(`Malformed SVG path: ${id}`);
    const values: number[] = [];
    while (i < tokens.length && !/^[a-z]$/i.test(tokens[i])) values.push(Number(tokens[i++]));
    const size = sizes.get(command)!;
    if (values.some((n) => !Number.isFinite(n)) || (size === 0 ? values.length !== 0 : !values.length || values.length % size !== 0)) throw new Error(`Malformed SVG path: ${id}`);
    if (command === 'A') for (let at = 0; at < values.length; at += 7) if (values[at] < 0 || values[at + 1] < 0 || ![0, 1].includes(values[at + 3]) || ![0, 1].includes(values[at + 4])) throw new Error(`Invalid SVG arc: ${id}`);
  }
}

function freezeScene(scene: GraphicScene): GraphicScene {
  for (const object of scene.objects) {
    for (const primitive of object.primitives) {
      if (primitive.kind === 'polygon') { primitive.points.forEach(Object.freeze); Object.freeze(primitive.points); }
      if (primitive.kind === 'text') Object.freeze(primitive.lines);
      Object.freeze(primitive);
    }
    Object.freeze(object.primitives);
    if (object.node) Object.freeze(object.node);
    if (object.edge) Object.freeze(object.edge);
    if (object.state) Object.freeze(object.state);
    if (object.placement) Object.freeze(object.placement);
    if (object.clip) { if (object.clip.kind === 'rect') Object.freeze(object.clip.bounds); Object.freeze(object.clip); }
    Object.freeze(object);
  }
  Object.freeze(scene.bounds);
  Object.freeze(scene.objects);
  return Object.freeze(scene);
}

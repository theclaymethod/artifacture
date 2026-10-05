import { graphStratify, grid, type GraphNode } from 'd3-dag';
import { createDiagramScene } from './diagram-scene';
import { createGraphicScene, type GraphicObject, type GraphicPrimitive, type GraphicScene } from './graphics-types';
import { defineGraphicMotion, type GraphicMotionTrack } from './graphic-motion';

export type DagNode = Readonly<{ id: string; label: string; parentIds: readonly string[]; detail?: string }>;
export type DagInput = Readonly<{ id: string; title: string; description?: string; nodes: readonly DagNode[] }>;
export type DagEdge = Readonly<{ id: string; from: string; to: string }>;
export type PreparedDag = Readonly<{
  nodes: readonly DagNode[]; edges: readonly DagEdge[]; order: readonly string[];
  scene: GraphicScene; minimap: GraphicScene; rowHeight: number;
}>;
export type DagNeighborhood = Readonly<{ parents: readonly string[]; children: readonly string[]; edges: readonly string[] }>;
type RankedDagNode = DagNode & Readonly<{ rank: number }>;

/** A parent-first, stable order. Disconnected roots and multiple parents are supported. */
export function prepareDag(input: DagInput): PreparedDag {
  if (!input || input.id !== String(input.id) || !input.id.trim() || input.title !== String(input.title) || !input.title.trim() || !Array.isArray(input.nodes) || !input.nodes.length || input.nodes.length > 256) throw new Error('A DAG needs an ID, title, and 1–256 nodes.');
  if (input.description !== undefined && (input.description !== String(input.description) || !input.description.trim())) throw new Error('DAG descriptions must be meaningful text.');
  const nodes = input.nodes.map((node: DagNode) => {
    if (!node || node.id !== String(node.id) || !node.id.trim() || node.label !== String(node.label) || !node.label.trim() || !Array.isArray(node.parentIds) || new Set(node.parentIds).size !== node.parentIds.length || node.parentIds.some((id: string) => id !== String(id) || !id.trim())) throw new Error('DAG nodes need unique IDs, labels, and distinct parent IDs.');
    if (node.detail !== undefined && (node.detail !== String(node.detail) || !node.detail.trim())) throw new Error(`Invalid DAG detail: ${node.id}.`);
    return Object.freeze({ id: node.id, label: node.label, detail: node.detail, parentIds: Object.freeze([...node.parentIds]) });
  });
  const byId = new Map(nodes.map(node => [node.id, node]));
  if (byId.size !== nodes.length) throw new Error('DAG node IDs must be unique.');
  const children = new Map<string, string[]>(nodes.map(node => [node.id, []]));
  const edges: DagEdge[] = [];
  for (const node of nodes) for (const parent of node.parentIds) {
    if (!byId.has(parent)) throw new Error(`Unknown DAG parent ${parent} for ${node.id}.`);
    if (parent === node.id) throw new Error(`DAG contains a cycle: ${parent} → ${parent}.`);
    children.get(parent)!.push(node.id);
    edges.push(Object.freeze({ id: `${encodeURIComponent(parent)}:${encodeURIComponent(node.id)}`, from: parent, to: node.id }));
  }
  if (edges.length > 2048) throw new Error('A DAG supports at most 2048 edges.');
  const indegrees = new Map(nodes.map(node => [node.id, node.parentIds.length]));
  const order: string[] = [];
  const remaining = new Set(byId.keys());
  while (remaining.size) {
    const ready = nodes.find(node => remaining.has(node.id) && indegrees.get(node.id) === 0);
    if (!ready) throw new Error(`DAG contains a cycle: ${findCycle(nodes, children).join(' → ')}.`);
    remaining.delete(ready.id); order.push(ready.id);
    for (const child of children.get(ready.id)!) indegrees.set(child, indegrees.get(child)! - 1);
  }
  const ranked: RankedDagNode[] = order.map((id, rank) => ({ ...byId.get(id)!, rank }));
  const graph = graphStratify().id((node: RankedDagNode) => node.id).parentIds((node: RankedDagNode) => node.parentIds)(ranked);
  const rowHeight = 44;
  const size = grid().nodeSize([24, rowHeight]).gap([0, 0]).rank((node: GraphNode<RankedDagNode, undefined>) => node.data.rank)(graph);
  const graphWidth = size.width + 16;
  const labelsWidth = Math.max(...nodes.map(node => Math.max(node.label.length * 15, (node.detail?.length ?? 0) * 12))) + 24;
  const nodeOrder = new Map(order.map((id, index) => [id, index]));
  const objects: GraphicObject[] = [];
  for (const link of graph.links()) {
    const from = link.source.data.id, to = link.target.data.id;
    const id = `${encodeURIComponent(from)}:${encodeURIComponent(to)}`;
    objects.push({ id: `edge:${id}`, kind: 'edge', meaning: `${byId.get(to)!.label} depends on ${byId.get(from)!.label}.`, edge: { id, fromOrder: nodeOrder.get(from)!, toOrder: nodeOrder.get(to)! }, primitives: [{ kind: 'path', d: roundedPath(link.points.map(([x, y]) => [x + 8, y])), stroke: 'muted', strokeRole: 'structure', fill: 'none' }] });
  }
  for (const node of graph.nodes()) {
    const datum = node.data;
    const primitives: GraphicPrimitive[] = [{ kind: 'circle', x: node.x + 8, y: node.y, radius: 4, fill: 'node-background', stroke: 'node-stroke', strokeRole: 'structure', role: 'node' }];
    primitives.push({ kind: 'text', x: graphWidth + 8, y: node.y + (datum.detail ? -2 : 5), lines: [datum.label], size: 15, leading: 18, font: 'body', fill: 'ink', label: true });
    if (datum.detail) primitives.push({ kind: 'text', x: graphWidth + 8, y: node.y + 12, lines: [datum.detail], size: 12, leading: 14, font: 'body', fill: 'muted' });
    objects.push({ id: `node:${datum.id}`, kind: 'node', node: { id: datum.id, order: datum.rank, label: datum.label }, meaning: datum.detail, primitives });
  }
  const description = input.description ?? nodes.map(node => `${node.label}${node.parentIds.length ? ` depends on ${node.parentIds.map(id => byId.get(id)!.label).join(', ')}` : ' is a root'}.`).join(' ');
  const scene = createGraphicScene({ id: input.id, title: input.title, description, bounds: { x: 0, y: 0, width: graphWidth + labelsWidth, height: size.height }, objects });
  const minimap = createGraphicScene({ ...scene, id: `${input.id}-minimap`, bounds: { ...scene.bounds, width: graphWidth }, objects: scene.objects.map(object => ({ ...object, primitives: object.primitives.filter(primitive => primitive.kind !== 'text') })) });
  return Object.freeze({ nodes: Object.freeze(nodes), edges: Object.freeze(edges), order: Object.freeze(order), scene, minimap, rowHeight });
}

function findCycle(nodes: readonly DagNode[], children: ReadonlyMap<string, readonly string[]>): string[] {
  const done = new Set<string>(), path: string[] = [];
  function visit(id: string): string[] | undefined {
    const index = path.indexOf(id);
    if (index >= 0) return [...path.slice(index), id];
    if (done.has(id)) return;
    path.push(id);
    for (const child of children.get(id)!) { const cycle = visit(child); if (cycle) return cycle; }
    path.pop(); done.add(id);
  }
  for (const node of nodes) { const cycle = visit(node.id); if (cycle) return cycle; }
  throw new Error('Unable to resolve DAG ordering.');
}

function roundedPath(points: readonly (readonly [number, number])[]): string {
  let path = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i], before = points[i - 1], after = points[i + 1];
    const incoming = Math.hypot(x - before[0], y - before[1]), outgoing = Math.hypot(after[0] - x, after[1] - y);
    if (!incoming || !outgoing) continue;
    const radius = Math.min(6, incoming / 2, outgoing / 2);
    path += ` L ${x + (before[0] - x) * radius / incoming} ${y + (before[1] - y) * radius / incoming} Q ${x} ${y} ${x + (after[0] - x) * radius / outgoing} ${y + (after[1] - y) * radius / outgoing}`;
  }
  return `${path} L ${points.at(-1)![0]} ${points.at(-1)![1]}`;
}

export function dagNeighborhood(dag: PreparedDag, id: string, scope: 'neighbors' | 'lineage' = 'neighbors'): DagNeighborhood {
  if (!dag.order.includes(id)) throw new Error(`Unknown DAG node: ${id}.`);
  if (!['neighbors', 'lineage'].includes(scope)) throw new Error(`Unknown DAG focus scope: ${scope}.`);
  function traverse(upstream: boolean) {
    const found = new Set<string>(), pending = [id];
    while (pending.length) {
      const current = pending.shift()!;
      for (const edge of dag.edges) if ((upstream ? edge.to : edge.from) === current) {
        const next = upstream ? edge.from : edge.to;
        if (!found.has(next)) { found.add(next); if (scope === 'lineage') pending.push(next); }
      }
    }
    return dag.order.filter(node => found.has(node));
  }
  const parents = traverse(true), children = traverse(false), upstream = new Set([id, ...parents]), downstream = new Set([id, ...children]);
  const edges = dag.edges.filter(edge => scope === 'neighbors' ? edge.from === id || edge.to === id : upstream.has(edge.from) && upstream.has(edge.to) || downstream.has(edge.from) && downstream.has(edge.to)).map(edge => edge.id);
  return Object.freeze({ parents: Object.freeze(parents), children: Object.freeze(children), edges: Object.freeze(edges) });
}

export function focusDagScene(dag: PreparedDag, id: string | undefined, scope: 'neighbors' | 'lineage' = 'neighbors', minimap = false): GraphicScene {
  const scene = minimap ? dag.minimap : dag.scene;
  if (id === undefined) return scene;
  const neighborhood = dagNeighborhood(dag, id, scope);
  const nodes = new Set([id, ...neighborhood.parents, ...neighborhood.children]), edges = new Set(neighborhood.edges);
  return createGraphicScene({ ...scene, objects: scene.objects.map(object => {
    const connected = object.node ? nodes.has(object.node.id) : object.edge?.id ? edges.has(object.edge.id) : false;
    return { ...object, state: { opacity: connected ? 1 : 0.2, reveal: 1, highlight: object.node?.id === id || Boolean(object.edge?.id && edges.has(object.edge.id)), x: 0, y: 0 } };
  }) });
}

export function createDagScene(input: DagInput): GraphicScene { return prepareDag(input).scene; }

/** Use the existing card-and-arrow diagram layout for a larger poster or slide. */
export function createDagDiagram(input: DagInput, direction: 'horizontal' | 'vertical' = 'horizontal'): GraphicScene {
  const dag = prepareDag(input);
  return createDiagramScene({ id: input.id, title: input.title, description: input.description, nodes: dag.order.map(id => { const node = dag.nodes.find(item => item.id === id)!; return { id, label: node.label, detail: node.detail }; }), edges: [...dag.edges], direction, layout: 'flow' });
}

/** Parents appear before their dependents, using the shared authored-time sampler. */
export function createDagReveal(dag: PreparedDag, step = 0.45, hold = 1) {
  if (!Number.isFinite(step) || step <= 0 || !Number.isFinite(hold) || hold < 0) throw new Error('DAG reveal needs a positive step and nonnegative hold.');
  const tracks: GraphicMotionTrack[] = [];
  dag.order.forEach((id, index) => {
    const start = index * step;
    tracks.push({ target: `node:${id}`, property: 'opacity', start, duration: step * 0.65, from: 0, to: 1, ease: 'smooth' });
    for (const edge of dag.edges.filter(edge => edge.to === id)) tracks.push({ target: `edge:${edge.id}`, property: 'reveal', start, duration: step * 0.65, from: 0, to: 1, ease: 'smooth' });
  });
  return defineGraphicMotion(dag.scene, { duration: dag.order.length * step + hold, tracks });
}

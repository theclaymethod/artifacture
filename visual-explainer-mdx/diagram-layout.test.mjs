import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutDiagram, mobileConnectorEdges } from './diagram-layout.ts';

// Fixture: a 6-node/3-lane swimlane graph. Ranks below were derived by
// RUNNING layoutDiagram against this fixture and hand-checking the result
// against computeRanks' longest-path-from-sources algorithm (n1 is the only
// node with no incoming edge; everything else's rank is its longest path
// distance from n1) — this is characterization of existing behavior, not a
// spec written from scratch.
const nodes = [
  { id: 'n1', label: 'N1', lane: 'a' },
  { id: 'n2', label: 'N2', lane: 'b' },
  { id: 'n3', label: 'N3', lane: 'c' },
  { id: 'n4', label: 'N4', lane: 'a' },
  { id: 'n5', label: 'N5', lane: 'b' },
  { id: 'n6', label: 'N6', lane: 'c' },
];
const edges = [
  { from: 'n1', to: 'n2', label: 'go' },
  { from: 'n2', to: 'n3', label: 'next' },
  { from: 'n1', to: 'n4', label: 'alt' },
  { from: 'n4', to: 'n5', label: 'then' },
  { from: 'n5', to: 'n6', label: 'finally' },
  { from: 'n3', to: 'n6' },
];
const lanes = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gamma' },
];

function rectsIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function nodeRect(node) {
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

function labelRect(label) {
  return { x: label.x - label.width / 2, y: label.y - label.height / 2, width: label.width, height: label.height };
}

test('ranks: 6-node/3-lane graph produces the expected topological rank assignment', () => {
  const diagram = layoutDiagram(nodes, edges, 'swimlane', lanes, undefined);
  const ranks = Object.fromEntries(diagram.nodes.map((node) => [node.id, node.rank]));
  assert.deepEqual(ranks, { n1: 0, n2: 1, n3: 2, n4: 1, n5: 2, n6: 3 });
});

test('label placement: an edge label never overlaps a node rect', () => {
  const diagram = layoutDiagram(nodes, edges, 'swimlane', lanes, undefined);
  const nodeRects = diagram.nodes.map(nodeRect);
  for (const edge of diagram.edges) {
    if (!edge.label) continue;
    const lr = labelRect(edge.label);
    for (const nr of nodeRects) {
      assert.equal(rectsIntersect(lr, nr), false, `label for ${edge.edge.from}->${edge.edge.to} overlaps a node rect`);
    }
  }
});

test('viewBox: computed width/height are positive and enclose all node rects', () => {
  const diagram = layoutDiagram(nodes, edges, 'swimlane', lanes, undefined);
  const { viewBox } = diagram;
  assert.ok(viewBox.width > 0, 'viewBox width must be positive');
  assert.ok(viewBox.height > 0, 'viewBox height must be positive');
  for (const node of diagram.nodes) {
    assert.ok(node.x >= viewBox.x, `node ${node.id} left edge is outside viewBox`);
    assert.ok(node.y >= viewBox.y, `node ${node.id} top edge is outside viewBox`);
    assert.ok(node.x + node.width <= viewBox.x + viewBox.width, `node ${node.id} right edge exceeds viewBox`);
    assert.ok(node.y + node.height <= viewBox.y + viewBox.height, `node ${node.id} bottom edge exceeds viewBox`);
  }
});

test('mobile variant: mobileConnectorEdges returns every edge exactly once across the flattened node order', () => {
  const diagram = layoutDiagram(nodes, edges, 'swimlane', lanes, undefined);
  const sortedNodes = [...diagram.nodes].sort((a, b) => a.rank - b.rank || a.order - b.order);
  const nodeOrder = new Map(sortedNodes.map((node, index) => [node.id, index]));
  const seen = new Map();
  for (let index = 0; index < sortedNodes.length - 1; index += 1) {
    for (const { edge } of mobileConnectorEdges(diagram.edges, nodeOrder, index)) {
      const key = `${edge.from}->${edge.to}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  assert.equal(seen.size, edges.length, 'expected exactly one connector slot per edge');
  for (const edge of edges) {
    const key = `${edge.from}->${edge.to}`;
    assert.equal(seen.get(key), 1, `edge ${key} should appear exactly once across connectors`);
  }
});

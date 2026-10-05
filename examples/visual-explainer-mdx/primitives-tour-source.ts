import { createDiagramScene } from '../../visual-explainer-mdx/diagram-scene';
import { createGraphicScene } from '../../visual-explainer-mdx/graphics-types';

export type SaveRequest = Readonly<{ value: string }>;
export type SaveStorage = Readonly<{ write(value: string): Promise<string> }>;

/** A small worked behavior, not a production API handler. */
export async function handleSave(request: SaveRequest, storage: SaveStorage) {
  const value = request.value.trim();
  if (!value) return { status: 400, body: 'Value required' };
  const result = await storage.write(value);
  return { status: 200, body: result };
}

const laidOut = createDiagramScene({
  id: 'save-request', title: 'A validated save request', direction: 'horizontal',
  nodes: [
    { id: 'request', label: 'Request', detail: 'Untrusted input' },
    { id: 'handler', label: 'Handler', detail: 'Validate first', ['shape']: 'diamond' },
    { id: 'storage', label: 'Storage', detail: 'Persist valid data' },
  ],
  edges: [
    { id: 'request-handler', from: 'request', to: 'handler', label: 'request / response', style: 'bidirectional' },
    { id: 'handler-storage', from: 'handler', to: 'storage', label: 'write / result', style: 'bidirectional' },
  ],
});

export const saveDiagram = createGraphicScene({ ...laidOut, objects: laidOut.objects.map(object => ({ ...object, primitives: object.primitives.map(primitive => primitive.kind === 'text' ? { ...primitive, size: primitive.label ? 20 : 16 } : primitive) })) });

function nodeCenter(id: string): number {
  const object = saveDiagram.objects.find(candidate => candidate.node?.id === id);
  if (!object) throw new Error(`Missing worked-example node: ${id}`);
  const outline = object.primitives[0];
  if (outline.kind === 'rect') return outline.x + outline.width / 2;
  if (outline.kind === 'polygon') return outline.points.reduce((sum, point) => sum + point.x, 0) / outline.points.length;
  throw new Error(`Unsupported worked-example outline: ${id}`);
}

export const packetOffsets = {
  request: 0,
  handler: nodeCenter('handler') - nodeCenter('request'),
  storage: nodeCenter('storage') - nodeCenter('request'),
};

export const saveScene = createGraphicScene({
  ...saveDiagram,
  objects: [...saveDiagram.objects, {
    id: 'packet', kind: 'illustration', meaning: 'The packet indicator identifies the current owner of the request or returning result.',
    state: { opacity: 0, reveal: 1, highlight: false, x: 0, y: 0 },
    primitives: [
      { kind: 'circle', x: nodeCenter('request'), y: 22, radius: 9, fill: 'accent' },
      { kind: 'line', x1: nodeCenter('request'), x2: nodeCenter('request'), y1: 33, y2: 54, stroke: 'accent', strokeRole: 'detail' },
    ],
  }],
});

export const handlerCode = [
  'async function handleSave(request, storage) {',
  '  const value = request.value.trim();',
  "  if (!value) return { status: 400, body: 'Value required' };",
  '  const result = await storage.write(value);',
  '  return { status: 200, body: result };',
  '}',
];

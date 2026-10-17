import { createGraphicScene, type GraphicObject, type GraphicPrimitive } from '../../visual-explainer-mdx/graphics-types';
import { createHairlineScene } from '../../visual-explainer-mdx/hairline-scene';
import { createVectorTrack } from '../../visual-explainer-mdx/authored-values';
import { composeGraphics } from '../../visual-explainer-mdx/graphics-composition';
import { createGridScene, createPlotScene, createSequenceScene } from '../../visual-explainer-mdx/teaching-scenes';
import { defineGraphicMotion, sampleScene } from '../../visual-explainer-mdx/graphic-motion';
import { prepareGraphicRoute } from '../../visual-explainer-mdx/graphic-routes';
import { followPath } from '../../visual-explainer-mdx/teaching-motion';
import { agentSolids, agentCenters } from './showcase-hairline';

const text = (x: number, y: number, value: string, size = 22, font: 'body' | 'math' | 'mono' = 'body'): GraphicPrimitive => ({ kind: 'text', x, y, lines: [value], size, leading: size * 1.3, anchor: 'middle', fill: 'ink', font });
const clampTime = (time: number, duration: number) => {
  if (!Number.isFinite(time) || time < 0) throw new Error('Showcase time must be finite and nonnegative.');
  return Math.min(time, duration);
};
const route = ['request', 'agent', 'memory', 'agent', 'tool', 'review', 'result'] as const;
export const agentBeats = [
  { time: 0, label: 'Receive the request', explanation: 'The request enters a workspace shared by the agent, its memory, and its tools.' },
  { time: 1.4, label: 'Plan the next step', explanation: 'The agent decides what evidence it needs before acting.' },
  { time: 2.8, label: 'Retrieve context', explanation: 'Memory contributes context; it does not execute the tool.' },
  { time: 4, label: 'Choose a tool', explanation: 'The agent uses that context to choose a concrete action.' },
  { time: 5.3, label: 'Run the tool', explanation: 'A tool performs the action and returns an observable result.' },
  { time: 6.7, label: 'Check the result', explanation: 'A review boundary checks the output before it becomes the response.' },
  { time: 8, label: 'Return the answer', explanation: 'The checked result leaves the workspace.' },
] as const;
const agentBase = createHairlineScene({ id: 'agent-workspace', title: 'A tool-using agent', description: 'Prepared isometric solids represent a request, agent, memory, tool, review boundary, and result.', solids: agentSolids });
const agentRoute = prepareGraphicRoute({
  start: { x: agentCenters[route[0]][0], y: agentCenters[route[0]][1] },
  segments: route.slice(1).map(id => ({ kind: 'line', to: { x: agentCenters[id][0], y: agentCenters[id][1] } })),
});
const agentScene = createGraphicScene({ ...agentBase, objects: [
  { id: 'route', kind: 'illustration', primitives: [{ kind: 'path', d: agentRoute.d, fill: 'none', stroke: 'frame', strokeRole: 'guide', dash: '2 4' }] },
  ...agentBase.objects,
  { id: 'request-carrier', kind: 'illustration', meaning: 'The active request moves between owners.', primitives: [{ kind: 'circle', x: 0, y: 0, radius: 3.5, fill: 'accent' }] },
] });
const agentMotion = followPath(agentScene, { duration: 9, target: 'request-carrier', route: agentRoute, initialFocus: route[0], traversal: {
  mode: 'timestamp', ease: 'smooth', keys: agentBeats.map((beat, index) => ({ at: beat.time, distance: agentRoute.cumulativeLengths[index] / agentRoute.length, focus: route[index] })),
} });

export function sampleAgent(time: number) {
  const t = clampTime(time, 9);
  const beat = agentBeats.reduce<number>((latest, candidate, index) => candidate.time <= t ? index : latest, 0);
  return { beat, scene: sampleScene(agentScene, agentMotion, t) };
}

export const attentionWords = ['The', 'robot', 'moved', 'because', 'it', 'needed', 'space'] as const;
const keys = [[.1, .1], [1, .35], [-.45, .45], [-.45, 0], [.1, .4], [-.2, .45], [-.85, .2]] as const;
const queryTrack = createVectorTrack([[0, [-.45, .8]], [3.5, [.45, .65]], [7, [1, .35]], [9, [1, .35]]]);
export function sampleAttention(time: number, narrow = false) {
  const t = clampTime(time, 9), query = queryTrack(t);
  const scores = keys.map(key => (key[0] * query[0] + key[1] * query[1]) * 4 / Math.sqrt(2));
  const max = Math.max(...scores), exp = scores.map(score => Math.exp(score - max));
  const total = exp.reduce((sum, value) => sum + value, 0), weights = exp.map(value => value / total);
  const winner = weights.indexOf(Math.max(...weights));
  const width = narrow ? 620 : 680, height = narrow ? 570 : 380;
  const positions = attentionWords.map((_, i) => narrow ? { x: 80 + i % 4 * 150, y: 240 + Math.floor(i / 4) * 160 } : { x: 55 + i * 95, y: 255 });
  const objects: GraphicObject[] = positions.map((p, i) => ({ id: `attention:${i}`, kind: 'illustration', meaning: `Attention to ${attentionWords[i]} is ${weights[i].toFixed(3)}`, state: { opacity: .2 + .8 * weights[i] / weights[winner], reveal: 1, highlight: i === winner, x: 0, y: 0 }, primitives: [{ kind: 'path', d: `M ${width / 2} 128 Q ${p.x} 170 ${p.x} ${p.y - 30}`, fill: 'none', stroke: i === winner ? 'accent' : 'muted', strokeRole: i === winner ? 'active' : 'detail', arrow: 'end' }] }));
  objects.push({ id: 'query', kind: 'illustration', primitives: [{ kind: 'circle', x: width / 2, y: 90, radius: 38, fill: 'accent-background', stroke: 'accent' }, text(width / 2, 100, 'q(it)', 30, 'math')] });
  positions.forEach((p, i) => objects.push({ id: `word:${i}`, kind: 'illustration', primitives: [
    { kind: 'circle', x: p.x, y: p.y, radius: 27, fill: i === winner ? 'accent-background' : 'background', stroke: i === winner ? 'accent' : 'muted', strokeRole: i === winner ? 'active' : 'detail' },
    text(p.x, p.y + 8, weights[i].toFixed(2), 21, 'math'), text(p.x, p.y + 58, attentionWords[i], narrow ? 24 : 20),
  ] }));
  const network = createGraphicScene({ id: 'attention-network', title: 'Attention follows a changing query', description: 'A toy two-dimensional query is compared with seven fixed key vectors. The line opacity and numeric weights show the same normalized softmax values.', bounds: { x: 0, y: 0, width, height }, objects });
  const grid = createGridScene({ id: 'attention-values', title: 'Normalized attention weights', description: 'Each cell fills to the calculated attention weight for the corresponding word.', columns: 7, domain: [0, 1], cells: attentionWords.map((word, i) => ({ id: word, value: weights[i] })) });
  const scene = composeGraphics({ id: 'attention-example', title: network.title, description: network.description, duration: 9, bounds: { x: 0, y: 0, width, height: height + 110 }, instances: [
    { id: 'network', scene: network, frame: { x: 0, y: 0, width, height }, clip: 'frame' },
    { id: 'weights', scene: grid, frame: { x: 40, y: height - 5, width: width - 80, height: 100 }, clip: 'frame' },
  ] }).scene;
  return { scene, weights, winner, query };
}

export const quantityBefore = 'const quantity = request.quantity || 1;\nawait storage.write({ quantity });';
export const quantityAfter = 'const quantity = request.quantity ?? 1;\nawait storage.write({ quantity });';
export function evaluateQuantity(raw: string, fixed: boolean) {
  const value = raw.trim() === '' ? null : Number(raw);
  if (value !== null && (!Number.isFinite(value) || value < 0)) return { valid: false as const, value: null, result: null };
  return { valid: true as const, value, result: fixed ? value ?? 1 : value || 1 };
}
export function sampleReview(time: number, raw: string, fixed: boolean) {
  const t = clampTime(time, 6), evaluation = evaluateQuantity(raw, fixed);
  const value = evaluation.value === null ? 'null' : String(evaluation.value);
  const messages = evaluation.valid ? [
    { id: 'request', from: 'client', to: 'handler', label: `quantity: ${value}` },
    { id: 'write', from: 'handler', to: 'storage', label: `write quantity: ${evaluation.result}` },
    { id: 'result', from: 'storage', to: 'handler', label: 'stored', dashed: true },
  ] : [
    { id: 'request', from: 'client', to: 'handler', label: `quantity: ${raw}` },
    { id: 'result', from: 'handler', to: 'client', label: 'Invalid example input', dashed: true },
  ];
  const base = createSequenceScene({ id: 'quantity-review', title: 'Trace the exact quantity written', description: 'Client sends a quantity. The handler applies its defaulting operator and writes the result to storage. The example accepts nonnegative finite inputs.', participants: [{ id: 'client', label: 'Client' }, { id: 'handler', label: 'Handler' }, { id: 'storage', label: 'Storage' }], messages });
  const motion = defineGraphicMotion(base, { duration: 6, tracks: messages.flatMap(({id}, i) => [
    { target: `message:${id}`, property: 'reveal' as const, start: .25 + i * 1.6, duration: .75, from: 0, to: 1, ease: 'smooth' as const },
    { target: `message-label:${id}`, property: 'opacity' as const, start: .25 + i * 1.6, duration: .35, from: 0, to: 1 },
  ]) });
  return { scene: sampleScene(base, motion, t), evaluation };
}

export function sampleWave(time: number, narrow = false) {
  const t = clampTime(time, 9), theta = t / 9 * Math.PI * 2;
  const cx = 180, cy = 195, r = 118, x = cx + Math.cos(theta) * r, y = cy - Math.sin(theta) * r;
  const circle = createGraphicScene({ id: 'rotating-vector', title: 'A rotating vector makes a sine wave', description: 'The vertical projection of a unit vector at angle theta equals sine theta.', bounds: { x: 0, y: 0, width: 380, height: 400 }, objects: [
    { id: 'axes', kind: 'illustration', primitives: [{ kind: 'line', x1: 25, x2: 335, y1: cy, y2: cy, stroke: 'frame', strokeRole: 'guide' }, { kind: 'line', x1: cx, x2: cx, y1: 40, y2: 350, stroke: 'frame', strokeRole: 'guide' }] },
    { id: 'unit-circle', kind: 'illustration', primitives: [{ kind: 'circle', x: cx, y: cy, radius: r, fill: 'none', stroke: 'muted', strokeRole: 'detail' }] },
    { id: 'vector', kind: 'illustration', primitives: [{ kind: 'path', d: `M ${cx} ${cy} L ${x} ${y}`, fill: 'none', stroke: 'ink', arrow: 'end' }] },
    { id: 'projection', kind: 'illustration', primitives: [{ kind: 'path', d: `M ${x} ${y} H ${cx}`, fill: 'none', stroke: 'muted', dash: '4 5', strokeRole: 'guide' }, { kind: 'line', x1: cx, x2: cx, y1: cy, y2: y, stroke: 'accent', strokeRole: 'active' }, { kind: 'circle', x, y, radius: 5, fill: 'accent' }] },
    { id: 'equation', kind: 'illustration', primitives: [text(190, 380, `y = sin θ = ${Math.sin(theta).toFixed(2)}`, 27, 'math')] },
  ] });
  const points = Array.from({ length: Math.floor(theta / (Math.PI * 2) * 180) + 1 }, (_, i) => ({ x: i / 180 * Math.PI * 2, y: Math.sin(i / 180 * Math.PI * 2) }));
  if (points.at(-1)!.x !== theta) points.push({ x: theta, y: Math.sin(theta) });
  const originalPlot = createPlotScene({ id: 'sine-trace', title: 'Vertical projection over angle', description: 'The growing line is calculated directly from sine theta, using the same angle as the rotating vector.', xLabel: 'Angle θ (radians)', yLabel: 'Vertical projection', xDomain: [0, 6.3], yDomain: [-1, 1], series: [{ id: 'projection', label: 'The same vertical projection', emphasis: true, points }] });
  const plot = createGraphicScene({ ...originalPlot, objects: originalPlot.objects.filter(object => object.id !== 'points:projection').map(object => ({ ...object, primitives: object.primitives.map(primitive => primitive.kind === 'text' ? { ...primitive, size: narrow ? 26 : 24, leading: 30 } : primitive) })) });
  return { theta, value: Math.sin(theta), scene: composeGraphics({ id: 'circle-to-wave', title: circle.title, description: circle.description, duration: 9, bounds: { x: 0, y: 0, width: narrow ? 480 : 1040, height: narrow ? 800 : 430 }, instances: [
    { id: 'circle', scene: circle, frame: { x: 0, y: 0, width: narrow ? 480 : 380, height: 400 }, clip: 'frame' },
    { id: 'trace', scene: plot, frame: narrow ? { x: 0, y: 410, width: 480, height: 380 } : { x: 400, y: 10, width: 640, height: 400 }, clip: 'frame' },
  ] }).scene };
}

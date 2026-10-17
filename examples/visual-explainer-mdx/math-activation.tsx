import React from 'react';
import { composeGraphics, createGraphicScene, createSlideScene, defineGraphicMotion, GraphicSlide, GraphicVideo, sampleSlideSequence, sequenceSlides, type GraphicObject, type GraphicPrimitive } from '../../visual-explainer-mdx/components';
import themes from '../../visual-explainer-mdx/themes.css?raw';
import motionTheme from '../../plugins/visual-explainer/templates/iso-motion-theme.css?raw';

const symbol = (x: number, y: number, label: string, size = 32): GraphicPrimitive => ({ kind: 'text', x, y, lines: [label], leading: size * 1.2, size, anchor: 'middle', fill: 'ink', font: 'math' });
const points = [
  { id: 'input-one', label: '𝑥₁', x: 110, y: 150, radius: 38 },
  { id: 'input-two', label: '𝑥₂', x: 110, y: 335, radius: 38 },
  { id: 'bias', label: '𝑏', x: 300, y: 390, radius: 26 },
  { id: 'sum', label: '𝑧', x: 430, y: 240, radius: 55 },
  { id: 'activation', label: 'ℎ', x: 910, y: 240, radius: 55 },
];

function connection(id: string, fromOrder: number, toOrder: number): GraphicObject {
  const from = points[fromOrder];
  const to = points[toOrder];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const start = { x: from.x + dx / distance * (from.radius + 2), y: from.y + dy / distance * (from.radius + 2) };
  const end = { x: to.x - dx / distance * (to.radius + 2), y: to.y - dy / distance * (to.radius + 2) };
  return { id, kind: 'edge', edge: { id, fromOrder, toOrder }, primitives: [{ kind: 'path', d: `M ${start.x} ${start.y} L ${end.x} ${end.y}`, fill: 'none', stroke: 'ink', strokeRole: 'structure', arrow: 'end' }] };
}

export const weightedNeuron = createGraphicScene({
  id: 'weighted-neuron', title: 'Weighted inputs and a bias produce an activation',
  description: 'Multiply x₁ by w₁ and x₂ by w₂. Add these products and bias b to obtain z. The sigmoid σ maps z to activation h, between zero and one.',
  bounds: { x: 0, y: 0, width: 1000, height: 590 },
  objects: [
    connection('weight-one', 0, 3), connection('weight-two', 1, 3), connection('bias-contribution', 2, 3), connection('activation-route', 3, 4),
    ...points.map((point, order): GraphicObject => ({
      id: point.id, kind: 'node', node: { id: point.id, order, label: point.label },
      primitives: [
        { kind: 'circle', x: point.x, y: point.y, radius: point.radius, fill: 'node-background', stroke: 'node-stroke', strokeRole: point.id === 'activation' ? 'active' : 'structure', role: 'node' },
        symbol(point.x, point.y + 10, point.label),
      ],
    })),
    { id: 'headings', kind: 'illustration', primitives: [symbol(110, 58, 'Inputs', 28), symbol(430, 58, 'Weighted sum', 28), symbol(910, 58, 'Activation', 28)] },
    { id: 'weight-one-label', kind: 'illustration', primitives: [symbol(260, 164, '𝑤₁', 28)] },
    { id: 'weight-two-label', kind: 'illustration', primitives: [symbol(260, 330, '𝑤₂', 28)] },
    { id: 'bias-label', kind: 'illustration', primitives: [symbol(300, 448, 'Bias', 26)] },
    { id: 'function-label', kind: 'illustration', primitives: [symbol(670, 214, 'σ', 32)] },
    { id: 'sum-equation', kind: 'illustration', primitives: [symbol(290, 542, '𝑧 = 𝑤₁𝑥₁ + 𝑤₂𝑥₂ + 𝑏', 32)] },
    { id: 'activation-equation', kind: 'illustration', primitives: [symbol(800, 542, 'ℎ = σ(𝑧)', 32)] },
  ],
});

const neuronMotion = defineGraphicMotion(weightedNeuron, { duration: 12, tracks: [
  { target: 'weight-one', property: 'reveal', start: 1, duration: 1.2, from: 0, to: 1, ease: 'smooth' },
  { target: 'weight-one-label', property: 'opacity', start: 1.8, duration: 0.4, from: 0, to: 1 },
  { target: 'weight-two', property: 'reveal', start: 2.4, duration: 1.2, from: 0, to: 1, ease: 'smooth' },
  { target: 'weight-two-label', property: 'opacity', start: 3.2, duration: 0.4, from: 0, to: 1 },
  { target: 'bias-contribution', property: 'reveal', start: 3.8, duration: 0.8, from: 0, to: 1 },
  { target: 'sum', property: 'highlight', start: 4.6, duration: 0.3, from: 0, to: 1 },
  { target: 'sum', property: 'highlight', start: 9.3, duration: 0.3, from: 1, to: 0 },
  { target: 'sum-equation', property: 'opacity', start: 4.8, duration: 0.5, from: 0, to: 1 },
  { target: 'function-label', property: 'opacity', start: 6, duration: 0.4, from: 0, to: 1 },
  { target: 'activation-route', property: 'reveal', start: 7.4, duration: 1.4, from: 0, to: 1, ease: 'smooth' },
  { target: 'activation', property: 'opacity', start: 8.8, duration: 0.5, from: 0, to: 1 },
  { target: 'activation', property: 'highlight', start: 9.3, duration: 0.3, from: 0, to: 1 },
  { target: 'activation-equation', property: 'opacity', start: 9.3, duration: 0.5, from: 0, to: 1 },
] });

const sigmoidPath = Array.from({ length: 81 }, (_, index) => {
  const z = -4 + index / 10;
  const x = 44 + (z + 4) / 8 * 272;
  const y = 166 - 132 / (1 + Math.exp(-z));
  return `${index ? 'L' : 'M'} ${x} ${y}`;
}).join(' ');

export const sigmoid = createGraphicScene({
  id: 'sigmoid-function', title: 'Sigmoid maps the sum to an activation',
  description: 'The curve h = σ(z) = 1 / (1 + exp(−z)) increases from near zero to near one as z increases. At z = 0, h is 0.5.',
  bounds: { x: 0, y: 0, width: 360, height: 220 },
  objects: [
    { id: 'axes', kind: 'illustration', primitives: [
      { kind: 'line', x1: 44, x2: 326, y1: 166, y2: 166, stroke: 'muted', strokeRole: 'guide' },
      { kind: 'line', x1: 180, x2: 180, y1: 26, y2: 170, stroke: 'muted', strokeRole: 'guide' },
      symbol(44, 195, '−4', 22), symbol(180, 195, '0', 22), symbol(316, 195, '4', 22), symbol(344, 171, '𝑧', 24),
      symbol(160, 40, '1', 22), symbol(160, 166, '0', 22), symbol(180, 22, 'ℎ = σ(𝑧)', 24),
    ] },
    { id: 'curve', kind: 'illustration', primitives: [{ kind: 'path', d: sigmoidPath, fill: 'none', stroke: 'accent', strokeRole: 'data' }] },
  ],
});
const sigmoidMotion = defineGraphicMotion(sigmoid, { duration: 12, tracks: [
  { target: 'axes', property: 'opacity', start: 6, duration: 0.4, from: 0, to: 1 },
  { target: 'curve', property: 'reveal', start: 6.4, duration: 1.4, from: 0, to: 1, ease: 'smooth' },
] });

export const activation = composeGraphics({
  id: 'neuron-activation', title: weightedNeuron.title, description: `${weightedNeuron.description} ${sigmoid.description}`,
  bounds: weightedNeuron.bounds, duration: 12,
  instances: [
    { id: 'neuron', scene: weightedNeuron, motion: neuronMotion, frame: weightedNeuron.bounds, clip: 'frame' },
    { id: 'function', scene: sigmoid, motion: sigmoidMotion, frame: { x: 570, y: 304, width: 360, height: 205 }, clip: 'frame' },
  ],
});
export const activationSlide = createSlideScene({
  id: 'how-a-neuron-combines-inputs', preset: '3b1b', appearance: 'dark', graphic: activation.scene,
  title: 'How a neuron combines inputs',
  explanation: 'Multiply each input by a weight, add a bias, then turn the sum into an activation.',
});
export const sequence = sequenceSlides('math-activation', [{ slide: activationSlide, motion: activation.motion, duration: 12 }]);

export function ActivationPoster() {
  return <><style>{themes + motionTheme}</style><GraphicSlide slide={sampleSlideSequence(sequence, sequence.duration)} /></>;
}
export default function MathActivation() {
  return <><style>{themes + motionTheme}</style><GraphicVideo sequence={sequence} /></>;
}

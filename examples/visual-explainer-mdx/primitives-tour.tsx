import React from 'react';
import { createGraphicScene, type GraphicScene, type GraphicObject } from '../../visual-explainer-mdx/graphics-types';
import { defineGraphicMotion, sampleScene, type GraphicMotionTrack } from '../../visual-explainer-mdx/graphic-motion';
import { composeGraphics, type GraphicComposition } from '../../visual-explainer-mdx/graphics-composition';
import { createSlideScene, sequenceSlides } from '../../visual-explainer-mdx/graphic-slides';
import { GraphicVideo } from '../../visual-explainer-mdx/graphic-video';
import { saveDiagram, saveScene, packetOffsets, handlerCode } from './primitives-tour-source';

type PhaseEvents = Readonly<{ introduce?: number; arrive: number; validate: number; write: number; result: number; response: number; departValidate?: number; departWrite?: number; departResult?: number; departResponse?: number }>;
type TourSettings = Readonly<{ durations: readonly number[]; events?: Readonly<{ behavior: PhaseEvents; motion: PhaseEvents }> }>;
type TourRuntime = typeof globalThis & { process?: { env?: { ARTIFACTURE_TOUR_TIMING?: string } } };
// SAFETY: Node supplies this environment boundary; optional reads also support browsers without process.
const configuredTiming = (globalThis as TourRuntime).process?.env?.ARTIFACTURE_TOUR_TIMING;
const settings: TourSettings = configuredTiming ? JSON.parse(configuredTiming) : { durations: [12, 21, 20, 23, 22, 20, 19, 12, 18] };
if (settings.durations.length !== 9 || settings.durations.some(value => !Number.isFinite(value) || value < 2)) throw new Error('The worked tutorial needs nine finite phase durations.');
const durations = settings.durations;
const bounds = { x: 0, y: 0, width: 1200, height: 550 };
const serviceFrame = { x: 0, y: 0, width: 1200, height: 250 };
const codeFrame = { x: 0, y: 288, width: 1200, height: 250 };
const ids = ['node:request', 'node:handler', 'node:storage'];

function panel(id: string, lines: readonly string[], font: 'mono' | 'body' = 'mono'): GraphicScene {
  const objects = lines.map((line, index): GraphicObject => {
    const content = line.trimStart();
    const indentation = font === 'mono' ? (line.length - content.length) * 15 : 0;
    return { id: `line:${index}`, kind: 'illustration', primitives: [{ kind: 'text', x: 14 + indentation, y: 34 + index * 38, lines: [content], leading: 38, size: font === 'mono' ? 25 : 28, fill: 'ink', font }] };
  });
  return createGraphicScene({ id, title: 'The code and result share stable identities', description: lines.join(' '), bounds: { x: 0, y: 0, width: 1200, height: 250 }, objects });
}

function packetMotion(duration: number, events?: PhaseEvents) {
  const timing = events ?? { arrive: duration * .12, validate: duration * .27, write: duration * .47, result: duration * .68, response: duration * .82 };
  const travel = Math.min(1.25, duration * .06);
  const tracks: GraphicMotionTrack[] = [
    { target: 'packet', property: 'opacity', start: timing.introduce ?? Math.max(0, timing.arrive - .45), duration: .35, from: 0, to: 1 },
    { target: 'edge:request-handler', property: 'reveal', start: timing.arrive, duration: .75, from: 0, to: 1, ease: 'smooth' },
    { target: 'edge:handler-storage', property: 'reveal', start: timing.write - .75, duration: .75, from: 0, to: 1, ease: 'smooth' },
    { target: ids[0], property: 'highlight', start: 0, duration: .01, from: 1, to: 1 },
  ];
  for (const [end, departure, from, to] of [[timing.validate, timing.departValidate, 0, packetOffsets.handler], [timing.write, timing.departWrite, packetOffsets.handler, packetOffsets.storage], [timing.result, timing.departResult, packetOffsets.storage, packetOffsets.handler], [timing.response, timing.departResponse, packetOffsets.handler, 0]] as const) {
    const start = departure ?? end - travel;
    tracks.push({ target: 'packet', property: 'translation', start, duration: end - start, from: { x: from, y: 0 }, to: { x: to, y: 0 }, ease: 'smooth' });
  }
  for (const [at, from, to] of [[timing.validate, ids[0], ids[1]], [timing.write, ids[1], ids[2]], [timing.result, ids[2], ids[1]], [timing.response, ids[1], ids[0]]] as const) {
    tracks.push({ target: from, property: 'highlight', start: at, duration: .2, from: 1, to: 0 }, { target: to, property: 'highlight', start: at, duration: .2, from: 0, to: 1 });
  }
  return defineGraphicMotion(saveScene, { duration, tracks });
}

function layout(id: string, graphic: GraphicScene, lines: readonly string[], duration: number, motion?: ReturnType<typeof packetMotion>, font: 'mono' | 'body' = 'mono'): GraphicComposition {
  return composeGraphics({ id, title: 'One explanation built from the same scene', description: 'The request, handler, storage, connectors, and labels retain their local identities in every composition.', bounds, duration, instances: [
    { id: 'service', scene: graphic, motion, frame: serviceFrame, clip: 'frame' },
    { id: 'code', scene: panel(id + '-code', lines, font), frame: codeFrame, clip: 'frame' },
  ] });
}

const finalPose = sampleScene(saveScene, packetMotion(12), 12);
const constructionCode = [
  "const scene = createDiagramScene({ id: 'save-request',",
  "  nodes: [{ id: 'request', ... }, { id: 'handler', ... },",
  "          { id: 'storage', ... }],",
  "  edges: [{ id: 'request-handler', from: 'request', to: 'handler' },",
  "          { id: 'handler-storage', from: 'handler', to: 'storage' }],",
  '});',
];
const motionCode = [
  'defineGraphicMotion(saveScene, { duration, tracks: [',
  "  { target: 'packet', property: 'translation', start,",
  '    duration: travel, from: { x: 0, y: 0 },',
  '    to: { x: packetOffsets.handler, y: 0 }, ease: \'smooth\' },',
  "  // reveal edges; transfer focus to 'node:handler'",
  '] });',
];
const phases = [
  { id: 'question', title: 'Why must a request go through a handler?', explanation: 'A save request carries untrusted input. Build an explanation that makes the check visible.', graphic: saveDiagram, lines: ["Request: { value: 'notes' }", 'What stops an invalid value from reaching storage?', 'We will follow one request, then build its explanation.'], font: 'body' as const },
  { id: 'behavior', title: 'Validation comes before the write', explanation: 'The packet marks its current owner. A result returns through the handler to become a response.', graphic: saveScene, lines: handlerCode, motion: packetMotion(durations[1], settings.events?.behavior) },
  { id: 'discovery', title: 'Find the existing block before drawing', explanation: 'The index describes the builder, layouts, imports, and constraints. Its copy command brings the leaf into your workspace.', graphic: finalPose, lines: ['artifacture list --query diagram --json', '', 'createDiagramScene  →  nodes, routed edges, labels', 'flow / tree / swimlane / timeline', '', 'artifacture add diagram --cwd .'] },
  { id: 'construction', title: 'Name concepts and relationships once', explanation: 'These local IDs bind the code, node geometry, routed paths, and labels. Composition carries them together.', graphic: saveDiagram, lines: constructionCode },
  { id: 'motion', title: 'Make the packet explain the causal path', explanation: 'Arrive → validate → write → result → response. Focus changes when the packet reaches its next owner.', graphic: saveScene, lines: motionCode, motion: packetMotion(durations[4], settings.events?.motion) },
  { id: 'clock', title: 'A frame is a function of authored time', explanation: 'A target, start, duration, and easing define a bounded change. The same time produces the same pose.', graphic: finalPose, lines: ['const pose = sampleScene(saveScene, motion, authoredSeconds);', '', "// 'packet' and 'node:handler' keep their identities", '// Seeking backward samples the same stored geometry.', '// No hidden timer or idle animation changes the result.'] },
  { id: 'delivery', title: 'Reuse the scene through each format', explanation: 'Composition fits it. A slide adds readable context. Video sequences those slides on the same authored clock.', graphic: finalPose, lines: ['composeGraphics({ instances: [{ scene: saveScene, frame, ... }] });', 'createSlideScene({ graphic: composition.scene, title, explanation });', 'sequenceSlides(\'save-tutorial\', [{ slide, motion, duration }]);', '', 'GraphicCanvas → poster / diagram', 'GraphicSlide → slide     GraphicVideo → finite video'] },
  { id: 'themes', title: 'The same explanation uses four appearances', explanation: 'Only the renderer’s theme roles change. Request, handler, storage, their labels, and the returning packet retain their geometry.', graphic: finalPose, lines: ["scene.id = 'save-request'", "objects: 'node:request', 'node:handler', 'node:storage', 'packet'", '', 'Theme roles: ink, surface, accent, typography'], font: 'body' as const },
  { id: 'transfer', title: 'Carry the worked example into a workspace', explanation: 'Scaffold, copy the required leaves, and replace the content. Keep the same scene, motion, composition, and delivery contracts.', graphic: finalPose, lines: ['artifacture init my-explainer', 'artifacture add diagram motion composition slides video --cwd my-explainer', '', 'cd my-explainer', 'npm install', 'npm install gsap@3.14.2'] },
];

export const sequence = sequenceSlides('artifacture-blocks-explainer', phases.flatMap((phase, index) => {
  const duration = durations[index];
  if (phase.id === 'clock') {
    const starts = [0, duration * .445, duration * .7, duration];
    return [6, 2, 6].map((time, index) => {
      const sampled = sampleScene(saveScene, packetMotion(12), time);
      const lines = [`sampleScene(saveScene, motion, ${time});`, '', time === 2 ? 'Seek backward: the packet returns to its earlier owner.' : index === 2 ? 'Sample 6 again: same packet position, same focus, same IDs.' : 'At 6 seconds: the packet is at storage.', '', 'Each pose is sampled from the same finite motion contract.'];
      const frame = layout('clock-' + index, sampled, lines, starts[index + 1] - starts[index]);
      const slide = createSlideScene({ id: 'clock-' + index, title: phase.title, explanation: phase.explanation, graphic: frame.scene });
      return { slide, motion: frame.motion, duration: starts[index + 1] - starts[index] };
    });
  }
  const composition = layout(phase.id, phase.graphic, phase.lines, duration, phase.motion, phase.font);
  const variants = phase.id === 'themes' ? ['iso', '3b1b', 'mono-color', 'algebrica'] : ['iso'];
  return variants.map((preset) => {
    const appearance = preset === '3b1b' ? 'dark' : 'light';
    const slide = createSlideScene({ id: phase.id + (variants.length > 1 ? '-' + preset : ''), title: phase.title, explanation: phase.id === 'themes' ? `${preset === 'mono-color' ? 'Mono Color' : preset === 'algebrica' ? 'Algebrica' : preset === '3b1b' ? '3b1b' : 'ISO'} changes the appearance; every local object ID and relationship stays the same.` : phase.explanation, graphic: composition.scene, preset, appearance });
    return { slide, motion: variants.length > 1 ? defineGraphicMotion(composition.scene, { duration: duration / 4, tracks: [] }) : composition.motion, duration: duration / variants.length };
  });
}));

export default function PrimitivesTour() { return <GraphicVideo sequence={sequence} />; }

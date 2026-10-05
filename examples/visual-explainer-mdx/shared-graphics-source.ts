import { composeGraphics, createDiagramScene, createSlideScene, defineGraphicMotion, sequenceSlides } from '../../visual-explainer-mdx/components';

export const block = createDiagramScene({
  id: 'shared-explainer-foundation', title: 'Graphics compose diagrams, slides, and video', direction: 'horizontal',
  description: 'Graphics primitives form diagrams. Diagrams compose readable slides. A finite sequence of those slides forms a video. The same diagram objects keep their identity in each output.',
  nodes: [
    { id: 'graphics', label: 'Graphics', detail: 'Shapes, paths, and readable text', ['shape']: 'oval' },
    { id: 'diagrams', label: 'Diagrams', detail: 'Objects and their relationships' },
    { id: 'slides', label: 'Slides', detail: 'A complete explanation in a frame' },
    { id: 'video', label: 'Video', detail: 'The same scenes over authored time', ['shape']: 'oval' },
  ],
  edges: [
    { id: 'graphics-diagrams', from: 'graphics', to: 'diagrams' },
    { id: 'diagrams-slides', from: 'diagrams', to: 'slides' },
    { id: 'slides-video', from: 'slides', to: 'video' },
  ],
});
const blockMotion = defineGraphicMotion(block, {
  duration: 16,
  tracks: [
    { target: 'edge:graphics-diagrams', property: 'reveal', start: 1, duration: 2, from: 0, to: 1, ease: 'smooth' },
    { target: 'edge:diagrams-slides', property: 'reveal', start: 4, duration: 2, from: 0, to: 1, ease: 'smooth' },
    { target: 'edge:slides-video', property: 'reveal', start: 7, duration: 2, from: 0, to: 1, ease: 'smooth' },
    { target: 'node:graphics', property: 'highlight', start: 0, duration: 1, from: 1, to: 1 },
    { target: 'node:diagrams', property: 'highlight', start: 2.8, duration: 0.4, from: 0, to: 1 },
    { target: 'node:slides', property: 'highlight', start: 5.8, duration: 0.4, from: 0, to: 1 },
    { target: 'node:video', property: 'highlight', start: 8.8, duration: 0.4, from: 0, to: 1 },
    ...['graphics', 'diagrams', 'slides', 'video'].map((id) => ({ target: `node:${id}`, property: 'highlight' as const, start: 11, duration: 1, from: 1, to: 0 })),
  ],
});
export const composition = composeGraphics({
  id: 'shared-blocks', title: 'One drawing, two independent instances',
  description: 'Two copies of the same graphics-to-video chain retain their own connections. Only the first copy animates; the second holds its complete drawing.',
  bounds: { x: 0, y: 0, width: 1600, height: 600 }, duration: 16,
  instances: [
    { id: 'animated', scene: block, motion: blockMotion, frame: { x: 60, y: 20, width: 1480, height: 240 }, clip: 'frame' },
    { id: 'still', scene: block, frame: { x: 60, y: 340, width: 1480, height: 240 }, clip: 'frame' },
  ],
});
export const diagram = composition.scene;
export const motion = composition.motion;
export const slide = createSlideScene({ id: 'shared-visual', title: 'Reuse the block. Keep the relationships.', explanation: 'Each instance keeps its own connections and timing. Posters, slides, and video share this composition.', graphic: diagram });
export const sequence = sequenceSlides('shared-graphics-video', [{ slide, motion, duration: 16 }]);

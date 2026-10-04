import { createDiagramScene, createSlideScene, defineGraphicMotion, sequenceSlides } from '../../visual-explainer-mdx/components';

export const diagram = createDiagramScene({
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
export const slide = createSlideScene({ id: 'shared-visual', title: 'Keep the picture. Change the explanation.', explanation: 'A poster, a slide, and a video use these same objects and connections.', graphic: diagram });
export const motion = defineGraphicMotion(diagram, {
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
export const sequence = sequenceSlides('shared-graphics-video', [{ slide, motion, duration: 16 }]);

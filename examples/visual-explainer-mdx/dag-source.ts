import { prepareDag, createDagReveal, type DagInput } from '../../visual-explainer-mdx/dag-scene';
import { createSlideScene, sequenceSlides } from '../../visual-explainer-mdx/graphic-slides';

/** An authored delivery graph, not a claim about measured repository imports. */
export const dagInput: DagInput = {
  id: 'visual-delivery', title: 'One picture, several outputs',
  description: 'Shared graphic primitives feed illustrations, diagrams and charts. Authored motion and those figures combine into a composition, which can be reused in a poster, slide or video. Native rendered clips enter the video as media.',
  nodes: [
    { id: 'graphics', label: 'Graphic primitives', parentIds: [] },
    { id: 'theme', label: 'Shared theme', parentIds: [] },
    { id: 'iso', label: 'ISO illustrations', parentIds: ['graphics', 'theme'] },
    { id: 'diagrams', label: 'Diagrams', parentIds: ['graphics', 'theme'] },
    { id: 'charts', label: 'Charts', parentIds: ['graphics', 'theme'] },
    { id: 'motion', label: 'Authored motion', parentIds: ['graphics'] },
    { id: 'composition', label: 'Composition', parentIds: ['iso', 'diagrams', 'charts', 'motion'] },
    { id: 'poster', label: 'Poster', parentIds: ['composition'] },
    { id: 'slides', label: 'Slides', parentIds: ['composition'] },
    { id: 'native', label: 'Manim / Psychopomp clips', parentIds: [] },
    { id: 'video', label: 'Video', parentIds: ['slides', 'motion', 'native'] },
  ],
};
export const dag = prepareDag(dagInput);
export const motion = createDagReveal(dag, 0.6, 2);
export const sequence = sequenceSlides('dag-reveal', [{ slide: createSlideScene({ id: 'dag-reveal-slide', title: 'Build the picture once.', explanation: 'Each dependent appears after its inputs. The same scene can become a poster, slide, or video.', graphic: dag.scene, preset: 'iso' }), motion, duration: motion.duration }]);

import { GraphicVideo } from '../../visual-explainer-mdx/graphic-video';
import { createSlideScene, sequenceSlides } from '../../visual-explainer-mdx/graphic-slides';
import { composition, duration } from './punctum-source';

export const sequence = sequenceSlides('punctum-display', [{ slide: createSlideScene({ id: 'same-cells', title: 'Build once. Reuse everywhere.', explanation: 'A message becomes editable dots. Roll them into a new message, then scan the same geometry by column.', graphic: composition.scene }), motion: composition.motion, duration }]);

export default function PunctumVideo() { return <GraphicVideo sequence={sequence} />; }

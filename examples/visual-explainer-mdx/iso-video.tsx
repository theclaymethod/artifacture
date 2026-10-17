import { createSlideScene, sequenceSlides, GraphicSlide } from '../../visual-explainer-mdx/graphic-slides';
import { scene, motion, duration } from './iso-source';
const slide = createSlideScene({ id: 'iso-circuit', title: 'Light follows the signal.', explanation: 'The switch sends power. The receiver lights when it arrives.', graphic: scene, preset: 'iso', appearance: 'dark' });
export const sequence = sequenceSlides('iso-circuit-video', [{ slide, motion, duration }]);
export default function IsoVideo() { return <GraphicSlide slide={slide} />; }

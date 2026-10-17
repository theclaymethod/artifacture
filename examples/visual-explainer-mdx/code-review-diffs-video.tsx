import { GraphicVideo } from '../../visual-explainer-mdx/graphic-video';
import { createDiffReviewSequence } from './code-review-diffs-source';

export const sequence = createDiffReviewSequence();
export default function CodeReviewDiffVideo() { return <GraphicVideo sequence={sequence} />; }

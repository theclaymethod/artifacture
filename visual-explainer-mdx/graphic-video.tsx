import { GraphicSlide, sampleSlideSequence, type GraphicSlideSequence } from './graphic-slides';

export function GraphicVideo({ sequence, authoredSeconds = 0 }: { sequence: GraphicSlideSequence; authoredSeconds?: number }) {
  return <div data-composition-id={sequence.id} data-width={sequence.width} data-height={sequence.height} data-duration={sequence.duration} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
    <div data-graphic-video-host style={{ width: '100%', height: '100%' }}><GraphicSlide slide={sampleSlideSequence(sequence, authoredSeconds)} /></div>
  </div>;
}

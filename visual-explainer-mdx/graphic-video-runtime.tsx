import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { gsap } from 'gsap';
import { GraphicSlide, sampleSlideSequence, sequenceSlides, type GraphicSlideSequence } from './graphic-slides';

declare global {
  interface Window {
    __timelines?: Record<string, gsap.core.Timeline>;
    gsap?: typeof gsap;
  }
}

const roots = new WeakMap<gsap.core.Timeline, Root>();

export function disposeGraphicVideo(timeline: gsap.core.Timeline) {
  timeline.kill();
  const root = roots.get(timeline);
  roots.delete(timeline);
  // A host can leave during its parent React commit. Unmount after that commit.
  queueMicrotask(() => root?.unmount());
}

export function registerGraphicVideo(sequence: GraphicSlideSequence) {
  const checked = sequenceSlides(sequence.id, sequence.slides);
  const host = document.querySelector('[data-graphic-video-host]');
  if (!host) throw new Error('GraphicVideo host is missing.');
  const root = createRoot(host);
  const clock = { seconds: 0 };
  const draw = () => flushSync(() => root.render(<GraphicSlide slide={sampleSlideSequence(checked, clock.seconds)} medium="video" />));
  draw();
  const timeline = gsap.timeline({ paused: true });
  timeline.fromTo(clock, { seconds: 0 }, { seconds: checked.duration, duration: checked.duration, ease: 'none', onUpdate: draw }, 0);
  roots.set(timeline, root);
  window.gsap = gsap;
  return timeline;
}

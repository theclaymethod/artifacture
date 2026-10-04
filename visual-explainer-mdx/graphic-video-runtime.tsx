import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { gsap } from 'gsap';
import { GraphicSlide, sampleSlideSequence, sequenceSlides, type GraphicSlideSequence } from './graphic-slides';

declare global {
  interface Window {
    __timelines?: Record<string, gsap.core.Timeline>;
    gsap?: typeof gsap;
  }
}

export function registerGraphicVideo(sequence: GraphicSlideSequence) {
  const checked = sequenceSlides(sequence.id, sequence.slides);
  const host = document.querySelector('[data-graphic-video-host]');
  if (!host) throw new Error('GraphicVideo host is missing.');
  const root = createRoot(host);
  const clock = { seconds: 0 };
  const draw = () => flushSync(() => root.render(<GraphicSlide slide={sampleSlideSequence(checked, clock.seconds)} />));
  draw();
  const timeline = gsap.timeline({ paused: true });
  timeline.fromTo(clock, { seconds: 0 }, { seconds: checked.duration, duration: checked.duration, ease: 'none', onUpdate: draw }, 0);
  window.gsap = gsap;
  return timeline;
}

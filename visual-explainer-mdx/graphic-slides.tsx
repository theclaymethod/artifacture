import { GraphicCanvas } from './graphics';
import { createGraphicScene } from './graphics-types';
import type { GraphicScene } from './graphics-types';
import { defineGraphicMotion, sampleScene, type GraphicMotion } from './graphic-motion';
import { sampleMotionEase } from './motion-eases';
import { assertSupportedPreset } from './preset-policy.mjs';

export type GraphicSlideScene = Readonly<{ id: string; title: string; explanation: string; graphic: GraphicScene; width: number; height: number; preset: string; appearance: 'light' | 'dark' }>;
/**
 * How a slide's graphic enters from the previous slide. `zoom-through` lands from slightly zoomed in
 * and the outgoing graphic punches in, so the cut happens on motion; `direction` slides the incoming
 * graphic from the side the previous one left toward. The header and explanation do not move.
 */
export type SlideTransition = Readonly<{ kind: 'cut' }> | Readonly<{ kind: 'zoom-through'; duration?: number; direction?: 'left' | 'right' | 'none'; zoom?: number }>;
export type GraphicSlideSequence = Readonly<{ id: string; width: number; height: number; duration: number; slides: readonly Readonly<{ slide: GraphicSlideScene; motion: GraphicMotion; start: number; duration: number; transition?: SlideTransition }>[] }>;

export function createSlideScene(input: Omit<GraphicSlideScene, 'width' | 'height' | 'preset' | 'appearance'> & Partial<Pick<GraphicSlideScene, 'width' | 'height' | 'preset' | 'appearance'>>): GraphicSlideScene {
  const slide = { ...input, graphic: createGraphicScene(input.graphic), width: input.width ?? 1920, height: input.height ?? 1080, preset: input.preset ?? 'iso', appearance: input.appearance ?? 'light' };
  if (slide.appearance !== 'light' && slide.appearance !== 'dark') throw new Error('Unsupported slide appearance.');
  assertSupportedPreset(slide.preset);
  if ([slide.id, slide.title, slide.explanation].some((value) => value !== String(value) || !value.trim()) || !Number.isFinite(slide.width) || !Number.isFinite(slide.height) || slide.width <= 0 || slide.height <= 0) throw new Error('Slides need meaning, a stable ID, and finite positive dimensions.');
  return Object.freeze(slide);
}

export function sequenceSlides(id: string, entries: readonly Readonly<{ slide: GraphicSlideScene; motion?: GraphicMotion; duration: number; transition?: SlideTransition }>[] ): GraphicSlideSequence {
  if (id !== String(id) || !id.trim() || !entries.length) throw new Error('A sequence needs an ID and at least one slide.');
  const { width, height } = entries[0].slide;
  let start = 0;
  const ids = new Set<string>();
  const slides = entries.map((entry) => {
    const slide = createSlideScene(entry.slide);
    if (ids.has(slide.id)) throw new Error(`Duplicate slide ID: ${slide.id}`);
    ids.add(slide.id);
    if (!Number.isFinite(entry.duration) || entry.duration <= 0) throw new Error('Each slide needs a finite positive duration.');
    if (entry.slide.width !== width || entry.slide.height !== height) throw new Error('Sequence slides must share frame dimensions.');
    const motion = defineGraphicMotion(entry.slide.graphic, entry.motion ?? { duration: entry.duration, tracks: [] });
    if (motion.duration > entry.duration) throw new Error('Slide motion exceeds its sequence slot.');
    const transition = entry.transition;
    if (transition && !(transition.kind === 'cut' || (transition.kind === 'zoom-through' && [transition.duration ?? .3, transition.zoom ?? .06].every(n => Number.isFinite(n) && n > 0 && n < 1) && ['left', 'right', 'none', undefined].includes(transition.direction)))) throw new Error(`Unsupported slide transition: ${slide.id}`);
    if (transition?.kind === 'zoom-through' && (transition.duration ?? .3) * 2 > entry.duration) throw new Error(`A transition needs a slot at least twice its duration: ${slide.id}`);
    const item = Object.freeze(transition ? { slide, motion, start, duration: entry.duration, transition: Object.freeze({ ...transition }) } : { slide, motion, start, duration: entry.duration });
    start += entry.duration;
    if (!Number.isFinite(start)) throw new Error('Sequence duration overflow.');
    return item;
  });
  return Object.freeze({ id, width, height, duration: start, slides: Object.freeze(slides) });
}

export function sampleSlideSequence(sequence: GraphicSlideSequence, authoredSeconds: number): GraphicSlideScene {
  if (!Number.isFinite(authoredSeconds) || authoredSeconds < 0) throw new Error('Sequence time must be finite and nonnegative.');
  const time = Math.min(sequence.duration, authoredSeconds);
  const index = sequence.slides.findIndex((entry) => time < entry.start + entry.duration);
  const at = index < 0 ? sequence.slides.length - 1 : index, item = sequence.slides[at], local = Math.max(0, time - item.start);
  const graphic = sampleScene(item.slide.graphic, item.motion, local);
  const enter = at > 0 && item.transition?.kind === 'zoom-through' ? item.transition : undefined;
  const next = sequence.slides[at + 1]?.transition, exit = next?.kind === 'zoom-through' ? next : undefined;
  if (!enter && !exit) return Object.freeze({ ...item.slide, graphic });
  // Shrinking the view box zooms in. `direction` is the way content travels: for 'left', the outgoing
  // graphic drifts left and the incoming one starts to the right and settles leftward.
  let scale = 1, shift = 0;
  if (enter) {
    const progress = sampleMotionEase('soft-land', Math.min(1, local / (enter.duration ?? .3)));
    scale *= 1 - (enter.zoom ?? .06) * (1 - progress);
    shift += (enter.direction === 'left' ? -1 : enter.direction === 'right' ? 1 : 0) * .04 * (1 - progress);
  }
  if (exit) {
    const window = (exit.duration ?? .3) / 2, progress = sampleMotionEase('accel-exit', Math.min(1, Math.max(0, (local - (item.duration - window)) / window)));
    scale *= 1 - (exit.zoom ?? .06) * .8 * progress;
    shift -= (exit.direction === 'left' ? -1 : exit.direction === 'right' ? 1 : 0) * .05 * progress;
  }
  const b = graphic.bounds, width = b.width * scale, height = b.height * scale;
  const bounds = { x: b.x + (b.width - width) / 2 + shift * b.width, y: b.y + (b.height - height) / 2, width, height };
  return Object.freeze({ ...item.slide, graphic: createGraphicScene({ ...graphic, bounds }) });
}

/** `medium="video"` selects video-tier tokens, such as stronger muted lines in dark ISO. */
export function GraphicSlide({ slide, medium }: { slide: GraphicSlideScene; medium?: 'video' }) {
  return <article data-graphic-slide={slide.id} data-ve-preset={slide.preset} data-ve-appearance={slide.appearance} data-ve-medium={medium} data-motion-theme={slide.appearance} className="motion-stage" style={{ boxSizing: 'border-box', width: '100%', height: '100%', padding: `${slide.height * 0.072}px ${slide.width * 0.066}px`, display: 'flex', flexDirection: 'column', gap: slide.height * 0.033 }}>
    <h1 style={{ fontSize: slide.width * 0.045, maxWidth: '100%' }}>{slide.title}</h1>
    <p style={{ margin: 0, maxWidth: slide.width * 0.78, fontSize: slide.width * 0.021, lineHeight: 1.4, color: 'var(--ve-muted)' }}>{slide.explanation}</p>
    <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center' }}><GraphicCanvas scene={slide.graphic} style={{ width: '100%', height: '100%' }} /></div>
  </article>;
}

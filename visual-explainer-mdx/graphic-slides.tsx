import { GraphicCanvas } from './graphics';
import { createGraphicScene } from './graphics-types';
import type { GraphicScene } from './graphics-types';
import { defineGraphicMotion, sampleScene, type GraphicMotion } from './graphic-motion';
import { assertSupportedPreset } from './preset-policy.mjs';

export type GraphicSlideScene = Readonly<{ id: string; title: string; explanation: string; graphic: GraphicScene; width: number; height: number; preset: string; appearance: 'light' | 'dark' }>;
export type GraphicSlideSequence = Readonly<{ id: string; width: number; height: number; duration: number; slides: readonly Readonly<{ slide: GraphicSlideScene; motion: GraphicMotion; start: number; duration: number }>[] }>;

export function createSlideScene(input: Omit<GraphicSlideScene, 'width' | 'height' | 'preset' | 'appearance'> & Partial<Pick<GraphicSlideScene, 'width' | 'height' | 'preset' | 'appearance'>>): GraphicSlideScene {
  const slide = { ...input, graphic: createGraphicScene(input.graphic), width: input.width ?? 1920, height: input.height ?? 1080, preset: input.preset ?? 'iso', appearance: input.appearance ?? 'light' };
  if (slide.appearance !== 'light' && slide.appearance !== 'dark') throw new Error('Unsupported slide appearance.');
  assertSupportedPreset(slide.preset);
  if ([slide.id, slide.title, slide.explanation].some((value) => value !== String(value) || !value.trim()) || !Number.isFinite(slide.width) || !Number.isFinite(slide.height) || slide.width <= 0 || slide.height <= 0) throw new Error('Slides need meaning, a stable ID, and finite positive dimensions.');
  return Object.freeze(slide);
}

export function sequenceSlides(id: string, entries: readonly Readonly<{ slide: GraphicSlideScene; motion?: GraphicMotion; duration: number }>[] ): GraphicSlideSequence {
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
    const item = Object.freeze({ slide, motion, start, duration: entry.duration });
    start += entry.duration;
    if (!Number.isFinite(start)) throw new Error('Sequence duration overflow.');
    return item;
  });
  return Object.freeze({ id, width, height, duration: start, slides: Object.freeze(slides) });
}

export function sampleSlideSequence(sequence: GraphicSlideSequence, authoredSeconds: number): GraphicSlideScene {
  if (!Number.isFinite(authoredSeconds) || authoredSeconds < 0) throw new Error('Sequence time must be finite and nonnegative.');
  const time = Math.min(sequence.duration, authoredSeconds);
  const item = sequence.slides.find((entry) => time < entry.start + entry.duration) ?? sequence.slides.at(-1)!;
  return Object.freeze({ ...item.slide, graphic: sampleScene(item.slide.graphic, item.motion, Math.max(0, time - item.start)) });
}

/** `medium="video"` selects video-tier tokens, such as stronger muted lines in dark ISO. */
export function GraphicSlide({ slide, medium }: { slide: GraphicSlideScene; medium?: 'video' }) {
  return <article data-graphic-slide={slide.id} data-ve-preset={slide.preset} data-ve-appearance={slide.appearance} data-ve-medium={medium} data-motion-theme={slide.appearance} className="motion-stage" style={{ boxSizing: 'border-box', width: '100%', height: '100%', padding: `${slide.height * 0.072}px ${slide.width * 0.066}px`, display: 'flex', flexDirection: 'column', gap: slide.height * 0.033 }}>
    <h1 style={{ fontSize: slide.width * 0.045, maxWidth: '100%' }}>{slide.title}</h1>
    <p style={{ margin: 0, maxWidth: slide.width * 0.78, fontSize: slide.width * 0.021, lineHeight: 1.4, color: 'var(--ve-muted)' }}>{slide.explanation}</p>
    <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center' }}><GraphicCanvas scene={slide.graphic} style={{ width: '100%', height: '100%' }} /></div>
  </article>;
}

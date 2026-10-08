import { createGraphicScene, type GraphicBounds, type GraphicObject, type GraphicScene } from './graphics-types';
import { defineGraphicMotion, type GraphicMotion, type GraphicMotionTrack } from './graphic-motion';
import { arrive, leave } from './motion-phrases';
import { measureText, wrapText, type FontRole } from './text-metrics';

export type KineticCue = Readonly<{
  text: string;
  /** Seconds from the start of the scene; usually a narration word's time. */
  at: number;
  /** Paint in the accent and draw an underline once the words land. */
  accent?: boolean;
  /** Clear earlier cues from the band before this one arrives; otherwise it stacks below them. */
  replace?: boolean;
}>;
export type KineticTypeInput = Readonly<{
  id: string;
  cues: readonly KineticCue[];
  /** The band the type occupies, in scene coordinates. */
  region: GraphicBounds;
  size: number;
  font?: FontRole;
  weight?: number;
  preset?: string;
  align?: 'center' | 'start';
  /** Seconds between word arrivals within a cue. */
  stagger?: number;
}>;
export type KineticType = Readonly<{ objects: readonly GraphicObject[]; tracks: readonly GraphicMotionTrack[]; holdCues: readonly Readonly<{ id: string; at: number }>[] }>;

/**
 * Compile kinetic type into ordinary scene objects and tracks. Each word lands from slightly oversize
 * on a decelerating move; replacing cues clear the band with an accelerating exit.
 */
export function compileKineticType(input: KineticTypeInput): KineticType {
  const { id, region, size, font = 'display', weight = 560, preset, align = 'center', stagger = .05 } = input;
  if (!id.trim() || !(size > 0) || !(region.width > 0) || !(region.height > 0) || !(stagger >= 0)) throw new Error('Kinetic type needs an ID, a positive size, a region and a nonnegative stagger.');
  const cues = [...input.cues].sort((a, b) => a.at - b.at);
  if (cues.some(cue => !cue.text.trim() || !Number.isFinite(cue.at) || cue.at < 0)) throw new Error('Kinetic cues need text and a nonnegative time.');
  const measure = { size, font, weight, preset }, space = measureText(' ', measure).width, leading = size * 1.08;
  const objects: GraphicObject[] = [], tracks: GraphicMotionTrack[] = [], holdCues: { id: string; at: number }[] = [];
  let shown: string[] = [], line = 0;
  cues.forEach((cue, c) => {
    if (cue.replace && shown.length) {
      for (const word of shown) tracks.push(...leave(word, Math.max(0, cue.at - .2), { to: { x: 0, y: -size * .3 }, duration: .2 }));
      shown = []; line = 0;
    }
    const lines = wrapText(cue.text, region.width, measure);
    let k = 0;
    lines.forEach(text => {
      const words = text.split(' '), widths = words.map(word => measureText(word, measure).width);
      const lineWidth = widths.reduce((sum, w) => sum + w, 0) + space * (words.length - 1);
      let x = align === 'center' ? region.x + (region.width - lineWidth) / 2 : region.x;
      const y = region.y + size * .82 + line * leading;
      words.forEach((word, w) => {
        const wordId = `${id}-${c}-${k}`;
        objects.push({ id: wordId, kind: 'illustration', primitives: [{ kind: 'text', x, y, lines: [word], leading, size, font, weight, fill: cue.accent ? 'accent' : 'ink' }], state: { opacity: 0, reveal: 1, highlight: false, x: 0, y: 0 } });
        tracks.push(...arrive(wordId, cue.at + k * stagger, { from: { x: 0, y: size * .22 }, duration: .33, ease: 'soft-land', overshoot: { scale: 1.45, origin: { x: x + widths[w] / 2, y: y - size * .3 } } }));
        shown.push(wordId);
        x += widths[w] + space; k++;
      });
      if (cue.accent) {
        const underline = `${id}-${c}-rule-${line}`, left = align === 'center' ? region.x + (region.width - lineWidth) / 2 : region.x;
        objects.push({ id: underline, kind: 'illustration', primitives: [{ kind: 'path', d: `M ${left} ${y + size * .18} L ${left + lineWidth} ${y + size * .18}`, fill: 'none', stroke: 'accent', strokeRole: 'active', strokeWidth: Math.max(2, size * .06) }], state: { opacity: 1, reveal: 0, highlight: false, x: 0, y: 0 } });
        tracks.push({ target: underline, property: 'reveal', start: cue.at + k * stagger + .15, duration: .35, from: 0, to: 1, ease: 'glide' });
        shown.push(underline);
      }
      line++;
    });
    holdCues.push({ id: `${id}-${c}`, at: cue.at + Math.max(0, k - 1) * stagger });
  });
  return Object.freeze({ objects: Object.freeze(objects), tracks: Object.freeze(tracks), holdCues: Object.freeze(holdCues) });
}

/** Add compiled kinetic type on top of an existing scene and its motion. */
export function addKineticType(scene: GraphicScene, motion: GraphicMotion, input: KineticTypeInput): Readonly<{ scene: GraphicScene; motion: GraphicMotion; holdCues: KineticType['holdCues'] }> {
  const type = compileKineticType(input);
  const withType = createGraphicScene({ ...scene, objects: [...scene.objects, ...type.objects] });
  return Object.freeze({ scene: withType, motion: defineGraphicMotion(withType, { ...motion, tracks: [...motion.tracks, ...type.tracks] }), holdCues: type.holdCues });
}

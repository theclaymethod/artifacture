// Motion helpers for a narrated beat: word-anchored timing, arrive/leave phrases, a question counter,
// kinetic type, a camera from frameScene, an instance that moves as a block, and a zoom-through cut.
import { inspectEndHolds } from '../../visual-explainer-mdx/end-holds';
import { defineGraphicMotion } from '../../visual-explainer-mdx/graphic-motion';
import { composeGraphics } from '../../visual-explainer-mdx/graphics-composition';
import { createGraphicScene } from '../../visual-explainer-mdx/graphics-types';
import { createSlideScene, sampleSlideSequence, sequenceSlides } from '../../visual-explainer-mdx/graphic-slides';
import { addKineticType } from '../../visual-explainer-mdx/kinetic-type';
import { arrive, leave } from '../../visual-explainer-mdx/motion-phrases';
import { alignScript, cueTime } from '../../visual-explainer-mdx/narration-align.mjs';
import { frameScene } from '../../visual-explainer-mdx/scene-framing';
import { docPage, messageBubble } from '../../visual-explainer-mdx/teaching-icons';

const script = [{ id: 'grilling', text: 'Grilling asked me twenty-nine questions, then visual explainer wrote the script.' }];
const heard = 'Grilling asked me 29 questions, then visual explainer wrote the script.'.split(' ').map((text, i) => ({ text, start: .4 + i * .33, end: .4 + i * .33 + .28 }));
export const [line] = alignScript(script, heard);
const slot = 5;
const at = (word: string) => cueTime(line, word, { latest: slot - 1.1 });

const base = createGraphicScene({
  id: 'questions', title: 'Twenty-nine questions', description: 'A question counter climbs to 29, then a script page arrives.',
  bounds: { x: -400, y: -260, width: 800, height: 450 },
  objects: [
    { id: 'count', kind: 'illustration', primitives: [{ kind: 'text', x: -180, y: 40, lines: ['Q1'], leading: 72, size: 72, font: 'mono', weight: 700, fill: 'attention' }] },
    { ...docPage({ id: 'script', x: 80, y: -30, title: 'script', state: { opacity: 0 } }) },
    { ...messageBubble({ id: 'note', x: -320, y: 110, text: 'Settle the story before recording.', size: 18, state: { opacity: 0 } }) },
  ],
});
const motion = defineGraphicMotion(base, { duration: slot, tracks: [
  { target: 'count', property: 'value', start: at('asked'), duration: 1.2, from: 1, to: 29, format: { prefix: 'Q' } },
  { target: 'count', property: 'scale', start: at('questions'), duration: .3, from: 1, to: 1.12, origin: { x: -130, y: 20 }, ease: 'snap-settle' },
  ...arrive('script', at('script'), { from: { x: 60, y: 0 } }),
  ...arrive('note', at('visual'), { from: { x: -40, y: 0 } }),
  ...leave('note', at('script') + .4, { to: { x: -60, y: 0 } }),
] });

export const withType = addKineticType(base, motion, {
  id: 'type', region: { x: -380, y: -250, width: 760, height: 120 }, size: 56,
  cues: [{ text: '/grilling', at: at('grilling') }, { text: 'Script →', at: at('script'), replace: true, accent: true }],
});
export const lateCues = inspectEndHolds(withType.motion, { cues: withType.holdCues });
export const camera = frameScene(withType.scene, withType.motion, { reserveTop: .26, minWidth: 500 });
export const filmed = defineGraphicMotion(withType.scene, { ...withType.motion, camera });

// The same page moves as one block inside a composition.
export const composition = composeGraphics({
  id: 'moving-page', title: 'A page slides in', description: 'The script page moves left as one instance.', duration: 2,
  bounds: { x: 0, y: 0, width: 800, height: 450 },
  instances: [{ id: 'page', scene: createGraphicScene({ id: 'page', title: 'Page', description: 'A page.', bounds: { x: 0, y: 0, width: 200, height: 160 }, objects: [docPage({ id: 'doc', x: 20, y: 20 })] }), frame: { x: 300, y: 140, width: 200, height: 160 }, clip: 'none', moves: [{ start: 0, duration: .6, from: { x: 300, y: 0 }, to: { x: 0, y: 0 }, ease: 'soft-land' }] }],
});

const slide = (id: string, graphic = withType.scene) => createSlideScene({ id, title: 'How this film was made', explanation: 'Research and grilling shaped the script.', graphic, preset: '3b1b', appearance: 'dark' });
export const sequence = sequenceSlides('motion-for-video', [
  { slide: slide('questions'), motion: filmed, duration: slot },
  { slide: slide('page', composition.scene), motion: composition.motion, duration: 2, transition: { kind: 'zoom-through', direction: 'left' } },
]);
export const atCut = sampleSlideSequence(sequence, slot - .05);

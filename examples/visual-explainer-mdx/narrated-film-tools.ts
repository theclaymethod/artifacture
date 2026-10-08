// Narrated-film helpers on one small beat: align a script to recognized words, convert the line to
// narration cues, frame the scene from what is visible, and check that the beat holds its end state.
import { defineGraphicMotion } from '../../visual-explainer-mdx/graphic-motion';
import { createGraphicScene } from '../../visual-explainer-mdx/graphics-types';
import { alignScript, compareTranscript, toAlignedWords } from '../../visual-explainer-mdx/narration-align.mjs';
import { alignedWordsToCues } from '../../visual-explainer-mdx/narration-cues';
import { frameScene, sampleFrame, widestFrame } from '../../visual-explainer-mdx/scene-framing';
import { inspectEndHolds } from '../../visual-explainer-mdx/end-holds';

export const script = [{ id: 'skill', text: 'A skill is a folder. Its SKILL.md holds a name, a description, and your instructions.' }];

// Recognized words as a speech recognizer returns them: "SKILL.md" is heard as "skill dot md".
export const recognized = 'A skill is a folder. Its skill dot md holds a name, a description and your instructions.'
  .split(' ').map((text, i) => ({ text, start: .3 + i * .32, end: .3 + i * .32 + .28 }));

export const differences = compareTranscript(script[0].text, recognized, { ignore: ['dot'] });
export const [line] = alignScript(script, recognized, { ignore: ['dot'] });
export const cues = alignedWordsToCues({ lineId: line.id, offset: line.start, words: toAlignedWords(line), alignment: 'measured' }, { duration: 8 });

const folder = { kind: 'rect', x: 0, y: 0, width: 220, height: 160, radius: 8, fill: 'background', stroke: 'illustration-ink', strokeRole: 'structure' } as const;
export const scene = createGraphicScene({
  id: 'skill-folder', title: 'A skill folder', description: 'A folder, then the two parts of its SKILL.md.',
  bounds: { x: -600, y: -400, width: 1200, height: 800 },
  objects: [
    { id: 'folder', kind: 'illustration', primitives: [folder] },
    { id: 'always', kind: 'illustration', primitives: [{ ...folder, x: 320, y: -40, width: 260, height: 70 }], state: { opacity: 0, reveal: 1, highlight: false, x: 0, y: 0 } },
    { id: 'demand', kind: 'illustration', primitives: [{ ...folder, x: 320, y: 70, width: 260, height: 70 }], state: { opacity: 0, reveal: 1, highlight: false, x: 0, y: 0 } },
  ],
});
const at = (word: string) => line.words.find(w => w.text.toLowerCase().startsWith(word))!.start;
export const motion = defineGraphicMotion(scene, { duration: 8, tracks: [
  { target: 'always', property: 'opacity', start: at('name'), duration: .3, from: 0, to: 1, ease: 'smooth' },
  { target: 'demand', property: 'opacity', start: at('instructions'), duration: .3, from: 0, to: 1, ease: 'smooth' },
] });

// Keep the top 26% clear for kinetic type; the camera widens as the second box arrives.
export const frames = frameScene(scene, motion, { reserveTop: .26, minWidth: 400 });
export const openingFrame = sampleFrame(frames, 0);
export const posterFrame = widestFrame(frames);
export const lateArrivals = inspectEndHolds(motion, { cues: [{ id: 'kinetic-type', at: at('instructions') }] });

import { createDotMatrixScene } from '../../visual-explainer-mdx/dot-matrix';
import { createGraphicScene } from '../../visual-explainer-mdx/graphics-types';
import { createCharacterRoll } from '../../visual-explainer-mdx/character-roll';
import { createColumnScan } from '../../visual-explainer-mdx/column-scan';
import { composeGraphics } from '../../visual-explainer-mdx/graphics-composition';

const glyph = createDotMatrixScene({ id: 'descender', title: 'The lowercase g keeps its descender', description: 'A five-column, nine-row glyph. The last two rows below the baseline form the descender.', text: 'g', pitch: 24, weight: 230, lattice: true });
const descenders = new Set(glyph.cells.filter(cell => cell.dotRow >= 7).map(cell => cell.id));
export const descender = createGraphicScene({ ...glyph.scene, objects: glyph.scene.objects.map(object => descenders.has(object.id) ? { ...object, primitives: object.primitives.map(primitive => ({ ...primitive, fill: 'accent' as const })) } : object) });

export const roll = createCharacterRoll({ id: 'reuse-message', title: 'Build once. Reuse everywhere.', description: 'BUILD ONCE rolls into REUSE EVERYWHERE. Every character uses the same stable dot cells, and stops on the exact final message.', from: 'BUILD\nONCE', to: 'REUSE\nEVERYWHERE', pitch: 16, weight: 300, start: .45, tick: .08, stagger: .045, hold: .8 });
export const scan = createColumnScan({ id: 'column-read', title: 'One event controls both light and sound', description: 'Each column of SIGNAL lights once from left to right. Lit dots produce a quiet tone whose pitch follows their row. The message holds after scanning.', text: 'SIGNAL', pitch: 16, weight: 300, lattice: true, start: 2.05, step: .09, hold: .8 });

export const duration = scan.motion.duration;
export const composition = composeGraphics({ id: 'punctum-display', title: 'A message is geometry, then motion', description: 'The left display rolls one reusable dot grid into a new message. The right display scans SIGNAL using the same authored seconds. Both are existing graphic primitives.', bounds: { x: 0, y: 0, width: 1280, height: 500 }, duration, instances: [
  { id: 'message', scene: roll.scene, motion: roll.motion, frame: { x: 0, y: 20, width: 720, height: 450 }, clip: 'none' },
  { id: 'signal', scene: scan.scene, motion: scan.motion, frame: { x: 760, y: 130, width: 520, height: 230 }, clip: 'none' },
] });

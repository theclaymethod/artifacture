// Design-system helpers on one small scene: a measured message, teaching icons, connectors that
// follow their objects, semantic attention/fault marks, an ISO label anchor and a legibility check.
import { createGraphicScene } from '../../visual-explainer-mdx/graphics-types';
import { objectBounds } from '../../visual-explainer-mdx/graphic-bounds';
import { createIsoScene, isoLabelAnchor } from '../../visual-explainer-mdx/iso-scene';
import { inspectLegibility } from '../../visual-explainer-mdx/legibility';
import { checkMark, crossMark, docPage, isoVersionStackParts, messageBubble, personIcon } from '../../visual-explainer-mdx/teaching-icons';
import { measureText } from '../../visual-explainer-mdx/text-metrics';

export const request = messageBubble({ id: 'request', x: 0, y: 0, text: 'Price at the bottom. Sign off as me.', size: 18, maxWidth: 260 });
export const requestBounds = objectBounds(request);

export const scene = createGraphicScene({
  id: 'design-system-tools', title: 'A request becomes a skill', description: 'A message points to a SKILL.md page; one check passes and one fails; a teammate receives the page.',
  bounds: { x: -40, y: -40, width: 880, height: 400 },
  objects: [
    request,
    docPage({ id: 'skill', x: 380, y: 0 }),
    personIcon({ id: 'teammate', x: 720, y: 60 }),
    checkMark({ id: 'pass', x: 410, y: 160 }),
    crossMark({ id: 'fail', x: 450, y: 160 }),
    { id: 'note', kind: 'illustration', primitives: [{ kind: 'text', x: 470, y: 260, lines: ['one step still fails'], leading: 14, size: 14, fill: 'fault' }] },
  ],
  connectors: [
    { id: 'request-to-skill', from: 'request', to: 'skill', stroke: 'accent', strokeRole: 'active' },
    { id: 'skill-to-teammate', from: 'skill', to: 'teammate', bend: .2 },
  ],
});

// 14-unit labels in an 880-unit view are 30.5 px at 1920; in a 1400-unit wide shot they drop below 24 px.
export const fullFrame = inspectLegibility(scene, { outputWidth: 1920 });
export const wideShot = inspectLegibility(scene, { outputWidth: 1920, view: { x: -300, y: -200, width: 1400, height: 788 } });

export const stack = isoVersionStackParts({ id: 'versions', origin: { x: 0, y: 0, z: 0 }, count: 3 });
export const stackScene = createIsoScene({ id: 'versions', title: 'Three versions', description: 'Three pages stacked; the newest on top.', parts: stack });
export const newestLabel = isoLabelAnchor(stack[stack.length - 1], 'right');
export const titleWidth = measureText('What do you keep repeating?', { size: 92, font: 'display', preset: '3b1b' });

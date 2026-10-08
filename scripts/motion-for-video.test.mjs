import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { alignScript, cueTime } from '../visual-explainer-mdx/narration-align.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const box = (id, x = 0, extra = {}) => ({ id, kind: 'illustration', primitives: [{ kind: 'rect', x, y: 0, width: 100, height: 60, fill: 'background', stroke: 'illustration-ink' }], state: { opacity: 1, reveal: 1, highlight: false, x: 0, y: 0 }, ...extra });

test('motion for video', async t => {
  const server = await createServer({ root: ROOT, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true, hmr: false, ws: false } });
  try {
    const { createGraphicScene } = await server.ssrLoadModule('/visual-explainer-mdx/graphics-types.ts');
    const { defineGraphicMotion, sampleScene } = await server.ssrLoadModule('/visual-explainer-mdx/graphic-motion.ts');
    const { GraphicCanvas } = await server.ssrLoadModule('/visual-explainer-mdx/graphics.tsx');
    const phrases = await server.ssrLoadModule('/visual-explainer-mdx/motion-phrases.ts');
    const { compileKineticType } = await server.ssrLoadModule('/visual-explainer-mdx/kinetic-type.ts');
    const { measureText } = await server.ssrLoadModule('/visual-explainer-mdx/text-metrics.ts');
    const { createSlideScene, sequenceSlides, sampleSlideSequence } = await server.ssrLoadModule('/visual-explainer-mdx/graphic-slides.tsx');
    const { composeGraphics } = await server.ssrLoadModule('/visual-explainer-mdx/graphics-composition.ts');
    const scene = createGraphicScene({ id: 's', title: 'Scene', description: 'Boxes.', bounds: { x: 0, y: 0, width: 800, height: 450 }, objects: [box('a'), box('b', 300)] });

    await t.test('a camera moves the sampled view box and keeps the scene aspect', () => {
      const motion = defineGraphicMotion(scene, { duration: 2, tracks: [], camera: [{ t: 0, cx: 400, cy: 225, width: 800 }, { t: 2, cx: 100, cy: 100, width: 400, ease: 'linear' }] });
      assert.deepEqual(sampleScene(scene, motion, 0).bounds, { x: 0, y: 0, width: 800, height: 450 });
      assert.deepEqual(sampleScene(scene, motion, 1).bounds, { x: 250 - 300, y: 162.5 - 168.75, width: 600, height: 337.5 });
      assert.throws(() => defineGraphicMotion(scene, { duration: 2, tracks: [], camera: [{ t: 1, cx: 0, cy: 0, width: 10 }, { t: .5, cx: 0, cy: 0, width: 10 }] }), /time order/);
    });

    await t.test('scale tracks scale about their origin and render as a transform', () => {
      const motion = defineGraphicMotion(scene, { duration: 1, tracks: [{ target: 'a', property: 'scale', start: 0, duration: 1, from: 2, to: 1, origin: { x: 50, y: 30 } }] });
      const sampled = sampleScene(scene, motion, 0);
      assert.equal(sampled.objects[0].state.scale, 2);
      assert.match(renderToStaticMarkup(createElement(GraphicCanvas, { scene: sampled })), /translate\(50 30\) scale\(2\) translate\(-50 -30\)/);
      assert.throws(() => defineGraphicMotion(scene, { duration: 1, tracks: [{ target: 'a', property: 'scale', start: 0, duration: 1, from: 0, to: 1 }] }), /positive/);
    });

    await t.test('value tracks count a single-line text object', () => {
      const counter = createGraphicScene({ id: 'c', title: 'Counter', description: 'A count.', bounds: scene.bounds, objects: [{ id: 'n', kind: 'illustration', primitives: [{ kind: 'text', x: 0, y: 40, lines: ['Q1'], leading: 40, size: 40 }] }] });
      const motion = defineGraphicMotion(counter, { duration: 2, tracks: [{ target: 'n', property: 'value', start: 0, duration: 2, from: 1, to: 29, format: { prefix: 'Q' } }] });
      assert.deepEqual(['0', '1', '2'].map(s => sampleScene(counter, motion, Number(s)).objects[0].primitives[0].lines[0]), ['Q1', 'Q15', 'Q29']);
      assert.throws(() => defineGraphicMotion(scene, { duration: 1, tracks: [{ target: 'a', property: 'value', start: 0, duration: 1, from: 0, to: 1 }] }), /single-line text/);
    });

    await t.test('arrive decelerates in with an early opacity step; leave accelerates out and fades late', () => {
      const [fade, move] = phrases.arrive('a', 1, { from: { x: 40, y: 0 } });
      assert.equal(fade.property, 'opacity'); assert.ok(fade.duration < move.duration); assert.equal(move.ease, 'snap-settle');
      const [exit, late] = phrases.leave('a', 2);
      assert.equal(exit.ease, 'accel-exit'); assert.equal(late.start, 2 + exit.duration / 2);
      assert.equal(phrases.arriveInOrder(['a', 'b'], 0, .1)[2].start, .1);
    });

    await t.test('kinetic type lays measured words without overlap and clears on replace', () => {
      const type = compileKineticType({ id: 'k', region: { x: 0, y: 0, width: 600, height: 120 }, size: 48, cues: [{ text: 'What do you keep repeating', at: 0 }, { text: 'to your agent?', at: 1, replace: true, accent: true }] });
      const words = type.objects.filter(object => object.primitives[0].kind === 'text');
      assert.equal(words.length, 8);
      const first = words.slice(0, 5).map(w => w.primitives[0]);
      for (let i = 1; i < first.length; i++) if (first[i].y === first[i - 1].y) assert.ok(first[i].x >= first[i - 1].x + measureText(first[i - 1].lines[0], { size: 48, font: 'display', weight: 560 }).width);
      assert.ok(type.tracks.some(track => track.target === 'k-0-0' && track.property === 'opacity' && track.to === 0), 'replace clears the first cue');
      assert.ok(type.objects.some(object => object.id.includes('rule')), 'accent cues get an underline');
      assert.deepEqual(type.holdCues.map(cue => cue.id), ['k-0', 'k-1']);
    });

    await t.test('zoom-through enters zoomed in and the outgoing slide punches in toward the cut', () => {
      const slide = id => createSlideScene({ id, title: 'Slide', explanation: 'Text.', graphic: scene });
      const sequence = sequenceSlides('seq', [{ slide: slide('one'), duration: 2 }, { slide: slide('two'), duration: 2, transition: { kind: 'zoom-through', direction: 'left' } }]);
      const entering = sampleSlideSequence(sequence, 2).graphic.bounds, settled = sampleSlideSequence(sequence, 3).graphic.bounds, leaving = sampleSlideSequence(sequence, 1.999).graphic.bounds;
      assert.ok(entering.width < 800 && settled.width === 800 && leaving.width < 800);
      assert.ok(leaving.x > (800 - leaving.width) / 2, 'outgoing content drifts left: the view box moves right');
      assert.ok(entering.x < (800 - entering.width) / 2, 'incoming content starts to the right');
      assert.throws(() => sequenceSlides('bad', [{ slide: slide('x'), duration: 1 }, { slide: slide('y'), duration: .4, transition: { kind: 'zoom-through' } }]), /twice its duration/);
    });

    await t.test('instance moves translate every object in local units', () => {
      const composed = composeGraphics({ id: 'm', title: 'Move', description: 'One instance.', duration: 1, bounds: { x: 0, y: 0, width: 800, height: 450 }, instances: [{ id: 'i', scene, frame: { x: 0, y: 0, width: 400, height: 225 }, clip: 'none', moves: [{ start: 0, duration: 1, from: { x: 100, y: 0 }, to: { x: 0, y: 0 } }] }] });
      const moved = sampleScene(composed.scene, composed.motion, 0).objects[0];
      assert.equal(moved.state.x * moved.placement.scale, 100);
      const own = defineGraphicMotion(scene, { duration: 1, tracks: [{ target: 'a', property: 'translation', start: 0, duration: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }] });
      assert.throws(() => composeGraphics({ id: 'm', title: 'Move', description: 'One instance.', duration: 1, bounds: { x: 0, y: 0, width: 800, height: 450 }, instances: [{ id: 'i', scene, motion: own, frame: { x: 0, y: 0, width: 400, height: 225 }, clip: 'none', moves: [{ start: 0, duration: 1, from: { x: 1, y: 0 }, to: { x: 0, y: 0 } }] }] }), /overlap/);
    });
  } finally { await server.close(); }

  await t.test('cue times lead their word and clamp before the cut', () => {
    const [line] = alignScript([{ id: 'a', text: 'Run it on real requests.' }], 'Run it on real requests.'.split(' ').map((text, i) => ({ text, start: 1 + i * .5, end: 1.4 + i * .5 })));
    assert.equal(cueTime(line, 'real'), 1.5 - .15);
    assert.equal(cueTime(line, 'requests', { latest: 1 }), 1);
    assert.equal(cueTime(line, 'missing', { fallback: 0 }), 0);
  });
});

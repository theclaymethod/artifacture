import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { nativeSvgTheme } from './fframes/svg.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('design system for video', async t => {
  const server = await createServer({ root: ROOT, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true, hmr: false, ws: false } });
  try {
    const metrics = await server.ssrLoadModule('/visual-explainer-mdx/text-metrics.ts');
    const icons = await server.ssrLoadModule('/visual-explainer-mdx/teaching-icons.ts');
    const bounds = await server.ssrLoadModule('/visual-explainer-mdx/graphic-bounds.ts');
    const { connectorPath, GraphicCanvas } = await server.ssrLoadModule('/visual-explainer-mdx/graphics.tsx');
    const { createGraphicScene } = await server.ssrLoadModule('/visual-explainer-mdx/graphics-types.ts');
    const { inspectLegibility } = await server.ssrLoadModule('/visual-explainer-mdx/legibility.ts');
    const iso = await server.ssrLoadModule('/visual-explainer-mdx/iso-scene.ts');

    await t.test('text is measured from glyph widths, not character counts', () => {
      const narrow = metrics.measureText('iiiiiiii', { size: 20 }), wide = metrics.measureText('MMMMMMMM', { size: 20 });
      assert.ok(wide.width > narrow.width * 2.5, 'M is far wider than i');
      assert.equal(metrics.measureText('Title', { size: 40, font: 'display', preset: '3b1b' }).family, 'EB Garamond');
      assert.equal(metrics.measureText('Title', { size: 40, preset: 'mono-industrial' }).measured, false);
      const lines = metrics.wrapText('Use the proposal template. Price at the bottom.', 200, { size: 18 });
      assert.ok(lines.length > 1 && lines.every(line => metrics.measureText(line, { size: 18 }).width <= 200));
    });

    await t.test('a message bubble is sized to its wrapped text', () => {
      const bubble = icons.messageBubble({ id: 'm', x: 0, y: 0, text: 'Price at the bottom. Sign off as me.', size: 18, maxWidth: 260 });
      const box = bounds.objectBounds(bubble), text = bubble.primitives[1];
      assert.ok(box.width <= 260);
      for (const line of text.lines) assert.ok(metrics.measureText(line, { size: 18 }).width <= box.width - 28 + 1e-6);
    });

    await t.test('connectors join object edges and follow movement', () => {
      const box = (id, x) => ({ id, kind: 'illustration', primitives: [{ kind: 'rect', x, y: 0, width: 100, height: 50, fill: 'background', stroke: 'illustration-ink' }], state: { opacity: 1, reveal: 1, highlight: false, x: 0, y: 0 } });
      const scene = createGraphicScene({ id: 'c', title: 'Connector', description: 'Two boxes.', bounds: { x: 0, y: 0, width: 600, height: 300 }, objects: [box('a', 0), box('b', 300)], connectors: [{ id: 'ab', from: 'a', to: 'b', gap: 0 }] });
      assert.equal(connectorPath(scene, scene.connectors[0]).d, 'M 100 25 L 300 25');
      const moved = createGraphicScene({ ...scene, objects: [scene.objects[0], { ...scene.objects[1], state: { ...scene.objects[1].state, y: 120 } }] });
      assert.equal(connectorPath(moved, moved.connectors[0]).d, 'M 100 25 L 300 145');
      assert.throws(() => createGraphicScene({ ...scene, connectors: [{ id: 'bad', from: 'a', to: 'missing' }] }), /two objects/);
      assert.match(renderToStaticMarkup(createElement(GraphicCanvas, { scene })), /data-graphic-connector="ab"/);
    });

    await t.test('attention and fault keep their meaning when highlighted', () => {
      const scene = createGraphicScene({ id: 'p', title: 'Paints', description: 'Marks.', bounds: { x: 0, y: 0, width: 100, height: 100 }, objects: [{ id: 'x', kind: 'illustration', primitives: [{ kind: 'path', d: 'M 0 0 L 10 10', stroke: 'fault' }], state: { opacity: 1, reveal: 1, highlight: true, x: 0, y: 0 } }] });
      assert.match(renderToStaticMarkup(createElement(GraphicCanvas, { scene })), /stroke:var\(--ve-fault\)|stroke="var\(--ve-fault\)"/);
    });

    await t.test('legibility flags text that a wide view shrinks below the minimum', () => {
      const scene = createGraphicScene({ id: 'l', title: 'Labels', description: 'One label.', bounds: { x: 0, y: 0, width: 800, height: 450 }, objects: [{ id: 'label', kind: 'illustration', primitives: [{ kind: 'text', x: 10, y: 20, lines: ['small'], leading: 14, size: 14 }] }] });
      assert.deepEqual(inspectLegibility(scene, { outputWidth: 1920 }), []);
      assert.equal(inspectLegibility(scene, { outputWidth: 1920, view: { x: 0, y: 0, width: 1400, height: 788 } })[0].object, 'label');
    });

    await t.test('ISO label anchors sit outside the projected part', () => {
      const part = { id: 'box', origin: { x: 0, y: 0, z: 0 }, size: { width: 100, depth: 60, height: 40 } };
      const scene = iso.createIsoScene({ id: 'i', title: 'Box', description: 'One box.', parts: [part] });
      const box = bounds.objectBounds(scene.objects[0]);
      const right = iso.isoLabelAnchor(part, 'right', 10), above = iso.isoLabelAnchor(part, 'above', 10);
      assert.ok(Math.abs(right.x - (box.x + box.width + 10)) < 1e-6 && right.anchor === 'start');
      assert.ok(Math.abs(above.y - (box.y - 10)) < 1e-6 && above.anchor === 'middle');
      assert.deepEqual(iso.isoFaceAnchor(part, 'top', 0, 0), iso.projectIsoPoint({ x: 0, y: 0, z: 40 }));
    });
  } finally { await server.close(); }

  await t.test('new tokens resolve in every native preset, and the video tier strengthens dark ISO', () => {
    const css = readFileSync(path.join(ROOT, 'visual-explainer-mdx/themes.css'), 'utf8');
    for (const preset of ['iso', '3b1b', 'mono-color', 'algebrica']) for (const appearance of ['light', 'dark']) {
      const theme = nativeSvgTheme(css, preset, appearance);
      for (const token of ['--ve-attention', '--ve-fault']) assert.match(theme.token(token), /^#[\da-f]{6}$/i, `${preset}/${appearance} ${token}`);
    }
    const threeB = nativeSvgTheme(css, '3b1b', 'dark');
    assert.deepEqual(['--ve-accent', '--ve-attention', '--ve-fault'].map(threeB.token), ['#58c4dd', '#f7d96f', '#fc6255']);
    assert.equal(nativeSvgTheme(css, 'iso', 'dark').token('--ve-illustration-muted'), '#8f939e');
    assert.match(css, /--ve-video-type-min: 24px;/);
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectModality,
  extractFromCode,
  extractFromHtml,
  quantizePalette,
  mapExtractionToCore,
  deriveTokens,
} from './learn-extractors.mjs';

test('extracted values are sanitized at ingestion; private hosts are blocked', async () => {
  const { sanitizeExtractedValue } = await import('./learn-extractors.mjs');
  assert.equal(sanitizeExtractedValue('Acme</style><script>, serif'), 'Acme/stylescript, serif');
  assert.equal(sanitizeExtractedValue('Nice Stack, sans-serif'), 'Nice Stack, sans-serif');
  const { isPrivateHost } = await import('./learn-sources.mjs');
  for (const host of ['localhost', '127.0.0.1', '10.0.0.5', '172.16.0.1', '192.168.0.1', '169.254.10.10', '::1', 'fd12::1']) {
    assert.equal(isPrivateHost(host), true, host);
  }
  for (const host of ['example.com', '8.8.8.8', '172.32.0.1', '2606:4700::1111']) {
    assert.equal(isPrivateHost(host), false, host);
  }
});

test('detectModality: url, image extensions, everything else is code', () => {
  assert.equal(detectModality('https://example.com/brand'), 'url');
  assert.equal(detectModality('shot.PNG'), 'image');
  assert.equal(detectModality('brand.webp'), 'image');
  assert.equal(detectModality('tokens.ts'), 'code');
  assert.equal(detectModality('styles.css'), 'code');
});

test('code extractor: named hex colors, font stacks, weights, grid, ease', () => {
  const source = `
    export const colors = {
      paper: "#F2EDE2",
      ink: "#22252B",
      primary: "#A0522D",
      border: "#C6BFAF",
    };
    export const fonts = {
      display: "'Some Serif',Georgia,serif",
      body: "'Some Sans', ui-sans-serif, system-ui, sans-serif",
      mono: "'Some Mono',ui-monospace,monospace",
    };
    export const EASE = "cubic-bezier(0.3,1,0.7,1)";
    const ramp = { title: { fontWeight: 350, fontSize: 72 }, label: { fontWeight: 650, fontSize: 12 } };
    export const gridPaper = (line = "rgba(198,191,175,.4)") => ({
      backgroundImage: \`linear-gradient(\${line} 1px, transparent 1px)\`,
      backgroundSize: "36px 36px",
    });
  `;
  const extraction = extractFromCode(source);
  assert.deepEqual(
    extraction.colors.map((color) => [color.name, color.value]),
    [
      ['paper', '#f2ede2'],
      ['ink', '#22252b'],
      ['primary', '#a0522d'],
      ['border', '#c6bfaf'],
    ],
  );
  assert.equal(extraction.fonts.display, "'Some Serif',Georgia,serif");
  assert.equal(extraction.fonts.mono, "'Some Mono',ui-monospace,monospace");
  assert.equal(extraction.ease, 'cubic-bezier(0.3,1,0.7,1)');
  assert.deepEqual(extraction.grid, { size: 36, lineOpacity: 0.4 });

  const { core } = mapExtractionToCore(extraction);
  assert.equal(core.bg, '#F2EDE2');
  assert.equal(core.text, '#22252B');
  assert.equal(core.accent, '#A0522D');
  assert.equal(core.rule, '#C6BFAF');
  assert.equal(core.displayWeight, 350);

  const tokens = deriveTokens(core);
  assert.equal(tokens['--ve-bg'], '#F2EDE2');
  assert.equal(tokens['--ve-diagram-grid-size'], '36');
  // Solid-over-grid: node fill and accent fill must be opaque hex, not alpha.
  assert.match(tokens['--ve-node-bg'], /^#[0-9A-F]{6}$/i);
  assert.match(tokens['--ve-diagram-accent-fill'], /^#[0-9A-F]{6}$/i);
});

test('html extractor: :root custom props, @font-face discovery, frequency fallback', () => {
  const html = '<html><head><title>Acme</title><style>.x{color:#ff0000}</style></head><body></body></html>';
  const css = `
    :root { --brand-bg: #101418; --brand-text: #f0f4f8; }
    @font-face { font-family: "Acme Grotesk"; src: url(x.woff2); }
    body { font-family: "Acme Grotesk", ui-sans-serif, system-ui, sans-serif; }
    code { font-family: ui-monospace, monospace; }
  `;
  const extraction = extractFromHtml({ html, cssTexts: [css] });
  assert.deepEqual(
    extraction.colors.map((color) => [color.name, color.value]),
    [
      ['brand-bg', '#101418'],
      ['brand-text', '#f0f4f8'],
    ],
  );
  assert.deepEqual(extraction.fontFaces, ['Acme Grotesk']);
  assert.equal(extraction.fonts.body, '"Acme Grotesk", ui-sans-serif, system-ui, sans-serif');
  // @font-face's own font-family must not claim a slot by itself.
  assert.notEqual(extraction.fonts.display, '"Acme Grotesk"');
  assert.equal(extraction.title, 'Acme');
});

test('image quantization: solid blocks come back as a coverage-ranked palette', () => {
  // 8x4 synthetic RGBA buffer: 50% white, 25% near-black, 25% red.
  const pixels = [];
  const push = (rgb, count) => {
    for (let i = 0; i < count; i += 1) pixels.push(...rgb, 255);
  };
  push([255, 255, 255], 16);
  push([16, 16, 20], 8);
  push([200, 30, 40], 8);
  const palette = quantizePalette(pixels);
  assert.equal(palette[0].value, '#FFFFFF');
  assert.equal(palette[0].share, 0.5);
  assert.deepEqual(palette.map((entry) => entry.value).sort(), ['#101014', '#C81E28', '#FFFFFF']);

  const { core } = mapExtractionToCore({
    modality: 'image',
    colors: [],
    dominant: palette.map(({ value, share }) => ({ name: '', value, count: share })),
    fonts: {},
    notes: [],
  });
  assert.equal(core.bg, '#FFFFFF');
  assert.equal(core.text, '#101014');
  assert.equal(core.accent, '#C81E28');
});

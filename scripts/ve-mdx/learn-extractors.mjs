// Pure extraction + token-mapping logic behind `npm run ve:learn`.
//
// Three modalities feed one shared mapper:
//   code  — TS/JS/CSS token objects (hex colors, font stacks, size ramps)
//   url   — fetched HTML + linked CSS (:root custom props, @font-face,
//           dominant colors); network I/O lives in learn.mjs, this module
//           only sees the already-fetched texts
//   image — RGBA pixels (palette quantization); pixel capture lives in
//           learn.mjs, quantization + mapping here
//
// Everything here is deterministic — the design-system evals
// (evals/design-systems/) treat these functions as the spec: fixture in,
// golden tokens out. Heuristic changes must hill-climb those evals.

// ---------------------------------------------------------------------------
// Color math
// ---------------------------------------------------------------------------

export function normalizeHex(value) {
  let hex = value.trim().toLowerCase();
  if (!hex.startsWith('#')) return null;
  hex = hex.slice(1);
  if (hex.length === 3 || hex.length === 4) hex = [...hex].map((ch) => ch + ch).join('');
  if (hex.length === 8) hex = hex.slice(0, 6); // strip alpha for classification
  if (hex.length !== 6 || /[^0-9a-f]/.test(hex)) return null;
  return `#${hex}`;
}

export function hexToRgb(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  return [1, 3, 5].map((i) => parseInt(normalized.slice(i, i + 2), 16));
}

export function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((ch) => Math.round(Math.max(0, Math.min(255, ch))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((ch) => {
    const s = ch / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function saturation(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((ch) => ch / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const l = (max + min) / 2;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

export function hue(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((ch) => ch / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}

/** Solid composite of fg over bg at `alpha` (the deck's solidTint idiom). */
export function mixHex(fg, bg, alpha) {
  const fgRgb = hexToRgb(fg);
  const bgRgb = hexToRgb(bg);
  return rgbToHex(fgRgb.map((ch, i) => alpha * ch + (1 - alpha) * bgRgb[i]));
}

/** `rgb(r g b / a)` string in the global.css idiom. */
export function rgbA(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}

// ---------------------------------------------------------------------------
// Modality detection
// ---------------------------------------------------------------------------

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp']);

export function detectModality(source) {
  if (/^https?:\/\//i.test(source)) return 'url';
  const ext = source.slice(source.lastIndexOf('.')).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  return 'code';
}

// ---------------------------------------------------------------------------
// Code extractor
// ---------------------------------------------------------------------------

const FONT_GENERICS = /\b(serif|sans-serif|monospace|system-ui|ui-monospace|ui-sans-serif|ui-serif)\b/;

function looksLikeFontStack(value) {
  return value.includes(',') && FONT_GENERICS.test(value);
}

/**
 * Sanitize a free-text value extracted from an untrusted source (remote CSS,
 * arbitrary code files) before it can become a token: strip angle brackets
 * and control characters so learned systems are clean at ingestion — the
 * loader independently rejects such characters at inline time (defense in
 * depth), but a learned tokens.css should never contain them to begin with.
 */
export function sanitizeExtractedValue(value) {
  // eslint-disable-next-line no-control-regex -- stripping raw control bytes is the point
  return value.replace(/[<>\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Extract named hex colors, font stacks, font weights, size ramps, grid
 * geometry, and easing from a TS/JS/CSS token source.
 */
export function extractFromCode(text) {
  const notes = [];
  const colors = [];
  const seen = new Set();

  // `name: "#hex"` / `name = '#hex'` / `--name: #hex` pairs.
  const namedHex = /(?:["']?([\w-]+)["']?\s*[:=]\s*["']?)(#[0-9a-fA-F]{3,8})\b/g;
  for (const match of text.matchAll(namedHex)) {
    const hex = normalizeHex(match[2]);
    if (!hex) continue;
    const name = (match[1] ?? '').replace(/^--/, '');
    const key = `${name}:${hex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    colors.push({ name, value: hex });
  }

  // Font stacks: string values containing a comma-separated list ending in a
  // generic family, keyed by their property name.
  const fonts = {};
  const stringValue = /["']?([\w-]+)["']?\s*[:=]\s*(["'])((?:\\.|(?!\2).)*)\2/g;
  for (const match of text.matchAll(stringValue)) {
    const [, name, , raw] = match;
    if (!looksLikeFontStack(raw)) continue;
    const slot = classifyFontSlot(name, raw);
    if (slot && !fonts[slot]) fonts[slot] = sanitizeExtractedValue(raw);
  }

  // Font weights (numeric); the mode is used as the display/heading weight.
  const weights = [...text.matchAll(/fontWeight:\s*(\d{3})|font-weight:\s*(\d{3})/g)]
    .map((match) => Number(match[1] ?? match[2]));

  // Size ramp: fontSize values (px numbers).
  const sizes = [...new Set(
    [...text.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)|font-size:\s*(\d+(?:\.\d+)?)px/g)]
      .map((match) => Number(match[1] ?? match[2])),
  )].sort((a, b) => a - b);

  // Grid geometry: backgroundSize "40px 40px" + the grid line's rgba alpha
  // (an rgba(...) appearing shortly before the backgroundSize declaration).
  let grid = null;
  const gridSize = text.match(/backgroundSize:\s*["'](\d+)px\s+\d+px["']/);
  if (gridSize) {
    grid = { size: Number(gridSize[1]) };
    // The grid line color is the nearest rgba(...) declared before the
    // backgroundSize declaration (i.e. inside the same grid-paper helper).
    const before = text.slice(Math.max(0, gridSize.index - 400), gridSize.index);
    const alphas = [...before.matchAll(/rgba?\([\d\s,]+(0?\.\d+)\s*\)/g)];
    if (alphas.length > 0) grid.lineOpacity = Number(alphas.at(-1)[1]);
  }

  // Signature easing.
  const ease = text.match(/cubic-bezier\(\s*[\d., ]+\)/)?.[0] ?? null;

  // Border radii (numeric tokens; 999 pills excluded from the surface radius).
  const radii = [...text.matchAll(/borderRadius:\s*(\d+)/g)]
    .map((match) => Number(match[1]))
    .filter((value) => value < 100);

  if (colors.length === 0) notes.push('no hex colors found in source');
  return { modality: 'code', colors, fonts, weights, sizes, grid, ease, radii, notes };
}

function classifyFontSlot(name, stack) {
  const lower = (name ?? '').toLowerCase();
  if (/display|heading|title|serif/.test(lower)) return 'display';
  if (/mono|code/.test(lower)) return 'mono';
  if (/body|sans|text|base|font/.test(lower)) return 'body';
  if (/monospace|ui-monospace/.test(stack)) return 'mono';
  if (/\bserif\b/.test(stack) && !/sans-serif/.test(stack)) return 'display';
  return 'body';
}

// ---------------------------------------------------------------------------
// URL (HTML + CSS) extractor — network-free: caller supplies fetched texts
// ---------------------------------------------------------------------------

/**
 * Extract tokens from a fetched page: `html` plus the text of every
 * stylesheet (`cssTexts`, inline <style> blocks included by the caller).
 */
export function extractFromHtml({ html, cssTexts = [] }) {
  const notes = [];
  const css = cssTexts.join('\n');

  // 1. :root custom properties (highest-signal source).
  const colors = [];
  const rootBlocks = [...css.matchAll(/:root\s*(?:,[^{]*)?\{([^}]*)\}/g)].map((match) => match[1]);
  for (const block of rootBlocks) {
    for (const declaration of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      const hex = normalizeHex(declaration[2].trim());
      if (hex) colors.push({ name: declaration[1].replace(/^--/, ''), value: hex });
    }
  }

  // 2. Dominant colors by frequency across all CSS (fallback / supplement).
  const frequency = new Map();
  for (const match of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    const hex = normalizeHex(match[0]);
    if (!hex) continue;
    frequency.set(hex, (frequency.get(hex) ?? 0) + 1);
  }
  const dominant = [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ name: '', value, count }));

  // 3. @font-face families and font-family declarations.
  const fontFaces = [...css.matchAll(/@font-face\s*\{[^}]*font-family:\s*["']?([^;"'}]+)["']?/g)]
    .map((match) => sanitizeExtractedValue(match[1]));
  const fonts = {};
  // Strip @font-face blocks so their own font-family declarations (bare
  // family names, not usable stacks) don't claim a slot.
  const cssWithoutFontFace = css.replace(/@font-face\s*\{[^}]*\}/g, '');
  for (const match of cssWithoutFontFace.matchAll(/font-family\s*:\s*([^;}]+)/g)) {
    const stack = sanitizeExtractedValue(match[1]);
    if (!looksLikeFontStack(stack) && !fontFaces.some((face) => face && stack.includes(face))) continue;
    const slot = classifyFontSlot('', stack);
    if (!fonts[slot]) fonts[slot] = stack;
  }
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null;

  if (colors.length === 0 && dominant.length === 0) notes.push('no colors found in page CSS');
  if (rootBlocks.length === 0) notes.push('no :root custom-property block found; relying on color frequency');
  return { modality: 'url', colors, dominant, fonts, fontFaces, title, notes };
}

// ---------------------------------------------------------------------------
// Image extractor — pure quantization over RGBA pixel data
// ---------------------------------------------------------------------------

/**
 * Frequency-quantize RGBA pixel data (Uint8Array/array, 4 bytes per pixel)
 * into a palette of `{ value, share }` sorted by coverage. Buckets at 4 bits
 * per channel, then averages the true colors inside each bucket.
 */
export function quantizePalette(data, { maxColors = 8 } = {}) {
  const buckets = new Map();
  let opaque = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue; // ignore transparent pixels
    opaque += 1;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += data[i];
    bucket.g += data[i + 1];
    bucket.b += data[i + 2];
    buckets.set(key, bucket);
  }
  if (opaque === 0) return [];
  return [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, maxColors)
    .map((bucket) => ({
      value: rgbToHex([bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count]),
      share: bucket.count / opaque,
    }));
}

export function extractionFromPalette(palette) {
  const notes = ['fonts cannot be learned from an image; defaulted to system stacks'];
  if (palette.length === 0) notes.push('no opaque pixels found in image');
  return {
    modality: 'image',
    colors: [],
    dominant: palette.map(({ value, share }) => ({ name: '', value, count: share })),
    fonts: {},
    notes,
  };
}

// ---------------------------------------------------------------------------
// Shared mapper: extraction → --ve-* tokens
// ---------------------------------------------------------------------------

const NAME_HINTS = [
  // [token slot, regex over the source token name] — first match wins per slot.
  ['bg', /^(bg|background|cream|paper|canvas|base|surface-0)$|(^|-)bg$|background/],
  ['text', /^(ink|text|fg|foreground|black|body)$|(^|-)(text|ink|fg)$/],
  ['panel', /^(soft|panel|surface|card|subtle)$|(^|-)(panel|surface|card)$/],
  ['rule', /^(border|rule|hairline|line|divider|stroke)$|(^|-)(border|rule|line)$/],
  ['accent', /^(accent|primary|brand|rust|cta|highlight)$|(^|-)(accent|primary|brand)$/],
  ['bgAlt', /^(dark|inverse|night)$|(^|-)(dark|inverse)$/],
  ['heading', /^(heading|title)$|(^|-)heading$/],
];

const MUTED_HINT = /^(muted|gray|grey|secondary|subtle|dim|caption)$|(^|-)(muted|gray|grey)$/;

const STATUS_HINTS = [
  ['ok', /^(ok|success|green|positive|good)$/],
  ['info', /^(info|blue|link)$/],
  ['warn', /^(warn|warning|amber|yellow|caution)$/],
  ['danger', /^(danger|error|red|critical)$/],
];

function classifyStatusByHue(hex) {
  const h = hue(hex);
  const s = saturation(hex);
  if (s < 0.12) return null;
  if (h >= 80 && h <= 170) return 'ok';
  if (h >= 190 && h <= 260) return 'info';
  if (h >= 38 && h <= 72) return 'warn';
  if (h <= 26 || h >= 340) return 'danger';
  return null;
}

/**
 * Map an extraction (any modality) onto a core palette:
 * bg / bgAlt / panel / text / heading / muted / faint / rule / accent /
 * status colors / fonts / weights / radius / grid / ease. Deterministic;
 * every decision is recorded in `report.decisions`.
 */
export function mapExtractionToCore(extraction) {
  const decisions = {};
  const named = extraction.colors ?? [];
  const dominant = extraction.dominant ?? [];
  const core = {};
  const assigned = new Set();

  const claim = (slot, hex, why) => {
    if (core[slot] != null || hex == null) return;
    core[slot] = hex.toUpperCase();
    assigned.add(hex.toUpperCase());
    decisions[slot] = why;
  };

  // Pass 1: name hints on named tokens.
  for (const [slot, pattern] of NAME_HINTS) {
    const hit = named.find((color) => color.name && pattern.test(color.name.toLowerCase()));
    if (hit) claim(slot, hit.value, `name hint "${hit.name}"`);
  }

  // Muted candidates: the darker (higher contrast vs bg) becomes muted, the
  // next becomes faint — muted text must stay readable.
  const mutedCandidates = named
    .filter((color) => color.name && MUTED_HINT.test(color.name.toLowerCase()))
    .filter((color) => !assigned.has(color.value.toUpperCase()));
  if (mutedCandidates.length > 0 && core.bg) {
    const ranked = [...mutedCandidates].sort(
      (a, b) => contrastRatio(b.value, core.bg) - contrastRatio(a.value, core.bg),
    );
    claim('muted', ranked[0].value, `highest-contrast muted candidate "${ranked[0].name}"`);
    if (ranked[1]) claim('faint', ranked[1].value, `next muted candidate "${ranked[1].name}"`);
  }

  // Status colors: explicit name hints, then hue classification of leftovers.
  for (const [slot, pattern] of STATUS_HINTS) {
    const hit = named.find((color) => color.name && pattern.test(color.name.toLowerCase()));
    if (hit) claim(slot, hit.value, `name hint "${hit.name}"`);
  }
  for (const color of named) {
    if (assigned.has(color.value.toUpperCase())) continue;
    const slot = classifyStatusByHue(color.value);
    if (slot && core[slot] == null) claim(slot, color.value, `hue classification of "${color.name || color.value}"`);
  }

  // Pass 2: statistical fallbacks from dominant colors (url/image) or any
  // remaining named colors (code).
  const pool = [
    ...dominant.map((color) => ({ ...color, count: color.count ?? 0 })),
    ...named.map((color) => ({ ...color, count: 0 })),
  ].filter((color) => normalizeHex(color.value));

  if (core.bg == null && pool.length > 0) {
    const byCoverage = [...pool].sort((a, b) => b.count - a.count);
    claim('bg', byCoverage[0].value, 'highest-coverage color');
  }
  if (core.text == null && core.bg) {
    const candidates = pool.filter((color) => !assigned.has(color.value.toUpperCase()));
    const best = candidates.sort((a, b) => contrastRatio(b.value, core.bg) - contrastRatio(a.value, core.bg))[0];
    if (best && contrastRatio(best.value, core.bg) >= 4.5) claim('text', best.value, 'highest contrast vs bg');
  }
  if (core.accent == null && core.bg && core.text) {
    const candidates = pool
      .filter((color) => !assigned.has(color.value.toUpperCase()))
      .filter((color) => contrastRatio(color.value, core.bg) >= 1.6);
    const best = candidates.sort((a, b) => saturation(b.value) - saturation(a.value))[0];
    if (best && saturation(best.value) >= 0.15) claim('accent', best.value, 'most saturated non-bg/text color');
  }

  // Derivable gaps.
  if (core.text == null && core.bg) {
    claim('text', luminance(core.bg) > 0.5 ? '#111111' : '#F5F5F5', 'default ink for bg polarity');
  }
  if (core.heading == null) claim('heading', core.text, 'defaulted to text');
  if (core.muted == null && core.text && core.bg) {
    claim('muted', mixHex(core.text, core.bg, 0.72), 'mix(text 72% over bg)');
  }
  if (core.faint == null) claim('faint', core.muted, 'defaulted to muted');
  if (core.rule == null && core.text && core.bg) {
    claim('rule', mixHex(core.text, core.bg, 0.2), 'mix(text 20% over bg)');
  }
  if (core.panel == null && core.text && core.bg) {
    claim('panel', mixHex(core.text, core.bg, 0.05), 'mix(text 5% over bg)');
  }
  if (core.accent == null) claim('accent', core.text, 'no saturated color found; defaulted to text');
  if (core.bgAlt == null && core.text) claim('bgAlt', core.text, 'defaulted to text (opposite polarity)');

  // accent-contrast: whichever of bg/text reads better on the accent.
  core.accentContrast =
    contrastRatio(core.bg, core.accent) >= contrastRatio(core.text, core.accent) ? core.bg : core.text;
  decisions.accentContrast = 'higher-contrast of bg/text over accent';

  // Status defaults.
  const statusDefaults = { info: '#60A5FA', warn: '#F59E0B', danger: '#EF4444', ok: '#22C55E' };
  for (const [slot, fallback] of Object.entries(statusDefaults)) {
    if (core[slot] == null) claim(slot, fallback, 'generic status default (not found in source)');
  }

  // Typography.
  const fonts = extraction.fonts ?? {};
  core.fontDisplay = fonts.display ?? fonts.body ?? 'ui-sans-serif, system-ui, sans-serif';
  core.fontBody = fonts.body ?? 'ui-sans-serif, system-ui, sans-serif';
  core.fontMono = fonts.mono ?? 'ui-monospace, SFMono-Regular, Menlo, monospace';
  const weights = extraction.weights ?? [];
  core.displayWeight = weights.length > 0 ? modeOf(weights) : 600;
  core.headingWeight = core.displayWeight;

  // Geometry.
  const radii = extraction.radii ?? [];
  core.radius = radii.length > 0 ? `${modeOf(radii)}px` : '0px';
  if (radii.length === 0) decisions.radius = 'no surface radius token found; defaulted to 0px';
  core.grid = extraction.grid ?? null;
  core.ease = extraction.ease ?? null;
  core.sizes = extraction.sizes ?? [];

  return { core, decisions, notes: extraction.notes ?? [] };
}

function modeOf(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Expand a mapped core palette into the full --ve-* token set the presets in
 * global.css define. Derivations mirror the built-in presets' structure.
 */
export function deriveTokens(core) {
  const dark = luminance(core.bg) <= 0.5;
  const codeBg = dark ? core.bg : core.text;
  const codeInk = dark ? core.text : core.bg;
  const gridSize = core.grid?.size ?? 24;
  const gridLineOpacity = core.grid?.lineOpacity ?? (core.grid ? 0.5 : 0.3);
  return {
    '--ve-font-display': core.fontDisplay,
    '--ve-font-body': core.fontBody,
    '--ve-font-mono': core.fontMono,
    '--ve-display-weight': String(core.displayWeight),
    '--ve-heading-weight': String(core.headingWeight),
    '--ve-radius': core.radius,
    '--ve-poster-radius': core.radius,
    '--ve-bg': core.bg,
    '--ve-bg-alt': core.bgAlt,
    '--ve-panel': core.panel,
    // Solid precomposited mixes rather than text-color alpha: an
    // opposite-polarity alpha base reads as a dark surface to contrast
    // tooling (and to any renderer that can't composite), flipping light
    // systems' tables unreadable. Solid also honors solid-over-grid rules.
    '--ve-panel-strong': mixHex(core.text, core.bg, 0.12),
    '--ve-row': mixHex(core.text, core.bg, 0.07),
    '--ve-nav-bg': rgbA(core.bg, 0.92),
    '--ve-review-bg': rgbA(core.bg, 0.96),
    '--ve-rule': core.rule,
    '--ve-heading': core.heading,
    '--ve-text': core.text,
    '--ve-muted': core.muted,
    '--ve-faint': core.faint,
    '--ve-accent': core.accent,
    // Solid precomposite (the tint-over-surface idiom) for the same
    // alpha-background reasons as panel-strong/row above.
    '--ve-accent-soft': mixHex(core.accent, core.bg, 0.12),
    '--ve-accent-contrast': core.accentContrast,
    '--ve-info': core.info,
    '--ve-warn': core.warn,
    '--ve-danger': core.danger,
    '--ve-ok': core.ok,
    '--ve-err': core.danger,
    '--ve-diagram-bg': core.bg,
    '--ve-grid-line': core.rule,
    '--ve-node-bg': core.bg, // solid node fill: grid lines must never show through a box
    '--ve-node-stroke': core.rule,
    '--ve-diagram-ink': core.heading,
    '--ve-diagram-muted': core.muted,
    '--ve-diagram-frame': core.rule,
    '--ve-diagram-accent-fill': mixHex(core.accent, core.bg, 0.0627), // solidTint(accent, bg, "10")
    '--ve-diagram-grid-size': String(gridSize),
    '--ve-grid-dot-r': '0',
    '--ve-grid-dot-opacity': '0',
    '--ve-grid-line-opacity': String(gridLineOpacity),
    '--ve-grid-line-width': '1',
    '--ve-grid-scanline-opacity': '0',
    '--ve-node-radius': String(parseInt(core.radius, 10) || 0),
    '--ve-chip-radius': String(parseInt(core.radius, 10) || 0),
    '--ve-code-bg': codeBg,
    '--ve-code-text': rgbA(codeInk, 0.88),
    '--ve-code-muted': rgbA(codeInk, 0.5),
    '--ve-code-rule': rgbA(codeInk, 0.18),
    '--ve-code-accent': core.warn,
    '--ve-poster-bg': core.bg,
    '--ve-poster-text': core.heading,
    '--ve-poster-muted': rgbA(core.heading, 0.62),
    '--ve-poster-rule': rgbA(core.heading, 0.2),
    '--ve-poster-grid': rgbA(core.heading, 0.08),
    ...(core.ease ? { '--ve-ease': core.ease } : {}),
  };
}

/** Render a token map as a tokens.css file body. */
export function tokensCssText(tokens, { name }) {
  // Belt over the ingestion-time sanitization: no emitted value may carry
  // characters that could escape a <style> element downstream.
  const lines = Object.entries(tokens).map(
    ([prop, value]) => `  ${prop}: ${sanitizeExtractedValue(String(value))};`,
  );
  return [
    `/* Design tokens for "${name}" — artifacture design-system registry format.`,
    '   Declarations are re-scoped to [data-ve-preset="' + name + '"] at export time. */',
    ':root {',
    ...lines,
    '}',
    '',
  ].join('\n');
}

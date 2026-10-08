import { fontAdvances } from './text-metrics-data';
/** The font roles of GraphicFont, repeated so this leaf has no dependencies. */
export type FontRole = 'body' | 'display' | 'mono' | 'math';
export type TextMeasureOptions = Readonly<{ size: number; font?: FontRole; weight?: number; preset?: string }>;
export type MeasuredText = Readonly<{ width: number; family: string; measured: boolean }>;

// Bundled families behind each preset's font roles (themes.css). Families without bundled metrics
// fall back to the nearest bundled family and report `measured: false`.
const roles = {
  iso: { body: 'Inter', display: 'Inter', mono: 'Geist Mono', math: 'STIX Two Math' },
  '3b1b': { body: 'Inter', display: 'EB Garamond', mono: 'Geist Mono', math: 'STIX Two Math' },
  'mono-color': { body: 'Inter', display: 'Inter', mono: 'Geist Mono', math: 'STIX Two Math' },
  algebrica: { body: 'Inter', display: 'EB Garamond', mono: 'Geist Mono', math: 'STIX Two Math' },
  'mono-industrial': { body: 'Space Grotesk', display: 'Space Grotesk', mono: 'Space Mono', math: 'STIX Two Math' },
} satisfies Record<string, Record<FontRole, string>>;
const fallback = new Map([['Space Grotesk', 'Inter']]);
const tables = new Map<string, Readonly<{ '400': Readonly<Record<string, number>>; '600': Readonly<Record<string, number>> | null }>>(Object.entries(fontAdvances));

/** The family a preset uses for a font role. */
export function fontFamilyFor(font: FontRole = 'body', preset = 'iso'): string {
  // SAFETY: Object.hasOwn has just established that preset is one of the roles keys.
  return (Object.hasOwn(roles, preset) ? roles[preset as keyof typeof roles] : roles.iso)[font];
}

/** Advance width of one line in scene units, from the bundled fonts' real glyph widths. */
export function measureText(text: string, options: TextMeasureOptions): MeasuredText {
  if (text !== String(text) || !(options.size > 0) || !Number.isFinite(options.size)) throw new Error('Measuring text needs a string and a positive finite size.');
  const requested = fontFamilyFor(options.font, options.preset);
  const family = tables.has(requested) ? requested : fallback.get(requested) ?? 'Inter';
  const weights = tables.get(family) ?? tables.get('Inter');
  if (!weights) throw new Error('Text metrics are missing the Inter fallback.');
  const table = ((options.weight ?? 400) >= 550 ? weights['600'] : null) ?? weights['400'];
  // Unlisted characters take the width of 'n', a typical lowercase advance.
  const average = table.n ?? .55;
  let width = 0;
  for (const char of text) width += table[char] ?? average;
  return Object.freeze({ width: width * options.size, family, measured: family === requested });
}

/** Break text into lines no wider than `maxWidth`, at spaces; a single long word keeps its own line. */
export function wrapText(text: string, maxWidth: number, options: TextMeasureOptions): readonly string[] {
  if (!(maxWidth > 0)) throw new Error('Wrapping text needs a positive width.');
  const lines: string[] = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || measureText(candidate, options).width <= maxWidth) line = candidate;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return Object.freeze(lines);
}

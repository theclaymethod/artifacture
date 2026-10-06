import { punctumGlyphs } from './punctum-glyphs.mjs';

export function punctumMask(character: string): readonly string[] {
  const mask = Object.hasOwn(punctumGlyphs, character) ? punctumGlyphs[character] : undefined;
  if (!mask) throw new Error(`Unsupported Punctum character: ${JSON.stringify(character)}`);
  return mask;
}

export function punctumAxes(weight: number, roundness: number): void {
  if (!Number.isFinite(weight) || weight < 100 || weight > 900 || !Number.isFinite(roundness) || roundness < 0 || roundness > 100) throw new Error('Punctum weight must be 100–900 and roundness 0–100.');
}

export function punctumLines(text: string): readonly (readonly string[])[] {
  if (text !== String(text) || !text.trim()) throw new Error('A dot display needs nonempty text.');
  const lines = text.split('\n').map(line => Array.from(line));
  if (lines.length > 8 || Math.max(...lines.map(line => line.length)) > 32) throw new Error('Dot displays support at most 8 lines of 32 characters.');
  for (const line of lines) for (const character of line) punctumMask(character);
  return lines;
}

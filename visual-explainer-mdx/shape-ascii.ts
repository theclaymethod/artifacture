import type { AsciiPalette } from './ascii-frame';
import type { GlyphMatcherSettings } from './model-types';

const offsets = [[0.27, 0.20], [0.73, 0.25], [0.25, 0.50], [0.75, 0.50], [0.29, 0.80], [0.71, 0.75]];
const radii = [0.19, 0.19, 0.20, 0.20, 0.19, 0.19];
const defaultGlyphs = " .'`^,;:~+*x#%@";
const defaultFont = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const linear = Array.from({ length: 256 }, (_, index) => {
  const value = index / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
});
type GlyphAtlas = { canvas: HTMLCanvasElement; glyphs: string[]; vectors: number[][] };

function measuredAtlas(glyphs: string[], font: string): GlyphAtlas {
  const canvas = document.createElement('canvas'); canvas.width = glyphs.length * 40; canvas.height = 64;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('The shape matcher requires Canvas 2D.');
  context.font = `52px ${font}`;
  if (!context.font.startsWith('52px ')) throw new Error('The glyph font must be a valid CSS font-family.');
  context.fillStyle = '#000'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#fff'; context.textAlign = 'center'; context.textBaseline = 'middle';
  glyphs.forEach((glyph, index) => context.fillText(glyph, index * 40 + 20, 64 * 0.49));
  const image = context.getImageData(0, 0, canvas.width, 64);
  const vectors = glyphs.map((_, glyphIndex) => offsets.map(([sx, sy], sampleIndex) => {
    let inside = 0, covered = 0;
    for (let y = 0; y < 64; y += 2) for (let x = 0; x < 40; x += 2) {
      if (((x + 0.5) / 40 - sx) ** 2 + ((y + 0.5) / 64 - sy) ** 2 > radii[sampleIndex] ** 2) continue;
      inside++; covered += image.data[(y * canvas.width + glyphIndex * 40 + x) * 4] / 255;
    }
    return inside ? covered / inside : 0;
  }));
  const maxima = offsets.map((_, index) => Math.max(0.001, ...vectors.map(vector => vector[index])));
  vectors.forEach(vector => vector.forEach((value, index) => { vector[index] = value / maxima[index]; }));
  for (let index = 0; index < image.data.length; index += 4) {
    image.data[index + 3] = image.data[index];
    image.data[index] = 255; image.data[index + 1] = 255; image.data[index + 2] = 255;
  }
  context.putImageData(image, 0, 0);
  return { canvas, glyphs, vectors };
}

function tintedAtlas(atlas: HTMLCanvasElement, color: string) {
  const canvas = document.createElement('canvas'); canvas.width = atlas.width; canvas.height = atlas.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The shape matcher requires Canvas 2D.');
  context.drawImage(atlas, 0, 0); context.globalCompositeOperation = 'source-in';
  context.fillStyle = color; context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function fontReady(font: string, glyphs: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const aborted = () => { reject(new DOMException('The model view was disposed.', 'AbortError')); };
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) { signal.removeEventListener('abort', aborted); aborted(); return; }
    document.fonts.load(`52px ${font}`, glyphs).then(() => {
      signal.removeEventListener('abort', aborted);
      if (signal.aborted) aborted(); else resolve();
    }, error => { signal.removeEventListener('abort', aborted); reject(error); });
  });
}

function bounded(value: number, minimum: number, maximum: number, label: string) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} must be ${minimum}–${maximum}.`);
  return value;
}

export function createGlyphMatcher(width: number, height: number, signal: AbortSignal) {
  const source = document.createElement('canvas'); source.width = width; source.height = height;
  const context = source.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('The shape matcher requires Canvas 2D.');
  let atlas: GlyphAtlas | undefined;
  let atlasKey = '', paintKey = '';
  let inkAtlas: HTMLCanvasElement | undefined, accentAtlas: HTMLCanvasElement | undefined;
  const cellCanvas = document.createElement('canvas'); cellCanvas.width = 40; cellCanvas.height = 64;
  const cellContext = cellCanvas.getContext('2d');
  const paintCanvas = document.createElement('canvas'); paintCanvas.width = 1; paintCanvas.height = 1;
  const paintContext = paintCanvas.getContext('2d', { willReadFrequently: true });
  if (!cellContext || !paintContext) throw new Error('The shape matcher requires Canvas 2D.');
  return {
    async draw(target: CanvasRenderingContext2D, sourceImage: CanvasImageSource, palette: AsciiPalette, settings: GlyphMatcherSettings = {}) {
      const requestedCell = bounded(settings.cellSize ?? 10, 5, 80, 'Glyph cell height');
      const exposure = bounded(settings.exposure ?? 1.82, 0.01, 8, 'Glyph exposure');
      const gamma = bounded(settings.gamma ?? 0.9, 0.1, 4, 'Glyph gamma');
      const globalContrast = bounded(settings.globalContrast ?? 1.64, 0.1, 4, 'Glyph global contrast');
      const directionalContrast = bounded(settings.directionalContrast ?? 1.86, 0.1, 4, 'Glyph directional contrast');
      const reveal = bounded(settings.sourceReveal ?? 0, 0, 1, 'Source reveal');
      const chroma = bounded(settings.sourceChroma ?? 0, 0, 1, 'Source chroma');
      const glyphs = Array.from(new Set([' ', ...Array.from(settings.glyphs ?? defaultGlyphs)]));
      if (glyphs.length < 2 || glyphs.length > 16 || glyphs.some(glyph => glyph.charCodeAt(0) < 32 || glyph.charCodeAt(0) === 127)) throw new Error('Shape ASCII requires 2–16 unique printable glyphs including space.');
      const font = settings.font ?? defaultFont;
      if (!font.trim() || font.length > 200) throw new Error('The glyph font must be a nonempty CSS font-family of at most 200 characters.');
      const key = JSON.stringify([glyphs, font]);
      if (key !== atlasKey) {
        await fontReady(font, glyphs.join(''), signal);
        const next = measuredAtlas(glyphs, font);
        if (atlas) atlas.canvas.width = 0;
        atlas = next; atlasKey = key; paintKey = '';
      }
      if (signal.aborted || !atlas) throw new DOMException('The model view was disposed.', 'AbortError');
      const colorsKey = JSON.stringify([palette.ink, palette.accent]);
      if (colorsKey !== paintKey) {
        if (inkAtlas) inkAtlas.width = 0;
        if (accentAtlas) accentAtlas.width = 0;
        inkAtlas = tintedAtlas(atlas.canvas, palette.ink);
        accentAtlas = tintedAtlas(atlas.canvas, palette.accent ?? palette.ink);
        paintKey = colorsKey;
      }
      context.clearRect(0, 0, width, height); context.drawImage(sourceImage, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      const sample = (x: number, y: number) => {
        const px = Math.max(0, Math.min(width - 1, x - 0.5)), py = Math.max(0, Math.min(height - 1, y - 0.5));
        const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
        const weights = [(1 - px + x0) * (1 - py + y0), (px - x0) * (1 - py + y0), (1 - px + x0) * (py - y0), (px - x0) * (py - y0)];
        const indices = [(y0 * width + x0) * 4, (y0 * width + x1) * 4, (y1 * width + x0) * 4, (y1 * width + x1) * 4];
        let tone = 0, alpha = 0, red = 0, green = 0, blue = 0;
        for (let index = 0; index < 4; index++) {
          const offset = indices[index], weight = weights[index];
          tone += (linear[pixels[offset]] * 0.2126 + linear[pixels[offset + 1]] * 0.7152 + linear[pixels[offset + 2]] * 0.0722) * weight;
          alpha += pixels[offset + 3] / 255 * weight;
          red += pixels[offset] * weight; green += pixels[offset + 1] * weight; blue += pixels[offset + 2] * weight;
        }
        return { tone, alpha, red, green, blue };
      };
      target.clearRect(0, 0, width, height);
      if (!settings.transparent && palette.background) { target.fillStyle = palette.background; target.fillRect(0, 0, width, height); }
      const cellHeight = Math.max(requestedCell, height / 135, width / (240 * 0.625));
      const cellWidth = cellHeight * 0.625;
      paintContext.clearRect(0, 0, 1, 1); paintContext.fillStyle = palette.ink; paintContext.fillRect(0, 0, 1, 1);
      const ink = paintContext.getImageData(0, 0, 1, 1).data;
      target.save();
      for (let row = 0; row < Math.ceil(height / cellHeight); row++) for (let column = 0; column < Math.ceil(width / cellWidth); column++) {
        const internal: number[] = [], external: number[] = [];
        let coverage = 0;
        for (const [x, y] of offsets) {
          const inside = sample((column + x) * cellWidth, (row + y) * cellHeight);
          const outside = sample((column + x + (x - 0.5) * 1.18) * cellWidth, (row + y + (y - 0.5) * 1.18) * cellHeight);
          const value = clamp(inside.tone * exposure), outer = clamp(outside.tone * exposure);
          internal.push((settings.invert ? 1 - value : value) * inside.alpha);
          external.push((settings.invert ? 1 - outer : outer) * outside.alpha);
          coverage = Math.max(coverage, inside.alpha);
        }
        const peak = Math.max(...internal);
        if (!coverage || peak < 0.035) continue;
        const normalized = internal.map((value, index) => {
          const global = (value / Math.max(peak, 0.001)) ** globalContrast * peak;
          const directionalPeak = Math.max(global, external[index]);
          const directional = (global / Math.max(directionalPeak, 0.001)) ** directionalContrast * directionalPeak;
          return (directionalContrast > 1.01 ? directional : global) ** gamma;
        });
        let bestDistance = Infinity, best = 0;
        atlas.vectors.forEach((vector, index) => {
          const distance = vector.reduce((sum, value, region) => sum + (normalized[region] - value) ** 2, 0);
          if (distance < bestDistance) { bestDistance = distance; best = index; }
        });
        if (!best) continue;
        const presence = clamp((peak - 0.035) / 0.05);
        target.globalAlpha = presence * presence * (3 - 2 * presence) * coverage * (1 - reveal);
        const center = sample((column + 0.5) * cellWidth, (row + 0.5) * cellHeight);
        let colored = center.green > center.red * 1.18 && center.blue > center.red * 1.18 ? accentAtlas : inkAtlas;
        let sourceX = best * 40;
        if (chroma > 0) {
          cellContext.clearRect(0, 0, 40, 64); cellContext.globalCompositeOperation = 'source-over';
          cellContext.drawImage(atlas.canvas, best * 40, 0, 40, 64, 0, 0, 40, 64);
          cellContext.globalCompositeOperation = 'source-in';
          cellContext.fillStyle = `rgb(${Math.round(ink[0] * (1 - chroma) + center.red * chroma)},${Math.round(ink[1] * (1 - chroma) + center.green * chroma)},${Math.round(ink[2] * (1 - chroma) + center.blue * chroma)})`;
          cellContext.fillRect(0, 0, 40, 64); colored = cellCanvas; sourceX = 0;
        }
        if (colored) target.drawImage(colored, sourceX + 1, 1, 38, 62, column * cellWidth, row * cellHeight, cellWidth, cellHeight);
      }
      if (reveal > 0) { target.globalAlpha = reveal; target.drawImage(source, 0, 0); }
      target.restore();
      return atlas.glyphs.length;
    },
    dispose() {
      source.width = 0; cellCanvas.width = 0; paintCanvas.width = 0;
      if (atlas) atlas.canvas.width = 0;
      if (inkAtlas) inkAtlas.width = 0;
      if (accentAtlas) accentAtlas.width = 0;
    },
  };
}

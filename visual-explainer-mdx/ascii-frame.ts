export type AsciiPalette = Readonly<{ background: string; ink: string; accent?: string }>;
export type AsciiFrameOptions = Readonly<{
  cellSize?: number;
  ramp?: string;
  contrast?: number;
  invert?: boolean;
  palette: AsciiPalette;
}>;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
export function effectCellHash(column: number, row: number, seed = 0) {
  let value = Math.imul(column + 1, 374761393) ^ Math.imul(row + 1, 668265263) ^ Math.imul(seed + 1, 1274126177);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function createAsciiFrame(width: number, height: number) {
  const sample = document.createElement('canvas');
  const context = sample.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('ASCII effects require Canvas 2D.');
  return {
    draw(target: CanvasRenderingContext2D, source: CanvasImageSource, options: AsciiFrameOptions) {
      const cellSize = options.cellSize ?? 12;
      const contrast = options.contrast ?? 1.25;
      if (!Number.isFinite(cellSize) || cellSize < 5 || cellSize > 80 || !Number.isFinite(contrast) || contrast < 0 || contrast > 4) throw new Error('ASCII cellSize must be 5–80; contrast must be 0–4.');
      const ramp = Array.from(options.ramp ?? ' .,:;i1tfLCG08@');
      if (ramp.length < 2 || ramp.length > 64 || ramp.some(glyph => /[\r\n\t]/.test(glyph))) throw new Error('ASCII ramp requires 2–64 printable characters, ordered sparse to dense.');
      const columns = Math.min(240, Math.ceil(width / (cellSize * 0.6)));
      const rows = Math.min(135, Math.ceil(height / cellSize));
      sample.width = columns; sample.height = rows;
      context.clearRect(0, 0, columns, rows);
      context.drawImage(source, 0, 0, columns, rows);
      const pixels = context.getImageData(0, 0, columns, rows).data;
      const cellWidth = width / columns, cellHeight = height / rows;
      target.clearRect(0, 0, width, height);
      if (options.palette.background) { target.fillStyle = options.palette.background; target.fillRect(0, 0, width, height); }
      target.font = `${cellHeight}px ui-monospace, SFMono-Regular, Consolas, monospace`;
      target.textAlign = 'center'; target.textBaseline = 'middle';
      for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const offset = (row * columns + column) * 4;
        if (pixels[offset + 3] < 8) continue;
        let tone = (0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2]) / 255;
        if (options.invert) tone = 1 - tone;
        tone = clamp((tone - 0.5) * contrast + 0.5);
        const glyph = ramp[Math.round(tone * (ramp.length - 1))];
        if (glyph === ' ') continue;
        const cyan = pixels[offset + 1] > pixels[offset] * 1.18 && pixels[offset + 2] > pixels[offset] * 1.18;
        target.fillStyle = cyan && options.palette.accent ? options.palette.accent : options.palette.ink;
        target.fillText(glyph, (column + 0.5) * cellWidth, (row + 0.5) * cellHeight, cellWidth * 1.05);
      }
    },
  };
}

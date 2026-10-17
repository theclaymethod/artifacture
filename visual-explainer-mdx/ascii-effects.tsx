import { useLayoutEffect, useRef, useState } from 'react';
import { createAsciiFrame, effectCellHash, type AsciiFrameOptions } from './ascii-frame';
import { drawEffectSource, effectDimensions, useEffectSource, type EffectSource } from './media-source';

export type AsciiImageProps = AsciiFrameOptions & Readonly<{ source: EffectSource; label: string; width?: number; height?: number; seconds?: number; className?: string }>;

export function AsciiImage({ source, label, width = 960, height = 540, seconds = 0, className, ...options }: AsciiImageProps) {
  effectDimensions(width, height);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('ASCII time must be finite and nonnegative.');
  const canvas = useRef<HTMLCanvasElement>(null);
  const media = useEffectSource(source);
  const [error, setError] = useState<string>();
  const sampler = useRef<ReturnType<typeof createAsciiFrame> | null>(null);
  const frame = useRef<HTMLCanvasElement | null>(null);
  useLayoutEffect(() => {
    sampler.current = createAsciiFrame(width, height);
    frame.current = document.createElement('canvas'); frame.current.width = width; frame.current.height = height;
  }, [width, height]);
  useLayoutEffect(() => {
    const target = canvas.current?.getContext('2d'), context = frame.current?.getContext('2d');
    if (!target || !context || !frame.current || !sampler.current) return;
    if (!media?.image) { target.clearRect(0, 0, width, height); return; }
    try {
      drawEffectSource(context, media.image, width, height, '');
      sampler.current.draw(target, frame.current, options); setError(undefined);
    } catch { setError('Could not sample media pixels. Use a same-origin source or enable CORS.'); }
  }, [media, width, height, seconds, options.cellSize, options.ramp, options.contrast, options.invert, options.palette.background, options.palette.ink, options.palette.accent]);
  return <div className={className} style={{ position: 'relative', aspectRatio: `${width}/${height}` }}>
    <canvas ref={canvas} width={width} height={height} role="img" aria-label={label} style={{ display: 'block', width: '100%', height: '100%' }} />
    {media?.error || error ? <p role="alert">{media?.error ?? error}</p> : null}
  </div>;
}

export type AsciiSweepProps = AsciiFrameOptions & Readonly<{
  from: EffectSource; to: EffectSource; progress: number; label: string; width?: number; height?: number;
  direction?: 'right' | 'left' | 'up' | 'down'; band?: number; seed?: number; className?: string;
}>;

export function AsciiSweep({ from, to, progress, label, width = 960, height = 540, direction = 'right', band = 0.16, seed = 0, className, ...options }: AsciiSweepProps) {
  effectDimensions(width, height);
  if (!Number.isFinite(progress) || progress < 0 || progress > 1 || !Number.isFinite(band) || band < 0.03 || band > 0.5 || !Number.isSafeInteger(seed)) throw new Error('ASCII sweep requires progress 0–1, band 0.03–0.5 and an integer seed.');
  const canvas = useRef<HTMLCanvasElement>(null);
  const first = useEffectSource(from), second = useEffectSource(to);
  const [error, setError] = useState<string>();
  const buffers = useRef<{ a: HTMLCanvasElement; b: HTMLCanvasElement; ascii: HTMLCanvasElement; sampler: ReturnType<typeof createAsciiFrame> } | null>(null);
  useLayoutEffect(() => {
    const make = () => { const item = document.createElement('canvas'); item.width = width; item.height = height; return item; };
    buffers.current = { a: make(), b: make(), ascii: make(), sampler: createAsciiFrame(width, height) };
  }, [width, height]);
  useLayoutEffect(() => {
    const target = canvas.current?.getContext('2d'), storage = buffers.current;
    if (!target || !storage) return;
    if (!first?.image || !second?.image) { target.clearRect(0, 0, width, height); return; }
    const a = storage.a.getContext('2d'), b = storage.b.getContext('2d'), ascii = storage.ascii.getContext('2d');
    if (!a || !b || !ascii) return;
    try {
      drawEffectSource(a, first.image, width, height, options.palette.background);
      drawEffectSource(b, second.image, width, height, options.palette.background);
      target.clearRect(0, 0, width, height);
      target.drawImage(progress === 1 ? storage.b : storage.a, 0, 0);
      if (progress > 0 && progress < 1) {
        storage.sampler.draw(ascii, storage.b, { ...options, palette: { ...options.palette, background: '' } });
        const vertical = direction === 'up' || direction === 'down', reverse = direction === 'left' || direction === 'up';
        const length = vertical ? height : width, across = vertical ? width : height, cell = options.cellSize ?? 12;
        const center = progress * (length + band * length * 2) - band * length;
        for (let row = 0; row < Math.ceil(across / cell); row++) {
          const edge = Math.min(length, Math.max(0, center + (effectCellHash(row, 0, seed) - 0.5) * cell * 3));
          const start = reverse ? length - edge : 0;
          const x = vertical ? row * cell : start, y = vertical ? start : row * cell;
          const w = vertical ? Math.min(cell, width - x) : edge, h = vertical ? edge : Math.min(cell, height - y);
          if (w > 0 && h > 0) target.drawImage(storage.b, x, y, w, h, x, y, w, h);
        }
        const front = reverse ? length - center : center;
        target.save(); target.beginPath();
        if (vertical) target.rect(0, front - band * height / 2, width, band * height); else target.rect(front - band * width / 2, 0, band * width, height);
        target.clip(); target.globalAlpha = Math.min(1, progress * 8, (1 - progress) * 8);
        if (vertical) { target.fillStyle = options.palette.background; target.fillRect(0, front - band * height / 2, width, band * height); }
        else { target.fillStyle = options.palette.background; target.fillRect(front - band * width / 2, 0, band * width, height); }
        target.drawImage(storage.ascii, 0, 0); target.restore();
      }
      setError(undefined);
    } catch { setError('Could not sample sweep pixels. Use same-origin images or enable CORS.'); }
  }, [first, second, width, height, progress, direction, band, seed, options.cellSize, options.ramp, options.contrast, options.invert, options.palette.background, options.palette.ink, options.palette.accent]);
  return <div className={className} style={{ aspectRatio: `${width}/${height}` }}>
    <canvas ref={canvas} width={width} height={height} role="img" aria-label={label} style={{ display: 'block', width: '100%', height: '100%' }} />
    {first?.error || second?.error || error ? <p role="alert">{first?.error ?? second?.error ?? error}</p> : null}
  </div>;
}

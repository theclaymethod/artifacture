import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createVhsRenderer } from './vhs-renderer';
import { drawEffectSource, effectDimensions, useEffectSource, useReducedEffectMotion, type EffectSource } from './media-source';

export type VhsEffectProps = Readonly<{
  source: EffectSource; seconds: number; label: string; width?: number; height?: number; background?: string;
  strength?: number; grain?: number; scanlines?: number; aberration?: number; className?: string;
}>;

export function VhsEffect({ source, seconds, label, width = 960, height = 540, background = '#000', strength = 0.35, grain = 0.16, scanlines = 0.22, aberration = 3, className }: VhsEffectProps) {
  effectDimensions(width, height);
  if (!Number.isFinite(seconds) || seconds < 0 || [strength, grain, scanlines].some(value => !Number.isFinite(value) || value < 0 || value > 1) || !Number.isFinite(aberration) || aberration < 0 || aberration > 20) throw new Error('VHS time must be nonnegative; strength/grain/scanlines 0–1; aberration 0–20 pixels.');
  const canvas = useRef<HTMLCanvasElement>(null), renderer = useRef<ReturnType<typeof createVhsRenderer> | null>(null), frame = useRef<HTMLCanvasElement | null>(null);
  const media = useEffectSource(source), reduced = useReducedEffectMotion();
  const [error, setError] = useState<string>(), [ready, setReady] = useState(false);
  useEffect(() => {
    if (!canvas.current) return;
    try {
      renderer.current = createVhsRenderer(canvas.current);
      frame.current = document.createElement('canvas'); frame.current.width = width; frame.current.height = height;
      setReady(true); setError(undefined);
    } catch { setError('WebGL is unavailable. Use the original media without the VHS filter.'); }
    return () => { renderer.current?.dispose(); renderer.current = null; frame.current = null; };
  }, [width, height]);
  useLayoutEffect(() => {
    const context = frame.current?.getContext('2d');
    if (!ready || !context || !frame.current || !media?.image || !renderer.current) return;
    try {
      drawEffectSource(context, media.image, width, height, background);
      renderer.current.draw(frame.current, { seconds: reduced ? 0 : seconds, strength, grain, scanlines, aberration });
    } catch { setError('Could not filter media pixels. Use a same-origin source or enable CORS.'); }
  }, [ready, media, seconds, reduced, width, height, background, strength, grain, scanlines, aberration]);
  return <div className={className} style={{ aspectRatio: `${width}/${height}` }}>
    <canvas ref={canvas} width={width} height={height} role="img" aria-label={label} style={{ display: 'block', width: '100%', height: '100%' }} />
    {media?.error || error ? <p role="alert">{media?.error ?? error}</p> : null}
  </div>;
}

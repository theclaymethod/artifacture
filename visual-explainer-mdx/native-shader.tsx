import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createShaderSurface, type ShaderSurfaceController, type ShaderSurfaceSettings } from './shader-surface';

export interface NativeShaderProps extends ShaderSurfaceSettings {
  seconds: number;
  label: string;
  style?: CSSProperties;
  className?: string;
  onReady?: (controller: ShaderSurfaceController) => void;
  onError?: (error: Error) => void;
}

export function NativeShader({ effect, props, seconds, label, style, className, onReady, onError }: NativeShaderProps) {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Shader seconds must be finite and nonnegative.');
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<ShaderSurfaceController | null>(null);
  const latest = useRef({ seconds, onReady, onError });
  latest.current = { seconds, onReady, onError };
  const [error, setError] = useState<string | null>(null);
  const configuration = JSON.stringify({ effect, props });
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let cancelled = false;
    let active: ShaderSurfaceController | null = null;
    let observer: ResizeObserver | null = null;
    setError(null);
    const fail = (cause: unknown) => {
      if (cancelled) return;
      const failure = cause instanceof Error ? cause : new Error(String(cause));
      setError(failure.message);
      latest.current.onError?.(failure);
    };
    void createShaderSurface(element, JSON.parse(configuration)).then(async surface => {
      if (cancelled) { surface.dispose(); return; }
      active = surface;
      controller.current = surface;
      observer = new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) surface.resize(width, height);
      });
      observer.observe(element);
      await surface.draw(latest.current.seconds);
      if (!cancelled) latest.current.onReady?.(surface);
    }).catch(fail);
    return () => {
      cancelled = true;
      observer?.disconnect();
      if (controller.current === active) controller.current = null;
      active?.dispose();
    };
  }, [configuration]);
  useEffect(() => {
    const surface = controller.current;
    if (surface) void surface.draw(seconds).catch(cause => {
      if (controller.current !== surface) return;
      const failure = cause instanceof Error ? cause : new Error(String(cause));
      setError(failure.message);
      latest.current.onError?.(failure);
    });
  }, [seconds]);
  return <div className={className} style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', ...style }}>
    <canvas ref={canvas} role="img" aria-label={label} style={{ display: 'block', width: '100%', height: '100%' }} />
    {error && <p role="status" style={{ position: 'absolute', inset: 20 }}>{error}</p>}
  </div>;
}

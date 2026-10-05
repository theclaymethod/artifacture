import { useEffect, useState } from 'react';

export type EffectSource = string | HTMLCanvasElement | HTMLImageElement | HTMLVideoElement | ImageBitmap;
export type EffectImage = Exclude<EffectSource, string>;

// URL strings are a public media boundary; live canvas/video sources remain caller-owned.
export function useEffectSource(source: EffectSource) {
  const [loaded, setLoaded] = useState<{ source: EffectSource; image?: EffectImage; error?: string }>();
  useEffect(() => {
    // eslint-disable-next-line anti-slop/no-runtime-typeof -- Public URL-or-media boundary; URL strings load through Image with CORS.
    if (typeof source !== 'string') { setLoaded({ source, image: source }); return; }
    let active = true;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => { if (active) setLoaded({ source, image }); };
    image.onerror = () => { if (active) setLoaded({ source, error: `Could not load effect source: ${source}` }); };
    image.src = source;
    return () => { active = false; image.onload = null; image.onerror = null; };
  }, [source]);
  return loaded?.source === source ? loaded : undefined;
}

export function useReducedEffectMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

export function effectDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 2_073_600) {
    throw new Error('Effect frames require positive integer dimensions and at most 2,073,600 pixels.');
  }
  return { width, height };
}

export function mediaDimensions(source: EffectImage) {
  if (source instanceof HTMLVideoElement) return { width: source.videoWidth, height: source.videoHeight };
  if (source instanceof HTMLImageElement) return { width: source.naturalWidth, height: source.naturalHeight };
  return { width: Number(source.width), height: Number(source.height) };
}

export function drawEffectSource(context: CanvasRenderingContext2D, source: EffectImage, width: number, height: number, background: string) {
  context.clearRect(0, 0, width, height);
  if (background) { context.fillStyle = background; context.fillRect(0, 0, width, height); }
  const size = mediaDimensions(source);
  if (!size.width || !size.height) return;
  const scale = Math.min(width / size.width, height / size.height);
  context.drawImage(source, (width - size.width * scale) / 2, (height - size.height * scale) / 2, size.width * scale, size.height * scale);
}

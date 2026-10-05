import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReducedEffectMotion } from './media-source';
import { createModelView } from './model-renderer';
import type { ModelFrame, ModelFrameReport, ModelViewController, ModelViewOptions } from './model-types';

export { createModelView } from './model-renderer';
export { modelAsset } from './model-source';
export type { ModelAsset, ModelFactory, ModelFrame, ModelFrameReport, ModelPaint, ModelSource, ModelTreatment, ModelViewController, ModelViewOptions, ParticleSettings, GlyphMatcherSettings } from './model-types';
export type ModelViewProps = ModelViewOptions & ModelFrame & Readonly<{
  label: string;
  className?: string;
  onReady?: (frame: ModelFrameReport) => void;
  onError?: (error: Error) => void;
}>;

export function ModelView(props: ModelViewProps) {
  if (!props.label.trim()) throw new Error('ModelView requires a nonempty accessible label.');
  const canvas = useRef<HTMLCanvasElement>(null), engine = useRef<ModelViewController | null>(null);
  const [revision, setRevision] = useState(0), [error, setError] = useState<string>();
  const ready = useRef(false), callbacks = useRef({ onReady: props.onReady, onError: props.onError });
  const pending = useRef<ModelFrame | null>(null), drawing = useRef<ModelViewController | null>(null);
  callbacks.current = { onReady: props.onReady, onError: props.onError };
  const reduced = useReducedEffectMotion();
  const width = props.width ?? 960, height = props.height ?? 540;
  const source = props.source;
  // Descriptor values, rather than literal object identity, own a built-in source.
  // eslint-disable-next-line anti-slop/no-runtime-typeof -- Factory identity and descriptor identity are distinct public source cases.
  const sourceKey = typeof source === 'function' ? source : source.kind === 'gltf' ? source.src : source.kind === 'geometry' ? source.geometry : source.image;
  // eslint-disable-next-line anti-slop/no-runtime-typeof -- Built-in source discriminator is not present on factory functions.
  const sourceKind = typeof source === 'function' ? 'factory' : source.kind;
  useEffect(() => {
    if (!canvas.current) return;
    let view: ModelViewController;
    try { view = createModelView(canvas.current, { source, width, height }); }
    catch (cause) {
      const failure = cause instanceof Error ? cause : new Error('Could not initialize the model view.');
      setError(failure.message); callbacks.current.onError?.(failure); return;
    }
    engine.current = view; ready.current = false; setError(undefined); setRevision(value => value + 1);
    return () => { if (engine.current === view) { engine.current = null; pending.current = null; } void view.dispose(); };
  }, [sourceKey, sourceKind, width, height]);
  useLayoutEffect(() => {
    const view = engine.current;
    if (!view) return;
    pending.current = { ...props, rotationSpeed: reduced ? 0 : props.rotationSpeed };
    if (canvas.current) { delete canvas.current.dataset.veRenderedSeconds; delete canvas.current.dataset.veRenderedTreatment; }
    if (drawing.current === view) return;
    drawing.current = view;
    void (async () => {
      try {
        while (engine.current === view && pending.current) {
          const frame = pending.current; pending.current = null;
          try {
            const report = await view.draw(frame);
            if (engine.current !== view) return;
            if (!pending.current) setError(undefined);
            if (!ready.current) { ready.current = true; callbacks.current.onReady?.(report); }
          } catch (cause) {
            if (engine.current !== view) return;
            if (!pending.current) {
              const failure = cause instanceof Error ? cause : new Error('Could not render the model view.');
              setError(failure.message); callbacks.current.onError?.(failure);
            }
          }
          if (pending.current && canvas.current) { delete canvas.current.dataset.veRenderedSeconds; delete canvas.current.dataset.veRenderedTreatment; }
        }
      } finally { if (drawing.current === view) drawing.current = null; }
    })();
  }, [revision, props.seconds, props.treatment, props.rotationSpeed, props.palette.ink, props.palette.accent, props.palette.background, props.treatment === 'shape-ascii' ? JSON.stringify(props.ascii) : '', props.treatment === 'luminance-ascii' ? JSON.stringify(props.luminance) : '', props.treatment === 'particles' ? JSON.stringify(props.particles) : '', reduced]);
  return <div className={props.className} style={{ aspectRatio: `${width}/${height}` }}>
    <canvas ref={canvas} width={width} height={height} role="img" aria-label={props.label} style={{ display: 'block', width: '100%', height: '100%' }} />
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}

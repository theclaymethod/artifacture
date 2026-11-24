import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import {
  type Effect,
  effect,
  type Frame,
  type FrameLoopHandle,
  frame,
  frameLoop,
  type Gpu,
  type Surface,
  surface,
} from 'vgpu';
import { getSharedBrowserGpu, getStageState, setStageState } from './shared-stage.ts';
import type { GpuSceneController, GpuSceneDefinition, GpuSceneParams } from './types.ts';
import {
  buildEffectSetBag,
  cloneParams,
  easeOutQuintic,
  inspectUniformBindings,
  lerpParams,
} from './uniforms.ts';

export interface GpuMorphCanvasProps<TParams extends GpuSceneParams = GpuSceneParams> {
  /** Shared stage identifier across pages of a deck (e.g. "hero-gpu"). */
  stageId: string;
  scene: GpuSceneDefinition<TParams>;
  params?: Partial<TParams>;
  /** Duration in ms to interpolate from the outgoing slide's ending params. */
  morphMs?: number;
  /** Keep gentle ambient clock motion after morph settles (defaults to true). */
  ambient?: boolean;
  /** Pre-rendered Dawn PNG still for thumbnails, print/PDF, PPTX, reduced motion, or fallback. */
  stillSrc?: string;
  label: string;
  dpr?: number | readonly [number, number];
  className?: string;
  style?: CSSProperties;
  onError?: (error: Error) => void;
}

function isStaticOrOutgoingHost(el: HTMLElement | null): 'frozen' | 'outgoing' | null {
  if (!el || typeof window === 'undefined') return null;
  if (typeof window.matchMedia === 'function' && window.matchMedia('print').matches) {
    return 'frozen';
  }
  if (el.closest('[data-osd-freeze-motion], #os-print-root, .os-pptx-capture')) {
    return 'frozen';
  }
  // Inside open-slide SlideTransitionLayer, incomingLayerRef sets [data-osd-current-page].
  // If a stage contains a [data-osd-current-page] child and this node is NOT inside it,
  // this mount is the outgoing layer snapshot during a cut.
  const canvasRoot = el.closest('[data-osd-canvas]');
  if (
    canvasRoot &&
    canvasRoot.querySelector('[data-osd-current-page]') &&
    !el.closest('[data-osd-current-page]')
  ) {
    return 'outgoing';
  }
  return null;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Persistent WebGPU canvas for stock `open-slide` decks.
 *
 * `open-slide`'s `MorphElement` clones DOM nodes (`cloneNode(true)`), which blanks
 * any `<canvas>`. `GpuMorphCanvas` solves 3D slide-to-slide morphs without modifying
 * `open-slide`: it shares one `vgpu` device per `stageId`, snapshots outgoing slides
 * cleanly, and smoothly lerps scene parameters / camera poses across page cuts.
 */
export function GpuMorphCanvas<TParams extends GpuSceneParams = GpuSceneParams>({
  stageId,
  scene,
  params,
  morphMs = 700,
  ambient = true,
  stillSrc,
  label,
  dpr = [1, 2],
  className,
  style,
  onError,
}: GpuMorphCanvasProps<TParams>) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [staticImageSrc, setStaticImageSrc] = useState<string | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [readyState, setReadyState] = useState<'loading' | 'ready' | 'fallback'>('loading');

  const targetParams = useMemo(
    () => ({ ...scene.defaultParams, ...(params ?? {}) }) as TParams,
    [scene, params],
  );
  const latestRef = useRef({ targetParams, morphMs, ambient, onError });
  latestRef.current = { targetParams, morphMs, ambient, onError };

  const currentParamsRef = useRef<TParams>(cloneParams(targetParams));
  const currentTimeRef = useRef<number>(scene.stillTime ?? 0);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const hostMode = isStaticOrOutgoingHost(host);
    const prev = getStageState(stageId);

    if (hostMode === 'outgoing') {
      const src = stillSrc ?? prev?.snapshotDataUrl;
      if (src) {
        setStaticImageSrc(src);
        setFallbackReason('outgoing');
        setReadyState('fallback');
        return;
      }
    }

    if (hostMode === 'frozen' || (prefersReducedMotion() && stillSrc)) {
      if (stillSrc) {
        setStaticImageSrc(stillSrc);
        setFallbackReason(hostMode === 'frozen' ? 'frozen-host' : 'reduced-motion');
        setReadyState('fallback');
        return;
      }
    }

    let disposed = false;
    let pendingRaf = 0;
    let gpu: Gpu | null = null;
    let canvasSurface: Surface | null = null;
    let defaultEffect: Effect | null = null;
    let customController: GpuSceneController<TParams> | null = null;
    let loop: FrameLoopHandle | null = null;
    let resizeUnsub: (() => void) | null = null;

    const fromSameScene = prev && prev.sceneId === scene.id;
    const startParams = fromSameScene
      ? ({ ...scene.defaultParams, ...prev.params } as TParams)
      : cloneParams(latestRef.current.targetParams);
    const startTime = fromSameScene ? prev.time : (scene.stillTime ?? 0);
    const morphStartMs = performance.now();

    const fail = (err: unknown) => {
      if (disposed) return;
      const error = err instanceof Error ? err : new Error(String(err));
      setFallbackReason(error.message);
      if (stillSrc) setStaticImageSrc(stillSrc);
      setReadyState('fallback');
      latestRef.current.onError?.(error);
    };

    void (async () => {
      try {
        gpu = await getSharedBrowserGpu();
        if (disposed) return;

        canvasSurface = surface(gpu, canvas, {
          dpr,
          alphaMode: scene.alphaMode ?? 'opaque',
          clearColor: scene.clearColor ?? [0, 0, 0, 1],
        });

        const bindings = inspectUniformBindings(scene.shader);
        if (scene.setup) {
          customController = scene.setup(gpu, canvasSurface, startParams);
          if (customController.compile) await customController.compile(canvasSurface);
        } else {
          defaultEffect = effect(gpu, scene.shader);
          await defaultEffect.compile(canvasSurface);
        }
        if (disposed) return;

        const activeGpu = gpu;
        const activeSurface = canvasSurface;
        const reduced = prefersReducedMotion();

        const renderStep = (nowMs: number, activeFrame?: Frame) => {
          if (disposed) return;
          const { targetParams: goal, morphMs: dur, ambient: liveAmbient } = latestRef.current;
          const elapsedMs = nowMs - morphStartMs;
          const rawT = dur > 0 ? Math.min(1, elapsedMs / dur) : 1;
          const eased = easeOutQuintic(rawT);
          const interpolated = fromSameScene ? lerpParams(startParams, goal, eased) : goal;
          const timeSec =
            liveAmbient && !reduced ? startTime + elapsedMs / 1000 : (scene.stillTime ?? 0);

          currentParamsRef.current = interpolated;
          currentTimeRef.current = timeSec;

          if (customController) {
            customController.renderAt(timeSec, interpolated, activeSurface);
            return;
          }
          const activeEffect = defaultEffect;
          if (activeEffect) {
            const bag = buildEffectSetBag(bindings, interpolated, timeSec, activeSurface.size);
            activeEffect.set(bag);
            if (activeFrame) {
              activeFrame.pass(activeSurface, activeEffect);
            } else {
              frame(activeGpu, (f) => f.pass(activeSurface, activeEffect));
            }
          }
        };

        renderStep(performance.now());
        resizeUnsub = activeSurface.onResize(() => {
          customController?.resize?.(activeSurface.size[0], activeSurface.size[1]);
          cancelAnimationFrame(pendingRaf);
          pendingRaf = requestAnimationFrame(() => {
            if (!disposed) renderStep(performance.now());
          });
        });

        if (reduced) {
          // One clean static GPU frame rendered; no idle loop under reduced motion.
        } else {
          loop = frameLoop(activeGpu, (activeFrame) => {
            renderStep(performance.now(), activeFrame);
          });
        }

        setFallbackReason(null);
        setReadyState('ready');
      } catch (err) {
        fail(err);
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(pendingRaf);
      loop?.stop();
      resizeUnsub?.();
      setStageState(stageId, {
        sceneId: scene.id,
        params: currentParamsRef.current,
        time: currentTimeRef.current,
        snapshotDataUrl: stillSrc ?? prev?.snapshotDataUrl,
      });
      customController?.dispose();
      defaultEffect?.dispose();
      canvasSurface?.dispose();
    };
  }, [stageId, scene, dpr, stillSrc]);

  return (
    <div
      ref={hostRef}
      className={className}
      data-artifacture-gpu={readyState}
      data-artifacture-gpu-reason={fallbackReason ?? undefined}
      data-artifacture-stage={stageId}
      data-artifacture-scene={scene.id}
      style={{
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {staticImageSrc ? (
        <img
          src={staticImageSrc}
          alt={label}
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={label}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      )}
    </div>
  );
}

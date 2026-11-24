import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import {
  clock,
  type Effect,
  effect,
  type Frame,
  type FrameLoopHandle,
  frame,
  frameLoop,
  type Gpu,
  init,
  type Surface,
  surface,
} from 'vgpu';
import type { GpuSceneController, GpuSceneDefinition, GpuSceneParams } from './types.ts';
import { buildEffectSetBag, inspectUniformBindings } from './uniforms.ts';

export interface GpuCanvasProps<TParams extends GpuSceneParams = GpuSceneParams> {
  scene: GpuSceneDefinition<TParams>;
  params?: Partial<TParams>;
  /**
   * When provided (e.g., for HyperFrames video scrubbing or static poses),
   * renders deterministically at that authored timestamp without a RAF loop.
   */
  seconds?: number;
  /** Pre-rendered Dawn PNG still shown for reduced motion, print, or WebGPU fallback. */
  stillSrc?: string;
  label: string;
  dpr?: number | readonly [number, number];
  allowMotionUnderReduced?: boolean;
  className?: string;
  style?: CSSProperties;
  onReady?: () => void;
  onError?: (error: Error) => void;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function isFrozenHostContext(el: HTMLElement | null): boolean {
  if (!el || typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function' && window.matchMedia('print').matches) return true;
  return Boolean(el.closest('[data-osd-freeze-motion], #os-print-root, .os-pptx-capture'));
}

export function GpuCanvas<TParams extends GpuSceneParams = GpuSceneParams>({
  scene,
  params,
  seconds,
  stillSrc,
  label,
  dpr = [1, 2],
  allowMotionUnderReduced = false,
  className,
  style,
  onReady,
  onError,
}: GpuCanvasProps<TParams>) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [readyState, setReadyState] = useState<'loading' | 'ready' | 'fallback'>('loading');

  const mergedParams = useMemo(
    () => ({ ...scene.defaultParams, ...(params ?? {}) }) as TParams,
    [scene, params],
  );
  const hasStaticTime = seconds !== undefined;
  const latestRef = useRef({ mergedParams, seconds, onReady, onError });
  latestRef.current = { mergedParams, seconds, onReady, onError };

  const renderRef = useRef<((t: number) => void) | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const frozen = isFrozenHostContext(host);
    const reduced = prefersReducedMotion() && !allowMotionUnderReduced && !hasStaticTime;
    if ((frozen || reduced) && stillSrc) {
      setFallbackReason(frozen ? 'frozen-host' : 'reduced-motion');
      setReadyState('fallback');
      latestRef.current.onReady?.();
      return;
    }

    let disposed = false;
    let pendingRaf = 0;
    let gpu: Gpu | null = null;
    let canvasSurface: Surface | null = null;
    let defaultEffect: Effect | null = null;
    let customController: GpuSceneController<TParams> | null = null;
    let loop: FrameLoopHandle | null = null;
    let resizeUnsub: (() => void) | null = null;

    const fail = (err: unknown) => {
      if (disposed) return;
      const error = err instanceof Error ? err : new Error(String(err));
      setFallbackReason(error.message);
      setReadyState('fallback');
      latestRef.current.onError?.(error);
    };

    void (async () => {
      try {
        gpu = await init({ powerPreference: 'high-performance' });
        if (disposed) {
          gpu.dispose();
          return;
        }
        void gpu.lost.then((info) => {
          if (!disposed) fail(new Error(`WebGPU device lost: ${info.message}`));
        });

        canvasSurface = surface(gpu, canvas, {
          dpr,
          alphaMode: scene.alphaMode ?? 'opaque',
          clearColor: scene.clearColor ?? [0, 0, 0, 1],
        });

        const bindings = inspectUniformBindings(scene.shader);
        if (scene.setup) {
          customController = scene.setup(gpu, canvasSurface, latestRef.current.mergedParams);
          if (customController.compile) await customController.compile(canvasSurface);
        } else {
          defaultEffect = effect(gpu, scene.shader);
          await defaultEffect.compile(canvasSurface);
        }
        if (disposed) return;

        const activeGpu = gpu;
        const activeSurface = canvasSurface;
        const drawAt = (timeSec: number, activeFrame?: Frame) => {
          if (disposed) return;
          const p = latestRef.current.mergedParams;
          if (customController) {
            customController.renderAt(timeSec, p, activeSurface);
            return;
          }
          const activeEffect = defaultEffect;
          if (activeEffect) {
            const bag = buildEffectSetBag(bindings, p, timeSec, activeSurface.size);
            activeEffect.set(bag);
            if (activeFrame) {
              activeFrame.pass(activeSurface, activeEffect);
            } else {
              frame(activeGpu, (f) => f.pass(activeSurface, activeEffect));
            }
          }
        };

        renderRef.current = (t: number) => drawAt(t);
        resizeUnsub = activeSurface.onResize((ev) => {
          customController?.resize?.(ev.width, ev.height);
          if (hasStaticTime) {
            cancelAnimationFrame(pendingRaf);
            pendingRaf = requestAnimationFrame(() => {
              if (!disposed && latestRef.current.seconds !== undefined) {
                drawAt(latestRef.current.seconds);
              }
            });
          }
        });

        if (latestRef.current.seconds !== undefined) {
          drawAt(latestRef.current.seconds);
        } else if (reduced || frozen) {
          drawAt(scene.stillTime ?? 0);
        } else {
          const gpuClock = clock(activeGpu);
          loop = frameLoop(activeGpu, (activeFrame) => {
            drawAt(gpuClock.time, activeFrame);
          });
        }

        setReadyState('ready');
        latestRef.current.onReady?.();
      } catch (err) {
        fail(err);
      }
    })();

    return () => {
      disposed = true;
      renderRef.current = null;
      cancelAnimationFrame(pendingRaf);
      loop?.stop();
      resizeUnsub?.();
      customController?.dispose();
      defaultEffect?.dispose();
      canvasSurface?.dispose();
      gpu?.dispose();
    };
  }, [scene, dpr, allowMotionUnderReduced, stillSrc, hasStaticTime]);

  useEffect(() => {
    void mergedParams;
    if (seconds !== undefined && renderRef.current) {
      renderRef.current(seconds);
    }
  }, [seconds, mergedParams]);

  return (
    <div
      ref={hostRef}
      className={className}
      data-artifacture-gpu={readyState}
      data-artifacture-gpu-reason={fallbackReason ?? undefined}
      data-artifacture-scene={scene.id}
      style={{
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {fallbackReason && stillSrc ? (
        <img
          src={stillSrc}
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

import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  type Effect,
  effect,
  type Frame,
  frame,
  frameLoop,
  type Gpu,
  type Surface,
  surface,
} from 'vgpu';
import {
  disposePersistentStage,
  getPersistentStage,
  getSharedBrowserGpu,
  getStageState,
  type PersistentStageRecord,
  schedulePersistentStageDetach,
  setPersistentStage,
  setStageState,
} from './shared-stage.ts';
import type { GpuSceneController, GpuSceneDefinition, GpuSceneParams } from './types.ts';
import {
  buildEffectSetBag,
  cloneParams,
  easeInOutCubic,
  inspectUniformBindings,
  lerpParams,
} from './uniforms.ts';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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
 * any `<canvas>`. `GpuMorphCanvas` preserves one live `<canvas>` and `vgpu` pipeline per
 * `stageId`, synchronously reparenting it into incoming slides cleanly while outgoing
 * layers and frozen hosts swap to deterministic Dawn stills.
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
  const canvasSlotRef = useRef<HTMLDivElement>(null);
  const [staticImageSrc, setStaticImageSrc] = useState<string | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [readyState, setReadyState] = useState<'loading' | 'ready' | 'fallback'>('loading');

  const targetParams = useMemo(
    () => ({ ...scene.defaultParams, ...(params ?? {}) }) as TParams,
    [scene, params],
  );
  const latestRef = useRef({ targetParams, morphMs, ambient, onError });
  latestRef.current = { targetParams, morphMs, ambient, onError };

  const ownerTokenRef = useRef<symbol | null>(null);
  const skipParamUpdateEffectRef = useRef(true);

  useIsomorphicLayoutEffect(() => {
    const host = hostRef.current;
    const slot = canvasSlotRef.current;
    if (!host || !slot) return;

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

    const ownerToken = Symbol(stageId);
    ownerTokenRef.current = ownerToken;
    skipParamUpdateEffectRef.current = true;

    const existing = getPersistentStage(stageId);
    if (existing && existing.sceneId === scene.id) {
      if (existing.detachTimer !== null) {
        clearTimeout(existing.detachTimer);
        existing.detachTimer = null;
      }
      existing.ownerToken = ownerToken;
      existing.canvas.setAttribute('aria-label', label);
      if (existing.canvas.parentElement !== slot) {
        slot.replaceChildren(existing.canvas);
      }

      const now = performance.now();
      existing.startParams = cloneParams(existing.currentParams);
      existing.targetParams = cloneParams(latestRef.current.targetParams);
      existing.morphStartMs = now;
      existing.morphDurationMs = latestRef.current.morphMs;
      existing.ambient = latestRef.current.ambient;
      existing.reducedMotion = prefersReducedMotion();
      existing.renderStep(now);

      setStaticImageSrc(null);
      setFallbackReason(null);
      setReadyState('ready');

      return () => {
        if (ownerTokenRef.current === ownerToken) {
          ownerTokenRef.current = null;
        }
        setStageState(stageId, {
          sceneId: scene.id,
          params: existing.currentParams,
          time: existing.currentTimeSec,
          snapshotDataUrl: stillSrc ?? prev?.snapshotDataUrl,
        });
        schedulePersistentStageDetach(stageId, ownerToken, 120);
      };
    }

    if (existing) {
      disposePersistentStage(stageId);
    }

    let cancelled = false;
    let coldRecord: PersistentStageRecord | null = null;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', label);
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    slot.replaceChildren(canvas);

    const fromSameScene = prev && prev.sceneId === scene.id;
    const initialStartParams = fromSameScene
      ? ({ ...scene.defaultParams, ...prev.params } as TParams)
      : cloneParams(latestRef.current.targetParams);
    const initialTimeSec = fromSameScene ? prev.time : (scene.stillTime ?? 0);

    let pendingSurface: Surface | null = null;
    let defaultEffect: Effect | null = null;
    let customController: GpuSceneController<TParams> | null = null;

    const fail = (err: unknown) => {
      if (cancelled) return;
      const error = err instanceof Error ? err : new Error(String(err));
      canvas.remove();
      setFallbackReason(error.message);
      if (stillSrc) setStaticImageSrc(stillSrc);
      setReadyState('fallback');
      latestRef.current.onError?.(error);
    };

    void (async () => {
      try {
        const gpu: Gpu = await getSharedBrowserGpu();
        if (cancelled) return;

        pendingSurface = surface(gpu, canvas, {
          dpr,
          alphaMode: scene.alphaMode ?? 'opaque',
          clearColor: scene.clearColor ?? [0, 0, 0, 1],
        });

        const bindings = inspectUniformBindings(scene.shader);
        if (scene.setup) {
          customController = scene.setup(gpu, pendingSurface, initialStartParams);
          if (customController.compile) await customController.compile(pendingSurface);
        } else {
          defaultEffect = effect(gpu, scene.shader);
          await defaultEffect.compile(pendingSurface);
        }
        if (cancelled) {
          customController?.dispose();
          defaultEffect?.dispose();
          pendingSurface.dispose();
          canvas.remove();
          return;
        }

        const activeSurface = pendingSurface;
        const activeController = customController;
        const activeEffect = defaultEffect;
        const readyNowMs = performance.now();

        const record: PersistentStageRecord = {
          stageId,
          sceneId: scene.id,
          canvas,
          gpu,
          surface: activeSurface,
          bindings,
          customController: activeController as GpuSceneController | null,
          ownerToken,
          detachTimer: null,
          loop: null,
          resizeUnsub: null,
          pendingRaf: 0,
          disposed: false,
          startParams: cloneParams(initialStartParams),
          targetParams: cloneParams(latestRef.current.targetParams),
          currentParams: cloneParams(initialStartParams),
          morphStartMs: readyNowMs,
          morphDurationMs: latestRef.current.morphMs,
          ambient: latestRef.current.ambient,
          baseTimeSec: initialTimeSec,
          clockOriginMs: readyNowMs,
          currentTimeSec: initialTimeSec,
          stillTimeSec: scene.stillTime ?? 0,
          reducedMotion: prefersReducedMotion(),
          renderStep: () => {},
          dispose: () => {
            cancelAnimationFrame(record.pendingRaf);
            record.loop?.stop();
            record.resizeUnsub?.();
            activeController?.dispose();
            activeEffect?.dispose();
            activeSurface.dispose();
            canvas.remove();
          },
        };

        record.renderStep = (nowMs: number, activeFrame?: Frame) => {
          if (record.disposed) return;
          const elapsedMs = Math.max(0, nowMs - record.morphStartMs);
          const rawT =
            record.morphDurationMs > 0 ? Math.min(1, elapsedMs / record.morphDurationMs) : 1;
          const eased = easeInOutCubic(rawT);
          const interpolated = lerpParams(record.startParams, record.targetParams, eased);
          const timeSec =
            record.ambient && !record.reducedMotion
              ? record.baseTimeSec + Math.max(0, nowMs - record.clockOriginMs) / 1000
              : record.stillTimeSec;

          record.currentParams = interpolated;
          record.currentTimeSec = timeSec;

          if (activeController) {
            activeController.renderAt(timeSec, interpolated as TParams, activeSurface);
            return;
          }
          if (activeEffect) {
            const bag = buildEffectSetBag(bindings, interpolated, timeSec, activeSurface.size);
            activeEffect.set(bag);
            if (activeFrame) {
              activeFrame.pass(activeSurface, activeEffect);
            } else {
              frame(gpu, (f) => f.pass(activeSurface, activeEffect));
            }
          }
        };

        record.renderStep(readyNowMs);
        record.resizeUnsub = activeSurface.onResize(() => {
          activeController?.resize?.(activeSurface.size[0], activeSurface.size[1]);
          cancelAnimationFrame(record.pendingRaf);
          record.pendingRaf = requestAnimationFrame(() => {
            if (!record.disposed) record.renderStep(performance.now());
          });
        });

        if (!record.reducedMotion) {
          record.loop = frameLoop(gpu, (activeFrame) => {
            record.renderStep(performance.now(), activeFrame);
          });
        }

        coldRecord = record;
        setPersistentStage(stageId, record);
        setStaticImageSrc(null);
        setFallbackReason(null);
        setReadyState('ready');
      } catch (err) {
        customController?.dispose();
        defaultEffect?.dispose();
        pendingSurface?.dispose();
        fail(err);
      }
    })();

    return () => {
      cancelled = true;
      if (ownerTokenRef.current === ownerToken) {
        ownerTokenRef.current = null;
      }
      if (coldRecord) {
        setStageState(stageId, {
          sceneId: scene.id,
          params: coldRecord.currentParams,
          time: coldRecord.currentTimeSec,
          snapshotDataUrl: stillSrc ?? prev?.snapshotDataUrl,
        });
        schedulePersistentStageDetach(stageId, ownerToken, 120);
      } else {
        customController?.dispose();
        defaultEffect?.dispose();
        pendingSurface?.dispose();
        canvas.remove();
      }
    };
  }, [stageId, scene, dpr, stillSrc, label]);

  useEffect(() => {
    if (skipParamUpdateEffectRef.current) {
      skipParamUpdateEffectRef.current = false;
      return;
    }
    const token = ownerTokenRef.current;
    const record = getPersistentStage(stageId);
    if (!record || !token || record.ownerToken !== token) return;

    const now = performance.now();
    record.startParams = cloneParams(record.currentParams);
    record.targetParams = cloneParams(targetParams);
    record.morphStartMs = now;
    record.morphDurationMs = morphMs;
    record.ambient = ambient;
    record.renderStep(now);
  }, [stageId, targetParams, morphMs, ambient]);

  const loadingBackdropSrc =
    readyState === 'loading' && !staticImageSrc ? (stillSrc ?? null) : null;
  const shownStaticSrc = staticImageSrc ?? loadingBackdropSrc;

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
      <div ref={canvasSlotRef} style={{ position: 'absolute', inset: 0 }} />
      {shownStaticSrc ? (
        <img
          src={shownStaticSrc}
          alt={label}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </div>
  );
}

import { type Frame, type FrameLoopHandle, type Gpu, init, type Surface } from 'vgpu';
import type { GpuSceneController, GpuSceneParams } from './types.ts';
import { cloneParams, type UniformBindingInfo } from './uniforms.ts';

export interface StageState {
  readonly sceneId: string;
  readonly params: GpuSceneParams;
  readonly time: number;
  readonly snapshotDataUrl?: string;
}

export interface PersistentStageRecord {
  readonly stageId: string;
  readonly sceneId: string;
  readonly canvas: HTMLCanvasElement;
  readonly gpu: Gpu;
  readonly surface: Surface;
  readonly bindings: readonly UniformBindingInfo[];
  readonly customController: GpuSceneController | null;
  ownerToken: symbol;
  detachTimer: ReturnType<typeof setTimeout> | null;
  loop: FrameLoopHandle | null;
  resizeUnsub: (() => void) | null;
  pendingRaf: number;
  disposed: boolean;
  startParams: GpuSceneParams;
  targetParams: GpuSceneParams;
  currentParams: GpuSceneParams;
  morphStartMs: number;
  morphDurationMs: number;
  ambient: boolean;
  baseTimeSec: number;
  clockOriginMs: number;
  currentTimeSec: number;
  stillTimeSec: number;
  reducedMotion: boolean;
  renderStep: (nowMs: number, activeFrame?: Frame) => void;
  dispose: () => void;
}

let sharedBrowserGpuPromise: Promise<Gpu> | null = null;
const stageStates = new Map<string, StageState>();
const persistentStages = new Map<string, PersistentStageRecord>();

/**
 * Acquire a shared browser `Gpu` device so transitioning between slides does not
 * leak adapters or recompile pipelines on every page turn.
 */
export function getSharedBrowserGpu(): Promise<Gpu> {
  if (!sharedBrowserGpuPromise) {
    sharedBrowserGpuPromise = init({ powerPreference: 'high-performance' }).then((gpu) => {
      void gpu.lost.then(() => {
        sharedBrowserGpuPromise = null;
      });
      return gpu;
    });
    sharedBrowserGpuPromise.catch(() => {
      sharedBrowserGpuPromise = null;
    });
  }
  return sharedBrowserGpuPromise;
}

export function getStageState(stageId: string): StageState | undefined {
  return stageStates.get(stageId);
}

export function setStageState(stageId: string, state: StageState): void {
  stageStates.set(stageId, {
    sceneId: state.sceneId,
    params: cloneParams(state.params),
    time: state.time,
    snapshotDataUrl: state.snapshotDataUrl,
  });
}

export function getPersistentStage(stageId: string): PersistentStageRecord | undefined {
  const record = persistentStages.get(stageId);
  if (!record || record.disposed) return undefined;
  return record;
}

export function setPersistentStage(stageId: string, record: PersistentStageRecord): void {
  const existing = persistentStages.get(stageId);
  if (existing && existing !== record) {
    disposePersistentStage(stageId);
  }
  persistentStages.set(stageId, record);
}

export function disposePersistentStage(stageId: string): void {
  const record = persistentStages.get(stageId);
  if (!record) return;
  if (record.detachTimer !== null) {
    clearTimeout(record.detachTimer);
    record.detachTimer = null;
  }
  persistentStages.delete(stageId);
  if (!record.disposed) {
    record.disposed = true;
    record.dispose();
  }
}

/**
 * Schedules cleanup of a persistent `<canvas>` stage unless a newly mounted slide
 * claims the same `stageId` synchronously before the timeout fires.
 */
export function schedulePersistentStageDetach(
  stageId: string,
  ownerToken: symbol,
  delayMs = 120,
): void {
  const record = persistentStages.get(stageId);
  if (!record || record.disposed) return;
  if (record.ownerToken !== ownerToken) return;
  if (record.detachTimer !== null) {
    clearTimeout(record.detachTimer);
  }
  record.detachTimer = setTimeout(() => {
    record.detachTimer = null;
    const current = persistentStages.get(stageId);
    if (current === record && current.ownerToken === ownerToken) {
      disposePersistentStage(stageId);
    }
  }, delayMs);
}

export function clearSharedStageRegistry(): void {
  for (const stageId of Array.from(persistentStages.keys())) {
    disposePersistentStage(stageId);
  }
  stageStates.clear();
  sharedBrowserGpuPromise = null;
}

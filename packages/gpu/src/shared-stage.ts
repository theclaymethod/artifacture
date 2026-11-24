import { type Gpu, init } from 'vgpu';
import type { GpuSceneParams } from './types.ts';
import { cloneParams } from './uniforms.ts';

export interface StageState {
  readonly sceneId: string;
  readonly params: GpuSceneParams;
  readonly time: number;
  readonly snapshotDataUrl?: string;
}

let sharedBrowserGpuPromise: Promise<Gpu> | null = null;
const stageStates = new Map<string, StageState>();

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

export function clearSharedStageRegistry(): void {
  stageStates.clear();
  sharedBrowserGpuPromise = null;
}

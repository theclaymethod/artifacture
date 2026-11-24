import type { Effect, Frame, Gpu, ShaderSource, Target } from 'vgpu';

export type GpuParamScalar = number;
export type GpuParamVector = readonly number[];
export type GpuParamValue = GpuParamScalar | GpuParamVector;
export type GpuSceneParams = Record<string, GpuParamValue>;

export interface GpuSceneController<TParams extends GpuSceneParams = GpuSceneParams> {
  /** Resize intermediate targets if the scene owns any. */
  resize?(width: number, height: number): void;
  /** Update uniforms and draw one frame into `target`, reusing `activeFrame` inside frame loops. */
  renderAt(timeSeconds: number, params: TParams, target: Target, activeFrame?: Frame): void;
  /** Optional pipeline warm-up before the first visible frame. */
  compile?(target: Target): Promise<void>;
  dispose(): void;
}

export type GpuAlphaMode = 'opaque' | 'premultiplied';

export interface GpuSceneDefinition<TParams extends GpuSceneParams = GpuSceneParams> {
  readonly id: string;
  readonly label: string;
  readonly shader: ShaderSource;
  readonly defaultParams: TParams;
  /** Default Dawn still dimensions in pixels (defaults to 1920x1080). */
  readonly stillSize?: readonly [number, number];
  /** Deterministic timestamp in seconds for Dawn still capture and reduced-motion frame. */
  readonly stillTime?: number;
  readonly alphaMode?: GpuAlphaMode;
  readonly clearColor?: readonly [number, number, number, number];
  /**
   * Optional custom setup for multi-pass / compute / mesh scenes.
   * When omitted, `@artifacture/gpu` compiles `shader` as a fullscreen `effect(gpu)`
   * and populates its uniform struct fields automatically from `params`, `time`,
   * `resolution`, and `texel`.
   */
  setup?(gpu: Gpu, target: Target, initialParams: TParams): GpuSceneController<TParams>;
}

export type GpuEffectEntry = {
  effect: Effect;
  bindingName: string;
  members: ReadonlySet<string>;
};

import { createGpuUniformsMap, rootPassthrough, shaderRendererGPU, type GpuShaderDefinition } from 'shaders/core';
import Plasma, { type ComponentProps as PlasmaProps } from 'shaders/core/Plasma';
import SimplexNoise, { type ComponentProps as SimplexNoiseProps } from 'shaders/core/SimplexNoise';
import Spiral, { type ComponentProps as SpiralProps } from 'shaders/core/Spiral';

export const shaderEffects = ['Plasma', 'SimplexNoise', 'Spiral'] as const;
export type ShaderEffect = typeof shaderEffects[number];
export type ShaderSurfaceProps = Partial<PlasmaProps & SimplexNoiseProps & SpiralProps>;
export interface ShaderSurfaceSettings {
  effect: ShaderEffect;
  props?: ShaderSurfaceProps;
}
export interface ShaderSurfaceController {
  draw(seconds: number): Promise<void>;
  resize(width: number, height: number): void;
  dispose(): void;
}

/** Original analytic shaders sampled through the upstream frame-locked GPU API. */
export async function createShaderSurface(canvas: HTMLCanvasElement, settings: ShaderSurfaceSettings): Promise<ShaderSurfaceController> {
  const definitions = { Plasma, SimplexNoise, Spiral } satisfies Record<ShaderEffect, GpuShaderDefinition>;
  if (!Object.hasOwn(definitions, settings.effect)) throw new Error('Unsupported controlled shader. Use the original React components for other effects.');
  const definition: GpuShaderDefinition = definitions[settings.effect];
  const props = Object.fromEntries(Object.entries(definition.props).map(([key, config]) => [key, config.default]));
  for (const [key, value] of Object.entries(settings.props ?? {})) {
    if (!Object.hasOwn(props, key)) throw new Error(`Unknown ${settings.effect} prop: ${key}.`);
    props[key] = value;
  }
  const speed = props.speed;
  if (!Number.isFinite(speed)) throw new Error('Controlled shader speed must be a finite number.');
  const renderer = shaderRendererGPU();
  let disposed = false;
  let sampled = 0;
  let pending: Promise<void> = Promise.resolve();
  try {
    await renderer.initialize({ canvas, observeElement: false, forceFullFrameRate: true });
    renderer.stopAnimation();
    const failure = renderer.getFailureReason();
    if (failure || !renderer.isInitialized()) throw new Error(`WebGPU shader unavailable: ${failure ?? 'initialization failed'}.`);
    renderer.registerNode('root', rootPassthrough.fragment, null, null, {}, rootPassthrough);
    // Native invalidation frames keep speed zero. Only the awaited host sample advances it.
    const uniforms = createGpuUniformsMap(definition, { ...props, speed: 0 }, 'effect');
    renderer.registerNode('effect', definition.fragment, 'root', { renderOrder: 0, blendMode: 'normal', opacity: 1 }, uniforms, definition);
  } catch (error) {
    renderer.cleanup();
    throw error;
  }
  return {
    draw(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) return Promise.reject(new Error('Shader seconds must be finite and nonnegative.'));
      const frame = pending.then(async () => {
        if (disposed) throw new Error('Shader surface is disposed.');
        renderer.updateUniformValue('effect', 'speed', speed);
        let finished: Promise<void>;
        try {
          finished = renderer.renderSyntheticFrame(seconds - sampled);
        } finally {
          // renderSyntheticFrame submits synchronously, before awaiting its GPU fence.
          renderer.updateUniformValue('effect', 'speed', 0);
        }
        await finished;
        const failure = renderer.getFailureReason();
        if (failure) throw new Error(`WebGPU shader unavailable: ${failure}.`);
        sampled = seconds;
      });
      pending = frame.catch(() => {});
      return frame;
    },
    resize(width, height) {
      if (disposed) throw new Error('Shader surface is disposed.');
      if (![width, height].every(value => Number.isFinite(value) && value > 0)) throw new Error('Shader dimensions must be positive.');
      renderer.resize(width, height);
    },
    dispose() {
      disposed = true;
      renderer.cleanup();
    },
  };
}

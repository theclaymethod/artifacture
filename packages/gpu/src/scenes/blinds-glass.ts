import type { ShaderSource } from 'vgpu';
import type { GpuSceneDefinition } from '../types.ts';
import shader from './blinds-glass.wgsl.ts';

export type BlindsGlassParams = {
  periods: number;
  angleDeg: number;
  refraction: number;
  dispersion: number;
  phase: number;
  focusX: number;
  focusY: number;
  baseColor: readonly [number, number, number];
  signalColor: readonly [number, number, number];
  heatColor: readonly [number, number, number];
};

export const blindsGlassScene: GpuSceneDefinition<BlindsGlassParams> = {
  id: 'blinds-glass',
  label: 'Fluted chromatic glass backdrop',
  shader: shader as ShaderSource,
  stillTime: 1.0,
  stillSize: [1920, 1080],
  defaultParams: {
    periods: 22,
    angleDeg: -30,
    refraction: 1.05,
    dispersion: 1.15,
    phase: 0.0,
    focusX: 0.58,
    focusY: 0.44,
    baseColor: [0.051, 0.098, 0.086],
    signalColor: [0.475, 0.741, 0.545],
    heatColor: [0.91, 0.604, 0.439],
  },
};

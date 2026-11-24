import type { ShaderSource } from 'vgpu';
import type { GpuSceneDefinition } from '../types.ts';
import shader from './liquid-prism.wgsl.ts';

export type LiquidPrismParams = {
  morph: number;
  yaw: number;
  pitch: number;
  zoom: number;
  offsetX: number;
  dispersion: number;
  refraction: number;
  bgColor: readonly [number, number, number];
  accentColor: readonly [number, number, number];
};

export const liquidPrismScene: GpuSceneDefinition<LiquidPrismParams> = {
  id: 'liquid-prism',
  label: 'Refractive liquid glass prism',
  shader: shader as ShaderSource,
  stillTime: 0.8,
  stillSize: [1920, 1080],
  defaultParams: {
    morph: 0.0,
    yaw: 0.45,
    pitch: 0.22,
    zoom: 1.0,
    offsetX: 0.32,
    dispersion: 1.0,
    refraction: 1.48,
    bgColor: [0.97, 0.96, 0.94],
    accentColor: [0.03, 0.62, 0.73],
  },
};

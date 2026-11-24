import type { GpuSceneDefinition } from '@artifacture/gpu';
import waveFieldShader from '../shaders/wave-field.wgsl';

export type WaveFieldParams = {
  frequency: number;
  amplitude: number;
  baseColor: readonly [number, number, number];
  accentColor: readonly [number, number, number];
};

export const waveFieldScene: GpuSceneDefinition<WaveFieldParams> = {
  id: 'wave-field',
  label: 'Harmonic interference field rendered directly from WGSL',
  shader: waveFieldShader,
  stillTime: 1.2,
  stillSize: [1280, 720],
  defaultParams: {
    frequency: 6.5,
    amplitude: 0.18,
    baseColor: [0.965, 0.972, 0.984],
    accentColor: [0.027, 0.624, 0.729],
  },
};

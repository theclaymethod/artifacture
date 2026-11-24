import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { effect, frame, init, target } from 'vgpu/mock';
import { describe, expect, it } from 'vitest';
import {
  buildEffectSetBag,
  easeInOutCubic,
  inspectUniformBindings,
  lerpParams,
} from '../src/index.ts';
import { compileWgslFile, computeRgbStdDev } from '../src/node/index.ts';
import { liquidPrismScene } from '../src/scenes/index.ts';

describe('@artifacture/gpu uniforms, mock execution, and compiler', () => {
  it('interpolates numeric and tuple uniforms via lerpParams and easeInOutCubic', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.25)).toBeLessThan(0.1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeInOutCubic(0.75)).toBeGreaterThan(0.9);
    expect(easeInOutCubic(1)).toBe(1);

    const mid = lerpParams(
      { morph: 0, yaw: -1, color: [0, 0.5, 1] },
      { morph: 1, yaw: 1, color: [1, 1, 0] },
      0.5,
    );
    expect(mid.morph).toBeCloseTo(0.5);
    expect(mid.yaw).toBeCloseTo(0);
    expect(mid.color[0]).toBeCloseTo(0.5);
    expect(mid.color[1]).toBeCloseTo(0.75);
    expect(mid.color[2]).toBeCloseTo(0.5);
  });

  it('builds reflected uniform bags and runs effect submission against vgpu/mock', async () => {
    const bindings = inspectUniformBindings(liquidPrismScene.shader);
    expect(bindings.length).toBeGreaterThan(0);

    const bag = buildEffectSetBag(bindings, liquidPrismScene.defaultParams, 1.25, [1920, 1080]);
    expect(bag.params).toBeDefined();
    expect(bag.params.time).toBe(1.25);

    const gpu = await init();
    try {
      const offscreen = target(gpu, { size: [64, 64], format: 'rgba8unorm' });
      const eff = effect(gpu, liquidPrismScene.shader);
      await eff.compile(offscreen);
      eff.set(bag);
      const submitted = frame(gpu, (f) => f.pass(offscreen, eff));
      await submitted.done;
      eff.dispose();
    } finally {
      gpu.dispose();
    }
  });

  it('compiles WGSL sources into self-contained modules and computes RGB stddev', async () => {
    const compiled = await compileWgslFile(
      path.resolve(import.meta.dirname, '../src/scenes/blinds-glass.wgsl'),
    );
    expect(compiled.outPath.endsWith('.wgsl.ts')).toBe(true);
    const code = await readFile(compiled.outPath, 'utf8');
    expect(code).toContain('_vgpuFreeze');

    const uniformRgba = new Uint8Array([42, 42, 42, 255, 42, 42, 42, 255]);
    expect(computeRgbStdDev(uniformRgba)).toBe(0);

    const tintedRgba = new Uint8Array([10, 20, 30, 255, 10, 20, 30, 255]);
    expect(computeRgbStdDev(tintedRgba)).toBeGreaterThan(0);

    const variedRgba = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]);
    expect(computeRgbStdDev(variedRgba)).toBeCloseTo(127.5);
    expect(os.tmpdir()).toBeTruthy();
  });
});

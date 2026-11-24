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
import {
  gaussianSplatScene,
  liquidPrismScene,
  mirrorCityScene,
  parseSplatBuffer,
  splatFxScene,
} from '../src/scenes/index.ts';

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

  it('compiles and submits custom 2-pass gaussianSplatScene setup on vgpu/mock', async () => {
    const gpu = await init();
    try {
      const offscreen = target(gpu, { size: [128, 72], format: 'rgba8unorm' });
      const controller = gaussianSplatScene.setup?.(
        gpu,
        offscreen,
        gaussianSplatScene.defaultParams,
      );
      expect(controller).toBeDefined();
      if (!controller) return;
      try {
        if (controller.compile) await controller.compile(offscreen);
        const submitted = frame(gpu, (f) =>
          controller.renderAt(1.0, gaussianSplatScene.defaultParams, offscreen, f),
        );
        await submitted.done;
      } finally {
        controller.dispose();
      }
    } finally {
      gpu.dispose();
    }
  });

  it('compiles and dispatches compute-sorted mirrorCityScene on vgpu/mock', async () => {
    const gpu = await init();
    try {
      const offscreen = target(gpu, { size: [128, 72], format: 'rgba8unorm' });
      const controller = mirrorCityScene.setup?.(gpu, offscreen, mirrorCityScene.defaultParams);
      expect(controller).toBeDefined();
      if (!controller) return;
      try {
        if (controller.compile) await controller.compile(offscreen);
        const submitted = frame(gpu, (f) =>
          controller.renderAt(1.2, mirrorCityScene.defaultParams, offscreen, f),
        );
        await submitted.done;
      } finally {
        controller.dispose();
      }
    } finally {
      gpu.dispose();
    }
  });

  it('parses 32-byte .splat records and pads to power-of-2 GPU buffer size', () => {
    const raw = new ArrayBuffer(32 * 2);
    const dv = new DataView(raw);
    const bytes = new Uint8Array(raw);
    // Splat 0: pos (1, 2, -3), scale (0.4, 0.5, 0.6), rgba (255, 128, 0, 255), identity quat (255, 128, 128, 128)
    dv.setFloat32(0, 1, true);
    dv.setFloat32(4, 2, true);
    dv.setFloat32(8, -3, true);
    dv.setFloat32(12, 0.4, true);
    dv.setFloat32(16, 0.5, true);
    dv.setFloat32(20, 0.6, true);
    bytes[24] = 255;
    bytes[25] = 128;
    bytes[26] = 0;
    bytes[27] = 255;
    bytes[28] = 255;
    bytes[29] = 128;
    bytes[30] = 128;
    bytes[31] = 128;

    const parsed = parseSplatBuffer(raw, 512);
    expect(parsed.length).toBe(512 * 16);
    expect(parsed[0]).toBeCloseTo(1);
    expect(parsed[1]).toBeCloseTo(2);
    expect(parsed[2]).toBeCloseTo(-3);
    expect(parsed[3]).toBeCloseTo(1);
    expect(parsed[4]).toBeCloseTo(0.4);
    expect(parsed[11]).toBeCloseTo(1);
    expect(parsed[12]).toBeCloseTo(1);
    expect(parsed[13]).toBeCloseTo(128 / 255);
    expect(parsed[14]).toBeCloseTo(0);
    expect(parsed[32 + 3]).toBe(0);
  });

  it('compiles and dispatches compute-sorted splatFxScene on vgpu/mock', async () => {
    const gpu = await init();
    try {
      const offscreen = target(gpu, { size: [128, 72], format: 'rgba8unorm' });
      const controller = splatFxScene.setup?.(gpu, offscreen, splatFxScene.defaultParams);
      expect(controller).toBeDefined();
      if (!controller) return;
      try {
        if (controller.compile) await controller.compile(offscreen);
        const submitted = frame(gpu, (f) =>
          controller.renderAt(1.6, splatFxScene.defaultParams, offscreen, f),
        );
        await submitted.done;
      } finally {
        controller.dispose();
      }
    } finally {
      gpu.dispose();
    }
  });
});

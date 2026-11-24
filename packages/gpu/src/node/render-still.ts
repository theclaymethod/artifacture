import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { clock, effect, frame, init, target } from 'vgpu/node';
import type { GpuSceneDefinition, GpuSceneParams } from '../types.ts';
import { buildEffectSetBag, inspectUniformBindings } from '../uniforms.ts';

export interface RenderStillOptions<TParams extends GpuSceneParams = GpuSceneParams> {
  readonly scene: GpuSceneDefinition<TParams>;
  readonly params?: Partial<TParams>;
  readonly outPath: string;
  readonly width?: number;
  readonly height?: number;
  readonly seconds?: number;
}

export interface RenderedStillMetrics {
  readonly outPath: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly stddev: number;
}

export function computeRgbStdDev(rgba: Uint8Array): number {
  const pixelCount = Math.floor(rgba.length / 4);
  if (pixelCount === 0) return 0;
  let sum = 0;
  let sumSq = 0;
  const totalChannels = pixelCount * 3;
  for (let i = 0; i < pixelCount; i++) {
    const base = i * 4;
    for (let c = 0; c < 3; c++) {
      const v = rgba[base + c];
      sum += v;
      sumSq += v * v;
    }
  }
  const mean = sum / totalChannels;
  const variance = Math.max(0, sumSq / totalChannels - mean * mean);
  return Math.sqrt(variance);
}

/**
 * Render a deterministic still PNG of any `GpuSceneDefinition` using headless Dawn (`vgpu/node`).
 * Used for PDF/PPTX fallbacks, reduced-motion snapshots, non-WebGPU browsers, and video frames.
 */
export async function renderSceneStill<TParams extends GpuSceneParams = GpuSceneParams>(
  opts: RenderStillOptions<TParams>,
): Promise<RenderedStillMetrics> {
  const width = opts.width ?? opts.scene.stillSize?.[0] ?? 1920;
  const height = opts.height ?? opts.scene.stillSize?.[1] ?? 1080;
  const seconds = opts.seconds ?? opts.scene.stillTime ?? 1.2;
  const merged = { ...opts.scene.defaultParams, ...(opts.params ?? {}) } as TParams;

  const gpu = await init();
  try {
    const offscreen = target(gpu, {
      size: [width, height],
      format: 'rgba8unorm',
      clearColor: opts.scene.clearColor ?? [0, 0, 0, 1],
    });
    if (seconds > 0) {
      clock(gpu).advance(seconds);
    }

    if (opts.scene.setup) {
      const controller = opts.scene.setup(gpu, offscreen, merged);
      try {
        if (controller.compile) await controller.compile(offscreen);
        controller.renderAt(seconds, merged, offscreen);
      } finally {
        controller.dispose();
      }
    } else {
      const eff = effect(gpu, opts.scene.shader);
      try {
        await eff.compile(offscreen);
        const bindings = inspectUniformBindings(opts.scene.shader);
        const bag = buildEffectSetBag(bindings, merged, seconds, [width, height]);
        eff.set(bag);
        const submitted = frame(gpu, (f) => f.pass(offscreen, eff));
        await submitted.done;
      } finally {
        eff.dispose();
      }
    }

    const pixels = await offscreen.color.read({ mipLevel: 0, region: 'all' });
    const png = new PNG({ width, height });
    png.data.set(pixels);
    const buf = PNG.sync.write(png);

    const outPath = path.resolve(opts.outPath);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, buf);

    return {
      outPath,
      width,
      height,
      bytes: buf.byteLength,
      stddev: computeRgbStdDev(pixels),
    };
  } finally {
    gpu.dispose();
  }
}

export interface RenderSequenceOptions<TParams extends GpuSceneParams = GpuSceneParams> {
  readonly scene: GpuSceneDefinition<TParams>;
  readonly outDir: string;
  readonly width?: number;
  readonly height?: number;
  readonly fps?: number;
  readonly durationSeconds: number;
  readonly paramsAtTime?: (seconds: number) => Partial<TParams>;
}

/**
 * Render a deterministic PNG frame sequence on a single Dawn `Gpu` context.
 */
export async function renderSceneSequence<TParams extends GpuSceneParams = GpuSceneParams>(
  opts: RenderSequenceOptions<TParams>,
): Promise<readonly { frameIndex: number; seconds: number; path: string }[]> {
  const width = opts.width ?? opts.scene.stillSize?.[0] ?? 1920;
  const height = opts.height ?? opts.scene.stillSize?.[1] ?? 1080;
  const fps = opts.fps ?? 30;
  const frameCount = Math.max(1, Math.round(opts.durationSeconds * fps));
  const outDir = path.resolve(opts.outDir);
  await mkdir(outDir, { recursive: true });

  const gpu = await init();
  const outputs: { frameIndex: number; seconds: number; path: string }[] = [];
  try {
    const offscreen = target(gpu, {
      size: [width, height],
      format: 'rgba8unorm',
      clearColor: opts.scene.clearColor ?? [0, 0, 0, 1],
    });
    const bindings = inspectUniformBindings(opts.scene.shader);
    const eff = opts.scene.setup ? null : effect(gpu, opts.scene.shader);
    const controller = opts.scene.setup
      ? opts.scene.setup(gpu, offscreen, opts.scene.defaultParams)
      : null;

    try {
      if (eff) await eff.compile(offscreen);
      if (controller?.compile) await controller.compile(offscreen);

      const gpuClock = clock(gpu);
      const dt = 1 / fps;
      for (let i = 0; i < frameCount; i++) {
        const sec = i * dt;
        if (i > 0) gpuClock.advance(dt);
        const merged = {
          ...opts.scene.defaultParams,
          ...(opts.paramsAtTime ? opts.paramsAtTime(sec) : {}),
        } as TParams;

        if (controller) {
          controller.renderAt(sec, merged, offscreen);
        } else if (eff) {
          const bag = buildEffectSetBag(bindings, merged, sec, [width, height]);
          eff.set(bag);
          const submitted = frame(gpu, (f) => f.pass(offscreen, eff));
          await submitted.done;
        }

        const pixels = await offscreen.color.read({ mipLevel: 0, region: 'all' });
        const png = new PNG({ width, height });
        png.data.set(pixels);
        const framePath = path.join(outDir, `frame-${String(i).padStart(5, '0')}.png`);
        await writeFile(framePath, PNG.sync.write(png));
        outputs.push({ frameIndex: i, seconds: sec, path: framePath });
      }
    } finally {
      controller?.dispose();
      eff?.dispose();
    }
  } finally {
    gpu.dispose();
  }
  return outputs;
}

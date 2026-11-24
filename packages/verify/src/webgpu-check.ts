import { computeRgbStdDev } from '@artifacture/gpu/node';
import type { Page } from 'playwright';
import { PNG } from 'pngjs';

export interface PngMetrics {
  readonly width: number;
  readonly height: number;
  readonly stddev: number;
}

export interface WebGpuCanvasReport {
  readonly sceneId: string;
  readonly state: string;
  readonly reason?: string;
  readonly width: number;
  readonly height: number;
  readonly hasCanvas: boolean;
  readonly hasImgFallback: boolean;
}

export interface WebGpuInspection {
  readonly hasNavigatorGpu: boolean;
  readonly hasAdapter: boolean;
  readonly canvases: readonly WebGpuCanvasReport[];
  readonly readyCount: number;
  readonly fallbackCount: number;
  readonly errorCount: number;
}

/**
 * Computes pixel dimensions and RGB standard deviation from an encoded PNG buffer.
 */
export function analyzePngBuffer(buffer: Buffer): PngMetrics {
  const png = PNG.sync.read(buffer);
  const stddev = computeRgbStdDev(png.data);
  return {
    width: png.width,
    height: png.height,
    stddev: Number(stddev.toFixed(2)),
  };
}

/**
 * Inspects `navigator.gpu`, active WebGPU adapter support, and all visible Artifacture GPU canvases on the page.
 */
export async function inspectWebGpuSurface(
  page: Page,
  opts: { rootSelector?: string; waitMs?: number } = {},
): Promise<WebGpuInspection> {
  const waitMs = opts.waitMs ?? 2500;
  const selector = opts.rootSelector
    ? `${opts.rootSelector} [data-artifacture-gpu]`
    : '[data-osd-current-page] [data-artifacture-gpu], [data-artifacture-gpu]';

  await page
    .waitForFunction(
      (sel) => {
        const nodes = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter(
          (el) => !el.closest('[data-osd-freeze-motion]'),
        );
        if (nodes.length === 0) return true;
        return nodes.every((el) => el.dataset.artifactureGpu !== 'initializing');
      },
      selector,
      { timeout: waitMs },
    )
    .catch(() => {});

  return page.evaluate(async (sel) => {
    const gpu = (
      navigator as unknown as { gpu?: { requestAdapter?: () => Promise<unknown | null> } }
    ).gpu;
    const hasNavigatorGpu = Boolean(gpu);
    let hasAdapter = false;
    if (gpu?.requestAdapter) {
      try {
        hasAdapter = Boolean(await gpu.requestAdapter());
      } catch {
        hasAdapter = false;
      }
    }

    const candidates = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter(
      (el) => !el.closest('[data-osd-freeze-motion]'),
    );
    const seen = new Set<HTMLElement>();
    const canvases: WebGpuCanvasReport[] = [];

    for (const el of candidates) {
      if (seen.has(el)) continue;
      seen.add(el);
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      canvases.push({
        sceneId: el.dataset.artifactureScene ?? 'unknown',
        state: el.dataset.artifactureGpu ?? 'unknown',
        reason: el.dataset.artifactureGpuReason,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        hasCanvas: Boolean(el.querySelector('canvas')),
        hasImgFallback: Boolean(el.querySelector('img')),
      });
    }

    return {
      hasNavigatorGpu,
      hasAdapter,
      canvases,
      readyCount: canvases.filter((c) => c.state === 'ready').length,
      fallbackCount: canvases.filter((c) => c.state === 'fallback').length,
      errorCount: canvases.filter((c) => c.state === 'error').length,
    };
  }, selector);
}

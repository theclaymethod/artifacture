import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import type { Page } from 'playwright';
import { PNG } from 'pngjs';
import { launchVerifyBrowser, settlePageForCapture } from './browser.ts';
import { auditPageGeometry, type GeometrySummary } from './geometry.ts';
import { analyzePngBuffer, inspectWebGpuSurface, type WebGpuInspection } from './webgpu-check.ts';

export type ReviewSurface = 'slides' | 'explainer' | 'video';

export interface ReviewOptions {
  readonly surface: ReviewSurface;
  readonly url: string;
  readonly outDir: string;
  readonly pages?: readonly number[];
  readonly allPages?: boolean;
  readonly seekTimes?: readonly number[];
  readonly expectWebGpu?: boolean;
  readonly testDrills?: boolean;
  readonly headless?: boolean;
}

export interface CaptureEntry {
  readonly id: string;
  readonly label: string;
  readonly file: string;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly stddev: number;
  readonly webgpu: WebGpuInspection;
  readonly geometry: GeometrySummary;
  readonly drillVerified?: boolean;
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
  readonly httpFailures: readonly string[];
}

export interface VideoDeterminismReport {
  readonly timestamps: readonly number[];
  readonly rewindPixelDiff: number | null;
}

export interface ReviewReport {
  readonly ok: boolean;
  readonly surface: ReviewSurface;
  readonly url: string;
  readonly browserMode: 'headless' | 'headed';
  readonly outDir: string;
  readonly contactSheetPath: string;
  readonly manifestPath: string;
  readonly reportPath: string;
  readonly captures: readonly CaptureEntry[];
  readonly videoDeterminism?: VideoDeterminismReport;
}

function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function isBlockingConsoleError(text: string): boolean {
  if (text.includes('Encountered a script tag while rendering React component')) return false;
  return true;
}

async function captureCurrentView(
  page: Page,
  outDir: string,
  id: string,
  label: string,
  rootSelector?: string,
): Promise<{
  entry: Omit<CaptureEntry, 'consoleErrors' | 'pageErrors' | 'httpFailures'>;
  pngBuffer: Buffer;
}> {
  await settlePageForCapture(page, 250);
  const webgpu = await inspectWebGpuSurface(page, { rootSelector });
  const geometry = await auditPageGeometry(page, { rootSelector });
  const pngBuffer = await page.screenshot({ type: 'png' });
  const metrics = analyzePngBuffer(pngBuffer);
  const file = `${id}.png`;
  await writeFile(path.join(outDir, file), pngBuffer);

  return {
    pngBuffer,
    entry: {
      id,
      label,
      file,
      sha256: sha256Hex(pngBuffer),
      width: metrics.width,
      height: metrics.height,
      stddev: metrics.stddev,
      webgpu,
      geometry,
    },
  };
}

async function verifySlideDrills(page: Page): Promise<boolean | undefined> {
  const trigger = page.locator('[data-osd-current-page] [data-drill-target]').first();
  if ((await trigger.count()) === 0) return undefined;
  await trigger.click();
  await page.waitForSelector('[data-osd-current-page] [data-drill-open="true"]', { timeout: 3000 });
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-osd-current-page] [data-drill-open="true"]', {
    state: 'detached',
    timeout: 3000,
  });
  return true;
}

function renderContactSheetHtml(
  report: Omit<ReviewReport, 'contactSheetPath' | 'manifestPath' | 'reportPath'>,
): string {
  const cards = report.captures
    .map((cap) => {
      const geoCount = cap.geometry.violations.length;
      const errCount = cap.consoleErrors.length + cap.pageErrors.length + cap.httpFailures.length;
      return `
      <article class="card">
        <img src="./${cap.file}" alt="${cap.label}" />
        <div class="meta">
          <div class="title">${cap.label}</div>
          <div class="row">${cap.width}x${cap.height} · stddev ${cap.stddev}</div>
          <div class="row">GPU: ${cap.webgpu.readyCount} ready / ${cap.webgpu.fallbackCount} fallback · adapter ${cap.webgpu.hasAdapter}</div>
          <div class="row">Geometry issues: ${geoCount} · Errors: ${errCount}${cap.drillVerified ? ' · Drill OK' : ''}</div>
        </div>
      </article>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Artifacture Review — ${report.surface}</title>
<style>
  body { margin: 0; padding: 28px; background: #141416; color: #ececf0; font: 14px/1.45 -apple-system, BlinkMacSystemFont, sans-serif; }
  h1 { margin: 0 0 6px; font-size: 20px; }
  .sub { margin: 0 0 22px; color: #a1a1aa; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 18px; }
  .card { border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; overflow: hidden; background: #1c1c20; }
  .card img { display: block; width: 100%; height: auto; background: #0d0d0f; }
  .meta { padding: 12px 14px; }
  .title { font-weight: 600; margin-bottom: 4px; }
  .row { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; color: #a1a1aa; }
</style>
</head>
<body>
  <h1>Artifacture Review (${report.surface})</h1>
  <p class="sub">${report.url} · browser: ${report.browserMode} · captures: ${report.captures.length}</p>
  <div class="grid">${cards}</div>
</body>
</html>
`;
}

/**
 * Runs a single-pass live Chromium review for slides, explainer, or video surfaces.
 */
export async function runReview(opts: ReviewOptions): Promise<ReviewReport> {
  const outDir = path.resolve(opts.outDir);
  await mkdir(outDir, { recursive: true });

  const launched = await launchVerifyBrowser({
    webgpu: opts.expectWebGpu ?? true,
    headless: opts.headless ?? true,
    autoHeadedFallback: true,
  });

  const captures: CaptureEntry[] = [];
  let videoDeterminism: VideoDeterminismReport | undefined;

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const httpFailures: string[] = [];

  try {
    const context = await launched.browser.newContext({
      viewport:
        opts.surface === 'slides' ? { width: 1440, height: 900 } : { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (isBlockingConsoleError(text)) consoleErrors.push(text);
      }
    });
    page.on('response', (res) => {
      if (res.status() >= 400) {
        httpFailures.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.goto(opts.url, { waitUntil: 'networkidle' });

    const drainErrors = () => ({
      consoleErrors: consoleErrors.splice(0),
      pageErrors: pageErrors.splice(0),
      httpFailures: httpFailures.splice(0),
    });

    if (opts.surface === 'slides') {
      await page.waitForSelector('[data-osd-current-page], a[href*="/s/"]', { timeout: 25000 });
      const hasCurrentPage = (await page.locator('[data-osd-current-page]').count()) > 0;
      if (!hasCurrentPage) {
        const deckLink = page.locator('a[href*="/s/"]').first();
        if ((await deckLink.count()) > 0) {
          await deckLink.click();
          await page.waitForSelector('[data-osd-current-page]', { timeout: 25000 });
          await page.waitForLoadState('networkidle').catch(() => {});
          await page.waitForTimeout(400);
          drainErrors();
        }
      }
      if ((await page.locator('[data-inspector-root]').count()) > 0) {
        await page.keyboard.press('Enter');
        await page.waitForSelector('[data-osd-current-page]', { timeout: 25000 });
        await page.waitForTimeout(850);
        drainErrors();
      }
      const targetPages = opts.pages && opts.pages.length > 0 ? new Set(opts.pages) : null;
      const visited = new Set<number>();

      for (let step = 0; step < 64; step++) {
        const currentStr = await page
          .locator('[data-osd-current-page]')
          .first()
          .getAttribute('data-osd-current-page');
        const currentIndex = Number.parseInt(currentStr ?? String(step), 10);
        const humanPage = currentIndex + 1;
        if (visited.has(currentIndex)) break;
        visited.add(currentIndex);

        for (let stepPress = 0; stepPress < 12; stepPress++) {
          const pendingSteps = await page
            .locator('[data-osd-current-page] [data-osd-step="pending"]')
            .count();
          if (pendingSteps === 0) break;
          await page.keyboard.press('ArrowRight');
          await page.waitForTimeout(220);
          const nextPageStr = await page
            .locator('[data-osd-current-page]')
            .first()
            .getAttribute('data-osd-current-page');
          if (nextPageStr !== currentStr) break;
        }

        if (!targetPages || targetPages.has(humanPage)) {
          const drillVerified =
            opts.testDrills !== false ? await verifySlideDrills(page) : undefined;
          const { entry } = await captureCurrentView(
            page,
            outDir,
            `slide-${String(humanPage).padStart(2, '0')}`,
            `Slide ${humanPage}`,
            '[data-osd-current-page]',
          );
          captures.push({
            ...entry,
            drillVerified,
            ...drainErrors(),
          });
        }

        if (!opts.allPages && !opts.pages) break;
        if (targetPages && Array.from(targetPages).every((p) => visited.has(p - 1))) break;

        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(950);
        const afterStr = await page
          .locator('[data-osd-current-page]')
          .first()
          .getAttribute('data-osd-current-page');
        const afterIndex = Number.parseInt(afterStr ?? String(currentIndex), 10);
        if (afterIndex === currentIndex) break;
      }
    } else if (opts.surface === 'explainer') {
      const viewports: Array<{ id: string; label: string; width: number; height: number }> = [
        {
          id: 'explainer-desktop',
          label: 'Explainer Desktop (1440x900)',
          width: 1440,
          height: 900,
        },
        { id: 'explainer-mobile', label: 'Explainer Mobile (390x844)', width: 390, height: 844 },
      ];
      for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const { entry } = await captureCurrentView(page, outDir, vp.id, vp.label);
        captures.push({
          ...entry,
          ...drainErrors(),
        });
      }
    } else {
      const timestamps = opts.seekTimes && opts.seekTimes.length > 0 ? opts.seekTimes : [0, 1.5, 0];
      const frameBuffers: Array<{ t: number; png: Buffer }> = [];
      for (let idx = 0; idx < timestamps.length; idx++) {
        const t = timestamps[idx];
        await page.evaluate(async (time) => {
          const seekFn = (
            window as unknown as { __seek?: (seconds: number) => void | Promise<void> }
          ).__seek;
          if (typeof seekFn === 'function') {
            await seekFn(time);
          }
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
        }, t);
        const { entry, pngBuffer } = await captureCurrentView(
          page,
          outDir,
          `video-frame-${idx}-t${String(t).replace('.', '_')}`,
          `Video Seek t=${t.toFixed(2)}s (#${idx})`,
        );
        frameBuffers.push({ t, png: pngBuffer });
        captures.push({
          ...entry,
          ...drainErrors(),
        });
      }

      let rewindPixelDiff: number | null = null;
      if (
        frameBuffers.length >= 2 &&
        frameBuffers[0].t === frameBuffers[frameBuffers.length - 1].t
      ) {
        const a = PNG.sync.read(frameBuffers[0].png);
        const b = PNG.sync.read(frameBuffers[frameBuffers.length - 1].png);
        if (a.width === b.width && a.height === b.height) {
          rewindPixelDiff = pixelmatch(a.data, b.data, undefined, a.width, a.height, {
            threshold: 0.01,
          });
        }
      }
      videoDeterminism = { timestamps, rewindPixelDiff };
    }

    await context.close();
  } finally {
    await launched.close();
  }

  const expectWebGpu = opts.expectWebGpu ?? true;
  const ok =
    captures.length > 0 &&
    captures.every((cap) => {
      const noErrors =
        cap.consoleErrors.length === 0 &&
        cap.pageErrors.length === 0 &&
        cap.httpFailures.length === 0;
      const nonBlank = cap.stddev > 0;
      const noGeo = cap.geometry.violations.length === 0;
      const gpuOk =
        !expectWebGpu ||
        cap.webgpu.canvases.length === 0 ||
        (cap.webgpu.hasAdapter && cap.webgpu.errorCount === 0 && cap.webgpu.readyCount > 0);
      return noErrors && nonBlank && noGeo && gpuOk;
    }) &&
    (videoDeterminism?.rewindPixelDiff === undefined || videoDeterminism.rewindPixelDiff === 0);

  const reportPath = path.join(outDir, 'report.json');
  const manifestPath = path.join(outDir, 'manifest.json');
  const contactSheetPath = path.join(outDir, 'contact-sheet.html');

  const partial = {
    ok,
    surface: opts.surface,
    url: opts.url,
    browserMode: launched.mode,
    outDir,
    captures,
    videoDeterminism,
  };

  const fullReport: ReviewReport = {
    ...partial,
    reportPath,
    manifestPath,
    contactSheetPath,
  };

  await writeFile(reportPath, `${JSON.stringify(fullReport, null, 2)}\n`, 'utf8');
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        surface: opts.surface,
        generatedAt: new Date().toISOString(),
        files: captures.map((c) => ({ id: c.id, file: c.file, sha256: c.sha256 })),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  await writeFile(contactSheetPath, renderContactSheetHtml(partial), 'utf8');

  return fullReport;
}

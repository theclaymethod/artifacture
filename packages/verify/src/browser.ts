import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type Browser, type BrowserServer, chromium, type Page } from 'playwright';

export interface LaunchVerifyBrowserOptions {
  readonly webgpu?: boolean;
  readonly headless?: boolean;
  readonly autoHeadedFallback?: boolean;
  readonly executablePath?: string;
}

export interface LaunchedVerifyBrowser {
  readonly browser: Browser;
  readonly executablePath: string;
  readonly mode: 'headless' | 'headed';
  readonly webgpuArgs: readonly string[];
  close(): Promise<void>;
}

function expandHome(value: string): string {
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

/**
 * Resolves a local Chrome/Chromium binary without requiring separate headless-shell downloads.
 */
export function resolveChromiumBinary(explicitPath?: string): string {
  const configured =
    explicitPath?.trim() ||
    process.env.PLAYWRIGHT_EXECUTABLE_PATH?.trim() ||
    process.env.CHROME_PATH?.trim();

  if (configured) {
    const resolved = path.resolve(expandHome(configured));
    if (!fs.existsSync(resolved)) {
      throw new Error(`Browser binary not found: ${resolved}`);
    }
    return resolved;
  }

  const candidates =
    process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
          '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
        ]
      : process.platform === 'win32'
        ? [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
            .filter((root): root is string => Boolean(root))
            .map((root) => path.join(root, 'Google/Chrome/Application/chrome.exe'))
        : ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (found) return found;

  const bundled = chromium.executablePath();
  if (fs.existsSync(bundled)) return bundled;

  throw new Error(
    'No Chrome/Chromium executable found. Install Google Chrome, run `pnpm exec playwright install chromium`, or set PLAYWRIGHT_EXECUTABLE_PATH.',
  );
}

/**
 * Returns browser launch flags enabling WebGPU across macOS Metal and Linux/Windows environments.
 */
export function buildWebGpuLaunchArgs(): string[] {
  const args = ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];
  if (process.platform === 'darwin') {
    args.push('--use-angle=metal');
  }
  return args;
}

async function probeAdapter(browser: Browser): Promise<boolean> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    return await page.evaluate(async () => {
      const gpu = (
        navigator as unknown as { gpu?: { requestAdapter?: () => Promise<unknown | null> } }
      ).gpu;
      if (!gpu?.requestAdapter) return false;
      const adapter = await gpu.requestAdapter();
      return Boolean(adapter);
    });
  } catch {
    return false;
  } finally {
    await context.close().catch(() => {});
  }
}

async function launchOnce(
  executablePath: string,
  headless: boolean,
  webgpuArgs: readonly string[],
): Promise<{ browser: Browser; server: BrowserServer }> {
  const server = await chromium.launchServer({
    executablePath,
    headless,
    host: '127.0.0.1',
    args: [...webgpuArgs],
  });
  try {
    const browser = await chromium.connect(server.wsEndpoint());
    return { browser, server };
  } catch (err) {
    await server.kill().catch(() => {});
    throw err;
  }
}

function wrapBrowser(
  browser: Browser,
  server: BrowserServer,
  executablePath: string,
  mode: 'headless' | 'headed',
  webgpuArgs: readonly string[],
): LaunchedVerifyBrowser {
  return {
    browser,
    executablePath,
    mode,
    webgpuArgs,
    async close() {
      try {
        await browser.close();
      } finally {
        const forceStop = setTimeout(() => {
          void server.kill().catch(() => {});
        }, 1500);
        try {
          await server.close();
        } finally {
          clearTimeout(forceStop);
        }
      }
    },
  };
}

/**
 * Launches Chrome/Chromium via `launchServer` with WebGPU enabled and bounded Metal teardown.
 */
export async function launchVerifyBrowser(
  opts: LaunchVerifyBrowserOptions = {},
): Promise<LaunchedVerifyBrowser> {
  const webgpu = opts.webgpu ?? true;
  const headless = opts.headless ?? true;
  const autoHeadedFallback = opts.autoHeadedFallback ?? true;
  const executablePath = resolveChromiumBinary(opts.executablePath);
  const webgpuArgs = webgpu ? buildWebGpuLaunchArgs() : [];

  let handle = await launchOnce(executablePath, headless, webgpuArgs);
  if (webgpu && headless && autoHeadedFallback) {
    const hasAdapter = await probeAdapter(handle.browser);
    if (!hasAdapter) {
      await wrapBrowser(handle.browser, handle.server, executablePath, 'headless', webgpuArgs)
        .close()
        .catch(() => {});
      handle = await launchOnce(executablePath, false, webgpuArgs);
      return wrapBrowser(handle.browser, handle.server, executablePath, 'headed', webgpuArgs);
    }
  }

  return wrapBrowser(
    handle.browser,
    handle.server,
    executablePath,
    headless ? 'headless' : 'headed',
    webgpuArgs,
  );
}

/**
 * Waits for fonts, images, and settled layout frames inside Playwright.
 */
export async function settlePageForCapture(page: Page, settleMs = 150): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map(async (image) => {
        if (!image.complete) {
          await new Promise<void>((resolve, reject) => {
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener(
              'error',
              () => reject(new Error(`Broken image: ${image.currentSrc}`)),
              {
                once: true,
              },
            );
          });
        }
        if (image.naturalWidth === 0) {
          throw new Error(`Zero-width image: ${image.currentSrc}`);
        }
        await image.decode().catch(() => {});
      }),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  if (settleMs > 0) {
    await page.waitForTimeout(settleMs);
  }
}

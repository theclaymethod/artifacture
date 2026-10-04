import { access, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { isAllowedBrowserRequest } from './network-policy.mjs';
import { serveBrowserArtifact } from './browser-assets.mjs';

export async function launchChromium() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (!/Executable doesn't exist/i.test(error.message || '')) throw error;
    const executablePath = await newestCachedHeadlessShell();
    if (!executablePath) throw error;
    return chromium.launch({ headless: true, executablePath });
  }
}

function cacheDirForPlatform() {
  const configured = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (configured === '0') return path.join(path.dirname(fileURLToPath(import.meta.resolve('playwright-core/package.json'))), '.local-browsers');
  let directory = configured;
  if (!directory) {
    const home = homedir();
    switch (process.platform) {
      case 'darwin':
        directory = path.join(home, 'Library', 'Caches', 'ms-playwright');
        break;
      case 'win32':
        directory = path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'ms-playwright');
        break;
      default:
        directory = path.join(process.env.XDG_CACHE_HOME || path.join(home, '.cache'), 'ms-playwright');
    }
  }
  return path.resolve(process.env.INIT_CWD || process.cwd(), directory);
}

function shellFolderForPlatform() {
  const { platform, arch } = process;
  if (platform === 'darwin') return arch === 'arm64' ? 'chrome-headless-shell-mac-arm64' : 'chrome-headless-shell-mac';
  if (platform === 'win32') return 'chrome-headless-shell-win64';
  return arch === 'arm64' ? 'chrome-headless-shell-linux-arm64' : 'chrome-headless-shell-linux';
}

async function newestCachedHeadlessShell() {
  const cacheDir = cacheDirForPlatform();
  const shellFolder = shellFolderForPlatform();
  const executableName = process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell';
  let entries = [];
  try {
    entries = await readdir(cacheDir, { withFileTypes: true });
  } catch {
    return null;
  }
  const candidates = entries
    .filter((entry) => entry.isDirectory() && /^chromium_headless_shell-\d+$/.test(entry.name))
    .map((entry) => ({
      name: entry.name,
      revision: Number(entry.name.match(/(\d+)$/)?.[1] || 0),
      executablePath: path.join(cacheDir, entry.name, shellFolder, executableName)
    }))
    .sort((a, b) => b.revision - a.revision);

  for (const candidate of candidates) {
    try {
      await access(candidate.executablePath);
      return candidate.executablePath;
    } catch {
    }
  }
  return null;
}


function throwDisposalErrors(errors) {
  if (errors.length === 1) throw errors[0];
  if (errors.length) throw new AggregateError(errors, errors.map((error) => error.message || String(error)).join('; '));
}

async function disposeResources(actions) {
  const errors = [];
  for (const action of actions) {
    try { await action(); }
    catch (error) { errors.push(error); }
  }
  throwDisposalErrors(errors);
}

export async function openBrowserSession({ artifact, purpose = 'artifact' } = {}) {
  const server = artifact ? await serveBrowserArtifact(artifact) : null;
  let browser;
  try { browser = await launchChromium(); }
  catch (error) {
    try { await server?.close(); }
    catch (cleanupError) { throwDisposalErrors([error, cleanupError]); }
    throw error;
  }
  const allocations = new Set();
  let closing = false;
  let closePromise;
  return {
    url: server?.url,
    async newPage({ artifact: pageArtifact, ...options } = {}) {
      if (closing) throw new Error('Browser session is closing; cannot allocate a page.');
      let finishAllocation;
      const allocationDone = new Promise((resolve) => { finishAllocation = resolve; });
      const record = {
        context: null,
        server: null,
        closePromise: null,
        close() {
          if (!record.closePromise) record.closePromise = (async () => {
            await allocationDone;
            await disposeResources([() => record.context?.close(), () => record.server?.close()]);
            allocations.delete(record);
          })();
          return record.closePromise;
        },
      };
      allocations.add(record);
      try {
        record.server = pageArtifact ? await serveBrowserArtifact(pageArtifact) : null;
        const origin = (record.server || server)?.origin;
        record.context = await browser.newContext({ ...options, serviceWorkers: 'block' });
        await record.context.route('**/*', (route) => isAllowedBrowserRequest(route.request().url(), {
          purpose, additionalOrigins: origin ? [origin] : [],
        }) ? route.continue() : route.abort('blockedbyclient'));
        const page = await record.context.newPage();
        if (closing) throw new Error('Browser session closed during page allocation.');
        finishAllocation();
        return { page, context: record.context, url: (record.server || server)?.url, close: () => record.close() };
      } catch (error) {
        finishAllocation();
        try { await record.close(); }
        catch (cleanupError) { throwDisposalErrors([error, cleanupError]); }
        throw error;
      }
    },
    close() {
      if (!closePromise) {
        closing = true;
        closePromise = (async () => {
          const results = await Promise.allSettled([...allocations].map((record) => record.close()));
          const errors = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
          try { await disposeResources([() => browser.close(), () => server?.close()]); }
          catch (error) { errors.push(error); }
          throwDisposalErrors(errors);
        })();
      }
      return closePromise;
    },
  };
}

export async function settleBrowserArtifact(page, { mermaidTimeoutMs = 8000 } = {}) {
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
  const hasMermaid = await page.locator('.mermaid, pre.mermaid, [data-ve-mermaid-shell]').count() > 0;
  let mermaidError = null;
  if (hasMermaid) {
    const timeout = Number.isFinite(mermaidTimeoutMs) && mermaidTimeoutMs > 0 ? mermaidTimeoutMs : 8000;
    try {
      await page.waitForFunction(() => {
        const elements = [...document.querySelectorAll('.mermaid, pre.mermaid, [data-ve-mermaid-shell]')];
        return elements.length > 0 && elements.every((element) => element.matches('svg') || element.querySelector('svg'));
      }, null, { timeout });
    } catch {
      mermaidError = `Mermaid rendering did not complete within ${timeout}ms; every Mermaid container must contain an SVG`;
    }
  }
  return { mermaidError };
}

import { access, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
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
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH;
  const home = homedir();
  switch (process.platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Caches', 'ms-playwright');
    case 'win32':
      return path.join(home, 'AppData', 'Local', 'ms-playwright');
    default:
      return path.join(home, '.cache', 'ms-playwright');
  }
}

function shellFolderForPlatform() {
  const { platform, arch } = process;
  if (platform === 'darwin') return arch === 'arm64' ? 'chrome-headless-shell-mac-arm64' : 'chrome-headless-shell-mac';
  if (platform === 'win32') return 'chrome-headless-shell-win64';
  // linux and any other POSIX platform
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
      // Try the next cached revision.
    }
  }
  return null;
}


export async function openBrowserSession({ artifact, purpose = 'artifact' } = {}) {
  const server = artifact ? await serveBrowserArtifact(artifact) : null;
  let browser;
  try { browser = await launchChromium(); }
  catch (error) { await server?.close(); throw error; }
  const contexts = new Set();
  return {
    url: server?.url,
    async newPage(options = {}) {
      const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
      contexts.add(context);
      try {
        await context.route('**/*', (route) => isAllowedBrowserRequest(route.request().url(), {
          purpose, additionalOrigins: server ? [server.origin] : [],
        }) ? route.continue() : route.abort('blockedbyclient'));
        const page = await context.newPage();
        return { page, context, close: async () => { contexts.delete(context); await context.close(); } };
      } catch (error) {
        contexts.delete(context);
        await context.close();
        throw error;
      }
    },
    async close() {
      try { await browser.close(); }
      finally { contexts.clear(); await server?.close(); }
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

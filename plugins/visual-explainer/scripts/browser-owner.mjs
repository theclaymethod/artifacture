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
  if (configured) return path.resolve(process.env.INIT_CWD || process.cwd(), configured);
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


export async function openBrowserSession({ artifact, purpose = 'artifact' } = {}) {
  const server = artifact ? await serveBrowserArtifact(artifact) : null;
  let browser;
  try { browser = await launchChromium(); }
  catch (error) { await server?.close(); throw error; }
  const leases = new Set();
  return {
    url: server?.url,
    async newPage({ artifact: pageArtifact, ...options } = {}) {
      const pageServer = pageArtifact ? await serveBrowserArtifact(pageArtifact) : null;
      const origin = (pageServer || server)?.origin;
      let context;
      try {
        context = await browser.newContext({ ...options, serviceWorkers: 'block' });
        await context.route('**/*', (route) => isAllowedBrowserRequest(route.request().url(), {
          purpose, additionalOrigins: origin ? [origin] : [],
        }) ? route.continue() : route.abort('blockedbyclient'));
        const page = await context.newPage();
        const lease = {
          page,
          context,
          url: (pageServer || server)?.url,
          async close() {
            if (!leases.delete(lease)) return;
            try { await context.close(); }
            finally { await pageServer?.close(); }
          },
        };
        leases.add(lease);
        return lease;
      } catch (error) {
        try { await context?.close(); }
        finally { await pageServer?.close(); }
        throw error;
      }
    },
    async close() {
      try { await Promise.all([...leases].map((lease) => lease.close())); }
      finally {
        try { await browser.close(); }
        finally { await server?.close(); }
      }
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

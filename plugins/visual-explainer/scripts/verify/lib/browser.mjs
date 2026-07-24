import { access, mkdir, readFile, readdir } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const DEFAULT_SCREENS_DIR = path.join(tmpdir(), 've-verify-screens');

export async function runBrowserStage(ctx, options = {}) {
  const profile = options.profile || ctx.profile || 'page';
  const screensDir = options.screensDir || DEFAULT_SCREENS_DIR;
  await mkdir(screensDir, { recursive: true });

  const html = ctx.html ?? await readFile(ctx.filePath, 'utf8');
  const matrix = buildMatrix({ ...ctx, html, profile });
  const browser = await launchChromium();
  const runs = [];

  try {
    for (const runMeta of matrix) {
      const result = await executeWithRetry(browser, ctx, runMeta, screensDir);
      runs.push(result);
    }
  } finally {
    await browser.close();
  }

  ctx.browser = { runs };
  return ctx.browser;
}

async function launchChromium() {
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

function buildMatrix(ctx) {
  const profile = ctx.profile || 'page';
  const schemes = schemesForProfile(profile, ctx.html);
  const viewports = viewportsForProfile(profile, ctx);
  const runs = [];

  for (const viewport of viewports) {
    for (const scheme of schemes) {
      runs.push({
        profile,
        preset: ctx.preset || 'custom',
        viewport: `${viewport.width}x${viewport.height}`,
        width: viewport.width,
        height: viewport.height,
        scheme,
        reducedMotion: false
      });
    }
  }

  if (ctx.flags?.hasAnimations && viewports[0]) {
    runs.push({
      profile,
      preset: ctx.preset || 'custom',
      viewport: `${viewports[0].width}x${viewports[0].height}`,
      width: viewports[0].width,
      height: viewports[0].height,
      scheme: schemes[0] || 'light',
      reducedMotion: true
    });
  }

  return runs;
}

function schemesForProfile(profile, html) {
  if (profile === 'page' || profile === 'slides' || profile === 'magazine') return ['light', 'dark'];
  if (profile === 'poster') {
    return /prefers-color-scheme|data-theme=["'](?:light|dark)["']/i.test(html) ? ['light', 'dark'] : ['light'];
  }
  return ['light'];
}

function viewportsForProfile(profile, ctx) {
  if (profile === 'page') return [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
  if (profile === 'slides' || profile === 'magazine') return [{ width: 1440, height: 900 }];
  if (profile === 'poster') return [declaredCanvas(ctx.html) || { width: 1080, height: 1350 }];
  if (profile === 'video-comp') return videoCanvas(ctx.html);
  return [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
}

function declaredCanvas(html = '') {
  const tailwind = html.match(/w-\[(\d+)px\][\s\S]*?h-\[(\d+)px\]|h-\[(\d+)px\][\s\S]*?w-\[(\d+)px\]/);
  if (tailwind) {
    return {
      width: Number(tailwind[1] || tailwind[4]),
      height: Number(tailwind[2] || tailwind[3])
    };
  }
  const custom = html.match(/--poster-w\s*:\s*(\d+)px[\s\S]*?--poster-h\s*:\s*(\d+)px/i);
  if (custom) return { width: Number(custom[1]), height: Number(custom[2]) };
  const data = html.match(/data-(?:canvas|poster)-(?:size|width)=["'](\d+)(?:x|["'][^>]*data-(?:canvas|poster)-height=["'])(\d+)/i);
  if (data) return { width: Number(data[1]), height: Number(data[2]) };
  return null;
}

function videoCanvas(html = '') {
  const data = html.match(/data-width=["']?(\d+)["']?[\s\S]{0,160}data-height=["']?(\d+)["']?/i);
  if (data) {
    const width = Number(data[1]);
    const height = Number(data[2]);
    return [{ width: height > width ? 1080 : width, height: height > width ? 1920 : height }];
  }
  const stage = html.match(/\.stage[^{]*\{[^}]*width\s*:\s*(\d+)px[^}]*height\s*:\s*(\d+)px|\.stage[^{]*\{[^}]*height\s*:\s*(\d+)px[^}]*width\s*:\s*(\d+)px/i);
  if (stage) {
    const width = Number(stage[1] || stage[4]);
    const height = Number(stage[2] || stage[3]);
    return [{ width: height > width ? 1080 : width, height: height > width ? 1920 : height }];
  }
  if (/9\s*:\s*16|1080\s*x\s*1920|portrait|data-aspect=["']9:16/i.test(html)) {
    return [{ width: 1080, height: 1920 }];
  }
  return [{ width: 1920, height: 1080 }];
}

async function executeWithRetry(browser, ctx, runMeta, screensDir) {
  let first = await executeRun(browser, ctx, runMeta, screensDir);
  if (looksLikeNetworkFlake(first)) {
    const retryMeta = { ...runMeta, retry: true };
    first = await executeRun(browser, ctx, retryMeta, screensDir);
  }
  return first;
}

function looksLikeNetworkFlake(run) {
  if (run.consoleErrors.length || run.pageErrors.length) return false;
  if (!run.failedRequests.length) return false;
  return run.failedRequests.every((failure) => /fonts\.(?:googleapis|gstatic)|cdn\.jsdelivr|unpkg|esm\.sh|cdnjs/i.test(failure.url || ''));
}

const ALLOWED_REMOTE = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net/npm/mermaid@'];

async function executeRun(browser, ctx, runMeta, screensDir) {
  const context = await browser.newContext({
    viewport: { width: runMeta.width, height: runMeta.height },
    deviceScaleFactor: 1,
    colorScheme: runMeta.scheme,
    reducedMotion: runMeta.reducedMotion ? 'reduce' : 'no-preference'
  });
  const page = await context.newPage();
  await page.route('**/*', (route) => {
    const url = route.request().url();
    const allowed = url.startsWith('file:') || url.startsWith('data:') || url.startsWith('blob:') || ALLOWED_REMOTE.some((origin) => url.startsWith(origin));
    return allowed ? route.continue() : route.abort('blockedbyclient');
  });
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push({ text: message.text(), location: message.location() });
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push({ message: error.message, stack: error.stack || '' });
  });
  page.on('requestfailed', (request) => {
    failedRequests.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText || 'request failed'
    });
  });
  page.on('response', (response) => {
    const status = response.status();
    if (status >= 400) {
      failedRequests.push({
        url: response.url(),
        status,
        failure: `HTTP ${status}`
      });
    }
  });

  try {
    await page.emulateMedia({ colorScheme: runMeta.scheme, reducedMotion: runMeta.reducedMotion ? 'reduce' : 'no-preference' });
    await page.goto(pathToFileURL(ctx.filePath).href, { waitUntil: 'load', timeout: 30000 });
    await waitForPageSettled(page, ctx);

    const metrics = await page.evaluate(({ meta, source }) => {
      const collect = new Function(`${source}; return collectBrowserMetrics;`)();
      return collect(meta);
    }, { meta: runMeta, source: BROWSER_METRIC_SOURCE });
    for (const id of Object.keys(metrics)) {
      metrics[id] = metrics[id] ?? null;
    }
    await page.evaluate((collected) => { window.__veLastMetrics = collected; }, metrics);

    const suffix = `${runMeta.viewport}-${runMeta.scheme}${runMeta.reducedMotion ? '-reduced-motion' : ''}${runMeta.retry ? '-retry' : ''}`;
    const screenshotPath = path.join(screensDir, `${suffix}.png`);
    const fullScreenshotPath = path.join(screensDir, `${suffix}-full.png`);
    await page.screenshot({ path: screenshotPath });
    // Fixed-position authoring chrome (the review panel) renders at a misleading
    // mid-page position in fullPage captures and corrupts LLM/human review of the
    // -full variants; the viewport capture above keeps it so overlap checks still see it.
    await page.addStyleTag({ content: '.ve-review-panel { visibility: hidden !important; }' });
    await page.screenshot({ path: fullScreenshotPath, fullPage: true });
    await page.evaluate(() => {
      const tags = document.querySelectorAll('style');
      const last = tags[tags.length - 1];
      if (last && last.textContent && last.textContent.includes('.ve-review-panel { visibility: hidden')) last.remove();
    });

    return {
      viewport: runMeta.viewport,
      width: runMeta.width,
      height: runMeta.height,
      scheme: runMeta.scheme,
      reducedMotion: runMeta.reducedMotion,
      retry: Boolean(runMeta.retry),
      consoleErrors,
      pageErrors,
      failedRequests,
      metrics,
      screenshotPath,
      fullScreenshotPath
    };
  } finally {
    await context.close();
  }
}

async function waitForPageSettled(page, ctx) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready.catch(() => {});
  });

  const hasMermaid = ctx.flags?.hasMermaid || /class=["'][^"']*\bmermaid\b/i.test(ctx.html || '');
  if (hasMermaid) {
    await page.waitForFunction(() => {
      const mermaids = [...document.querySelectorAll('.mermaid, pre.mermaid')];
      return mermaids.length === 0 || mermaids.every((el) => el.querySelector('svg'));
    }, null, { timeout: 8000 }).catch(() => {});
  }

  await page.evaluate(async () => {
    document.querySelectorAll('details').forEach((details) => { details.open = true; });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const maxY = Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight || 0
    );
    window.scrollTo(0, maxY);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    window.scrollTo(0, 0);
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

async function collectBrowserMetrics(runMeta) {
  const win = window;
  const doc = document;
  const docEl = doc.documentElement;
  const body = doc.body || doc.createElement('body');
  const EPS = 1;

  const px = (value) => Number.parseFloat(value || '0') || 0;
  const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const className = (el) => typeof el.className === 'string' ? el.className : String(el.getAttribute('class') || '');
  const tag = (el) => el.tagName.toLowerCase();
  const compact = (el) => ({
    tag: tag(el),
    className: className(el).slice(0, 160),
    id: el.id || '',
    text: text(el).slice(0, 120),
    selector: selectorFor(el)
  });
  const isVisible = (el) => {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && px(cs.opacity) > 0.01 && rect.width > 0 && rect.height > 0;
  };
  const directText = (el) => [...el.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join('').replace(/\s+/g, ' ').trim();
  const overflowX = (el) => getComputedStyle(el).overflowX;
  const hasScrollAncestor = (el, levels = 3) => {
    let cur = el;
    for (let i = 0; cur && i <= levels; i += 1, cur = cur.parentElement) {
      const ox = getComputedStyle(cur).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };
  const rectObj = (rect) => ({
    x: Math.round(rect.x * 100) / 100,
    y: Math.round(rect.y * 100) / 100,
    width: Math.round(rect.width * 100) / 100,
    height: Math.round(rect.height * 100) / 100,
    right: Math.round(rect.right * 100) / 100,
    bottom: Math.round(rect.bottom * 100) / 100
  });
  const color = (value) => parseColor(value);
  const bgFor = (el) => {
    let cur = el;
    while (cur) {
      const c = color(getComputedStyle(cur).backgroundColor);
      if (c && c.a > 0.05) return c;
      cur = cur.parentElement;
    }
    const rootBg = color(getComputedStyle(docEl).backgroundColor);
    return rootBg && rootBg.a > 0.05 ? rootBg : { r: 255, g: 255, b: 255, a: 1 };
  };
  const cssVarColor = (name) => {
    const value = getComputedStyle(docEl).getPropertyValue(name).trim();
    return value ? color(value) : null;
  };
  const viewBoxRect = (svg) => {
    const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (vb.length === 4 && vb.every(Number.isFinite)) return { x: vb[0], y: vb[1], width: vb[2], height: vb[3], right: vb[0] + vb[2], bottom: vb[1] + vb[3] };
    const box = svg.getBBox?.();
    return box ? { x: box.x, y: box.y, width: box.width, height: box.height, right: box.x + box.width, bottom: box.y + box.height } : null;
  };

  const all = [...doc.querySelectorAll('body *')];
  const textEls = all.filter((el) => isVisible(el) && text(el) && !el.closest('script,style,svg'));
  const leafTextEls = textEls.filter((el) => ![...el.children].some((child) => text(child)));

  const metrics = {};

  metrics['no-console-errors'] = { ok: true };
  metrics['no-horizontal-body-overflow'] = {
    docScrollWidth: docEl.scrollWidth,
    bodyScrollWidth: body.scrollWidth,
    innerWidth: win.innerWidth,
    docOverflow: docEl.scrollWidth - win.innerWidth,
    bodyOverflow: body.scrollWidth - win.innerWidth
  };

  metrics['overflow-source-census'] = {
    offenders: all
      .filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + EPS && overflowX(el) === 'visible')
      .slice(0, 10)
      .map((el) => ({
        ...compact(el),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        width: Math.round(el.getBoundingClientRect().width)
      }))
  };
  metrics['no-horizontal-body-overflow'].sourceCensus = metrics['overflow-source-census'].offenders.length
    ? metrics['overflow-source-census'].offenders
    : [{ tag: 'html/body', className: '', note: 'Document/body scrollWidth exceeds viewport; no visible element source was isolated by overflow-source-census.' }];

  metrics['grid-flex-child-min-width-0'] = {
    offenders: all
      .filter((el) => /(^|\s)(grid|flex)(\s|$)|-grid\b|-row\b/.test(className(el)) || ['grid', 'flex', 'inline-grid', 'inline-flex'].includes(getComputedStyle(el).display))
      .flatMap((container) => [...container.children].filter((child) => {
        const cs = getComputedStyle(child);
        const childRect = child.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        return child.clientWidth > 0 && (child.scrollWidth > child.clientWidth + EPS || childRect.width > containerRect.width + EPS || childRect.right > containerRect.right + EPS) && cs.minWidth !== '0px';
      }).map((child) => ({
        container: compact(container),
        child: compact(child),
        minWidth: getComputedStyle(child).minWidth,
        scrollWidth: child.scrollWidth,
        clientWidth: child.clientWidth
      }))).slice(0, 10)
  };

  metrics['fixed-grid-collapses-single-column'] = {
    offenders: win.innerWidth > 768 ? [] : all.filter((el) => {
      if (/\bkpi-row\b/.test(className(el))) return false;
      const cn = className(el);
      const candidate = /arch-grid|comparison|diff-panels|dir-compare|(^|\s)[\w-]+-grid(\s|$)/.test(cn);
      if (!candidate) return false;
      const cs = getComputedStyle(el);
      if (!cs.display.includes('grid')) return false;
      return splitTracks(cs.gridTemplateColumns).length > 1;
    }).slice(0, 10).map((el) => ({
      ...compact(el),
      gridTemplateColumns: getComputedStyle(el).gridTemplateColumns
    }))
  };

  metrics['wide-content-scroll-x-wrapper'] = {
    offenders: [...doc.querySelectorAll('table, .pipeline, .dir-tree pre, pre.dir-tree, svg, .code-block')]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return isVisible(el) && (el.scrollWidth > el.clientWidth + EPS || rect.width > win.innerWidth + EPS || rect.right > win.innerWidth + EPS) && !hasScrollAncestor(el, 3);
      })
      .slice(0, 10)
      .map((el) => ({
        ...compact(el),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        overflowX: overflowX(el)
      }))
  };

  metrics['dir-tree-connectors-no-wrap'] = {
    offenders: [...doc.querySelectorAll('.dir-tree pre, pre.dir-tree, pre')]
      .filter((el) => className(el).includes('dir-tree') || /[├└│]/.test(el.textContent || ''))
      .filter((el) => {
        const whiteSpace = getComputedStyle(el).whiteSpace;
        return !(whiteSpace === 'pre' || whiteSpace === 'nowrap') || !hasScrollAncestor(el, 3);
      })
      .slice(0, 10)
      .map((el) => ({ ...compact(el), whiteSpace: getComputedStyle(el).whiteSpace, hasScroll: hasScrollAncestor(el, 3) }))
  };

  metrics['text-clip-candidates'] = {
    candidates: all.filter((el) => {
      const cs = getComputedStyle(el);
      const overflow = ['hidden', 'clip'].includes(cs.overflowX) || ['hidden', 'clip'].includes(cs.overflowY);
      const clipped = el.scrollWidth > el.clientWidth + EPS || el.scrollHeight > el.clientHeight + EPS;
      const intentional = cs.webkitLineClamp && cs.webkitLineClamp !== 'none' || cs.textOverflow === 'ellipsis';
      return overflow && clipped && (directText(el) || text(el)) && !intentional;
    }).slice(0, 10).map((el) => ({
      ...compact(el),
      overflowX: getComputedStyle(el).overflowX,
      overflowY: getComputedStyle(el).overflowY,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight
    }))
  };

  metrics['content-behind-fixed-ui-candidates'] = fixedOverlapMetrics(all, compact, rectObj, isVisible, color);
  metrics['prose-readability-minimums'] = proseMetrics(doc, px, compact, isVisible);
  metrics['diagram-arrow-endpoint-air-gap'] = diagramArrowMetrics(doc, compact);
  metrics['diagram-text-clipping-overlap'] = diagramTextMetrics(doc, compact, viewBoxRect);
  metrics['preset-both-mode-inversion'] = presetInversionMetrics(doc, docEl, textEls, cssVarColor, bgFor, color);
  metrics['cream-sand-background'] = creamSandMetrics(doc, docEl, color);
  metrics['flat-type-scale-weak-hierarchy'] = flatTypeMetrics(doc, color);
  metrics['rainbow-accent-palette'] = rainbowAccentMetrics(all, compact, color);
  metrics['gray-text-on-colored-surface'] = grayOnColorMetrics(leafTextEls, compact, bgFor, color);
  metrics['body-text-contrast-aa'] = contrastMetrics(leafTextEls, compact, bgFor, color, px);
  metrics['undersized-touch-targets'] = touchTargetMetrics(doc, compact);
  metrics['font-family-sprawl'] = fontFamilySprawlMetrics(leafTextEls);
  metrics['nothing-accent-red-single-use'] = nothingAccentRedMetrics(doc, all, color);
  metrics['nothing-labels-allcaps-mono'] = nothingLabelsMetrics(doc, compact);
  metrics['nothing-type-size-budget'] = typeBudgetMetrics(textEls);
  metrics['nothing-doto-single-hero'] = dotoMetrics(textEls, px, compact);
  metrics['slide-viewport-fit-no-internal-scroll'] = slideViewportMetrics(doc, win, compact);
  metrics['deck-scroll-snap-axis'] = deckSnapMetrics(doc);
  metrics['min-slide-body-text-16px'] = slideTextSizeMetrics(doc, px, compact, isVisible);
  metrics['magazine-dark-cover-backcover-min3-invariant'] = magazineDarkMetrics(doc, color);
  metrics['magazine-stat-page-anchor'] = magazineStatMetrics(doc, px, compact);
  metrics['magazine-nav-dots-and-keyboard'] = await magazineNavMetrics(doc, win);
  metrics['diagram-slide-legibility'] = diagramSlideMetrics(doc, px, compact);
  metrics['keyboard-hints-autofade'] = await keyboardHintsMetrics(doc, win);
  metrics['slide-dim-text-contrast'] = slideDimContrastMetrics(doc, docEl, color);
  metrics['poster-content-within-canvas'] = posterCanvasMetrics(doc, compact);
  metrics['reel-caption-styling'] = reelCaptionMetrics(doc, win, px, color);
  metrics['reel-safe-zone-margins'] = reelSafeZoneMetrics(doc, win, compact);
  metrics['reel-full-bleed-no-gutters'] = reelFullBleedMetrics(doc, color);
  metrics['reel-vertical-hierarchy-thirds'] = reelThirdsMetrics(doc, win, compact);
  metrics['reel-single-focal-element'] = reelFocalMetrics(doc, compact);
  metrics['reel-typography-roles'] = reelTypographyMetrics(doc, px, compact);
  metrics['mermaid-rendered'] = mermaidMetrics(doc, compact);

  return metrics;
}

function selectorFor(el) {
  if (!el || el.nodeType !== 1) return '';
  if (el.id) return `#${el.id}`;
  const parts = [];
  let cur = el;
  while (cur && cur.nodeType === 1 && parts.length < 4) {
    let part = cur.tagName.toLowerCase();
    const cls = typeof cur.className === 'string' ? cur.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
    if (cls.length) part += `.${cls.join('.')}`;
    const parent = cur.parentElement;
    if (parent) {
      const siblings = [...parent.children].filter((child) => child.tagName === cur.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
    }
    parts.unshift(part);
    cur = parent;
  }
  return parts.join(' > ');
}

function splitTracks(value) {
  if (!value || value === 'none') return [];
  return value.trim().split(/\s+/).filter(Boolean);
}

function parseColor(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const rgb = str.match(/rgba?\(([^)]+)\)/i);
  if (rgb) {
    const parts = rgb[1].split(/[,/ ]+/).filter(Boolean).map((part) => part.endsWith('%') ? Number.parseFloat(part) * 2.55 : Number.parseFloat(part));
    return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0, a: parts.length > 3 ? parts[3] : 1 };
  }
  const hex = str.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((ch) => ch + ch).join('');
    return {
      r: Number.parseInt(h.slice(0, 2), 16),
      g: Number.parseInt(h.slice(2, 4), 16),
      b: Number.parseInt(h.slice(4, 6), 16),
      a: h.length >= 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1
    };
  }
  return null;
}

function luminance(c) {
  if (!c) return 1;
  const channel = (v) => {
    const s = Math.max(0, Math.min(255, v)) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function hsl(c) {
  if (!c) return { h: 0, s: 0, l: 1 };
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s, l };
}

function colorDistance(a, b) {
  if (!a || !b) return 999;
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function creamSandMetrics(doc, docEl, color) {
  const target = doc.body || docEl;
  const bg = color(getComputedStyle(target).backgroundColor) || color(getComputedStyle(docEl).backgroundColor);
  const tone = hsl(bg);
  const text = (doc.body?.textContent || '').toLowerCase();
  const styleText = [...doc.querySelectorAll('style')].map((style) => style.textContent || '').join('\n');
  const reflexToken = /--(?:paper|cream|sand|bone|linen|parchment|ivory)\s*:/i.test(styleText);
  const warmSpread = bg ? Math.max(bg.r, bg.g, bg.b) - Math.min(bg.r, bg.g, bg.b) : 0;
  const isCreamSand = warmSpread >= 12 && tone.l >= 0.84 && tone.l <= 0.99 && tone.s <= 0.6 && tone.h >= 40 && tone.h <= 100 && !/\b(?:paper|parchment|receipt|linen)\b/.test(text);
  return { bg, hsl: { h: Math.round(tone.h), s: Math.round(tone.s * 100) / 100, l: Math.round(tone.l * 100) / 100 }, isCreamSand, reflexToken };
}

function flatTypeMetrics(doc, color) {
  const roles = [...doc.querySelectorAll('h1,h2,h3,p')].filter((el) => (el.textContent || '').trim() && !el.closest('table,.data-table'));
  const samples = roles.map((el) => {
    const cs = getComputedStyle(el);
    return { el, selector: selectorFor(el), tag: el.tagName.toLowerCase(), size: Number.parseFloat(cs.fontSize) || 0, weight: Number.parseInt(cs.fontWeight, 10) || 400, color: color(cs.color), text: (el.textContent || '').trim().slice(0, 80) };
  }).filter((item) => item.size);
  const pairs = [];
  const headings = samples.filter((item) => /^h[1-3]$/.test(item.tag)).sort((a, b) => b.size - a.size);
  const body = samples.find((item) => item.tag === 'p');
  if (headings[0] && body) pairs.push(typePair(headings[0], body));
  for (let i = 0; i < headings.length - 1; i += 1) pairs.push(typePair(headings[i], headings[i + 1]));
  return { pairs };
}

function typePair(a, b) {
  const ratio = Math.max(a.size, b.size) / Math.max(1, Math.min(a.size, b.size));
  const weightSame = Math.abs(a.weight - b.weight) < 100;
  const colorSame = colorDistance(a.color, b.color) < 24;
  return { a: a.selector, b: b.selector, ratio: Math.round(ratio * 100) / 100, weightSame, colorSame, flat: ratio < 1.25 && weightSame && colorSame };
}

function rainbowAccentMetrics(all, compact, color) {
  const samples = [];
  const buckets = new Set();
  for (const el of all) {
    if (el.closest('svg,canvas,pre,code,.chart,[data-chart]')) continue;
    const cs = getComputedStyle(el);
    for (const value of [cs.backgroundColor, cs.borderTopColor, cs.color]) {
      const c = color(value);
      if (!c || c.a < 0.2) continue;
      const tone = hsl(c);
      if (tone.s <= 0.35 || tone.l <= 0.15 || tone.l >= 0.92) continue;
      const bucket = Math.floor(tone.h / 30) * 30;
      buckets.add(bucket);
      if (samples.length < 12) samples.push({ ...compact(el), hue: Math.round(tone.h), bucket });
    }
  }
  return { bucketCount: buckets.size, buckets: Array.from(buckets).sort((a, b) => a - b), samples };
}

function grayOnColorMetrics(leafTextEls, compact, bgFor, color) {
  const offenders = [];
  for (const el of leafTextEls) {
    if (el.closest('pre,code,svg')) continue;
    const fg = color(getComputedStyle(el).color);
    const bg = bgFor(el);
    const fgTone = hsl(fg);
    const bgTone = hsl(bg);
    const midGray = fgTone.s < 0.12 && fgTone.l >= 0.4 && fgTone.l <= 0.7;
    const saturatedBg = bgTone.s > 0.28 && bgTone.l > 0.2 && bgTone.l < 0.85;
    if (midGray && saturatedBg) offenders.push({ ...compact(el), fg, bg });
    if (offenders.length >= 10) break;
  }
  return { offenders };
}

function contrastMetrics(leafTextEls, compact, bgFor, color, px) {
  const offenders = [];
  for (const el of leafTextEls) {
    if (el.closest('[aria-hidden="true"],[disabled],pre,code,svg,.watermark,.decorative,.badge,.status,[class*="badge"],[class*="chip"]')) continue;
    const text = (el.textContent || '').trim();
    if (!text || text.length < 2) continue;
    const cs = getComputedStyle(el);
    const fontSize = px(cs.fontSize);
    const weight = Number.parseInt(cs.fontWeight, 10) || 400;
    const ratio = contrast(color(cs.color), bgFor(el));
    const large = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700);
    const min = large || deEmphasisContrastFloor(el, cs, fontSize) ? 3 : 4.5;
    if (ratio < min) offenders.push({ ...compact(el), fontSize, weight, contrast: Math.round(ratio * 100) / 100, required: min });
    if (offenders.length >= 10) break;
  }
  return { offenders };
}

function deEmphasisContrastFloor(el, cs, fontSize) {
  const klass = classNameForMetric(el);
  const textValue = (el.textContent || '').trim();
  const letterSpacing = Number.parseFloat(cs.letterSpacing || '0') || 0;
  const trackedUpperLabel = fontSize < 14 && letterSpacing > 0 && isUpperLabel(textValue) && /kicker|eyebrow|label|caption|meta|overline|unit/i.test(klass);
  if (trackedUpperLabel) return true;
  const authored = `${el.getAttribute('style') || ''} ${klass} ${matchedCssText(el)}`;
  return /var\(\s*--[\w-]*(?:faint|dim|muted)[\w-]*\s*\)/i.test(authored) || /\b(?:faint|dim|muted|secondary|caption|eyebrow|kicker)\b/i.test(klass);
}

function isUpperLabel(value) {
  const letters = value.replace(/[^A-Za-z]/g, '');
  return letters.length > 1 && letters === letters.toUpperCase();
}

function classNameForMetric(el) {
  return typeof el.className === 'string' ? el.className : String(el.getAttribute('class') || '');
}

function matchedCssText(el) {
  let out = '';
  for (const sheet of document.styleSheets) {
    let rules = [];
    try {
      rules = [...sheet.cssRules];
    } catch {
      continue;
    }
    for (const rule of rules) {
      if (!rule.selectorText || !rule.style) continue;
      try {
        if (el.matches(rule.selectorText)) out += ` ${rule.style.cssText}`;
      } catch {
        // Ignore unsupported selector syntax in the browser's rule list.
      }
    }
  }
  return out;
}

function touchTargetMetrics(doc, compact) {
  const offenders = [];
  for (const el of doc.querySelectorAll('button,a[href],[role="button"],[onclick],input,summary')) {
    if (el.closest('[aria-hidden="true"]')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)) offenders.push({ ...compact(el), width: Math.round(r.width), height: Math.round(r.height) });
    if (offenders.length >= 10) break;
  }
  return { offenders };
}

function fontFamilySprawlMetrics(leafTextEls) {
  const generic = /^(?:system-ui|sans-serif|serif|monospace|ui-sans-serif|ui-serif|ui-monospace|inherit|initial)$/i;
  const fonts = new Set();
  for (const el of leafTextEls) {
    const stack = getComputedStyle(el).fontFamily || '';
    const primary = stack.split(',').map((part) => part.trim().replace(/^["']|["']$/g, '')).find((part) => part && !generic.test(part));
    if (primary) fonts.add(primary.replace(/:(?:wght|ital|opsz|wdth)@[^,\s;]+/gi, ''));
  }
  return { fonts: [...fonts].sort(), count: fonts.size };
}

function nothingAccentRedMetrics(doc, all, color) {
  const accent = color(getComputedStyle(doc.documentElement).getPropertyValue('--accent').trim()) || { r: 215, g: 25, b: 33, a: 1 };
  const red = { r: 215, g: 25, b: 33, a: 1 };
  const target = colorDistance(accent, red) <= 2 ? accent : red;
  const painted = [];
  for (const el of all) {
    const cs = getComputedStyle(el);
    const values = [cs.color, cs.backgroundColor, cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor].map(color).filter((c) => c && c.a > 0.05);
    if (values.some((value) => colorDistance(value, target) <= 3)) painted.push(selectorFor(el));
    if (painted.length > 10) break;
  }
  return { count: painted.length, painted };
}

function nothingLabelsMetrics(doc, compact) {
  const offenders = [];
  for (const el of doc.querySelectorAll('nav a,th,button,.label,.unit,.kicker,.section-kicker')) {
    const textValue = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!textValue) continue;
    const cs = getComputedStyle(el);
    const mono = /Space Mono/i.test(cs.fontFamily || '');
    const upper = cs.textTransform === 'uppercase' || isUpperLabel(textValue);
    if (!mono || !upper) offenders.push({ ...compact(el), fontFamily: cs.fontFamily, textTransform: cs.textTransform, mono, upper });
    if (offenders.length >= 10) break;
  }
  return { offenders };
}

function proseMetrics(doc, px, compact, isVisible) {
  const offenders = [];
  for (const p of doc.querySelectorAll('.prose p')) {
    if (!isVisible(p) || p.closest('code, pre, .caption, .label, .meta, .kicker')) continue;
    const cs = getComputedStyle(p);
    const fontSize = px(cs.fontSize);
    const lineHeight = cs.lineHeight === 'normal' ? fontSize * 1.2 : px(cs.lineHeight);
    const container = p.closest('.prose');
    const measurePx = container?.getBoundingClientRect().width || p.getBoundingClientRect().width;
    const ch = fontSize ? measurePx / (fontSize * 0.5) : 0;
    if (fontSize < 16 || lineHeight / Math.max(fontSize, 1) < 1.5 || ch > 85) {
      offenders.push({ ...compact(p), fontSize, lineHeightRatio: Math.round(lineHeight / Math.max(fontSize, 1) * 100) / 100, measureCh: Math.round(ch) });
    }
  }
  return { offenders: offenders.slice(0, 10) };
}

function fixedOverlapMetrics(all, compact, rectObj, isVisible, color) {
  const fixed = all.filter((el) => {
    const cs = getComputedStyle(el);
    const bg = color(cs.backgroundColor);
    return isVisible(el) && cs.position === 'fixed' && bg && bg.a > 0.05;
  });
  const content = all.filter((el) => isVisible(el) && el.matches('a, button, h1, h2, h3, h4, p, td, .sec-head'));
  const candidates = [];
  for (const fx of fixed) {
    const fr = fx.getBoundingClientRect();
    for (const el of content) {
      if (fx === el || fx.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > fr.left && r.left < fr.right && r.bottom > fr.top && r.top < fr.bottom) {
        candidates.push({ fixed: { ...compact(fx), rect: rectObj(fr) }, content: { ...compact(el), rect: rectObj(r) } });
        if (candidates.length >= 10) return { candidates };
      }
    }
  }
  return { candidates };
}

function diagramArrowMetrics(doc, compact) {
  const arrows = [...doc.querySelectorAll('[data-diagram-role~="arrow"], [data-diagram-role~="connector"]')];
  const nodes = [...doc.querySelectorAll('[data-diagram-role~="node"], [data-diagram-role~="step"], [data-diagram-role~="decision"]')];
  if (!arrows.length || !nodes.length) return { skipped: true, reason: 'No tagged arrows/nodes' };
  const offenders = [];
  const nodeBoxes = nodes.map((node) => ({ node, box: node.getBoundingClientRect() }));
  const nodesById = new Map(
    nodeBoxes
      .map((item) => [item.node.getAttribute('data-diagram-id'), item])
      .filter(([id]) => id)
  );
  for (const arrow of arrows) {
    const point = arrowTerminalPoint(arrow);
    if (!point) continue;
    const targetId = arrow.getAttribute('data-diagram-target');
    const target = targetId
      ? nodesById.get(targetId)
      : nodeBoxes
        .map((item) => ({ ...item, d: distanceToRectEdge(point, item.box) }))
        .sort((a, b) => a.d - b.d)[0];
    if (!target) {
      offenders.push({ arrow: compact(arrow), targetId, reason: 'Target node not found' });
      continue;
    }
    const d = distanceToRectEdge(point, target.box);
    const inside = point.x > target.box.left && point.x < target.box.right && point.y > target.box.top && point.y < target.box.bottom;
    const anchor = arrow.getAttribute('data-diagram-target-anchor');
    const anchorResult = anchor ? diagramAnchorAlignment(point, target.box, anchor) : { alignment: 0, wrongSide: false };
    if (inside || d < 6 || d > 10 || anchorResult.alignment > 3 || anchorResult.wrongSide) {
      offenders.push({
        arrow: compact(arrow),
        node: compact(target.node),
        targetId,
        anchor,
        distance: Math.round(d * 10) / 10,
        alignment: Math.round(anchorResult.alignment * 10) / 10,
        wrongSide: anchorResult.wrongSide,
        inside,
      });
    }
  }
  return { offenders: offenders.slice(0, 10) };
}

function arrowTerminalPoint(arrow) {
  let point = null;
  const tag = arrow.tagName.toLowerCase();
  if (tag === 'line') {
    point = { x: Number(arrow.getAttribute('x2')), y: Number(arrow.getAttribute('y2')) };
  } else if (typeof arrow.getTotalLength === 'function' && typeof arrow.getPointAtLength === 'function') {
    const len = arrow.getTotalLength();
    point = Number.isFinite(len) && len >= 0 ? arrow.getPointAtLength(len) : null;
  } else if ((tag === 'polyline' || tag === 'polygon') && arrow.points?.numberOfItems) {
    point = arrow.points.getItem(arrow.points.numberOfItems - 1);
  }
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  const matrix = arrow.getScreenCTM?.();
  if (!matrix) return point;
  return {
    x: point.x * matrix.a + point.y * matrix.c + matrix.e,
    y: point.x * matrix.b + point.y * matrix.d + matrix.f,
  };
}

function diagramAnchorAlignment(point, box, anchor) {
  const centerX = (box.left + box.right) / 2;
  const centerY = (box.top + box.bottom) / 2;
  if (anchor === 'left-center') return { alignment: Math.abs(point.y - centerY), wrongSide: point.x >= box.left };
  if (anchor === 'right-center') return { alignment: Math.abs(point.y - centerY), wrongSide: point.x <= box.right };
  if (anchor === 'top-center') return { alignment: Math.abs(point.x - centerX), wrongSide: point.y >= box.top };
  if (anchor === 'bottom-center') return { alignment: Math.abs(point.x - centerX), wrongSide: point.y <= box.bottom };
  return { alignment: 0, wrongSide: false };
}

function distanceToRectEdge(point, box) {
  const left = Math.abs(point.x - box.left);
  const right = Math.abs(point.x - box.right);
  const top = Math.abs(point.y - box.top);
  const bottom = Math.abs(point.y - box.bottom);
  return Math.min(left, right, top, bottom);
}

function diagramTextMetrics(doc, compact, viewBoxRect) {
  const svgs = [...doc.querySelectorAll('svg')].filter((svg) => !svg.closest('.mermaid'));
  const offenders = [];
  for (const svg of svgs) {
    const vb = viewBoxRect(svg);
    if (!vb) continue;
    const texts = [...svg.querySelectorAll('text')].map((el) => ({ el, box: el.getBBox?.() })).filter((item) => item.box);
    for (const { el, box } of texts) {
      if (box.x < vb.x - 1 || box.y < vb.y - 1 || box.x + box.width > vb.right + 1 || box.y + box.height > vb.bottom + 1) {
        offenders.push({ kind: 'outside-viewBox', text: compact(el), box });
      }
    }
    for (let i = 0; i < texts.length; i += 1) {
      for (let j = i + 1; j < texts.length; j += 1) {
        if (rectsIntersect(texts[i].box, texts[j].box) && !texts[i].el.closest('[data-allow-overlap]') && !texts[j].el.closest('[data-allow-overlap]')) {
          offenders.push({ kind: 'text-overlap', a: compact(texts[i].el), b: compact(texts[j].el) });
        }
      }
    }
  }
  return { offenders: offenders.slice(0, 10) };
}

function rectsIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function presetInversionMetrics(doc, docEl, textEls, cssVarColor, bgFor, color) {
  const textColor = cssVarColor('--text-primary') || cssVarColor('--text') || cssVarColor('--ve-text') || cssVarColor('--ve-heading') || color(getComputedStyle(doc.body || docEl).color);
  const bgColor = cssVarColor('--bg') || cssVarColor('--background') || cssVarColor('--ve-bg') || color(getComputedStyle(doc.body || docEl).backgroundColor) || bgFor(doc.body || docEl);
  const baseContrast = contrast(textColor, bgColor);
  const invisible = [];
  for (const el of textEls.slice(0, 250)) {
    if (el.closest('.cta, [data-contrast-exempt], pre, code')) continue;
    const fg = color(getComputedStyle(el).color);
    const bg = bgFor(el);
    if (fg && bg && colorDistance(fg, bg) <= 8) {
      invisible.push({ selector: selectorFor(el), text: (el.textContent || '').trim().slice(0, 80), fg, bg });
      if (invisible.length >= 10) break;
    }
  }
  return { baseContrast: Math.round(baseContrast * 100) / 100, invisible };
}

function typeBudgetMetrics(textEls) {
  const sizes = [];
  let hasNumericHero = false;
  for (const el of textEls) {
    const size = Math.round(Number.parseFloat(getComputedStyle(el).fontSize || '0'));
    if (!size) continue;
    if (!sizes.some((value) => Math.abs(value - size) <= 1)) sizes.push(size);
    if (size >= 56 && /^\s*[\d.,%+$-]+\s*$/.test(el.textContent || '')) hasNumericHero = true;
  }
  sizes.sort((a, b) => a - b);
  return { sizes, count: sizes.length, hasNumericHero };
}

function dotoMetrics(textEls, px, compact) {
  const els = textEls.filter((el) => /Doto/i.test(getComputedStyle(el).fontFamily || ''));
  return {
    count: els.length,
    uses: els.slice(0, 10).map((el) => ({
      ...compact(el),
      fontSize: px(getComputedStyle(el).fontSize),
      wordCount: (el.textContent || '').trim().split(/\s+/).filter(Boolean).length
    }))
  };
}

function slideViewportMetrics(doc, win, compact) {
  const magazinePages = findMagazinePages(doc);
  const els = [...doc.querySelectorAll('section.slide'), ...magazinePages];
  const isMagazine = magazinePages.length > 0;
  const offenders = [];
  for (const el of els) {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const nested = [...el.querySelectorAll('.mermaid-wrap,.table-scroll,.code-scroll')].some((child) => child.scrollHeight > child.clientHeight + 2);
    const badHeight = Math.abs(rect.height - win.innerHeight) > 2;
    const badWidth = isMagazine && Math.abs(rect.width - win.innerWidth) > 2;
    const badOverflow = el.scrollHeight > el.clientHeight + 2 && !nested;
    const badY = !isMagazine && cs.overflowY !== 'hidden';
    if (badHeight || badWidth || badOverflow || badY) {
      offenders.push({ ...compact(el), width: rect.width, height: rect.height, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, overflowY: cs.overflowY, badHeight, badWidth, badOverflow, badY });
    }
  }
  const mag = findMagazineContainer(doc);
  const bodyOverflowY = getComputedStyle(doc.body).overflowY;
  const magOverflowY = mag ? getComputedStyle(mag).overflowY : '';
  const documentVerticalScrollbar = isMagazine && doc.documentElement.scrollHeight > doc.documentElement.clientHeight + 2;
  return { count: els.length, isMagazine, offenders: offenders.slice(0, 10), bodyOverflowY, magOverflowY, documentVerticalScrollbar };
}

function deckSnapMetrics(doc) {
  const mag = findMagazineContainer(doc);
  const deck = doc.querySelector('.deck') || [...doc.querySelectorAll('*')].find((el) => getComputedStyle(el).scrollSnapType.includes('mandatory'));
  const ySnap = [...doc.querySelectorAll('*')].filter((el) => /y\s+mandatory/.test(getComputedStyle(el).scrollSnapType || '')).map(selectorFor);
  return {
    mag: mag ? getComputedStyle(mag).scrollSnapType : '',
    deck: deck ? getComputedStyle(deck).scrollSnapType : '',
    ySnap
  };
}

function slideTextSizeMetrics(doc, px, compact, isVisible) {
  const roots = [...doc.querySelectorAll('section.slide, .mag .page')];
  const exempt = '.slide__label,.slide__subtitle,.slide__kpi-label,.pipeline__file,cite,caption,th,[class*="label"],[class*="caption"],[class*="kicker"],[class*="eyebrow"],[class*="meta"],[class*="badge"],[class*="foot"]';
  const offenders = [];
  for (const root of roots) {
    for (const el of root.querySelectorAll('*')) {
      if (!isVisible(el) || !(el.textContent || '').trim() || [...el.children].some((child) => (child.textContent || '').trim())) continue;
      if (el.closest(exempt)) continue;
      const fontSize = px(getComputedStyle(el).fontSize);
      if (fontSize < 16) offenders.push({ ...compact(el), fontSize });
    }
  }
  return { offenders: offenders.slice(0, 10) };
}

function magazineDarkMetrics(doc, color) {
  const pages = findMagazinePages(doc);
  const dark = pages.map((page, index) => {
    const bg = color(getComputedStyle(page).backgroundColor);
    const lum = luminance(bg);
    const marker = page.classList.contains('page--dark') || page.getAttribute('data-tint') === 'dark';
    return { index, selector: selectorFor(page), luminance: Math.round(lum * 1000) / 1000, marker, dark: marker || lum < 0.2 };
  });
  return {
    pageCount: pages.length,
    firstDark: dark[0]?.dark || false,
    lastDark: dark[dark.length - 1]?.dark || false,
    darkCount: dark.filter((p) => p.dark).length,
    pages: dark
  };
}

function magazineStatMetrics(doc, px, compact) {
  const pages = findMagazinePages(doc);
  const stats = pages.map((page, index) => ({ page, index })).filter(({ page }) => page.matches('.page--stat,[data-page-kind="stat"]') || page.querySelector('.stat-xl, [class*="stat"]'));
  return {
    count: stats.length,
    adjacent: stats.some((item, index) => index > 0 && item.index === stats[index - 1].index + 1),
    stats: stats.map(({ page, index }) => {
      const num = page.querySelector('.stat-xl, .stat, [class*="stat"]') || largestFontDescendant(page, px) || page;
      return { index, page: compact(page), number: compact(num), fontSize: px(getComputedStyle(num).fontSize) };
    })
  };
}

function largestFontDescendant(root, px) {
  let best = null;
  let bestSize = 0;
  for (const el of root.querySelectorAll('*')) {
    if (!(el.textContent || '').trim()) continue;
    const size = px(getComputedStyle(el).fontSize);
    if (size > bestSize) {
      best = el;
      bestSize = size;
    }
  }
  return best;
}

async function magazineNavMetrics(doc, win) {
  const mag = findMagazineContainer(doc);
  const pages = findMagazinePages(doc);
  const nav = doc.querySelector('.nav-dots, [role="tablist"], [data-nav-dots]');
  const dots = nav ? [...nav.querySelectorAll('.nav-dot, button, a, [role="tab"]')] : [];
  const before = mag ? mag.scrollLeft : 0;
  if (mag) {
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    win.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  const afterKey = mag ? mag.scrollLeft : 0;
  if (dots[1]) dots[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  if (dots[1]) await new Promise((resolve) => setTimeout(resolve, 350));
  const afterClick = mag ? mag.scrollLeft : 0;
  return {
    hasMag: Boolean(mag),
    pageCount: pages.length,
    hasNav: Boolean(nav),
    dotCount: dots.length,
    before,
    afterKey,
    afterClick
  };
}

function findMagazineContainer(doc) {
  return doc.querySelector('.mag') || [...doc.querySelectorAll('body *')].find((el) => {
    const snap = getComputedStyle(el).scrollSnapType || '';
    return /\bx\b/.test(snap) && /mandatory/.test(snap);
  }) || null;
}

function findMagazinePages(doc) {
  const canonical = [...doc.querySelectorAll('.mag .page')];
  if (canonical.length) return canonical;
  const container = findMagazineContainer(doc);
  if (!container) return [];
  const children = [...container.children].filter((child) => {
    const cs = getComputedStyle(child);
    const rect = child.getBoundingClientRect();
    return cs.scrollSnapAlign !== 'none' || rect.width >= window.innerWidth * 0.8 && rect.height >= window.innerHeight * 0.8;
  });
  return children.length ? children : [...container.querySelectorAll('section, [data-page], [class*="page"]')];
}

async function keyboardHintsMetrics(doc, win) {
  const hints = doc.querySelector('.deck-hints, .keyboard-hint, [data-keyboard-hints]');
  if (!hints) return { hasHints: false };
  const before = getComputedStyle(hints).opacity;
  doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  win.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const afterKey = getComputedStyle(hints).opacity;
  const keyFaded = Number.parseFloat(afterKey || '1') < Number.parseFloat(before || '1') || hints.matches('.faded,.hidden,.is-hidden,[aria-hidden="true"]');
  await new Promise((resolve) => setTimeout(resolve, 4100));
  const afterTimer = getComputedStyle(hints).opacity;
  const timerFaded = Number.parseFloat(afterTimer || '1') < Number.parseFloat(before || '1') || hints.matches('.faded,.hidden,.is-hidden,[aria-hidden="true"]');
  return { hasHints: true, before, afterKey, afterTimer, keyFaded, timerFaded };
}

function diagramSlideMetrics(doc, px, compact) {
  const slides = [...doc.querySelectorAll('.slide--diagram')].filter((slide) => slide.querySelector('.mermaid'));
  const offenders = [];
  for (const slide of slides) {
    const wrap = slide.querySelector('.mermaid-wrap') || slide.querySelector('.mermaid');
    const svg = slide.querySelector('.mermaid svg');
    if (!svg || !wrap) {
      offenders.push({ slide: compact(slide), reason: 'Mermaid did not render svg' });
      continue;
    }
    const wrapW = wrap.getBoundingClientRect().width;
    const svgW = svg.getBoundingClientRect().width;
    const fixedHeight = Boolean(svg.getAttribute('height'));
    const smallLabels = [...svg.querySelectorAll('.nodeLabel')].filter((el) => px(getComputedStyle(el).fontSize) < 18).map(compact);
    const thinEdges = [...svg.querySelectorAll('.edgePath path,.flowchart-link')].filter((el) => px(getComputedStyle(el).strokeWidth) < 2).map(compact);
    const nodes = svg.querySelectorAll('.node').length;
    if (fixedHeight || Math.abs(wrapW - svgW) > 8 || smallLabels.length || thinEdges.length) {
      offenders.push({ slide: compact(slide), fixedHeight, wrapW: Math.round(wrapW), svgW: Math.round(svgW), smallLabels: smallLabels.slice(0, 5), thinEdges: thinEdges.slice(0, 5), nodeCount: nodes });
    }
  }
  return { slideCount: slides.length, offenders };
}

function slideDimContrastMetrics(doc, docEl, color) {
  const offenders = [];
  const dim = getComputedStyle(docEl).getPropertyValue('--text-dim').trim();
  const dimColor = color(dim);
  if (dimColor) {
    for (const root of doc.querySelectorAll('section.slide, .mag .page')) {
      const bg = effectiveBackground(root, color);
      const ratio = contrast(dimColor, bg);
      if (ratio < 4.5) offenders.push({ selector: selectorFor(root), kind: 'text-dim', ratio: Math.round(ratio * 100) / 100 });
    }
  }
  const pageBgs = [...doc.querySelectorAll('section.slide, .mag .page')].map((root) => effectiveBackground(root, color)).filter(Boolean);
  const distinctPageBgs = uniqueColors(pageBgs);
  for (const nav of doc.querySelectorAll('.nav-dots, .deck-hints, .keyboard-hint')) {
    const fg = color(getComputedStyle(nav).color);
    const ownBg = color(getComputedStyle(nav).backgroundColor);
    const backgrounds = ownBg && ownBg.a > 0.05 ? [ownBg] : distinctPageBgs.length ? distinctPageBgs : [effectiveBackground(nav, color)];
    for (const bg of backgrounds) {
      const ratio = contrast(fg, bg);
      if (ratio < 3) offenders.push({ selector: selectorFor(nav), kind: 'nav-chrome', ratio: Math.round(ratio * 100) / 100, bg });
    }
  }
  return { offenders: offenders.slice(0, 10) };
}

function effectiveBackground(el, color) {
  let cur = el;
  while (cur) {
    const bg = color(getComputedStyle(cur).backgroundColor);
    if (bg && bg.a > 0.05) return bg;
    cur = cur.parentElement;
  }
  return color(getComputedStyle(document.body).backgroundColor) || color(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
}

function uniqueColors(colors) {
  const seen = new Set();
  const out = [];
  for (const c of colors) {
    const key = `${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${Math.round((c.a ?? 1) * 100)}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }
  return out;
}

function posterCanvasMetrics(doc, compact) {
  const root = doc.querySelector('[data-poster-root], .poster, #poster') || doc.body.firstElementChild || doc.body;
  const rr = root.getBoundingClientRect();
  const width = rr.width || window.innerWidth;
  const height = rr.height || window.innerHeight;
  const offenders = [];
  for (const el of root.querySelectorAll('*')) {
    if (el.hasAttribute('data-bleed')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    const right = r.right - rr.left;
    const bottom = r.bottom - rr.top;
    const left = r.left - rr.left;
    const top = r.top - rr.top;
    const cut = right > width + 1 || bottom > height + 1 || left < -1 || top < -1;
    const truncated = cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1;
    if (cut || truncated) offenders.push({ ...compact(el), left, top, right, bottom, cut, truncated });
    if (offenders.length >= 10) break;
  }
  return { width, height, offenders };
}

function reelCaptionMetrics(doc, win, px, color) {
  const cap = doc.querySelector('.cap, .caption, [data-caption]');
  if (!cap) return { skipped: true, reason: 'No caption element' };
  const cs = getComputedStyle(cap);
  const r = cap.getBoundingClientRect();
  const bg = color(cs.backgroundColor);
  return {
    fontSize: px(cs.fontSize),
    fontWeight: Number.parseInt(cs.fontWeight, 10) || 0,
    bg,
    bgLuminance: luminance(bg),
    widthRatio: r.width / win.innerWidth,
    bottomThird: r.top >= win.innerHeight * 0.667,
    rect: { top: r.top, bottom: r.bottom, width: r.width }
  };
}

function reelSafeZoneMetrics(doc, win, compact) {
  const portrait = win.innerHeight > win.innerWidth;
  const safeTop = portrait ? 100 : 60;
  const safeBottom = portrait ? 200 : 140;
  const offenders = [...doc.querySelectorAll('h1,h2,h3,p,.primary-content,[data-primary],.hook-stat,.hook-claim,.beat-title,.body-copy,.cap')]
    .filter((el) => !el.closest('[data-bleed]') && getComputedStyle(el).display !== 'none')
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 0 && (r.top < safeTop || r.bottom > win.innerHeight - safeBottom);
    }).slice(0, 10).map((el) => {
      const r = el.getBoundingClientRect();
      return { ...compact(el), top: Math.round(r.top), bottom: Math.round(r.bottom), safeTop, safeBottom };
    });
  return { safeTop, safeBottom, offenders };
}

function reelFullBleedMetrics(doc, color) {
  const roots = [doc.documentElement, doc.body, doc.querySelector('.stage, .composition, [data-composition-root]')].filter(Boolean);
  const offenders = [];
  for (const el of roots) {
    const cs = getComputedStyle(el);
    const margin = ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'].map((prop) => Number.parseFloat(cs[prop]) || 0);
    const padding = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].map((prop) => Number.parseFloat(cs[prop]) || 0);
    const border = ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'].map((prop) => Number.parseFloat(cs[prop]) || 0);
    const shadow = cs.boxShadow && cs.boxShadow !== 'none';
    if (margin.some(Boolean) || padding.some(Boolean) || border.some(Boolean) || shadow) {
      offenders.push({ selector: selectorFor(el), margin, padding, border, shadow, bg: color(cs.backgroundColor) });
    }
  }
  return { offenders };
}

function reelThirdsMetrics(doc, win, compact) {
  const line = win.innerHeight * 0.667;
  const offenders = [];
  for (const el of doc.querySelectorAll('.primary-content,[data-primary],.hook-stat,.hook-claim,.beat-title,.body-copy')) {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.bottom > line) offenders.push({ ...compact(el), kind: 'primary-below-two-thirds', bottom: Math.round(r.bottom), line: Math.round(line) });
  }
  for (const el of doc.querySelectorAll('.cap,.caption,[data-caption]')) {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.top < line) offenders.push({ ...compact(el), kind: 'caption-above-bottom-third', top: Math.round(r.top), line: Math.round(line) });
  }
  return { offenders: offenders.slice(0, 10) };
}

function reelFocalMetrics(doc, compact) {
  const cards = [...doc.querySelectorAll('.card,.panel,[class*="card"],[class*="panel"]')].filter((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && Number.parseFloat(cs.opacity || '1') > 0.01;
    const styled = cs.borderStyle !== 'none' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.boxShadow !== 'none';
    return visible && styled && r.width * r.height > window.innerWidth * window.innerHeight * 0.04;
  });
  return { count: cards.length, cards: cards.slice(0, 10).map(compact) };
}

function reelTypographyMetrics(doc, px, compact) {
  const ranges = {
    'hook-stat': { min: 180, max: 260, weightMin: 600, weightMax: 700 },
    'hook-claim': { min: 80, max: 120, weightMin: 500, weightMax: 900 },
    'beat-title': { min: 60, max: 80, weightMin: 500, weightMax: 900 },
    'body-copy': { min: 32, max: 48, weightMin: 300, weightMax: 500 },
    cap: { min: 36, max: 44, weightMin: 600, weightMax: 900 },
    kicker: { min: 18, max: 22, weightMin: 500, weightMax: 900 }
  };
  const offenders = [];
  for (const [role, rule] of Object.entries(ranges)) {
    for (const el of doc.querySelectorAll(`.${role}`)) {
      const cs = getComputedStyle(el);
      const size = px(cs.fontSize);
      const weight = Number.parseInt(cs.fontWeight, 10) || 0;
      if (size < rule.min || size > rule.max || weight < rule.weightMin || weight > rule.weightMax) {
        offenders.push({ ...compact(el), role, size, weight });
      }
    }
  }
  return { offenders: offenders.slice(0, 10) };
}

function mermaidMetrics(doc, compact) {
  const blocks = [...doc.querySelectorAll('.mermaid, pre.mermaid')];
  return {
    count: blocks.length,
    offenders: blocks.filter((el) => {
      const hasSvg = Boolean(el.querySelector('svg'));
      const error = Boolean(el.querySelector('.error-icon, .errorText, [class*="error"]')) || /Syntax error|Parse error|mermaid version/i.test(el.textContent || '');
      return !hasSvg || error;
    }).map(compact)
  };
}

const BROWSER_METRIC_SOURCE = [
  collectBrowserMetrics,
  selectorFor,
  splitTracks,
  parseColor,
  luminance,
  contrast,
  colorDistance,
  proseMetrics,
  fixedOverlapMetrics,
  diagramArrowMetrics,
  arrowTerminalPoint,
  diagramAnchorAlignment,
  distanceToRectEdge,
  diagramTextMetrics,
  rectsIntersect,
  presetInversionMetrics,
  creamSandMetrics,
  flatTypeMetrics,
  typePair,
  rainbowAccentMetrics,
  grayOnColorMetrics,
  contrastMetrics,
  deEmphasisContrastFloor,
  isUpperLabel,
  classNameForMetric,
  matchedCssText,
  touchTargetMetrics,
  fontFamilySprawlMetrics,
  nothingAccentRedMetrics,
  nothingLabelsMetrics,
  hsl,
  typeBudgetMetrics,
  dotoMetrics,
  slideViewportMetrics,
  deckSnapMetrics,
  slideTextSizeMetrics,
  magazineDarkMetrics,
  magazineStatMetrics,
  largestFontDescendant,
  magazineNavMetrics,
  findMagazineContainer,
  findMagazinePages,
  keyboardHintsMetrics,
  diagramSlideMetrics,
  slideDimContrastMetrics,
  effectiveBackground,
  uniqueColors,
  posterCanvasMetrics,
  reelCaptionMetrics,
  reelSafeZoneMetrics,
  reelFullBleedMetrics,
  reelThirdsMetrics,
  reelFocalMetrics,
  reelTypographyMetrics,
  mermaidMetrics
].map((fn) => fn.toString()).join('\n');

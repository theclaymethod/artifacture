#!/usr/bin/env node
/**
 * Slide deck / magazine → PDF exporter.
 *
 * Renders an HTML slide deck or magazine to a multi-page PDF, one slide per
 * landscape page (1920×1080 by default). Handles scroll-snap decks, horizontal
 * magazines, and long scrollable pages. Chart.js canvases are converted to
 * images before export so they render in the PDF.
 *
 * Usage:
 *   node export-slides-pdf.mjs <input.html> <output.pdf> [options]
 *
 * Options:
 *   --mode=slides|magazine|scroll    Default: auto-detect from the DOM.
 *                                    slides   → one .slide per page (vertical deck)
 *                                    magazine → one .page per page (horizontal deck)
 *                                    scroll   → flow-based pagination (architecture,
 *                                               long-form pages)
 *   --orientation=landscape|portrait Default: landscape for slides/magazine,
 *                                    portrait for scroll.
 *   --width=<px>  --height=<px>      Page dimensions. Defaults to 1920×1080
 *                                    landscape or 1080×1920 portrait.
 *   --selector=<css>                 Override the per-page selector (default:
 *                                    .slide for slides mode, .page for magazine).
 *
 * Generalized for the visual-explainer skill's slide / magazine templates.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Dynamic import so we can fail with an actionable message instead of a raw
// ERR_MODULE_NOT_FOUND trace when Playwright isn't installed.
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error(`\nexport-slides-pdf.mjs: playwright is not installed.

Install it in the current directory (or any ancestor where Node can resolve it):

  npm install playwright
  npx playwright install chromium

Then re-run this command.\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith('--'));
const flags = Object.fromEntries(
  args.filter(a => a.startsWith('--')).map(a => {
    const eq = a.indexOf('=');
    return eq === -1 ? [a.slice(2), true] : [a.slice(2, eq), a.slice(eq + 1)];
  })
);

const inputHtml = positional[0];
const outputPdf = positional[1];

if (!inputHtml || !outputPdf) {
  console.error('Usage: export-slides-pdf.mjs <input.html> <output.pdf> [--mode=slides|magazine|scroll] [--orientation=landscape|portrait] [--width=N --height=N] [--selector=CSS]');
  process.exit(1);
}

const absInput = path.resolve(inputHtml);
const absOutput = path.resolve(outputPdf);

if (!fs.existsSync(absInput)) {
  console.error(`Input not found: ${absInput}`);
  process.exit(1);
}

let htmlContent = fs.readFileSync(absInput, 'utf-8');
const inputDir = path.dirname(absInput);

// Auto-detect mode from the DOM when the user didn't specify.
let mode = flags.mode;
if (!mode) {
  if (htmlContent.includes('scroll-snap-type: x')) mode = 'magazine';
  else if (/class="[^"]*\bslide\b/.test(htmlContent) || htmlContent.includes("class='slide'")) mode = 'slides';
  else mode = 'scroll';
}

const defaultSelector = { slides: '.slide', magazine: '.page', scroll: null }[mode];
const perPageSelector = flags.selector || defaultSelector;

const orientation = flags.orientation
  || (mode === 'scroll' ? 'portrait' : 'landscape');

const pageWidth = Number(flags.width)
  || (orientation === 'landscape' ? 1920 : 1080);
const pageHeight = Number(flags.height)
  || (orientation === 'landscape' ? 1080 : 1920);

// ---------- 1. Chart.js canvas → <img> shim ----------
// Canvas doesn't render in Playwright's PDF output, so after Chart.js finishes
// drawing we snapshot each canvas to a PNG and swap it in. Harmless on pages
// with no canvases.
const chartFixScript = `
<script>
window.addEventListener('load', function() {
  setTimeout(function() {
    document.querySelectorAll('canvas').forEach(function(canvas) {
      try {
        var img = new Image();
        img.src = canvas.toDataURL('image/png');
        img.style.width = canvas.style.width || canvas.width + 'px';
        img.style.height = canvas.style.height || canvas.height + 'px';
        img.style.maxWidth = '100%';
        canvas.parentNode.replaceChild(img, canvas);
      } catch (e) { /* tainted canvas — leave it */ }
    });
    document.body.setAttribute('data-pdf-ready', 'true');
  }, 1200);
});
</script>`;

// ---------- 2. Print CSS — collapses scroll-snap, forces one slide per page ----------
// Scroll-snap decks stack full-viewport slides that only occupy one physical
// page each when printed. Without these rules Playwright prints the first slide
// and clips the rest. Slides mode also kills the theme toggle, deck-nav, and
// other chrome that shouldn't appear on paper.
const printCss = mode === 'scroll' ? `
<style>
  @page { size: ${pageWidth}px ${pageHeight}px; margin: 0; }
  @media print {
    html, body { background: var(--bg, #ffffff) !important; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .theme-toggle, .deck-nav, .mag-nav, .zoom-controls { display: none !important; }
  }
</style>
` : `
<style>
  @page { size: ${pageWidth}px ${pageHeight}px; margin: 0; }
  @media print {
    html, body {
      height: auto !important;
      min-height: 0 !important;
      overflow: visible !important;
      background: var(--bg, #000000) !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .deck, .magazine {
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      overflow: visible !important;
      scroll-snap-type: none !important;
    }
    ${perPageSelector} {
      height: ${pageHeight}px !important;
      min-height: ${pageHeight}px !important;
      max-height: ${pageHeight}px !important;
      width: ${pageWidth}px !important;
      scroll-snap-align: none !important;
      break-after: page !important;
      page-break-after: always !important;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
      overflow: hidden !important;
    }
    ${perPageSelector}:last-child {
      break-after: avoid !important;
      page-break-after: avoid !important;
    }
    /* Fixed chrome: interactive-only, drop in print. Covers both aesthetics. */
    .theme-toggle,
    .deck-nav, .deck-progress, .deck-dots,
    .mag-nav, .mag-nav__dots, .mag-counter,
    .slide__progress, .slide-index, .slide-counter,
    .zoom-controls, .diagram-shell__hint {
      display: none !important;
    }
    /* Mermaid SVGs lose their fitted width when print layout recomputes —
       pin them to the container width so diagrams don't shrink to their
       natural authored size. */
    .mermaid-wrap svg,
    .mermaid svg {
      width: 100% !important;
      max-width: 100% !important;
      height: auto !important;
      max-height: 100% !important;
    }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
</style>
`;

htmlContent = htmlContent.replace('</head>', `${printCss}\n</head>`);
htmlContent = htmlContent.replace('</body>', `${chartFixScript}\n</body>`);

// ---------- 3. Serve the patched HTML over HTTP ----------
// file:// blocks script execution in some Chromium configs and breaks relative
// asset paths. A throwaway HTTP server keeps both working.
const port = 9870 + Math.floor(Math.random() * 100);
const server = http.createServer((req, res) => {
  const url = req.url === '/' ? '/index.html' : req.url;
  if (url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(htmlContent);
    return;
  }
  // Serve sibling assets (images, fonts, etc.) from the input's directory.
  const resolved = path.resolve(inputDir, '.' + path.sep + decodeURIComponent(url.split('?')[0]));
  if ((!resolved.startsWith(inputDir + path.sep) && resolved !== inputDir) || !fs.existsSync(resolved)) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  const assetPath = resolved;
  const ext = path.extname(assetPath).toLowerCase();
  const ct = {
    '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
    '.gif':'image/gif', '.webp':'image/webp', '.svg':'image/svg+xml',
    '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf',
    '.css':'text/css', '.js':'application/javascript',
    '.webm':'video/webm', '.mp4':'video/mp4'
  }[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': ct });
  fs.createReadStream(assetPath).pipe(res);
});
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));

// ---------- 4. Render ----------
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: pageWidth, height: pageHeight },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const ALLOWED_REMOTE = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net/npm/mermaid@', `http://127.0.0.1:${port}`];
await page.route('**/*', (route) => {
  const url = route.request().url();
  const allowed = url.startsWith('file:') || url.startsWith('data:') || url.startsWith('blob:') || ALLOWED_REMOTE.some((origin) => url.startsWith(origin));
  return allowed ? route.continue() : route.abort('blockedbyclient');
});

try {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle', timeout: 20000 });
} catch (err) {
  console.error(`Navigation failed: ${err.message}`);
  await browser.close();
  server.close();
  process.exit(1);
}

// Canvas → image swap has a 1.2s delay; wait for the marker.
try {
  await page.waitForSelector('[data-pdf-ready="true"]', { timeout: 6000 });
} catch {
  // No canvases — fine.
}

// ---------- Print-time DOM surgery ----------
// CSS-only pagination is brittle: :last-child selectors miss because of
// trailing whitespace nodes, flex-centered Mermaid wrappers collapse to the
// SVG's intrinsic size instead of the slide width, and fixed chrome leaks
// onto the trailing page Chromium inserts after the last break-after.
// Handle all three explicitly in the live DOM before the PDF snapshot.
if (mode !== 'scroll') {
  await page.evaluate(({ selector, pageWidth, pageHeight }) => {
    const slides = Array.from(document.querySelectorAll(selector));
    slides.forEach((s, i) => {
      s.style.setProperty('break-after',
        i === slides.length - 1 ? 'avoid' : 'page', 'important');
      s.style.setProperty('page-break-after',
        i === slides.length - 1 ? 'avoid' : 'always', 'important');
      s.style.setProperty('break-inside', 'avoid', 'important');
      s.style.setProperty('page-break-inside', 'avoid', 'important');
      s.style.setProperty('width',  pageWidth  + 'px', 'important');
      s.style.setProperty('height', pageHeight + 'px', 'important');
      s.style.setProperty('min-height', pageHeight + 'px', 'important');
      s.style.setProperty('max-height', pageHeight + 'px', 'important');
      s.style.setProperty('overflow', 'hidden', 'important');
    });

    // Mermaid flex-center collapse: force the .mermaid wrapper AND its SVG
    // to fill the parent .mermaid-wrap. Undo any live zoom transform.
    document.querySelectorAll('.mermaid-wrap').forEach(wrap => {
      wrap.style.setProperty('overflow', 'hidden', 'important');
      const mer = wrap.querySelector('.mermaid');
      if (mer) {
        mer.style.setProperty('width', '100%', 'important');
        mer.style.setProperty('height', '100%', 'important');
        mer.style.setProperty('zoom', '1', 'important');
        mer.style.setProperty('transform', 'none', 'important');
        mer.style.setProperty('display', 'flex', 'important');
        mer.style.setProperty('align-items', 'center', 'important');
        mer.style.setProperty('justify-content', 'center', 'important');
      }
      wrap.querySelectorAll('svg').forEach(svg => {
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.style.setProperty('width', '100%', 'important');
        svg.style.setProperty('height', '100%', 'important');
        svg.style.setProperty('max-width', '100%', 'important');
        svg.style.setProperty('max-height', '100%', 'important');
      });
    });

    // Fixed chrome (progress bars, nav dots, scroll hints, page counter) has
    // position: fixed, so it repeats on every printed page. Hide it here
    // regardless of what the original class names were.
    const chromeSelectors = [
      '.theme-toggle', '.deck-progress', '.deck-dots', '.deck-nav',
      '.mag-nav', '.mag-nav__dots', '.mag-counter',
      '.slide__progress', '.slide-counter', '.slide-index',
      '.zoom-controls', '.diagram-shell__hint'
    ];
    document.querySelectorAll(chromeSelectors.join(',')).forEach(el => {
      el.style.setProperty('display', 'none', 'important');
    });

    // Any position:fixed element we didn't name: if it's outside every slide,
    // drop it too. Scroll-to-navigate hints and similar helpers fall into
    // this bucket.
    document.querySelectorAll('body *').forEach(el => {
      if (el.closest(selector)) return;
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' && cs.display !== 'none') {
        el.style.setProperty('display', 'none', 'important');
      }
    });
  }, { selector: perPageSelector, pageWidth, pageHeight });
}

if (mode === 'scroll') {
  // Flow-based pagination: let Chromium paginate the long page naturally.
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(400);
  await page.pdf({
    path: absOutput,
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
    width: `${pageWidth}px`,
    height: `${pageHeight}px`,
    preferCSSPageSize: true,
  });
} else {
  // Slide / magazine mode: screenshot each slide independently, then composite
  // them into a multi-page PDF via an off-screen HTML that stacks the images
  // with a hard page break between each. This avoids the trailing-blank-page
  // quirk Chromium produces when `break-after: page` cascades past the last
  // element, and also sidesteps any live-scroll / flex-collapse bugs in the
  // slide templates.
  const slides = await page.$$(perPageSelector);
  if (slides.length === 0) {
    console.error(`No elements matched selector "${perPageSelector}" — check --selector or --mode.`);
    await browser.close();
    server.close();
    process.exit(1);
  }

  const shots = [];
  for (let i = 0; i < slides.length; i++) {
    const buf = await slides[i].screenshot({ type: 'png', omitBackground: false });
    shots.push(buf.toString('base64'));
  }

  const compositeHtml = `<!doctype html><meta charset="utf-8">
<style>
  @page { size: ${pageWidth}px ${pageHeight}px; margin: 0; }
  html, body { margin: 0; padding: 0; background: #000; }
  .pg {
    width: ${pageWidth}px;
    height: ${pageHeight}px;
    display: block;
    break-after: page;
    page-break-after: always;
    overflow: hidden;
  }
  .pg:last-child { break-after: auto; page-break-after: auto; }
  .pg img { width: 100%; height: 100%; display: block; }
</style>
${shots.map(b64 => `<section class="pg"><img src="data:image/png;base64,${b64}"></section>`).join('')}`;

  const composite = await context.newPage();
  await composite.setContent(compositeHtml, { waitUntil: 'load' });
  await composite.emulateMedia({ media: 'print' });
  await composite.pdf({
    path: absOutput,
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
    width: `${pageWidth}px`,
    height: `${pageHeight}px`,
    preferCSSPageSize: true,
  });
  await composite.close();
}

await browser.close();
server.close();

const bytes = fs.statSync(absOutput).size;
const kb = Math.round(bytes / 1024);
console.log(`PDF exported: ${absOutput} (${kb} KB, mode=${mode}, ${pageWidth}×${pageHeight})`);

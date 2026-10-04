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

import fs from 'node:fs';
import path from 'node:path';
import { detectProfile, isFixedStagePresentation } from './verify/lib/profile.mjs';

let openBrowserSession;
let settleBrowserArtifact;
try {
  ({ openBrowserSession, settleBrowserArtifact } = await import('./browser-owner.mjs'));
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND' || !/['"]playwright-core['"]/.test(error.message)) throw error;
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

const layout = detectProfile(absInput, htmlContent);
const inferredMode = isFixedStagePresentation(htmlContent) ? 'scroll'
  : { slides: 'slides', magazine: 'magazine' }[layout]
    || (/<[^>]+\bclass=["'][^"']*\bslide\b/i.test(htmlContent) ? 'slides' : 'scroll');
const mode = flags.mode || inferredMode;
if (!['slides', 'magazine', 'scroll'].includes(mode)) throw new Error(`Unsupported PDF mode: ${mode}`);

const defaultSelector = { slides: '.slide, [data-ve-deck="vertical"] > section', magazine: '.page, [data-ve-deck="horizontal"] > section', scroll: null }[mode];
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
  setTimeout(async function() {
    var canvases = Array.from(document.querySelectorAll('canvas'));
    var state = { complete: false, expected: canvases.length, converted: 0, failures: 0 };
    window.__vePdfCanvasState = state;
    for (var canvas of canvases) {
      try {
        if (canvas.width === 0 || canvas.height === 0) throw new Error('zero-sized canvas');
        var dataUrl = canvas.toDataURL('image/png');
        if (!dataUrl.startsWith('data:image/png;base64,')) throw new Error('invalid PNG data URL');
        var img = new Image();
        img.src = dataUrl;
        img.style.width = canvas.style.width || canvas.width + 'px';
        img.style.height = canvas.style.height || canvas.height + 'px';
        img.style.maxWidth = '100%';
        if (typeof img.decode === 'function') await img.decode();
        if (!canvas.parentNode) throw new Error('canvas is detached');
        canvas.parentNode.replaceChild(img, canvas);
        state.converted += 1;
      } catch (error) {
        state.failures += 1;
      }
    }
    state.complete = true;
    document.body.setAttribute('data-pdf-ready', state.failures === 0 ? 'true' : 'false');
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

let session;
try {
  session = await openBrowserSession({ artifact: { filePath: absInput, html: htmlContent }, purpose: 'artifact' });
  const { page, context } = await session.newPage({
    viewport: { width: pageWidth, height: pageHeight },
    deviceScaleFactor: 2,
  });
  try {
    await page.goto(session.url, { waitUntil: 'networkidle', timeout: 20000 });
  } catch (error) {
    throw new Error(`Navigation failed: ${error.message}`);
  }
  const settlement = await settleBrowserArtifact(page);
  if (settlement.mermaidError) throw new Error(settlement.mermaidError);

  // Canvas → image swap has a 1.2s delay. Any canvas observed by the conversion
  // pass must complete before export; if readiness times out, a canvas still in
  // the DOM makes the export fail closed.
  let canvasState;
  let canvasReadinessError;
  try {
    await page.waitForFunction(
      () => window.__vePdfCanvasState?.complete === true,
      undefined,
      { timeout: 6000 },
    );
    canvasState = await page.evaluate(() => window.__vePdfCanvasState);
  } catch (error) {
    canvasReadinessError = error;
  }

  let canvasFailure;
  if (canvasState) {
    const remainingCanvases = await page.locator('canvas').count();
    if (
      canvasState.failures > 0
      || canvasState.converted !== canvasState.expected
      || remainingCanvases > 0
    ) {
      canvasFailure = `converted ${canvasState.converted} of ${canvasState.expected} canvas elements; ${remainingCanvases} remain`;
    }
  } else {
    const observedCanvases = await page.locator('canvas').count();
    if (observedCanvases > 0) {
      canvasFailure = canvasReadinessError?.message || 'readiness state was not reported';
    }
  }

  if (canvasFailure) {
    throw new Error(`Canvas preparation failed; PDF was not exported (${canvasFailure}).`);
  }

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
      throw new Error(`No elements matched selector "${perPageSelector}"; check --selector or --mode.`);
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

} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await session?.close();
}

if (!process.exitCode) {
  const bytes = fs.statSync(absOutput).size;
  const kb = Math.round(bytes / 1024);
  console.log(`PDF exported: ${absOutput} (${kb} KB, mode=${mode}, ${pageWidth}×${pageHeight})`);
}

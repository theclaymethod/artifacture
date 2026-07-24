const PAGE = ['page'];
const DECK = ['slides', 'magazine'];
const ALL_RENDERED = ['page', 'slides', 'magazine', 'poster', 'video-comp'];

export const checks = {
  'prose-readability-minimums': metricCheck('prose-readability-minimums', {
    profiles: PAGE,
    appliesWhen: (ctx) => /\.prose\b/.test(ctx.html || ''),
    status: 'warn',
    failWhen: (metric) => metric?.offenders?.length,
    evidence: (failures) => `Prose readability candidates: ${summarizeOffenders(failures, 'offenders')}`,
    fix_hint: 'Keep .prose body copy at >=16px, line-height >=1.5, and measure below the wide tolerance band.'
  }),

  'no-console-errors': {
    appliesWhen: (ctx) => inProfile(ctx, ['page', 'slides', 'magazine', 'video-comp']),
    collect: metricCollector('no-console-errors'),
    run(ctx) {
      const issues = [];
      for (const run of browserRuns(ctx)) {
        for (const error of run.consoleErrors || []) {
          if (!allowedRuntimeIssue(error.text)) issues.push({ run: runLabel(run), kind: 'console', text: error.text });
        }
        for (const error of run.pageErrors || []) {
          if (!allowedRuntimeIssue(error.message)) issues.push({ run: runLabel(run), kind: 'pageerror', text: error.message });
        }
        for (const failure of run.failedRequests || []) {
          if (!allowedRuntimeIssue(`${failure.url} ${failure.failure || ''}`)) issues.push({ run: runLabel(run), kind: 'request', text: `${failure.status || failure.failure || 'failed'} ${failure.url}` });
        }
      }
      if (issues.length) {
        return [finding('fail', `Runtime errors or failed requests: ${json(issues.slice(0, 10))}`, 'browser console/network', 'Fix console errors and failed asset loads; transient CDN/font failures are retried once before this check reports.')];
      }
      return [finding('pass', 'No console errors, page errors, or non-allowlisted failed requests across browser runs.')];
    }
  },

  'no-horizontal-body-overflow': metricCheck('no-horizontal-body-overflow', {
    profiles: PAGE,
    failWhen: (metric) => metric && (metric.docOverflow > 1 || metric.bodyOverflow > 1),
    evidence: (failures) => `Body/document horizontal overflow: ${json(failures.map(({ run, metric }) => ({ run, docOverflow: metric.docOverflow, bodyOverflow: metric.bodyOverflow, innerWidth: metric.innerWidth, sourceCensus: metric.sourceCensus?.slice(0, 3) })).slice(0, 10))}`,
    where: 'documentElement/body scrollWidth',
    fix_hint: 'At 390px and 1440px, documentElement/body scrollWidth must be within 1px of innerWidth; wrap wide content or constrain the overflow source.'
  }),

  'overflow-source-census': metricCheck('overflow-source-census', {
    profiles: PAGE,
    failWhen: (metric) => metric?.offenders?.length,
    evidence: (failures) => `Visible overflow sources: ${summarizeOffenders(failures, 'offenders')}`,
    where: 'body * with overflow-x:visible',
    fix_hint: 'Add a targeted scroll container, min-width:0, max-width:100%, or wrapping to the reported source; intentional scrollers should use overflow-x:auto/scroll.'
  }),

  'grid-flex-child-min-width-0': metricCheck('grid-flex-child-min-width-0', {
    profiles: PAGE,
    runFilter: mobileRun,
    appliesWhen: (ctx) => /(^|\s)(grid|flex)(\s|$)|-grid\b|-row\b/.test(ctx.html || ''),
    failWhen: (metric) => metric?.offenders?.length,
    evidence: (failures) => `Shrink-refusing grid/flex children: ${summarizeOffenders(failures, 'offenders')}`,
    fix_hint: 'Only measured overflowing children fail; add min-width:0 to the reported grid/flex child or its reusable child pattern.'
  }),

  'fixed-grid-collapses-single-column': metricCheck('fixed-grid-collapses-single-column', {
    profiles: PAGE,
    runFilter: mobileRun,
    appliesWhen: (ctx) => /arch-grid|comparison|diff-panels|dir-compare|-grid\b|minmax\(0,\s*1fr\)/.test(ctx.html || ''),
    failWhen: (metric) => metric?.offenders?.length,
    evidence: (failures) => `Multi-column grids still active at mobile: ${summarizeOffenders(failures, 'offenders')}`,
    fix_hint: 'At <=768px, fixed multi-column grids must resolve to one grid track, except documented auto-fit KPI rows.'
  }),

  'wide-content-scroll-x-wrapper': metricCheck('wide-content-scroll-x-wrapper', {
    profiles: PAGE,
    runFilter: mobileRun,
    appliesWhen: (ctx) => /<table\b|class=["'][^"']*(?:pipeline|dir-tree|code-block)|<svg\b/i.test(ctx.html || ''),
    failWhen: (metric) => metric?.offenders?.length,
    evidence: (failures) => `Wide content without local horizontal scroller: ${summarizeOffenders(failures, 'offenders')}`,
    fix_hint: 'Wrap measured-overflow tables, diagrams, directory trees, pipelines, and code blocks in an overflow-x:auto container.'
  }),

  'dir-tree-connectors-no-wrap': metricCheck('dir-tree-connectors-no-wrap', {
    profiles: PAGE,
    appliesWhen: (ctx) => /dir-tree|[├└│]/.test(ctx.html || ''),
    failWhen: (metric) => metric?.offenders?.length,
    evidence: (failures) => `Directory-tree wrapping/no-scroll offenders: ${summarizeOffenders(failures, 'offenders')}`,
    fix_hint: 'Directory trees must preserve whitespace with pre/nowrap and scroll horizontally instead of wrapping connector glyphs.'
  }),

  'text-clip-candidates': metricCheck('text-clip-candidates', {
    profiles: PAGE,
    runFilter: mobileRun,
    status: 'warn',
    failWhen: (metric) => metric?.candidates?.length,
    evidence: (failures) => `Mechanical text-clip candidates: ${summarizeOffenders(failures, 'candidates')}`,
    fix_hint: 'Investigate these clipped text candidates visually; intentional ellipsis and line clamps are excluded.'
  }),

  'content-behind-fixed-ui-candidates': metricCheck('content-behind-fixed-ui-candidates', {
    profiles: PAGE,
    runFilter: mobileRun,
    appliesWhen: (ctx) => /position\s*:\s*fixed|class=["'][^"']*(?:theme-toggle|fixed)/i.test(ctx.html || ''),
    status: 'warn',
    failWhen: (metric) => metric?.candidates?.length,
    evidence: (failures) => `Fixed chrome overlap candidates: ${json(flattenMetric(failures, 'candidates', 10))}`,
    fix_hint: 'Confirm visually whether fixed UI obscures content; if so, add safe padding/insets or move the chrome.'
  }),

  'diagram-arrow-endpoint-air-gap': metricCheck('diagram-arrow-endpoint-air-gap', {
    profiles: ALL_RENDERED,
    runFilter: desktopRun,
    appliesWhen: (ctx) => /data-diagram-role.{0,160}(?:arrow|connector)/i.test(ctx.html || ''),
    failWhen: (metric) => metric?.offenders?.length,
    evidence: (failures) => `Arrow source/target endpoints outside 6-10px air-gap: ${summarizeOffenders(failures, 'offenders')}`,
    fix_hint: 'Tag both source and target when known. Each endpoint must stop 6-10px from its node border; declared side-center anchors must hit that side and its midpoint within 3px.'
  }),

  'diagram-text-clipping-overlap': metricCheck('diagram-text-clipping-overlap', {
    profiles: ALL_RENDERED,
    appliesWhen: (ctx) => /<svg\b/i.test(ctx.html || ''),
    failWhen: (metric) => metric?.offenders?.length,
    evidence: (failures) => `Diagram text clipping/overlap: ${summarizeOffenders(failures, 'offenders')}`,
    fix_hint: 'Keep SVG text inside the viewBox/container and avoid unexpected label collisions; arrow-label masks should contain their text with padding.'
  }),

  'preset-both-mode-inversion': metricCheck('preset-both-mode-inversion', {
    profiles: DECK.concat(PAGE),
    runFilter: desktopRun,
    appliesWhen: namedAesthetic,
    failWhen: (metric) => metric && (metric.baseContrast < 4.5 || metric.invisible?.length),
    evidence: (failures) => `Mode contrast/invisible text failures: ${json(failures.map(({ run, metric }) => ({ run, baseContrast: metric.baseContrast, invisible: metric.invisible?.slice(0, 5) })).slice(0, 10))}`,
    fix_hint: 'Named aesthetics must preserve >=4.5:1 body contrast in light and dark and must not resolve text to the same color as its background.'
  }),

  'cream-sand-background': metricCheck('cream-sand-background', {
    profiles: ALL_RENDERED,
    runFilter: desktopRun,
    appliesWhen: (ctx) => ctx.preset !== 'paper-ink' && !/\b(?:paper|parchment|receipt|linen)\b/i.test(ctx.html || ''),
    status: 'warn',
    failWhen: (metric) => metric && (metric.isCreamSand || metric.reflexToken),
    evidence: (failures) => `Cream/sand body background candidates: ${json(failures.map(({ run, metric }) => ({ run, bg: metric.bg, hsl: metric.hsl, reflexToken: metric.reflexToken })).slice(0, 10))}`,
    fix_hint: 'Avoid reflex warm cream/sand page backgrounds unless paper-ink or the subject explicitly calls for paper/parchment.'
  }),

  'flat-type-scale-weak-hierarchy': metricCheck('flat-type-scale-weak-hierarchy', {
    profiles: ALL_RENDERED,
    runFilter: desktopRun,
    status: 'warn',
    appliesWhen: (ctx) => /<h[1-3]\b/i.test(ctx.html || '') && /<p\b/i.test(ctx.html || '') && !/<table\b/i.test(ctx.html || ''),
    failWhen: (metric) => metric?.pairs?.some((pair) => pair.flat),
    evidence: (failures) => `Weak type hierarchy pairs: ${json(flattenMetric(failures, 'pairs', 10).filter((pair) => pair.flat))}`,
    fix_hint: 'Separate adjacent type roles by at least size, weight, or color; size-only adjacent ratios below 1.25 need another contrast axis.'
  }),

  'rainbow-accent-palette': metricCheck('rainbow-accent-palette', {
    profiles: ALL_RENDERED,
    runFilter: desktopRun,
    status: 'warn',
    failWhen: (metric) => metric && metric.bucketCount > 4,
    evidence: (failures) => `Decorative saturated hue buckets: ${json(failures.map(({ run, metric }) => ({ run, buckets: metric.buckets, samples: metric.samples })).slice(0, 10))}`,
    fix_hint: 'Limit non-data UI chrome to a tighter accent palette; charts and syntax highlighting are excluded.'
  }),

  'gray-text-on-colored-surface': metricCheck('gray-text-on-colored-surface', {
    profiles: ALL_RENDERED,
    status: 'warn',
    failWhen: (metric) => metric?.offenders?.length,
    evidence: (failures) => `Mid-gray text on saturated surfaces: ${summarizeOffenders(failures, 'offenders')}`,
    fix_hint: 'Use near-white/near-black or hue-tinted text on accent surfaces, not neutral mid-gray.'
  }),

  'body-text-contrast-aa': metricCheck('body-text-contrast-aa', {
    profiles: ALL_RENDERED,
    failWhen: (metric) => metric?.offenders?.length,
    evidence: (failures) => `Text contrast below WCAG AA: ${summarizeOffenders(failures, 'offenders')}`,
    fix_hint: 'Informational text needs 4.5:1 contrast below 24px, or 3:1 for large/bold text.'
  }),

  'undersized-touch-targets': metricCheck('undersized-touch-targets', {
    profiles: ALL_RENDERED,
    status: 'warn',
    appliesWhen: (ctx) => /<button\b|<a\b[^>]*href=|role\s*=\s*["']button|onclick=|<input\b/i.test(ctx.html || ''),
    failWhen: (metric) => metric?.offenders?.length,
    evidence: (failures) => `Clickable controls below 44px hit target: ${summarizeOffenders(failures, 'offenders')}`,
    fix_hint: 'Provide at least a 44x44px clickable parent for nav dots, tabs, controls, links, and buttons.'
  }),

  'deck-rail-first-frame-collapsed': metricCheck('deck-rail-first-frame-collapsed', {
    profiles: DECK,
    runFilter: desktopRun,
    appliesWhen: (ctx) => /data-rail|aria-label\s*=\s*["']Slides|case-rail|class\s*=\s*["'][^"']*\brail\b/i.test(ctx.html || ''),
    failWhen: (metric) => metric?.obscuresFirstFrame,
    evidence: (failures) => `Deck rail exposed before user intent: ${json(failures.map(({ run, metric }) => ({ run, exposedWidth: metric.exposedWidth, expanded: metric.expanded, rail: metric.rail })).slice(0, 10))}`,
    fix_hint: 'Start collapsible deck rails as a <=44px spine. Remove timer-driven peek/auto-expansion behavior that obscures the opening slide.'
  }),

  'deck-navigation-shell-safe-controls': metricCheck('deck-navigation-shell-safe-controls', {
    profiles: DECK,
    runFilter: desktopRun,
    appliesWhen: (ctx) => /data-rail|aria-label\s*=\s*["'](?:Slides|Previous slide|Next slide)|case-rail|class\s*=\s*["'][^"']*\brail\b/i.test(ctx.html || ''),
    failWhen: (metric) => metric?.undersized?.length || metric?.chapterTooLow || metric?.modalYield === false,
    evidence: (failures) => `Unsafe deck shell controls: ${json(failures.map(({ run, metric }) => ({ run, undersized: metric.undersized, chapterGap: metric.chapterGap, modalYield: metric.modalYield })).slice(0, 10))}`,
    fix_hint: 'Use >=44px brand/chapter/pager targets, anchor chapters directly below the brand cell, and make the rail yield while a dialog or drill sheet is open.'
  }),

  'font-family-sprawl': metricCheck('font-family-sprawl', {
    profiles: ALL_RENDERED,
    appliesWhen: (ctx) => /font-family|--font-|fonts\.googleapis\.com/i.test(ctx.html || ''),
    failWhen: (metric) => metric && metric.count > 4,
    evidence: (failures) => `More than four computed named font families: ${json(failures.map(({ run, metric }) => ({ run, fonts: metric.fonts, count: metric.count })).slice(0, 10))}`,
    fix_hint: 'Collect computed primary font-family on visible text nodes; keep named families to four or fewer.'
  }),

  'nothing-accent-red-single-use': metricCheck('nothing-accent-red-single-use', {
    profiles: DECK.concat(PAGE),
    appliesWhen: nothing,
    failWhen: (metric) => metric && metric.count > 1,
    evidence: (failures) => `Nothing accent red painted on too many elements: ${json(failures.map(({ run, metric }) => ({ run, count: metric.count, painted: metric.painted })).slice(0, 10))}`,
    fix_hint: 'Count painted foreground/background/border uses of #D71921, not token declarations; keep at most one.'
  }),

  'nothing-labels-allcaps-mono': metricCheck('nothing-labels-allcaps-mono', {
    profiles: DECK.concat(PAGE),
    appliesWhen: nothing,
    failWhen: (metric) => metric?.offenders?.length,
    evidence: (failures) => `Nothing labels missing Space Mono or uppercase treatment: ${summarizeOffenders(failures, 'offenders')}`,
    fix_hint: 'Structural Nothing labels must compute to Space Mono and render uppercase.'
  }),

  'nothing-type-size-budget': metricCheck('nothing-type-size-budget', {
    profiles: PAGE,
    runFilter: desktopRun,
    appliesWhen: nothing,
    failWhen: (metric) => metric && metric.count > 3,
    evidence: (failures) => `Nothing type-size clusters exceed three: ${json(failures.map(({ run, metric }) => ({ run, sizes: metric.sizes })))}`,
    fix_hint: 'Nothing pages use exactly three type-size roles: Doto hero, Space Grotesk body, and Space Mono caption.'
  }),

  'nothing-doto-single-hero': {
    appliesWhen: (ctx) => inProfile(ctx, PAGE) && nothing(ctx),
    collect: metricCollector('nothing-doto-single-hero'),
    run(ctx) {
      const hard = [];
      const warn = [];
      for (const run of browserRuns(ctx).filter(desktopRun)) {
        const metric = run.metrics?.['nothing-doto-single-hero'];
        if (!metric) continue;
        const badUses = (metric.uses || []).filter((use) => use.wordCount > 6 || use.fontSize < 36);
        const ambiguity = (metric.uses || []).filter((use) => use.fontSize >= 36 && use.fontSize < 48);
        if (metric.count !== 1 || badUses.length) hard.push({ run: runLabel(run), count: metric.count, uses: metric.uses, badUses });
        if (ambiguity.length) warn.push({ run: runLabel(run), ambiguity });
      }
      if (hard.length) return [finding('fail', `Nothing Doto hero violations: ${json(hard)}`, 'Doto text elements', 'Doto must be used exactly once, for short hero text only; <36px is an error.')];
      if (warn.length) return [finding('warn', `Nothing Doto hero is in the 36-47px doc-ambiguity band: ${json(warn)}`, 'Doto text elements', 'Use >=48px to satisfy the authoritative Nothing motif section.')];
      return [finding('pass', 'Nothing Doto hero usage satisfies count, size, and text-length requirements.')];
    }
  },

  'slide-viewport-fit-no-internal-scroll': metricCheck('slide-viewport-fit-no-internal-scroll', {
    profiles: DECK,
    appliesWhen: deckPresent,
    failWhen: (metric) => metric && (metric.offenders?.length || metric.documentVerticalScrollbar || (metric.isMagazine && (metric.bodyOverflowY !== 'hidden' || metric.magOverflowY !== 'hidden'))),
    evidence: (failures) => `Slide/page viewport-fit failures: ${json(failures.map(({ run, metric }) => ({ run, offenders: metric.offenders, documentVerticalScrollbar: metric.documentVerticalScrollbar, bodyOverflowY: metric.bodyOverflowY, magOverflowY: metric.magOverflowY })).slice(0, 10))}`,
    fix_hint: 'Each fixed-canvas slide/page must fit one viewport with no internal overflow; documented nested scrollers are excluded.'
  }),

  'deck-scroll-snap-axis': metricCheck('deck-scroll-snap-axis', {
    profiles: DECK,
    appliesWhen: deckPresent,
    failWhen(metric, run, ctx) {
      if (!metric) return false;
      if (metric.stateDriven) return false;
      if (ctx.profile === 'magazine') return !/x\b/.test(metric.mag || '') || !/mandatory/.test(metric.mag || '') || metric.ySnap?.length;
      return !/y\b/.test(metric.deck || '') || !/mandatory/.test(metric.deck || '');
    },
    evidence: (failures) => `Deck scroll-snap axis failures: ${json(failures.map(({ run, metric }) => ({ run, mag: metric.mag, deck: metric.deck, ySnap: metric.ySnap })).slice(0, 10))}`,
    fix_hint: 'Vertical decks must use y mandatory snap; magazine decks must use x mandatory and must not mix in a page-level y snap engine.'
  }),

  'min-slide-body-text-16px': metricCheck('min-slide-body-text-16px', {
    profiles: DECK,
    runFilter: desktopRun,
    appliesWhen: deckPresent,
    failWhen: (metric) => metric?.offenders?.length,
    evidence: (failures) => `Slide body text below 16px: ${summarizeOffenders(failures, 'offenders')}`,
    fix_hint: 'Slide and magazine body text must be >=16px; documented label/caption/badge classes are exempt.'
  }),

  'magazine-dark-cover-backcover-min3-invariant': metricCheck('magazine-dark-cover-backcover-min3-invariant', {
    profiles: ['magazine'],
    appliesWhen: (ctx) => ctx.profile === 'magazine' || /\.mag\b[\s\S]*\.page\b/.test(ctx.html || ''),
    failWhen: (metric) => metric && (!metric.firstDark || !metric.lastDark || metric.darkCount < 3),
    evidence: (failures) => `Magazine dark-page invariant failures: ${json(failures.map(({ run, metric }) => ({ run, firstDark: metric.firstDark, lastDark: metric.lastDark, darkCount: metric.darkCount, pageCount: metric.pageCount })).slice(0, 10))}`,
    fix_hint: 'Magazine cover and back cover must be dark, at least three pages must be dark, and dark pages must stay absolute across OS schemes.'
  }),

  'magazine-stat-page-anchor': metricCheck('magazine-stat-page-anchor', {
    profiles: ['magazine'],
    runFilter: desktopRun,
    appliesWhen: (ctx) => ctx.profile === 'magazine' || /\.mag\b[\s\S]*\.page\b/.test(ctx.html || ''),
    failWhen: (metric) => metric && (metric.count < 1 || metric.adjacent || metric.stats?.some((stat) => stat.fontSize < 100)),
    evidence: (failures) => `Magazine stat-page anchor failures: ${json(failures.map(({ run, metric }) => ({ run, count: metric.count, adjacent: metric.adjacent, stats: metric.stats })).slice(0, 10))}`,
    fix_hint: 'Magazine decks need at least one full-bleed stat page with a 100px+ number and no adjacent stat pages.'
  }),

  'magazine-nav-dots-and-keyboard': metricCheck('magazine-nav-dots-and-keyboard', {
    profiles: ['magazine'],
    appliesWhen: (ctx) => ctx.profile === 'magazine' || /\.mag\b[\s\S]*\.page\b/.test(ctx.html || ''),
    failWhen: (metric) => metric && (!metric.hasNav || metric.dotCount !== metric.pageCount || metric.afterKey <= metric.before || (metric.pageCount > 1 && metric.afterClick <= metric.before)),
    evidence: (failures) => `Magazine nav/keyboard failures: ${json(failures.map(({ run, metric }) => ({ run, pageCount: metric.pageCount, hasNav: metric.hasNav, dotCount: metric.dotCount, before: metric.before, afterKey: metric.afterKey, afterClick: metric.afterClick })).slice(0, 10))}`,
    fix_hint: 'Magazine decks need one nav dot per page and keyboard/click navigation that changes .mag.scrollLeft.'
  }),

  'diagram-slide-legibility': metricCheck('diagram-slide-legibility', {
    profiles: ['slides'],
    appliesWhen: (ctx) => /slide--diagram[\s\S]*mermaid|mermaid[\s\S]*slide--diagram/i.test(ctx.html || ''),
    failWhen: (metric) => metric?.offenders?.length,
    evidence: (failures) => `Slide Mermaid legibility failures: ${summarizeOffenders(failures, 'offenders')}`,
    fix_hint: 'Mermaid slide diagrams must render, fill their wrap width, avoid fixed height, keep node labels >=18px, and use >=2px edge strokes.'
  }),

  'keyboard-hints-autofade': metricCheck('keyboard-hints-autofade', {
    profiles: ['slides'],
    appliesWhen: (ctx) => /deck-hints|keyboard-hint|data-keyboard-hints/i.test(ctx.html || ''),
    status: 'warn',
    failWhen: (metric) => metric && metric.hasHints && (!metric.keyFaded || !metric.timerFaded),
    evidence: (failures) => `Keyboard hint fade failures: ${json(failures.map(({ run, metric }) => ({ run, keyFaded: metric.keyFaded, timerFaded: metric.timerFaded, before: metric.before, afterKey: metric.afterKey, afterTimer: metric.afterTimer })).slice(0, 10))}`,
    fix_hint: 'Keyboard hints should fade on first key/click interaction and after roughly 4 seconds without interaction.'
  }),

  'slide-dim-text-contrast': metricCheck('slide-dim-text-contrast', {
    profiles: DECK,
    status: 'warn',
    appliesWhen: deckPresent,
    failWhen: (metric) => metric?.offenders?.length,
    evidence: (failures) => `Dim text/nav contrast candidates: ${summarizeOffenders(failures, 'offenders')}`,
    fix_hint: 'Dimmed slide text should meet 4.5:1 against its page background; nav chrome should meet at least 3:1.'
  }),

  'poster-content-within-canvas': metricCheck('poster-content-within-canvas', {
    profiles: ['poster'],
    failWhen: (metric) => metric?.offenders?.length,
    evidence: (failures) => `Poster canvas overflow/truncation: ${summarizeOffenders(failures, 'offenders')}`,
    fix_hint: 'Poster content element bounds must stay within the declared canvas; only documented data-bleed backgrounds may extend past it.'
  }),

  'reel-caption-styling': metricCheck('reel-caption-styling', {
    profiles: ['video-comp'],
    status: 'warn',
    appliesWhen: (ctx) => /\.cap\b|\.caption\b|data-caption/.test(ctx.html || ''),
    failWhen: (metric) => metric && !metric.skipped && (metric.fontSize < 36 || metric.fontSize > 44 || metric.fontWeight !== 600 || metric.bgLuminance > 0.25 || metric.widthRatio > 0.95 || !metric.bottomThird),
    evidence: (failures) => `Reel caption style candidates: ${json(failures.map(({ run, metric }) => ({ run, ...metric })).slice(0, 10))}`,
    fix_hint: 'Reel captions should be a 36-44px, weight-600, dark bottom-third overlay pill, not a full-bleed strip.'
  }),

  'reel-safe-zone-margins': metricCheck('reel-safe-zone-margins', {
    profiles: ['video-comp'],
    failWhen: (metric) => metric?.offenders?.length,
    evidence: (failures) => `Reel safe-zone failures: ${summarizeOffenders(failures, 'offenders')}`,
    fix_hint: 'Primary reel content must clear top and caption safe zones; decorative/full-bleed art should be marked as bleed.'
  }),

  'reel-full-bleed-no-gutters': metricCheck('reel-full-bleed-no-gutters', {
    profiles: ['video-comp'],
    failWhen: (metric) => metric?.offenders?.length,
    evidence: (failures) => `Reel full-bleed wrapper failures: ${summarizeOffenders(failures, 'offenders')}`,
    fix_hint: 'Composition root/body/stage must have zero margin and padding and no visible framed gutters.'
  }),

  'reel-vertical-hierarchy-thirds': metricCheck('reel-vertical-hierarchy-thirds', {
    profiles: ['video-comp'],
    status: 'warn',
    failWhen: (metric) => metric?.offenders?.length,
    evidence: (failures) => `Reel vertical hierarchy candidates: ${summarizeOffenders(failures, 'offenders')}`,
    fix_hint: 'Primary reel content should stay in the top two-thirds and captions in the bottom third.'
  }),

  'reel-single-focal-element': metricCheck('reel-single-focal-element', {
    profiles: ['video-comp'],
    status: 'warn',
    failWhen: (metric) => metric && metric.count >= 3,
    evidence: (failures) => `Reel frames with 3+ focal card candidates: ${json(failures.map(({ run, metric }) => ({ run, count: metric.count, cards: metric.cards })).slice(0, 10))}`,
    fix_hint: 'Reel frames should present one focal element; 3+ simultaneous card-like blocks need visual confirmation.'
  }),

  'reel-typography-roles': metricCheck('reel-typography-roles', {
    profiles: ['video-comp'],
    status: 'warn',
    appliesWhen: (ctx) => /hook-stat|hook-claim|beat-title|body-copy|\bcap\b|kicker/.test(ctx.html || ''),
    failWhen: (metric) => metric?.offenders?.length,
    evidence: (failures) => `Reel role typography out of range: ${summarizeOffenders(failures, 'offenders')}`,
    fix_hint: 'Role-tagged reel typography must stay inside the documented size/weight ranges.'
  })
};

function metricCheck(id, config) {
  return {
    appliesWhen(ctx) {
      return inProfile(ctx, config.profiles || ALL_RENDERED) && (config.appliesWhen ? config.appliesWhen(ctx) : true);
    },
    collect: metricCollector(id),
    run(ctx) {
      const failures = [];
      for (const run of browserRuns(ctx)) {
        if (config.runFilter && !config.runFilter(run)) continue;
        const metric = run.metrics?.[id];
        if (config.failWhen(metric, run, ctx)) failures.push({ run: runLabel(run), metric });
      }
      if (failures.length) {
        return [finding(config.status || 'fail', config.evidence(failures), config.where || id, config.fix_hint)];
      }
      return [finding('pass', `${id} passed across applicable browser runs.`)];
    }
  };
}

function metricCollector(id) {
  return async (page) => page.evaluate((metricId) => window.__veLastMetrics?.[metricId] ?? null, id);
}

function inProfile(ctx, profiles) {
  return profiles.includes(ctx.profile || 'page');
}

function browserRuns(ctx) {
  return ctx.browser?.runs || [];
}

function finding(status, evidence, where = 'browser', fix_hint = '') {
  return { status, evidence, where, fix_hint };
}

function runLabel(run) {
  return `${run.viewport}-${run.scheme}${run.reducedMotion ? '-reduced-motion' : ''}`;
}

function desktopRun(run) {
  return run.width >= 1000 && !run.reducedMotion;
}

function mobileRun(run) {
  return run.width <= 600 && !run.reducedMotion;
}

function deckPresent(ctx) {
  return ['slides', 'magazine'].includes(ctx.profile) || /section=["']?slide|class=["'][^"']*(?:\bslide\b|\bmag\b|\bpage\b)/i.test(ctx.html || '');
}

function namedAesthetic(ctx) {
  return ['mono-industrial', 'nothing'].includes(ctx.preset);
}

function nothing(ctx) {
  return ctx.preset === 'nothing';
}

function allowedRuntimeIssue(text = '') {
  return /favicon\.ico|ResizeObserver loop limit exceeded|Non-Error promise rejection captured|net::ERR_ABORTED/i.test(text);
}

function summarizeOffenders(failures, key) {
  return json(flattenMetric(failures, key, 10));
}

function flattenMetric(failures, key, limit) {
  const out = [];
  for (const failure of failures) {
    for (const item of failure.metric?.[key] || []) {
      out.push({ run: failure.run, ...item });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function json(value) {
  return JSON.stringify(value);
}

for (const id of Object.keys(checks)) {
  checks[id].collect ||= metricCollector(id);
  if (checks[id].run) {
    const original = checks[id].run;
    checks[id].run = function runWithSkip(ctx) {
      if (!checks[id].appliesWhen(ctx)) return [finding('skip', `${id} does not apply to profile/present content.`)];
      return original(ctx);
    };
  }
}

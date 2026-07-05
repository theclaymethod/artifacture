import { all, classMatches, cssRules, fail, isAllCapsLabel, ownText, textOf, warn, wordCount } from '../generic.mjs';

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]|✅|❌|⚠️/u;

export const checks = Object.fromEntries([
  ['no-emoji-in-ui-chrome', scoped((ctx) => ctx.dom && all(ctx.dom, 'h1,h2,h3,h4,h5,h6,.section-label,.section-header,.kicker,.status,td').length > 0, (ctx) => {
    for (const el of all(ctx.dom, 'h1,h2,h3,h4,h5,h6,.section-label,.section-header,.kicker,.status,[class*="status"],td')) {
      if (el.closest('code,pre')) continue;
      const text = ownText(el) || textOf(el);
      if (EMOJI_RE.test(text)) return [fail(`emoji glyph in UI chrome: ${text}`, selectorName(el))];
    }
    return [];
  })],
  ['no-three-dot-window-chrome', scoped((ctx) => ctx.dom && /code-block|code-file|<pre\b/i.test(ctx.html), (ctx) => {
    for (const head of all(ctx.dom, '.code-block header,.code-file__head,.code-header,.window-chrome')) {
      const children = Array.from(head.children || []);
      const circles = children.filter((el) => isSmallCircle(styleFor(ctx, el), el));
      if (circles.length >= 3 && hasTrafficLightTriple(circles.map((el) => styleFor(ctx, el)))) return [fail('macOS traffic-light dot chrome on code block', selectorName(head))];
    }
    return [];
  })],
  ['file-structure-head-contract', scoped((ctx) => ctx.dom, (ctx) => {
    if (!/^\s*<!doctype html>/i.test(ctx.html)) return [fail('file does not start with <!DOCTYPE html>', 'doctype')];
    if (!ctx.dom.querySelector('meta[charset]')) return [fail('missing <meta charset>', 'head')];
    const viewport = ctx.dom.querySelector('meta[name="viewport"]')?.getAttribute('content') || '';
    if (!/width=device-width/i.test(viewport) || !/initial-scale=1(?:\.0)?/i.test(viewport)) return [fail('missing viewport width=device-width, initial-scale=1.0', 'head')];
    if (!textOf(ctx.dom.querySelector('title'))) return [fail('missing non-empty <title>', 'head')];
    return [];
  })],
  ['code-block-length-constrained', scoped((ctx) => ctx.profile === 'page' && ctx.dom && all(ctx.dom, 'pre code').length > 0, (ctx) => {
    for (const code of all(ctx.dom, 'pre code')) {
      if (code.closest('details')) continue;
      const lines = (code.textContent || '').split('\n').length;
      const pre = code.closest('pre');
      const style = `${pre?.getAttribute('style') || ''} ${ctx.styles}`;
      if (lines > 100) return [warn(`code block has ${lines} lines outside <details>`, 'pre code')];
      if (lines > 32 && !/max-height\s*:[^;]+;\s*overflow-y\s*:\s*(?:auto|scroll)|overflow-y\s*:\s*(?:auto|scroll)[^}]+max-height\s*:/i.test(style)) return [warn('tall code block lacks max-height plus overflow-y auto/scroll', 'pre code')];
    }
    return [];
  })],
  ['prose-accent-overuse', scoped((ctx) => ctx.profile === 'page' && ctx.dom && /pullquote|pull-quote|dropcap|first-letter/i.test(ctx.html), (ctx) => {
    const pulls = all(ctx.dom, '.pullquote,.pull-quote,blockquote.pull');
    if (pulls.length > 2) return [warn(`too many pull quotes (${pulls.length})`, 'pull quote')];
    const drops = all(ctx.dom, '.lead--dropcap,.dropcap');
    if (drops.length > 1 || ((ctx.styles.match(/::first-letter/g) || []).length > 1)) return [warn('drop cap used more than once', 'drop cap')];
    return [];
  })],
  ['no-scroll-x-on-prose', scoped((ctx) => ctx.profile === 'page' && ctx.dom && all(ctx.dom, '.scroll-x').length > 0, (ctx) => {
    for (const el of all(ctx.dom, 'p.scroll-x,.hero.scroll-x,.headline.scroll-x,.prose.scroll-x,.card-grid.scroll-x')) {
      return [warn('scroll-x applied to prose/hero/card-grid instead of only wide media', selectorName(el))];
    }
    return [];
  })],
  ['toc-nav-structure', scoped((ctx) => ctx.dom && ctx.dom.querySelector('.wrap') && ctx.dom.querySelector('nav.toc'), (ctx) => {
    const wrap = ctx.dom.querySelector('.wrap');
    const first = wrap.firstElementChild;
    if (!first || first.tagName.toLowerCase() !== 'nav' || !first.classList.contains('toc')) return [fail('nav.toc must be the first child of .wrap', '.wrap')];
    const main = wrap.querySelector(':scope > .main') || wrap.querySelector('.main');
    if (!main) return [fail('.wrap must contain .main for content', '.wrap')];
    if (all(ctx.dom, '.sec-head').some((el) => !main.contains(el))) return [fail('.sec-head content leaks outside .main', '.sec-head')];
    if (!/\.main[^{]*\{[^}]*min-width\s*:\s*0/i.test(ctx.styles)) return [fail('.main lacks min-width:0', '.main')];
    return [];
  })],
  ['toc-anchors-resolve', scoped((ctx) => ctx.dom && ctx.dom.querySelector('nav.toc'), (ctx) => {
    const heads = all(ctx.dom, '.sec-head');
    if (heads.some((h) => !h.id)) return [fail('.sec-head missing id', '.sec-head')];
    const links = all(ctx.dom, 'nav.toc a[href^="#"]').filter((a) => !/^#(?:top)?$/.test(a.getAttribute('href')));
    for (const link of links) {
      const id = link.getAttribute('href').slice(1);
      if (!ctx.dom.getElementById(id)) return [fail(`TOC anchor does not resolve: #${id}`, 'nav.toc')];
    }
    return links.length === heads.length ? [] : [fail(`TOC link count ${links.length} does not match section count ${heads.length}`, 'nav.toc')];
  })],
  ['skip-toc-under-four-sections', scoped((ctx) => ctx.dom && ctx.dom.querySelector('nav.toc'), (ctx) => all(ctx.dom, '.sec-head').length < 4 ? [warn('TOC present with fewer than four sections', 'nav.toc')] : [])],
  ['decorative-blur-orbs', scoped((ctx) => ctx.dom && /blur\s*\(|particles\.js|tsparticles|requestAnimationFrame|<canvas\b/i.test(ctx.html), (ctx) => {
    if (/(?:particles\.js|tsparticles)/i.test(ctx.html)) return [warn('decorative particle backdrop library detected', 'particle backdrop')];
    const candidates = all(ctx.dom, 'div,span,i,canvas').filter((el) => !textOf(el) && decorativeOrbStyle(styleFor(ctx, el)));
    if (candidates.length >= 2) return [warn(`ambient blur orb backdrop has ${candidates.length} empty blurred shapes`, candidates.slice(0, 2).map(selectorName).join(', '))];
    const pseudoOrbs = cssRules(ctx.styles).filter((rule) => /::(?:before|after)\b/i.test(rule.selector) && decorativeOrbStyle(rule.body));
    if (pseudoOrbs.length >= 2) return [warn(`ambient blur orb backdrop has ${pseudoOrbs.length} pseudo-element shapes`, pseudoOrbs.slice(0, 2).map((rule) => rule.selector).join(', '))];
    if (/<canvas\b/i.test(ctx.html) && /requestAnimationFrame[\s\S]{0,240}(?:arc|fillRect|particles?|dots?)/i.test(ctx.scripts || '')) return [warn('decorative animated canvas particle layer', 'canvas')];
    return [];
  })],
  ['nested-cards', scoped((ctx) => ctx.dom && /card|box-shadow|border-radius|border\s*:/i.test(ctx.html), (ctx) => {
    const cards = new Set(all(ctx.dom, 'div,section,article,li').filter((el) => isCardLike(ctx, el)));
    for (const card of cards) {
      for (let parent = card.parentElement; parent; parent = parent.parentElement) {
        if (cards.has(parent) && sameTreatment(styleFor(ctx, card), styleFor(ctx, parent))) return [fail('card nested inside same-treatment card', `${selectorName(parent)} > ${selectorName(card)}`)];
      }
    }
    return [];
  })],
  ['side-stripe-border', scoped((ctx) => ctx.dom && /border-(?:left|right)\s*:/i.test(ctx.html), (ctx) => {
    for (const el of all(ctx.dom, 'blockquote,div,section,article,li,aside')) {
      const style = styleFor(ctx, el);
      const side = thickSideBorder(style);
      if (side && /(?:card|callout|alert|item|box-shadow|background|border-radius)/i.test(`${el.getAttribute('class') || ''} ${style}`)) return [fail(`one-sided saturated ${side} accent stripe`, selectorName(el))];
    }
    return [];
  })],
  ['font-family-sprawl', scoped((ctx) => ctx.dom && /font-family|--font-/i.test(ctx.html), (ctx) => {
    const fonts = authoredFontFamilies(ctx).filter((font) => !/^(?:system-ui|sans-serif|serif|monospace|ui-sans-serif|ui-serif|ui-monospace)$/i.test(font));
    return fonts.length > 4 ? [fail(`more than four named font families: ${fonts.join(', ')}`, 'font-family')] : [];
  })],
  ['uppercase-no-tracking', scoped((ctx) => ctx.preset === 'custom' && ctx.dom && /uppercase|text-transform\s*:\s*uppercase/i.test(ctx.html), (ctx) => {
    for (const el of all(ctx.dom, '.badge,.eyebrow,.kicker,.label,nav a,button,h5,h6')) {
      const text = textOf(el);
      if (!text || wordCount(text) > 6) continue;
      const style = styleFor(ctx, el);
      if ((/text-transform\s*:\s*uppercase/i.test(style) || isAllCapsLabel(text)) && !/letter-spacing\s*:\s*(?:0?\.0?[5-9]em|0?\.[1-9]\d*em|[1-9]px)/i.test(style)) return [warn('uppercase label lacks tracking', selectorName(el))];
    }
    return [];
  })],
  ['hidden-until-js-reveal', scoped((ctx) => ctx.dom && /opacity\s*:\s*0|visibility\s*:\s*hidden/i.test(ctx.styles) && /IntersectionObserver|classList\.add|\.visible|\.revealed|\.in-view/i.test(ctx.html), (ctx) => {
    if (/prefers-reduced-motion\s*:\s*reduce[\s\S]{0,400}(?:opacity\s*:\s*1|visibility\s*:\s*visible)|<noscript\b/i.test(ctx.html)) return [];
    for (const rule of cssRules(ctx.styles)) {
      if (!/(opacity\s*:\s*0|visibility\s*:\s*hidden)/i.test(rule.body)) continue;
      const base = rule.selector.replace(/(?:\.is-visible|\.visible|\.revealed|\.in-view|\.active|:not\([^)]*\))/gi, '').trim();
      if (base && new RegExp(`${escapeForRe(base)}(?:\\.is-visible|\\.visible|\\.revealed|\\.in-view|\\.active)[^{]*\\{[^}]*(?:opacity\\s*:\\s*1|visibility\\s*:\\s*visible)`, 'i').test(ctx.styles)) {
        return [fail('content defaults hidden until JS reveal without fallback', rule.selector)];
      }
    }
    return [];
  })],
  ['fake-loading-theater', scoped((ctx) => ctx.dom && /skeleton|spinner|loading|progress-bar|role\s*=\s*["']progressbar/i.test(ctx.html), (ctx) => {
    if (/\b(?:fetch|XMLHttpRequest|import\s*\()\b/i.test(ctx.scripts || ctx.html)) return [];
    return /setTimeout|animation-delay|setInterval/i.test(ctx.html) ? [warn('timer-driven loading UI with no real async work', 'loading affordance')] : [];
  })],
  ['mixed-icon-systems', scoped((ctx) => ctx.dom && /<li\b|class\s*=\s*["'][^"']*(?:row|item|feature)/i.test(ctx.html), (ctx) => {
    for (const parent of all(ctx.dom, 'ul,ol,.list,.features,.rows')) {
      const kids = Array.from(parent.children || []).filter((el) => textOf(el));
      if (kids.length < 3) continue;
      const kinds = new Set(kids.map(markerKind).filter(Boolean));
      if (kinds.size >= 2) return [warn(`mixed icon systems in same sibling pattern: ${Array.from(kinds).join(', ')}`, selectorName(parent))];
    }
    return [];
  })],
  ['inline-emoji-bullets', scoped((ctx) => ctx.dom && all(ctx.dom, 'li,p').length >= 3, (ctx) => {
    const hits = all(ctx.dom, 'li,p').filter((el) => EMOJI_RE.test((textOf(el).match(/^\S+/) || [''])[0]) && !el.closest('code,pre'));
    return hits.length >= 3 ? [warn(`leading emoji bullet pattern across ${hits.length} items`, selectorName(hits[0].parentElement))] : [];
  })],
  ['meaning-without-labels', scoped((ctx) => ctx.dom && /legend|key|swatch|status|#(?:dc2626|16a34a|ef4444|22c55e)|red|green/i.test(ctx.html), (ctx) => {
    for (const el of all(ctx.dom, '.legend,.key,[class*="legend"],[class*="swatch"],[class*="status"]')) {
      if (/background|border-radius|width\s*:\s*(?:\d|1\d|2\d)px/i.test(styleFor(ctx, el)) && !textOf(el) && !el.getAttribute('aria-label') && !el.getAttribute('title')) return [warn('bare color/icon swatch lacks adjacent label', selectorName(el))];
    }
    const redGreen = all(ctx.dom, '[class*="red"],[class*="green"],[style*="red"],[style*="green"],[style*="#dc2626"],[style*="#16a34a"],[style*="#ef4444"],[style*="#22c55e"]');
    if (redGreen.length >= 2 && !/pass|fail|before|after|old|new|added|removed|error|success|deprecated/i.test(redGreen.map(textOf).join(' '))) return [warn('red/green status pair carries meaning without labels', 'status color')];
    return [];
  })],
  ['uniform-descriptor-gloss', scoped((ctx) => ctx.dom && /grid|list|catalog|gloss|muted|dim|subtitle|caption|description/i.test(ctx.html), (ctx) => {
    for (const parent of repeatedItemContainers(ctx)) {
      const kids = Array.from(parent.children || []).filter((el) => textOf(el) && !descriptorGuardedContext(el));
      if (kids.length < 5) continue;
      const hits = kids.map((item) => descriptorGlossPair(ctx, item)).filter(Boolean);
      if (hits.length >= 5 && hits.length / kids.length >= 0.8) {
        const examples = hits.slice(0, 3).map((hit) => hit.gloss).join(', ');
        return [warn(`uniform per-item descriptor gloss across ${hits.length} siblings: ${examples}`, selectorName(parent))];
      }
    }
    return [];
  })],
  ['hero-metric-template', scoped((ctx) => ctx.dom && /\d(?:[%x/]|[\d,.])/i.test(ctx.html), (ctx) => {
    const repeatedMetrics = (ctx.html.match(/class\s*=\s*["'][^"']*(?:num|metric|stat)[^"']*["'][^>]*>\s*[\d,.]+(?:%|x|\/\d)?/gi) || []).length;
    if (repeatedMetrics >= 3 && /gradient|accent|background|color/i.test(ctx.html)) return [warn(`hero metric template with ${repeatedMetrics} repeated numeric nodes`, 'metric tiles')];
    for (const parent of all(ctx.dom, '.metrics,.stats,.kpis,.hero,section')) {
      const tiles = Array.from(parent.children || []).filter((el) => /\b[\d,.]+(?:%|x|\/\d)?\b/.test(textOf(el)) && wordCount(textOf(el)) <= 8);
      if (tiles.length >= 3 && /gradient|accent|color|background/i.test(tiles.map((el) => styleFor(ctx, el)).join(' '))) return [warn(`hero metric template with ${tiles.length} repeated tiles`, selectorName(parent))];
    }
    return [];
  })],
  ['card-as-universal-wrapper', scoped((ctx) => ctx.dom && /card|box-shadow|border-radius/i.test(ctx.html), (ctx) => {
    const blocks = Array.from((ctx.dom.querySelector('main') || ctx.dom.body)?.children || []).filter((el) => textOf(el));
    if (blocks.length < 4) return [];
    const cardBlocks = blocks.filter((el) => isCardLike(ctx, el));
    const singletons = cardBlocks.filter((el) => Array.from(el.children || []).filter((child) => textOf(child)).length <= 1);
    return cardBlocks.length / blocks.length >= 0.9 && singletons.length ? [warn('nearly every top-level content block is boxed as a card', 'main flow')] : [];
  })],
  ['flat-wall-of-bullets', scoped((ctx) => ctx.dom && /<[uo]l\b/i.test(ctx.html), (ctx) => {
    for (const list of all(ctx.dom, 'main > ul,main > ol,section > ul,section > ol')) {
      const items = Array.from(list.children || []).filter((el) => el.tagName?.toLowerCase() === 'li');
      if (items.length < 8) continue;
      const avg = items.reduce((sum, item) => sum + textOf(item).length, 0) / items.length;
      if (avg > 60 && !all(list, 'strong,b,h5,h6,hr').length) return [warn(`flat ${items.length}-item explanatory bullet wall`, selectorName(list))];
    }
    return [];
  })],
  ['inconsistent-heading-case', scoped((ctx) => ctx.dom && all(ctx.dom, 'h1,h2,h3,h4,h5,h6').length >= 3, (ctx) => {
    for (const level of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
      const heads = all(ctx.dom, level).map(textOf).filter(Boolean);
      if (heads.length < 3) continue;
      const cases = new Set(heads.map(caseKind).filter(Boolean));
      if (cases.size >= 2) return [warn(`${level.toUpperCase()} mixes heading casing styles: ${Array.from(cases).join(', ')}`, level)];
    }
    return [];
  })],
  ['diagram-typography-mono-scope', scoped(hasDiagramDom, (ctx) => {
    for (const el of diagramEls(ctx)) {
      const role = el.getAttribute('data-diagram-role') || '';
      const style = `${el.getAttribute('style') || ''};font-family:${el.getAttribute('font-family') || ''}`;
      if (/font-family\s*:[^;]*(?:mono|monospace|space mono|roboto mono)/i.test(style) && !/(?:label|code|metric|annotation|axis|legend)/i.test(role)) return [fail('diagram monospace typography used outside label/code/metric roles', selectorName(el))];
    }
    return [];
  })],
  ['diagram-host-token-inheritance', scoped((ctx) => ctx.profile !== 'poster' && hasDiagramDom(ctx), (ctx) => {
    if (/<svg\b[\s\S]*?<style\b[\s\S]*?:root\s*\{[\s\S]*--(?:paper|ink|bg|text)/i.test(ctx.html)) return [warn('embedded diagram redeclares root color tokens', '<svg><style>')];
    return /<svg\b[^>]*(?:color|background|font-family)\s*=/i.test(ctx.html) ? [warn('diagram host hard-codes inherited color/background/font attributes', '<svg>')] : [];
  })],
  ['diagram-z-order-arrows-before-nodes', scoped(hasDiagramDom, (ctx) => {
    const roles = diagramEls(ctx).map((el) => el.getAttribute('data-diagram-role') || '');
    const firstNode = roles.findIndex((role) => /node|step|decision|entity|item/.test(role));
    const lateArrow = roles.findIndex((role, index) => index > firstNode && /arrow|edge|connector/.test(role));
    return firstNode >= 0 && lateArrow >= 0 ? [fail('diagram arrow/edge is layered after nodes', 'data-diagram-role')] : [];
  })],
  ['diagram-legend-placement', scoped(hasDiagramDom, (ctx) => {
    const legends = diagramEls(ctx).filter((el) => /legend/.test(el.getAttribute('data-diagram-role') || '') || classMatches(el, /legend/));
    if (!legends.length) return [];
    const bad = legends.find((el) => !/top|right|bottom|left|legend/.test((el.getAttribute('class') || '') + (el.getAttribute('data-position') || '')));
    return bad ? [fail('diagram legend lacks explicit edge placement', selectorName(bad))] : [];
  })],
  ['diagram-arrow-label-masking-rect', scoped(hasDiagramDom, (ctx) => {
    const labels = diagramEls(ctx).filter((el) => /arrow-label/.test(el.getAttribute('data-diagram-role') || ''));
    if (!labels.length) return [];
    return /data-diagram-role\s*=\s*["']arrow-label-mask|class\s*=\s*["'][^"']*arrow-label-mask/i.test(ctx.html) ? [] : [fail('arrow labels lack masking rect/background', 'arrow-label')];
  })],
  ['diagram-density-budget', scoped(hasDiagramDom, (ctx) => {
    const nodes = diagramEls(ctx).filter((el) => /node|step|decision|entity|item/.test(el.getAttribute('data-diagram-role') || '')).length;
    const arrows = diagramEls(ctx).filter((el) => /arrow|edge|connector|transition/.test(el.getAttribute('data-diagram-role') || '') || /url\(#arrow/i.test(el.getAttribute('marker-end') || '')).length;
    if (nodes > 9) return [fail(`diagram node budget exceeded (${nodes})`, '<svg>')];
    if (arrows > 12) return [fail(`diagram arrow budget exceeded (${arrows})`, '<svg>')];
    return [];
  })],
  ['diagram-focal-accent-count', scoped(hasDiagramDom, (ctx) => {
    const accents = diagramEls(ctx).filter((el) => /accent|primary|warn|err|highlight|var\(--accent\)/.test((el.getAttribute('class') || '') + (el.getAttribute('data-diagram-role') || '') + (el.getAttribute('style') || '') + (el.getAttribute('fill') || '') + (el.getAttribute('stroke') || ''))).length;
    return accents > 2 ? [fail(`diagram has ${accents} focal accent candidates`, '<svg>')] : [];
  })],
  ['diagram-complexity-budget-by-type', scoped(hasDiagramDom, (ctx) => {
    const lanes = diagramEls(ctx).filter((el) => /lane/.test(el.getAttribute('data-diagram-role') || '')).length;
    const circles = all(ctx.dom, 'svg circle').length;
    if (lanes > 5) return [fail(`swimlane count exceeds 5 (${lanes})`, 'lane')];
    if (/venn/i.test(ctx.html) && circles > 3) return [fail('Venn diagram exceeds 3 circles', 'venn')];
    return [];
  })],
  ['diagram-shape-semantics', scoped(hasDiagramDom, (ctx) => {
    for (const el of diagramEls(ctx)) {
      const role = el.getAttribute('data-diagram-role') || '';
      if (/decision/.test(role) && el.tagName.toLowerCase() !== 'polygon' && !/diamond/i.test(el.getAttribute('class') || '')) return [fail('decision role should use diamond/polygon semantics', selectorName(el))];
      if (/step|node/.test(role) && el.tagName.toLowerCase() === 'rect') {
        const rx = Number(el.getAttribute('rx') || '0');
        if (rx > 8) return [fail(`step/node rect radius too large (${rx})`, selectorName(el))];
      }
    }
    return [];
  })],
  ['diagram-quadrant-conventions', scoped((ctx) => hasDiagramDom(ctx) && /quadrant/i.test(ctx.html), (ctx) => /data-diagram-role\s*=\s*["']axis|class\s*=\s*["'][^"']*axis/i.test(ctx.html) && /data-diagram-role\s*=\s*["']quadrant|class\s*=\s*["'][^"']*quadrant/i.test(ctx.html) ? [] : [fail('quadrant diagram lacks axes/quadrant role conventions', 'quadrant')])],
  ['diagram-annotation-callout-conventions', scoped((ctx) => hasDiagramDom(ctx) && /callout|annotation/i.test(ctx.html), (ctx) => {
    if (!/data-diagram-role\s*=\s*["'][^"']*(?:annotation|callout)/i.test(ctx.html)) return [fail('diagram callout/annotation lacks role tagging', 'annotation')];
    if (all(ctx.dom, '[data-diagram-role*="leader"], [class*="leader"]').some((el) => !el.getAttribute('stroke-dasharray'))) return [fail('annotation leader is not dashed', 'annotation leader')];
    return [];
  })],
  ['diagram-sketchy-filter-shapes-not-text', scoped((ctx) => hasDiagramDom(ctx) && /sketch|rough|filter/i.test(ctx.html), (ctx) => /<text\b[^>]*filter\s*=/i.test(ctx.html) ? [fail('sketchy filter applied to diagram text', '<text>')] : [])],
  ['diagram-proportional-honesty', scoped((ctx) => hasDiagramDom(ctx) && /pyramid|proportional|timeline/i.test(ctx.html), (ctx) => /data-value|data-weight|data-start|data-end/i.test(ctx.html) ? [] : [fail('proportional diagram lacks data values/intervals', '<svg>')])],
  ['mono-theme-toggle-structure', scoped((ctx) => isMono(ctx) && ctx.profile === 'page' && ctx.dom, (ctx) => {
    const toggles = all(ctx.dom, '[role="radiogroup"],.theme-toggle,.theme-dock').filter((el) => /light/i.test(textOf(el)) && /dark/i.test(textOf(el)) && /auto|system/i.test(textOf(el)));
    if (!toggles.length) return [fail('Mono-Industrial page lacks 3-option light/dark/auto toggle', 'theme toggle')];
    if (toggles.some((el) => /[○●◐]/.test(textOf(el)))) return [fail('theme toggle uses unicode circle glyphs instead of inline SVG icons', 'theme toggle')];
    return toggles.some((el) => all(el, 'svg').length >= 3) ? [] : [fail('theme toggle options lack inline SVG icons', 'theme toggle')];
  })],
  ['mono-data-table', scoped((ctx) => isMono(ctx) && ctx.dom && ctx.dom.querySelector('table'), (ctx) => {
    if (/nth-child\s*\(\s*(?:even|odd)\s*\)[^{]*\{[^}]*background/i.test(ctx.styles)) return [fail('Mono table uses zebra striping', 'table')];
    if (/(?:td|th)[^{]*\{[^}]*(?:border-left|border-right)\s*:/i.test(ctx.styles)) return [fail('Mono table uses vertical cell borders', 'table')];
    if (/(?:td|th)[^{]*\{[^}]*(?:text-overflow\s*:\s*ellipsis|-webkit-line-clamp|white-space\s*:\s*nowrap[^}]*overflow\s*:\s*hidden)/i.test(ctx.styles)) return [fail('Mono table truncates cell text', 'table')];
    return [];
  })],
  ['mono-instrument-microcopy', scoped(isMono, (ctx) => {
    for (const el of all(ctx.dom, '.label,.caption,.kicker,.metadata,.meta,.index')) {
      const text = textOf(el);
      if (!text) continue;
      if (!isAllCapsLabel(text) && !/text-transform\s*:\s*uppercase/i.test(el.getAttribute('style') || ctx.styles)) return [warn('Mono instrument microcopy is not uppercase', selectorName(el))];
      if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(text)) return [warn('Mono metadata date uses slashes instead of YYYY · MM · DD', selectorName(el))];
    }
    return [];
  })],
  ['mono-code-block-terminal', scoped((ctx) => isMono(ctx) && /code-block|language-|<pre\b/i.test(ctx.html), (ctx) => {
    if (/prism-(?:tomorrow|okaidia|twilight)|line-numbers|copy-button/i.test(ctx.html)) return [warn('Mono code block uses stock Prism chrome/line numbers/copy button', 'code block')];
    for (const pre of all(ctx.dom, 'pre')) if ((pre.textContent || '').split('\n').length > 20 && !pre.closest('details')) return [warn('Mono code block over 20 lines outside <details>', 'pre')];
    return [];
  })],
  ['mono-hero-and-surprise-count', scoped(isMono, (ctx) => {
    const heroes = all(ctx.dom, '[role="hero"],.ve-hero,.hero');
    if (heroes.length > 1) return [fail(`more than one hero element (${heroes.length})`, 'hero')];
    const surprises = new Set(all(ctx.dom, '[style*="Geist Pixel"],[class*="surprise"],[class*="pixel"],[style*="border-radius:50%"]'));
    for (const rule of cssRules(ctx.styles)) {
      if (!/font-family\s*:[^;{}]*Geist Pixel/i.test(rule.body)) continue;
      for (const el of all(ctx.dom, '*')) {
        const tag = el.tagName?.toLowerCase?.() || '';
        const classes = Array.from(el.classList || []);
        if (rule.selector.split(',').some((selector) => selectorMatchesSimple(selector.trim(), tag, classes, el.id))) surprises.add(el);
      }
    }
    return surprises.size === 0 || surprises.size > 1 ? [fail(`Mono pattern-break candidate count is ${surprises.size}`, 'surprise')] : [];
  })],
  ['nothing-labels-allcaps-mono', scoped(isNothing, (ctx) => {
    for (const el of all(ctx.dom, 'nav a,th,button,.label,.unit,.kicker,.section-kicker')) {
      const text = textOf(el);
      if (!text) continue;
      const marker = `${el.getAttribute('style') || ''} ${el.getAttribute('class') || ''}`;
      if (!/space mono|mono/i.test(marker)) return [fail('Nothing structural label is not marked as Space Mono', selectorName(el))];
      if (!isAllCapsLabel(text) && !/uppercase/i.test(marker)) return [fail('Nothing structural label is not uppercase', selectorName(el))];
    }
    return [];
  })],
  ['nothing-status-color-scope', scoped((ctx) => isNothing(ctx) && /#d71921|--accent|status/i.test(ctx.html), (ctx) => {
    for (const el of all(ctx.dom, '.status,[class*="status"],.badge,.label')) {
      if (/#d71921|var\(--accent\)/i.test(el.getAttribute('style') || '') && !/value|datum|metric/i.test(el.getAttribute('class') || '')) return [fail('Nothing accent/status color applied outside value/datum scope', selectorName(el))];
    }
    return [];
  })],
  ['nothing-forbidden-ui-patterns', scoped((ctx) => isNothing(ctx) && /card|pill|badge|toast|modal|shadow|gradient/i.test(ctx.html), (ctx) => /box-shadow|gradient|border-radius\s*:\s*(?:999px|50%)|toast|modal/i.test(ctx.html) ? [fail('Nothing preset contains forbidden generic UI pattern', 'UI pattern')] : [])],
  ['nothing-button-shape', scoped((ctx) => isNothing(ctx) && ctx.dom && ctx.dom.querySelector('button,a[class*="btn"]'), (ctx) => /(?:button|btn)[^{]*\{[^}]*border-radius\s*:\s*(?:999px|50%|[1-9]\dpx)/i.test(ctx.styles) ? [fail('Nothing buttons must remain rectangular/square', 'button')] : [])],
  ['nothing-motif-min3', scoped((ctx) => isNothing(ctx) && /doto|motif|glyph/i.test(ctx.html), (ctx) => {
    const motifs = all(ctx.dom, '[style*="Doto"],.doto,.motif,[class*="glyph"]');
    return motifs.length < 3 ? [fail(`Nothing motif count below 3 (${motifs.length})`, 'motif')] : [];
  })],
  ['nothing-chart-not-color-alone', scoped((ctx) => isNothing(ctx) && /chart|svg/i.test(ctx.html), (ctx) => /stroke-dasharray|pattern|marker|data-label|aria-label/i.test(ctx.html) ? [] : [warn('Nothing chart appears to encode series by color alone', 'chart')])],
  ['nav-chrome-fixed-and-layered', scoped((ctx) => ['slides', 'magazine'].includes(ctx.profile) && /nav|dots|progress|chrome/i.test(ctx.html), (ctx) => /position\s*:\s*fixed/i.test(ctx.styles) && /z-index\s*:\s*(?:[1-9]\d{1,}|999)/i.test(ctx.styles) ? [] : [fail('deck nav chrome must be fixed and layered above slides', 'nav chrome')])],
  ['split-bleed-zero-padding', scoped((ctx) => ctx.profile === 'slides' && /split|bleed/i.test(ctx.html), (ctx) => /\.split[^{]*\{[^}]*(?:padding\s*:\s*0|gap\s*:\s*0)|\.bleed[^{]*\{[^}]*(?:padding\s*:\s*0|inset\s*:\s*0)/i.test(ctx.styles) ? [] : [fail('split/bleed slide lacks zero padding/gap treatment', 'split bleed')])],
  ['magazine-page-fullbleed', scoped((ctx) => ctx.profile === 'magazine', (ctx) => {
    for (const rule of cssRules(ctx.styles).filter((r) => /(?:^|,)\s*(?:\.page|\.spread|section)\b/i.test(r.selector))) {
      if (/margin\s*:\s*(?!0\b)[^;{}]+/i.test(rule.body)) return [fail('magazine page has viewport gutter margin', 'magazine page')];
    }
    return /(?:\.page|\.spread|section)[^{]*\{[^}]*(?:width\s*:\s*100(?:vw|%)|height\s*:\s*100(?:vh|dvh|%))/i.test(ctx.styles) ? [] : [fail('magazine pages are not full-bleed viewport canvases', 'magazine page')];
  })],
  ['magazine-consecutive-layout-repeat', scoped((ctx) => ctx.profile === 'magazine' && ctx.dom, (ctx) => consecutiveRepeat(all(ctx.dom, '[data-layout],.page,.spread'), (el) => el.getAttribute('data-layout') || classKey(el)) ? [fail('magazine repeats the same layout on consecutive pages', 'magazine layout')] : [])],
  ['magazine-tint-no-consecutive-repeat', scoped((ctx) => ctx.profile === 'magazine' && ctx.dom, (ctx) => consecutiveRepeat(all(ctx.dom, '[data-tint],.page,.spread'), (el) => el.getAttribute('data-tint') || (el.getAttribute('class') || '').match(/tint-[\w-]+/)?.[0] || '') ? [warn('magazine repeats the same tint on consecutive pages', 'magazine tint')] : [])],
  ['magazine-grid-frequency-cap', scoped((ctx) => ctx.profile === 'magazine', (ctx) => {
    const pages = Math.max(1, all(ctx.dom, '.page,.spread,section').length);
    const grids = (ctx.html.match(/grid|data-layout=["'][^"']*grid/gi) || []).length;
    return grids > Math.ceil(pages / 2) ? [warn('magazine grid layouts exceed frequency cap', 'magazine grid')] : [];
  })],
  ['slide-density-budget', scoped((ctx) => ctx.profile === 'slides', (ctx) => {
    for (const slide of all(ctx.dom, '.slide,section,[data-slide]')) {
      const words = wordCount(textOf(slide));
      if (all(slide, 'li').length > 8) return [warn(`slide exceeds bullet density budget (${all(slide, 'li').length} bullets)`, selectorName(slide))];
      if (words > 85) return [warn(`slide exceeds density budget (${words} words)`, selectorName(slide))];
    }
    return [];
  })],
  ['decorative-svg-sparing-use', scoped((ctx) => ctx.profile === 'slides' && ctx.dom && all(ctx.dom, 'svg').length > 0, (ctx) => all(ctx.dom, 'svg').filter((svg) => !svg.getAttribute('data-diagram-role') && !/diagram|chart/i.test(svg.getAttribute('class') || '')).length > 2 ? [warn('too many decorative SVGs in slide deck', 'svg')] : [])],
  ['vertical-consecutive-composition-run', scoped((ctx) => ctx.profile === 'slides' && ctx.dom, (ctx) => consecutiveRun(all(ctx.dom, '.slide,section,[data-slide]'), (el) => /vertical|stack|content/i.test(el.getAttribute('class') || el.getAttribute('data-layout') || ''), 3) ? [warn('three or more consecutive vertical/stack compositions', 'slides')] : [])],
  ['poster-fonts-loaded-in-root', scoped((ctx) => ctx.profile === 'poster' && /font-family|fontFamily|Doto|Geist|Space Grotesk/i.test(ctx.html), (ctx) => {
    if (/Geist Pixel/i.test(ctx.html) && !/@font-face[\s\S]*Geist Pixel[\s\S]*cdn\.jsdelivr\.net\/npm\/geist/i.test(ctx.html)) return [fail('poster references Geist Pixel without in-root @font-face jsDelivr source', 'font')];
    if (/(?:Doto|Space Grotesk|Space Mono|Manrope|Libre Baskerville)/i.test(ctx.html) && !/fonts\.googleapis\.com/i.test(ctx.html)) return [fail('poster references Google font without in-root Google Fonts link', 'font')];
    return [];
  })],
  ['gsap-timeline-registration-contract', scoped((ctx) => ctx.profile === 'video-comp' && /window\.__timelines/.test(ctx.html), (ctx) => {
    const rootId = ctx.dom.querySelector('[data-composition-id]')?.getAttribute('data-composition-id');
    const keys = Array.from(ctx.html.matchAll(/window\.__timelines\s*\[\s*["']([^"']+)["']\s*\]/g), (m) => m[1]);
    const dup = firstDuplicate(keys);
    if (dup) return [fail(`duplicate timeline registration key ${dup}`, 'window.__timelines')];
    if (rootId && keys.some((key) => key !== rootId)) return [fail('timeline registration key does not match data-composition-id', 'window.__timelines')];
    if (/(?:setTimeout|DOMContentLoaded|addEventListener\s*\(\s*["']load|\.then\s*\()[\s\S]{0,240}window\.__timelines/i.test(ctx.html)) return [fail('timeline registration is asynchronous, not top-level synchronous', 'window.__timelines')];
    return [];
  })],
  ['hyperframes-video-muted-playsinline', scoped((ctx) => ctx.profile === 'video-comp' && ctx.dom && ctx.dom.querySelector('video'), (ctx) => {
    for (const video of all(ctx.dom, 'video')) if (!video.hasAttribute('muted') || !video.hasAttribute('playsinline')) return [fail('video missing muted and playsinline attributes', 'video')];
    return [];
  })],
  ['root-composition-no-template-wrapper', scoped((ctx) => ctx.profile === 'video-comp' && ctx.dom && (ctx.dom.querySelector('[data-composition-id]') || /<template\b[\s\S]*data-composition-id/i.test(ctx.html)), (ctx) => {
    const root = ctx.dom.querySelector('[data-composition-id]');
    if (root?.tagName?.toLowerCase() === 'template' || ctx.dom.body?.firstElementChild?.tagName?.toLowerCase() === 'template') return [fail('standalone composition root must not be wrapped in <template>', 'composition root')];
    return [];
  })],
  ['audio-as-separate-elements', scoped((ctx) => ctx.profile === 'video-comp' && ctx.dom && ctx.dom.querySelector('video'), (ctx) => {
    const audioSrcs = all(ctx.dom, 'audio, audio source').map(srcAttr).filter(Boolean).map(baseName);
    for (const video of all(ctx.dom, 'video')) {
      const base = baseName(srcAttr(video));
      if (base && !/silent|noaudio|screen-recording/i.test(base) && !audioSrcs.includes(base)) return [warn('video with likely audio has no separate matching <audio> element', 'video')];
    }
    return [];
  })],
  ['video-duration-format-limits', scoped((ctx) => ctx.profile === 'video-comp' && ctx.dom && ctx.dom.querySelector('[data-duration]'), (ctx) => {
    const root = ctx.dom.querySelector('[data-duration]');
    const duration = Number(root.getAttribute('data-duration'));
    const width = Number(root.getAttribute('data-width') || 0);
    const height = Number(root.getAttribute('data-height') || 0);
    const reel = /reel/i.test(ctx.html) || height > width;
    if (reel && duration > 60) return [fail(`reel duration exceeds 60s (${duration}s)`, 'data-duration')];
    if (reel && (duration < 30 || duration > 45 || width !== 1080 || height !== 1920)) return [warn('reel duration/resolution outside ideal 30-45s 1080x1920 band', 'data-duration')];
    if (!reel && (duration < 60 || duration > 180 || (width && height && (width !== 1920 || height !== 1080)))) return [warn('long-form duration/resolution outside ideal band', 'data-duration')];
    return [];
  })],
  ['reel-beat-order', scoped((ctx) => ctx.profile === 'video-comp' && /\.(?:hook|problem|context|mechanism|proof|resolution|cta)\b/i.test(ctx.html), (ctx) => {
    const order = ['hook', 'problem', 'context', 'mechanism', 'proof', 'resolution', 'cta'];
    let last = -1;
    for (const beat of order) {
      const el = ctx.dom.querySelector(`.${beat}`);
      if (!el) continue;
      const start = Number(el.getAttribute('data-start') || last);
      if (start < last) return [warn('reel beat data-start order is not canonical', beat)];
      last = start;
    }
    return [];
  })],
  ['reel-cut-pacing', scoped((ctx) => ctx.profile === 'video-comp' && all(ctx.dom, '[data-start]').length > 2, (ctx) => {
    const starts = all(ctx.dom, '[data-start]').map((el) => Number(el.getAttribute('data-start'))).filter(Number.isFinite).sort((a, b) => a - b);
    const deltas = starts.slice(1).map((n, i) => n - starts[i]);
    const bad = deltas.find((d) => d < 1.2 || d > 1.8);
    return bad ? [warn(`reel cut delta outside pacing band: ${bad.toFixed(2)}s`, 'data-start')] : [];
  })],
  ['demo-format-webm-not-gif', scoped((ctx) => ctx.profile === 'page' && /data:image\/gif/i.test(ctx.html), () => [fail('inline demo uses GIF instead of video/webm', 'demo media')])],
  ['demo-video-attributes', scoped((ctx) => ctx.profile === 'page' && ctx.dom && /data:video\/webm;base64/i.test(ctx.html), (ctx) => {
    for (const video of all(ctx.dom, 'video')) {
      const hasWebm = /data:video\/webm;base64/i.test(video.outerHTML || '');
      if (hasWebm && ['autoplay', 'loop', 'muted', 'playsinline'].some((attr) => !video.hasAttribute(attr))) return [fail('inline demo video missing autoplay/loop/muted/playsinline', 'video')];
    }
    return [];
  })],
  ['review-quadrant-completeness', scoped((ctx) => ctx.profile === 'page' && ctx.dom && countReviewHeadings(ctx) >= 2, (ctx) => {
    for (const name of ['good', 'bad', 'ugly', 'questions']) {
      const heading = all(ctx.dom, 'h2,h3,h4').find((h) => new RegExp(`^${name}\\b`, 'i').test(textOf(h)));
      if (!heading) return [warn(`review quadrant missing ${name}`, 'review')];
      const nextText = textOf(heading.nextElementSibling) || '';
      if (!nextText && !/none found/i.test(textOf(heading.parentElement))) return [warn(`review quadrant ${name} appears empty`, 'review')];
    }
    return [];
  })],
  ['decision-log-confidence-styling', scoped((ctx) => ctx.profile === 'page' && ctx.dom && /decision/i.test(ctx.html) && /data-confidence|confidence|high|medium|low/i.test(ctx.html), (ctx) => {
    for (const card of all(ctx.dom, '[data-confidence],[class*="decision"]')) {
      const level = card.getAttribute('data-confidence') || (card.getAttribute('class') || '').match(/\b(high|medium|low)\b/i)?.[1] || '';
      const text = textOf(card).toLowerCase();
      if (/medium/i.test(level) && !text.includes('inferred')) return [warn('medium-confidence decision must say inferred', selectorName(card))];
      if (/low/i.test(level) && !text.includes('not recoverable')) return [warn('low-confidence decision must say not recoverable', selectorName(card))];
    }
    return [];
  })],
  ['table-data-label-required', scoped((ctx) => ctx.profile === 'page' && ctx.dom && hasStackedTablePattern(ctx), (ctx) => {
    for (const table of scopedTables(ctx)) {
      for (const td of all(table, 'tbody td')) if (!(td.getAttribute('data-label') || '').trim()) return [fail('stacked mobile table td missing data-label', 'td')];
    }
    return [];
  })],
]);

function scoped(appliesWhen, run) {
  return { appliesWhen, run };
}

function hasDiagramDom(ctx) {
  return ctx.dom && /<svg\b/i.test(ctx.html) && (/data-diagram-role/i.test(ctx.html) || ctx.flags.hasInlineSvgDiagram);
}

function diagramEls(ctx) {
  return all(ctx.dom, 'svg [data-diagram-role],svg rect,svg circle,svg path,svg polygon,svg text,g[data-diagram-role]');
}

function isMono(ctx) {
  return ctx.preset === 'mono-industrial' && !isGeneratedPresetArtifact(ctx);
}

function isNothing(ctx) {
  return ctx.preset === 'nothing' && !isGeneratedPresetArtifact(ctx);
}

function isGeneratedPresetArtifact(ctx) {
  return /\/dist\/visual-explainer-mdx\/preset-artifact-[^/]+\.html$/i.test(ctx.filePath);
}

function selectorName(el) {
  if (!el) return '';
  const id = el.id ? `#${el.id}` : '';
  const klass = el.className ? `.${String(el.className).trim().split(/\s+/).slice(0, 2).join('.')}` : '';
  return `${el.tagName?.toLowerCase?.() || 'element'}${id}${klass}`;
}

function consecutiveRepeat(elements, keyFn) {
  let prev = '';
  for (const el of elements) {
    const key = keyFn(el);
    if (key && key === prev) return true;
    if (key) prev = key;
  }
  return false;
}

function consecutiveRun(elements, pred, limit) {
  let run = 0;
  for (const el of elements) {
    run = pred(el) ? run + 1 : 0;
    if (run >= limit) return true;
  }
  return false;
}

function classKey(el) {
  return (el.getAttribute('class') || '').split(/\s+/).find((klass) => /layout-|grid|split|cover|stat|quote/.test(klass)) || '';
}

function firstDuplicate(values) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return '';
}

function srcAttr(el) {
  if (!el) return '';
  return el.getAttribute('src') || el.querySelector?.('source')?.getAttribute('src') || '';
}

function baseName(src = '') {
  return src.split('/').pop()?.replace(/\.[a-z0-9]+(?:\?.*)?$/i, '') || '';
}

function countReviewHeadings(ctx) {
  return all(ctx.dom, 'h2,h3,h4').filter((h) => /^(good|bad|ugly|questions)\b/i.test(textOf(h))).length;
}

function hasStackedTablePattern(ctx) {
  return /class\s*=\s*["'][^"']*\bve-table\b/i.test(ctx.html) || /@media\s*\([^)]*max-width\s*:\s*640px[\s\S]*td[^{]*\{[^}]*display\s*:\s*block[\s\S]*content\s*:\s*attr\(data-label\)/i.test(ctx.styles);
}

function scopedTables(ctx) {
  if (/class\s*=\s*["'][^"']*\bve-table\b/i.test(ctx.html)) return all(ctx.dom, 'table.ve-table');
  return all(ctx.dom, 'table').filter((table) => !table.closest('.scroll-x,[style*="overflow-x"]'));
}

function styleFor(ctx, el) {
  const inline = el.getAttribute?.('style') || '';
  const classes = Array.from(el.classList || []);
  const tag = el.tagName?.toLowerCase?.() || '';
  const matched = cssRules(ctx.styles)
    .filter((rule) => rule.selector.split(',').some((selector) => selectorMatchesSimple(selector.trim(), tag, classes, el.id)))
    .map((rule) => rule.body)
    .join(';');
  return `${matched};${inline}`;
}

function isSmallCircle(style, el) {
  const klass = el.getAttribute?.('class') || '';
  const width = Number(style.match(/\bwidth\s*:\s*(\d+(?:\.\d+)?)px/i)?.[1] || 0);
  const height = Number(style.match(/\bheight\s*:\s*(\d+(?:\.\d+)?)px/i)?.[1] || 0);
  const round = /border-radius\s*:\s*(?:50%|999px)/i.test(style) || /\b(?:dot|circle)\b/i.test(klass);
  const small = (!width && !height) || (width <= 16 && height <= 16 && Math.abs(width - height) <= 3);
  return round && small;
}

function hasTrafficLightTriple(styles) {
  const hues = styles.map((style) => colorHue(propertyValue(style, /background(?:-color)?/i) || style)).filter((hue) => hue != null);
  return hues.some((h) => h <= 12 || h >= 348) && hues.some((h) => h >= 34 && h <= 52) && hues.some((h) => h >= 105 && h <= 150);
}

function propertyValue(body, propRe) {
  const match = body.match(new RegExp(`(?:${propRe.source})\\s*:\\s*([^;{}]+)`, propRe.flags.replace('g', '')));
  return match?.[1] || '';
}

function colorHue(value = '') {
  if (/red/i.test(value)) return 0;
  if (/yellow/i.test(value)) return 45;
  if (/green/i.test(value)) return 130;
  const hsl = value.match(/hsla?\s*\(\s*([0-9.]+)/i);
  if (hsl) return Number(hsl[1]) % 360;
  const rgb = value.match(/rgba?\s*\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i);
  if (rgb) return rgbHue(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
  const hex = value.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i)?.[1];
  if (!hex) return null;
  const raw = hex.length === 3 ? hex.split('').map((ch) => ch + ch).join('') : hex;
  return rgbHue(Number.parseInt(raw.slice(0, 2), 16), Number.parseInt(raw.slice(2, 4), 16), Number.parseInt(raw.slice(4, 6), 16));
}

function rgbHue(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (!d) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function selectorMatchesSimple(selector, tag, classes, id) {
  const clean = selector.replace(/:[\w-]+(?:\([^)]*\))?/g, '').trim();
  if (!clean || /[>+~\s]/.test(clean)) return false;
  if (clean === tag || clean === '*') return true;
  if (id && clean === `#${id}`) return true;
  const classMatchesAll = Array.from(clean.matchAll(/\.([\w-]+)/g), (m) => m[1]);
  if (classMatchesAll.length && classMatchesAll.every((klass) => classes.includes(klass))) return true;
  return false;
}

function decorativeOrbStyle(style) {
  return /position\s*:\s*(?:absolute|fixed)/i.test(style) &&
    /border-radius\s*:\s*(?:50%|999px|[3-9]\dpx)/i.test(style) &&
    (/(?:filter|backdrop-filter)\s*:\s*blur\(\s*(?:[2-9]\d|[1-9]\d{2,})px/i.test(style) || /(?:radial|conic)-gradient\s*\(/i.test(style));
}

function isCardLike(ctx, el) {
  const style = styleFor(ctx, el);
  const klass = el.getAttribute('class') || '';
  const sized = /(?:width|min-width)\s*:\s*(?:1[2-9]\d|[2-9]\d{2,})px|(?:height|min-height)\s*:\s*(?:1[2-9]\d|[2-9]\d{2,})px/i.test(style) || /card|panel|tile|surface/i.test(klass);
  return sized && /border-radius\s*:\s*(?!0)\S+/i.test(style) && (/(?:box-shadow)\s*:\s*(?!none)/i.test(style) || /border\s*:\s*(?!0|none)/i.test(style) || /background(?:-color)?\s*:/i.test(style));
}

function sameTreatment(a, b) {
  const radiusA = (a.match(/border-radius\s*:\s*([^;]+)/i)?.[1] || '').trim();
  const radiusB = (b.match(/border-radius\s*:\s*([^;]+)/i)?.[1] || '').trim();
  const bgA = (a.match(/background(?:-color)?\s*:\s*([^;]+)/i)?.[1] || '').trim();
  const bgB = (b.match(/background(?:-color)?\s*:\s*([^;]+)/i)?.[1] || '').trim();
  return (radiusA && radiusA === radiusB) || (bgA && bgA === bgB);
}

function thickSideBorder(style) {
  const left = borderSide(style, 'left');
  const right = borderSide(style, 'right');
  const other = ['top', 'bottom'].some((side) => borderSide(style, side).width > 1);
  if (!other && left.width > 1 && right.width <= 1 && saturatedColor(left.color)) return 'left';
  if (!other && right.width > 1 && left.width <= 1 && saturatedColor(right.color)) return 'right';
  return '';
}

function borderSide(style, side) {
  const match = style.match(new RegExp(`border-${side}\\s*:\\s*(\\d+)px\\s+[^;#]*(#[0-9a-f]{3,6}|[a-z]+)?`, 'i'));
  if (match) return { width: Number(match[1]), color: match[2] || '' };
  const width = Number(style.match(new RegExp(`border-${side}-width\\s*:\\s*(\\d+)px`, 'i'))?.[1] || 0);
  const color = style.match(new RegExp(`border-${side}-color\\s*:\\s*([^;]+)`, 'i'))?.[1] || '';
  return { width, color };
}

function saturatedColor(value = '') {
  if (/red|green|blue|orange|purple|pink|cyan|rose|lime/i.test(value)) return true;
  const hex = value.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i)?.[0];
  if (!hex) return false;
  let raw = hex.slice(1);
  if (raw.length === 3) raw = raw.split('').map((ch) => ch + ch).join('');
  const rgb = [0, 2, 4].map((i) => Number.parseInt(raw.slice(i, i + 2), 16));
  return Math.max(...rgb) - Math.min(...rgb) > 40;
}

function authoredFontFamilies(ctx) {
  const fonts = [];
  for (const value of ctx.html.matchAll(/(?:font-family\s*:\s*|--font-[\w-]+\s*:\s*)([^;{}<]+)/gi)) {
    const font = firstFamily(value[1]);
    if (font && !/^var\(/i.test(font)) fonts.push(font);
  }
  for (const match of ctx.html.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^"']+)/gi)) {
    for (const family of decodeURIComponent(match[1]).split('&family=')) fonts.push(family.split(':')[0].replace(/\+/g, ' '));
  }
  return Array.from(new Set(fonts.map((font) => font.trim()).filter(Boolean)));
}

function firstFamily(stack) {
  return (stack.split(',')[0] || '').trim().replace(/^['"]|['"]$/g, '').replace(/\s*!important$/, '');
}

function markerKind(el) {
  const text = textOf(el);
  if (EMOJI_RE.test((text.match(/^\S+/) || [''])[0])) return 'emoji';
  if (el.querySelector('svg')) return 'inline-svg';
  if (/^[▸•→✓✕×+-]/.test(text)) return 'unicode-symbol';
  if (/icon-|fa-|material-icons/i.test(el.innerHTML || '')) return 'icon-font';
  return '';
}

function repeatedItemContainers(ctx) {
  const selector = [
    'ul',
    'ol',
    '.grid',
    '.list',
    '.catalog',
    '.cards',
    '.items',
    '.features',
    '.feature-grid',
    '.rows',
    '[class*="-grid"]',
    '[class*="-list"]',
    '[class*="-catalog"]',
  ].join(',');
  return all(ctx.dom, selector).filter((el) => !descriptorGuardedContext(el));
}

function descriptorGlossPair(ctx, item) {
  if (descriptorGuardedContext(item) || hasMetricLikeText(item)) return null;
  const directLabel = ownText(item);
  const textEls = all(item, 'h1,h2,h3,h4,h5,h6,p,span,small,strong,b,dt,dd,figcaption')
    .filter((el) => !el.closest('code,pre,table,form') && textOf(el));
  if (textEls.length < 2 && !directLabel) return null;
  const glossEl = textEls.find((el) => isDescriptorGloss(ctx, el));
  if (!glossEl) return null;
  const labelEl = textEls.find((el) => el !== glossEl && !glossEl.contains(el) && !isDescriptorGloss(ctx, el));
  if (labelEl) return { label: textOf(labelEl), gloss: textOf(glossEl) };
  return directLabel && !descriptorGuardedText(directLabel) ? { label: directLabel, gloss: textOf(glossEl) } : null;
}

function isDescriptorGloss(ctx, el) {
  const text = textOf(el);
  if (!text || wordCount(text) < 1 || wordCount(text) > 4) return false;
  if (/[.!?]$/.test(text) || /[A-Z]/.test(text)) return false;
  if (!/[a-z]/.test(text) || descriptorGuardedText(text)) return false;
  return isMutedDescriptorStyle(ctx, el);
}

function isMutedDescriptorStyle(ctx, el) {
  const klass = el.getAttribute('class') || '';
  const style = styleFor(ctx, el);
  return /(?:muted|dim|subtle|caption|subtitle|description|desc|meta|gloss|sublabel|hint)/i.test(klass) ||
    /(?:color\s*:\s*(?:var\(--(?:ve-)?(?:muted|text-dim|.*muted|.*dim)\)|rgba?\([^)]*,\s*0\.[1-8]\)|#[789a-f][0-9a-f]{2,5})|opacity\s*:\s*0\.[1-8])/i.test(style);
}

function descriptorGuardedContext(el) {
  return Boolean(el.closest?.('table,thead,tbody,tfoot,tr,td,th,form,label,fieldset,.table,.data-table,.stat,.stats,.metric,.metrics,.kpi,.kpis,[class*="stat"],[class*="metric"],[class*="kpi"]'));
}

function descriptorGuardedText(text) {
  return /(?:^\$|[$€£¥]|\b\d{1,4}(?:[-/]\d{1,2}){1,2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b|\b\d+(?:\.\d+)?\s*(?:px|rem|em|ms|s|sec|min|hr|kb|mb|gb|tb|%|x)\b)/i.test(text);
}

function hasMetricLikeText(el) {
  const text = textOf(el);
  return /\b[$€£¥]?\d[\d,.]*(?:%|x|ms|s|px|rem|em|kb|mb|gb|tb)?\b/.test(text);
}

function caseKind(value) {
  const letters = value.replace(/[^A-Za-z ]/g, '').trim();
  if (!letters) return '';
  if (isAllCapsLabel(letters)) return 'all-caps';
  const words = letters.split(/\s+/).filter(Boolean);
  const title = words.filter((word) => /^[A-Z][a-z]+/.test(word)).length / Math.max(words.length, 1) > 0.65;
  if (title) return 'title';
  if (/^[A-Z][a-z]/.test(letters) && words.slice(1).some((word) => /^[a-z]/.test(word))) return 'sentence';
  return '';
}

function escapeForRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

import {
  cssRules,
  customProps,
  dataUriDecodedBytes,
  fail,
  firstNamedFont,
  hasAny,
  regexForbid,
  stripCssComments,
  stripJsComments,
  warn,
  wordCount,
} from '../generic.mjs';
import { stripCodeLike } from '../context.mjs';

const BANNED_ACCENT_HEXES = new Set(['8b5cf6', '7c3aed', 'a78bfa', 'd946ef', '06b6d4', 'f472b6']);
const BANNED_ACCENT_RGB = new Set(['139,92,246', '124,58,237', '167,139,250', '217,70,239', '6,182,212', '244,114,182']);
const REAL_LINK_RE = /<a\b[^>]*href\s*=\s*["'](?!#|mailto:|tel:)[^"']+["']/i;
const MOBILE_MEDIA_RE = /@media\s*\([^)]*max-width\s*:\s*(\d+)px[^)]*\)/gi;
const SLOP_PHRASE_RE = /\b(?:it'?s important to note|let that sink in|in today'?s fast-paced|here'?s the thing|needless to say)\b/i;
const COPY_SLOP_RE = /\b(?:here'?s the thing:?|let that sink in|make no mistake|read that again|this cannot be overstated|in today'?s fast-paced|in today'?s rapidly evolving|needless to say|it goes without saying|it is important to note that|it'?s important to note|pro tip:|hot take:|unpopular opinion:|plot twist:|spoiler:|stands as a testament|a testament to|pivotal moment|indelible mark|rich tapestry|cornerstone of|sends a clear message|nestled in the heart of|boasts a world-class|a hidden gem|a beacon of|at the forefront of|i hope this helps|certainly!|great question|happy to help|let me know if you need anything else|i'?d be happy to|as an ai language model|i assure you|here'?s what'?s interesting|here'?s what caught my eye|here'?s what stood out|let me think step by step|here'?s my thought process|to answer your question|as of my knowledge cutoff|as of my last update|based on my training data|the future looks bright|exciting times lie ahead|only time will tell|one thing is certain|poised for growth|warrants further investigation|holds great promise|spanning everything from|double-edged sword|at the intersection of|the elephant in the room|it begs the question|buckle up|food for thought|let'?s dive in|let'?s unpack)\b|not only .{0,80}but also|it'?s not just about .+?,\s*it'?s about|\bit'?s not just .+?,?\s*it'?s\s|\bthe (?:answer|secret|key|trick|truth|reality|problem|solution|takeaway|lesson|difference|reason) (?:is|was|isn'?t|remains)\s*:/i;
const GENERIC_PLACEHOLDER_RE = /{{\s*(?:[A-Za-z0-9_]+|NN)\s*}}|\b(?:TODO|FIXME|Lorem ipsum)\b|\b(?:Module|Component) [A-Z]\b/i;
const REFLEX_FONT_RE = /^(?:fraunces|newsreader|lora|crimson(?: pro| text)?|playfair display|cormorant(?: garamond)?|syne|space grotesk|dm sans|dm serif|outfit|plus jakarta sans|instrument sans|instrument serif)$/i;

export const checks = Object.fromEntries([
  ['forbidden-body-font', scoped(hasBodyFont, (ctx) => {
    const props = customProps(ctx.styles);
    const stacks = [
      ...Array.from(ctx.styles.matchAll(/--font-body\s*:\s*([^;{}]+)/gi), (m) => m[1]),
      ...cssRules(ctx.styles).filter((r) => /(^|,)\s*(?:body|html)\b/i.test(r.selector)).flatMap((r) => Array.from(r.body.matchAll(/font-family\s*:\s*([^;{}]+)/gi), (m) => m[1])),
    ];
    for (const stack of stacks) {
      const resolved = derefFontVars(stack, props);
      const primary = firstFontSlot(resolved);
      if (/^(inter|roboto|arial|helvetica)$/i.test(primary)) return [fail(`primary body font is ${primary}`, '--font-body/body font-family')];
      if (/^(?:system-ui|sans-serif|serif|ui-sans-serif)$/i.test(primary) && !firstNamedFont(resolved)) return [fail('body font stack has only generic families', '--font-body/body font-family')];
    }
    return [];
  })],
  ['forbidden-accent-colors', scoped((ctx) => hasStyleContext(ctx), (ctx) => forbiddenAccentFindings(`${ctx.styles}\n${ctx.inlineStyles.join('\n')}`))],
  ['forbidden-gradient-text-headings', scoped((ctx) => /background-clip\s*:\s*text/i.test(`${ctx.styles}\n${ctx.inlineStyles.join('\n')}`), (ctx) => {
    for (const rule of cssRules(ctx.styles)) {
      if (!/(^|[,.#\s])(?:h[1-4]|title|headline|hero-title|display|kicker)\b/i.test(rule.selector)) continue;
      if (/gradient\s*\(/i.test(rule.body) && /background-clip\s*:\s*text/i.test(rule.body) && /(?:color\s*:\s*transparent|-webkit-text-fill-color\s*:\s*transparent)/i.test(rule.body)) {
        return [fail('gradient-clipped heading text', rule.selector)];
      }
    }
    for (const style of ctx.inlineStyles) {
      if (/gradient\s*\(/i.test(style) && /background-clip\s*:\s*text/i.test(style) && /(?:color\s*:\s*transparent|-webkit-text-fill-color\s*:\s*transparent)/i.test(style)) {
        return [fail('gradient-clipped inline text', 'style=""')];
      }
    }
    return [];
  })],
  ['forbidden-glow-pulse-animations', scoped((ctx) => /@keyframes|\banimation(?:-[a-z-]+)?\s*:/i.test(ctx.styles), (ctx) => {
    if (/@keyframes\s+(?:glow|pulse|breathe|shimmer)[\w-]*\s*\{[\s\S]*?(?:box-shadow|opacity|filter)/i.test(ctx.styles)) return [fail('glow/pulse keyframes animate shadow, opacity, or filter', '@keyframes')];
    for (const rule of cssRules(ctx.styles)) {
      if (/(?:progress|loading|spinner|\[role=['"]?progressbar)/i.test(rule.selector)) continue;
      if (/animation(?:-iteration-count)?\s*:[^;{}]*infinite/i.test(rule.body)) return [fail('infinite animation on static content', rule.selector)];
    }
    return [];
  })],
  ['no-placeholder-leak', scoped(always, (ctx) => regexForbid(stripCodeLike(ctx.html), GENERIC_PLACEHOLDER_RE, 'unresolved placeholder/TODO text leaked', 'html text'))],
  ['self-contained-html-file', scoped((ctx) => /\s(?:src|href)\s*=/.test(ctx.html), (ctx) => {
    for (const match of ctx.html.matchAll(/\s(?:src|href)\s*=\s*(["'])([^"']+)\1/gi)) {
      const value = match[2].trim();
      if (/^(?:https?:|data:|blob:|#|mailto:|tel:|javascript:)/i.test(value)) continue;
      return [fail(`non-portable asset reference: ${value}`, 'src/href')];
    }
    return [];
  })],
  ['theme-both-light-dark', scoped((ctx) => colorProps(ctx).length > 0, (ctx) => {
    const props = colorProps(ctx);
    if (/\[data-ve-preset=/.test(ctx.styles)) return [];
    const hasDark = /prefers-color-scheme\s*:\s*dark|:root\s*\[\s*data-theme\s*=\s*["']dark["']\s*\]|\[data-ve-tone=dark\]|\[data-ve-preset=/i.test(ctx.styles);
    if (!hasDark) return [fail('color tokens exist without a dark override block', ':root')];
    const darkChunk = darkBlock(ctx.styles);
    const missing = props.filter((p) => /(?:bg|surface|text|border)/i.test(p)).filter((p) => !new RegExp(`${escapeForRe(p)}\\s*:`, 'i').test(darkChunk));
    return missing.length ? [fail(`dark override omits core tokens: ${missing.slice(0, 5).join(', ')}`, '@media dark/:root[data-theme]')] : [];
  })],
  ['no-default-link-color', scoped((ctx) => REAL_LINK_RE.test(ctx.html), (ctx) => /(?:^|[{},]\s*)(?:a|a:link|\.prose\s+a)\b[^{]*\{[^}]*\bcolor\s*:/i.test(ctx.styles) ? [] : [warn('real links exist without an explicit link color rule', 'a[href]')])],
  ['css-class-node-collision', scoped((ctx) => ctx.flags.hasMermaid, (ctx) => {
    if (cssRules(ctx.styles).some((r) => /(^|[\s,{])\.node(?![-\w])/.test(r.selector) && !/\.mermaid\s+\.node/.test(r.selector))) return [fail('page-level .node CSS collides with Mermaid', '.node')];
    if (/class\s*=\s*["'][^"']*(?:^|\s)node(?:\s|$)/i.test(ctx.html)) return [fail('element class token "node" collides with Mermaid', 'class="node"')];
    return [];
  })],
  ['code-block-whitespace-preserved', scoped((ctx) => /<pre\b|class\s*=\s*["'][^"']*(?:code-block|code-file__body|dir-tree)/i.test(ctx.html), (ctx) => {
    const rules = cssRules(ctx.styles).filter((r) => /\b(?:pre|code-block|code-file__body|dir-tree)\b/i.test(r.selector));
    if (!rules.length) return [fail('block code containers lack white-space preservation CSS', 'pre/.code-block')];
    if (rules.some((r) => /white-space\s*:\s*normal/i.test(r.body))) return [fail('block code white-space is normal', 'white-space')];
    if (/class\s*=\s*["'][^"']*dir-tree|[├└│─]/.test(ctx.html) && !rules.some((r) => /dir-tree/i.test(r.selector) && /white-space\s*:\s*pre\b/i.test(r.body))) return [fail('directory tree requires white-space: pre', '.dir-tree')];
    return rules.some((r) => /white-space\s*:\s*(?:pre|pre-wrap|pre-line)\b/i.test(r.body)) ? [] : [fail('block code containers do not declare white-space: pre/pre-wrap/pre-line', 'white-space')];
  })],
  ['unslop-prose-phrases', scoped((ctx) => /<p\b|class\s*=\s*["'][^"']*(?:lead|callout|description|body)/i.test(ctx.html), (ctx) => {
    const text = proseText(ctx);
    if (SLOP_PHRASE_RE.test(text)) return [warn(`slop phrase: ${text.match(SLOP_PHRASE_RE)[0]}`, 'prose')];
    const words = Math.max(1, wordCount(text));
    for (const word of ['however', 'moreover']) {
      const count = (text.match(new RegExp(`\\b${word}\\b`, 'gi')) || []).length;
      if (count > Math.ceil(words / 300)) return [warn(`high-frequency "${word}" in prose`, 'prose')];
    }
    return [];
  })],
  ['copy-slop-phrases', scoped((ctx) => /<p\b|<h[1-6]\b|class\s*=\s*["'][^"']*(?:lead|callout|description|caption|slide|card)/i.test(ctx.html), (ctx) => {
    const text = proseText(ctx);
    const match = text.match(COPY_SLOP_RE);
    return match ? [warn(`AI-slop copy phrase: ${match[0]}`, 'prose text')] : [];
  })],
  ['reduced-motion-media-query', scoped((ctx) => hasMotion(ctx.styles), (ctx) => /prefers-reduced-motion\s*:\s*reduce/i.test(ctx.styles) ? [] : [warn('animated CSS lacks prefers-reduced-motion reduce guard', '@media')])],
  ['gradient-hero-background', scoped((ctx) => /gradient\s*\(/i.test(`${ctx.styles}\n${ctx.inlineStyles.join('\n')}`), (ctx) => {
    for (const rule of cssRules(ctx.styles)) {
      if (!isLargeBackgroundSelector(rule.selector)) continue;
      const value = propertyValue(rule.body, /background(?:-image)?/i);
      if (gradientHasAiSweep(value)) return [fail('large hero/layout background uses violet-to-blue gradient wash', rule.selector)];
    }
    for (const style of ctx.inlineStyles) {
      if (/gradient\s*\(/i.test(style) && /(?:min-)?height\s*:\s*(?:[4-9]\dvh|100vh)|width\s*:\s*100(?:vw|%)/i.test(style) && gradientHasAiSweep(style)) {
        return [fail('large inline background uses violet-to-blue gradient wash', 'style=""')];
      }
    }
    return [];
  })],
  ['glassmorphism-default-surface', scoped((ctx) => /backdrop-filter\s*:\s*blur|-webkit-backdrop-filter\s*:\s*blur/i.test(ctx.styles), (ctx) => {
    const selectors = cssRules(ctx.styles).filter((rule) => /backdrop-filter\s*:\s*blur|-webkit-backdrop-filter\s*:\s*blur/i.test(rule.body) && /background(?:-color)?\s*:\s*(?:rgba\([^)]*,\s*(?:0?\.\d+|[01]\s*\))|hsla\([^)]*,\s*(?:0?\.\d+|[01]\s*\))|#[0-9a-f]{8}\b|color-mix\()/i.test(rule.body)).map((rule) => rule.selector);
    return selectors.length >= 3 ? [warn(`frosted glass repeated on ${selectors.length} selectors`, selectors.slice(0, 3).join(', '))] : [];
  })],
  ['reflex-reject-fonts', scoped((ctx) => ctx.preset === 'custom' && /--font-(?:body|display)\s*:|font-family\s*:/i.test(ctx.styles), (ctx) => {
    const stacks = [
      ...Array.from(ctx.styles.matchAll(/--font-(?:body|display)\s*:\s*([^;{}]+)/gi), (m) => m[1]),
      ...cssRules(ctx.styles).filter((r) => /(^|,)\s*(?:body|html|h[1-6]|\.[\w-]*(?:title|heading|headline|display))/i.test(r.selector)).flatMap((r) => Array.from(r.body.matchAll(/font-family\s*:\s*([^;{}]+)/gi), (m) => m[1])),
    ];
    const bad = stacks.map(firstFontSlot).find((font) => REFLEX_FONT_RE.test(font));
    return bad ? [warn(`reflex catalog font used as primary voice: ${bad}`, 'font-family')] : [];
  })],
  ['unbounded-fluid-type-clamp', scoped((ctx) => ctx.preset === 'custom' && /font-size\s*:\s*clamp\s*\(/i.test(ctx.styles) && ctx.profile !== 'poster' && ctx.profile !== 'video-comp', (ctx) => {
    for (const rule of cssRules(ctx.styles)) {
      if (!/font-size\s*:\s*clamp\s*\(/i.test(rule.body)) continue;
      if (/divider|section-number|chapter/i.test(rule.selector)) continue;
      const parsed = parseClampFont(rule.body);
      if (!parsed) continue;
      if (parsed.ratio > 2.5 || (/h1|hero|display|headline|title/i.test(rule.selector) && parsed.maxPx > 96)) return [warn(`unbounded font-size clamp min/max ratio ${parsed.ratio.toFixed(2)}`, rule.selector)];
    }
    return [];
  })],
  ['blocking-webfont-no-swap', scoped((ctx) => ctx.profile !== 'poster' && /@font-face|fonts\.googleapis\.com/i.test(ctx.html), (ctx) => {
    if (/@font-face\s*\{(?:(?!}).)*font-family(?:(?!}).)*}/is.test(ctx.styles)) {
      for (const block of ctx.styles.matchAll(/@font-face\s*\{([\s\S]*?)\}/gi)) {
        if (!/font-display\s*:\s*(?:swap|optional)/i.test(block[1])) return [warn('@font-face missing font-display: swap/optional', '@font-face')];
      }
    }
    for (const url of ctx.html.matchAll(/fonts\.googleapis\.com\/css2?[^"')\s<]+/gi)) {
      if (!/[?&]display=(?:swap|optional)\b/i.test(url[0])) return [warn('Google Fonts URL missing display=swap', 'Google Fonts link/import')];
    }
    return [];
  })],
  ['unscalable-viewport', scoped((ctx) => /<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(ctx.html), (ctx) => /<meta\b[^>]*name\s*=\s*["']viewport["'][^>]*content\s*=\s*["'][^"']*(?:user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\.0)?)/i.test(ctx.html) ? [fail('viewport disables user zoom', 'meta[name=viewport]')] : [])],
  ['focus-ring-stripped', scoped((ctx) => /<a\b[^>]*href=|<button\b|<input\b|tabindex|<summary\b/i.test(ctx.html) && /outline\s*:\s*(?:none|0)\b/i.test(ctx.styles), (ctx) => {
    const strips = cssRules(ctx.styles).filter((rule) => /outline\s*:\s*(?:none|0)\b/i.test(rule.body) && /(?:\*|:focus|a\b|button|input|summary|tabindex)/i.test(rule.selector));
    if (!strips.length) return [];
    const replacement = strips.every((strip) => cssRules(ctx.styles).some((rule) => focusReplacementCovers(strip.selector, rule)));
    return replacement ? [] : [fail('focus outline stripped without visible :focus-visible replacement', strips[0].selector)];
  })],
  ['scroll-reveal-spam', scoped((ctx) => /IntersectionObserver|animation-timeline\s*:\s*view|reveal|fade-in-up|in-view/i.test(ctx.html), (ctx) => {
    const sections = (ctx.html.match(/<(?:section|header|footer|main)\b/gi) || []).length;
    const reveal = (ctx.html.match(/class\s*=\s*["'][^"']*(?:reveal|fade-in-up|in-view)[^"']*["']/gi) || []).length;
    if (sections >= 3 && reveal / sections >= 0.6 && /opacity\s*:\s*0[\s\S]{0,120}transform\s*:\s*translateY/i.test(ctx.styles)) return [warn('uniform scroll reveal applied to most top-level sections', 'reveal classes')];
    return [];
  })],
  ['layout-property-animation', scoped((ctx) => /@keyframes|transition/i.test(ctx.styles), (ctx) => {
    if (/@keyframes[\s\S]*?(?:\b(?:width|height|left|right|top|bottom|margin|padding)\s*:)/i.test(ctx.styles)) return [warn('keyframes animate layout geometry instead of transform/opacity', '@keyframes')];
    for (const rule of cssRules(ctx.styles)) {
      if (/transition(?:-property)?\s*:[^;{}]*(?:\bwidth\b|\bheight\b|\bleft\b|\bright\b|\btop\b|\bbottom\b|\bmargin\b|\bpadding\b)/i.test(rule.body) && !/max-height/i.test(rule.body)) return [warn('transition animates layout geometry', rule.selector)];
    }
    return [];
  })],
  ['bounce-elastic-easing', scoped((ctx) => /cubic-bezier|bounce|elastic|spring/i.test(ctx.html), (ctx) => {
    const motionContext = [
      ...Array.from(ctx.styles.matchAll(/(?:animation(?:-timing-function)?|transition(?:-timing-function)?)\s*:\s*([^;{}]+)/gi), (m) => m[1]),
      ...Array.from(ctx.scripts.matchAll(/\b(?:ease|easing)\s*[:=]\s*["']?([A-Za-z0-9_.-]+)/gi), (m) => m[1]),
      ...Array.from(ctx.scripts.matchAll(/\.(?:to|from|fromTo)\s*\([^)]*\{[\s\S]*?\bease\s*:\s*["']([^"']+)/gi), (m) => m[1]),
    ].join('\n');
    for (const match of `${ctx.styles}\n${ctx.scripts}`.matchAll(/cubic-bezier\s*\(([^)]+)\)/gi)) {
      const nums = match[1].split(',').map((part) => Number(part.trim()));
      if (nums.length === 4 && nums.some((n) => n < 0 || n > 1)) return [fail(`overshooting cubic-bezier(${match[1]})`, 'easing')];
    }
    return /\b(?:bounce|elastic|spring)\b/i.test(motionContext) ? [fail('bounce/elastic/spring easing used for standard motion', 'easing')] : [];
  })],
  ['copy-paste-drop-shadow', scoped((ctx) => (ctx.styles.match(/box-shadow\s*:/gi) || []).length >= 5, (ctx) => {
    const byShadow = new Map();
    for (const rule of cssRules(ctx.styles)) {
      const shadow = propertyValue(rule.body, /box-shadow/i).toLowerCase().replace(/\s+/g, ' ').trim();
      if (!shadow || shadow === 'none') continue;
      const selectors = byShadow.get(shadow) || [];
      selectors.push(rule.selector);
      byShadow.set(shadow, selectors);
    }
    for (const [shadow, selectors] of byShadow) {
      if (selectors.length >= 5 && selectorRoleCount(selectors) >= 4) return [warn(`same box-shadow reused across ${selectors.length} unrelated selectors: ${shadow}`, selectors.slice(0, 5).join(', '))];
    }
    return [];
  })],
  ['arbitrary-spacing-scale', scoped((ctx) => /(?:margin|padding|gap|inset)\s*:\s*\d+px/i.test(`${ctx.styles}\n${ctx.inlineStyles.join('\n')}`), (ctx) => {
    const values = Array.from(`${ctx.styles}\n${ctx.inlineStyles.join('\n')}`.matchAll(/\b(?:margin|padding|gap|inset|top|right|bottom|left)\s*:\s*(-?\d+)px/gi), (m) => Math.abs(Number(m[1]))).filter((n) => n > 0);
    const distinct = Array.from(new Set(values));
    if (distinct.length < 8) return [];
    const off = distinct.filter((n) => n % 4 !== 0);
    return off.length / distinct.length > 0.3 ? [warn(`off-scale px spacing literals: ${off.slice(0, 8).join(', ')}`, 'spacing')] : [];
  })],
  ['page-overflow-clip-contract', scoped((ctx) => ctx.profile === 'page' && !ctx.flags.isFixedCanvas && hasPageSurfaceContract(ctx), (ctx) => {
    const styles = stripCssComments(ctx.styles);
    if (/(?:html|body|:root)[^{]*\{[^}]*overflow-x\s*:\s*scroll/i.test(styles)) return [fail('html/body/:root sets overflow-x: scroll', 'overflow-x')];
    const body = combinedHtmlBodyRules(styles);
    if (!/overflow-x\s*:\s*hidden/i.test(body) || !/overflow-x\s*:\s*clip/i.test(body) || body.search(/overflow-x\s*:\s*clip/i) < body.search(/overflow-x\s*:\s*hidden/i)) return [fail('html/body must declare overflow-x hidden then clip', 'html/body')];
    if (!/max-width\s*:\s*100%/i.test(body)) return [fail('html/body missing max-width:100%', 'html/body')];
    if (!/(?:html|body|\*)[^{]*\{[^}]*margin\s*:\s*0/i.test(styles) || !/(?:html|body|\*)[^{]*\{[^}]*padding\s*:\s*0/i.test(styles)) return [fail('html/body missing margin:0 and padding:0 reset', 'html/body')];
    return [];
  })],
  ['box-sizing-border-box-global', scoped((ctx) => ctx.profile === 'page' && !ctx.flags.isFixedCanvas && hasPageSurfaceContract(ctx), (ctx) => {
    const styles = ctx.styles;
    if (/\*[^{]*\{[^}]*box-sizing\s*:\s*border-box/i.test(styles)) return [];
    if (/html[^{]*\{[^}]*box-sizing\s*:\s*border-box/i.test(styles) && /\*[^{]*\{[^}]*box-sizing\s*:\s*inherit/i.test(styles)) return [];
    return [fail('missing universal border-box reset', '*')];
  })],
  ['body-overflow-wrap', pageScoped((ctx) => /body[^{]*\{[^}]*(?:overflow-wrap\s*:\s*(?:anywhere|break-word)|word-break\s*:\s*break-word)/i.test(ctx.styles) || /(?:overflow-wrap\s*:\s*(?:anywhere|break-word)|word-break\s*:\s*break-(?:word|all))/i.test(ctx.styles) ? [] : [warn('body lacks overflow-wrap/word-break long-token safety', 'body')])],
  ['minmax0-not-bare-1fr', scoped((ctx) => /grid-template-columns\s*:[^;]*(?:\d+px\s+1fr|1fr\s+\d+px)/i.test(ctx.styles), (ctx) => {
    for (const match of ctx.styles.matchAll(/grid-template-columns\s*:\s*([^;{}]+)/gi)) {
      const value = match[1];
      const scrubbed = value.replace(/minmax\s*\([^)]*\)/gi, 'minmax()').replace(/repeat\s*\([^)]*\)/gi, 'repeat()');
      if (/\b\d+px\s+1fr\b|\b1fr\s+\d+px\b/i.test(scrubbed)) return [fail(`bare 1fr next to fixed px track: ${value}`, 'grid-template-columns')];
    }
    return [];
  })],
  ['mobile-breakpoint-standard', scoped((ctx) => /@media\s*\([^)]*max-width\s*:\s*\d+px/i.test(ctx.styles), (ctx) => {
    const allowed = new Set([768, 820, 640, 1000, 600]);
    for (const match of ctx.styles.matchAll(MOBILE_MEDIA_RE)) {
      const width = Number(match[1]);
      if (!allowed.has(width)) return [warn(`non-standard max-width breakpoint ${width}px`, '@media')];
    }
    return [];
  })],
  ['pipeline-mobile-nowrap', scoped((ctx) => /\bclass\s*=\s*["'][^"']*\bpipeline\b/i.test(ctx.html), (ctx) => {
    if (/@media[\s\S]*?max-width[\s\S]*?\.pipeline[^{]*\{[^}]*flex-wrap\s*:\s*wrap/i.test(ctx.styles)) return [warn('.pipeline mobile rule wraps instead of staying nowrap', '.pipeline')];
    return /@media[\s\S]*?max-width[\s\S]*?\.pipeline[^{]*\{[^}]*flex-wrap\s*:\s*nowrap/i.test(ctx.styles) ? [] : [warn('.pipeline lacks mobile flex-wrap: nowrap rule', '.pipeline')];
  })],
  ['kpi-row-autofit-minmax', scoped((ctx) => /\bclass\s*=\s*["'][^"']*\bkpi-row\b/i.test(ctx.html), (ctx) => {
    if (/\.kpi-row[^{]*\{[^}]*grid-template-columns\s*:\s*repeat\s*\(\s*\d+\s*,\s*1fr\s*\)/i.test(ctx.styles)) return [warn('.kpi-row uses fixed repeat columns instead of auto-fit minmax', '.kpi-row')];
    return /@media[\s\S]*?max-width[\s\S]*?\.kpi-row[^{]*\{[^}]*grid-template-columns\s*:\s*repeat\s*\(\s*auto-fit\s*,\s*minmax/i.test(ctx.styles) ? [] : [warn('.kpi-row lacks mobile auto-fit minmax columns', '.kpi-row')];
  })],
  ['pretext-fonts-ready-before-measure', scoped((ctx) => /prepareWithSegments\s*\(/.test(ctx.html), (ctx) => {
    const index = ctx.html.search(/prepareWithSegments\s*\(/);
    const before = ctx.html.slice(0, index);
    return /document\.fonts\.(?:ready|load)\b/.test(before) ? [] : [warn('prepareWithSegments called before fonts readiness', 'prepareWithSegments')];
  })],
  ['diagram-no-hardcoded-hex', scoped(hasAuthoredSvg, (ctx) => {
    const svgBodies = Array.from(ctx.html.matchAll(/<svg\b[\s\S]*?<\/svg>/gi), (m) => m[0]);
    const allowed = /#(?:f6d242|3a66ff|ff7a2a|7ee787)\b/i;
    for (const svg of svgBodies) {
      for (const match of svg.matchAll(/\b(?:fill|stroke|style)\s*=\s*(["'])([^"']*(?:#[0-9a-f]{3,8}|rgba?\()[^"']*)\1/gi)) {
        if (/url\(#/i.test(match[2]) || allowed.test(match[2])) continue;
        return [fail(`hard-coded diagram color ${match[2].slice(0, 80)}`, '<svg>')];
      }
    }
    return [];
  })],
  ['diagram-forbidden-fx', scoped(hasAuthoredSvg, (ctx) => {
    const svg = Array.from(ctx.html.matchAll(/<svg\b[\s\S]*?<\/svg>/gi), (m) => m[0]).join('\n');
    if (/(?:filter\s*=|<filter\b|drop-shadow|box-shadow|blur\(|rounded-2xl|rx\s*=\s*["']16|ry\s*=\s*["']16)/i.test(svg)) return [fail('diagram uses forbidden effects/filter/oversized radius', '<svg>')];
    return [];
  })],
  ['diagram-jetbrains-mono-forbidden', scoped(hasAuthoredSvg, (ctx) => /jetbrains mono/i.test(ctx.html) && !/dracula|nord|catppuccin|solarized|gruvbox|one dark|rose pine/i.test(ctx.html) ? [fail('JetBrains Mono used outside IDE-inspired aesthetic', 'font-family')] : [])],
  ['diagram-4px-grid', scoped(hasAuthoredSvg, (ctx) => {
    const attrs = Array.from(ctx.html.matchAll(/\b(?:x|y|cx|cy|x1|x2|y1|y2|width|height|font-size|gap)\s*=\s*["'](-?\d+(?:\.\d+)?)["']/gi));
    const bad = attrs.find((m) => Math.abs(Number(m[1])) > 2 && Math.abs(Number(m[1]) % 4) > 0.001);
    return bad ? [fail(`diagram coordinate/size not on 4px grid: ${bad[0]}`, '<svg>')] : [];
  })],
  ['mono-type-budget', scoped(isMono, (ctx) => {
    const fonts = appliedFonts(ctx).filter((f) => !/space (?:grotesk|mono)|geist pixel/i.test(f));
    if (new Set(appliedFonts(ctx)).size > 3 || fonts.length) return [fail(`too many/non-mono-industrial font families: ${Array.from(new Set(appliedFonts(ctx))).join(', ')}`, 'font-family')];
    const sizes = new Set(Array.from(ctx.styles.matchAll(/font-size\s*:\s*([^;{}]+)/gi), (m) => m[1].trim()));
    if (sizes.size > 4) return [fail(`too many distinct font sizes (${sizes.size})`, 'font-size')];
    if (/\b(?:font-weight\s*:\s*(?:700|bold)|<strong\b|<b\b)/i.test(ctx.html) && /space grotesk/i.test(ctx.html)) return [fail('bold Space Grotesk/sans text detected', 'font-weight')];
    return [];
  })],
  ['mono-grayscale-status-color', scoped(isMono, (ctx) => {
    const literals = Array.from(ctx.styles.matchAll(/#([0-9a-f]{6})\b/gi), (m) => `#${m[1].toLowerCase()}`);
    const statusTokens = Array.from(customProps(ctx.styles).entries())
      .filter(([key]) => /^--(?:ok|warn|err)$/i.test(key))
      .map(([, value]) => value.match(/#[0-9a-f]{6}\b/i)?.[0]?.toLowerCase())
      .filter(Boolean);
    const allowed = new Set(['#000000', '#ffffff', '#f6f4f0', '#16130f', '#0a0a0a', ...statusTokens]);
    const bad = literals.find((hex) => !allowed.has(hex) && !isNearGray(hex));
    return bad ? [fail(`hue-bearing literal in Mono-Industrial CSS: ${bad}`, 'color token')] : [];
  })],
  ['mono-theme-override-mechanism', scoped((ctx) => isMono(ctx) && ctx.profile === 'page', (ctx) => {
    const text = ctx.html;
    if (!/(?:^|[\s,{}])(?::root|html|body)?\s*\[\s*data-theme\s*=\s*["']light["']\s*\]\s*\{/i.test(text)) return [fail('missing explicit light data-theme override block', 'data-theme')];
    if (!/(?:^|[\s,{}])(?::root|html|body)?\s*\[\s*data-theme\s*=\s*["']dark["']\s*\]\s*\{/i.test(text)) return [fail('missing explicit dark data-theme override block', 'data-theme')];
    if (!/mono-industrial-theme/i.test(text) || !/localStorage\.(?:setItem|getItem)/.test(text) || !/localStorage\.removeItem/.test(text)) return [fail('theme toggle does not persist mono-industrial-theme with system fallback', 'localStorage')];
    if (/prefers-color-scheme/i.test(text) && !/:root:not\(\[data-theme=['"](?:light|dark)['"]\]\)/i.test(text)) return [fail('prefers-color-scheme override is not gated with :root:not([data-theme])', '@media')];
    return [];
  })],
  ['mono-toggle-styling', scoped((ctx) => isMono(ctx) && ctx.flags.hasThemeToggle, (ctx) => {
    if (!/color-mix\s*\(\s*in srgb\s*,\s*var\(--fg\)\s*10%/i.test(ctx.styles)) return [warn('mono toggle active background does not use 10% fg color-mix', 'theme toggle')];
    if (!/@media\s*\([^)]*hover\s*:\s*hover/i.test(ctx.styles) || !/@media\s*\([^)]*pointer\s*:\s*fine/i.test(ctx.styles)) return [warn('mono toggle lacks hover/fine-pointer collapse styling', 'theme toggle')];
    return [];
  })],
  ['mono-mermaid-toggle-sync', scoped((ctx) => isMono(ctx) && ctx.flags.hasMermaid, (ctx) => {
    const js = ctx.scripts;
    if (!/data-processed/.test(js) || !/mermaid\.run\s*\(/.test(js) || !/matchMedia\s*\([^)]*prefers-color-scheme/.test(js)) return [fail('Mermaid is not re-themed/reset when theme changes', 'mermaid')];
    return [];
  })],
  ['mono-token-values-exact', scoped(isMono, (ctx) => {
    const required = ['--bg', '--fg', '--text-display', '--text-primary', '--text-secondary', '--text-disabled', '--rule', '--rule-strong', '--ok', '--warn', '--err'];
    const props = customProps(ctx.styles);
    const missing = required.filter((p) => !props.has(p));
    return missing.length ? [fail(`missing Mono-Industrial core tokens: ${missing.join(', ')}`, ':root')] : [];
  })],
  ['mono-motion-discipline', scoped(isMono, (ctx) => {
    if (/glow|pulse|animated-shadow|IntersectionObserver|DOMContentLoaded[\s\S]{0,120}opacity\s*[:=]\s*0/i.test(ctx.html)) return [fail('Mono-Industrial uses forbidden scroll/load/glow motion', 'motion')];
    const longDuration = Array.from(ctx.styles.matchAll(/(?:transition|animation)(?:-duration)?\s*:\s*([^;{}]+)/gi), (m) => m[1]).find((v) => durationMs(v) > 120);
    if (longDuration) return [fail(`motion duration exceeds 120ms: ${longDuration}`, 'duration')];
    if (hasMotion(ctx.styles) && !/prefers-reduced-motion\s*:\s*reduce/i.test(ctx.styles)) return [fail('Mono-Industrial motion lacks reduced-motion collapse', '@media')];
    return [];
  })],
  ['mono-mermaid-theming', scoped((ctx) => isMono(ctx) && ctx.flags.hasMermaid, (ctx) => /themeVariables/i.test(ctx.html) && !/(?:8b5cf6|7c3aed|d946ef|06b6d4|f472b6|2563eb|3b82f6|1d4ed8)/i.test(ctx.html) ? [] : [warn('Mermaid theming missing grayscale themeVariables or uses arbitrary hue', 'mermaid.initialize')])],
  ['mono-surface-spacing-discipline', scoped(isMono, (ctx) => {
    for (const match of ctx.styles.matchAll(/\b(?:margin|padding|gap)\s*:\s*(\d+)px/gi)) {
      const n = Number(match[1]);
      if (![1, 4, 8, 16, 24, 32, 44, 64, 96].includes(n)) return [warn(`spacing literal off Mono-Industrial scale: ${n}px`, 'spacing')];
    }
    return [];
  })],
  ['assembly-dedup-single-tokens', scoped((ctx) => /@font-face|<script\b|:root\s*\{/i.test(ctx.html), (ctx) => {
    const fonts = Array.from(ctx.styles.matchAll(/@font-face\s*\{[^}]*font-family\s*:\s*['"]?([^;'"}]+)/gi), (m) => m[1].trim().toLowerCase());
    const dupFont = firstDuplicate(fonts);
    if (dupFont) return [fail(`duplicate @font-face for ${dupFont}`, '@font-face')];
    const scripts = Array.from(ctx.html.matchAll(/<script\b[^>]*src\s*=\s*["']([^"']*(?:mermaid|chart|anime)[^"']*)/gi), (m) => m[1]);
    const dupScript = firstDuplicate(scripts);
    if (dupScript) return [fail(`duplicate library script ${dupScript}`, '<script src>')];
    if ((ctx.styles.match(/:root\s*\{[^}]*--(?:bg|fg|text-|rule|space-|size-|ok|warn|err)/gi) || []).length > 3) return [fail('core design tokens redeclared in too many :root blocks', ':root')];
    return [];
  })],
  ['nothing-font-allowlist', scoped(isNothing, (ctx) => {
    if (/geist pixel/i.test(ctx.html)) return [fail('Geist Pixel leaked into Nothing preset', 'font-family')];
    const bad = appliedFonts(ctx).find((f) => !/^(?:doto|space grotesk|space mono)$/i.test(f));
    return bad ? [fail(`font not in Nothing allowlist: ${bad}`, 'font-family')] : [];
  })],
  ['nothing-accent-red-single-use', scoped(isNothing, (ctx) => {
    const uses = countPaintedNothingRedHints(ctx);
    return uses > 3 ? [fail(`Nothing accent red appears too many times (${uses})`, 'accent')] : [];
  })],
  ['nothing-flat-surface-and-motion', scoped(isNothing, (ctx) => {
    const badSurface = cssRules(ctx.styles).some((rule) => {
      if (!isNothingSurfaceSelector(rule.selector)) return false;
      const body = stripMaskDeclarations(rule.body);
      if (/box-shadow\s*:\s*(?!none)|linear-gradient\s*\(|backdrop-filter|filter\s*:/i.test(body)) return true;
      return /radial-gradient\s*\(/i.test(body) && !/dot|motif|halftone|doto/i.test(`${rule.selector} ${body}`);
    });
    if (badSurface) return [fail('Nothing preset requires flat surfaces without gradients/shadows/filters', 'surface')];
    if (hasMotion(ctx.styles) && !/prefers-reduced-motion\s*:\s*reduce/i.test(ctx.styles)) return [fail('Nothing motion lacks reduced-motion guard', 'motion')];
    return [];
  })],
  ['autofit-safety-net-present-and-ordered', scoped((ctx) => ctx.profile === 'slides', (ctx) => /fitty|autoFit|autofit|resizeText|--min-font-size/i.test(`${ctx.styles}\n${ctx.scripts}`) ? [] : [fail('slide deck lacks autofit text safety net', 'autofit')])],
  ['slide-reduced-motion-support', scoped((ctx) => ['slides', 'magazine'].includes(ctx.profile) && hasMotion(ctx.styles), (ctx) => /prefers-reduced-motion\s*:\s*reduce/i.test(ctx.styles) ? [] : [warn('deck animation lacks reduced-motion support', '@media')])],
  ['divider-number-oversized-clamp', scoped((ctx) => ctx.profile === 'slides' && /divider|chapter|section-number|slide__number/i.test(ctx.html), (ctx) => {
    const dividerRules = cssRules(ctx.styles).filter((rule) => /divider|chapter|section-number|slide__number/i.test(rule.selector));
    return dividerRules.some((rule) => /font-size\s*:\s*clamp\s*\(/i.test(rule.body)) ? [] : [warn('divider numbers should use clamp sizing', 'divider')];
  })],
  ['poster-root-single-sized-element', scoped((ctx) => ctx.profile === 'poster', (ctx) => hasSingleSizedPosterRoot(ctx) ? [] : [fail('poster root is not a single fixed-size element', 'poster root')])],
  ['poster-no-live-mermaid', scoped((ctx) => ctx.profile === 'poster', (ctx) => /mermaid\.initialize|class(?:Name)?\s*=\s*["'][^"']*\bmermaid\b/i.test(ctx.html) ? [fail('poster contains live Mermaid runtime', 'mermaid')] : [])],
  ['poster-no-runtime-fs', scoped((ctx) => ctx.profile === 'poster', (ctx) => regexForbid(ctx.html, /require\(['"](node:)?fs['"]\)|from ['"](node:)?fs['"]|readFileSync|writeFileSync|fs\.promises/, 'poster uses runtime fs API', 'fs'))],
  ['poster-single-theme', scoped((ctx) => ctx.profile === 'poster' && /matchMedia|useState|theme/i.test(ctx.html), (ctx) => /(useState[\s\S]{0,120}(?:theme|light|dark)|onClick[\s\S]{0,80}(?:theme|set)|matchMedia\(['"]\(prefers-color-scheme)/i.test(ctx.html) ? [warn('poster contains live theme-switching behavior', 'theme')] : [])],
  ['poster-filename-convention', scoped((ctx) => ctx.profile === 'poster', (ctx) => {
    const explicitExport = ctx.html.match(/data-export\s*=\s*["']([^"']+)["']/i)?.[1] || '';
    if (!explicitExport && /\.html$/i.test(ctx.filePath)) return [];
    const exported = explicitExport || ctx.filePath;
    return /\.poster\.(?:html|png|svg|pdf|jpe?g|webp)$/i.test(exported) ? [] : [warn('poster filename should include .poster.<ext>', 'filename')];
  })],
  ['poster-export-wait-sufficient', scoped((ctx) => ctx.profile === 'poster' && /Prism|recharts|anime|gsap|chart\.js/i.test(ctx.html), (ctx) => /--wait-for\s+(?:[2-9]\d{3}|[1-9]\d{4,})/i.test(ctx.html) ? [] : [warn('slow poster dependency without export wait above 1500ms', 'export')])],
  ['gsap-timeline-paused', scoped((ctx) => /gsap\.timeline\s*\(/.test(ctx.html), (ctx) => {
    for (const match of ctx.html.matchAll(/gsap\.timeline\s*\(\s*(\{[^}]*\})?/g)) {
      if (!match[1] || !/paused\s*:\s*true/.test(match[1])) return [fail('gsap.timeline must be created with paused: true', 'gsap.timeline')];
    }
    return [];
  })],
  ['video-forbidden-nondeterministic-apis', scoped((ctx) => ctx.profile === 'video-comp', (ctx) => {
    const src = stripJsComments(`${ctx.scripts}\n${ctx.styles}`);
    const patterns = [/Math\.random\s*\(/, /Date\.now\s*\(/, /new Date\s*\(/, /gsap\.ticker\.add\s*\(/, /requestAnimationFrame\s*\(/, /repeat\s*:\s*-1/, /animation-iteration-count\s*:\s*infinite/, /\.(?:play|seek)\s*\(/, /\.currentTime\s*=/];
    const hit = patterns.find((re) => re.test(src));
    return hit ? [fail(`nondeterministic video API matched ${hit}`, 'script/style')] : [];
  })],
  ['video-seed-literal', scoped((ctx) => ctx.profile === 'video-comp' && /\b\w*seed\w*\s*\(/i.test(ctx.html), (ctx) => {
    for (const match of ctx.html.matchAll(/\b\w*seed\w*\s*\(([^)]*)\)/gi)) {
      if (!/^\s*\d+(?:\.\d+)?\s*$/.test(match[1])) return [fail(`seed argument is not a numeric literal: ${match[1]}`, 'seed')];
    }
    return [];
  })],
  ['reel-transitions-at-boundaries', scoped((ctx) => ctx.profile === 'video-comp' && /addLabel|cross-?fade|shader/i.test(ctx.html), (ctx) => {
    const source = stripHtmlComments(ctx.html);
    const labels = Array.from(source.matchAll(/addLabel\s*\(\s*['"]([^'"]+)/gi), (m) => m[1].toLowerCase());
    const canonical = labels.filter((label) => /^(hook|problem|context|mechanism|proof|resolution|cta)$/.test(label));
    return canonical.length >= 2 ? [] : [fail('reel transition timing lacks beat-boundary labels', 'transition')];
  })],
  ['reel-caption-line-length', scoped((ctx) => ctx.profile === 'video-comp' && /class\s*=\s*["'][^"']*\bcap\b/i.test(ctx.html), (ctx) => {
    const portrait = /data-width=["']?1080|data-height=["']?1920|reel/i.test(ctx.html);
    const threshold = portrait ? 9 : 16;
    for (const text of classText(ctx.html, 'cap')) if (wordCount(text) > threshold) return [warn(`caption exceeds ${threshold} words`, '.cap')];
    return [];
  })],
  ['reel-no-paragraph-body-copy', scoped((ctx) => ctx.profile === 'video-comp' && /body-copy|paragraph|copy/i.test(ctx.html), (ctx) => {
    const texts = classText(ctx.html, '(?:body-copy|copy|paragraph)');
    return texts.find((text) => wordCount(text) > 25) ? [warn('reel body-copy block exceeds about 25 words', 'body copy')] : [];
  })],
  ['reel-kinetic-preauthored-spans', scoped((ctx) => ctx.profile === 'video-comp' && /\.w\b/.test(ctx.html), (ctx) => {
    const source = stripHtmlComments(ctx.html);
    const runtimeBuild = /(?:textContent|innerText)\.split\s*\([^)]*\)[\s\S]{0,220}(?:innerHTML|appendChild)|(?:innerHTML|appendChild)[\s\S]{0,220}(?:textContent|innerText)\.split\s*\(/i.test(source);
    return /<span\b[^>]*class\s*=\s*["'][^"']*\bw\b/i.test(source) && !runtimeBuild ? [] : [fail('word spans targeted by .w tween are built at runtime or missing', '.w')];
  })],
  ['reel-progressive-reveal-order', scoped((ctx) => ctx.profile === 'video-comp' && /\b(?:node|arrow|label)-\d+\b/.test(ctx.html), (ctx) => {
    const source = stripHtmlComments(ctx.html);
    const order = ['node', 'arrow', 'label'].map((prefix) => source.search(new RegExp(`${prefix}-\\d+`)));
    if (order[0] >= 0 && order[1] >= 0 && order[1] < order[0]) return [warn('diagram reveal classes are not ordered node -> arrow -> label', 'GSAP reveal')];
    return order[0] >= 0 && order[1] >= 0 && order[2] >= 0 && !(order[0] < order[1] && order[1] < order[2]) ? [warn('diagram reveal classes are not ordered node -> arrow -> label', 'GSAP reveal')] : [];
  })],
  ['reel-kenburns-scale', scoped((ctx) => ctx.profile === 'video-comp' && /photo|kenburns|ken-burns/i.test(ctx.html), (ctx) => {
    const scales = Array.from(ctx.html.matchAll(/scale\s*:\s*([0-9.]+)/gi), (m) => Number(m[1]));
    return scales.some((n) => n > 1.15 || n < 1) ? [warn('Ken Burns scale outside 1.0 to 1.15 band', 'scale')] : [];
  })],
  ['demo-embed-size-budget', scoped((ctx) => /data:video\/webm;base64,/i.test(ctx.html), (ctx) => {
    for (const match of ctx.html.matchAll(/data:video\/webm;base64,[A-Za-z0-9+/=\s]+/gi)) {
      if (dataUriDecodedBytes(match[0]) > 2 * 1024 * 1024) return [fail('inline demo webm exceeds 2MB decoded budget', 'data:video/webm')];
    }
    return [];
  })],
  ['factcheck-summary-shape', scoped((ctx) => /verification summary/i.test(ctx.html), (ctx) => {
    const text = ctx.text;
    const total = numberAfter(text, /total[^0-9]{0,20}/i);
    const confirmed = numberAfter(text, /confirmed[^0-9]{0,20}/i);
    const corrected = numberAfter(text, /correct(?:ed|ions?)[^0-9]{0,20}/i);
    const unverifiable = numberAfter(text, /unverifiable[^0-9]{0,20}/i);
    if ([total, confirmed, corrected, unverifiable].some((n) => n == null)) return [warn('verification summary missing total/confirmed/corrected/unverifiable counts', 'verification summary')];
    if (confirmed + corrected + unverifiable !== total) return [warn('verification summary counts do not reconcile', 'verification summary')];
    if (/\b(?:Wrong|Partial|False|Unsupported)\b/.test(text)) return [warn('fact-check status label outside Confirmed/Corrected/Unverifiable', 'verification summary')];
    return [];
  })],
]);

function scoped(appliesWhen, run) {
  return { appliesWhen, run };
}

function pageScoped(run) {
  return scoped((ctx) => ctx.profile === 'page' && !ctx.flags.isFixedCanvas, run);
}

function hasPageSurfaceContract(ctx) {
  return /--(?:bg|background|surface|text|fg|border|accent|color)\s*:|\.wrap\b|\.prose\b|\.hero\b|\.card\b|\.grid\b/i.test(ctx.styles);
}

function always() {
  return true;
}

function hasStyleContext(ctx) {
  return Boolean(ctx.styles || ctx.inlineStyles.length);
}

function hasBodyFont(ctx) {
  return /--font-body\s*:|(?:^|[{}])\s*(?:body|html)[^{]*\{[^}]*font-family\s*:/i.test(ctx.styles);
}

function firstFontSlot(stack) {
  return (stack.split(',')[0] || '').trim().replace(/^['"]|['"]$/g, '').replace(/\s*!important$/, '').trim();
}

function derefFontVars(stack, props) {
  return stack.replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]+)?\)/gi, (match, name) => props.get(name.toLowerCase()) || match);
}

function forbiddenAccentFindings(cssText) {
  for (const match of cssText.matchAll(/#?([0-9a-f]{6})\b/gi)) {
    if (BANNED_ACCENT_HEXES.has(match[1].toLowerCase())) return [fail('forbidden violet/neon accent color used', 'style context')];
  }
  for (const match of cssText.matchAll(/rgba?\s*\(([^)]+)\)/gi)) {
    const nums = match[1].split(',').slice(0, 3).map((part) => Number.parseFloat(part.trim()));
    if (nums.length === 3 && nums.every(Number.isFinite) && BANNED_ACCENT_RGB.has(nums.map((n) => Math.round(n)).join(','))) {
      return [fail('forbidden violet/neon accent color used', 'style context')];
    }
  }
  for (const match of cssText.matchAll(/hsla?\s*\(([^)]+)\)/gi)) {
    const parts = match[1].split(/[,\s/]+/).filter(Boolean);
    const hue = Number.parseFloat(parts[0]);
    const sat = Number.parseFloat(parts.find((part, index) => index > 0 && /%$/.test(part)) || '0');
    if (Number.isFinite(hue) && sat >= 45 && bannedHue(((hue % 360) + 360) % 360)) {
      return [fail('forbidden violet/neon accent color used', 'style context')];
    }
  }
  return [];
}

function bannedHue(hue) {
  return (hue >= 185 && hue <= 200) || (hue >= 255 && hue <= 300) || (hue >= 310 && hue <= 335);
}

function focusReplacementCovers(strippedSelector, replacementRule) {
  if (!/:focus(?:-visible)?/i.test(replacementRule.selector)) return false;
  if (/outline\s*:\s*(?:none|0)\b/i.test(replacementRule.body)) return false;
  if (!/(?:outline\s*:|box-shadow\s*:|border(?:-color)?\s*:|background(?:-color)?\s*:)/i.test(replacementRule.body)) return false;
  const strippedFamilies = selectorFamilies(strippedSelector);
  const replacementFamilies = selectorFamilies(replacementRule.selector);
  return strippedFamilies.every((family) => replacementFamilies.includes(family) || replacementFamilies.includes('*'));
}

function selectorFamilies(selector) {
  if (/\*/.test(selector)) return ['*'];
  const families = [];
  if (/\ba\b/i.test(selector)) families.push('a');
  if (/\bbutton\b/i.test(selector)) families.push('button');
  if (/\binput\b/i.test(selector)) families.push('input');
  if (/\bsummary\b/i.test(selector)) families.push('summary');
  if (/tabindex/i.test(selector)) families.push('tabindex');
  return families.length ? families : ['*'];
}

function colorProps(ctx) {
  return Array.from(customProps(ctx.styles).keys()).filter((key) => {
    if (/^--(?:tw|font|text-(?:xs|sm|lg|xl|\d|.*line-height)|spacing|container|default|ve-font|ve-display|ve-heading|ve-page|ve-section|ve-radius|ve-poster-radius)/i.test(key)) return false;
    return /(?:bg|background|surface|text|fg|border|rule|accent|color|ok|warn|err|panel|muted|faint|heading)/i.test(key);
  });
}

function darkBlock(styles) {
  const blocks = Array.from(styles.matchAll(/(?:@media[^{]+prefers-color-scheme\s*:\s*dark[\s\S]*?\{([\s\S]*?)\n?\}|(?::root|html|body)?\s*\[\s*data-theme\s*=\s*["']dark["']\s*\]\s*\{([^}]*)\})/gi), (m) => m[0]);
  return blocks.join('\n');
}

function escapeForRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function combinedHtmlBodyRules(styles) {
  return cssRules(styles).filter((rule) => /(^|,)\s*(?:html|body)\b/i.test(rule.selector)).map((rule) => rule.body).join(';');
}

function proseText(ctx) {
  return stripCodeLike(ctx.html)
    .replace(/<blockquote\b[\s\S]*?<\/blockquote>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[[A-Z0-9 .:-]+\]/g, ' ');
}

function stripHtmlComments(value) {
  return value.replace(/<!--[\s\S]*?-->/g, '');
}

function hasMotion(styles) {
  return /@keyframes|\b(?:animation|transition)(?:-duration)?\s*:\s*(?!none|0(?:ms|s)?\b)/i.test(styles);
}

function hasAuthoredSvg(ctx) {
  return /<svg\b/i.test(ctx.html) && (/data-diagram-role|var\(--/i.test(ctx.html) || ctx.flags.hasInlineSvgDiagram);
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

function appliedFonts(ctx) {
  const found = [];
  for (const match of ctx.html.matchAll(/(?:font-family\s*:\s*|family=|family['"]?\s*[:=]\s*['"])([^;"'}<]+)/gi)) {
    const font = normalizeFontFamilyName(firstNamedFont(match[1].replace(/\+/g, ' ')));
    if (font && !/^var\(/i.test(font)) found.push(font);
  }
  for (const match of ctx.html.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^"']+)/gi)) {
    for (const family of decodeURIComponent(match[1]).split('&family=')) {
      found.push(normalizeFontFamilyName(family.split(':')[0].replace(/\+/g, ' ')));
    }
  }
  return Array.from(new Set(found.map((font) => font.trim()).filter(Boolean)));
}

function countPaintedNothingRedHints(ctx) {
  let uses = 0;
  for (const rule of cssRules(ctx.styles)) {
    const body = rule.body.replace(/--[\w-]+\s*:\s*(?:#d71921|var\(--accent\))[^;{}]*;?/gi, '');
    if (/(?:color|background(?:-color)?|border(?:-[\w-]+)?(?:-color)?)\s*:\s*(?:#d71921\b|var\(--accent\))/i.test(body)) uses += Math.max(1, rule.selector.split(',').length);
  }
  for (const style of ctx.inlineStyles) {
    if (/(?:color|background(?:-color)?|border(?:-[\w-]+)?(?:-color)?)\s*:\s*(?:#d71921\b|var\(--accent\))/i.test(style)) uses += 1;
  }
  return uses;
}

function hasSingleSizedPosterRoot(ctx) {
  const body = ctx.dom?.body;
  const root = body?.firstElementChild;
  if (!root || root.nextElementSibling) return false;
  const attrs = `${root.getAttribute('style') || ''} ${root.getAttribute('class') || ''} ${root.outerHTML.slice(0, 300)}`;
  if (/data-poster-root/i.test(root.outerHTML) || /--poster-(?:w|h)\s*:/i.test(ctx.styles)) return true;
  if (/width\s*:\s*\d+px/i.test(attrs) && /height\s*:\s*\d+px/i.test(attrs)) return true;
  const classes = Array.from(root.classList || []);
  const css = cssRules(ctx.styles).filter((rule) => rule.selector.split(',').some((selector) => selectorMatchesRoot(selector.trim(), root, classes))).map((rule) => rule.body).join(';');
  if (/width\s*:\s*\d+px/i.test(css) && /height\s*:\s*\d+px/i.test(css)) return true;
  return /\bw-\[\d+px\]/.test(attrs) && /\bh-\[\d+px\]/.test(attrs);
}

function selectorMatchesRoot(selector, root, classes) {
  const tag = root.tagName?.toLowerCase?.() || '';
  const clean = selector.replace(/:[\w-]+(?:\([^)]*\))?/g, '').trim();
  if (!clean || /[>+~\s]/.test(clean)) return false;
  if (clean === tag) return true;
  const classMatchesAll = Array.from(clean.matchAll(/\.([\w-]+)/g), (m) => m[1]);
  return classMatchesAll.length > 0 && classMatchesAll.every((klass) => classes.includes(klass));
}

function stripMaskDeclarations(body) {
  return body.replace(/-?webkit-mask[^;{}]*:[^;{}]*gradient\([^;{}]*;?/gi, '').replace(/\bmask[^;{}]*:[^;{}]*gradient\([^;{}]*;?/gi, '');
}

function isNothingSurfaceSelector(selector) {
  return /(?:^|[,.#\s])(?:body|main|section|article|header|footer|nav|button|card|panel|tile|surface|modal|toast|badge|pill|hero|page|slide)\b/i.test(selector);
}

function normalizeFontFamilyName(font) {
  return font.replace(/:(?:wght|ital|opsz|wdth)@[^,\s;]+/gi, '').trim();
}

function isNearGray(hex) {
  const raw = hex.replace('#', '');
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  return Math.max(r, g, b) - Math.min(r, g, b) <= 8;
}

function durationMs(value) {
  let max = 0;
  for (const match of value.matchAll(/([0-9.]+)\s*(ms|s)\b/gi)) {
    const n = Number(match[1]) * (match[2].toLowerCase() === 's' ? 1000 : 1);
    max = Math.max(max, n);
  }
  return max;
}

function firstDuplicate(values) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return '';
}

function classText(html, classPattern) {
  const re = new RegExp(`<[^>]+class\\s*=\\s*["'][^"']*\\b${classPattern}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'gi');
  return Array.from(html.matchAll(re), (m) => m[1].replace(/<[^>]+>/g, ' '));
}

function numberAfter(text, prefixRe) {
  const index = text.search(prefixRe);
  if (index < 0) return null;
  const rest = text.slice(index).match(/\d+/);
  return rest ? Number(rest[0]) : null;
}

function isLargeBackgroundSelector(selector) {
  return /(^|,)\s*(?:body|html|main|section|\.[\w-]*(?:hero|masthead|cover|stage|page|slide)|\[class[*^$|~]?=["'][^"']*hero)/i.test(selector);
}

function propertyValue(body, propRe) {
  const re = new RegExp(`(?:${propRe.source})\\s*:\\s*([^;{}]+)`, propRe.flags.replace('g', ''));
  return body.match(re)?.[1] || '';
}

function gradientHasAiSweep(value = '') {
  if (!/gradient\s*\(/i.test(value)) return false;
  const hues = Array.from(value.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi), (m) => hexHue(m[0])).filter((h) => h != null);
  return hues.some((h) => h >= 255 && h <= 300) && hues.some((h) => h >= 195 && h <= 250);
}

function hexHue(hex) {
  let raw = hex.replace('#', '');
  if (raw.length === 3) raw = raw.split('').map((ch) => ch + ch).join('');
  const r = Number.parseInt(raw.slice(0, 2), 16) / 255;
  const g = Number.parseInt(raw.slice(2, 4), 16) / 255;
  const b = Number.parseInt(raw.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function parseClampFont(body) {
  const match = body.match(/font-size\s*:\s*clamp\s*\(\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/i);
  if (!match) return null;
  const minPx = lengthToPx(match[1]);
  const maxPx = lengthToPx(match[3]);
  if (!minPx || !maxPx) return null;
  return { minPx, maxPx, ratio: maxPx / minPx };
}

function lengthToPx(value) {
  const match = String(value).trim().match(/^([0-9.]+)(px|rem|em)$/i);
  if (!match) return 0;
  const n = Number(match[1]);
  return match[2].toLowerCase() === 'px' ? n : n * 16;
}

function selectorRoleCount(selectors) {
  const roles = new Set();
  for (const selector of selectors) {
    if (/button|btn/.test(selector)) roles.add('button');
    else if (/nav/.test(selector)) roles.add('nav');
    else if (/img|image|figure/.test(selector)) roles.add('media');
    else if (/code|pre/.test(selector)) roles.add('code');
    else if (/card/.test(selector)) roles.add('card');
    else roles.add(selector.replace(/[.#][\w-]+/g, '').trim() || selector);
  }
  return roles.size;
}

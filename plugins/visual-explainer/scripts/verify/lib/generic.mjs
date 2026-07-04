export function makeResult(status, evidence, where = '', fix_hint = '') {
  return { status, evidence, where, fix_hint };
}

export function fail(evidence, where = '', fix_hint = '') {
  return makeResult('fail', evidence, where, fix_hint);
}

export function warn(evidence, where = '', fix_hint = '') {
  return makeResult('warn', evidence, where, fix_hint);
}

export function pass(evidence = 'ok') {
  return makeResult('pass', evidence, '', '');
}

export function regexForbid(value, pattern, evidence, where = '') {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
  const match = value.match(re);
  return match ? [fail(evidence || `Forbidden pattern matched: ${match[0]}`, where)] : [];
}

export function regexRequire(value, pattern, evidence, where = '') {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
  return re.test(value) ? [] : [fail(evidence || `Required pattern missing: ${re}`, where)];
}

export function domForbid(dom, selector, evidence) {
  if (!dom) return [];
  const node = dom.querySelector(selector);
  return node ? [fail(evidence || `Forbidden selector matched: ${selector}`, selector)] : [];
}

export function domRequire(dom, selector, evidence) {
  if (!dom) return [];
  return dom.querySelector(selector) ? [] : [fail(evidence || `Required selector missing: ${selector}`, selector)];
}

export function cssRules(styles) {
  const withoutComments = stripCssComments(styles);
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(withoutComments))) {
    const selector = match[1].trim();
    if (!selector || selector.startsWith('@')) continue;
    rules.push({ selector, body: match[2].trim(), start: match.index });
  }
  return rules;
}

export function stripCssComments(value) {
  return value.replace(/\/\*[\s\S]*?\*\//g, '');
}

export function stripJsComments(value) {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function ownText(el) {
  let text = '';
  for (const child of Array.from(el.childNodes || [])) {
    if (child.nodeType === 3) text += child.textContent || '';
  }
  return text.trim();
}

export function all(dom, selector) {
  return dom ? Array.from(dom.querySelectorAll(selector)) : [];
}

export function classMatches(el, re) {
  return Array.from(el.classList || []).some((klass) => re.test(klass));
}

export function textOf(el) {
  return (el?.textContent || '').replace(/\s+/g, ' ').trim();
}

export function hasClassToken(html, token) {
  return new RegExp(`class\\s*=\\s*["'][^"']*(?:^|\\s)${escapeRegExp(token)}(?:\\s|$)`, 'i').test(html);
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function firstNamedFont(stack) {
  if (!stack) return '';
  const generic = /^(?:system-ui|sans-serif|serif|monospace|ui-sans-serif|ui-serif|ui-monospace|inherit|initial|var\(.+\))$/i;
  for (const part of stack.split(',')) {
    const name = part.trim().replace(/^['"]|['"]$/g, '').replace(/\s*!important$/, '').trim();
    if (name && !generic.test(name)) return name;
  }
  return stack.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '') || '';
}

export function customProps(styles) {
  const props = new Map();
  for (const match of styles.matchAll(/(--[a-z0-9_-]+)\s*:\s*([^;{}]+)/gi)) {
    props.set(match[1].toLowerCase(), match[2].trim());
  }
  return props;
}

export function hasAny(value, patterns) {
  return patterns.some((pattern) => pattern.test(value));
}

export function wordCount(value) {
  return (value.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)?/g) || []).length;
}

export function isAllCapsLabel(value) {
  const letters = value.replace(/[^A-Za-z]/g, '');
  return letters.length > 1 && letters === letters.toUpperCase();
}

export function dataUriDecodedBytes(dataUri) {
  const payload = dataUri.split(',')[1] || '';
  return Math.floor(payload.replace(/\s/g, '').length * 0.75);
}

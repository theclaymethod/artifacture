import { svgPathProperties } from 'svg-path-properties';
import { DOMParser } from 'linkedom';

const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Resolve the four built-in presets into SVG presentation attributes. Native SVG
// has no CSS custom-property cascade; private brands require the HTML route.
export function nativeSvgTheme(css, preset, appearance) {
  if (!['iso', '3b1b', 'mono-color', 'algebrica'].includes(preset)) throw new Error('FFrames currently accepts the four built-in presets. Use the HTML route for private brands.');
  const declarations = {};
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim();
    const base = selector.split(',').some(item => [':root', '[data-ve-preset]'].includes(item.trim()));
    const selected = selector.includes(`[data-ve-preset="${preset}"]`) && (!selector.includes('data-ve-appearance') || appearance === 'dark');
    if (base || selected) for (const declaration of match[2].matchAll(/(--ve-[\w-]+)\s*:\s*([^;]+);/g)) declarations[declaration[1]] = declaration[2].trim();
  }
  const rgba = value => value === 'transparent' ? [0, 0, 0, 0] : [1, 3, 5].map(at => parseInt(value.slice(at, at + 2), 16)).concat(1);
  const resolve = (value, seen = new Set()) => {
    const expanded = value.replace(/var\((--ve-[\w-]+)(?:,\s*([^()]+))?\)/g, (_, key, fallback) => {
      if (seen.has(key) || !declarations[key] && fallback === undefined) throw new Error(`Cannot resolve native SVG token ${key}.`);
      return resolve(declarations[key] ?? fallback, new Set([...seen, key]));
    });
    const result = expanded.replace(/color-mix\(in srgb,\s*(#[\da-f]{6}|transparent)\s+([\d.]+)%,\s*(#[\da-f]{6}|transparent)\s*\)/gi, (_, a, percent, b) => {
      const left = rgba(a), right = rgba(b), p = Number(percent) / 100, alpha = left[3] * p + right[3] * (1 - p);
      const channels = [0, 1, 2].map(index => alpha ? (left[index] * left[3] * p + right[index] * right[3] * (1 - p)) / alpha : 0);
      return '#' + [...channels, alpha * 255].map(n => Math.round(n).toString(16).padStart(2, '0')).join('');
    });
    if (/var\(|color-mix\(/.test(result)) throw new Error(`Unsupported native SVG paint: ${result}`);
    return result;
  };
  return { resolve, token: key => resolve(`var(${key})`), font: key => resolve(`var(${key})`).split(',')[0].trim().replace(/^"|"$/g, '') };
}

export function createNativeSvgFrame(slide, graphicMarkup, theme, lengths = new Map()) {
  const { width, height } = slide;
  const x = width * .066, top = height * .072, gap = height * .033;
  const titleSize = width * .045, bodySize = width * .021;
  const titleLines = slide.title.split('\n'), bodyLines = slide.explanation.split('\n');
  const bodyTop = top + titleLines.length * titleSize * 1.05 + gap;
  const graphicY = bodyTop + bodyLines.length * bodySize * 1.4 + gap;
  const graphicHeight = height - top - graphicY;
  if (graphicHeight <= 0) throw new Error(`Native slide ${slide.id} has no room for its graphic. Shorten the header or author a taller frame.`);
  const text = (lines, y, size, leading, font, fill, weight, spacing = 0) => `<text x="${x}" y="${y + size * .82}" font-family="${escape(font)}" font-size="${size}" font-weight="${weight}" letter-spacing="${spacing}" fill="${fill}">${lines.map((line, i) => `<tspan x="${x}" dy="${i ? leading : 0}">${escape(line)}</tspan>`).join('')}</text>`;
  // SVG names are case-sensitive. HTML parsing lowercases filter primitives
  // (feGaussianBlur, feMergeNode), which makes native renderers drop live parts.
  const document = new DOMParser().parseFromString(graphicMarkup, 'image/svg+xml');
  const graphic = document.querySelector('svg');
  graphic.setAttribute('x', x); graphic.setAttribute('y', graphicY);
  graphic.setAttribute('width', width - x * 2); graphic.setAttribute('height', graphicHeight);
  graphic.removeAttribute('style'); graphic.removeAttribute('class');
  for (const element of [graphic, ...graphic.querySelectorAll('*')]) {
    for (const attribute of element.attributes) if (attribute.value.includes('var(') || attribute.value.includes('color-mix(')) {
      const resolved = attribute.name === 'font-family' ? theme.resolve(attribute.value).split(',')[0].trim().replace(/^"|"$/g, '') : theme.resolve(attribute.value);
      element.setAttribute(attribute.name, resolved);
    }
    // usvgr recognizes pathLength but does not apply it to stroke dashes. Convert
    // normalized reveals to local path units before the native parser sees them.
    if (element.hasAttribute('pathLength')) {
      const d = element.getAttribute('d'), normalized = Number(element.getAttribute('pathLength'));
      if (!lengths.has(d)) lengths.set(d, new svgPathProperties(d).getTotalLength());
      const scale = lengths.get(d) / normalized;
      if (!Number.isFinite(scale) || scale <= 0) throw new Error('A native stroke reveal needs a finite positive path length.');
      for (const attribute of ['stroke-dasharray', 'stroke-dashoffset']) if (element.hasAttribute(attribute)) element.setAttribute(attribute, element.getAttribute(attribute).split(/[\s,]+/).map(value => Number(value) * scale).join(' '));
      element.removeAttribute('pathLength');
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${theme.token('--ve-diagram-bg')}"/>${text(titleLines, top, titleSize, titleSize * 1.05, theme.font('--ve-font-display'), theme.token('--ve-text'), theme.token('--ve-display-weight'), -titleSize * .025)}${text(bodyLines, bodyTop, bodySize, bodySize * 1.4, theme.font('--ve-font-body'), theme.token('--ve-muted'), 400)}${graphic.outerHTML}</svg>`;
}

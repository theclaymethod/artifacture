import fs from 'node:fs/promises';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { detectPreset, detectPresetHint, detectProfile } from './profile.mjs';

export async function buildContext(filePath, options = {}) {
  const absolute = path.resolve(filePath);
  const html = await fs.readFile(absolute, 'utf8');
  let dom = null;
  try {
    dom = parseHTML(html).document;
  } catch {
    dom = null;
  }

  const styles = extractTagBodies(html, 'style').join('\n');
  const scripts = extractTagBodies(html, 'script').join('\n');
  const inlineStyles = Array.from(html.matchAll(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi), (match) => match[2]);
  const profile = options.profile || detectProfile(absolute, html);
  const preset = options.preset || detectPreset(absolute, html);
  const presetHint = preset === 'custom' ? detectPresetHint(absolute, html) : preset;

  const text = dom?.body?.textContent || stripTags(stripCodeLike(html));
  const lowered = html.toLowerCase();
  const flags = {
    hasMermaid: /class\s*=\s*["'][^"']*\bmermaid\b|mermaid\.initialize|\.mermaid\b/i.test(html),
    hasInlineSvgDiagram: /<svg\b/i.test(html),
    hasDiagramRoleTags: /data-diagram-role\s*=/i.test(html),
    hasAnimations: /@keyframes|\banimation(?:-[a-z-]+)?\s*:|\btransition(?:-[a-z-]+)?\s*:/i.test(styles),
    hasThemeToggle: /data-theme|theme-toggle|role\s*=\s*["']radiogroup/i.test(html),
    isFixedCanvas: isFixedCanvas(profile, html, styles),
  };

  return {
    filePath: absolute,
    html,
    styles,
    scripts,
    inlineStyles,
    text,
    dom,
    profile,
    preset,
    presetHint,
    flags,
    browser: null,
  };
}

export function extractTagBodies(html, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  return Array.from(html.matchAll(re), (match) => match[1]);
}

export function stripCodeLike(html) {
  return html
    .replace(/<pre\b[\s\S]*?<\/pre>/gi, '')
    .replace(/<code\b[\s\S]*?<\/code>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '');
}

export function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ');
}

function isFixedCanvas(profile, html, styles) {
  if (profile === 'slides' || profile === 'magazine' || profile === 'poster' || profile === 'video-comp') return true;
  return /data-layout=["'](?:slide|slides|magazine|poster)|--(?:slide|magazine|poster)/i.test(html) ||
    /\b(?:width|height)\s*:\s*\d+px/i.test(styles) && !/@media\s*\([^)]*max-width/i.test(styles);
}

import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import {
  assertSupportedProfile,
  detectPreset,
  detectPresetHint,
  detectProfile,
  detectReviewProfile,
} from './profile.mjs';

export async function buildContext(filePath, options = {}) {
  const absolute = path.resolve(filePath);
  const html = await fs.readFile(absolute, 'utf8');
  const parsed = parseHtmlDocument(html);
  const dom = parsed.document;

  const styles = extractTagBodies(html, 'style').join('\n');
  const scripts = extractTagBodies(html, 'script').join('\n');
  const inlineStyles = Array.from(html.matchAll(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi), (match) => match[2]);
  const mechanicsProfile = assertSupportedProfile(options.profile || detectProfile(absolute, html));
  const reviewProfile = detectReviewProfile(mechanicsProfile, html);
  const preset = options.preset || detectPreset(absolute, html);
  const presetHint = preset === 'custom' ? detectPresetHint(absolute, html) : preset;

  const text = dom?.body?.textContent || stripTags(stripCodeLike(html));
  const truthPath = options.truth ? path.resolve(options.truth) : null;
  const truthText = truthPath ? await fs.readFile(truthPath, 'utf8') : null;
  const renderedInventory = buildRenderedInventory(dom);
  const flags = {
    hasMermaid: /class\s*=\s*["'][^"']*\bmermaid\b|mermaid\.initialize|\.mermaid\b/i.test(html),
    hasInlineSvgDiagram: /<svg\b/i.test(html),
    hasDiagramRoleTags: /data-diagram-role\s*=/i.test(html),
    hasAnimations: /@keyframes|\banimation(?:-[a-z-]+)?\s*:|\btransition(?:-[a-z-]+)?\s*:/i.test(styles),
    hasThemeToggle: /data-theme|theme-toggle|role\s*=\s*["']radiogroup/i.test(html),
    isFixedCanvas: isFixedCanvas(mechanicsProfile, html, styles),
  };

  return {
    filePath: absolute,
    html,
    styles,
    scripts,
    inlineStyles,
    text,
    dom,
    // `profile` remains the mechanics alias for existing check registries and
    // browser callers. New report consumers should use the explicit fields.
    profile: mechanicsProfile,
    mechanicsProfile,
    reviewProfile,
    htmlParseError: parsed.error,
    preset,
    presetHint,
    flags,
    browser: null,
    truth: truthText == null ? null : buildTruthRecord(truthPath, truthText),
    renderedInventory,
  };
}

export function parseHtmlDocument(html) {
  try {
    const document = parseHTML(html).document;
    if (!document?.documentElement) throw new Error('parser produced no document element');
    return { document, error: null };
  } catch (error) {
    return {
      document: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function buildRenderedInventory(dom) {
  if (!dom) return { sha256: sha256('[]'), items: [], provenance: 'static' };
  const selectors = 'h1,h2,h3,h4,h5,h6,p,li,th,td,figcaption,blockquote,summary';
  const items = Array.from(dom.querySelectorAll(selectors))
    .map((element) => ({
      role: element.tagName.toLowerCase(),
      text: (element.textContent || '').replace(/\s+/g, ' ').trim(),
    }))
    .filter((item) => item.text);
  return { sha256: sha256(JSON.stringify(items)), items, provenance: 'static' };
}

export function buildTruthRecord(truthPath, truthText) {
  const claims = truthText.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^#{1,6}\s/.test(line));
  return {
    path: truthPath,
    sha256: sha256(truthText),
    bytes: Buffer.byteLength(truthText),
    claims,
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
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

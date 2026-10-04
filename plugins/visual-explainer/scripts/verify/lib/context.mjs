import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { buildRenderedInventory, buildTruthRecord } from './review-contract.mjs';
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
    profile: mechanicsProfile,
    mechanicsProfile,
    reviewProfile,
    htmlParseError: parsed.error,
    preset,
    presetHint,
    flags,
    browser: null,
    truthText,
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

export async function prepareCapture(ctx, screensRoot) {
  const root = screensRoot ? path.resolve(screensRoot) : tmpdir();
  await fs.mkdir(root, { recursive: true });
  ctx.captureDirectory = await fs.mkdtemp(path.join(root, 've-capture-'));
  ctx.artifactSnapshot = path.join(ctx.captureDirectory, 'artifact.html');
  await fs.writeFile(ctx.artifactSnapshot, ctx.html, { flag: 'wx' });
  if (ctx.truth) {
    const truthPath = path.join(ctx.captureDirectory, 'truth.md');
    await fs.writeFile(truthPath, ctx.truthText, { flag: 'wx' });
    ctx.truth = { ...ctx.truth, source_path: ctx.truth.path, path: truthPath };
  }
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

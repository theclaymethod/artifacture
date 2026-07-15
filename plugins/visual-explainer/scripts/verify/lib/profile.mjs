const PRESETS = [
  'mono-industrial',
  'nothing',
  'blueprint',
  'editorial',
  'paper-ink',
  'terminal',
  'ide',
  'custom',
];

export function detectProfile(filePath, html) {
  const text = html.toLowerCase();
  const styles = extractStyles(html).toLowerCase();
  const authored = stripStyleBlocks(html).toLowerCase();

  if (
    /data-composition-id|data-hf-|window\.__timelines|gsap\.timeline|data-scene|data-duration/.test(text)
  ) {
    return 'video-comp';
  }

  if (
    /--poster|data-poster-root|data-layout=["']poster|data-profile=["']poster/.test(authored) ||
    /data-ve-poster["']?\s*[:=]\s*(?:!0|true|["']true["'])/.test(authored) ||
    /\bw-\[\d+px\][^"']*\bh-\[\d+px\]/.test(authored)
  ) {
    return 'poster';
  }

  // Fixed-stage presentation decks (PresentationDeck) render one scaled
  // 1920×1080 stage with no scrolling at all, so the slides/magazine
  // scroll-snap heuristics below do not apply to them — and the bundled
  // Tailwind CSS always carries SlideDeck's snap utilities, which would
  // otherwise misclassify every presentation artifact as `slides`. They
  // verify as pages.
  if (/data-ve-presentation/.test(authored)) {
    return 'page';
  }

  if (
    /data-layout=["']magazine/.test(authored) ||
    /orientation\s*:\s*`horizontal`/.test(authored) && /data-ve-deck/.test(authored) ||
    /scroll-snap-type\s*:\s*x\s+mandatory/.test(styles)
  ) {
    return 'magazine';
  }

  if (
    /data-ve-deck/.test(authored) ||
    (/scroll-snap-type\s*:\s*y\s+mandatory/.test(styles) && /100(?:dvh|vh)/.test(styles))
  ) {
    return 'slides';
  }

  return 'page';
}

export function detectPreset(filePath, html) {
  const text = html.toLowerCase();

  const declaredPresets = new Set(Array.from(html.matchAll(/\sdata-ve-preset\s*=\s*["']([^"']+)["']/gi), (m) => normalizePreset(m[1])));
  if (declaredPresets.size > 1) return 'custom';
  if (declaredPresets.size === 1) {
    const preset = Array.from(declaredPresets)[0];
    return PRESETS.includes(preset) ? preset : 'custom';
  }

  const runtimePreset = detectEmittedRuntimePreset(filePath, html);
  if (runtimePreset) return runtimePreset;

  const signatureSource = removePresetScopedCss(html);
  if (/(?:font-family|fontFamily|--font-[a-z0-9_-]+)\s*:\s*[^;{}]*["']?Doto\b/i.test(signatureSource)) return 'nothing';
  if (coreMonoTokenCount(signatureSource) >= 2) return 'mono-industrial';
  if (/--blueprint-[a-z][a-z0-9_-]*\s*:|data-theme-name\s*=\s*["']blueprint["']|data-ve-theme\s*=\s*["']blueprint["']/i.test(signatureSource)) return 'blueprint';
  if (/--editorial-[a-z][a-z0-9_-]*\s*:|data-theme-name\s*=\s*["']editorial["']|data-ve-theme\s*=\s*["']editorial["']/i.test(signatureSource)) return 'editorial';
  if (/--paper-ink-[a-z][a-z0-9_-]*\s*:|data-theme-name\s*=\s*["']paper-ink["']|data-ve-theme\s*=\s*["']paper-ink["']/i.test(signatureSource)) return 'paper-ink';
  if (/--terminal-[a-z][a-z0-9_-]*\s*:|data-theme-name\s*=\s*["']terminal["']|data-ve-theme\s*=\s*["']terminal["']/i.test(signatureSource)) return 'terminal';
  if (/--ide-[a-z][a-z0-9_-]*\s*:|data-theme-name\s*=\s*["']ide["']|data-ve-theme\s*=\s*["']ide["']|data-code-theme\s*=\s*["'](?:dracula|nord|catppuccin|solarized|gruvbox|one-dark|rose-pine)["']/i.test(signatureSource)) return 'ide';
  return 'custom';
}

export function detectPresetHint(filePath, html) {
  const text = html.toLowerCase();
  if (/doto|nothing/.test(text)) return 'nothing';
  if (/mono-industrial|space grotesk/.test(text) && /space mono/.test(text)) return 'mono-industrial';
  if (/blueprint|blue print|blue-grid/.test(text)) return 'blueprint';
  if (/editorial|libre baskerville|newsreader|source serif/.test(text)) return 'editorial';
  if (/paper-ink|paper ink/.test(text)) return 'paper-ink';
  if (/terminal|vt323|ibm plex mono|ui-monospace/.test(text)) return 'terminal';
  if (/dracula|nord|catppuccin|solarized|gruvbox|one dark|rose pine|jetbrains mono/.test(text)) return 'ide';
  return 'custom';
}

export function presetMatches(ctx, preset) {
  return ctx.preset === preset;
}

function extractStyles(html) {
  return Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi), (match) => match[1]).join('\n');
}

function stripStyleBlocks(html) {
  return html.replace(/<style\b[\s\S]*?<\/style>/gi, '');
}

function removePresetScopedCss(html) {
  return html
    .replace(/\[data-ve-preset=[^\]]+\][^{]*\{[^}]*\}/gi, '')
    .replace(/\.ve-output--(?:mono-industrial|nothing|blueprint|editorial|paper-ink|terminal|ide)\b[^{]*\{[^}]*\}/gi, '');
}

function detectEmittedRuntimePreset(filePath, html) {
  if (!/data-ve-preset["']?\s*:/.test(html)) return '';
  if (!/window\.location\.pathname\.match\([^)]*preset-artifact-\(\[a-z-\]\+\)/.test(html)) return '';
  const match = path.basename(filePath).toLowerCase().match(/^preset-artifact-([a-z-]+)\.html$/);
  const preset = match ? normalizePreset(match[1]) : '';
  return PRESETS.includes(preset) && preset !== 'custom' ? preset : '';
}

function normalizePreset(value = '') {
  return value.trim().toLowerCase();
}

function coreMonoTokenCount(html) {
  const coreTokens = ['--text-display', '--text-primary', '--rule', '--size-display', '--size-caption'];
  return coreTokens.filter((token) => new RegExp(`${escapeForRe(token)}\\b`, 'i').test(html)).length;
}

function hasClassCluster(html, patterns) {
  const classText = Array.from(html.matchAll(/\sclass\s*=\s*["']([^"']+)["']/gi), (match) => match[1]).join(' ');
  return patterns.every((pattern) => pattern.test(classText));
}

function escapeForRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
import path from 'node:path';

// I/O shells for ve:learn's url and image modalities. Kept separate from the
// learn.mjs CLI so the eval harness (evals/design-systems/) and tests can
// import them without triggering the CLI, and separate from
// learn-extractors.mjs so that module stays pure/deterministic.
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractFromHtml, extractionFromPalette, quantizePalette } from './learn-extractors.mjs';

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // ~5MB per document/stylesheet
const FETCH_TIMEOUT_MS = 15_000;

// Best-effort SSRF guard for a local CLI: refuse loopback, link-local, and
// RFC1918 hosts by URL-literal inspection (no DNS resolution — a hostname
// that resolves privately is out of scope for this tool's threat model).
// `--allow-private` opts out for intentionally local design references.
export function isPrivateHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0') return true;
  if (host.includes(':')) {
    // IPv6: loopback, unspecified, link-local (fe80::/10), unique-local (fc00::/7)
    return host === '::1' || host === '::' || /^(fe[89ab]|f[cd])/.test(host);
  }
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 127 || a === 10 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function assertFetchableUrl(rawUrl, { allowPrivate }) {
  const parsed = new URL(rawUrl);
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error(`Refusing to fetch non-http(s) URL: ${rawUrl}`);
  }
  if (!allowPrivate && isPrivateHost(parsed.hostname)) {
    throw new Error(
      `Refusing to fetch private/loopback host ${parsed.hostname} (pass --allow-private to override).`,
    );
  }
  return parsed;
}

async function fetchText(fetchImpl, url, { expectCss = false } = {}) {
  const response = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  const contentType = (response.headers?.get?.('content-type') ?? '').toLowerCase();
  if (contentType && !contentType.startsWith('text/') && !contentType.includes('css') && !contentType.includes('html')) {
    throw new Error(`Unexpected content-type "${contentType}" for ${url} (expected ${expectCss ? 'text/css' : 'text/html'}).`);
  }
  const contentLength = Number(response.headers?.get?.('content-length') ?? 0);
  if (contentLength > MAX_RESPONSE_BYTES) {
    throw new Error(`Response for ${url} exceeds ${MAX_RESPONSE_BYTES} bytes.`);
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new Error(`Response for ${url} exceeds ${MAX_RESPONSE_BYTES} bytes.`);
  }
  return text;
}

/**
 * Fetch a page plus its linked stylesheets and run the HTML/CSS extractor.
 * `fetchImpl` is injectable for tests/evals (no live network in CI).
 */
export async function extractFromUrlSource(
  url,
  { fetchImpl = fetch, maxStylesheets = 10, allowPrivate = false } = {},
) {
  assertFetchableUrl(url, { allowPrivate });
  const html = await fetchText(fetchImpl, url);
  const cssTexts = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]);
  const hrefs = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)]
    .map((match) => match[0].match(/href=["']([^"']+)["']/)?.[1])
    .filter(Boolean)
    .slice(0, maxStylesheets);
  for (const href of hrefs) {
    try {
      const cssUrl = new URL(href, url).toString();
      assertFetchableUrl(cssUrl, { allowPrivate });
      cssTexts.push(await fetchText(fetchImpl, cssUrl, { expectCss: true }));
    } catch (error) {
      console.warn(`WARN: could not fetch stylesheet ${href}: ${error.message}`);
    }
  }
  return extractFromHtml({ html, cssTexts });
}

/**
 * Decode an image and quantize its palette using a canvas in Playwright's
 * bundled Chromium (already a repo dependency).
 */
export async function extractFromImageSource(imagePath) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // data: URL rather than file:// — Chromium refuses file:// subresources
    // from a non-file page.
    const MIME_TYPES = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.avif': 'image/avif',
      '.bmp': 'image/bmp',
    };
    const mime = MIME_TYPES[path.extname(imagePath).toLowerCase()] ?? 'image/png';
    const bytes = await fs.readFile(path.resolve(imagePath));
    const imageUrl = `data:${mime};base64,${bytes.toString('base64')}`;
    await page.goto('about:blank');
    const data = await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const SAMPLE = 96; // downsample: palette needs coverage, not detail
      const scale = Math.min(1, SAMPLE / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, width, height);
      return [...ctx.getImageData(0, 0, width, height).data];
    }, imageUrl);
    return extractionFromPalette(quantizePalette(data));
  } finally {
    await browser.close();
  }
}

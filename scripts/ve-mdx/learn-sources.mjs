// I/O shells for ve:learn's url and image modalities. Kept separate from the
// learn.mjs CLI so the eval harness (evals/design-systems/) and tests can
// import them without triggering the CLI, and separate from
// learn-extractors.mjs so that module stays pure/deterministic.
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractFromHtml, extractionFromPalette, quantizePalette } from './learn-extractors.mjs';

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // ~5MB per document/stylesheet
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function parseIpv4(host) {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  return octets.every((octet) => octet <= 255) ? octets : null;
}

function isPrivateIpv4(octets) {
  const [a, b] = octets;
  if (a === 127 || a === 10 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return a === 192 && b === 168;
}

function parseIpv6Words(host) {
  let source = host;
  const dottedTail = source.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  if (dottedTail) {
    const octets = parseIpv4(dottedTail);
    if (!octets) return null;
    const replacement = `${(octets[0] << 8 | octets[1]).toString(16)}:${(octets[2] << 8 | octets[3]).toString(16)}`;
    source = source.slice(0, -dottedTail.length) + replacement;
  }

  if ((source.match(/::/g) || []).length > 1) return null;
  const [leftSource, rightSource] = source.split('::');
  const left = leftSource ? leftSource.split(':') : [];
  const right = rightSource ? rightSource.split(':') : [];
  if (source.includes('::')) {
    const missing = 8 - left.length - right.length;
    if (missing < 1) return null;
    left.push(...Array(missing).fill('0'), ...right);
  } else if (left.length !== 8) {
    return null;
  }

  if (left.length !== 8 || left.some((word) => !/^[0-9a-f]{1,4}$/i.test(word))) return null;
  return left.map((word) => Number.parseInt(word, 16));
}

// Best-effort SSRF guard for a local CLI: refuse loopback, link-local, and
// RFC1918 hosts by URL-literal inspection (no DNS resolution — a hostname
// that resolves privately is out of scope for this tool's threat model).
// `--allow-private` opts out for intentionally local design references.
export function isPrivateHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0') return true;
  if (host.includes(':')) {
    const words = parseIpv6Words(host);
    if (!words) return false;
    const mappedIpv4 = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff
      ? [(words[6] >> 8) & 0xff, words[6] & 0xff, (words[7] >> 8) & 0xff, words[7] & 0xff]
      : null;
    if (mappedIpv4) return isPrivateIpv4(mappedIpv4);
    const isUnspecified = words.every((word) => word === 0);
    const isLoopback = words.slice(0, 7).every((word) => word === 0) && words[7] === 1;
    const isLinkLocal = (words[0] & 0xffc0) === 0xfe80;
    const isUniqueLocal = (words[0] & 0xfe00) === 0xfc00;
    return isUnspecified || isLoopback || isLinkLocal || isUniqueLocal;
  }
  const ipv4 = parseIpv4(host);
  return ipv4 ? isPrivateIpv4(ipv4) : false;
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

async function fetchText(fetchImpl, rawUrl, { expectCss = false, allowPrivate = false } = {}) {
  let url = assertFetchableUrl(rawUrl, { allowPrivate }).toString();
  let response;
  for (let redirects = 0; ; redirects += 1) {
    response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!REDIRECT_STATUSES.has(response.status)) break;
    if (redirects >= MAX_REDIRECTS) {
      throw new Error(`Too many redirects while fetching ${rawUrl} (maximum ${MAX_REDIRECTS}).`);
    }
    const location = response.headers?.get?.('location');
    if (!location) throw new Error(`Redirect from ${url} is missing a Location header.`);
    url = assertFetchableUrl(new URL(location, url).toString(), { allowPrivate }).toString();
  }

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
  return { text, url };
}

/**
 * Fetch a page plus its linked stylesheets and run the HTML/CSS extractor.
 * `fetchImpl` is injectable for tests/evals (no live network in CI).
 */
export async function extractFromUrlSource(
  url,
  { fetchImpl = fetch, maxStylesheets = 10, allowPrivate = false } = {},
) {
  const page = await fetchText(fetchImpl, url, { allowPrivate });
  const html = page.text;
  const cssTexts = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]);
  const hrefs = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)]
    .map((match) => match[0].match(/href=["']([^"']+)["']/)?.[1])
    .filter(Boolean)
    .slice(0, maxStylesheets);
  for (const href of hrefs) {
    try {
      const cssUrl = new URL(href, page.url).toString();
      const stylesheet = await fetchText(fetchImpl, cssUrl, { expectCss: true, allowPrivate });
      cssTexts.push(stylesheet.text);
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

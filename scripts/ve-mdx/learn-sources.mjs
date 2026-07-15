// I/O shells for ve:learn's url and image modalities. Kept separate from the
// learn.mjs CLI so the eval harness (evals/design-systems/) and tests can
// import them without triggering the CLI, and separate from
// learn-extractors.mjs so that module stays pure/deterministic.
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractFromHtml, extractionFromPalette, quantizePalette } from './learn-extractors.mjs';

/**
 * Fetch a page plus its linked stylesheets and run the HTML/CSS extractor.
 * `fetchImpl` is injectable for tests/evals (no live network in CI).
 */
export async function extractFromUrlSource(url, { fetchImpl = fetch, maxStylesheets = 10 } = {}) {
  const response = await fetchImpl(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  const html = await response.text();
  const cssTexts = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]);
  const hrefs = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)]
    .map((match) => match[0].match(/href=["']([^"']+)["']/)?.[1])
    .filter(Boolean)
    .slice(0, maxStylesheets);
  for (const href of hrefs) {
    try {
      const cssUrl = new URL(href, url).toString();
      const cssResponse = await fetchImpl(cssUrl, { redirect: 'follow' });
      if (cssResponse.ok) cssTexts.push(await cssResponse.text());
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

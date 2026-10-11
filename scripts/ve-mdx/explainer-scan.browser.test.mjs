// End-to-end check of the scan-first explainer pieces: export the review-scan example through the
// public exporter, then drive the real page in Chromium (chapter rail, DataTable, diagram key,
// highlighted code and diffs) in light and dark mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = path.join(ROOT, 'examples/visual-explainer-mdx/review-scan.mdx');

function luminance([r, g, b]) {
  const channel = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// The rendered text color and the composited background behind it, as sRGB bytes. A canvas
// resolves every CSS color form (including color-mix) and stacks translucent backgrounds.
async function colorPairs(page, selector) {
  return page.$$eval(selector, (elements) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const pixel = () => Array.from(context.getImageData(0, 0, 1, 1).data.subarray(0, 3));
    const layers = (element) => {
      const stack = [];
      for (let current = element; current; current = current.parentElement) stack.push(getComputedStyle(current).backgroundColor);
      return stack.reverse();
    };
    return elements.map((element) => {
      context.globalAlpha = 1;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, 1, 1);
      for (const layer of layers(element)) {
        context.fillStyle = layer;
        context.fillRect(0, 0, 1, 1);
      }
      const bg = pixel();
      context.fillStyle = getComputedStyle(element).color;
      context.fillRect(0, 0, 1, 1);
      return { text: element.textContent.trim(), fg: pixel(), bg };
    });
  });
}

let workDir;
let artifact;
let browser;

test.before(async () => {
  browser = await chromium.launch({ headless: true });
  workDir = mkdtempSync(path.join(os.tmpdir(), 'artifacture-review-scan-'));
  artifact = path.join(workDir, 'review-scan.html');
  const result = spawnSync(process.execPath, ['scripts/ve-mdx/export.mjs', SOURCE, '--out', artifact], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test.after(async () => {
  await browser?.close();
  rmSync(workDir, { recursive: true, force: true });
});

for (const scheme of ['light', 'dark']) {
  test(`review-scan at 1280px in ${scheme} mode: rail, table, key and code`, async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(pathToFileURL(artifact).href, { waitUntil: 'load' });
      await page.waitForSelector('[data-ve-chapter-rail]');
      assert.deepEqual(errors, []);
      assert.equal(await page.getAttribute('main.ve-shell', 'data-ve-appearance'), scheme === 'dark' ? 'dark' : null);

      // Rail: sticky, one link per section, and the current chapter follows the scroll.
      const rail = page.locator('[data-ve-chapter-rail]');
      assert.equal(await rail.evaluate((element) => getComputedStyle(element).position), 'sticky');
      assert.deepEqual(await page.$$eval('.ve-chapter-list > li > a', (links) => links.map((link) => link.getAttribute('href'))), ['#verdicts', '#map', '#code']);
      assert.equal(await page.locator('.ve-chapter-toggle').isVisible(), false);
      await page.evaluate(() => document.getElementById('code').scrollIntoView());
      await page.waitForFunction(() => document.querySelector('.ve-chapter-list a[aria-current="location"]')?.getAttribute('href') === '#code');

      // Keyboard, from a fresh load: Tab reaches the first chapter link, and Enter moves to its section.
      await page.goto(pathToFileURL(artifact).href, { waitUntil: 'load' });
      await page.waitForSelector('[data-ve-chapter-rail]');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), '#verdicts');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), '#map');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => location.hash === '#map' && Math.abs(document.getElementById('map').getBoundingClientRect().top) < 120);

      // Table: no sideways scroll, sticky header, right-aligned numbers, labelled cells, pills with text.
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
      assert.ok(await page.$eval('[data-ve-data-table]', (element) => element.scrollWidth <= element.clientWidth));
      assert.equal(await page.$eval('[data-ve-data-table] th', (element) => getComputedStyle(element).position), 'sticky');
      assert.equal(await page.$eval('[data-ve-data-table] td[data-ve-kind="number"]', (element) => getComputedStyle(element).textAlign), 'right');
      assert.ok(await page.$$eval('[data-ve-data-table] tbody td', (cells) => cells.every((cell) => cell.dataset.label)));
      assert.deepEqual(await page.$$eval('[data-ve-data-table] .ve-status-pill', (pills) => pills.map((pill) => pill.textContent.trim())), ['Proven', 'Proven', 'Backed', 'Gap']);
      assert.ok(await page.$eval('[data-ve-data-table] .ve-cell-id', (element) => /mono/i.test(getComputedStyle(element).fontFamily)));

      // Diagram: toned nodes, a hatched dashed node, and a key that names every encoding.
      assert.ok(await page.$$eval('[data-diagram-role="node"]', (nodes) => nodes.some((node) => node.getAttribute('stroke-dasharray'))));
      assert.ok(await page.$('svg pattern[id^="ve-hatch-"]'));
      assert.deepEqual(await page.$$eval('.ve-legend-label', (labels) => labels.map((label) => label.textContent)), ['Proven', 'Backed', 'fact tier', 'guess tier', 'model judge']);

      // Code: tokens take distinct syntax colors; diff rows carry a +/- gutter and tinted rows.
      const tokenColors = await page.$$eval('.ve-code-shiki span[style*="--shiki-token"]', (spans) => [...new Set(spans.map((span) => getComputedStyle(span).color))]);
      assert.ok(tokenColors.length >= 4, `expected several syntax colors, got ${tokenColors.join(', ')}`);
      assert.deepEqual(await page.$$eval('[data-ve-diff-kind="add"] .ve-diff-mark', (marks) => marks.map((mark) => mark.textContent)), ['+', '+']);
      const addRow = await page.$eval('[data-ve-diff-kind="add"]', (row) => getComputedStyle(row).backgroundColor);
      const contextRow = await page.$eval('[data-ve-diff-kind="context"]', (row) => getComputedStyle(row).backgroundColor);
      assert.notEqual(addRow, contextRow);

      // Escaping: markup inside a code string renders as text, never as an element.
      assert.equal(await page.locator('script:has-text("alert(1)")').count(), 0);
      assert.ok((await page.locator('.ve-code-shiki', { hasText: '<script>alert(1)</script>' }).count()) > 0);

      // Cover title: a modest size above the section headings, so a long title stays readable.
      const titleSize = await page.$eval('.ve-shell-header h1', (element) => parseFloat(getComputedStyle(element).fontSize));
      const headingSize = await page.$eval('.ve-section-heading h2', (element) => parseFloat(getComputedStyle(element).fontSize));
      assert.equal(titleSize, 40);
      assert.ok(titleSize > headingSize, `title ${titleSize}px, heading ${headingSize}px`);

      // Subsection and DefinitionList: a rail anchor under a rule, and term and detail in two columns.
      assert.equal(await page.$eval('#claim-c2', (element) => element.dataset.veAnchor), 'true');
      assert.equal(await page.$eval('.ve-definition-list', (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length), 2);

      // Disclosure and ChipLinks: closed by default, 44px targets, and a link into the block opens it.
      assert.equal(await page.$eval('.ve-disclosure', (element) => element.open), false);
      for (const selector of ['.ve-disclosure-summary', '.ve-chip-link']) {
        assert.ok(await page.$eval(selector, (element) => element.getBoundingClientRect().height >= 44), `${selector} is under 44px`);
      }
      await page.click('.ve-chip-link');
      await page.waitForFunction(() => document.querySelector('.ve-disclosure').open);

      // DiagramModes: Simple first, a labelled switch, the same place for a shared node, and a remembered choice.
      const modes = page.locator('[data-ve-diagram-modes]');
      const places = () => page.evaluate(() => {
        const svg = document.querySelector('[data-ve-diagram-modes] [data-ve-variant="desktop"] svg').getBoundingClientRect();
        return [...document.querySelectorAll('[data-ve-diagram-modes] [data-ve-variant="desktop"] [data-diagram-role="node"]')].map((n) => { const b = n.getBoundingClientRect(); return [Math.round(b.x - svg.x), Math.round(b.y - svg.y)]; });
      });
      assert.equal(await modes.getAttribute('data-ve-mode'), 'simple');
      assert.ok(await modes.locator('text=Check the balance').count());
      const before = await places();
      await modes.getByLabel('Detailed').check();
      assert.equal(await modes.getAttribute('data-ve-mode'), 'detailed');
      assert.ok(await modes.locator('text=OverdraftError').count());
      const after = await places();
      for (const point of before) assert.ok(after.some((p) => p[0] === point[0] && p[1] === point[1]), `node at ${point} moved`);
      await page.reload({ waitUntil: 'load' });
      await page.waitForSelector('[data-ve-diagram-modes]');
      assert.equal(await page.getAttribute('[data-ve-diagram-modes]', 'data-ve-mode'), 'detailed');
      await page.getByLabel('Simple').check();

      // AA: pills, badges, key labels, rail links, definitions and code tokens on their real backgrounds.
      for (const selector of ['.ve-status-pill', '.ve-badge', '.ve-legend-label', '.ve-chapter-list a', '.ve-definition-list > *', '.ve-code-shiki span[style*="--shiki-token"]', '.ve-diff-mark']) {
        for (const pair of await colorPairs(page, selector)) {
          if (!pair.text) continue;
          assert.ok(contrast(pair.fg, pair.bg) >= 4.5, `${selector} "${pair.text}" contrast ${contrast(pair.fg, pair.bg).toFixed(2)} in ${scheme}`);
        }
      }
    } finally {
      await context.close();
    }
  });
}

test('review-scan at 375px: compact top bar, keyboard disclosure, card rows, reduced motion', async () => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(artifact).href, { waitUntil: 'load' });
    const toggle = page.locator('.ve-chapter-toggle');
    await toggle.waitFor();
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('.ve-chapter-list').isVisible(), false);
    await toggle.focus();
    await page.keyboard.press('Enter');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('.ve-chapter-list').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('ve-chapter-toggle')), true);
    await page.evaluate(() => window.scrollTo(0, 1200));
    assert.equal(await toggle.evaluate((element) => element.closest('nav').getBoundingClientRect().top), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    assert.equal(await page.$eval('[data-ve-data-table] tbody tr', (row) => getComputedStyle(row).display), 'block');
    assert.equal(await page.$eval('[data-ve-data-table] thead', (head) => getComputedStyle(head).display), 'none');
    assert.equal(await page.$eval('.ve-shell-header h1', (element) => getComputedStyle(element).fontSize), '30px');
    assert.equal(await page.$eval('.ve-definition-list', (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length), 1);

    const motion = await browser.newPage({ viewport: { width: 375, height: 812 }, reducedMotion: 'no-preference' });
    await motion.goto(pathToFileURL(artifact).href, { waitUntil: 'load' });
    await motion.waitForSelector('[data-ve-chapter-rail]');
    assert.equal(await motion.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'smooth');
    await motion.close();
  } finally {
    await context.close();
  }
});

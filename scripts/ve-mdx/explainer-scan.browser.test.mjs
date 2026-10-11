// End-to-end check of the scan-first explainer pieces: export the review-scan example through the
// public exporter, then drive the real page in Chromium (chapter rail, DataTable, diagram key,
// highlighted code and diffs) in light and dark mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = path.join(ROOT, 'examples/visual-explainer-mdx/review-scan.mdx');
// The trust-map explainer: an understando fixture run (trust map, resolved refs, explain.json and the agent's MDX).
const TRUST_FIXTURE = path.join(ROOT, 'scripts/ve-mdx/fixtures/trust-map');
// The same map in the old shape (schema_version 1: each verifier lists its claims, no claim lists its checks).
const OLD_SHAPE_MAP = path.join(ROOT, 'scripts/ve-mdx/fixtures/trust-map-v1/trust-map.json');

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (status) => resolve({ status, out }));
  });
}

/** A copy of the trust-map fixture with one change, exported; resolves to the export result. */
function exportTrustCase(dir, change) {
  cpSync(TRUST_FIXTURE, dir, { recursive: true });
  change(dir);
  return run(['scripts/ve-mdx/export.mjs', path.join(dir, 'explainer.mdx'), '--out', path.join(dir, 'explainer.html')]);
}

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
let trust;

test.before(async () => {
  browser = await chromium.launch({ headless: true });
  workDir = mkdtempSync(path.join(os.tmpdir(), 'artifacture-review-scan-'));
  artifact = path.join(workDir, 'review-scan.html');
  const trustDir = path.join(workDir, 'trust');
  // The exports run at the same time; the bad cases fail in the pre-render, before a bundle.
  const map = (dir) => JSON.parse(readFileSync(path.join(dir, 'trust-map.json'), 'utf8'));
  const oldDir = path.join(workDir, 'old-shape');
  const [scan, good, noAction, idInProse, oldShape] = await Promise.all([
    run(['scripts/ve-mdx/export.mjs', SOURCE, '--out', artifact]),
    // One claim joins an old claim: its old id C09 must still find it.
    exportTrustCase(trustDir, (dir) => {
      const data = map(dir);
      const c = data.claims.find((x) => x.id === 'C02');
      c.legacy_ids = ['C02', 'C09'];
      c.parts = [{ id: 'C02', text: 'The new balance is an int.' }, { id: 'C09', text: 'The new balance is the old balance less the amount.' }];
      writeFileSync(path.join(dir, 'trust-map.json'), JSON.stringify(data));
    }),
    exportTrustCase(path.join(workDir, 'no-action'), (dir) => {
      const data = map(dir);
      for (const p of data.promises) delete p.reviewer_action;
      writeFileSync(path.join(dir, 'trust-map.json'), JSON.stringify(data));
    }),
    exportTrustCase(path.join(workDir, 'id-in-prose'), (dir) => {
      const mdx = path.join(dir, 'explainer.mdx');
      writeFileSync(mdx, readFileSync(mdx, 'utf8').replace('A planted bug proves the overdraft rule.', 'Control K01 proves the overdraft rule.'));
    }),
    exportTrustCase(oldDir, (dir) => cpSync(OLD_SHAPE_MAP, path.join(dir, 'trust-map.json'))),
  ]);
  assert.equal(scan.status, 0, scan.out);
  assert.equal(good.status, 0, good.out);
  assert.equal(oldShape.status, 0, oldShape.out);
  trust = { dir: trustDir, html: path.join(trustDir, 'explainer.html'), oldHtml: path.join(oldDir, 'explainer.html'), map: map(trustDir), noAction, idInProse };
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

      // Keyboard, from a fresh load: the skip link comes first, then the first chapter link, and Enter moves to its section.
      await page.goto(pathToFileURL(artifact).href, { waitUntil: 'load' });
      await page.waitForSelector('[data-ve-chapter-rail]');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Skip to content');
      assert.ok(await page.evaluate(() => document.activeElement.getBoundingClientRect().top >= 0));
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

      // Term: focus shows the definition; the first use spells out the abbreviation. Pills carry their meaning.
      assert.ok((await page.locator('#verdicts p').first().textContent()).includes('pull request (PR'));
      await page.locator('.ve-term').first().focus();
      assert.ok(await page.locator('.ve-term [role="tooltip"]').first().isVisible());
      assert.match(await page.getAttribute('#verdicts .ve-status-pill', 'title'), /planted bug/);

      // Diagrams fit their column, and edges that merge with one label carry it once.
      assert.ok(await page.$$eval('[data-ve-variant="desktop"]', (variants) => variants.every((v) => v.scrollWidth <= v.clientWidth + 1)));
      assert.equal(await page.locator('svg text', { hasText: 'backs' }).count(), 1);

      // Disclosure and ChipLinks: closed by default, 44px targets, and a link into the block opens it.
      assert.equal(await page.$eval('.ve-disclosure', (element) => element.open), false);
      // A lazy block has no body until it opens; opening it writes its link, and a reload keeps it open.
      assert.equal(await page.locator('#claim-c2-control').count(), 0);
      await page.click('#claim-c2-evidence > summary .ve-disclosure-label');
      await page.waitForFunction(() => location.hash === '#claim-c2-evidence' && document.getElementById('claim-c2-control'));
      assert.ok(await page.locator('#claim-c2-evidence .ve-copy-link').isVisible());
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => document.getElementById('claim-c2-evidence')?.open);
      await page.evaluate(() => { sessionStorage.clear(); history.replaceState(null, '', location.pathname); });
      await page.reload({ waitUntil: 'load' });
      await page.waitForSelector('[data-ve-chapter-rail]');
      for (const selector of ['.ve-disclosure-summary', '.ve-chip-link']) {
        assert.ok(await page.$eval(selector, (element) => element.getBoundingClientRect().height >= 44), `${selector} is under 44px`);
      }
      await page.click('.ve-chip-link');
      await page.waitForFunction(() => document.getElementById('claim-c2-evidence').open && document.getElementById('claim-c2-control'));

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

// ---- The guided review: the trust-map explainer as chapters ----------------------------------

const derivedOf = (dir) => JSON.parse(readFileSync(path.join(dir, 'refs.resolved.json'), 'utf8')).derived;
const visibleChapters = (page) => page.$$eval('section.ve-section[id^="ch-"]', (s) => s.filter((x) => !x.hidden && x.getBoundingClientRect().height > 0).map((x) => x.id));

test('guided review: the export checks, the stamp, and the page without JavaScript', async () => {
  // The export fails on bad data and on an ID in the narrative prose.
  assert.notEqual(trust.noAction.status, 0);
  assert.match(trust.noAction.out, /needs a reviewer_action/);
  assert.notEqual(trust.idInProse.status, 0);
  assert.match(trust.idInProse.out, /the ID K01 is in the narrative prose/);

  const html = readFileSync(trust.html, 'utf8');
  assert.ok(html.includes(`<meta name="ve-trust-map-head" content="${trust.map.head}">`));
  const sha = createHash('sha256').update(readFileSync(path.join(trust.dir, 'trust-map.json'))).digest('hex');
  assert.ok(html.includes(`<meta name="ve-trust-map-sha256" content="${sha}">`));

  // Without JavaScript: every chapter renders in sequence, readable, with no call control; a deep link shows its claim.
  const off = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
  try {
    const page = await off.newPage();
    await page.goto(pathToFileURL(trust.html).href + '#claim-c02', { waitUntil: 'load' });
    assert.deepEqual(await visibleChapters(page), ['ch-0', 'ch-1', 'ch-2', 'ch-3', 'ch-4', 'ch-5', 'ch-6', 'ch-7', 'ch-8', 'ch-9']);
    const text = await page.innerText('main');
    for (const want of ['Not ready', 'things to review', trust.map.promises[0].label, 'checks caught their planted bug', 'Show the answer', 'wallet/core.py']) assert.ok(text.includes(want), `no-JS text lacks ${want}`);
    assert.equal(await page.locator('[data-ve-review-call]').first().isVisible(), false, 'a call control shows without JavaScript');
    assert.ok(await page.$eval('#claim-c02 > .ve-disclosure-body', (body) => body.getBoundingClientRect().height > 0), 'the no-JS deep link does not show its claim');
    // Each step of the run shows, with no step buttons.
    assert.equal(await page.locator('.ve-step').count(), 3);
    assert.equal(await page.locator('[data-ve-step-next]').count(), 0);
  } finally {
    await off.close();
  }
});

test('guided review: chapters as pages, the rail, the pager, one page, the anchors and the stepper', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    const url = pathToFileURL(trust.html).href;
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('main[data-ve-paged="pages"]');
    assert.deepEqual(await visibleChapters(page), ['ch-0']);
    assert.equal(await page.textContent('[data-ve-here="true"] .ve-chapter-label'), 'StartYou are here');

    // Next and previous, with the rail marker following.
    await page.click('#ch-0 [data-ve-pager-next]');
    await page.waitForFunction(() => location.hash === '#ch-1' && !document.getElementById('ch-1').hidden);
    assert.deepEqual(await visibleChapters(page), ['ch-1']);
    assert.match(await page.textContent('[data-ve-here="true"]'), /The problem and the change/);
    await page.click('#ch-1 [data-ve-pager-prev]');
    await page.waitForFunction(() => !document.getElementById('ch-0').hidden);
    await page.click('.ve-chapter-list a[href="#ch-7"]');
    await page.waitForFunction(() => !document.getElementById('ch-7').hidden);
    assert.equal(await page.getAttribute('.ve-chapter-list a[href="#ch-7"]', 'aria-current'), 'page');

    // The old anchors land on the chapter that holds them, and a claim link opens its block.
    const lands = { merge: 'ch-0', story: 'ch-0', loop: 'ch-2', changed: 'ch-3', unclaimed: 'ch-3', verifiers: 'ch-4', checks: 'ch-5', exercises: 'ch-6', promises: 'ch-7', glossary: 'ch-8', 'promise-p4': 'ch-7', 'claim-c01': 'ch-7', 'claim-c09': 'ch-7' };
    for (const [anchor, chapter] of Object.entries(lands)) {
      await page.goto(`${url}#${anchor}`, { waitUntil: 'load' });
      await page.waitForFunction((c) => document.getElementById(c) && !document.getElementById(c).hidden, chapter);
      assert.deepEqual(await visibleChapters(page), [chapter], `#${anchor}`);
      if (anchor.startsWith('claim-') || anchor.startsWith('promise-')) await page.waitForFunction((a) => document.getElementById(a)?.closest('details')?.open, anchor);
    }
    await page.waitForFunction(() => document.getElementById('claim-c02').open);

    // Read as one page: every chapter in sequence; the choice stays after a reload.
    await page.click('.ve-read-mode');
    await page.waitForSelector('main[data-ve-paged="one"]');
    assert.equal((await visibleChapters(page)).length, 10);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('main[data-ve-paged="one"]');
    await page.click('.ve-read-mode');
    await page.waitForSelector('main[data-ve-paged="pages"]');

    // The stepper: one step at a time, Next shows the next.
    await page.goto(`${url}#ch-2`, { waitUntil: 'load' });
    await page.waitForSelector('[data-ve-stepping]');
    assert.equal(await page.locator('.ve-step:visible').count(), 1);
    await page.click('[data-ve-step-next]');
    assert.equal(await page.getAttribute('.ve-step:visible', 'id'), 'loop-step-2');
    assert.equal(await page.textContent('.ve-stepper-count'), 'Step 2 of 3');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('guided review: the checklist order, the calls in local storage, the export, each claim once, and the questions', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    // The export only copies: catch what it writes to the clipboard.
    await context.addInitScript(() => {
      window.__copied = [];
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text) => { window.__copied.push(text); } }, configurable: true });
    });
    const page = await context.newPage();
    const sent = [];
    page.on('request', (r) => { if (r.method() !== 'GET') sent.push(`${r.method()} ${r.url()}`); });
    await page.goto(pathToFileURL(trust.html).href + '#ch-7', { waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('ch-7').hidden);
    const derived = derivedOf(trust.dir);

    // The order is derive.py's: each blocker, then each risk to accept.
    const want = [...(derived.merge.form === 'not-ready' ? derived.merge.items : []), ...derived.merge.accept].map((i) => i.label.toLowerCase());
    const got = await page.$$eval('[data-ve-review-item] .ve-review-label', (labels) => labels.map((l) => l.textContent.toLowerCase()));
    assert.deepEqual(got, want);
    assert.match(await page.textContent('#merge'), new RegExp(`${want.length} things to review`));

    // Each claim's full detail shows exactly once; every other place shows its row.
    for (const c of trust.map.claims) {
      assert.equal(await page.locator(`[id="claim-${c.id.toLowerCase()}"]`).count(), 1, c.id);
      assert.equal(await page.locator(`[id="claim-${c.id.toLowerCase()}"] [data-ve-trust="claim"]`).count() - await page.locator(`[id="claim-${c.id.toLowerCase()}"] details[id^="claim-"] [data-ve-trust="claim"]`).count(), 1, `${c.id} has one body`);
    }
    assert.equal(await page.locator('[data-ve-trust="claim"]').count(), trust.map.claims.length);

    // A call and a note: stored in localStorage under the PR head and the trust-map hash, kept after a reload.
    const first = page.locator('[data-ve-review-item]').first();
    await first.locator('summary .ve-disclosure-label').click();
    await first.getByLabel('Needs a fix').check();
    await first.locator('textarea').fill('Add the missing fee test.');
    const sha = createHash('sha256').update(readFileSync(path.join(trust.dir, 'trust-map.json'))).digest('hex');
    const key = `understando-review:${trust.map.head}:${sha}`;
    const stored = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), key));
    const firstKey = await first.getAttribute('data-ve-review-item');
    assert.deepEqual(stored.calls[firstKey], { call: 'fix', note: 'Add the missing fee test.' });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('[data-ve-reviewed]')?.textContent.startsWith('1 of'));
    assert.equal(await page.locator('[data-ve-call-badge="fix"]').count(), 1);

    // Export: Markdown for a PR comment, copied, never sent.
    await page.locator('#ch-7 [data-ve-export]').click();
    const copied = await page.evaluate(() => window.__copied.at(-1));
    assert.match(copied, /^## My review of PR #\d+: Refuse overdrafts in the wallet\n/);
    assert.match(copied, /### Needs a fix \(1\)\n\n- \*\*Correct fees\*\* \(blocks the merge\): .+\n  - Note: Add the missing fee test\./);
    assert.match(copied, new RegExp(`### Not reviewed yet \\(${want.length - 1}\\)`));
    assert.deepEqual(sent, []);

    // The questions come from the derived data: the weakest claim of a weak promise, a bar, a missed check.
    await page.goto(pathToFileURL(trust.html).href + '#ch-6', { waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('ch-6').hidden);
    const q = page.locator('[data-ve-question="q-weakest"]');
    const row = derived.promises.find((p) => !['Formal', 'Proven'].includes(p.strength) && p.claims.length > 1 && p.claims.filter((c) => derived.claims[c].strength === p.strength).length === 1);
    const promise = trust.map.promises.find((p) => p.id === row.id);
    const weakest = trust.map.claims.find((c) => c.id === row.claims[0]);
    assert.match(await q.locator('h3').textContent(), new RegExp(`"${promise.label}" is ${row.strength}`));
    await q.getByRole('button', { name: weakest.name, exact: false }).first().click();
    assert.match(await q.locator('[data-ve-why]').textContent(), /^Right\./);
    const bar = page.locator('[data-ve-question="q-bar"]');
    const askedName = /"(.+?)"/.exec(await bar.locator('h3').textContent())?.[1];
    const asked = trust.map.claims.find((c) => c.name === askedName);
    const met = derived.claims[asked.id].bar.met;
    await bar.getByRole('button', { name: 'Yes, it meets its bar' }).click();
    assert.match(await bar.locator('[data-ve-why]').textContent(), met ? /^Right\./ : /^Not quite: the answer is No, it is below its bar\./);
    assert.equal(await bar.locator('[data-ve-why] a').first().getAttribute('href'), `#claim-${asked.id.toLowerCase()}`);
  } finally {
    await context.close();
  }
});

test('guided review: the chapters of the change, the flags, Reviewed, the typed diagram, the full diff and the checks before you approve', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    const url = pathToFileURL(trust.html).href;
    await page.goto(url + '#ch-3', { waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('ch-3').hidden);
    const derived = derivedOf(trust.dir);
    const explain = JSON.parse(readFileSync(path.join(trust.dir, 'explain.json'), 'utf8'));

    // The chapters come in derive.py's reading order, each non-test file in exactly one; the tests are no chapter: they show as checks.
    const chapters = await page.$$eval('[data-ve-change-chapter]', (s) => s.map((x) => x.dataset.veChangeChapter));
    assert.deepEqual(chapters, derived.spine.groups.filter((g) => g.tier !== 'tests').map((g) => g.id));
    assert.deepEqual(derived.spine.unassigned, []);
    for (const f of Object.keys(JSON.parse(readFileSync(path.join(trust.dir, 'refs.resolved.json'), 'utf8')).diff.files)) {
      assert.equal(await page.locator(`#ch-3 [data-ve-spine-file="${f}"]`).count(), f.startsWith('tests/') ? 0 : 1, f);
    }
    assert.match(await page.textContent('[data-ve-spine-tests]'), /2 test files\. They show as the checks they provide/);
    // Each chapter of the explain step explains its idea in one or two paragraphs.
    for (const c of explain.change.chapters) assert.equal(await page.locator(`[data-ve-change-chapter="${c.id}"] .ve-change-explain`).count(), c.explain.length);

    // "Look closely": each derived flag shows once in its file, pinned to its line, with its level and its trigger.
    const flags = derived.spine.groups.flatMap((g) => g.files.flatMap((f) => f.flags));
    assert.ok(flags.length, 'the fixture has a check that cannot fail, so it has a flag');
    for (const x of flags) {
      const block = page.locator(`[data-ve-spine-file="${x.path}"] .ve-flag-block`);
      assert.match(await block.first().textContent(), new RegExp(`${x.level === 'risk' ? 'Risk' : x.level === 'question' ? 'Question' : 'Nit'}.*When:`));
    }

    // Reviewed: a box per chapter, stored with the calls, counted in the chapter progress.
    await page.locator('[data-ve-chapter-reviewed="refuse"] input').check();
    await page.waitForFunction(() => document.querySelector('[data-ve-chapter-progress]')?.textContent.startsWith('1 of'));
    const sha = createHash('sha256').update(readFileSync(path.join(trust.dir, 'trust-map.json'))).digest('hex');
    const stored = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), `understando-review:${trust.map.head}:${sha}`));
    assert.deepEqual(stored.calls['chapter:refuse'], { reviewed: true });

    // The typed diagram: After shows the steps the PR adds, Before hides them; an actor links to its chapter.
    const seq = page.locator('[data-ve-typed="sequence"]').first();
    const added = explain.diagrams.withdrawal.steps.filter((x) => x.status === 'added').length;
    const all = explain.diagrams.withdrawal.steps.filter((x) => x.from).length;
    assert.equal(await seq.locator('.ve-dd-msg').count(), all);
    await seq.getByLabel('Before the PR').check();
    assert.equal(await seq.locator('.ve-dd-msg').count(), all - added);
    assert.equal(await seq.locator('svg a').first().getAttribute('href'), '#spine-refuse');

    // The checks: verifiers, not tests. Each claim lists its checks as check rows; each test file shows as the checks it provides.
    await page.goto(url + '#ch-5', { waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('ch-5').hidden);
    for (const c of trust.map.claims) {
      const n = derived.claims[c.id].checks.filter((x) => x.kind !== 'none').length;
      assert.equal(await page.locator(`#ch-5 [data-ve-checks-promise] .ve-checks-claim:has([data-ve-claim-row="${c.id.toLowerCase()}"]) > .ve-check-rows > [data-ve-check-row]`).count(), n, c.id);
    }
    assert.equal(await page.locator('#ch-5 [data-ve-check-row="v02"][data-ve-result="cannot-fail"]').count() > 0, true);
    assert.match(await page.textContent('#ch-5'), new RegExp(derived.tests.summary.replace('.', '\\.')));
    await page.locator('#ch-5 summary:has-text("Show the checks by test file")').click();
    assert.match(await page.textContent('#ch-5 .ve-checks-file'), /tests\/test_core\.py provides 2 checks/);
    // A check row keeps its test and its planted bug behind it until the reviewer opens it.
    const row = page.locator('#ch-5 [data-ve-check-row="v02"]').first();
    assert.equal(await row.locator('.ve-disclosure-body [data-ve-diff-block]').count(), 0);
    await row.locator('summary').first().click();
    await page.waitForFunction(() => document.querySelector('#ch-5 [data-ve-check-row="v02"] .ve-disclosure-body [data-ve-diff-block]'));

    // The full diff: every changed file, in GitHub's order, each with its chapter.
    await page.goto(url + '#ch-9', { waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('ch-9').hidden);
    const order = await page.$$eval('[data-ve-full-diff] > li .ve-file-path', (c) => c.map((x) => x.textContent));
    assert.equal(order.length, derived.spine.files);
    assert.deepEqual(order, [...order].sort());

    // Before you approve: each check is a command, lines to read or real inputs, never generic.
    await page.goto(url + '#verdict-approve', { waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('ch-8').hidden);
    const v = trust.map.verifiers.find((x) => x.id === explain.verdict.checks[0].check);
    assert.match(await page.textContent('[data-ve-approve-item="0"]'), new RegExp(v.command.argv.join(' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(await page.textContent('[data-ve-approve-item="1"]'), /Inputs:/);
  } finally {
    await context.close();
  }
});

for (const scheme of ['light', 'dark']) {
  test(`guided review at 375px in ${scheme} mode: AA contrast of the review marks, no sideways scroll`, async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: scheme });
    try {
      const page = await context.newPage();
      await page.goto(pathToFileURL(trust.html).href, { waitUntil: 'load' });
      await page.waitForSelector('main[data-ve-paged="pages"]');
      await page.evaluate(() => { localStorage.setItem('ve-read-mode:' + location.pathname, 'one'); });
      await page.reload({ waitUntil: 'load' });
      await page.waitForSelector('main[data-ve-paged="one"]');
      await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
      // Buttons ease their colour for 160ms after the theme applies: read the settled colours.
      await page.waitForTimeout(400);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'the page scrolls sideways');
      for (const selector of ['.ve-claim-row-note', '.ve-file-row-status', '.ve-review-why', '.ve-review-label', '.ve-bar-card-state', '.ve-churn span', '.ve-review-todo', '.ve-question-option', '.ve-result-card-state', '.ve-pager-key', '.ve-timeline-tag', '.ve-check-row-result', '.ve-check-row-kind', '.ve-check-row-name', '.ve-flag-when', '.ve-chapter-here', '.ve-spine-meta', '.ve-typed-key li']) {
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

test('the trust-map PR-body section comes from the same rules as the page', async () => {
  const old = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    // The old shape still exports and renders each claim once, from the same derived block.
    const page = await old.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(pathToFileURL(trust.oldHtml).href + '#claim-c01', { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('claim-c01')?.open);
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('[data-ve-trust="claim"]').count(), trust.map.claims.length);
  } finally {
    await old.close();
  }
  const section = path.join(trust.dir, 'pr-section.md');
  const result = spawnSync(process.execPath, ['scripts/ve-mdx/trust-map.mjs', 'pr-section', '--map', path.join(trust.dir, 'trust-map.json'), '--refs', path.join(trust.dir, 'refs.resolved.json'), '--explain', path.join(trust.dir, 'explain.json'), '--out', section], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const body = readFileSync(section, 'utf8');
  assert.match(body, /\*\*Merge verdict: Not ready\.\*\*/);
  assert.match(body, /\| Claim \| Surface \| Bar \| Strength \| Checks \| Weakest check \|/);
  assert.match(body, /No overdraft: Asserted\. Its 3 claims: 1 Formal, 1 Proven, 1 Asserted\./);
  assert.doesNotMatch(body, /\b(red|green)\b/);
  assert.doesNotMatch(body, /\btier \d/);
});

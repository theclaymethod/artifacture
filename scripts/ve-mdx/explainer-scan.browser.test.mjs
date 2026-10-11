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

test('trust-map explainer: pre-rendered without JavaScript, hydrated with it, and the export checks', async () => {
  // The export fails on bad data and on an ID in the narrative prose.
  assert.notEqual(trust.noAction.status, 0);
  assert.match(trust.noAction.out, /needs a reviewer_action/);
  assert.notEqual(trust.idInProse.status, 0);
  assert.match(trust.idInProse.out, /the ID K01 is in the narrative prose/);

  // The page names the trust map that it was built from.
  const html = readFileSync(trust.html, 'utf8');
  assert.ok(html.includes(`<meta name="ve-trust-map-head" content="${trust.map.head}">`));
  const sha = createHash('sha256').update(readFileSync(path.join(trust.dir, 'trust-map.json'))).digest('hex');
  assert.ok(html.includes(`<meta name="ve-trust-map-sha256" content="${sha}">`));

  // Without JavaScript: the merge verdict, the promises, the claims and the verify result show, and a deep link shows its claim.
  const off = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
  try {
    const page = await off.newPage();
    await page.goto(pathToFileURL(trust.html).href + '#claim-c02', { waitUntil: 'load' });
    const text = await page.innerText('main');
    for (const want of ['Can you merge it?', trust.map.promises[0].label, 'checks caught their planted bug', 'changed file']) assert.ok(text.includes(want), `no-JS text lacks ${want}`);
    assert.ok(await page.$eval('#claim-c02 .ve-disclosure-body', (body) => body.getBoundingClientRect().height > 0), 'the no-JS deep link does not show its claim');
  } finally {
    await off.close();
  }

  // With JavaScript: the page hydrates without an error, and a deep link opens the claim and its promise.
  const on = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await on.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(pathToFileURL(trust.html).href + '#claim-c02', { waitUntil: 'load' });
    await page.waitForFunction(() => { const c = document.getElementById('claim-c02'); return c?.open && c.parentElement.closest('details').open; });
    assert.deepEqual(errors, []);
    const derived = JSON.parse(readFileSync(path.join(trust.dir, 'refs.resolved.json'), 'utf8')).derived;
    assert.match(await page.textContent('#verifiers [data-ve-trust="verifiers"] > :first-child'), new RegExp(`\\d+ of ${derived.verify.ran} checks caught their planted bug`));
    assert.ok(await page.$('[data-ve-weak-check] [data-ve-action]'), 'a weak check has no action');

    // A claim card: the derived check summary with its count, then the weakest check with an action, then the checks, collapsed.
    const claim = page.locator('#claim-c01');
    assert.equal(await claim.locator('[data-ve-checks]').textContent(), derived.claims.C01.summary);
    assert.match(derived.claims.C01.summary, /^2 checks: /);
    assert.ok((await claim.locator('[data-ve-weakest] [data-ve-action]').textContent()).trim(), 'the weakest check has no action');
    assert.equal(await page.locator('#claim-c02 [data-ve-weakest] [data-ve-action]').textContent(), derived.claims.C02.weakest.action);
    assert.ok(await claim.locator('summary:has-text("Show the 2 checks")').count());
    // "What we broke" is the full derived sentence, never cut.
    assert.equal(await page.locator('[data-ve-weak-check] dd').first().textContent(), derived.verify.weak[0].broke);
    assert.equal(await page.locator('text=...').count(), 0);

    // An old claim id finds the claim that joins it: the deep link opens that claim and its promise.
    await page.goto(pathToFileURL(trust.html).href + '#claim-c09', { waitUntil: 'load' });
    await page.waitForFunction(() => { const c = document.getElementById('claim-c02'); return c?.open && c.parentElement.closest('details').open && document.getElementById('claim-c09'); });
    assert.ok(await page.locator('#claim-c02 summary:has-text("Show the 2 statements that this claim joins")').count());
    assert.deepEqual(errors, []);
  } finally {
    await on.close();
  }

  // The old shape still exports and renders the claim cards, from the same derived block.
  const old = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await old.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(pathToFileURL(trust.oldHtml).href + '#claim-c01', { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('claim-c01')?.open);
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('[data-ve-trust="claim"]').count(), trust.map.claims.length);
    assert.match(await page.textContent('#claim-c01 [data-ve-checks]'), /^2 checks: /);
    assert.match(await page.textContent('#verifiers [data-ve-trust="verifiers"] > :first-child'), /\d+ of \d+ checks caught their planted bug/);
  } finally {
    await old.close();
  }

  // The PR-body section comes from the same rules as the page.
  const section = path.join(trust.dir, 'pr-section.md');
  const result = spawnSync(process.execPath, ['scripts/ve-mdx/trust-map.mjs', 'pr-section', '--map', path.join(trust.dir, 'trust-map.json'), '--refs', path.join(trust.dir, 'refs.resolved.json'), '--explain', path.join(trust.dir, 'explain.json'), '--out', section], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const body = readFileSync(section, 'utf8');
  assert.match(body, /\*\*Merge verdict: Not ready\.\*\*/);
  assert.match(body, /\| Claim \| Surface \| Bar \| Strength \| Checks \| Weakest check \|/);
  assert.match(body, /No overdraft: Asserted\. Its 3 claims: 1 Formal, 1 Proven, 1 Asserted\./);
  assert.doesNotMatch(body, /\b(red|green)\b/);
});

// End-to-end check of the scan-first explainer pieces: export the review-scan example through the
// public exporter, then drive the real page in Chromium (chapter rail, DataTable, diagram key,
// highlighted code and diffs) in light and dark mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
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
function exportTrustCase(dir, change, args = []) {
  cpSync(TRUST_FIXTURE, dir, { recursive: true });
  change(dir);
  return run(['scripts/ve-mdx/export.mjs', path.join(dir, 'explainer.mdx'), '--out', path.join(dir, 'explainer.html'), ...args]);
}

/** A copy of the fixture MDX with each [from, to] replaced. */
const plantInMdx = (...pairs) => (dir) => {
  const mdx = path.join(dir, 'explainer.mdx');
  let text = readFileSync(mdx, 'utf8');
  for (const [from, to] of pairs) {
    assert.ok(text.includes(from), `the fixture MDX lacks ${from}`);
    text = text.replace(from, to);
  }
  writeFileSync(mdx, text);
};

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

// The smallest export that the components take: no promises, no bars, no check rows, no test
// counts, no worked examples and no diff. Only invariants, claims, checks, controls, their results
// and the code refs.
const MINIMAL_MDX = `import { CodeRef, EvidenceGuide, ExplainerShell, Glossary, Invariants, Section, VerifierView } from 'visual-explainer-mdx/components';
import trust from './trust-map.json';
import refs from './refs.resolved.json';

<ExplainerShell title="The wallet: what is verified" paged appearance="auto" reviewTools={false}>

<Section id="ch-0" title="Which rules must always hold?" navLabel="The invariants">

<Invariants data={trust} />

<CodeRef refs={refs} path="wallet/core.py" symbol="withdraw" />

</Section>

<Section id="ch-1" title="How do you read the evidence?" navLabel="The evidence">

<EvidenceGuide data={trust} refs={refs} checks="#ch-2" />

</Section>

<Section id="ch-2" title="Which checks back each claim?" navLabel="The claims">

<VerifierView data={trust} refs={refs} />

</Section>

<Section id="ch-3" title="The words on this page" navLabel="Glossary">

<Glossary data={trust} only="used" />

</Section>

</ExplainerShell>
`;

function minimalShape(dir) {
  const read = (file) => JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
  const data = read('trust-map.json');
  delete data.promises;
  writeFileSync(path.join(dir, 'trust-map.json'), JSON.stringify(data));
  const refs = read('refs.resolved.json');
  for (const key of ['promises', 'bars', 'checks', 'tests']) delete refs.derived[key];
  for (const key of ['by_promise', 'tiers']) delete refs.derived.verify[key];
  delete refs.examples;
  delete refs.diff;
  writeFileSync(path.join(dir, 'refs.resolved.json'), JSON.stringify(refs));
  writeFileSync(path.join(dir, 'explainer.mdx'), MINIMAL_MDX);
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
  const minimalDir = path.join(workDir, 'minimal');
  const [scan, good, badCheck, idInProse, oldShape, minimal, slogan, repeated, ste, noLint, enumeration, glued, plainTerm] = await Promise.all([
    run(['scripts/ve-mdx/export.mjs', SOURCE, '--out', artifact]),
    // One claim joins an old claim: its old id C09 must still find it.
    exportTrustCase(trustDir, (dir) => {
      const data = map(dir);
      const c = data.claims.find((x) => x.id === 'C02');
      c.legacy_ids = ['C02', 'C09'];
      c.parts = [{ id: 'C02', text: 'The new balance is an int.' }, { id: 'C09', text: 'The new balance is the old balance less the amount.' }];
      writeFileSync(path.join(dir, 'trust-map.json'), JSON.stringify(data));
    }),
    exportTrustCase(path.join(workDir, 'bad-check'), (dir) => {
      const data = map(dir);
      data.claims.find((x) => x.id === 'C01').checks.push('V99');
      writeFileSync(path.join(dir, 'trust-map.json'), JSON.stringify(data));
    }),
    exportTrustCase(path.join(workDir, 'id-in-prose'), plantInMdx(['A planted bug proves the overdraft rule,', 'Control K01 proves the overdraft rule,'])),
    exportTrustCase(oldDir, (dir) => cpSync(OLD_SHAPE_MAP, path.join(dir, 'trust-map.json'))),
    exportTrustCase(minimalDir, minimalShape),
    // Copy: a reassurance line and a label run-in; a sentence of the narrative said twice; a hard STE violation; no lint.
    exportTrustCase(path.join(workDir, 'slogan'), plantInMdx(
      ['a proof checks it for every balance.', 'a proof checks it for every balance. Nothing is sent.'],
      ['- The fixture is small', '- **In short.** The fixture is small'],
    )),
    exportTrustCase(path.join(workDir, 'repeated'), plantInMdx(['A caller asks the wallet for an amount, and the wallet pays it or refuses it.', 'The wallet now refuses an overdraft. A caller asks the wallet for an amount, and the wallet pays it or refuses it.'])),
    exportTrustCase(path.join(workDir, 'ste'), plantInMdx(['The fixture is small, so each chapter is short.', 'The fixture is small; each chapter is short.'])),
    exportTrustCase(path.join(workDir, 'no-lint'), () => {}, ['--ste-lint', path.join(workDir, 'no-such-lint.py')]),
    // Raw enumerations: two titles of the page joined by a bare word, and an opener that holds only a long list.
    exportTrustCase(path.join(workDir, 'enumeration'), plantInMdx(
      ['- The fixture is small, so each chapter is short.', '- The marks on this page explains The words on this page: 2 terms.'],
      ['<h3 className="ve-subsection-title" id="limits-glossary">', `<Disclosure summary="Show all 11 files">\n\n${Array.from({ length: 11 }, (_, i) => `- file ${i + 1}`).join('\n')}\n\n</Disclosure>\n\n<h3 className="ve-subsection-title" id="limits-glossary">`],
    )),
    // Fields glued into one line: a check name said twice, and a colon-joined list of fields.
    exportTrustCase(path.join(workDir, 'glued'), (dir) => {
      const data = map(dir);
      const v = data.verifiers[0];
      v.description = `${v.name}. ${v.kind} check, a tool check, proven: ${v.name}: a ${v.kind} check.`;
      writeFileSync(path.join(dir, 'trust-map.json'), JSON.stringify(data));
    }),
    // A hand-written mark on an everyday word.
    exportTrustCase(path.join(workDir, 'plain-term'), plantInMdx(
      ['Glossary, Glossed,', 'Glossary, Glossed, Term,'],
      ['a proof checks it for every balance.', 'a proof checks it for every balance in the <Term definition="the files of one document">draft</Term>.'],
    )),
  ]);
  assert.equal(scan.status, 0, scan.out);
  assert.equal(good.status, 0, good.out);
  assert.equal(oldShape.status, 0, oldShape.out);
  assert.equal(minimal.status, 0, minimal.out);
  trust = {
    dir: trustDir, html: path.join(trustDir, 'explainer.html'), oldHtml: path.join(oldDir, 'explainer.html'), minimalHtml: path.join(minimalDir, 'explainer.html'),
    map: map(trustDir), badCheck, idInProse, slogan, repeated, ste, noLint, enumeration, glued, plainTerm,
  };
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
    // Every jump is instant, also when the reader allows motion.
    assert.equal(await motion.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
    await motion.close();
  } finally {
    await context.close();
  }
});

// ---- The verification explainer: the trust-map explainer as chapters ---------------------------

const derivedOf = (dir) => JSON.parse(readFileSync(path.join(dir, 'refs.resolved.json'), 'utf8')).derived;
const visibleChapters = (page) => page.$$eval('section.ve-section[id^="ch-"]', (s) => s.filter((x) => !x.hidden && x.getBoundingClientRect().height > 0).map((x) => x.id));
const CHAPTERS = ['ch-0', 'ch-1', 'ch-2', 'ch-3', 'ch-4', 'ch-5'];

test('verification explainer: the export checks (data, IDs, copy, STE), the stamp, and the page without JavaScript', async () => {
  // The export fails on bad data and on an ID in the narrative prose.
  assert.notEqual(trust.badCheck.status, 0);
  assert.match(trust.badCheck.out, /claim C01 lists the check V99, which the map does not have/);
  assert.notEqual(trust.idInProse.status, 0);
  assert.match(trust.idInProse.out, /the ID K01 is in the narrative prose/);
  // The export fails on copy that reassures, labels, repeats itself or breaks a hard STE rule.
  assert.notEqual(trust.slogan.status, 0);
  assert.match(trust.slogan.out, /ch-0: the slogan "Nothing is sent\." reassures or labels instead of informing/);
  assert.match(trust.slogan.out, /ch-5: the run-in label "In short\." labels the text/);
  assert.notEqual(trust.repeated.status, 0);
  assert.match(trust.repeated.out, /the sentence "The wallet now refuses an overdraft\." shows 2 times \(ch-0, ch-1\)/);
  assert.notEqual(trust.ste.status, 0);
  assert.match(trust.ste.out, /ch-5: STE semicolon: .* in "The fixture is small; each chapter is short\."/);
  assert.doesNotMatch(trust.ste.out, /slogan|shows \d+ times/);
  // The export fails on mechanical text that answers no reader question: a title join and a raw enumeration.
  assert.notEqual(trust.enumeration.status, 0);
  assert.match(trust.enumeration.out, /ch-5: a block joins two titles with a bare word, for example "The marks on this page" explains "The words on this page"/);
  assert.match(trust.enumeration.out, /ch-5: the opener "Show all 11 files" holds only a list of 11 items, with no explanation/);
  // The export fails on fields glued into one line: a name said twice, and a colon-joined list of fields.
  assert.notEqual(trust.glued.status, 0);
  assert.match(trust.glued.out, new RegExp(`a sentence says "${trust.map.verifiers[0].name}" twice, as if fields were glued together`));
  assert.match(trust.glued.out, /a sentence joins fields with colons/);
  assert.notEqual(trust.noLint.status, 0);
  assert.match(trust.noLint.out, /the STE lint is not at .*no-such-lint\.py\. .*--ste-lint off/);
  // A hand-written mark on an everyday word fails the export.
  assert.notEqual(trust.plainTerm.status, 0);
  assert.match(trust.plainTerm.out, /the everyday words draft are marked as glossary terms/);

  const html = readFileSync(trust.html, 'utf8');
  assert.ok(html.includes(`<meta name="ve-trust-map-head" content="${trust.map.head}">`));
  const sha = createHash('sha256').update(readFileSync(path.join(trust.dir, 'trust-map.json'))).digest('hex');
  assert.ok(html.includes(`<meta name="ve-trust-map-sha256" content="${sha}">`));
  // No part of the review flow is left on the page.
  assert.doesNotMatch(html, /data-merge-verdict|data-ve-review-(item|call|progress|export)|data-ve-chapter-mark|understando-review|Ready if you accept|Blocks the merge/);

  // Without JavaScript: every chapter renders in sequence and reads; a deep link shows its claim.
  const off = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
  try {
    const page = await off.newPage();
    await page.goto(pathToFileURL(trust.html).href + '#claim-c02', { waitUntil: 'load' });
    assert.deepEqual(await visibleChapters(page), CHAPTERS);
    const text = await page.innerText('main');
    for (const want of [trust.map.promises[0].label, trust.map.invariants[0].text, 'checks caught their planted bug', 'wallet/core.py']) assert.ok(text.includes(want), `no-JS text lacks ${want}`);
    assert.ok(await page.$eval('#claim-c02 > .ve-disclosure-body', (body) => body.getBoundingClientRect().height > 0), 'the no-JS deep link does not show its claim');
    // Each step of the run shows, with no step buttons.
    assert.equal(await page.locator('.ve-step').count(), 3);
    assert.equal(await page.locator('[data-ve-step-next]').count(), 0);
    // The code of a step, highlighted at export time, with its diff marks from the resolved refs: the
    // removed base line 1 inline, the line that replaces it, the added lines, and neutral context.
    const rows = (step) => page.$$eval(`#${step} [data-ve-code-lines] .line`, (lines) => lines.map((l) => [l.dataset.veLine, l.querySelector('.ve-line-no').textContent, l.querySelector('.ve-line-sign').textContent]));
    assert.deepEqual(await rows('loop-step-2'), [['remove', '1', '-'], ['mod', '1', '~'], ['add', '2', '+'], ['add', '3', '+'], ['add', '4', '+'], ['add', '5', '+']]);
    assert.deepEqual((await rows('loop-step-1')).map(([kind, , sign]) => kind + sign), ['same ', 'add+', 'add+', 'add+', 'add+', 'add+', 'add+', 'same ']);
    assert.ok(await page.locator('#loop-step-2 [data-ve-line="remove"] span[style*="--shiki-token"]').count() > 0, 'the removed line is not highlighted');
  } finally {
    await off.close();
  }
});

test('verification explainer: chapters as pages, the rail, the pager, one page, the anchors and the stepper', async () => {
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
    assert.equal(await page.textContent('.ve-chapter-list a[aria-current="page"] .ve-chapter-label'), 'The promise');

    // Next and previous, with the rail marker following.
    await page.click('#ch-0 [data-ve-pager-next]');
    await page.waitForFunction(() => location.hash === '#ch-1' && !document.getElementById('ch-1').hidden);
    assert.deepEqual(await visibleChapters(page), ['ch-1']);
    assert.match(await page.textContent('.ve-chapter-list a[aria-current="page"]'), /How it works/);
    await page.click('#ch-1 [data-ve-pager-prev]');
    await page.waitForFunction(() => !document.getElementById('ch-0').hidden);
    await page.click('.ve-chapter-list a[href="#ch-4"]');
    await page.waitForFunction(() => !document.getElementById('ch-4').hidden);
    assert.equal(await page.getAttribute('.ve-chapter-list a[href="#ch-4"]', 'aria-current'), 'page');

    // The old anchors land on the chapter that holds them, and a claim link opens its block.
    const lands = { story: 'ch-0', why: 'ch-0', loop: 'ch-1', invariants: 'ch-2', verifiers: 'ch-3', checks: 'ch-4', promises: 'ch-4', glossary: 'ch-5', 'promise-p4': 'ch-4', 'claim-c01': 'ch-4', 'claim-c09': 'ch-4' };
    for (const [anchor, chapter] of Object.entries(lands)) {
      await page.goto(`${url}#${anchor}`, { waitUntil: 'load' });
      await page.waitForFunction((c) => document.getElementById(c) && !document.getElementById(c).hidden, chapter);
      assert.deepEqual(await visibleChapters(page), [chapter], `#${anchor}`);
      if (anchor.startsWith('claim-')) await page.waitForFunction((a) => document.getElementById(a)?.closest('details')?.open, anchor);
    }
    await page.waitForFunction(() => document.getElementById('claim-c02').open);

    // Read as one page: every chapter in sequence; the choice stays after a reload.
    await page.click('.ve-read-mode button[aria-pressed="false"]');
    await page.waitForSelector('main[data-ve-paged="one"]');
    assert.equal((await visibleChapters(page)).length, CHAPTERS.length);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('main[data-ve-paged="one"]');
    await page.click('.ve-read-mode button[aria-pressed="false"]');
    await page.waitForSelector('main[data-ve-paged="pages"]');

    // The stepper: one step at a time, Next shows the next.
    await page.goto(`${url}#ch-1`, { waitUntil: 'load' });
    await page.waitForSelector('[data-ve-stepping]');
    assert.equal(await page.locator('.ve-step:visible').count(), 1);
    await page.click('[data-ve-step-next]');
    assert.equal(await page.getAttribute('.ve-step:visible', 'id'), 'loop-step-2');
    assert.equal(await page.textContent('.ve-stepper-count'), 'Step 2 of 3');
    // After hydration the step keeps its highlighted code and its diff tints.
    await page.click('#loop-step-2 summary');
    const tint = (kind) => page.$eval(`#loop-step-2 [data-ve-line="${kind}"]`, (l) => getComputedStyle(l).backgroundColor);
    assert.ok(await page.locator('#loop-step-2 .ve-code-shiki span[style*="--shiki-token"]:visible').count() > 0, 'the step code is not highlighted');
    assert.notEqual(await tint('add'), await tint('remove'));
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('verification explainer: invariants, each claim once with its checks, planted bugs and proof, and the typed diagram', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    const sent = [];
    page.on('request', (r) => { if (r.method() !== 'GET') sent.push(`${r.method()} ${r.url()}`); });
    const url = pathToFileURL(trust.html).href;
    const derived = derivedOf(trust.dir);
    const explain = JSON.parse(readFileSync(path.join(trust.dir, 'explain.json'), 'utf8'));

    // The invariants: the accepted rule and the proposed one, each in plain words.
    await page.goto(url + '#ch-2', { waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('ch-2').hidden);
    const rules = await page.$$eval('#ch-2 [data-ve-trust="invariants"] li', (li) => li.map((x) => x.textContent));
    assert.deepEqual(rules, ['Accepted by the user: The balance is never below zero.', 'Proposed, not accepted: A refused withdrawal leaves the balance as it was.']);

    // The claims, by promise in derive.py's order (weakest first), each one full detail once.
    await page.goto(url + '#ch-4', { waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('ch-4').hidden);
    assert.deepEqual(await page.$$eval('#ch-4 [data-ve-checks-promise]', (s) => s.map((x) => x.dataset.veChecksPromise)), derived.promises.map((p) => p.id.toLowerCase()));
    for (const p of derived.promises) {
      assert.deepEqual(await page.$$eval(`#ch-4 [data-ve-checks-promise="${p.id.toLowerCase()}"] .ve-claim-details > details`, (d) => d.map((x) => x.id)), p.claims.map((c) => `claim-${c.toLowerCase()}`), p.id);
    }
    for (const c of trust.map.claims) {
      const id = `claim-${c.id.toLowerCase()}`;
      assert.equal(await page.locator(`[id="${id}"]`).count(), 1, c.id);
      // Each tool check of the claim is a check row in its detail; a claim with no tool says so.
      const tools = derived.claims[c.id].checks.filter((x) => x.kind !== 'none').length;
      assert.equal(await page.locator(`[id="${id}"] [data-ve-claim-checks] > [data-ve-check-row]`).count(), tools, c.id);
    }
    assert.equal(await page.locator('[data-ve-trust="claim"]').count(), trust.map.claims.length);
    assert.match(await page.textContent('#ch-4'), new RegExp(derived.tests.summary.replace('.', '\\.')));
    // The check that cannot fail, its planted bug as a real diff; the formal check with its conformance link and invariant.
    assert.equal(await page.locator('#claim-c02 [data-ve-check-row="v02"][data-ve-result="cannot-fail"] [data-ve-diff-block]').count() > 0, true);
    assert.match(await page.textContent('#claim-c08'), /Conformance link: /);
    assert.match(await page.textContent('#claim-c08'), /Accepted by the user: The balance is never below zero\./);
    // The worked examples of a claim show in its detail, with a link to each.
    const brief = page.locator('#claim-c01 [data-ve-example-for]');
    assert.equal(await brief.getAttribute('data-ve-example-for'), 'overdraft-before-after one-withdrawal');
    assert.deepEqual(await brief.locator('.ve-example-brief-title a').evaluateAll((a) => a.map((x) => x.getAttribute('href'))), ['#example-overdraft-before-after', '#example-one-withdrawal']);

    // The typed diagram: After shows the steps the change adds, Before hides them; an actor links to its claim.
    await page.goto(url + '#ch-1', { waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('ch-1').hidden);
    const seq = page.locator('[data-ve-typed="sequence"]').first();
    const added = explain.diagrams.withdrawal.steps.filter((x) => x.status === 'added').length;
    const all = explain.diagrams.withdrawal.steps.filter((x) => x.from).length;
    assert.equal(await seq.locator('.ve-dd-msg').count(), all);
    await seq.getByLabel('Before the PR').check();
    assert.equal(await seq.locator('.ve-dd-msg').count(), all - added);
    assert.equal(await seq.locator('svg a').first().getAttribute('href'), '#claim-c01');
    // The page keeps nothing about the reader and sends nothing.
    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).filter((k) => !k.startsWith('ve-read-mode:'))), []);
    assert.deepEqual(sent, []);
  } finally {
    await context.close();
  }
});

// ---- Calm navigation: each jump instant and once, a clicked control keeps its place ----------

// Runs before the page's own script: records each programmatic scroll and each scroll position.
const SCROLL_WATCH = `(() => {
  const watch = { calls: [], moves: [], inner: 0 };
  window.__scrolls = watch;
  for (const [owner, name] of [[window, 'scrollTo'], [window, 'scroll'], [window, 'scrollBy'], [Element.prototype, 'scrollIntoView'], [Element.prototype, 'scrollTo'], [Element.prototype, 'scrollBy']]) {
    const original = owner[name];
    owner[name] = function (...args) { watch.calls.push(name); return original.apply(this, args); };
  }
  let last = 0;
  window.addEventListener('scroll', () => { if (window.scrollY !== last) watch.moves.push(Math.round(window.scrollY)); last = window.scrollY; }, { passive: true });
  document.addEventListener('scroll', (event) => { if (event.target !== document) watch.inner += 1; }, { capture: true, passive: true });
})();`;
const resetScrolls = (page) => page.evaluate(() => { const w = window.__scrolls; w.calls.length = 0; w.moves.length = 0; w.inner = 0; });
const scrolls = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__scrolls)));
const topOf = (page, selector) => page.$eval(selector, (element) => element.getBoundingClientRect().top);
const near = (actual, expected, message, slack = 2) => assert.ok(Math.abs(actual - expected) <= slack, `${message}: ${actual} is not ${expected}`);
// A click at the element's own place: Playwright's click would first scroll it into view.
async function clickInPlace(page, selector, index = 0) {
  const point = await page.$$eval(selector, (elements, i) => { const r = elements[i].getBoundingClientRect(); return { x: r.left + Math.min(24, r.width / 2), y: r.top + r.height / 2 }; }, index);
  await page.mouse.click(point.x, point.y);
}
// Put an element at a height on the screen, at once.
const placeAt = (page, selector, y, index = 0) => page.$$eval(selector, (elements, [i, at]) => window.scrollTo({ top: elements[i].getBoundingClientRect().top + window.scrollY - at, behavior: 'instant' }), [index, y]);

// The four runs share no state, so they run at the same time, each in its own browser context.
test('verification explainer: calm navigation at 1280px and 375px', { concurrency: true }, async (t) => {
  const runs = [];
  for (const [width, height] of [[1280, 900], [375, 812]]) {
  // The target lands under the sticky top bar (56px below 1200px wide) with 1rem to spare.
  const offset = width >= 1200 ? 16 : 72;

  runs.push(t.test(`verification explainer at ${width}px: Next, Previous, deep links and one page each land once, at once`, async () => {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference' });
    await context.addInitScript({ content: SCROLL_WATCH });
    try {
      const page = await context.newPage();
      const url = pathToFileURL(trust.html).href;
      await page.goto(url + '#ch-1', { waitUntil: 'load' });
      await page.waitForSelector('main[data-ve-live]');
      await page.waitForTimeout(300);
      // No smooth scrolling, even for a reader who allows motion.
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');

      // Next and Previous from the foot of a chapter: the chapter's top, in one instant scroll, and no second.
      for (const [from, to, rel] of [['ch-1', 'ch-2', 'next'], ['ch-1', 'ch-0', 'prev'], ['ch-3', 'ch-4', 'next']]) {
        await page.evaluate((f) => { if (location.hash !== `#${f}`) location.hash = f; }, from);
        await page.waitForTimeout(150);
        await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
        await page.waitForTimeout(100);
        await resetScrolls(page);
        await page.click(`#${from} [data-ve-pager-${rel}]`);
        await page.waitForTimeout(600);
        const watched = await scrolls(page);
        assert.deepEqual(watched.calls, ['scrollIntoView'], `${from} to ${to}: ${watched.calls}`);
        assert.deepEqual(watched.moves, [await page.evaluate(() => Math.round(window.scrollY))], `${from} to ${to} moved ${watched.moves}`);
        near(await topOf(page, `#${to}`), offset, `${to} top`);
      }

      // Previous and Next sit in the same place on every chapter, read to its foot.
      const places = { next: [], prev: [] };
      for (let i = 0; i < CHAPTERS.length; i += 1) {
        await page.evaluate((n) => { location.hash = `ch-${n}`; }, i);
        await page.waitForTimeout(150);
        await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
        for (const rel of ['next', 'prev']) {
          const link = await page.$(`#ch-${i} [data-ve-pager-${rel}]`);
          if (link) places[rel].push((await link.boundingBox()).y);
        }
      }
      for (const [rel, ys] of Object.entries(places)) {
        assert.equal(ys.length, CHAPTERS.length - 1, `${rel} links`);
        assert.ok(Math.max(...ys) - Math.min(...ys) <= 2, `${rel} sits at ${ys.map(Math.round)}`);
      }

      // A link inside the page to a claim in another chapter: once, at once, its block open.
      await page.evaluate(() => { location.hash = 'ch-1'; });
      await page.waitForTimeout(200);
      await resetScrolls(page);
      await page.evaluate(() => { location.hash = 'claim-c01'; });
      await page.waitForTimeout(600);
      let watched = await scrolls(page);
      assert.equal(watched.calls.length, 1, `in-page link: ${watched.calls}`);
      assert.ok(watched.moves.length <= 1, `in-page link moved ${watched.moves}`);
      near(await topOf(page, '#claim-c01'), offset, 'in-page claim top');

      // A deep link on load: one landing after the fonts and a frame; only the target's block opens.
      await page.goto('about:blank');
      await page.goto(url + '#claim-c01', { waitUntil: 'load' });
      await page.waitForSelector('main[data-ve-live]');
      await page.waitForTimeout(1200);
      watched = await scrolls(page);
      assert.equal(watched.calls.length, 1, `deep link: ${watched.calls}`);
      // The browser jumps to the fragment itself before the page lands it. The claims chapter is short
      // while its claims are closed, so that jump stops at the end of the page; then the one landing
      // opens the claim and puts it at the top.
      assert.ok(new Set(watched.moves).size <= 2, `deep link moved ${watched.moves}`);
      near(await topOf(page, '#claim-c01'), offset, 'deep-link claim top');
      assert.deepEqual(await page.$$eval('details[open]', (blocks) => blocks.map((block) => block.id)), ['claim-c01']);
      assert.equal(await page.evaluate(() => location.hash), '#claim-c01');

      // Read as one page, and back: the chapter at the reading line keeps its place on the screen.
      await page.evaluate(() => { location.hash = 'ch-3'; });
      await page.waitForTimeout(200);
      await page.evaluate(() => window.scrollTo({ top: window.scrollY + 600, behavior: 'instant' }));
      const openMenu = async () => { if (width < 1200) await page.click('.ve-chapter-toggle'); };
      for (const mode of ['one', 'pages']) {
        const before = await topOf(page, '#ch-3');
        await resetScrolls(page);
        const content = await topOf(page, '#ve-content');
        await openMenu();
        assert.deepEqual((await scrolls(page)).moves, [], 'opening the chapter menu scrolled the page');
        near(await topOf(page, '#ve-content'), content, 'opening the chapter menu moved the content');
        await page.click('.ve-read-mode button[aria-pressed="false"]');
        await page.waitForSelector(`main[data-ve-paged="${mode}"]`);
        await page.waitForTimeout(500);
        near(await topOf(page, '#ch-3'), before, `ch-3 after "${mode}"`);
      }
    } finally {
      await context.close();
    }
  }));

  runs.push(t.test(`verification explainer at ${width}px: a disclosure or a view switch keeps its place, and the rail follows quietly`, async () => {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference' });
    await context.addInitScript({ content: SCROLL_WATCH });
    try {
      const page = await context.newPage();
      const url = pathToFileURL(trust.html).href;
      await page.goto(url + '#ch-4', { waitUntil: 'load' });
      await page.waitForSelector('main[data-ve-live]');
      await page.waitForTimeout(300);

      // Open and close a block in mid-screen: its summary stays where it was clicked.
      const summary = '#ch-4 .ve-claim-details > details > summary';
      await placeAt(page, summary, height / 2, 1);
      for (const step of ['open', 'close']) {
        const before = await page.$$eval(summary, (s) => s[1].getBoundingClientRect().top);
        await clickInPlace(page, summary, 1);
        await page.waitForTimeout(300);
        near(await page.$$eval(summary, (s) => s[1].getBoundingClientRect().top), before, `${step} moved the summary`);
      }
      // Close the last block from the foot of the page: the shorter page does not pull the summary down.
      const last = await page.$$eval(summary, (s) => s.length - 1);
      await page.$$eval(summary, (s, i) => { s[i].parentElement.open = true; }, last);
      await page.waitForTimeout(200);
      await placeAt(page, summary, offset + 40, last);
      await page.waitForTimeout(200);
      const atFoot = await page.$$eval(summary, (s, i) => s[i].getBoundingClientRect().top, last);
      await clickInPlace(page, summary, last);
      await page.waitForTimeout(300);
      near(await page.$$eval(summary, (s, i) => s[i].getBoundingClientRect().top, last), atFoot, 'closing at the foot moved the summary');

      // Simple / Detailed and Before / After: the switch keeps its place when the figure changes height.
      for (const chapter of ['ch-0', 'ch-1']) {
        await page.evaluate((c) => { location.hash = c; }, chapter);
        await page.waitForTimeout(300);
        const switches = `#${chapter} .ve-diagram-mode-switch`;
        const count = await page.locator(switches).count();
        assert.ok(count > 0, `${chapter} has no view switch`);
        for (let i = 0; i < count; i += 1) {
          await placeAt(page, switches, height / 3, i);
          await page.waitForTimeout(150);
          const labels = `${switches} >> nth=${i} >> label`;
          for (const option of [1, 0]) {
            const before = await page.$$eval(switches, (s, n) => s[n].getBoundingClientRect().top, i);
            const box = await page.locator(labels).nth(option).boundingBox();
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            await page.waitForTimeout(300);
            near(await page.$$eval(switches, (s, n) => s[n].getBoundingClientRect().top, i), before, `${chapter} switch ${i} option ${option}`);
          }
        }
      }

      // One page: the reader scrolls through the chapters; the rail follows, and never scrolls the page or itself.
      await page.evaluate(() => { localStorage.setItem('ve-read-mode:' + location.pathname, 'one'); });
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForSelector('main[data-ve-paged="one"]');
      await page.waitForTimeout(300);
      const label = () => page.textContent('.ve-chapter-current');
      const first = await label();
      await resetScrolls(page);
      await page.mouse.move(width / 2, height / 2);
      for (let i = 0; i < 12; i += 1) {
        await page.mouse.wheel(0, 500);
        await page.waitForTimeout(40);
      }
      await page.waitForTimeout(300);
      const watched = await scrolls(page);
      assert.ok(watched.moves.length > 0, 'the wheel did not scroll');
      assert.deepEqual(watched.calls, [], `the rail scrolled: ${watched.calls}`);
      assert.equal(watched.inner, 0, 'something scrolled inside the page');
      assert.notEqual(await label(), first, 'the rail did not follow the scroll');
    } finally {
      await context.close();
    }
  }));
  }
  await Promise.all(runs);
});

test('verification explainer: the rail marks the current chapter, with no review marks, and lists the targets of the current chapter', async () => {
  const url = pathToFileURL(trust.html).href;
  const off = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
  try {
    const page = await off.newPage();
    await page.goto(url, { waitUntil: 'load' });
    assert.equal(await page.locator('.ve-chapter-list [data-ve-chapter-mark]').count(), 0);
  } finally {
    await off.close();
  }
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
    try {
      const page = await context.newPage();
      await page.goto(url + '#ch-1', { waitUntil: 'load' });
      await page.waitForSelector('main[data-ve-live]');
      assert.equal(await page.locator('.ve-chapter-list [data-ve-chapter-mark]').count(), 0);
      // The current chapter: aria-current="page", accent text in 600, no tint and no visible "You are here".
      const here = await page.$eval('.ve-chapter-list a[aria-current="page"]', (a) => ({ href: a.getAttribute('href'), weight: getComputedStyle(a).fontWeight, bg: getComputedStyle(a).backgroundColor, text: a.closest('nav').innerText }));
      assert.deepEqual([here.href, here.weight, here.bg], ['#ch-1', '600', 'rgba(0, 0, 0, 0)']);
      assert.doesNotMatch(here.text, /You are here/);
      assert.equal(await page.locator('.ve-chapter-list a[aria-current]').count(), 1);
      // Each row is a 44px target; the reading switch says which mode is on.
      for (const h of await page.$$eval('.ve-chapter-list a', (links) => links.filter((a) => a.offsetParent).map((a) => a.getBoundingClientRect().height))) assert.ok(h >= 44, `a rail row is ${h}px tall`);
      assert.equal(await page.getAttribute('.ve-read-mode [data-ve-read-mode-option="pages"]', 'aria-pressed'), 'true');
      for (const selector of ['.ve-chapter-list a', '.ve-chapter-index', '.ve-chapter-heading', '.ve-read-mode button', '.ve-read-mode-label']) {
        for (const pair of await colorPairs(page, selector)) {
          if (!pair.text) continue;
          assert.ok(contrast(pair.fg, pair.bg) >= 4.5, `${selector} "${pair.text}" contrast ${contrast(pair.fg, pair.bg).toFixed(2)} in ${scheme}`);
        }
      }
      if (scheme === 'dark') continue;
      // The in-chapter targets (the promises) show under the current chapter only.
      assert.equal(await page.locator('.ve-chapter-list a[href="#promise-p1"]').isVisible(), false);
      await page.click('.ve-chapter-list a[href="#ch-4"]');
      await page.waitForFunction(() => !document.getElementById('ch-4').hidden);
      assert.equal(await page.locator('.ve-chapter-list a[href="#promise-p1"]').isVisible(), true);
    } finally {
      await context.close();
    }
  }
});

for (const scheme of ['light', 'dark']) {
  test(`verification explainer at 375px in ${scheme} mode: AA contrast of the marks, no sideways scroll`, async () => {
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
      for (const selector of ['.ve-claim-row-note', '.ve-bar-card-state', '.ve-result-card-state', '.ve-pager-key', '.ve-timeline-tag', '.ve-check-row-result', '.ve-check-row-kind', '.ve-check-row-name', '.ve-typed-key li', '[data-ve-code-lines] .line span[style*="--shiki-token"]', '.ve-line-gutter', '.ve-line-key', '.ve-line-key .ve-line-sign']) {
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

test('verification explainer: embedded type, quiet glossary marks and the reading measure', async () => {
  // The page embeds its fonts and asks no font service for anything.
  const html = readFileSync(trust.html, 'utf8');
  assert.ok(!html.includes('fonts.googleapis.com') && !html.includes('fonts.gstatic.com'), 'the explainer still loads a font service');
  assert.match(html, /<style data-ve-explainer-type="\w+">/);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  try {
    const page = await context.newPage();
    const remote = [];
    page.on('request', (r) => { if (!/^(file|data):/.test(r.url())) remote.push(r.url()); });
    await page.goto(pathToFileURL(trust.html).href + '#ch-0', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    assert.deepEqual(remote, [], 'the page made a network request');
    const type = await page.evaluate(() => ({
      prose: getComputedStyle(document.querySelector('#ch-0 .ve-definition-list > dd')).fontFamily,
      ui: getComputedStyle(document.querySelector('.ve-chapter-rail') ?? document.body).fontFamily,
      loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')),
      ink: getComputedStyle(document.querySelector('main')).color,
    }));
    const prose = type.prose.split(',')[0].replace(/"/g, '').trim();
    const ui = type.ui.split(',')[0].replace(/"/g, '').trim();
    assert.notEqual(prose, ui, 'prose and rows share one face');
    for (const face of [prose, ui]) assert.ok(type.loaded.includes(face), `${face} did not load: ${type.loaded}`);
    assert.notEqual(type.ink, 'rgb(255, 255, 255)', 'dark mode uses pure white text');

    // Each chapter marks a term once, and few terms; the definition list keeps the reading measure.
    const marks = await page.$$eval('section.ve-section[id]', (sections) => sections.map((s) => [...s.querySelectorAll('.ve-term')].map((t) => t.firstChild.textContent.toLowerCase())));
    for (const words of marks) {
      assert.ok(words.length <= 8, `a chapter marks ${words.length} terms`);
      assert.equal(new Set(words).size, words.length, `a chapter marks a term twice: ${words}`);
    }
    const perLine = await page.$eval('#ch-0 .ve-definition-list', (dl) => {
      const r = document.createRange(); const tops = new Map();
      for (const dd of dl.querySelectorAll('dd')) {
        const w = document.createTreeWalker(dd, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          if (n.parentElement.closest('[role="tooltip"]')) continue;
          for (let i = 0; i < n.length; i += 1) { r.setStart(n, i); r.setEnd(n, i + 1); const box = r.getClientRects()[0]; if (box) tops.set(Math.round(box.top), (tops.get(Math.round(box.top)) ?? 0) + 1); }
        }
      }
      return Math.max(...tops.values());
    });
    assert.ok(perLine <= 72, `a definition line has ${perLine} characters`);
  } finally {
    await context.close();
  }
});

test('verification explainer: the old map shape and the minimal export both render each claim once', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // The old shape (each verifier lists its claims) still exports and renders from the same derived block.
    await page.goto(pathToFileURL(trust.oldHtml).href + '#claim-c01', { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('claim-c01')?.open);
    assert.equal(await page.locator('[data-ve-trust="claim"]').count(), trust.map.claims.length);

    // The minimal export: invariants, claims, checks, controls, results and code refs, with no promise.
    await page.goto(pathToFileURL(trust.minimalHtml).href + '#claim-c08', { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('claim-c08')?.open);
    assert.equal(await page.locator('[data-ve-trust="claim"]').count(), trust.map.claims.length);
    assert.deepEqual(await page.$$eval('[data-ve-checks-promise]', (s) => s.map((x) => x.dataset.veChecksPromise)), ['claims']);
    assert.equal(await page.locator('[id^="promise-"], #evidence-promise').count(), 0);
    // Weakest first: the claims with no check lead, the formal claim comes last.
    const order = await page.$$eval('.ve-claim-details > details', (d) => d.map((x) => x.querySelector('.ve-status-pill').textContent.split(':')[0]));
    assert.equal(order[0], 'Gap');
    assert.equal(order.at(-1), 'Formal');
    assert.match(await page.textContent('#ch-1'), /checks caught their planted bug/);
    assert.match(await page.textContent('#ch-0'), /Accepted by the user: The balance is never below zero\./);
    // Without the diff block, a code ref still shows its lines, with the diff status that the ref holds.
    assert.ok(await page.locator('#ch-0 [data-ve-code-lines] .line').count() > 0, 'the code ref has no lines');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

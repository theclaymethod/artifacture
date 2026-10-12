// End-to-end check of the worked examples of a trust-map explainer: export the understando fixture
// run (its refs hold the examples that scripts/example.py read from a control run and the fixture's
// test), then read the page with and without JavaScript, and export broken copies that must fail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = path.join(ROOT, 'scripts/ve-mdx/fixtures/trust-map');

function exportCase(dir, change = () => {}) {
  cpSync(FIXTURE, dir, { recursive: true });
  change(dir);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/ve-mdx/export.mjs', path.join(dir, 'explainer.mdx'), '--out', path.join(dir, 'explainer.html')], { cwd: ROOT });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (status) => resolve({ status, out }));
  });
}

const editMdx = (from, to) => (dir) => {
  const file = path.join(dir, 'explainer.mdx');
  const text = readFileSync(file, 'utf8');
  assert.ok(text.includes(from), `the fixture MDX lacks ${from}`);
  writeFileSync(file, text.replace(from, to));
};

const LOOP_EXAMPLE = '<WorkedExample refs={refs} id="one-withdrawal" explain={explain} />';

let work;
let browser;
let html;
let cases;
let examples;

test.before(async () => {
  work = mkdtempSync(path.join(os.tmpdir(), 'artifacture-worked-example-'));
  examples = JSON.parse(readFileSync(path.join(FIXTURE, 'refs.resolved.json'), 'utf8')).examples;
  const [good, noExample, after, noProvenance] = await Promise.all([
    exportCase(path.join(work, 'good')),
    exportCase(path.join(work, 'no-example'), editMdx(LOOP_EXAMPLE, '')),
    exportCase(path.join(work, 'after'), (dir) => {
      editMdx(LOOP_EXAMPLE, '')(dir);
      editMdx('</StepThrough>', `</StepThrough>\n\n${LOOP_EXAMPLE}`)(dir);
    }),
    exportCase(path.join(work, 'no-provenance'), (dir) => {
      const file = path.join(dir, 'refs.resolved.json');
      const refs = JSON.parse(readFileSync(file, 'utf8'));
      refs.examples[1].steps[0].provenance = [];
      writeFileSync(file, JSON.stringify(refs));
    }),
  ]);
  assert.equal(good.status, 0, good.out);
  html = path.join(work, 'good', 'explainer.html');
  cases = { noExample, after, noProvenance };
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  await browser?.close();
  if (work) rmSync(work, { recursive: true, force: true });
});

test('worked example: the export fails on a how-it-works level with no example, an example after the diagram, and a step with no provenance', () => {
  assert.notEqual(cases.noExample.status, 0);
  assert.match(cases.noExample.out, /ch-1: a how-it-works level has no worked example/);
  assert.doesNotMatch(cases.noExample.out, /ch-0: a how-it-works level/);
  assert.notEqual(cases.after.status, 0);
  assert.match(cases.after.out, /ch-1: the worked example "one-withdrawal" comes after a diagram/);
  assert.notEqual(cases.noProvenance.status, 0);
  assert.match(cases.noProvenance.out, /the example "one-withdrawal", step 1 \(A caller asks for an amount\): no provenance/);
});

test('worked example: without JavaScript every step shows in order, with the real values of its source', async () => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
    for (const ex of examples) {
      const rows = page.locator(`[data-ve-example="${ex.id}"] [data-ve-example-step]`);
      assert.equal(await rows.count(), ex.steps.length, ex.id);
      assert.deepEqual(await rows.evaluateAll((r) => r.map((x) => [x.getAttribute('data-ve-example-step'), x.hidden])), ex.steps.map((s) => [String(s.n), false]));
    }
    assert.equal(await page.locator('[data-ve-example-next]').count(), 0, 'a step button shows without JavaScript');
    // The values are the ones that the control run and the fixture's test gave.
    const before = await page.innerText('[data-ve-example="overdraft-before-after"]');
    for (const want of ['AssertionError: OverdraftError not raised', 'OverdraftError: 11 is above the balance', 'red', 'raise OverdraftError']) assert.ok(before.includes(want), `the example lacks ${want}`);
    const loop = page.locator('[data-ve-example="one-withdrawal"]');
    assert.match(await loop.locator('#example-one-withdrawal-2').innerText(), /new balance\s+7/);
    // Each step names the source pointer of each value it shows.
    const from = await loop.locator('#example-one-withdrawal-2 [data-ve-provenance] li').evaluateAll((li) => li.map((x) => x.textContent));
    assert.deepEqual(from, examples[1].steps[1].provenance);
    assert.match(await loop.locator('[data-ve-example-sources]').evaluate((s) => s.textContent), /python3 -m unittest tests\.test_core/);
  } finally {
    await context.close();
  }
});

test('worked example: one step at a time, the station lit, values in the code face, reasons in the prose face, deep links and the claim brief', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const url = pathToFileURL(html).href;
    await page.goto(`${url}#ch-1`, { waitUntil: 'load' });
    const ex = page.locator('[data-ve-example="one-withdrawal"]');
    await ex.locator('[data-ve-example-next]').waitFor();
    const shown = () => ex.locator('[data-ve-example-step]:visible').evaluateAll((r) => r.map((x) => x.id));
    assert.deepEqual(await shown(), ['example-one-withdrawal-1']);
    assert.equal(await ex.locator('[data-ve-active="true"]').innerText(), '1\nA withdrawal');
    const next = await ex.locator('[data-ve-example-next]').boundingBox();
    await ex.locator('[data-ve-example-next]').click();
    assert.deepEqual(await shown(), ['example-one-withdrawal-2']);
    assert.match(await ex.locator('[data-ve-active="true"]').innerText(), /Pay out/);
    assert.equal(await ex.locator('.ve-example-count').innerText(), 'Step 2 of 3');
    // The controls sit above the row, so they keep their place when the row changes.
    assert.deepEqual(await ex.locator('[data-ve-example-next]').boundingBox(), next);
    // A station is a button to its first step.
    await ex.locator('[data-ve-example-station="refuse"]').click();
    assert.deepEqual(await shown(), ['example-one-withdrawal-3']);
    const faces = await ex.locator('#example-one-withdrawal-3').evaluate((row) => ({
      value: getComputedStyle(row.querySelector('.ve-example-value code')).fontFamily,
      reason: getComputedStyle(row.querySelector('.ve-example-reason')).fontFamily,
    }));
    assert.match(faces.value, /Commit Mono/);
    assert.match(faces.reason, /Newsreader/);
    // The code line that decides links to the head.
    assert.match(await ex.locator('#example-one-withdrawal-2 .ve-example-line a').getAttribute('href'), /wallet\/core\.py#L\d+/);
    // A link to a step opens it.
    await page.goto(`${url}#example-overdraft-before-after-2`, { waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('example-overdraft-before-after-2').hidden);
    assert.equal(await page.locator('#example-overdraft-before-after-1').isHidden(), true);
    // The detail of the overdraft claim shows its examples and links to them.
    await page.goto(`${url}#claim-c01`, { waitUntil: 'load' });
    const brief = page.locator('#claim-c01 [data-ve-example-for]');
    assert.equal(await brief.count(), 1);
    assert.equal(await brief.getAttribute('data-ve-example-for'), 'overdraft-before-after one-withdrawal');
    assert.deepEqual(await brief.locator('.ve-example-brief-title a').evaluateAll((a) => a.map((x) => x.getAttribute('href'))), ['#example-overdraft-before-after', '#example-one-withdrawal']);
    assert.match(await brief.evaluate((b) => b.textContent), /error.*raised.*OverdraftError|control result\s*red/s);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

#!/usr/bin/env node
/*
 * Behavioral eval suite for the PresentationDeck engine — the documented
 * sibling of evals/run.mjs (which evals the ve-verify checker itself against
 * seeded violations). This suite is the engine's behavioral CONTRACT: it
 * exports the demo deck through the standard ve:export path and replays,
 * deterministically and headlessly, the behaviors the engine must keep:
 *
 *   interaction: click-anywhere-to-close guard matrix, Escape/X close,
 *                keyboard-nav matrix, drill CTA contract (click + Enter +
 *                Space; primary solid vs secondary outline), LayerExplorer
 *                selection, prefers-reduced-motion.
 *   geometry:    stage transform == fitStage() math across viewports,
 *                letterboxing on mismatched ratios, rail collapse/expand
 *                widths.
 *   tokens:      the same source re-skins under a second preset (computed
 *                colors actually change) and the shipped module contains no
 *                color or font literals outside a documented allowlist.
 *
 * Run: npm run ve:eval-presentation   (CI: evals job, after ve:eval)
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { RAIL_COLLAPSED_WIDTH, RAIL_EXPANDED_WIDTH, fitStage } from '../visual-explainer-mdx/presentation-core.ts';

const EVAL_ROOT = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(EVAL_ROOT, '..');
const DEMO_SOURCE = 'examples/visual-explainer-mdx/presentation-deck.tsx';
const SECOND_PRESET = 'terminal';

const results = [];
const consoleErrors = [];

function record(group, id, run) {
  return (async () => {
    try {
      await run();
      results.push({ group, id, status: 'pass' });
    } catch (error) {
      results.push({ group, id, status: 'fail', detail: error instanceof Error ? error.message : String(error) });
    }
  })();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function approx(actual, expected, tolerance, label) {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} ±${tolerance}, got ${actual}`,
  );
}

/** WCAG contrast ratio between two computed `rgb(...)`/`rgba(...)` colors. */
function contrastRatio(a, b) {
  const luminance = (css) => {
    const match = css.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (!match) throw new Error(`contrastRatio: cannot parse computed color "${css}"`);
    const [r, g, bl] = match.slice(1, 4).map((v) => {
      const channel = Number(v) / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function exportDemo(sourcePath, outPath) {
  const run = spawnSync(process.execPath, ['scripts/ve-mdx/export.mjs', sourcePath, '--out', outPath], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (run.status !== 0) {
    throw new Error(`ve:export failed for ${sourcePath}:\n${run.stdout}\n${run.stderr}`);
  }
}

async function withPage(browser, { viewport = { width: 1440, height: 900 }, reducedMotion = 'no-preference', url }, fn) {
  const context = await browser.newContext({ viewport, reducedMotion });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));
  try {
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('[data-stage]', { timeout: 10_000 });
    return await fn(page);
  } finally {
    await context.close();
  }
}

async function slideIndex(page) {
  return Number(await page.locator('[data-slide-index]').getAttribute('data-slide-index'));
}

async function counterText(page) {
  return (await page.locator('[data-ve-deck-counter]').textContent()).trim();
}

async function goToSlide(page, index) {
  await page.keyboard.press('Home');
  for (let i = 0; i < index; i += 1) await page.keyboard.press('ArrowRight');
  assert((await slideIndex(page)) === index, `failed to navigate to slide ${index}`);
}

const sheetOpen = (page) => page.locator('[data-drill-open]');

async function expectSheetOpen(page, label) {
  await page.waitForSelector('[data-drill-open]', { state: 'attached', timeout: 3_000 }).catch(() => {
    throw new Error(`${label}: drill sheet did not open`);
  });
}

async function expectSheetClosed(page, label) {
  await page.waitForSelector('[data-drill-open]', { state: 'detached', timeout: 3_000 }).catch(() => {
    throw new Error(`${label}: drill sheet did not close`);
  });
}

async function main() {
  const workDir = join(REPO_ROOT, '.ve-mdx-tmp', `pres-eval-${process.pid}`);
  mkdirSync(workDir, { recursive: true });
  const primaryHtml = join(workDir, 'presentation-deck.html');
  const secondHtml = join(workDir, `presentation-deck-${SECOND_PRESET}.html`);
  const wrapperSource = join(workDir, `wrapper-${SECOND_PRESET}.tsx`);

  // 1. Export the demo through the standard ve:export path — the artifact
  //    under eval is the exact artifact users ship.
  exportDemo(DEMO_SOURCE, primaryHtml);
  writeFileSync(
    wrapperSource,
    `import React from 'react';\nimport PresentationDeckDemo from '../../examples/visual-explainer-mdx/presentation-deck.tsx';\n\nexport default function SecondPresetDemo() {\n  return <PresentationDeckDemo preset=${JSON.stringify(SECOND_PRESET)} />;\n}\n`,
  );
  exportDemo(wrapperSource, secondHtml);

  const primaryUrl = pathToFileURL(primaryHtml).href;
  const secondUrl = pathToFileURL(secondHtml).href;

  const browser = await chromium.launch();
  try {
    /* ------------------------------------------------------------ */
    /* interaction                                                   */
    /* ------------------------------------------------------------ */

    await record('interaction', 'keyboard-nav-matrix', () =>
      withPage(browser, { url: primaryUrl }, async (page) => {
        const steps = [
          ['ArrowRight', 1],
          ['ArrowRight', 2],
          ['ArrowLeft', 1],
          [' ', 2],
          ['PageDown', 3],
          ['PageUp', 2],
          ['End', 3],
          ['ArrowRight', 3], // clamped at the last slide
          ['Home', 0],
          ['ArrowLeft', 0], // clamped at the first slide
          ['PageDown', 1],
        ];
        for (const [key, expected] of steps) {
          await page.keyboard.press(key === ' ' ? 'Space' : key);
          const actual = await slideIndex(page);
          assert(actual === expected, `after ${key === ' ' ? 'Space' : key}: expected slide ${expected}, got ${actual}`);
          const counter = await counterText(page);
          const expectedCounter = `${String(expected + 1).padStart(2, '0')} / 04`;
          assert(counter === expectedCounter, `counter after ${key}: expected "${expectedCounter}", got "${counter}"`);
        }
      }),
    );

    await record('interaction', 'edge-click-zones', () =>
      withPage(browser, { url: primaryUrl }, async (page) => {
        await page.locator('[data-edge-next]').click({ position: { x: 40, y: 450 }, force: true });
        assert((await slideIndex(page)) === 1, 'right edge zone should advance');
        await page.locator('[data-edge-prev]').click({ position: { x: 40, y: 450 }, force: true });
        assert((await slideIndex(page)) === 0, 'left edge zone should go back');
      }),
    );

    await record('interaction', 'vertical-fallthrough-without-click-ins', () =>
      withPage(browser, { url: primaryUrl }, async (page) => {
        assert((await slideIndex(page)) === 0, 'fallthrough fixture must start on slide 0');
        await page.locator('[data-stage] [data-drill-target]').evaluateAll((triggers) => {
          for (const trigger of triggers) {
            const wrapper = trigger.parentElement;
            if (wrapper) wrapper.style.pointerEvents = 'none';
          }
        });
        assert(
          (await page.locator('[data-stage] [data-presentation-state-nav]').count()) === 0,
          'fallthrough fixture slide must have no custom state navigator',
        );
        await page.keyboard.press('ArrowDown');
        await page.waitForFunction(() => document.querySelector('[data-slide-index]')?.getAttribute('data-slide-index') === '1');
        assert((await slideIndex(page)) === 1, 'ArrowDown without an effectively rendered internal state must advance to the next slide');
      }),
    );

    await record('interaction', 'vertical-drill-navigation', () =>
      withPage(browser, { url: primaryUrl }, async (page) => {
        await goToSlide(page, 1);
        const label = () => sheetOpen(page).getAttribute('aria-label');

        await page.keyboard.press('ArrowDown');
        await expectSheetOpen(page, 'first vertical drill');
        assert((await label()) === 'Inspect a quarantined job', 'ArrowDown must open the first drill');
        assert((await slideIndex(page)) === 1, 'vertical navigation must not change slides');

        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(50);
        await expectSheetOpen(page, 'second vertical drill');
        assert((await label()) === 'An atomic claim', 'second ArrowDown must advance to the next drill');

        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(50);
        assert((await label()) === 'A stable replay key', 'third ArrowDown must advance to the last drill');

        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(50);
        assert((await label()) === 'An atomic claim', 'ArrowUp must reverse through drills');
        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(50);
        assert((await label()) === 'Inspect a quarantined job', 'ArrowUp must reach the first drill');
        await page.keyboard.press('ArrowUp');
        await expectSheetClosed(page, 'vertical return to base state');
        assert((await slideIndex(page)) === 1, 'returning to the base state must stay on the slide');

        await page.keyboard.press('ArrowDown');
        await expectSheetOpen(page, 'first drill before fallthrough');
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(50);
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(50);
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(50);
        assert((await slideIndex(page)) === 2, 'ArrowDown after the final drill must advance to the next slide');
        await expectSheetClosed(page, 'final drill fallthrough');
      }),
    );

    await record('interaction', 'vertical-custom-state-navigation', () =>
      withPage(browser, { url: primaryUrl }, async (page) => {
        await goToSlide(page, 3);
        const stateIndex = () =>
          page.locator('[data-presentation-state-nav]').getAttribute('data-presentation-state-index').then(Number);
        const expectStateIndex = async (expected, label) => {
          await page.waitForFunction(
            (value) =>
              document.querySelector('[data-presentation-state-nav]')
                ?.getAttribute('data-presentation-state-index') === String(value),
            expected,
          );
          assert((await stateIndex()) === expected, label);
        };

        assert((await stateIndex()) === 0, 'custom state navigator must start at state 0');
        await page.evaluate(() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        });
        await expectStateIndex(2, 'two synchronous ArrowDown events must reach the final custom state');
        await page.keyboard.press('ArrowUp');
        await expectStateIndex(1, 'ArrowUp must reverse custom state');
        await page.keyboard.press('ArrowDown');
        await expectStateIndex(2, 'ArrowDown must return to the final custom state');
        await page.keyboard.press('ArrowDown');
        await expectStateIndex(2, 'the final custom state must remain rendered when the deck itself is at its end');
        await page.keyboard.press('ArrowUp');
        await expectStateIndex(1, 'ArrowUp must reverse custom state');
        assert((await slideIndex(page)) === 3, 'custom state navigation must not change slides');
        await page.keyboard.press('ArrowLeft');
        assert((await slideIndex(page)) === 2, 'ArrowLeft must still change slides');
      }),
    );

    await record('interaction', 'vertical-layer-explorer-navigation', () =>
      withPage(browser, { url: primaryUrl }, async (page) => {
        await goToSlide(page, 2);
        const pressedId = () =>
          page.locator('[data-drill-target][aria-pressed="true"]').getAttribute('data-drill-target');

        assert((await pressedId()) === 'deck-layer-engine', 'layer explorer must start on its initial state');
        await page.keyboard.press('ArrowDown');
        assert((await pressedId()) === 'deck-layer-primitives', 'ArrowDown must advance the layer explorer');
        await page.keyboard.press('ArrowDown');
        assert((await pressedId()) === 'deck-layer-tokens', 'ArrowDown must reach the final layer');
        await page.keyboard.press('ArrowUp');
        assert((await pressedId()) === 'deck-layer-primitives', 'ArrowUp must reverse the layer explorer');
        await page.keyboard.press('ArrowUp');
        assert((await pressedId()) === 'deck-layer-engine', 'ArrowUp must return to the initial layer');
        assert((await sheetOpen(page).count()) === 0, 'initial layer is the explorer base state');
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(50);
        assert((await pressedId()) === 'deck-layer-primitives', 'fallthrough setup must reach the middle layer');
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(50);
        assert((await pressedId()) === 'deck-layer-tokens', 'fallthrough setup must reach the final layer');
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(50);
        await expectSheetOpen(page, 'tone-remapping click-in after the final layer');
        assert((await slideIndex(page)) === 2, 'a remaining click-in must be consumed before slide fallthrough');
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(50);
        assert((await slideIndex(page)) === 3, 'ArrowDown after the final layer must advance to the next slide');
        await expectSheetClosed(page, 'final layer fallthrough');
      }),
    );

    await record('interaction', 'drill-dismiss-guard-matrix', () =>
      withPage(browser, { url: primaryUrl }, async (page) => {
        await goToSlide(page, 1);
        await page.locator('[data-drill-target="sys-guard"]').click();
        await expectSheetOpen(page, 'sys-guard');
        // Clicks on every interactive element class must NOT close the sheet.
        for (const fixture of ['button', 'link', 'input', 'select', 'textarea', 'opt-out']) {
          await page.locator(`[data-drill-open] [data-fixture="${fixture}"]`).click();
          assert(
            (await sheetOpen(page).count()) === 1,
            `click on [data-fixture="${fixture}"] must not dismiss the sheet`,
          );
        }
        // A click on passive prose MUST close it.
        await page.locator('[data-drill-open] p').first().click();
        await expectSheetClosed(page, 'passive prose click');
      }),
    );

    await record('interaction', 'drill-escape-and-x-close', () =>
      withPage(browser, { url: primaryUrl }, async (page) => {
        await goToSlide(page, 1);
        await page.locator('[data-drill-target="sys-guard"]').click();
        await expectSheetOpen(page, 'sys-guard');
        await page.keyboard.press('Escape');
        await expectSheetClosed(page, 'Escape');
        await page.locator('[data-drill-target="sys-guard"]').click();
        await expectSheetOpen(page, 'sys-guard (reopen)');
        await page.locator('[data-drill-close]').click();
        await expectSheetClosed(page, 'close X');
      }),
    );

    await record('interaction', 'drill-cta-open-contract', () =>
      withPage(browser, { url: primaryUrl }, async (page) => {
        // Every sheet-opening trigger must open via click AND Enter AND Space.
        const triggers = [
          [0, 'thesis-contract'],
          [1, 'sys-guard'],
          [1, 'sys-scale'],
          [1, 'sys-tokens'],
          [2, 'layers-tones'],
          [3, 'ask-fanout'],
        ];
        for (const [slide, drillId] of triggers) {
          for (const mode of ['click', 'Enter', 'Space']) {
            await goToSlide(page, slide);
            const trigger = page.locator(`[data-drill-target="${drillId}"]`);
            if (mode === 'click') {
              await trigger.click();
            } else {
              await trigger.focus();
              await page.keyboard.press(mode);
            }
            await expectSheetOpen(page, `${drillId} via ${mode}`);
            await page.keyboard.press('Escape');
            await expectSheetClosed(page, `${drillId} via ${mode}`);
          }
        }
      }),
    );

    await record('interaction', 'drill-cta-variant-styles', () =>
      withPage(browser, { url: primaryUrl }, async (page) => {
        const styleOf = (selector) =>
          page.locator(selector).evaluate((el) => {
            const s = getComputedStyle(el);
            return { bg: s.backgroundColor, border: s.borderTopColor, color: s.color };
          });
        const primary = await styleOf('[data-drill-target="thesis-contract"][data-drill-variant="primary"]');
        assert(primary.bg !== 'rgba(0, 0, 0, 0)' && primary.bg !== 'transparent', 'primary CTA must have a solid fill');
        assert(primary.bg === primary.border, `primary CTA fill must match its border (solid accent), got bg=${primary.bg} border=${primary.border}`);
        assert(primary.color !== primary.bg, 'primary CTA text must contrast its fill');
        await goToSlide(page, 3);
        const secondary = await styleOf('[data-drill-target="ask-fanout"][data-drill-variant="secondary"]');
        assert(secondary.bg === 'rgba(0, 0, 0, 0)' || secondary.bg === 'transparent', `secondary CTA must be an outline (transparent fill), got ${secondary.bg}`);
        assert(secondary.border === secondary.color, `secondary CTA outline must match its text color, got border=${secondary.border} color=${secondary.color}`);
        assert(primary.bg !== secondary.bg, 'primary and secondary CTAs must be visually distinct');
      }),
    );

    await record('interaction', 'layer-explorer-selection', () =>
      withPage(browser, { url: primaryUrl }, async (page) => {
        await goToSlide(page, 2);
        assert((await sheetOpen(page).count()) === 0, 'explorer starts on the initial layer (no drill-open)');
        await page.locator('[data-drill-target="deck-layer-primitives"]').click();
        await expectSheetOpen(page, 'layer selection');
        const pressed = await page.locator('[data-drill-target="deck-layer-primitives"]').getAttribute('aria-pressed');
        assert(pressed === 'true', 'selected layer card must be aria-pressed');
        await page.keyboard.press('Escape');
        await expectSheetClosed(page, 'layer selection reset');
      }),
    );

    await record('interaction', 'keyboard-guard-typing-and-modifiers', () =>
      withPage(browser, { url: primaryUrl }, async (page) => {
        // Modifier chords are browser/OS shortcuts — the deck must not steal
        // them. (Playwright still delivers the keydown, so a missing guard
        // would navigate.)
        for (const chord of ['Meta+ArrowRight', 'Control+ArrowRight', 'Alt+ArrowRight', 'Meta+End']) {
          await page.keyboard.press(chord);
          assert((await slideIndex(page)) === 0, `deck must ignore ${chord}`);
        }
        await page.keyboard.press('ArrowRight');
        assert((await slideIndex(page)) === 1, 'plain ArrowRight must still navigate');
        // Typing context: with focus in a text field, EVERY key belongs to
        // the field. Space must produce a space character (a missing guard
        // preventDefault()s it away) and arrows must not navigate.
        await page.locator('[data-drill-target="sys-guard"]').click();
        await expectSheetOpen(page, 'typing-guard fixture');
        const textarea = page.locator('[data-drill-open] [data-fixture="textarea"]');
        await textarea.click();
        await textarea.pressSequentially(' typed x y');
        const value = await textarea.inputValue();
        assert(value.includes(' typed x y'), `Space/keys must type into the field, got "${value}"`);
        await textarea.press('ArrowLeft');
        await textarea.press('Home');
        await textarea.press('End');
        assert((await slideIndex(page)) === 1, 'arrow/Home/End inside a field must not navigate');
        assert((await sheetOpen(page).count()) === 1, 'typing must not dismiss the sheet');
      }),
    );

    await record('interaction', 'nav-gated-while-sheet-open', () =>
      withPage(browser, { url: primaryUrl }, async (page) => {
        await goToSlide(page, 1);
        await page.locator('[data-drill-target="sys-guard"]').click();
        await expectSheetOpen(page, 'nav-gate fixture');
        // Edge zones sit above the sheet (z-50 vs z-40): clicks there must
        // neither navigate nor blow past the open sheet.
        await page.locator('[data-edge-next]').click({ position: { x: 40, y: 450 }, force: true });
        assert((await slideIndex(page)) === 1, 'edge zone must not navigate while a sheet is open');
        assert((await sheetOpen(page).count()) === 1, 'edge-zone click must not dismiss the sheet');
        for (const key of ['ArrowRight', 'ArrowLeft', 'End', 'Home', 'PageDown']) {
          await page.keyboard.press(key);
          assert((await slideIndex(page)) === 1, `${key} must not navigate while a sheet is open`);
        }
        assert((await sheetOpen(page).count()) === 1, 'sheet must survive gated nav keys');
        await page.keyboard.press('Escape');
        await expectSheetClosed(page, 'nav-gate Escape');
        await page.keyboard.press('ArrowRight');
        assert((await slideIndex(page)) === 2, 'nav must resume once the sheet closes');
      }),
    );

    await record('interaction', 'light-tone-primary-cta-contrast', () =>
      withPage(browser, { url: primaryUrl }, async (page) => {
        // On light-tone slides --ve-accent remaps to the ink color, so a
        // primary CTA filled with it must flip its text to the slide surface
        // — otherwise it renders ink-on-ink (invisible label).
        await goToSlide(page, 2);
        const chip = await page
          .locator('[data-drill-target="layers-tones"][data-drill-variant="primary"]')
          .evaluate((el) => {
            const s = getComputedStyle(el);
            return { bg: s.backgroundColor, border: s.borderTopColor, color: s.color };
          });
        assert(chip.bg === chip.border, `light-tone primary CTA must stay a solid fill, got bg=${chip.bg} border=${chip.border}`);
        const ratio = contrastRatio(chip.color, chip.bg);
        assert(
          ratio >= 3,
          `light-tone primary CTA text must contrast its fill (got ${ratio.toFixed(2)}:1 for ${chip.color} on ${chip.bg})`,
        );
      }),
    );

    await record('interaction', 'reduced-motion-disables-animation', () =>
      withPage(browser, { url: primaryUrl, reducedMotion: 'reduce' }, async (page) => {
        const animation = await page
          .locator('[data-stage] > div')
          .first()
          .evaluate((el) => getComputedStyle(el).animationDuration);
        assert(parseFloat(animation) <= 0.001, `slide-in animation must collapse under reduced motion, got ${animation}`);
        const transition = await page.locator('[data-rail]').evaluate((el) => getComputedStyle(el).transitionDuration);
        assert(
          transition.split(',').every((t) => parseFloat(t) <= 0.001),
          `rail transition must collapse under reduced motion, got ${transition}`,
        );
      }),
    );

    /* ------------------------------------------------------------ */
    /* geometry                                                      */
    /* ------------------------------------------------------------ */

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
      { width: 1024, height: 768 },
      { width: 800, height: 1000 },
    ]) {
      await record('geometry', `scale-to-fit-${viewport.width}x${viewport.height}`, () =>
        withPage(browser, { url: primaryUrl, viewport }, async (page) => {
          const measured = await page.evaluate(() => {
            const main = document.querySelector('main');
            const stage = document.querySelector('[data-stage]');
            const matrix = new DOMMatrixReadOnly(getComputedStyle(stage).transform);
            return {
              availW: main.clientWidth,
              availH: main.clientHeight,
              scale: matrix.a,
              left: parseFloat(getComputedStyle(stage).left),
              top: parseFloat(getComputedStyle(stage).top),
            };
          });
          const expected = fitStage(measured.availW, measured.availH);
          approx(measured.scale, expected.scale, 0.001, 'stage scale');
          approx(measured.left, expected.left, 1, 'letterbox left');
          approx(measured.top, expected.top, 1, 'letterbox top');
        }),
      );
    }

    await record('geometry', 'letterbox-on-mismatched-ratio', () =>
      withPage(browser, { url: primaryUrl, viewport: { width: 800, height: 1000 } }, async (page) => {
        const { top, availH, scale } = await page.evaluate(() => {
          const main = document.querySelector('main');
          const stage = document.querySelector('[data-stage]');
          const matrix = new DOMMatrixReadOnly(getComputedStyle(stage).transform);
          return { top: parseFloat(getComputedStyle(stage).top), availH: main.clientHeight, scale: matrix.a };
        });
        assert(top > 40, `portrait viewport must letterbox above the stage, got top=${top}`);
        assert(1080 * scale + top * 2 <= availH + 2, 'stage plus letterbox bands must fill the container height');
        const backdrop = await page.locator('.ve-pres-root').evaluate((el) => getComputedStyle(el).backgroundColor);
        assert(backdrop !== 'rgba(0, 0, 0, 0)', 'letterbox backdrop must be painted (via --ve-deck-letterbox)');
      }),
    );

    await record('geometry', 'rail-collapse-and-hover-expand', () =>
      withPage(browser, { url: primaryUrl }, async (page) => {
        const rail = page.locator('[data-rail]');
        await page.waitForFunction(
          () => document.querySelector('[data-rail]')?.getAttribute('data-rail-expanded') === 'false',
          undefined,
          { timeout: 5_000 },
        );
        await page.waitForFunction(
          (w) => Math.abs(document.querySelector('[data-rail]').offsetWidth - w) <= 1,
          RAIL_COLLAPSED_WIDTH,
          { timeout: 3_000 },
        );
        await rail.hover();
        await page.waitForFunction(
          (w) => Math.abs(document.querySelector('[data-rail]').offsetWidth - w) <= 1,
          RAIL_EXPANDED_WIDTH,
          { timeout: 3_000 },
        );
        assert((await rail.getAttribute('data-rail-expanded')) === 'true', 'rail must report expanded on hover');
        // Rail navigation drives the deck.
        await page.locator('[data-rail-item="3"]').click();
        assert((await slideIndex(page)) === 2, 'rail item click must navigate');
      }),
    );

    await record('geometry', 'slide-text-readable-and-contained', async () => {
      for (const url of [primaryUrl, secondUrl]) {
        await withPage(browser, { url }, async (page) => {
          const text = await page.locator('[data-stage] p, [data-stage] h1, [data-stage] h2, [data-stage] h3').evaluateAll((els) =>
            els.filter((el) => el.textContent.trim() && el.getBoundingClientRect().width).map((el) => {
              const rect = el.getBoundingClientRect();
              const stage = el.closest('[data-stage]').getBoundingClientRect();
              const scale = stage.width / el.closest('[data-stage]').offsetWidth;
              return {
                text: el.textContent,
                renderedSize: parseFloat(getComputedStyle(el).fontSize) * scale,
                contained: rect.left >= stage.left - 1 && rect.right <= stage.right + 1 && rect.bottom <= stage.bottom + 1,
                overflow: el.scrollWidth > el.clientWidth + 1,
              };
            }),
          );
          assert(text.length > 0, 'the opening slide must contain readable text');
          for (const item of text) {
            assert(item.renderedSize >= 14, `Text "${item.text}" renders below 14px (${item.renderedSize})`);
            assert(item.contained && !item.overflow, `Text "${item.text}" exceeds its slide or text column`);
          }
        });
      }
    });

    /* ------------------------------------------------------------ */
    /* tokens                                                        */
    /* ------------------------------------------------------------ */

    await record('tokens', 'preset-reskin-changes-computed-colors', async () => {
      const sample = (url) =>
        withPage(browser, { url }, async (page) => ({
          slideBg: await page.locator('[data-ve-slide]').evaluate((el) => getComputedStyle(el).backgroundColor),
          ctaBg: await page
            .locator('[data-drill-target="thesis-contract"]')
            .evaluate((el) => getComputedStyle(el).backgroundColor),
          font: await page.locator('[data-ve-slide] h1').evaluate((el) => getComputedStyle(el).fontFamily),
        }));
      const a = await sample(primaryUrl);
      const b = await sample(secondUrl);
      assert(a.slideBg !== b.slideBg, `slide surface must reskin per preset (both ${a.slideBg})`);
      assert(a.ctaBg !== b.ctaBg, `primary CTA fill must reskin per preset (both ${a.ctaBg})`);
      assert(a.font !== b.font, `display font must reskin per preset (both ${a.font})`);
    });

    await record('tokens', 'no-hardcoded-color-or-font-literals-in-module', async () => {
      // Generic token-consumption contract: the shipped presentation module
      // must contain NO color literals and NO concrete font families at all —
      // every color and font arrives via a --ve-* custom property, so any
      // preset (including private ones) skins the deck without the module
      // knowing a single palette value. Any hex or rgb()/hsl()/oklch()/oklab()
      // literal outside the per-file allowlist below fails. This is stronger
      // than scanning for known-bad values and needs no knowledge of any
      // specific palette. (Neutral CSS keywords like `transparent`/`black`
      // inside color-mix() ratios are primitives, not palette values, and are
      // out of scope.)
      const allowedLiterals = new Map([
        [
          'visual-explainer-mdx/presentation.tsx',
          new Set([
            '#161616', // documented neutral fallback for var(--ve-deck-letterbox, …)
            '#0a0a0a', // documented neutral fallback for var(--ve-code-bg, …)
          ]),
        ],
        [
          'visual-explainer-mdx/presentation-core.ts',
          new Set([
            '#336699', // arbitrary hex used in the tint()/solidTint() docstring examples
          ]),
        ],
        [DEMO_SOURCE, new Set()],
      ]);
      const colorLiteral = /(?<![&\w])#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\s*\(/g;
      const fontDeclaration = /font-?[Ff]amily['"]?\s*[:=]\s*(?:'([^']*)'|"([^"]*)"|([^;,}]+);)/g;
      for (const [file, allowed] of allowedLiterals) {
        const source = readFileSync(join(REPO_ROOT, file), 'utf8');
        for (const match of source.matchAll(colorLiteral)) {
          assert(
            allowed.has(match[0]),
            `${file} contains a hardcoded color literal "${match[0]}" — use a --ve-* token (or add a documented allowlist entry)`,
          );
        }
        for (const match of source.matchAll(fontDeclaration)) {
          const value = (match[1] ?? match[2] ?? match[3] ?? '').trim();
          assert(
            value.startsWith('var(--ve-font'),
            `${file} declares a concrete font-family "${value}" — fonts must come from var(--ve-font-*)`,
          );
        }
      }
    });

    await record('interaction', 'no-console-errors', async () => {
      assert(consoleErrors.length === 0, `console errors during evals:\n${consoleErrors.join('\n')}`);
    });
  } finally {
    await browser.close();
    rmSync(workDir, { recursive: true, force: true });
  }

  console.log('eval_id,group,status');
  for (const row of results) {
    console.log(`${row.id},${row.group},${row.status}`);
  }
  const failures = results.filter((row) => row.status !== 'pass');
  if (failures.length) {
    console.error('\nFailures:');
    for (const failure of failures) {
      console.error(`- ${failure.group}/${failure.id}: ${failure.detail}`);
    }
    process.exit(1);
  }
  console.log(`\nAll ${results.length} presentation-deck evals passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});

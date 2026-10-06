import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COMPONENT_CLI = path.join(REPO_ROOT, 'scripts/components.mjs');

function run(command, args, cwd = REPO_ROOT, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
  assert.ifError(result.error);
  return result;
}

function succeeds(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function components(args) {
  return run(process.execPath, [COMPONENT_CLI, ...args]);
}

function snapshot(directory) {
  const files = [];
  const visit = (current) => {
    for (const item of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['node_modules', 'dist'].includes(item.name)) continue;
      const file = path.join(current, item.name);
      if (item.isDirectory()) visit(file);
      else files.push({ file: path.relative(directory, file), hash: createHash('sha256').update(readFileSync(file)).digest('hex'), mtime: statSync(file).mtimeMs });
    }
  };
  visit(directory);
  return files;
}

async function launchBrowser() {
  try { return await chromium.launch({ headless: true, timeout: 15_000 }); }
  catch (bundledError) {
    try { return await chromium.launch({ channel: 'chrome', headless: true, timeout: 15_000 }); }
    catch (chromeError) {
      throw new Error(`This end-to-end test requires Chromium. Install Playwright Chromium or system Chrome.\nPlaywright: ${bundledError.message}\nChrome: ${chromeError.message}`);
    }
  }
}

async function serve(directory) {
  const server = createServer((request, response) => {
    try {
      const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.resolve(directory, relative);
      if (!file.startsWith(directory + path.sep)) { response.writeHead(403).end(); return; }
      const contentType = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(file)] ?? 'application/octet-stream';
      const bytes = readFileSync(file);
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close: async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); },
  };
}

async function openPage(browser, host) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(15_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => route.request().url().startsWith(host.url) ? route.continue() : route.abort());
  return { page, errors };
}

async function seek(page, seconds) {
  const slider = page.getByRole('slider', { name: 'Authored time' });
  await slider.press('Home');
  if (seconds === 4) await slider.press('End');
  else {
    for (let pageUp = 0; pageUp < Math.floor(seconds / 0.4); pageUp += 1) await slider.press('PageUp');
    const steps = Math.round((seconds - Number(await slider.inputValue())) / 0.01);
    for (let step = 0; step < Math.abs(steps); step += 1) await slider.press(steps < 0 ? 'ArrowLeft' : 'ArrowRight');
  }
  assert.equal(Number(await slider.inputValue()), seconds);
  await page.waitForFunction((label) => document.querySelector('output')?.textContent === label, `${seconds.toFixed(2)} s / 4.00 s`);
  return page.evaluate(() => {
    const compose = document.querySelector('[data-ve-label="Compose"]');
    const output = document.querySelector('[data-ve-label="Output"]');
    const edge = document.querySelector('path[data-ve-edge-id$="source-compose"]');
    const card = document.querySelector('g[data-graphic-object$="/scene-card"]');
    return {
      opacity: Number(getComputedStyle(compose).opacity),
      reveal: Number.parseFloat(getComputedStyle(edge).strokeDashoffset),
      composeStroke: getComputedStyle(compose.querySelector('rect')).stroke,
      outputStroke: getComputedStyle(output.querySelector('rect')).stroke,
      cardOpacity: Number(getComputedStyle(card).opacity),
      cardX: card.querySelector('rect').getBoundingClientRect().x,
    };
  });
}

test('public export and individually discoverable components deliver interactive artifacts in Chromium', { timeout: 180_000 }, async (t) => {
  const externalRoot = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'artifacture-consumer-e2e-')));
  let browser;
  try {
    browser = await launchBrowser();
    t.diagnostic(`Required Chromium ${browser.version()}; Node ${process.versions.node}.`);
    mkdirSync(path.join(externalRoot, 'node_modules'), { recursive: true });
    cpSync(path.join(REPO_ROOT, 'node_modules/react'), path.join(externalRoot, 'node_modules/react'), { recursive: true });
    mkdirSync(path.join(externalRoot, 'examples/visual-explainer-mdx'), { recursive: true });
    symlinkSync(path.join(REPO_ROOT, 'visual-explainer-mdx'), path.join(externalRoot, 'visual-explainer-mdx'), 'dir');
    await t.test('an existing interactive example renders from an external package with its own React copy', async () => {
      const source = path.join(externalRoot, 'examples/visual-explainer-mdx/interactive.tsx');
      cpSync(path.join(REPO_ROOT, 'examples/visual-explainer-mdx/interactive.tsx'), source);
      const output = path.join(externalRoot, 'interactive.html');
      succeeds(run(process.execPath, ['scripts/ve-mdx/export.mjs', source, '--out', output, '--draft']));
      const host = await serve(externalRoot);
      const { page, errors } = await openPage(browser, host);
      try {
        await page.goto(host.url + 'interactive.html');
        await page.getByRole('heading', { name: 'Choose a cache freshness policy', exact: true }).waitFor();
        const expiry = page.getByRole('button', { name: 'Time to live', exact: true });
        const version = page.getByRole('button', { name: 'Versioned keys', exact: true });
        const invalidate = page.getByRole('button', { name: 'Invalidate on write', exact: true });
        assert.equal(await expiry.getAttribute('aria-pressed'), 'true');
        await version.click();
        await page.getByRole('heading', { name: 'Store each immutable version under a different key.', exact: true }).waitFor();
        assert.equal(await version.getAttribute('aria-pressed'), 'true');
        assert.equal(await expiry.getAttribute('aria-pressed'), 'false');
        await invalidate.click();
        await page.getByRole('heading', { name: 'Remove the related entry when its source changes.', exact: true }).waitFor();
        await expiry.click();
        await page.getByRole('heading', { name: 'Expire each entry after a fixed duration.', exact: true }).waitFor();
        assert.deepEqual(errors, []);
      } finally { await page.close(); await host.close(); }
    });

    await t.test('discovery, create-only copying, strict build, and responsive reversible motion work through the public CLI', async () => {
      const catalog = JSON.parse(succeeds(components(['list', '--json'])));
      const discoveredIds = catalog.map((block) => block.id);
      assert.equal(new Set(discoveredIds).size, discoveredIds.length, 'Discovery IDs must be unique.');
      assert.ok(discoveredIds.every(id => !id.startsWith('__')), 'Internal copy dependencies must stay hidden.');
      for (const id of ['graphics', 'diagram', 'hairline', 'motion', 'composition', 'slides', 'video', 'charts', 'diagram-canvas', 'diagram-walkthrough', 'data-chart', 'thread-plot', 'code-block', 'diff-block', 'terminal-block', 'json-tree', 'quiz', 'pipeline', 'decision-matrix', 'risk-ledger', 'sequence-scene', 'state-scene', 'layer-scene', 'plot-scene', 'token-scene', 'playhead-scene', 'grid-scene', 'reveal-in-order', 'focus-in-order', 'authored-values', 'narration-cues', 'video-frames', 'follow-path', 'comparison-wipe', 'source-range-focus']) {
        assert.ok(discoveredIds.includes(id), `The public CLI must discover ${id}.`);
      }
      for (const id of ['dag', 'native-clip', 'manim-clip', 'psychopomp-clip']) assert.ok(discoveredIds.includes(id), `The public CLI must discover ${id}.`);
      for (const block of catalog) {
        assert.ok(block.capabilities.length && block.primitives.length && block.reuseLevels.length && block.delivery.length);
        assert.ok(block.entryPoints.length && block.constraints.length && block.examples.length && block.files.length);
        assert.ok(Array.isArray(block.variants));
        for (const variant of block.variants) assert.ok(variant.name && variant.api && variant.parameter);
        assert.equal(block.addCommand, `artifacture add ${block.id} --cwd .`);
        assert.equal(block.sourceDirectory.default, 'src/artifacture');
        for (const entry of block.entryPoints) assert.equal(entry.defaultImport, `./artifacture/${entry.module}`);
        for (const example of block.examples) assert.ok(existsSync(path.join(REPO_ROOT, example)), example);
      }
      for (const [query, expected] of [['CIRCLE', ['graphics']], ['focus', ['motion', 'focus-in-order', 'follow-path', 'source-range-focus']], ['threads', ['charts', 'thread-plot']], ['sampleScene', ['motion']], ['path reveal', ['motion', 'reveal-in-order']], ['JsonTree', ['json-tree']], ['split', ['diff-block', 'comparison-wipe']], ['scatter', ['plot-scene']], ['createGridScene', ['grid-scene']], ['DataChart', ['data-chart']], ['monotone', ['authored-values']], ['createVectorTrack', ['authored-values']], ['SRT', ['narration-cues']], ['truncate', ['narration-cues']], ['nearest', ['video-frames']], ['inspectLoopFrames', ['video-frames']], ['prepareGraphicRoute', ['follow-path']], ['timestamp wait', ['follow-path']], ['comparisonWipe', ['comparison-wipe']], ['focusSourceRange', ['source-range-focus']]]) {
        const found = JSON.parse(succeeds(components(['list', '--query', query, '--json']))).map((block) => block.id);
        for (const id of expected) assert.ok(found.includes(id), `${query} must discover ${id}.`);
      }
      for (const id of ['authored-values', 'narration-cues', 'video-frames']) {
        const block = catalog.find(block => block.id === id);
        assert.deepEqual(block.dependencies, {});
        assert.deepEqual(block.devDependencies, {});
        assert.deepEqual(block.stylesheets, []);
        assert.deepEqual(block.files.map(file => file.destination), ['LICENSE', ...(id === 'video-frames' ? [] : ['LEMO-LICENSE']), `${id}.ts`]);
      }
      assert.deepEqual(JSON.parse(succeeds(components(['list', '--query', 'spring', '--json']))).map(block => block.id), ['psychopomp-clip', 'hairline']);
      assert.deepEqual(JSON.parse(succeeds(components(['list', '--query', 'elastic-spring', '--json']))), []);
      assert.ok(!JSON.parse(succeeds(components(['list', '--query', 'GraphicScene', '--json']))).some((block) => block.id === 'charts'));
      const workspace = path.join(externalRoot, 'workspace');
      assert.match(succeeds(components(['init', workspace, '--dry-run'])), /Dry run:/);
      assert.equal(existsSync(workspace), false);
      assert.match(succeeds(components(['init', workspace])), /files created/);
      const beforeAdd = snapshot(workspace);
      assert.match(succeeds(components(['add', 'hairline', 'charts', '--cwd', workspace, '--dry-run'])), /lieflat-charts\.tsx/);
      assert.deepEqual(snapshot(workspace), beforeAdd);
      succeeds(components(['add', 'hairline', 'charts', '--cwd', workspace]));
      const beforeRerun = snapshot(workspace);
      assert.match(succeeds(components(['init', workspace])), /0 files created/);
      assert.match(succeeds(components(['add', 'hairline', 'charts', '--cwd', workspace])), /0 files created/);
      assert.deepEqual(snapshot(workspace), beforeRerun);
      const motionFile = path.join(workspace, 'src/artifacture/graphic-motion.ts');
      const original = readFileSync(motionFile);
      writeFileSync(motionFile, Buffer.concat([original, Buffer.from('\n// Editable source owned by this consumer.\n')]));
      const editedSnapshot = snapshot(workspace);
      const conflict = components(['add', 'motion', 'slides', 'video', '--cwd', workspace]);
      assert.notEqual(conflict.status, 0);
      assert.match(conflict.stderr, /No files were written/);
      assert.match(conflict.stderr, /graphic-motion\.ts/);
      assert.deepEqual(snapshot(workspace), editedSnapshot);
      assert.equal(existsSync(path.join(workspace, 'src/artifacture/graphic-slides.tsx')), false);
      writeFileSync(motionFile, original);
      succeeds(components(['add', ...catalog.map(block => block.id), '--cwd', workspace]));
      for (const block of catalog) for (const file of block.files) assert.deepEqual(readFileSync(path.join(workspace, 'src/artifacture', file.destination)), readFileSync(path.join(REPO_ROOT, file.source)));
      const allCopied = snapshot(workspace);
      assert.match(succeeds(components(['add', ...catalog.map(block => block.id), '--cwd', workspace])), /0 files created/);
      assert.deepEqual(snapshot(workspace), allCopied);
      symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(workspace, 'node_modules'), 'dir');
      t.diagnostic('This CI consumer uses copied package source and the repository dependency runtime. Independent packed installation is verified separately.');
      succeeds(run('npm', ['run', 'build'], workspace));
      const host = await serve(path.join(workspace, 'dist'));
      const { page, errors } = await openPage(browser, host);
      try {
        await page.goto(host.url);
        await page.getByRole('heading', { name: 'Build the explanation from source.', exact: true }).waitFor();
        for (const width of [1280, 390]) {
          await page.setViewportSize({ width, height: 900 });
          await page.locator(`[data-graphic-scene="source-to-output-composition-${width <= 640 ? 'vertical' : 'horizontal'}"]`).waitFor({ state: 'visible' });
          const start = await seek(page, 0);
          const transition = await seek(page, 0.7);
          const focus = await seek(page, 1.5);
          const hold = await seek(page, 2.05);
          const fadingCard = await seek(page, 2.2);
          const readyCard = await seek(page, 2.4);
          const movingCard = await seek(page, 2.85);
          const end = await seek(page, 4);
          assert.equal(start.opacity, 0);
          assert.ok(transition.opacity > 0 && transition.opacity < 1);
          assert.ok(transition.reveal > 0 && transition.reveal < start.reveal);
          assert.equal(focus.opacity, 1);
          assert.equal(focus.reveal, 0);
          assert.notEqual(focus.composeStroke, transition.composeStroke);
          assert.equal(hold.composeStroke, focus.composeStroke);
          assert.equal(readyCard.composeStroke, transition.composeStroke);
          assert.ok(fadingCard.cardOpacity > 0 && fadingCard.cardOpacity < 1);
          assert.equal(readyCard.cardOpacity, 1);
          assert.ok(movingCard.cardX > readyCard.cardX && movingCard.cardX < end.cardX);
          assert.notEqual(end.outputStroke, start.outputStroke);
          assert.deepEqual(await seek(page, 0.7), transition);
          assert.deepEqual(await seek(page, 0), start);
          await seek(page, 4);
          const layout = await page.evaluate(() => {
            const nodes = ['Source', 'Compose', 'Output'].map((label) => {
              const node = document.querySelector(`[data-ve-label="${label}"]`);
              const box = node.getBoundingClientRect();
              return { x: box.x + box.width / 2, y: box.y + box.height / 2, textHeight: node.querySelector('text').getBoundingClientRect().height };
            });
            return { nodes, overflow: document.documentElement.scrollWidth > window.innerWidth };
          });
          assert.equal(layout.overflow, false);
          assert.ok(layout.nodes.every((node) => node.textHeight >= 12));
          if (width === 390) {
            assert.ok(layout.nodes[0].y < layout.nodes[1].y && layout.nodes[1].y < layout.nodes[2].y);
            assert.ok(Math.abs(layout.nodes[0].x - layout.nodes[1].x) < 3);
          } else {
            assert.ok(layout.nodes[0].x < layout.nodes[1].x && layout.nodes[1].x < layout.nodes[2].x);
            assert.ok(Math.abs(layout.nodes[0].y - layout.nodes[1].y) < 3);
          }
        }
        assert.deepEqual(errors, []);
      } finally { await page.close(); await host.close(); }
    });

    await t.test('the authored component gallery builds from copied leaves and supports themes, seeking, and component interactions', async () => {
      const workspace = path.join(externalRoot, 'workspace');
      writeFileSync(path.join(workspace, 'src/App.tsx'), readFileSync(path.join(REPO_ROOT, 'examples/visual-explainer-mdx/component-catalog.tsx'), 'utf8').replaceAll('../../visual-explainer-mdx/', './artifacture/'));
      cpSync(path.join(REPO_ROOT, 'examples/visual-explainer-mdx/component-catalog.css'), path.join(workspace, 'src/component-catalog.css'));
      writeFileSync(path.join(workspace, 'src/dag-source.ts'), readFileSync(path.join(REPO_ROOT, 'examples/visual-explainer-mdx/dag-source.ts'), 'utf8').replaceAll('../../visual-explainer-mdx/', './artifacture/'));
      succeeds(run('npm', ['run', 'build'], workspace));
      const host = await serve(path.join(workspace, 'dist'));
      const { page, errors } = await openPage(browser, host);
      try {
        await page.goto(host.url);
        await page.getByRole('heading', { name: 'Reusable visual components', exact: true }).waitFor();
        await page.getByRole('heading', { name: 'Dependency DAG', exact: true }).waitFor();
        const dag = page.locator('.ve-dag');
        await dag.getByRole('button', { name: 'Composition', exact: true }).click();
        await dag.getByRole('button', { name: 'Composition', exact: true }).press('ArrowDown');
        await page.waitForFunction(() => document.querySelector('.ve-dag-relationships strong')?.textContent === 'Poster');
        assert.equal(await dag.locator('.ve-dag-relationships').innerText(), 'Poster\nDepends on: Composition.\nNo downstream dependents.\nClear focus');
        await dag.getByRole('button', { name: 'Clear focus', exact: true }).click();
        assert.equal(await dag.locator('.ve-dag-relationships').innerText(), 'Select or focus an item to trace its dependencies.');
        for (const heading of ['Sequence messages', 'State transitions', 'Nested layers', 'Line plots', 'Scatter plots', 'Token sequences', 'Timed events', 'Scalar grids', 'Monotone parameter tracks', 'Narration cues and subtitles', 'Frame plans and loop endpoints', 'Bar chart', 'Line chart', 'Dot chart', 'Record threads', 'Annotated code', 'unified diff', 'split diff', 'Command transcript', 'Expandable scene data', 'Check understanding', 'Ordered steps', 'Compare choices', 'Document a concrete risk']) {
          await page.getByRole('heading', { name: heading, exact: true }).waitFor();
        }
        const theme = page.getByRole('combobox', { name: 'Theme', exact: true });
        for (const preset of ['hairline', '3b1b', 'mono-color', 'algebrica']) {
          await theme.selectOption(preset);
          await page.waitForFunction(value => document.querySelector('main')?.getAttribute('data-ve-preset') === value, preset);
          assert.ok(await page.locator('main').evaluate(element => getComputedStyle(element).getPropertyValue('--ve-accent').trim()));
        }
        await theme.selectOption('hairline');
        const slider = page.getByRole('slider', { name: 'Authored time', exact: true });
        for (const width of [1280, 390]) {
          await page.setViewportSize({ width, height: 900 });
          await page.waitForFunction(() => document.querySelector('[data-loop-inspection]')?.textContent === 'Endpoint closed: yes. Last encoded frame matches start: no. 26 frames cover 1.0833 seconds.');
          assert.equal(await page.locator('[data-loop-inspection]').innerText(), 'Endpoint closed: yes. Last encoded frame matches start: no. 26 frames cover 1.0833 seconds.');
          const frames = [];
          for (const seconds of [0, 1.2, 2.4, 4.2, 6, 1.2, 0]) {
            await slider.press('Home');
            for (let step = 0; step < Math.round(seconds / 0.6); step += 1) await slider.press('PageUp');
            assert.equal(Number(await slider.inputValue()), seconds);
            await page.waitForFunction(value => document.querySelector('output')?.textContent === value, `${seconds.toFixed(2)} s`);
            frames.push(await page.evaluate(() => {
              const sequence = document.querySelector('[data-graphic-scene="messages"] [data-graphic-object="message:request"]');
              const state = document.querySelector('[data-graphic-scene="states"] [data-ve-label="Running"] rect');
              const path = document.querySelector('[data-graphic-scene="cost-curve"] [data-graphic-object="series:latency"] path');
              const playhead = document.querySelector('[data-graphic-scene="events"] [data-graphic-object="playhead"]');
              const parameter = document.querySelector('[data-graphic-scene="monotone-playhead"] [data-graphic-object="playhead"]');
              return { opacity: Number(getComputedStyle(sequence).opacity), focus: getComputedStyle(state).stroke, reveal: Number.parseFloat(getComputedStyle(path).strokeDashoffset), playheadX: playhead.getBoundingClientRect().x, parameterX: parameter.getBoundingClientRect().x, caption: document.querySelector('[data-narration-preview]').textContent };
            }));
          }
          const [start, early, later, held, end, reverseEarly, reverseStart] = frames;
          assert.equal(start.opacity, 0);
          assert.equal(early.opacity, 1);
          assert.notEqual(early.focus, later.focus);
          assert.ok(early.reveal > 0 && early.reveal < start.reveal);
          assert.equal(end.reveal, 0);
          assert.ok(start.playheadX < early.playheadX && early.playheadX < later.playheadX && later.playheadX < end.playheadX);
          assert.ok(start.parameterX < early.parameterX && early.parameterX < later.parameterX && later.parameterX < held.parameterX);
          assert.equal(held.parameterX, end.parameterX);
          assert.ok((early.parameterX - start.parameterX) / (end.parameterX - start.parameterX) < (early.playheadX - start.playheadX) / (end.playheadX - start.playheadX));
          assert.equal(start.caption, 'Receive a request.');
          assert.equal(early.caption, start.caption);
          assert.equal(later.caption, 'Validate the data.');
          assert.equal(held.caption, 'Return the result.');
          assert.equal(end.caption, 'Narration complete.');
          assert.deepEqual(reverseEarly, early);
          assert.deepEqual(reverseStart, start);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
        }
        await page.getByText('Inspect the WebVTT output', { exact: true }).click();
        const subtitles = page.locator('details').filter({ has: page.getByText('Inspect the WebVTT output', { exact: true }) });
        assert.ok(await subtitles.locator('pre').isVisible());
        const vtt = await subtitles.locator('code').innerText();
        assert.ok(vtt.startsWith('WEBVTT\n\n'));
        for (const interval of ['00:00:00.000 --> 00:00:02.000', '00:00:02.000 --> 00:00:04.000', '00:00:04.000 --> 00:00:06.000']) assert.ok(vtt.includes(interval));
        const walkthrough = page.getByRole('region', { name: 'Request walkthrough', exact: true });
        await walkthrough.getByRole('button', { name: 'Next', exact: true }).click();
        await walkthrough.getByText('Only a validated request reaches storage.', { exact: true }).waitFor();
        await walkthrough.getByRole('button', { name: 'Previous', exact: true }).click();
        await walkthrough.getByText('The handler validates the incoming request.', { exact: true }).waitFor();
        const quiz = page.getByRole('group', { name: 'Which layer owns authored time?', exact: true });
        await quiz.getByRole('button', { name: /Graphic primitives/ }).click();
        await page.getByText('Primitives describe geometry; they do not run a clock.', { exact: true }).waitFor();
        await quiz.getByRole('button', { name: /Motion tracks/ }).click();
        await page.getByText('Tracks map explicit seconds to changes on stable object IDs.', { exact: true }).waitFor();
        assert.equal(await quiz.getByRole('button', { name: /Motion tracks/ }).getAttribute('aria-pressed'), 'true');
        const json = page.locator('[data-ve-json-tree]');
        const branch = json.locator('details').filter({ has: page.locator('summary', { hasText: '"bounds"' }) }).last();
        assert.equal(await branch.getAttribute('open'), null);
        await branch.locator('summary').click();
        assert.notEqual(await branch.getAttribute('open'), null);
        assert.ok(await branch.getByText('720', { exact: true }).isVisible());
        await branch.locator('summary').click();
        assert.equal(await branch.getAttribute('open'), null);
        await page.getByRole('combobox', { name: 'Trace a Requests', exact: true }).selectOption('b');
        await page.locator('.ve-thread-selection').getByText('b', { exact: true }).waitFor();
        assert.match(await page.locator('.ve-thread-selection').innerText(), /API → Valid → Pending/);
        assert.deepEqual(errors, []);
      } finally { await page.close(); await host.close(); }
    });

    await t.test('learning a design system from actual code applies its generated tokens to an exported example', async () => {
      const registry = path.join(externalRoot, 'learned-designs');
      const name = 'consumer-learned';
      const learned = succeeds(run(process.execPath, ['scripts/ve-mdx/learn.mjs', 'tools/archify-theme.css', '--name', name, '--out', registry]));
      assert.match(learned, /Learned design system/);
      const tokens = readFileSync(path.join(registry, name, 'tokens.css'), 'utf8');
      const bg = tokens.match(/--ve-bg:\s*(#[a-f\d]{6})/i)?.[1];
      assert.ok(bg, 'The generated design system must provide its page background.');
      const source = path.join(externalRoot, 'examples/visual-explainer-mdx/learned-poster.tsx');
      writeFileSync(source, readFileSync(path.join(REPO_ROOT, 'examples/visual-explainer-mdx/poster-card.tsx'), 'utf8').replace('preset="mono-color"', `preset="${name}"`));
      const output = path.join(externalRoot, 'learned-poster.html');
      succeeds(run(process.execPath, ['scripts/ve-mdx/export.mjs', source, '--out', output, '--draft'], REPO_ROOT, { ...process.env, ARTIFACTURE_DESIGN_DIR: registry }));
      const host = await serve(externalRoot);
      const { page, errors } = await openPage(browser, host);
      try {
        await page.goto(host.url + 'learned-poster.html');
        await page.getByRole('heading', { name: 'When to stop retrying', exact: true }).waitFor();
        const actual = await page.locator(`[data-ve-preset="${name}"]`).evaluate((poster) => ({ token: getComputedStyle(poster).getPropertyValue('--ve-bg').trim(), background: getComputedStyle(poster).backgroundColor }));
        assert.equal(actual.token.toLowerCase(), bg.toLowerCase());
        const rgb = [1, 3, 5].map((offset) => Number.parseInt(bg.slice(offset, offset + 2), 16)).join(', ');
        assert.equal(actual.background, `rgb(${rgb})`);
        assert.deepEqual(errors, []);
      } finally { await page.close(); await host.close(); }
    });
  } finally {
    await browser?.close();
    rmSync(externalRoot, { recursive: true, force: true });
  }
});

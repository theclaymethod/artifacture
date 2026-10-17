import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { chromium } from 'playwright';

const SCRIPT = fileURLToPath(new URL('./preview.mjs', import.meta.url));
const ROOT = resolve(import.meta.dirname, '../../..');
const EXPORTER = join(ROOT, 'scripts/ve-mdx/export.mjs');
const EXAMPLE = join(ROOT, 'examples/visual-explainer-mdx/preset-artifact.tsx');
const TITLE = 'Queue work until a worker is ready';

async function launchPreview(filePath) {
  const child = spawn(process.execPath, [SCRIPT, filePath, '--no-open', '--port', '0'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const url = await new Promise((resolveUrl, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Preview CLI did not start: ${output}`));
    }, 10_000);
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/Visual Explainer preview: (http:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolveUrl(match[1]); }
    });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Preview CLI exited ${code}: ${output}`)); });
  });
  return { url, async close() {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, 'exit');
      child.kill();
      await closed;
    }
  } };
}

async function readPreviewMeta(preview) {
  return fetch(`${preview.url}/__ve/meta`).then((response) => response.json());
}

function postPreview(preview, session, endpoint, body, { headers = {} } = {}) {
  return fetch(`${preview.url}/__ve/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `__ve_preview_session=${session}`,
      Origin: preview.url, 'Sec-Fetch-Site': 'same-origin', ...headers },
    body: String(body) === body ? body : JSON.stringify(body),
  });
}

function exportArtifact(source, output) {
  const result = spawnSync(process.execPath, [EXPORTER, source, '--out', output], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function publisherCommand(source, output) {
  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  return `cd ${quote(ROOT)} && ${quote(process.execPath)} ${quote(EXPORTER)} ${quote(source)} --out ${quote(output)}`;
}

test('preview CLI patches, undoes and returns review notes without changing untouched saved HTML', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 've-preview-test-'));
  const filePath = join(directory, 'deck.html');
  const original = '<!doctype html><html><body><h1>Original heading</h1></body></html>';
  await writeFile(filePath, original);
  const preview = await launchPreview(filePath);
  context.after(async () => { await preview.close(); await rm(directory, { recursive: true, force: true }); });
  const meta = await readPreviewMeta(preview);
  assert.equal((await fetch(`${preview.url}${meta.artifactUrl}`)).status, 200);
  assert.equal(await readFile(filePath, 'utf8'), original);
  const patch = await postPreview(preview, meta.session, 'patch', {
    after: 'Edited heading', anchor: { selector: 'h1' }, artifactRevision: meta.artifactRevision, before: 'Original heading',
  });
  assert.equal(patch.status, 200);
  assert.equal(await readFile(filePath, 'utf8'), original.replace('Original heading', 'Edited heading'));
  const undo = await postPreview(preview, meta.session, 'undo', {});
  assert.equal(undo.status, 200);
  assert.equal(await readFile(filePath, 'utf8'), original);
  const review = await postPreview(preview, meta.session, 'review', {
    annotations: [{ number: 1, comment: 'Tighten this.', anchor: { selector: 'h1', tagName: 'h1' } }],
  });
  assert.equal(review.status, 200);
  assert.match((await review.json()).markdown, /Tighten this\./);
  for (const endpoint of ['patch', 'review']) {
    assert.equal((await postPreview(preview, meta.session, endpoint, 'null')).status, 400);
  }
});

test('preview HTTP mutations reject missing sessions, cross-origin requests and non-JSON bodies', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 've-preview-auth-'));
  const filePath = join(directory, 'deck.html');
  const original = '<!doctype html><h1>Original heading</h1>';
  await writeFile(filePath, original);
  const preview = await launchPreview(filePath);
  context.after(async () => { await preview.close(); await rm(directory, { recursive: true, force: true }); });
  const meta = await readPreviewMeta(preview);
  const patch = { after: 'Edited heading', anchor: { selector: 'h1' }, artifactRevision: meta.artifactRevision, before: 'Original heading' };
  for (const [endpoint, body] of [['patch', patch], ['undo', {}], ['review', { annotations: [] }], ['publish', {}]]) {
    const unauthorized = await fetch(`${preview.url}/__ve/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: preview.url, 'Sec-Fetch-Site': 'same-origin' },
      body: JSON.stringify(body),
    });
    assert.equal(unauthorized.status, 403, endpoint);
  }
  for (const [headers, expected] of [
    [{ Origin: 'https://example.invalid' }, 403],
    [{ 'Sec-Fetch-Site': 'cross-site' }, 403],
    [{ 'Content-Type': 'text/plain' }, 415],
  ]) assert.equal((await postPreview(preview, meta.session, 'patch', patch, { headers })).status, expected);
  assert.equal(await readFile(filePath, 'utf8'), original);
});

test('concurrent HTTP edits allow one revision and preserve undo', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 've-preview-concurrency-'));
  const filePath = join(directory, 'deck.html');
  const original = '<!doctype html><h1>Original heading</h1>';
  await writeFile(filePath, original);
  const preview = await launchPreview(filePath);
  context.after(async () => { await preview.close(); await rm(directory, { recursive: true, force: true }); });
  const meta = await readPreviewMeta(preview);
  const request = (after) => postPreview(preview, meta.session, 'patch', {
    after, anchor: { selector: 'h1' }, artifactRevision: meta.artifactRevision, before: 'Original heading',
  });
  const responses = await Promise.all([request('First edit'), request('Second edit')]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  const written = await readFile(filePath, 'utf8');
  assert.ok(written === original.replace('Original heading', 'First edit') || written === original.replace('Original heading', 'Second edit'));
  assert.equal((await postPreview(preview, meta.session, 'undo', {})).status, 200);
  assert.equal(await readFile(filePath, 'utf8'), original);
});

test('an actual failed export rolls back selected authored sources and regenerated HTML', async (context) => {
  await mkdir(join(ROOT, '.ve-mdx-tmp'), { recursive: true });
  const directory = await mkdtemp(join(ROOT, '.ve-mdx-tmp/preview-rollback-'));
  const output = join(directory, 'dist/deck.html');
  const firstSource = join(directory, 'source.tsx');
  const secondSource = join(directory, 'second.tsx');
  const originalSource = await readFile(EXAMPLE, 'utf8');
  await writeFile(firstSource, originalSource);
  await writeFile(secondSource, originalSource);
  exportArtifact(firstSource, output);
  const originalHtml = await readFile(output, 'utf8');
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module', scripts: {
    export: `${publisherCommand(firstSource, output)} && ${publisherCommand(join(directory, 'missing.tsx'), output)}`,
  } }));
  const preview = await launchPreview(output);
  context.after(async () => { await preview.close(); await rm(directory, { recursive: true, force: true }); });
  const meta = await readPreviewMeta(preview);
  const response = await postPreview(preview, meta.session, 'patch', {
    after: 'An edit that must roll back', anchor: { selector: 'h1', tagName: 'h1' },
    artifactRevision: meta.artifactRevision, before: TITLE, replaceAll: true,
  });
  assert.equal(response.status, 422, await response.text());
  assert.equal(await readFile(firstSource, 'utf8'), originalSource);
  assert.equal(await readFile(secondSource, 'utf8'), originalSource);
  assert.equal(await readFile(output, 'utf8'), originalHtml);
});

test('preview CLI rejects a malformed owning package manifest', async () => {
  const directory = await mkdtemp(join(tmpdir(), 've-preview-manifest-'));
  try {
    const artifact = join(directory, 'deck.html');
    await writeFile(artifact, '<!doctype html><h1>Deck</h1>');
    await writeFile(join(directory, 'package.json'), '{ invalid json');
    const result = spawnSync(process.execPath, [SCRIPT, artifact, '--no-open'], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid JSON in .*package\.json/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('browser editing, undo and publish operate real TSX and exporter output', async (context) => {
  await mkdir(join(ROOT, '.ve-mdx-tmp'), { recursive: true });
  const directory = await mkdtemp(join(ROOT, '.ve-mdx-tmp/preview-react-'));
  const output = join(directory, 'dist/deck.html');
  const source = join(directory, 'source.tsx');
  const originalSource = await readFile(EXAMPLE, 'utf8');
  await writeFile(source, originalSource);
  exportArtifact(source, output);
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module', scripts: { export: publisherCommand(source, output) } }));
  const preview = await launchPreview(output);
  let browser;
  context.after(async () => { await browser?.close(); await preview.close(); await rm(directory, { recursive: true, force: true }); });
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(preview.url);
  const heading = page.frameLocator('#artifact-frame').locator('h1').first();
  await heading.waitFor();
  assert.equal(await heading.textContent(), TITLE);
  await page.locator('[data-mode="edit"]').click();
  await heading.click();
  await heading.fill('Queue work while workers are busy');
  const saved = page.waitForResponse((response) => response.url().endsWith('/__ve/patch') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save text', exact: true }).click();
  assert.equal((await saved).status(), 200);
  await page.waitForFunction(() => document.querySelector('#edit-bar').hidden);
  await page.frameLocator('#artifact-frame').getByRole('heading', { name: 'Queue work while workers are busy', exact: true }).waitFor();
  assert.equal(await readFile(source, 'utf8'), originalSource.replace(TITLE, 'Queue work while workers are busy'));
  await page.locator('[aria-label="More preview actions"]').click();
  const undone = page.waitForResponse((response) => response.url().endsWith('/__ve/undo'));
  await page.getByRole('button', { name: 'Undo last text edit' }).click();
  assert.equal((await undone).status(), 200);
  assert.equal(await readFile(source, 'utf8'), originalSource);
  await page.reload();
  await heading.waitFor();
  assert.equal(await heading.textContent(), TITLE);

  await writeFile(source, originalSource.replace(TITLE, 'Published queue workflow'));
  const published = page.waitForResponse((response) => response.url().endsWith('/__ve/publish'));
  await page.getByRole('button', { name: 'Publish HTML' }).click();
  assert.equal((await published).status(), 200);
  await page.reload();
  await heading.waitFor();
  assert.equal(await heading.textContent(), 'Published queue workflow');
  const meta = await readPreviewMeta(preview);
  const review = await postPreview(preview, meta.session, 'review', { annotations: [{
    number: 1, comment: 'Shorten this.',
    anchor: { selector: 'h1', tagName: 'h1', text: 'Published queue workflow' },
  }] });
  assert.equal(review.status, 200);
  const notes = await review.json();
  assert.equal(notes.resolved, 1);
  assert.match(notes.markdown, /source\.tsx/);
  assert.match(notes.markdown, /Shorten this\./);
});

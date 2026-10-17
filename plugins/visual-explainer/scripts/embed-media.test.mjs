import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { chromium } from 'playwright';

const script = fileURLToPath(new URL('./embed-media.sh', import.meta.url));
const image = fileURLToPath(new URL('../../../docs/img/examples/diagram.png', import.meta.url));

test('embed-media emits a decodable self-contained image with the authored alt text', async () => {
  const workDir = await mkdtemp(path.join(tmpdir(), 'embed-media-test-'));
  const browser = await chromium.launch();
  try {
    const alt = `A&B <"quoted"> 'single'`;
    const result = spawnSync('bash', [script, image, alt], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const artifact = path.join(workDir, 'embedded.html');
    await writeFile(artifact, `<!doctype html><html><body>${result.stdout}</body></html>`);
    const page = await browser.newPage();
    await page.goto(pathToFileURL(artifact).href);
    await page.locator('img').evaluate((element) => element.decode());
    assert.deepEqual(await page.locator('img').evaluate((element) => ({
      alt: element.alt,
      valid: element.complete && element.naturalWidth > 0 && element.naturalHeight > 0,
      embedded: element.currentSrc.startsWith('data:image/png;base64,'),
    })), { alt, valid: true, embedded: true });
  } finally {
    await browser.close();
    await rm(workDir, { recursive: true, force: true });
  }
});

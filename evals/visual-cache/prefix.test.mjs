import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { attachCriterionSuffix, buildPrefixManifest } from './prefix.mjs';

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'artifacture-prefix-'));
  const first = path.join(dir, 'first.png');
  const second = path.join(dir, 'second.png');
  await fs.writeFile(first, Buffer.from('image-one'));
  await fs.writeFile(second, Buffer.from('image-two'));
  return { dir, first, second };
}

function options(paths) {
  return {
    provider: 'openai',
    model: 'small-vision-model',
    systemText: 'Return verdict JSON only.',
    sharedInstructions: 'Inspect only the supplied evidence.',
    designSystemText: 'Use the active design system as an exception source.',
    toolsJson: '[]',
    images: [
      { id: 's01:dark', path: paths.first, detail: 'high' },
      { id: 's01:light', path: paths.second, detail: 'high' },
    ],
  };
}

test('identical evidence produces an identical prefix id', async (t) => {
  const paths = await fixture();
  t.after(() => fs.rm(paths.dir, { recursive: true, force: true }));
  const a = await buildPrefixManifest(options(paths));
  const b = await buildPrefixManifest(options(paths));
  assert.equal(a.prefix_id, b.prefix_id);
});

test('stable state ids canonicalize image order', async (t) => {
  const paths = await fixture();
  t.after(() => fs.rm(paths.dir, { recursive: true, force: true }));
  const a = await buildPrefixManifest(options(paths));
  const reversed = options(paths);
  reversed.images.reverse();
  const b = await buildPrefixManifest(reversed);
  assert.equal(a.prefix_id, b.prefix_id);
  assert.deepEqual(a.images.map((image) => image.id), ['s01:dark', 's01:light']);
});

test('changing image bytes invalidates the prefix', async (t) => {
  const paths = await fixture();
  t.after(() => fs.rm(paths.dir, { recursive: true, force: true }));
  const a = await buildPrefixManifest(options(paths));
  await fs.writeFile(paths.first, Buffer.from('image-one-changed'));
  const b = await buildPrefixManifest(options(paths));
  assert.notEqual(a.prefix_id, b.prefix_id);
});

test('changing image detail invalidates the prefix', async (t) => {
  const paths = await fixture();
  t.after(() => fs.rm(paths.dir, { recursive: true, force: true }));
  const a = await buildPrefixManifest(options(paths));
  const changed = options(paths);
  changed.images[0].detail = 'low';
  const b = await buildPrefixManifest(changed);
  assert.notEqual(a.prefix_id, b.prefix_id);
});

test('changing model or tools invalidates the prefix', async (t) => {
  const paths = await fixture();
  t.after(() => fs.rm(paths.dir, { recursive: true, force: true }));
  const a = await buildPrefixManifest(options(paths));
  const modelChanged = options(paths);
  modelChanged.model = 'another-model';
  const b = await buildPrefixManifest(modelChanged);
  const toolsChanged = options(paths);
  toolsChanged.toolsJson = '[{"name":"read"}]';
  const c = await buildPrefixManifest(toolsChanged);
  assert.notEqual(a.prefix_id, b.prefix_id);
  assert.notEqual(a.prefix_id, c.prefix_id);
});

test('criterion suffixes share the prefix without sharing verdict content', async (t) => {
  const paths = await fixture();
  t.after(() => fs.rm(paths.dir, { recursive: true, force: true }));
  const prefix = await buildPrefixManifest(options(paths));
  const layout = attachCriterionSuffix(prefix, {
    pass: 'layout',
    criteria: ['layout-repeated-track-symmetry'],
    prompt: 'Judge repeated-track symmetry.',
  });
  const slop = attachCriterionSuffix(prefix, {
    pass: 'artifacture:slop-gap',
    criteria: ['artifact-slop-false-state'],
    prompt: 'Judge decorative text scaffolding.',
  });
  assert.equal(layout.prefix_id, slop.prefix_id);
  assert.notEqual(layout.suffix_sha256, slop.suffix_sha256);
});

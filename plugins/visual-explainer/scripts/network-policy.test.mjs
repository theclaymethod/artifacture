import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serveBrowserArtifact } from './browser-assets.mjs';
import { isAllowedBrowserRequest } from './network-policy.mjs';

test('browser request policy preserves font and Mermaid dependencies', () => {
  for (const url of [
    'file:///tmp/artifact.html',
    'data:text/css,body{}',
    'blob:https://example.com/id',
    'https://fonts.googleapis.com/css2?family=Inter',
    'https://fonts.gstatic.com/s/inter/v1/font.woff2',
    'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs',
  ]) {
    assert.equal(isAllowedBrowserRequest(url), true, url);
  }
});

test('browser request policy compares exact origins and constrains jsDelivr to Mermaid', () => {
  for (const url of [
    'https://fonts.googleapis.com.evil.example/css2',
    'https://fonts.googleapis.com@evil.example/css2',
    'https://cdn.jsdelivr.net.evil.example/npm/mermaid@11/dist/mermaid.js',
    'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.js',
    'https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.js',
    'not a URL',
  ]) {
    assert.equal(isAllowedBrowserRequest(url), false, url);
  }
});

test('browser request policy accepts only an exact additional origin', () => {
  const options = { additionalOrigins: ['http://127.0.0.1:9912'] };
  assert.equal(isAllowedBrowserRequest('http://127.0.0.1:9912/index.html', options), true);
  assert.equal(isAllowedBrowserRequest('http://127.0.0.1:9913/index.html', options), false);
  assert.equal(isAllowedBrowserRequest('http://127.0.0.1:9912.evil.example/index.html', options), false);
});

test('image and corpus purposes admit only their local representations', () => {
  for (const purpose of ['image', 'corpus']) {
    assert.equal(isAllowedBrowserRequest('data:image/png;base64,aA==', { purpose }), true);
    assert.equal(isAllowedBrowserRequest('about:blank', { purpose }), true);
    for (const url of ['file:///tmp/image.png', 'https://fonts.googleapis.com/css2', 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.js', 'https://example.com/image.png']) {
      assert.equal(isAllowedBrowserRequest(url, { purpose }), false, `${purpose}: ${url}`);
    }
  }
  assert.equal(isAllowedBrowserRequest('blob:https://example.com/id', { purpose: 'image' }), false);
  assert.equal(isAllowedBrowserRequest('blob:https://example.com/id', { purpose: 'corpus' }), true);
});

test('local artifact serving contains decoded paths and symlinks while serving relative assets', async () => {
  const work = await mkdtemp(path.join(tmpdir(), 'artifacture-assets-'));
  const root = path.join(work, 'root');
  const sibling = path.join(work, 'root-sibling');
  let server;
  try {
    await mkdir(root);
    await mkdir(sibling);
    await writeFile(path.join(root, 'artifact.html'), '<!doctype html><img src="image.svg">');
    await writeFile(path.join(root, 'image.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(path.join(sibling, 'secret.txt'), 'outside');
    await symlink(path.join(sibling, 'secret.txt'), path.join(root, 'escape.txt'));
    server = await serveBrowserArtifact({ filePath: path.join(root, 'artifact.html') });
    const asset = await fetch(`${server.origin}/image.svg`);
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get('content-type'), 'image/svg+xml');
    assert.match(await asset.text(), /<svg/);
    for (const pathname of ['/%2e%2e%2froot-sibling%2fsecret.txt', '/escape.txt']) {
      const denied = await fetch(`${server.origin}${pathname}`);
      assert.equal(denied.status, 403, pathname);
      assert.doesNotMatch(await denied.text(), /outside/);
    }
    assert.equal((await fetch(`${server.origin}/%ZZ`)).status, 400);
    const other = await serveBrowserArtifact({ filePath: path.join(root, 'artifact.html') });
    try { assert.notEqual(other.origin, server.origin); }
    finally { await other.close(); }
  } finally {
    await server?.close();
    await rm(work, { recursive: true, force: true });
  }
});

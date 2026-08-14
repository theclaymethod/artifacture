import assert from 'node:assert/strict';
import { test } from 'node:test';
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

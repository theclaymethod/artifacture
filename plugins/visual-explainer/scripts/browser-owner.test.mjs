import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openBrowserSession } from './browser-owner.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'artifacture-owner-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'index.html');
  await writeFile(filePath, '<!doctype html><h1>Owned artifact</h1>');
  return { filePath };
}

test('session close owns open leases and their local servers', async (t) => {
  const artifact = await fixture(t);
  const session = await openBrowserSession({ artifact });
  t.after(() => session.close());
  const lease = await session.newPage({ artifact });
  await lease.page.goto(lease.url);
  assert.equal(await lease.page.locator('h1').textContent(), 'Owned artifact');
  await session.close();
  assert.equal(lease.page.isClosed(), true);
  await assert.rejects(fetch(lease.url));
  await assert.rejects(fetch(session.url));
  await assert.rejects(session.newPage(), /closing/);
  await lease.close();
});

test('session close waits for in-flight page allocation and rejects its lease', async (t) => {
  const artifact = await fixture(t);
  const session = await openBrowserSession({ artifact });
  t.after(() => session.close());
  const allocation = session.newPage({ artifact });
  const rejected = assert.rejects(allocation, /closed during page allocation/);
  await session.close();
  await rejected;
  await assert.rejects(fetch(session.url));
});

test('a failed lease close is retained by session cleanup after native resources close', async (t) => {
  const artifact = await fixture(t);
  const session = await openBrowserSession({ artifact });
  const lease = await session.newPage({ artifact });
  const nativeClose = lease.context.close.bind(lease.context);
  lease.context.close = async () => { await nativeClose(); throw new Error('injected close receipt failure'); };
  await assert.rejects(lease.close(), /injected close receipt failure/);
  await assert.rejects(session.close(), /injected close receipt failure/);
  assert.equal(lease.page.isClosed(), true);
  await assert.rejects(fetch(lease.url));
  await assert.rejects(fetch(session.url));
});

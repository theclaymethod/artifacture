import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const script = fileURLToPath(new URL('./embed-media.sh', import.meta.url));

test('embed-media HTML-escapes image alt text', async () => {
  const workDir = await mkdtemp(path.join(tmpdir(), 'embed-media-test-'));
  try {
    const imagePath = path.join(workDir, 'sample.png');
    await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const result = spawnSync('bash', [script, imagePath, `A&B <"quoted"> 'single'`], {
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /alt="A&amp;B &lt;&quot;quoted&quot;&gt; &#39;single&#39;"/);
    assert.doesNotMatch(result.stdout, /alt="A&B/);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const script = fileURLToPath(new URL('./export-slides-pdf.mjs', import.meta.url));

function runExporter(input, output) {
  return spawnSync(process.execPath, [script, input, output, '--mode=slides'], {
    encoding: 'utf8',
    timeout: 30_000,
  });
}

test('PDF exporter completes canvas conversion before writing output', async () => {
  const workDir = await mkdtemp(path.join(tmpdir(), 'export-pdf-test-'));
  try {
    const input = path.join(workDir, 'good.html');
    const output = path.join(workDir, 'good.pdf');
    await writeFile(input, `<!doctype html><html><body>
      <section class="slide"><canvas width="80" height="40"></canvas></section>
      <script>
        addEventListener('load', function() {
          var context = document.querySelector('canvas').getContext('2d');
          context.fillStyle = '#123456';
          context.fillRect(0, 0, 80, 40);
        });
      </script>
    </body></html>`);

    const result = runExporter(input, output);
    assert.equal(result.status, 0, result.stderr);
    await access(output);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test('PDF exporter fails closed when an expected canvas cannot be converted', async () => {
  const workDir = await mkdtemp(path.join(tmpdir(), 'export-pdf-test-'));
  try {
    const input = path.join(workDir, 'broken.html');
    const output = path.join(workDir, 'broken.pdf');
    await writeFile(input, `<!doctype html><html><body>
      <section class="slide"><canvas width="80" height="40"></canvas></section>
      <script>
        HTMLCanvasElement.prototype.toDataURL = function() {
          throw new Error('conversion unavailable');
        };
      </script>
    </body></html>`);

    const result = runExporter(input, output);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Canvas preparation failed; PDF was not exported/);
    await assert.rejects(access(output));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test('PDF exporter fails closed when canvas readiness times out', async () => {
  const workDir = await mkdtemp(path.join(tmpdir(), 'export-pdf-test-'));
  try {
    const input = path.join(workDir, 'timeout.html');
    const output = path.join(workDir, 'timeout.pdf');
    // Without a closing body tag, the exporter cannot inject its readiness
    // script. The live canvas must therefore turn the timeout into a failure.
    await writeFile(input, '<!doctype html><html><body><section class="slide"><canvas></canvas></section>');

    const result = runExporter(input, output);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Canvas preparation failed; PDF was not exported/);
    await assert.rejects(access(output));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

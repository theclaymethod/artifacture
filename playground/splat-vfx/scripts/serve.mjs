#!/usr/bin/env node
/**
 * Zero-build local dev server for the Splat VFX Playground (`deck/` + `fx-lab/`).
 *
 * - Strips TypeScript types on the fly via Node's `stripTypeScriptTypes` (no bundler needed).
 * - Mounts `@sparkjsdev/radix` (`/vendor/radix/`) and `three` (`/vendor/three/`) from the
 *   sibling `../radix` checkout (or `RADIX_ROOT` env var).
 * - Serves 3DGS `.spz` / `.rdx` / `.bin` assets from `playground/splat-vfx/assets/` with
 *   automatic fallback to `${RADIX_ROOT}/examples/artifacture-fx/assets/`.
 */

import { existsSync, createReadStream, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLAYGROUND_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(PLAYGROUND_ROOT, '../..');
const RADIX_ROOT = process.env.RADIX_ROOT || path.resolve(REPO_ROOT, '../radix');
const PORT = Number(process.env.PORT || 4190);
const HOST = process.env.HOST || '127.0.0.1';

process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name !== 'ExperimentalWarning') console.warn(w);
});

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.wav': 'audio/wav',
  '.spz': 'application/octet-stream',
  '.rdx': 'application/octet-stream',
  '.ply': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
};

function safeJoin(root, rel) {
  const clean = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
  const resolved = path.resolve(root, clean);
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

function resolveRequestFile(urlPath) {
  let pathname = decodeURIComponent(urlPath.split('?')[0]);
  if (pathname.endsWith('/')) pathname += 'index.html';

  // 1. Mounted vendor packages from sibling radix checkout
  if (pathname.startsWith('/vendor/radix/')) {
    const rel = pathname.slice('/vendor/radix/'.length);
    return { file: safeJoin(path.join(RADIX_ROOT, 'dist'), rel), stripTs: false };
  }
  if (pathname.startsWith('/vendor/three/')) {
    const rel = pathname.slice('/vendor/three/'.length);
    return { file: safeJoin(path.join(RADIX_ROOT, 'node_modules/three'), rel), stripTs: false };
  }

  // 2. Shared 3DGS assets (local playground/assets first, then radix/examples/artifacture-fx/assets)
  if (pathname.startsWith('/assets/') || pathname.startsWith('/deck/assets/') || pathname.startsWith('/fx-lab/assets/')) {
    const assetRel = pathname.replace(/^\/(?:deck\/|fx-lab\/)?assets\//, '');
    const localCandidate = safeJoin(path.join(PLAYGROUND_ROOT, 'assets'), assetRel);
    if (localCandidate && existsSync(localCandidate) && statSync(localCandidate).isFile()) {
      return { file: localCandidate, stripTs: false };
    }
    const radixCandidate = safeJoin(path.join(RADIX_ROOT, 'examples/artifacture-fx/assets'), assetRel);
    if (radixCandidate && existsSync(radixCandidate) && statSync(radixCandidate).isFile()) {
      return { file: radixCandidate, stripTs: false };
    }
    return { file: null, stripTs: false };
  }

  // 3. Playground files (with .js -> .ts transparent TypeScript stripping)
  const rel = pathname.replace(/^\/+/, '');
  const exact = safeJoin(PLAYGROUND_ROOT, rel);
  if (exact && existsSync(exact)) {
    const st = statSync(exact);
    if (st.isDirectory()) {
      const idx = path.join(exact, 'index.html');
      if (existsSync(idx)) return { file: idx, stripTs: false };
    } else {
      return { file: exact, stripTs: exact.endsWith('.ts') };
    }
  }
  if (rel.endsWith('.js')) {
    const tsPath = safeJoin(PLAYGROUND_ROOT, `${rel.slice(0, -3)}.ts`);
    if (tsPath && existsSync(tsPath) && statSync(tsPath).isFile()) {
      return { file: tsPath, stripTs: true };
    }
  }

  return { file: null, stripTs: false };
}

export function createPlaygroundServer() {
  return http.createServer(async (req, res) => {
    try {
      const urlPath = req.url || '/';
      const { file, stripTs } = resolveRequestFile(urlPath);
      if (!file) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Not found: ${urlPath}`);
        return;
      }

      const commonHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      };

      if (stripTs) {
        const source = await readFile(file, 'utf8');
        const js = stripTypeScriptTypes(source, {
          mode: 'strip',
          sourceUrl: path.relative(PLAYGROUND_ROOT, file),
        });
        res.writeHead(200, {
          ...commonHeaders,
          'Content-Type': 'text/javascript; charset=utf-8',
          'Content-Length': Buffer.byteLength(js),
        });
        res.end(js);
        return;
      }

      const stat = statSync(file);
      const ext = path.extname(file).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      // Support HTTP Range requests for large .rdx/.spz streaming
      const range = req.headers.range;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (match) {
          const start = match[1] ? Number(match[1]) : 0;
          const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
          if (start <= end && start < stat.size) {
            res.writeHead(206, {
              ...commonHeaders,
              'Content-Type': contentType,
              'Accept-Ranges': 'bytes',
              'Content-Range': `bytes ${start}-${end}/${stat.size}`,
              'Content-Length': end - start + 1,
            });
            createReadStream(file, { start, end }).pipe(res);
            return;
          }
        }
      }

      res.writeHead(200, {
        ...commonHeaders,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Content-Length': stat.size,
      });
      createReadStream(file).pipe(res);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(String(err instanceof Error ? err.stack || err.message : err));
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createPlaygroundServer();
  server.listen(PORT, HOST, () => {
    console.log(`[splat-vfx] Playground server running at http://${HOST}:${PORT}/`);
    console.log(`[splat-vfx]   Slide Deck -> http://${HOST}:${PORT}/deck/`);
    console.log(`[splat-vfx]   FX Lab     -> http://${HOST}:${PORT}/fx-lab/`);
    console.log(`[splat-vfx]   Radix root -> ${RADIX_ROOT}`);
  });
}

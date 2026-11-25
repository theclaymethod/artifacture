#!/usr/bin/env node
/**
 * Builds a standalone static deployment bundle (`playground/splat-vfx/deck-dist/`)
 * containing ONLY the WebGPU 3D Gaussian Splatting Slide Deck, its vendor ES modules
 * (`@sparkjsdev/radix`, `three`), and its 4 compact `.spz` assets (each < 25 MiB).
 *
 * Grace Cathedral (`10M SH3`) streams directly from Google Cloud Storage (`access-control-allow-origin: *`)
 * when hosted remotely.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name !== 'ExperimentalWarning') console.warn(w);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLAYGROUND_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(PLAYGROUND_ROOT, '../..');
const RADIX_ROOT = process.env.RADIX_ROOT || path.resolve(REPO_ROOT, '../radix');
const DECK_SRC = path.join(PLAYGROUND_ROOT, 'deck');
const DIST_DIR = path.join(PLAYGROUND_ROOT, 'deck-dist');

function ensureCopy(src, dst) {
  if (!existsSync(src)) {
    throw new Error(`Missing required source file: ${src}`);
  }
  mkdirSync(path.dirname(dst), { recursive: true });
  copyFileSync(src, dst);
}

function resolveAsset(filename) {
  const local = path.join(PLAYGROUND_ROOT, 'assets', filename);
  if (existsSync(local)) return local;
  const radix = path.join(RADIX_ROOT, 'examples/artifacture-fx/assets', filename);
  if (existsSync(radix)) return radix;
  throw new Error(`Missing 3DGS asset: ${filename}`);
}

rmSync(DIST_DIR, { recursive: true, force: true });
mkdirSync(DIST_DIR, { recursive: true });

// 1. Deck HTML, CSS, and TypeScript -> JS
ensureCopy(path.join(DECK_SRC, 'index.html'), path.join(DIST_DIR, 'index.html'));
ensureCopy(path.join(DECK_SRC, 'styles.css'), path.join(DIST_DIR, 'styles.css'));

for (const tsFile of ['main.ts', 'slides.ts', 'shaders.ts']) {
  const src = readFileSync(path.join(DECK_SRC, tsFile), 'utf8');
  const js = stripTypeScriptTypes(src, { mode: 'strip', sourceUrl: `deck/${tsFile}` });
  writeFileSync(path.join(DIST_DIR, tsFile.replace(/\.ts$/, '.js')), js);
}

// 2. Vendor ES modules (radix + three)
ensureCopy(
  path.join(RADIX_ROOT, 'dist/radix.module.js'),
  path.join(DIST_DIR, 'vendor/radix/radix.module.js'),
);
ensureCopy(
  path.join(RADIX_ROOT, 'node_modules/three/build/three.webgpu.js'),
  path.join(DIST_DIR, 'vendor/three/build/three.webgpu.js'),
);
ensureCopy(
  path.join(RADIX_ROOT, 'node_modules/three/build/three.core.js'),
  path.join(DIST_DIR, 'vendor/three/build/three.core.js'),
);
ensureCopy(
  path.join(RADIX_ROOT, 'node_modules/three/build/three.tsl.js'),
  path.join(DIST_DIR, 'vendor/three/build/three.tsl.js'),
);
ensureCopy(
  path.join(RADIX_ROOT, 'node_modules/three/examples/jsm/tsl/display/BloomNode.js'),
  path.join(DIST_DIR, 'vendor/three/examples/jsm/tsl/display/BloomNode.js'),
);

// 3. Compact 3DGS .spz assets (all < 25 MiB Cloudflare Workers Static Assets limit)
const SPZ_ASSETS = [
  'forest-clearing-wide.spz',
  'alien-dimension-wide.spz',
  'tokyo-alley.spz',
  'buddha.spz',
];

let totalBytes = 0;
for (const name of SPZ_ASSETS) {
  const src = resolveAsset(name);
  const dst = path.join(DIST_DIR, 'assets', name);
  ensureCopy(src, dst);
  const size = statSync(dst).size;
  totalBytes += size;
  console.log(`[build-deck-dist] + assets/${name} (${(size / (1024 * 1024)).toFixed(2)} MB)`);
}

// 4. Cloudflare Static Assets caching + MIME headers
writeFileSync(
  path.join(DIST_DIR, '_headers'),
  `/assets/*
  Cache-Control: public, max-age=31536000, immutable
  Content-Type: application/octet-stream

/vendor/*
  Cache-Control: public, max-age=31536000, immutable
`,
);

console.log(
  `[build-deck-dist] Built standalone Gaussian Slide Deck at ${DIST_DIR} (${(totalBytes / (1024 * 1024)).toFixed(2)} MB assets)`,
);

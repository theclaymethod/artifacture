#!/usr/bin/env node
/**
 * Static contract verifier for `playground/splat-vfx/` enforcing past regression classes:
 *  1. No slide combines `ageStatic` and `ageRate` (prevents Slide 1 -> 2 double-play snap).
 *  2. No stale pre-compression splat counts (`1.18M`, `500k`, `262k`) remain in slide prose/notes.
 *  3. Grace Cathedral optimization enforces floater rejection (`maxScale <= 0.30`, `densityFloor >= 8`).
 *  4. `main.ts` strips `?v=...` query params before passing `name` to `loadSplatFile`.
 *  5. `shaders.ts` uses unclamped `invScale` + `rActual` horizon cutout (no blue forest leak behind planet).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const slidesSrc = readFileSync(path.join(ROOT, 'deck/slides.ts'), 'utf8');
const mainSrc = readFileSync(path.join(ROOT, 'deck/main.ts'), 'utf8');
const shadersSrc = readFileSync(path.join(ROOT, 'deck/shaders.ts'), 'utf8');
const optSrc = readFileSync(path.join(ROOT, 'scripts/optimize-all-splats.mjs'), 'utf8');

const failures = [];

// 1. Discriminated timing check: no fx block may declare both ageStatic and ageRate
const fxBlocks = slidesSrc.match(/fx:\s*\{[\s\S]*?\n\s*\},/g) ?? [];
for (const block of fxBlocks) {
  if (/\bageStatic\s*:/.test(block) && /\bageRate\s*:/.test(block)) {
    failures.push('slides.ts: slide fx block declares both ageStatic and ageRate (causes transition double-play snap)');
  }
}

// 2. Stale pre-optimization splat counts in active copy/notes
for (const stale of ['1.18M', '500k-splat', '262k-Gaussian']) {
  if (slidesSrc.includes(stale)) {
    failures.push(`slides.ts: contains stale pre-optimization count "${stale}" instead of DECK_STATS`);
  }
}

// 3. Grace Cathedral floater-rejection invariants
const graceBlock = /name:\s*'grace-cathedral'[\s\S]*?scoreSplat:/.exec(optSrc)?.[0] ?? '';
const maxScaleMatch = /maxScale:\s*([\d.]+)/.exec(graceBlock);
const floorMatch = /densityFloor:\s*(\d+)/.exec(graceBlock);
if (!maxScaleMatch || Number(maxScaleMatch[1]) > 0.3) {
  failures.push(`optimize-all-splats.mjs: grace-cathedral maxScale must be <= 0.30 (found ${maxScaleMatch?.[1] ?? 'none'})`);
}
if (!floorMatch || Number(floorMatch[1]) < 8) {
  failures.push(`optimize-all-splats.mjs: grace-cathedral densityFloor must be >= 8 (found ${floorMatch?.[1] ?? 'none'})`);
}

// 4. Query-string stripping before SplatFiles format detection
if (!mainSrc.includes('url.split("?")[0]')) {
  failures.push('main.ts: loadSplatFile must strip query strings via url.split("?")[0] so ?v=N does not break extension detection');
}

// 5. Unclamped invScale + rActual zero-leak wormhole cutout
if (/max\(f\.scaleToPortal,\s*0\.14\)/.test(shadersSrc)) {
  failures.push('shaders.ts: clamping scaleToPortal at 0.14 leaks distant forest sky behind the alien planet');
}
if (!shadersSrc.includes('rActual')) {
  failures.push('shaders.ts: forestPortalOutModifier must cut out on post-displacement rActual');
}

if (failures.length > 0) {
  console.error('[check-deck-contracts] FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('[check-deck-contracts] OK (5/5 regression invariants verified)');

#!/usr/bin/env node
/**
 * Compresses `grace-interior-10m.rdx` (715 MB, 10M SH3 splats) into a web-ready
 * ~15-18 MB SH0 `.spz` (`grace-cathedral-lite.spz`, ~1.15M splats — ~40x smaller!)
 * using nave-aware perceptual solid-angle importance sampling + stained-glass preservation.
 *
 * Usage:
 *   node --max-old-space-size=8192 playground/splat-vfx/scripts/compress-grace-cathedral.mjs
 */

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLAYGROUND_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(PLAYGROUND_ROOT, '../..');
const RADIX_ROOT = process.env.RADIX_ROOT || path.resolve(REPO_ROOT, '../radix');
const RADIX_CORE = path.join(RADIX_ROOT, 'dist/radix-core.module.js');

const INPUT_RDX = path.join(RADIX_ROOT, 'examples/artifacture-fx/assets/grace-interior-10m.rdx');
const OUTPUT_SPZ = path.join(RADIX_ROOT, 'examples/artifacture-fx/assets/grace-cathedral-lite.spz');
const TARGET_COUNT = Number(process.env.TARGET_COUNT || 1_150_000);
const SCALE_COMP = Number(process.env.SCALE_COMP || 1.24);

if (!existsSync(INPUT_RDX)) {
  throw new Error(`Missing source file: ${INPUT_RDX}`);
}

const { SplatFiles, Splats } = await import(RADIX_CORE);

console.log(`[compress-grace] Reading ${INPUT_RDX} (${(statSync(INPUT_RDX).size / (1024 * 1024)).toFixed(1)} MB)...`);
const rawBuf = readFileSync(INPUT_RDX);
const rawBytes = new Uint8Array(rawBuf.buffer, rawBuf.byteOffset, rawBuf.byteLength);

console.log('[compress-grace] Decoding RDX (dropping SH3 -> SH0)...');
const { splats: inData } = await SplatFiles.decode(rawBytes, {
  name: 'grace-interior-10m.rdx',
  layout: 'extSplats',
  sh: false,
});

const total = inData.count;
const { bundle: inBundle } = Splats.get(inData);
const decode = Splats.decoder(inBundle);
const rec = Splats.makeExtSplat();

console.log(`[compress-grace] Scoring ${total.toLocaleString()} splats for nave-aware importance...`);
const scores = new Float32Array(total);
let validCount = 0;
let minLog = Infinity;
let maxLog = -Infinity;

// Fast deterministic integer hash for smooth stochastic dithering across uniform stonework
function hash01(i) {
  let x = (i ^ 61) ^ (i >>> 16);
  x = (x + (x << 3)) | 0;
  x = x ^ (x >>> 4);
  x = Math.imul(x, 0x27d4eb2d);
  x = x ^ (x >>> 15);
  return (x >>> 0) / 4294967296;
}

for (let i = 0; i < total; i += 1) {
  decode(i, rec);
  const { x: cx, y: cy, z: cz } = rec.center;
  const { x: sx, y: sy, z: sz } = rec.scales;
  const op = rec.opacity;
  if (
    op < 0.08 ||
    !Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz) ||
    !Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(sz)
  ) {
    scores[i] = -1;
    continue;
  }
  const maxS = Math.max(sx, sy, sz);
  if (maxS <= 1e-6 || maxS > 3.5) {
    scores[i] = -1;
    continue;
  }

  // World space after Rx(180deg) upright flip
  const wx = cx;
  const wy = -cy;
  const wz = -cz;

  const dx = wx + 12.0;
  const dy = wy - 8.5;
  const dz = wz + 3.0;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 2.5;

  const area = sx * sy + sy * sz + sx * sz;
  let imp = (op * Math.pow(area, 0.52)) / Math.pow(dist, 0.35);

  // Strongly prioritize the visible Gothic nave, vaulted arches, pews, organ, and stained-glass rose window
  const inNave = wx >= -17.5 && wx <= 42.0 && wy >= 3.2 && wy <= 28.5 && Math.abs(wz + 3.0) <= 15.5;
  if (inNave) {
    imp *= 9.0;
    // Extra fidelity on the far rose window & organ wall so distant architectural detail stays razor-crisp
    if (wx >= 10.0) imp *= 2.0;
  } else if (wx >= -22.0 && wx <= 48.0 && wy >= 1.5 && wy <= 34.0 && Math.abs(wz + 3.0) <= 24.0) {
    imp *= 1.8;
  } else {
    imp *= 0.08;
  }

  // Preserve colorful stained-glass windows (rose window + side lancets) and bright highlights
  const { r, g, b } = rec.rgb;
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const chroma = maxC - minC;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (chroma > 0.14) imp *= 2.4;
  if (lum > 0.58) imp *= 1.45;

  // Mild deterministic jitter so dense flat surfaces thin uniformly without bands
  imp *= 0.8 + 0.4 * hash01(i);

  const ls = Math.log(Math.max(imp, 1e-18));
  scores[i] = ls;
  validCount += 1;
  if (ls < minLog) minLog = ls;
  if (ls > maxLog) maxLog = ls;
}

// 4096-bin histogram threshold selection in O(N)
const BINS = 4096;
const hist = new Uint32Array(BINS);
const invSpan = (BINS - 1) / Math.max(maxLog - minLog, 1e-6);
for (let i = 0; i < total; i += 1) {
  const s = scores[i];
  if (s === -1) continue;
  const b = Math.max(0, Math.min(BINS - 1, ((s - minLog) * invSpan) | 0));
  hist[b] += 1;
}

let accum = 0;
let threshBin = 0;
for (let b = BINS - 1; b >= 0; b -= 1) {
  accum += hist[b];
  if (accum >= TARGET_COUNT) {
    threshBin = b;
    break;
  }
}
const threshold = minLog + threshBin / invSpan;
const keepCount = Math.min(TARGET_COUNT, validCount);
console.log(`[compress-grace] Valid=${validCount.toLocaleString()}, selecting top ${keepCount.toLocaleString()} splats (threshold=${threshold.toFixed(3)})...`);

const outData = Splats.make(keepCount, { layout: 'extSplats' });
const { bundle: outBundle } = Splats.get(outData);
const encode = Splats.encoder(outBundle);

let written = 0;
// First pass: strictly above threshold
for (let i = 0; i < total && written < keepCount; i += 1) {
  if (scores[i] > threshold) {
    decode(i, rec);
    rec.scales.x *= SCALE_COMP;
    rec.scales.y *= SCALE_COMP;
    rec.scales.z *= SCALE_COMP;
    encode(written++, rec);
  }
}
// Second pass: fill remainder from exact threshold bin
const binWidth = 1 / invSpan;
for (let i = 0; i < total && written < keepCount; i += 1) {
  const s = scores[i];
  if (s <= threshold && s >= threshold - binWidth) {
    decode(i, rec);
    rec.scales.x *= SCALE_COMP;
    rec.scales.y *= SCALE_COMP;
    rec.scales.z *= SCALE_COMP;
    encode(written++, rec);
  }
}
outData.count = written;

console.log(`[compress-grace] Encoding ${written.toLocaleString()} SH0 splats to SPZ...`);
const spzBytes = await SplatFiles.encode(outData, 'spz', { sh: false });
writeFileSync(OUTPUT_SPZ, spzBytes);

const inMb = statSync(INPUT_RDX).size / (1024 * 1024);
const outMb = statSync(OUTPUT_SPZ).size / (1024 * 1024);
console.log(
  `[compress-grace] DONE! ${inMb.toFixed(1)} MB -> ${outMb.toFixed(2)} MB (${(inMb / outMb).toFixed(1)}x smaller) -> ${OUTPUT_SPZ}`,
);

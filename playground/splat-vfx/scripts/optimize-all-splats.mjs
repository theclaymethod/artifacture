#!/usr/bin/env node
/**
 * Perceptual solid-angle importance optimizer for ALL 5 scenes in the WebGPU Gaussian Slide Deck.
 *
 * Keeps raw high-res archives untouched and writes compact web-optimized `*-opt.spz` assets
 * targeting ~22 MB total across the entire 8-slide deck (~9.3 MB initial boot for Dual-World)
 * while preserving watertight silhouettes, stained glass, neon signage, and foreground parallax.
 *
 * Usage:
 *   node --max-old-space-size=8192 playground/splat-vfx/scripts/optimize-all-splats.mjs
 */

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLAYGROUND_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(PLAYGROUND_ROOT, '../..');
const RADIX_ROOT = process.env.RADIX_ROOT || path.resolve(REPO_ROOT, '../radix');
const RADIX_CORE = path.join(RADIX_ROOT, 'dist/radix-core.module.js');
const ASSETS_DIR = path.join(RADIX_ROOT, 'examples/artifacture-fx/assets');

const { SplatFiles, Splats } = await import(RADIX_CORE);

function hash01(i) {
  let x = (i ^ 61) ^ (i >>> 16);
  x = (x + (x << 3)) | 0;
  x = x ^ (x >>> 4);
  x = Math.imul(x, 0x27d4eb2d);
  x = x ^ (x >>> 15);
  return (x >>> 0) / 4294967296;
}

const JOBS = [
  {
    name: 'forest-clearing-wide',
    input: 'forest-clearing-wide.spz',
    output: 'forest-clearing-wide-opt.spz',
    targetCount: 380_000,
    minOpacity: 0.06,
    maxScale: 2.8,
    scaleComp: 1.2,
    // SHARP camera at (0, 0, 0) looking -Z; Rx(180) maps obj -> world (x, -y, -z)
    scoreSplat: (wx, wy, wz, sx, sy, sz, op, r, g, b) => {
      const dist = Math.sqrt(wx * wx + wy * wy + wz * wz) + 0.8;
      const area = sx * sy + sy * sz + sx * sz;
      let imp = (op * Math.pow(area, 0.5)) / Math.pow(dist, 0.65);
      // Protect near-to-mid mossy trunks, ferns, creek, and vine arch (-0.8..-14)
      if (wz < -0.5 && wz > -16.0) imp *= 2.4;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      if (maxC - minC > 0.1) imp *= 1.35;
      return imp;
    },
  },
  {
    name: 'alien-dimension-wide',
    input: 'alien-dimension-wide.spz',
    output: 'alien-dimension-wide-opt.spz',
    targetCount: 360_000,
    minOpacity: 0.06,
    maxScale: 4.5,
    scaleComp: 1.22,
    scoreSplat: (wx, wy, wz, sx, sy, sz, op, r, g, b) => {
      const dist = Math.sqrt(wx * wx + wy * wy + wz * wz) + 1.0;
      const area = sx * sy + sy * sz + sx * sz;
      let imp = (op * Math.pow(area, 0.52)) / Math.pow(dist, 0.55);
      // Preserve warm lit dunes, obsidian monolith silhouettes, and luminous ringed planet
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (chroma > 0.14 || lum > 0.55) imp *= 1.65;
      return imp;
    },
  },
  {
    name: 'tokyo-alley',
    input: 'tokyo-alley.spz',
    output: 'tokyo-alley-opt.spz',
    targetCount: 270_000,
    minOpacity: 0.06,
    maxScale: 2.5,
    scaleComp: 1.15,
    scoreSplat: (wx, wy, wz, sx, sy, sz, op, r, g, b) => {
      const dx = wx + 0.1;
      const dy = wy - 0.15;
      const dz = wz + 1.0;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1.0;
      const area = sx * sy + sy * sz + sx * sz;
      let imp = (op * Math.pow(area, 0.48)) / Math.pow(dist, 0.65);
      // Heavily protect vibrant emissive neon signage and wet street reflections
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (chroma > 0.16) imp *= 2.8;
      if (lum > 0.45) imp *= 1.7;
      if (wz < 1.2 && wz > -9.5 && Math.abs(wx) < 3.6) imp *= 2.2;
      return imp;
    },
  },
  {
    name: 'buddha',
    input: 'buddha.spz',
    output: 'buddha-opt.spz',
    targetCount: 165_000,
    minOpacity: 0.09,
    maxScale: 1.5,
    scaleComp: 1.13,
    scoreSplat: (_wx, _wy, _wz, sx, sy, sz, op) => {
      const area = sx * sy + sy * sz + sx * sz;
      return op * Math.pow(area, 0.45);
    },
  },
  {
    name: 'grace-cathedral',
    input: 'grace-interior-10m.rdx',
    output: 'grace-cathedral-opt.spz',
    targetCount: 540_000,
    minOpacity: 0.09,
    maxScale: 3.5,
    scaleComp: 1.36,
    scoreSplat: (wx, wy, wz, sx, sy, sz, op, r, g, b) => {
      const dx = wx + 12.0;
      const dy = wy - 8.5;
      const dz = wz + 3.0;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 2.5;
      const area = sx * sy + sy * sz + sx * sz;
      let imp = (op * Math.pow(area, 0.52)) / Math.pow(dist, 0.35);

      const inNave = wx >= -17.5 && wx <= 42.0 && wy >= 3.2 && wy <= 28.5 && Math.abs(wz + 3.0) <= 15.5;
      if (inNave) {
        imp *= 9.0;
        if (wx >= 10.0) imp *= 2.2;
      } else if (wx >= -22.0 && wx <= 48.0 && wy >= 1.5 && wy <= 34.0 && Math.abs(wz + 3.0) <= 24.0) {
        imp *= 1.6;
      } else {
        imp *= 0.06;
      }

      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const chroma = maxC - minC;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (chroma > 0.14) imp *= 2.6;
      if (lum > 0.55) imp *= 1.5;
      return imp;
    },
  },
];

let totalInBytes = 0;
let totalOutBytes = 0;

for (const job of JOBS) {
  const inPath = path.join(ASSETS_DIR, job.input);
  const outPath = path.join(ASSETS_DIR, job.output);
  if (!existsSync(inPath)) {
    throw new Error(`Missing source asset: ${inPath}`);
  }
  const inSize = statSync(inPath).size;
  totalInBytes += inSize;

  const rawBuf = readFileSync(inPath);
  const rawBytes = new Uint8Array(rawBuf.buffer, rawBuf.byteOffset, rawBuf.byteLength);
  const { splats: inData } = await SplatFiles.decode(rawBytes, {
    name: job.input,
    layout: 'extSplats',
    sh: false,
  });

  const total = inData.count;
  const { bundle: inBundle } = Splats.get(inData);
  const decode = Splats.decoder(inBundle);
  const rec = Splats.makeExtSplat();

  const scores = new Float32Array(total);
  let validCount = 0;
  let minLog = Infinity;
  let maxLog = -Infinity;

  for (let i = 0; i < total; i += 1) {
    decode(i, rec);
    const { x: cx, y: cy, z: cz } = rec.center;
    const { x: sx, y: sy, z: sz } = rec.scales;
    const op = rec.opacity;
    if (
      op < job.minOpacity ||
      !Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz) ||
      !Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(sz)
    ) {
      scores[i] = -1;
      continue;
    }
    const maxS = Math.max(sx, sy, sz);
    if (maxS <= 1e-6 || maxS > job.maxScale) {
      scores[i] = -1;
      continue;
    }

    const wx = cx;
    const wy = -cy;
    const wz = -cz;
    let imp = job.scoreSplat(wx, wy, wz, sx, sy, sz, op, rec.rgb.r, rec.rgb.g, rec.rgb.b);
    imp *= 0.8 + 0.4 * hash01(i);

    const ls = Math.log(Math.max(imp, 1e-18));
    scores[i] = ls;
    validCount += 1;
    if (ls < minLog) minLog = ls;
    if (ls > maxLog) maxLog = ls;
  }

  const keepCount = Math.min(job.targetCount, validCount);
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
    if (accum >= keepCount) {
      threshBin = b;
      break;
    }
  }
  const threshold = minLog + threshBin / invSpan;
  const binWidth = 1 / invSpan;

  const outData = Splats.make(keepCount, { layout: 'extSplats' });
  const { bundle: outBundle } = Splats.get(outData);
  const encode = Splats.encoder(outBundle);

  let written = 0;
  for (let i = 0; i < total && written < keepCount; i += 1) {
    if (scores[i] > threshold) {
      decode(i, rec);
      rec.scales.x *= job.scaleComp;
      rec.scales.y *= job.scaleComp;
      rec.scales.z *= job.scaleComp;
      encode(written++, rec);
    }
  }
  for (let i = 0; i < total && written < keepCount; i += 1) {
    const s = scores[i];
    if (s <= threshold && s >= threshold - binWidth) {
      decode(i, rec);
      rec.scales.x *= job.scaleComp;
      rec.scales.y *= job.scaleComp;
      rec.scales.z *= job.scaleComp;
      encode(written++, rec);
    }
  }
  outData.count = written;

  const spzBytes = await SplatFiles.encode(outData, 'spz', { sh: false });
  writeFileSync(outPath, spzBytes);
  const outSize = statSync(outPath).size;
  totalOutBytes += outSize;

  console.log(
    `[optimize-splats] ${job.name}: ${total.toLocaleString()} -> ${written.toLocaleString()} splats | ${(inSize / (1024 * 1024)).toFixed(2)} MB -> ${(outSize / (1024 * 1024)).toFixed(2)} MB (${(inSize / outSize).toFixed(1)}x smaller)`,
  );
}

console.log(
  `\n[optimize-splats] TOTAL: ${(totalInBytes / (1024 * 1024)).toFixed(1)} MB -> ${(totalOutBytes / (1024 * 1024)).toFixed(2)} MB (${(totalInBytes / totalOutBytes).toFixed(1)}x overall compression)`,
);

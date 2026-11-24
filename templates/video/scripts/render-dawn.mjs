import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSceneSequence, renderSceneStill } from '@artifacture/gpu/node';
import { liquidPrismScene } from '@artifacture/gpu/scenes';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'out');
const FRAMES_DIR = path.join(OUT_DIR, 'frames');

const frames = await renderSceneSequence({
  scene: liquidPrismScene,
  outDir: FRAMES_DIR,
  width: 960,
  height: 540,
  fps: 10,
  durationSeconds: 1.0,
  paramsAtTime: (t) => {
    const p = Math.max(0, Math.min(1, t / 3.0));
    return {
      morph: p,
      yaw: 0.45 - p * 0.9,
      pitch: 0.18 + Math.sin(p * Math.PI) * 0.24,
      zoom: 0.96,
      offsetX: 0.3,
    };
  },
});

const probeT0A = path.join(OUT_DIR, 'probe-t0-a.png');
const probeT15 = path.join(OUT_DIR, 'probe-t15.png');
const probeT0B = path.join(OUT_DIR, 'probe-t0-b.png');

await renderSceneStill({
  scene: liquidPrismScene,
  outPath: probeT0A,
  width: 960,
  height: 540,
  seconds: 0,
  params: { morph: 0, yaw: 0.45, pitch: 0.18, zoom: 0.96, offsetX: 0.3 },
});

await renderSceneStill({
  scene: liquidPrismScene,
  outPath: probeT15,
  width: 960,
  height: 540,
  seconds: 1.5,
  params: { morph: 0.5, yaw: 0.0, pitch: 0.42, zoom: 0.96, offsetX: 0.3 },
});

await renderSceneStill({
  scene: liquidPrismScene,
  outPath: probeT0B,
  width: 960,
  height: 540,
  seconds: 0,
  params: { morph: 0, yaw: 0.45, pitch: 0.18, zoom: 0.96, offsetX: 0.3 },
});

const pngA = PNG.sync.read(await readFile(probeT0A));
const pngMid = PNG.sync.read(await readFile(probeT15));
const pngB = PNG.sync.read(await readFile(probeT0B));

const rewindDiff = pixelmatch(pngA.data, pngB.data, undefined, pngA.width, pngA.height, {
  threshold: 0.0,
});
const motionDiff = pixelmatch(pngA.data, pngMid.data, undefined, pngA.width, pngA.height, {
  threshold: 0.01,
});

if (rewindDiff !== 0) {
  throw new Error(`Determinism check failed: rewind pixel diff was ${rewindDiff} (expected 0).`);
}
if (motionDiff === 0) {
  throw new Error('Keyframe check failed: t=0 and t=1.5 produced identical pixels.');
}

console.log(
  JSON.stringify(
    {
      frameCount: frames.length,
      probeT0A,
      probeT15,
      rewindDiff,
      motionDiff,
    },
    null,
    2,
  ),
);

#!/usr/bin/env node
/**
 * End-to-end WebGPU verification + demo capture for the Splat VFX Slide Deck.
 *
 * Usage:
 *   node playground/splat-vfx/scripts/verify-deck.mjs           # capture all 8 slides + 2 transitions + 4x2 contact sheet
 *   node playground/splat-vfx/scripts/verify-deck.mjs --video   # also render a smooth 1920x1080 30fps live demo MP4
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchVerifyBrowser } from '../../../packages/verify/dist/index.js';
import { createPlaygroundServer } from './serve.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLAYGROUND_ROOT = path.resolve(__dirname, '..');
const CAPTURES_DIR = path.join(PLAYGROUND_ROOT, 'captures');
const CONTACT_SHEET = path.join(PLAYGROUND_ROOT, 'deck-verification-sheet.png');
const RENDER_VIDEO = process.argv.includes('--video');
const DEMO_MP4 = '/Users/claytonkim/dev/radix/examples/artifacture-fx/concept-art/splat-deck-demo.mp4';

mkdirSync(CAPTURES_DIR, { recursive: true });

const server = createPlaygroundServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}/deck/`;

const consoleErrors = [];
const pageErrors = [];
const slideTelemetry = [];

try {
  const { browser, mode, webgpuArgs, close } = await launchVerifyBrowser({
    webgpu: true,
    viewport: { width: 1920, height: 1080 },
  });
  console.log(`[verify-deck] Chromium WebGPU ready (mode=${mode}, url=${baseUrl})`);

  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.splatDeck?.ready), { timeout: 120_000 });

  // Representative elapsed timestamps per slide so every live effect is captured at its peak hero moment
  const slideCaptures = [
    { idx: 0, elapsedSec: 0.6, file: 'slide_01_intro.png' },
    { idx: 1, elapsedSec: 2.2, file: 'slide_02_wormhole_rift.png' },
    { idx: 2, elapsedSec: 1.0, file: 'slide_03_alien_emerge.png' },
    { idx: 3, elapsedSec: 1.6, file: 'slide_04_tokyo_parallax.png' },
    { idx: 4, elapsedSec: 1.8, file: 'slide_05_tokyo_pointcloud.png' },
    { idx: 5, elapsedSec: 2.35, file: 'slide_06_buddha_smoke.png' },
    { idx: 6, elapsedSec: 2.8, file: 'slide_07_grace_bw_lidar.png' },
    { idx: 7, elapsedSec: 1.2, file: 'slide_08_summary.png' },
  ];

  const shotPaths = [];
  for (const s of slideCaptures) {
    await page.evaluate(
      (opts) => window.splatDeck.renderSlideAt(opts),
      { slideIdx: s.idx, elapsedSec: s.elapsedSec, timeSec: s.elapsedSec + 1.5, settlePasses: 3 },
    );
    const state = await page.evaluate(() => window.splatDeck.getState());
    const outPath = path.join(CAPTURES_DIR, s.file);
    await page.screenshot({ path: outPath });
    shotPaths.push(outPath);
    slideTelemetry.push({ ...state, elapsedSec: s.elapsedSec });
    console.log(`[verify-deck] Captured slide ${s.idx + 1}/8 (${state.slideId}): ${state.splatCount.toLocaleString()} splats`);
  }

  // Also capture mid-wormhole gravitational slingshot transition (Slide 2 -> Slide 3 at u=0.52)
  await page.evaluate(() =>
    window.splatDeck.renderTransitionAt({ fromIdx: 1, toIdx: 2, u: 0.52, timeSec: 4.1, hideCard: true, settlePasses: 3 }),
  );
  const midWormholePath = path.join(CAPTURES_DIR, 'transition_2_to_3_slingshot.png');
  await page.screenshot({ path: midWormholePath });
  console.log('[verify-deck] Captured mid-wormhole slingshot transition (u=0.52)');

  // 4-frame spherical wormhole gravitational-lensing opening strip (Slide 1 -> Slide 2)
  const whFrames = [];
  for (const [idx, uVal] of [0.25, 0.48, 0.76, 1.0].entries()) {
    await page.evaluate(
      (u) => window.splatDeck.renderTransitionAt({ fromIdx: 0, toIdx: 1, u, timeSec: 2.0 + u * 2.35, hideCard: true, settlePasses: 3 }),
      uVal,
    );
    const p = path.join(CAPTURES_DIR, `wormhole_open_${idx}.png`);
    await page.screenshot({ path: p });
    whFrames.push(p);
  }
  const wormholeStripPath = path.join(PLAYGROUND_ROOT, 'wormhole-opening-strip.png');
  execFileSync(
    'ffmpeg',
    [
      '-y',
      ...whFrames.flatMap((p) => ['-i', p]),
      '-filter_complex',
      '[0:v]scale=960:540[v0];[1:v]scale=960:540[v1];[2:v]scale=960:540[v2];[3:v]scale=960:540[v3];[v0][v1][v2][v3]xstack=inputs=4:layout=0_0|960_0|0_540|960_540[out]',
      '-map', '[out]', '-frames:v', '1', '-update', '1',
      wormholeStripPath,
    ],
    { stdio: 'inherit' },
  );
  console.log(`[verify-deck] Wrote 2x2 wormhole opening strip: ${wormholeStripPath}`);

  // 4-angle Grace Cathedral verification strip (front nave, back nave -X, transept/vaults, peak B&W LiDAR)
  const graceAngles = [
    { pos: [-13.8, 7.35, -3.55], target: [-2.0, 9.6, -4.55], fov: 60, file: 'grace_front_nave.png' },
    { pos: [-8.0, 8.5, -3.0], target: [-42.0, 12.0, -3.0], fov: 64, file: 'grace_back_nave.png' },
    { pos: [-2.0, 7.8, -14.0], target: [-5.0, 18.0, 10.0], fov: 66, file: 'grace_transept_vaults.png' },
  ];
  const graceFrames = [];
  for (const a of graceAngles) {
    await page.evaluate((opts) => window.splatDeck.renderCustomPose({ sceneId: 'grace', ...opts }), a);
    const p = path.join(CAPTURES_DIR, a.file);
    await page.screenshot({ path: p });
    graceFrames.push(p);
  }
  graceFrames.push(path.join(CAPTURES_DIR, 'slide_07_grace_bw_lidar.png'));
  const graceStripPath = path.join(PLAYGROUND_ROOT, 'grace-detail-strip.png');
  execFileSync(
    'ffmpeg',
    [
      '-y',
      ...graceFrames.flatMap((p) => ['-i', p]),
      '-filter_complex',
      '[0:v]scale=960:540[v0];[1:v]scale=960:540[v1];[2:v]scale=960:540[v2];[3:v]scale=960:540[v3];[v0][v1][v2][v3]xstack=inputs=4:layout=0_0|960_0|0_540|960_540[out]',
      '-map', '[out]', '-frames:v', '1', '-update', '1',
      graceStripPath,
    ],
    { stdio: 'inherit' },
  );
  console.log(`[verify-deck] Wrote 2x2 Grace Cathedral detail strip: ${graceStripPath}`);

  // Live-clock single-play monotonic check for Slide 1 -> Slide 2 (proves zero double-play!)
  await page.evaluate(async () => {
    await window.splatDeck.goToSlide(0, true);
    window.splatDeck.resumeLive();
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => void window.splatDeck.goToSlide(1, false));
  const ageSamples = [];
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(160);
    const st = await page.evaluate(() => window.splatDeck.getState());
    ageSamples.push({ tMs: i * 160, uFxAge: Number(st.uFxAge.toFixed(3)), uFxMix: Number(st.uFxMix.toFixed(3)), tr: st.transitionActive });
  }
  let maxAgeSeen = -1;
  let backwardDrop = false;
  for (const s of ageSamples) {
    if (s.uFxAge + 0.01 < maxAgeSeen) backwardDrop = true;
    if (s.uFxAge > maxAgeSeen) maxAgeSeen = s.uFxAge;
  }
  console.log('[verify-deck] Live Slide 1->2 uFxAge trace:', ageSamples.map((s) => s.uFxAge).join(' -> '));
  if (backwardDrop || maxAgeSeen < 2.25) {
    throw new Error(`Wormhole opening monotonic check FAILED (backwardDrop=${backwardDrop}, maxAgeSeen=${maxAgeSeen})`);
  }
  console.log('[verify-deck] Live Slide 1->2 single-play monotonic check PASSED!');

  // Build 4x2 contact sheet of all 8 slides (1920x540 -> 2x4 or 4x2 at 640x360 = 2560x720)
  const inputs = [];
  const filters = [];
  for (let i = 0; i < shotPaths.length; i++) {
    inputs.push('-i', shotPaths[i]);
    filters.push(`[${i}:v]scale=640:360[v${i}]`);
  }
  const layout = [
    '0_0', '640_0', '1280_0', '1920_0',
    '0_360', '640_360', '1280_360', '1920_360',
  ].join('|');
  filters.push(`${shotPaths.map((_, i) => `[v${i}]`).join('')}xstack=inputs=8:layout=${layout}[out]`);
  execFileSync('ffmpeg', ['-y', ...inputs, '-filter_complex', filters.join(';'), '-map', '[out]', '-frames:v', '1', '-update', '1', CONTACT_SHEET], {
    stdio: 'inherit',
  });
  console.log(`[verify-deck] Wrote 4x2 contact sheet: ${CONTACT_SHEET}`);

  if (RENDER_VIDEO) {
    const framesDir = '/tmp/v2-video-rec/splat-deck-frames';
    rmSync(framesDir, { recursive: true, force: true });
    mkdirSync(framesDir, { recursive: true });
    const FPS = 30;
    let fIdx = 0;

    const captureFrame = async () => {
      const p = path.join(framesDir, `frame_${String(fIdx++).padStart(4, '0')}.png`);
      await page.screenshot({ path: p });
    };

    // Timeline (18.0s @ 30fps = 540 frames) showcasing live slide navigation & continuous transitions:
    // 0.0-1.6s: Slide 1 (Intro Forest)
    for (let i = 0; i < Math.round(1.6 * FPS); i++) {
      const t = i / FPS;
      await page.evaluate((tSec) => window.splatDeck.renderSlideAt({ slideIdx: 0, elapsedSec: tSec, timeSec: tSec, settlePasses: 1 }), t);
      await captureFrame();
    }
    // 1.6-3.1s: Continuous Glide Slide 1 -> Slide 2 (Opening chaotic wormhole!)
    for (let i = 0; i < Math.round(1.5 * FPS); i++) {
      const u = i / Math.round(1.5 * FPS);
      await page.evaluate((p) => window.splatDeck.renderTransitionAt({ fromIdx: 0, toIdx: 1, u: p.u, timeSec: 1.6 + p.u * 1.5, hideCard: false, settlePasses: 1 }), { u });
      await captureFrame();
    }
    // 3.1-4.5s: Slide 2 steady (Wormhole Rift)
    for (let i = 0; i < Math.round(1.4 * FPS); i++) {
      const t = i / FPS;
      await page.evaluate((tSec) => window.splatDeck.renderSlideAt({ slideIdx: 1, elapsedSec: 2.3 + tSec, timeSec: 3.1 + tSec, settlePasses: 1 }), t);
      await captureFrame();
    }
    // 4.5-6.9s: Continuous Gravitational Slingshot Slide 2 -> Slide 3!
    for (let i = 0; i < Math.round(2.4 * FPS); i++) {
      const u = i / Math.round(2.4 * FPS);
      await page.evaluate((p) => window.splatDeck.renderTransitionAt({ fromIdx: 1, toIdx: 2, u: p.u, timeSec: 4.5 + p.u * 2.4, hideCard: true, settlePasses: 1 }), { u });
      await captureFrame();
    }
    // 6.9-8.3s: Slide 3 steady (Alien Canyon)
    for (let i = 0; i < Math.round(1.4 * FPS); i++) {
      const t = i / FPS;
      await page.evaluate((tSec) => window.splatDeck.renderSlideAt({ slideIdx: 2, elapsedSec: tSec, timeSec: 6.9 + tSec, settlePasses: 1 }), t);
      await captureFrame();
    }
    // 8.3-9.7s: Slide 4 steady (Tokyo Counter-Parallax)
    for (let i = 0; i < Math.round(1.4 * FPS); i++) {
      const t = i / FPS;
      await page.evaluate((tSec) => window.splatDeck.renderSlideAt({ slideIdx: 3, elapsedSec: tSec, timeSec: 8.3 + tSec, settlePasses: 1 }), t);
      await captureFrame();
    }
    // 9.7-11.3s: Continuous Tokyo Arc Slide 4 -> Slide 5 (Solid -> Point Cloud!)
    for (let i = 0; i < Math.round(1.6 * FPS); i++) {
      const u = i / Math.round(1.6 * FPS);
      await page.evaluate((p) => window.splatDeck.renderTransitionAt({ fromIdx: 3, toIdx: 4, u: p.u, timeSec: 9.7 + p.u * 1.6, hideCard: false, settlePasses: 1 }), { u });
      await captureFrame();
    }
    // 11.3-12.5s: Slide 5 steady (Tokyo Micro-Gaussian Point Cloud)
    for (let i = 0; i < Math.round(1.2 * FPS); i++) {
      const t = i / FPS;
      await page.evaluate((tSec) => window.splatDeck.renderSlideAt({ slideIdx: 4, elapsedSec: tSec, timeSec: 11.3 + tSec, settlePasses: 1 }), t);
      await captureFrame();
    }
    // 12.5-15.0s: Slide 6 (Buddha Volumetric Smoke & Ash Dissolve)
    for (let i = 0; i < Math.round(2.5 * FPS); i++) {
      const t = i / FPS;
      await page.evaluate((tSec) => window.splatDeck.renderSlideAt({ slideIdx: 5, elapsedSec: 0.75 + tSec * 1.4, timeSec: 12.5 + tSec, settlePasses: 1 }), t);
      await captureFrame();
    }
    // 15.0-18.2s: Slide 7 (Grace Cathedral 10M SH3 Stark B&W LiDAR Out & Back)
    for (let i = 0; i < Math.round(3.2 * FPS); i++) {
      const t = i / FPS;
      await page.evaluate((tSec) => window.splatDeck.renderSlideAt({ slideIdx: 6, elapsedSec: 0.55 + tSec * 1.32, timeSec: 15.0 + tSec, settlePasses: 1 }), t);
      await captureFrame();
    }
    // 18.2-19.6s: Slide 8 (Summary Table)
    for (let i = 0; i < Math.round(1.4 * FPS); i++) {
      const t = i / FPS;
      await page.evaluate((tSec) => window.splatDeck.renderSlideAt({ slideIdx: 7, elapsedSec: tSec, timeSec: 18.2 + tSec, settlePasses: 1 }), t);
      await captureFrame();
    }

    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-framerate', String(FPS),
        '-i', path.join(framesDir, 'frame_%04d.png'),
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-crf', '17',
        '-preset', 'medium',
        '-movflags', '+faststart',
        DEMO_MP4,
      ],
      { stdio: 'inherit' },
    );
    console.log(`[verify-deck] Rendered live deck demo MP4 (${fIdx} frames): ${DEMO_MP4}`);
  }

  writeFileSync(
    path.join(CAPTURES_DIR, 'verify-meta.json'),
    JSON.stringify({ mode, webgpuArgs, slideTelemetry, consoleErrors, pageErrors }, null, 2),
  );
  console.log(`[verify-deck] Errors: console=${consoleErrors.length}, page=${pageErrors.length}`);
  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    console.error({ consoleErrors, pageErrors });
    process.exitCode = 1;
  }

  await close();
} finally {
  server.close();
}

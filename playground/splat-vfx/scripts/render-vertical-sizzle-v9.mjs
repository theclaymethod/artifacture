import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launchVerifyBrowser } from '/Users/claytonkim/dev/artifacture-v2/packages/verify/dist/index.js';

const RADIX_ROOT = '/Users/claytonkim/dev/radix';
const OUT_DIR = '/tmp/v2-video-rec';
const FRAMES_DIR = path.join(OUT_DIR, 'sizzle-v9-frames');
const PREVIEW_DIR = path.join(OUT_DIR, 'sizzle-v9-preview-frames');
const PORT = Number(process.env.RADIX_PORT ?? 8089);
const FPS = 30;

const IS_DIAG = process.argv.includes('--diag');
const IS_RENDER = process.argv.includes('--render');
const shotsArg = process.argv.find((a) => a.startsWith('--shots='))?.split('=')[1];
const SHOT_FILTER = shotsArg ? new Set(shotsArg.split(',').map((s) => Number(s))) : null;
if (!IS_DIAG && !IS_RENDER) {
  console.error('Usage: node render-vertical-sizzle-v9.mjs [--diag | --render] [--shots=0,1,...]');
  process.exit(1);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.rdx': 'application/octet-stream',
  '.spz': 'application/octet-stream',
  '.ply': 'application/octet-stream',
  '.bin': 'application/octet-stream',
};

function startStaticServer(rootDir, port) {
  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    let relPath = decodeURIComponent(reqUrl.pathname).replace(/^\/+/, '');
    if (!relPath) relPath = 'index.html';
    const filePath = path.resolve(rootDir, relPath);
    if (!filePath.startsWith(rootDir) || !existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const st = statSync(filePath);
    if (st.isDirectory()) {
      res.writeHead(404);
      res.end('Directory');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (m) {
        const start = Number(m[1]);
        const end = m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
        res.writeHead(206, {
          'Content-Type': mime,
          'Content-Range': `bytes ${start}-${end}/${st.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
        });
        if (req.method === 'HEAD') { res.end(); return; }
        createReadStream(filePath, { start, end }).pipe(res);
        return;
      }
    }
    res.writeHead(200, {
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
      'Content-Length': st.size,
    });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const smooth01 = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// V9 20.5s vertical 9:16 storyboard:
// 1. Dimensional Wormhole Fly-Through FIRST (with gravitational slingshot launch ramp into Alien Dimension)
// 2. Neon Tokyo Dream (changed-up counter-parallax & elastic depth wave + lateral S-arc)
// 3. Volumetric Smoke & Ash (front-facing Stone Buddha complete dissolve)
// 4. Monochrome Particly B&W LiDAR Shockwave in a NEW architectural setting (Grace Cathedral 10M SH3 Gothic Nave!)
const SHOTS = [
  {
    id: 'shot1_dual_world_portal',
    scene: 'forest_clearing',
    startSec: 0.0,
    durSec: 6.0,
    mode: 'singularity',
    skyFade: 0,
    kicker: '2.36M DUAL-WORLD 3DGS · WEBGPU TSL',
    title: 'Dimensional Wormhole',
    sub: 'Chaotic Gravity Rift · Slingshot Launch Traversal',
    portalFlythrough: true,
    fxCenter: [0.14, 1.05, -6.2],
    fxScale: 1.0,
    floorY: -0.46,
    fov: 64.0,
    fxStartSec: 0.45,
    fxRampSec: 0.45,
    fxAgeRate: 0.98,
  },
  {
    id: 'shot2_tokyo_alley_dream',
    scene: 'tokyo_alley',
    startSec: 6.0,
    durSec: 4.5,
    mode: 'tokyo',
    skyFade: 0,
    kicker: 'NEON ALLEYWAY · 500K SPLATS + BLOOM',
    title: 'Neon Tokyo Dream',
    sub: 'Counter-Parallax Depth Shear · Micro-Gaussian Bloom',
    tokyoParallaxArc: true,
    twist0: 0.06,
    twist1: 1.0,
    twistEarlyExp: 1.75,
    fov: 66,
    fxStartSec: 1.65,
    fxRampSec: 1.05,
    fxAgeRate: 1.0,
  },
  {
    id: 'shot3_buddha_smoke',
    scene: 'buddha',
    startSec: 10.5,
    durSec: 5.0,
    mode: 'dissolve',
    skyFade: 0,
    kicker: 'ISOLATED SCULPTURE · CURL ADVECTION',
    title: 'Volumetric Smoke & Ash',
    sub: 'Carved Stone Buddha · Complete Smoke & Ash Dissolve',
    camPos0: [3.85, 0.14, 0.55],
    camPos1: [4.15, 0.24, -0.50],
    camTgt0: [0.0, 0.02, 0.0],
    camTgt1: [0.0, 0.02, 0.0],
    roll0: 0.0,
    roll1: -0.02,
    fov: 50,
    fxStartSec: 0.45,
    fxRampSec: 4.35,
    fxAgeRate: 0.56,
  },
  {
    id: 'shot4_grace_bw_lidar',
    scene: 'grace',
    startSec: 15.5,
    durSec: 5.0,
    mode: 'shockwave',
    skyFade: 0,
    kicker: '10M SH3 GOTHIC NAVE · MONOCHROME POINT CLOUD',
    title: 'LiDAR Shockwave',
    sub: 'Stark B&W Particle Matrix · Wall Contact & Return',
    camPos0: [-14.2, 7.25, -3.15],
    camPos1: [-11.0, 7.65, -2.75],
    camTgt0: [-2.0, 9.4, -3.0],
    camTgt1: [-2.0, 9.8, -3.0],
    fxCenter: [-1.5, 9.5, -3.0],
    fxScale: 24.0,
    floorY: 4.6,
    roll0: -0.01,
    roll1: 0.015,
    fov: 68,
    fxStartSec: 0.35,
    fxRampSec: 0.14,
    fxAgeRate: 1.02,
    endCardStart: 4.45,
  },
];

async function evalFrameForShot(page, shot, localSec, globalSec, settlePasses = 1) {
  const uCam = smooth01(localSec / shot.durSec);
  const uTwist = shot.twistEarlyExp
    ? 1 - Math.pow(1 - clamp(localSec / (shot.durSec * 0.9), 0, 1), shot.twistEarlyExp)
    : uCam;
  const twistVal = shot.twist1 !== undefined ? lerp(shot.twist0 ?? 0, shot.twist1, uTwist) : 0;

  const fxElapsed = Math.max(0, localSec - shot.fxStartSec);
  const fxMix = localSec < shot.fxStartSec ? 0 : smooth01(fxElapsed / shot.fxRampSec);
  const fxAge = fxElapsed * shot.fxAgeRate;

  let camPos;
  let camTarget;
  let camRoll;
  let fov;
  if (shot.portalFlythrough) {
    // True Gravitational Slingshot Launch Ramp:
    // 0.0-1.95s: Slow ominous creep down creek while chaotic tear rips open
    // 1.95-3.85s: Exponential gravity-well acceleration (t^2.35) + dynamic warp-FOV kick (61 -> 81 deg) launching through throat!
    // 3.85-6.00s: Smooth ease-out deceleration inside the alien canyon as FOV exhales back to 63 deg
    const pApproach = smooth01(localSec / 2.05);
    const uLaunchRaw = clamp((localSec - 1.90) / 1.95, 0, 1);
    const pLaunch = Math.pow(uLaunchRaw, 2.35);
    const uEmergeRaw = clamp((localSec - 3.82) / 2.18, 0, 1);
    const pEmerge = 1 - Math.pow(1 - uEmergeRaw, 2.4);

    const z = -0.82 * pApproach - 5.26 * pLaunch - 0.96 * pEmerge;
    const y = 0.0 + 0.14 * pApproach + 0.78 * pLaunch + 0.28 * pEmerge;
    const x = 0.0 + 0.05 * Math.sin(pApproach * Math.PI) + 0.14 * pLaunch - 0.09 * Math.sin(pEmerge * Math.PI);

    camPos = [x, y, z];
    camTarget = [
      lerp(0.10, 0.14, pLaunch),
      lerp(0.20, 1.05, pApproach) + 0.48 * pLaunch + 0.56 * pEmerge,
      lerp(-6.2, -16.5, smooth01((localSec - 1.3) / 3.0)),
    ];
    // Peak slingshot bank & vertigo warp-FOV kick right as we launch through the membrane (~3.4-3.9s)
    const warpKick = Math.sin(Math.pow(clamp((localSec - 2.15) / 2.15, 0, 1), 1.35) * Math.PI);
    camRoll = warpKick * 0.115 - Math.sin(pEmerge * Math.PI) * 0.02;
    fov = 64.0 - 3.0 * pApproach + 21.0 * warpKick + 2.0 * pEmerge;
  } else if (shot.tokyoParallaxArc) {
    // Changed-up Neon Tokyo parallax: wide lateral S-arc + rising crane sweep past foreground signs
    const uLin = clamp(localSec / shot.durSec, 0, 1);
    const u = lerp(uLin, uCam, 0.4);
    const x = -0.24 + 0.52 * smooth01(u * 1.15) - 0.34 * smooth01((u - 0.52) / 0.48);
    const y = -0.05 + 0.29 * uCam;
    const z = lerp(0.92, -2.78, u);
    camPos = [x, y, z];
    camTarget = [x * 0.25 + 0.12 * Math.sin(u * Math.PI * 1.5), 0.10 + 0.14 * uCam, lerp(-4.5, -7.8, u)];
    camRoll = lerp(-0.08, 0.09, uCam);
    fov = 66 + 4 * Math.sin(u * Math.PI);
  } else {
    camPos = lerp3(shot.camPos0, shot.camPos1, uCam);
    camTarget = lerp3(shot.camTgt0, shot.camTgt1, uCam);
    camRoll = lerp(shot.roll0, shot.roll1, uCam);
    fov = shot.fov;
  }

  const captionFadeIn = smooth01((localSec - 0.12) / 0.25);
  const captionFadeOut = shot.endCardStart
    ? 1 - smooth01((localSec - (shot.endCardStart - 0.25)) / 0.25)
    : 1 - smooth01((localSec - (shot.durSec - 0.35)) / 0.25);
  const capOpacity = clamp(captionFadeIn * captionFadeOut, 0, 1);

  let titleCard;
  if (shot.endCardStart && localSec >= shot.endCardStart) {
    const cardOp = smooth01((localSec - shot.endCardStart) / 0.35);
    titleCard = {
      kicker: '@SPARKJSDEV/RADIX · WEBGPU + TSL',
      title: 'Real-Time 3DGS VFX',
      sub: 'Dual-World Portal · Tokyo Parallax · Smoke · B&W LiDAR',
      opacity: cardOp,
    };
  }

  await page.evaluate(
    (payload) => window.artifactureFx.renderFrame(payload),
    {
      time: globalSec,
      fxAge,
      fxMix,
      twist: twistVal,
      mode: shot.mode,
      camPos,
      camTarget,
      camRoll,
      fov,
      skyFade: shot.skyFade,
      fxCenter: shot.fxCenter,
      fxScale: shot.fxScale,
      floorY: shot.floorY,
      settlePasses,
      caption: {
        kicker: shot.kicker,
        title: shot.title,
        sub: shot.sub,
        opacity: capOpacity,
      },
      titleCard,
    },
  );
}

mkdirSync(OUT_DIR, { recursive: true });
if (IS_DIAG) mkdirSync(PREVIEW_DIR, { recursive: true });
if (IS_RENDER) mkdirSync(FRAMES_DIR, { recursive: true });

const DIAG_TIMES = {
  shot1_dual_world_portal: [0.20, 2.35, 3.45, 5.15],
  shot2_tokyo_alley_dream: [0.35, 1.75, 3.00, 4.15],
  shot3_buddha_smoke: [0.25, 2.00, 3.55, 4.75],
  shot4_grace_bw_lidar: [0.20, 1.05, 2.38, 3.65],
};

const server = await startStaticServer(RADIX_ROOT, PORT);
const consoleErrors = [];
const pageErrors = [];

try {
  const { browser, mode, webgpuArgs, close } = await launchVerifyBrowser({
    webgpu: true,
    headless: true,
    autoHeadedFallback: true,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 540, height: 960 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      pageErrors.push(String(err));
    });

    await page.goto(`http://127.0.0.1:${PORT}/build/examples/artifacture-fx/index.html?cinema=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForFunction(() => Boolean(window.example?.ready || window.example?.error), { timeout: 60000 });
    const boot = await page.evaluate(() => ({ example: window.example, fx: window.artifactureFx }));
    if (boot.example?.error) throw new Error(boot.example.error);
    if (boot.fx?.backend !== 'webgpu') throw new Error(`Expected webgpu, got ${boot.fx?.backend}`);
    console.log(`[sizzle-v9] Chromium WebGPU ready (mode=${mode})`);

    const loadedMeta = {};
    const diagFiles = [];

    for (let sIdx = 0; sIdx < SHOTS.length; sIdx += 1) {
      const shot = SHOTS[sIdx];
      if (SHOT_FILTER && !SHOT_FILTER.has(sIdx)) continue;
      await page.evaluate((sid) => window.artifactureFx.setScene(sid), shot.scene);
      const fxState = await page.evaluate(() => ({
        sceneId: window.artifactureFx.sceneId,
        splatCount: window.artifactureFx.splatCount,
        shDegree: window.artifactureFx.shDegree,
        layout: window.artifactureFx.layout,
      }));
      loadedMeta[shot.id] = fxState;
      console.log(
        `[sizzle-v9] Shot ${sIdx + 1}/${SHOTS.length} (${shot.id}): scene=${fxState.sceneId}, ` +
          `splats=${fxState.splatCount.toLocaleString()}, SH${fxState.shDegree}`,
      );

      if (IS_DIAG && DIAG_TIMES[shot.id]) {
        const times = DIAG_TIMES[shot.id];
        for (let k = 0; k < times.length; k += 1) {
          const ts = times[k];
          const fpath = path.join(PREVIEW_DIR, `v9_diag_s${sIdx + 1}_${k + 1}.png`);
          await evalFrameForShot(page, shot, ts, shot.startSec + ts, 3);
          await page.screenshot({ path: fpath });
          diagFiles.push(fpath);
        }
      }

      if (IS_RENDER) {
        const totalShotFrames = Math.round(shot.durSec * FPS);
        const startFrameNum = Math.round(shot.startSec * FPS);
        for (let f = 0; f < totalShotFrames; f += 1) {
          const localSec = (f + 0.5) / FPS;
          const globalSec = shot.startSec + localSec;
          const frameIdx = startFrameNum + f + 1;
          const framePath = path.join(FRAMES_DIR, `frame_${String(frameIdx).padStart(4, '0')}.png`);
          await evalFrameForShot(page, shot, localSec, globalSec, f === 0 ? 3 : 1);
          await page.screenshot({ path: framePath });
        }
        console.log(`[sizzle-v9] Rendered ${totalShotFrames} frames for ${shot.id}`);
      }
    }

    if (IS_DIAG && diagFiles.length > 0) {
      const diagPath = '/Users/claytonkim/dev/radix/examples/artifacture-fx/concept-art/sizzle-v9-diag.png';
      const cols = 4;
      const rows = Math.ceil(diagFiles.length / cols);
      const inputs = diagFiles.flatMap((p) => ['-i', p]);
      const locs = [];
      for (let i = 0; i < diagFiles.length; i += 1) {
        locs.push(`${(i % cols) * 270}_${Math.floor(i / cols) * 480}`);
      }
      const filter =
        diagFiles.map((_, i) => `[${i}:v]scale=270:480[v${i}]`).join(';') +
        ';' +
        diagFiles.map((_, i) => `[v${i}]`).join('') +
        `xstack=inputs=${diagFiles.length}:layout=${locs.join('|')}[out]`;
      execFileSync('ffmpeg', ['-y', ...inputs, '-filter_complex', filter, '-map', '[out]', '-frames:v', '1', '-update', '1', diagPath]);
      console.log(`[sizzle-v9] Wrote multi-frame diag strip (${rows}x${cols}): ${diagPath}`);
    }

    writeFileSync(
      path.join(OUT_DIR, 'sizzle-v9-meta.json'),
      JSON.stringify({ mode, webgpuArgs, loadedMeta, consoleErrors, pageErrors }, null, 2),
    );
    if (consoleErrors.length || pageErrors.length) {
      console.error('Errors:', { consoleErrors, pageErrors });
      process.exitCode = 2;
    }
  } finally {
    await close();
  }
} finally {
  server.close();
}

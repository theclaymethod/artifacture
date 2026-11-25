import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launchVerifyBrowser } from '/Users/claytonkim/dev/artifacture-v2/packages/verify/dist/index.js';

const RADIX_ROOT = '/Users/claytonkim/dev/radix';
const OUT_DIR = '/tmp/v2-video-rec';
const FRAMES_DIR = path.join(OUT_DIR, 'sizzle-v10-frames');
const PREVIEW_DIR = path.join(OUT_DIR, 'sizzle-v10-preview-frames');
const PORT = Number(process.env.RADIX_PORT ?? 8090);
const FPS = 30;

const IS_DIAG = process.argv.includes('--diag');
const IS_RENDER = process.argv.includes('--render');
const shotsArg = process.argv.find((a) => a.startsWith('--shots='))?.split('=')[1];
const SHOT_FILTER = shotsArg ? new Set(shotsArg.split(',').map((s) => Number(s))) : null;
if (!IS_DIAG && !IS_RENDER) {
  console.error('Usage: node render-vertical-sizzle-v10.mjs [--diag | --render] [--shots=0,1,...]');
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

// V10 20.5s vertical 9:16 social media sizzle reel:
// 1. Dimensional Wormhole Fly-Through FIRST — upgraded to the new wide Pacific Northwest rainforest creek
//    launching through a chaotic gravity rift into the new twin-obsidian-monolith Saturn alien canyon!
// 2. Neon Tokyo Dream (opposing counter-parallax & elastic depth shear + micro-Gaussian bloom)
// 3. Volumetric Smoke & Ash (front-facing Stone Buddha complete dissolve)
// 4. Stark Monochrome Particly B&W LiDAR Shockwave (10M SH3 Grace Cathedral Gothic Nave)
const SHOTS = [
  {
    id: 'shot1_dual_world_portal_wide',
    scene: 'forest_clearing_wide',
    startSec: 0.0,
    durSec: 6.0,
    mode: 'singularity',
    skyFade: 0,
    kicker: '2.36M DUAL-WORLD 3DGS · WEBGPU TSL',
    title: 'Dimensional Wormhole',
    sub: 'Chaotic Gravity Rift · Slingshot Launch Traversal',
    portalFlythrough: true,
    fxCenter: [0.06, 0.55, -6.2],
    fxScale: 1.0,
    floorY: -0.46,
    fov: 38.5,
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
    // True Gravitational Slingshot Launch Ramp calibrated to the new 16:9 wide SHARP scenes (38.7° native vFOV):
    // 0.0-1.95s: Smooth creep down mossy rainforest creek while chaotic gravity tear rips open under vine arch
    // 1.95-3.85s: Exponential gravity-well launch (u^2.35) + warp-FOV kick (38 -> 55 -> 38.5 deg) across membrane!
    // 3.85-6.00s: Ease-out deceleration inside golden alien canyon framed by twin obsidian monoliths & Saturn giant
    const pApproach = smooth01(localSec / 2.05);
    const uLaunchRaw = clamp((localSec - 1.90) / 1.95, 0, 1);
    const pLaunch = Math.pow(uLaunchRaw, 2.35);
    const uEmergeRaw = clamp((localSec - 3.82) / 2.18, 0, 1);
    const pEmerge = 1 - Math.pow(1 - uEmergeRaw, 2.4);

    const z = -0.15 - 0.85 * pApproach - 5.05 * pLaunch - 0.85 * pEmerge;
    const y = 0.0 + 0.08 * pApproach + 0.47 * pLaunch + 0.14 * pEmerge;
    const x = 0.0 + 0.03 * Math.sin(pApproach * Math.PI) + 0.06 * pLaunch - 0.05 * Math.sin(pEmerge * Math.PI);

    camPos = [x, y, z];
    camTarget = [
      lerp(0.04, 0.45, pLaunch) + 0.22 * pEmerge,
      lerp(0.14, 0.50, pApproach) + 0.12 * pLaunch + 0.16 * pEmerge,
      lerp(-6.2, -16.5, smooth01((localSec - 1.3) / 3.0)),
    ];
    const warpKick = Math.sin(Math.pow(clamp((localSec - 2.15) / 2.15, 0, 1), 1.35) * Math.PI);
    camRoll = warpKick * 0.105 - Math.sin(pEmerge * Math.PI) * 0.018;
    fov = 38.5 - 1.0 * pApproach + 11.5 * warpKick + 0.5 * pEmerge;
  } else if (shot.tokyoParallaxArc) {
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
  shot1_dual_world_portal_wide: [0.20, 2.35, 3.45, 5.15],
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
    viewport: { width: 1080, height: 1920 },
  });
  console.log(`[sizzle-v10] Chromium WebGPU ready (mode=${mode})`);

  const context = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  const initialScene = SHOT_FILTER ? SHOTS[Math.min(...SHOT_FILTER)].scene : SHOTS[0].scene;
  const pageUrl = `http://127.0.0.1:${PORT}/build/examples/artifacture-fx/index.html?cinema=1&scene=${initialScene}`;
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => window.artifactureFx && window.artifactureFx.splatCount > 0, { timeout: 180_000 });

  const loadedMeta = {};
  const diagFiles = [];

  for (let sIdx = 0; sIdx < SHOTS.length; sIdx += 1) {
    if (SHOT_FILTER && !SHOT_FILTER.has(sIdx)) continue;
    const shot = SHOTS[sIdx];
    const currentScene = await page.evaluate(() => window.artifactureFx.sceneId);
    if (currentScene !== shot.scene) {
      await page.evaluate(
        ({ scene, overrides }) => window.artifactureFx.setScene(scene, overrides),
        { scene: shot.scene, overrides: shot.sceneOverrides },
      );
    }
    const meta = await page.evaluate(() => ({
      sceneId: window.artifactureFx.sceneId,
      splatCount: window.artifactureFx.splatCount,
      shDegree: window.artifactureFx.shDegree,
      layout: window.artifactureFx.layout,
    }));
    loadedMeta[shot.id] = meta;
    console.log(
      `[sizzle-v10] Shot ${sIdx + 1}/${SHOTS.length} (${shot.id}): scene=${meta.sceneId}, splats=${meta.splatCount.toLocaleString()}, SH${meta.shDegree}`,
    );

    if (IS_DIAG) {
      const times = DIAG_TIMES[shot.id] ?? [shot.durSec * 0.5];
      for (let ti = 0; ti < times.length; ti += 1) {
        const localSec = times[ti];
        const globalSec = shot.startSec + localSec;
        await evalFrameForShot(page, shot, localSec, globalSec, 3);
        const outPath = path.join(PREVIEW_DIR, `v10_diag_s${sIdx + 1}_${ti + 1}.png`);
        await page.screenshot({ path: outPath });
        diagFiles.push(outPath);
      }
    }

    if (IS_RENDER) {
      const startFrame = Math.round(shot.startSec * FPS);
      const count = Math.round(shot.durSec * FPS);
      for (let i = 0; i < count; i += 1) {
        const localSec = i / FPS;
        const globalSec = shot.startSec + localSec;
        const frameNum = startFrame + i;
        await evalFrameForShot(page, shot, localSec, globalSec, i === 0 ? 3 : 1);
        const framePath = path.join(FRAMES_DIR, `frame_${String(frameNum).padStart(4, '0')}.png`);
        await page.screenshot({ path: framePath });
      }
      console.log(`[sizzle-v10] Rendered ${count} frames for ${shot.id}`);
    }
  }

  if (IS_DIAG && diagFiles.length === 16) {
    const stripOut = '/Users/claytonkim/dev/radix/examples/artifacture-fx/concept-art/sizzle-v10-diag.png';
    const inputs = [];
    const filters = [];
    for (let i = 0; i < 16; i += 1) {
      inputs.push('-i', diagFiles[i]);
      filters.push(`[${i}:v]scale=270:480[v${i}]`);
    }
    const layout = [
      '0_0', '270_0', '540_0', '810_0',
      '0_480', '270_480', '540_480', '810_480',
      '0_960', '270_960', '540_960', '810_960',
      '0_1440', '270_1440', '540_1440', '810_1440',
    ].join('|');
    filters.push(`${Array.from({ length: 16 }, (_, i) => `[v${i}]`).join('')}xstack=inputs=16:layout=${layout}[out]`);
    execFileSync('ffmpeg', ['-y', ...inputs, '-filter_complex', filters.join(';'), '-map', '[out]', '-frames:v', '1', '-update', '1', stripOut], {
      stdio: 'inherit',
    });
    console.log(`[sizzle-v10] Wrote multi-frame diag strip (4x4): ${stripOut}`);
  }

  writeFileSync(
    path.join(OUT_DIR, 'sizzle-v10-meta.json'),
    JSON.stringify({ mode, webgpuArgs, loadedMeta, consoleErrors, pageErrors }, null, 2),
  );
  if (consoleErrors.length || pageErrors.length) {
    console.error('[sizzle-v10] ERRORS:', { consoleErrors, pageErrors });
    process.exitCode = 1;
  }

  await close();
} finally {
  server.close();
}

import * as THREE from "three";
import { RenderPipeline } from "three/webgpu";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import {
  CameraControls,
  GpuArrays,
  GpuShPalette,
  Sh,
  SplatCollection,
  SplatGenerator,
  SplatRenderer,
  Splats,
  TSL,
  createRenderer,
  loadSplatFile,
  type ArrayData,
} from "@sparkjsdev/radix";
import {
  DECK_SCENES,
  SLIDES,
  type DeckSceneId,
  type SceneAssetSpec,
  type SlideSpec,
} from "./slides.js";
import {
  ALIEN_WORLD_OFFSET,
  createDeckUniforms,
  createMainFxModifier,
  createWormholeModifiers,
} from "./shaders.js";

const { pass } = TSL;

// ── DOM Elements ───────────────────────────────────────────────────────────

const stageRoot = document.getElementById("stage-root")!;
const sceneVeil = document.getElementById("scene-veil")!;
const progressFill = document.getElementById("progress-fill")!;
const slideOverlay = document.getElementById("slide-overlay")!;
const slideCard = document.getElementById("slide-card")!;
const slideCounter = document.getElementById("slide-counter")!;
const telemetryDot = document.getElementById("telemetry-dot")!;
const telemetryText = document.getElementById("telemetry-text")!;
const loadingToast = document.getElementById("loading-toast")!;
const notesDrawer = document.getElementById("notes-drawer")!;
const notesBody = document.getElementById("notes-body")!;
const overviewModal = document.getElementById("overview-modal")!;
const overviewGrid = document.getElementById("overview-grid")!;
const btnPrev = document.getElementById("btn-prev")!;
const btnNext = document.getElementById("btn-next")!;
const btnReplay = document.getElementById("btn-replay")!;
const btnOrbit = document.getElementById("btn-orbit")!;
const btnNotes = document.getElementById("btn-notes")!;
const btnOverview = document.getElementById("btn-overview")!;
const btnHide = document.getElementById("btn-hide")!;
const btnHub = document.getElementById("btn-hub");
const btnCloseOverview = document.getElementById("btn-close-overview")!;

const IS_STANDALONE =
  window.location.hostname !== "127.0.0.1" && window.location.hostname !== "localhost";
if (IS_STANDALONE && btnHub) {
  btnHub.style.display = "none";
}

// ── WebGPU + Radix Renderer Setup ──────────────────────────────────────────

const renderer = await createRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
stageRoot.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.05, 500);
const controls = new CameraControls({
  canvas: renderer.domElement,
  object: camera,
  settings: { mode: "orbit" },
});

const uniforms = createDeckUniforms();
const mainFxModifier = createMainFxModifier(uniforms);
const { forestPortalOutModifier, alienPortalInModifier } = createWormholeModifiers(uniforms);

const pipeline = new RenderPipeline(renderer);
const scenePass = pass(scene, camera);
const sceneColor = scenePass.getTextureNode("output");
const bloomPass = bloom(sceneColor, 0.0, 0.35, 0.88);
pipeline.outputNode = sceneColor.add(bloomPass);

const model = new THREE.Object3D();
model.matrixAutoUpdate = false;
scene.add(model);

const splatRenderer = new SplatRenderer({
  renderer,
  collection: SplatCollection.EMPTY,
  modifier: mainFxModifier,
  modifierSpace: "world",
});
scene.add(splatRenderer);

// ── Math & Geometry Helpers ────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth01 = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
const lerp3 = (
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

function scanRotation(up?: readonly [number, number, number]): THREE.Quaternion {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  if (up) {
    q.premultiply(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(up[0], up[1], up[2]).normalize(),
        new THREE.Vector3(0, 1, 0),
      ),
    );
  }
  return q;
}

function computeFitMatrix(data: ArrayData, flipX: boolean, targetSpan: number): THREE.Matrix4 {
  const { bundle } = Splats.get(data);
  const samples = Math.min(data.count, 32768);
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  const rec = Splats.makeExtSplat();
  const decode = Splats.decoder(bundle);
  const c = { x: 0, y: 0, z: 0 };

  for (let s = 0; s < samples; s += 1) {
    const idx = Math.floor((s * data.count) / samples);
    decode(idx, rec);
    if (rec.opacity < 0.2) continue;
    const { x, y, z } = rec.center;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    xs.push(x);
    ys.push(y);
    zs.push(z);
  }
  if (xs.length < 32) {
    xs.length = 0;
    ys.length = 0;
    zs.length = 0;
    for (let s = 0; s < samples; s += 1) {
      Splats.loadCenter(bundle, Math.floor((s * data.count) / samples), c);
      if (Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.z)) {
        xs.push(c.x);
        ys.push(c.y);
        zs.push(c.z);
      }
    }
  }
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  zs.sort((a, b) => a - b);
  const pct = (arr: number[], q: number) => arr[Math.min(arr.length - 1, Math.floor(arr.length * q))];
  const cx = pct(xs, 0.5);
  const cy = pct(ys, 0.5);
  const cz = pct(zs, 0.5);
  const spanX = Math.max(0.05, pct(xs, 0.9) - pct(xs, 0.1));
  const spanY = Math.max(0.05, pct(ys, 0.9) - pct(ys, 0.1));
  const spanZ = Math.max(0.05, pct(zs, 0.9) - pct(zs, 0.1));
  const scale = targetSpan / Math.max(spanX, spanY, spanZ);

  return new THREE.Matrix4()
    .makeScale(scale, scale, scale)
    .multiply(new THREE.Matrix4().makeRotationX(flipX ? Math.PI : 0))
    .multiply(new THREE.Matrix4().makeTranslation(-cx, -cy, -cz));
}

// ── Scene Loader + Lightweight Preload Cache ───────────────────────────────

type LoadedEntry = Awaited<ReturnType<typeof loadSplatFile>>;
const parsedCache = new Map<string, Promise<LoadedEntry>>();

function fetchSplatCached(url: string, meta: SceneAssetSpec): Promise<LoadedEntry> {
  const key = `${url}::${meta.layout}::${String(meta.sh)}`;
  let p = parsedCache.get(key);
  if (!p) {
    p = loadSplatFile(url, { name: url, worker: true, layout: meta.layout, sh: meta.sh });
    parsedCache.set(key, p);
  }
  return p;
}

let activeSceneId: DeckSceneId | null = null;
let currentSplatCount = 0;
let currentShDegree = 0;
let isLoadingScene = false;
let loadSeq = 0;

function setLoadingState(loading: boolean, message?: string) {
  isLoadingScene = loading;
  telemetryDot.classList.toggle("loading", loading);
  if (loading && message) {
    loadingToast.textContent = message;
    loadingToast.classList.add("visible");
  } else {
    loadingToast.classList.remove("visible");
  }
}

async function mountScene(sceneId: DeckSceneId): Promise<void> {
  if (activeSceneId === sceneId) return;
  const seq = ++loadSeq;
  const meta = DECK_SCENES[sceneId];
  const loadingMsg =
    sceneId === "grace" && meta.url.startsWith("http")
      ? "Streaming Grace Cathedral (10M SH3 · 715 MB)..."
      : `Loading ${meta.label}...`;
  setLoadingState(true, loadingMsg);

  try {
    if (meta.placement === "dual_world" && meta.secondaryUrl) {
      const [forestLoaded, alienLoaded] = await Promise.all([
        fetchSplatCached(meta.url, meta),
        fetchSplatCached(meta.secondaryUrl, meta),
      ]);
      if (seq !== loadSeq) return;

      const forestFit = new THREE.Matrix4().makeRotationFromQuaternion(scanRotation());
      const alienFit = new THREE.Matrix4()
        .makeTranslation(ALIEN_WORLD_OFFSET.x, ALIEN_WORLD_OFFSET.y, ALIEN_WORLD_OFFSET.z)
        .multiply(new THREE.Matrix4().makeRotationFromQuaternion(scanRotation()));

      const forestArrays = GpuArrays.fromData(renderer, forestLoaded.splats);
      const alienArrays = GpuArrays.fromData(renderer, alienLoaded.splats);
      const forestGen = SplatGenerator.forArrays(forestArrays, {
        sh: false,
        modifiers: [forestPortalOutModifier],
      });
      const alienGen = SplatGenerator.forArrays(alienArrays, {
        sh: false,
        modifiers: [alienPortalInModifier],
      });

      splatRenderer.modifier = undefined;
      model.matrix.copy(forestFit);
      model.matrixWorld.copy(forestFit);
      splatRenderer.collection = new SplatCollection([
        {
          generator: forestGen,
          data: { splats: forestArrays },
          count: forestArrays.count,
          matrixWorld: model.matrixWorld,
          release: () => forestArrays.dispose(),
        },
        {
          generator: alienGen,
          data: { splats: alienArrays },
          count: alienArrays.count,
          matrixWorld: alienFit,
          release: () => alienArrays.dispose(),
        },
      ]);

      currentSplatCount = forestLoaded.splats.count + alienLoaded.splats.count;
      currentShDegree = 0;
    } else {
      const loaded = await fetchSplatCached(meta.url, meta);
      if (seq !== loadSeq) return;

      const fit =
        meta.placement === "catalog"
          ? new THREE.Matrix4().makeRotationFromQuaternion(meta.flipX ? scanRotation(meta.up) : new THREE.Quaternion())
          : computeFitMatrix(loaded.splats, meta.flipX, meta.targetSpan);

      const fileArrays = GpuArrays.fromData(renderer, loaded.splats);
      const paletteArrays = loaded.shPalette && GpuShPalette.upload(renderer, loaded.shPalette);
      const release = () => {
        fileArrays.dispose();
        paletteArrays?.dispose();
      };

      splatRenderer.modifier = mainFxModifier;
      model.matrix.copy(fit);
      model.matrixWorld.copy(fit);
      splatRenderer.collection = new SplatCollection([
        SplatCollection.arrays(fileArrays, { matrixWorld: model.matrixWorld, shPalette: paletteArrays, release }),
      ]);

      currentSplatCount = loaded.splats.count;
      currentShDegree = Sh.find(loaded.splats.bundles)?.degree ?? loaded.shPalette?.degree ?? 0;
    }

    uniforms.uFxCenter.value.set(meta.fxCenter[0], meta.fxCenter[1], meta.fxCenter[2]);
    uniforms.uFxScale.value = meta.fxScale;
    uniforms.uFloorY.value = meta.floorY;
    uniforms.uOuterFade.value = meta.placement === "normalized" ? 1.0 : 0.0;
    splatRenderer.objectParams.blurAmount = meta.preBlur ? 0 : 0.3;
    splatRenderer.objectParams.preBlurAmount = meta.preBlur ? 0.3 : 0;

    activeSceneId = sceneId;
  } finally {
    if (seq === loadSeq) {
      setLoadingState(false);
    }
  }
}

// Sequential background-prefetch so remaining scenes (4.2 + 2.0 + 8.1 MB) never compete with initial Slide 1 paint
async function prefetchLightScenes() {
  for (const id of ["tokyo_alley", "buddha", "grace"] as const) {
    try {
      await fetchSplatCached(DECK_SCENES[id].url, DECK_SCENES[id]);
    } catch {
      // Ignore speculative prefetch failures; mountScene will retry on demand
    }
  }
}

// ── Slide State & Continuous Transition Engine ─────────────────────────────

interface ActiveTransition {
  from: SlideSpec;
  to: SlideSpec;
  kind: "glide" | "wormhole-launch" | "tokyo-arc";
  reverse: boolean;
  startClock: number;
  durationSec: number;
}

let currentSlideIdx = 0;
let slideEnteredAt = 0;
let deckClock = 0;
let lastFrameMs = performance.now();
let fpsSmoothed = 60;
let freeCam = false;
let manualStepping = false;
let activeTransition: ActiveTransition | null = null;

function applyCameraPose(
  pos: readonly [number, number, number],
  target: readonly [number, number, number],
  fov: number,
  roll: number,
) {
  camera.fov = fov;
  camera.updateProjectionMatrix();
  camera.position.set(pos[0], pos[1], pos[2]);
  camera.up.set(0, 1, 0);
  camera.lookAt(target[0], target[1], target[2]);
  if (Math.abs(roll) > 1e-4) {
    camera.rotateZ(roll);
  }
  uniforms.uCamPos.value.copy(camera.position);
}

function setModeWeights(mode: SlideSpec["fx"]["mode"]) {
  uniforms.uShock.value = mode === "shockwave" ? 1.0 : 0.0;
  uniforms.uDissolve.value = mode === "dissolve" ? 1.0 : 0.0;
  uniforms.uTokyo.value = mode === "tokyo" ? 1.0 : 0.0;
  uniforms.uWormhole.value = mode === "wormhole" ? 1.0 : 0.0;
}

function setBloom(strength: number, radius: number, threshold: number) {
  bloomPass.strength.value = strength;
  bloomPass.radius.value = radius;
  bloomPass.threshold.value = threshold;
}

function computeSlideFxAge(slide: SlideSpec, elapsed: number): number {
  const fx = slide.fx;
  if (fx.loopSec && fx.loopSec > 0) {
    const lead = fx.loopLeadSec ?? 0;
    const cycle = lead + fx.loopSec;
    const local = elapsed % cycle;
    if (local < lead) return 0;
    return (local - lead) * (fx.ageRate ?? 1.0);
  }
  if (fx.ageStatic !== undefined && fx.ageRate !== undefined) {
    return Math.min(fx.ageStatic, elapsed * fx.ageRate + 0.65);
  }
  if (fx.ageStatic !== undefined) return fx.ageStatic;
  return elapsed * (fx.ageRate ?? 1.0);
}

function evalContinuousTransition(tr: ActiveTransition, uRaw: number) {
  const u = clamp(uRaw, 0, 1);
  const from = tr.from;
  const to = tr.to;

  if (tr.kind === "wormhole-launch") {
    // Exponential gravitational slingshot ramp through z = -6.2 with vertigo warp-FOV kick!
    const dirU = tr.reverse ? 1 - u : u;
    const forestSlide = tr.reverse ? to : from;
    const alienSlide = tr.reverse ? from : to;

    const uLaunchRaw = clamp(dirU / 0.72, 0, 1);
    const pLaunch = Math.pow(uLaunchRaw, 2.35);
    const uEmergeRaw = clamp((dirU - 0.68) / 0.32, 0, 1);
    const pEmerge = 1 - Math.pow(1 - uEmergeRaw, 2.4);

    // Bridge from forest pose -> portal throat (-6.05) -> alien emergence pose
    const throatPos: [number, number, number] = [0.24, 0.55, -6.05];
    const throatTgt: [number, number, number] = [0.2, 0.68, -14.5];

    const posA = lerp3(forestSlide.camera.pos, throatPos, pLaunch);
    const pos = lerp3(posA, alienSlide.camera.pos, pEmerge);
    const tgtA = lerp3(forestSlide.camera.target, throatTgt, smooth01(dirU / 0.75));
    const tgt = lerp3(tgtA, alienSlide.camera.target, pEmerge);

    const warpKick = Math.sin(Math.pow(clamp((dirU - 0.08) / 0.84, 0, 1), 1.35) * Math.PI);
    const fov = lerp(forestSlide.camera.fov, alienSlide.camera.fov, smooth01(dirU)) + 22.0 * warpKick;
    const roll = warpKick * (tr.reverse ? -0.105 : 0.115);

    applyCameraPose(pos, tgt, fov, roll);
    setModeWeights("wormhole");
    uniforms.uFxMix.value = 1.0;
    uniforms.uTwist.value = 0.0;
    uniforms.uFxAge.value = lerp(forestSlide.fx.ageStatic ?? 2.3, alienSlide.fx.ageStatic ?? 3.4, dirU);
    setBloom(
      lerp(from.fx.bloomStrength, to.fx.bloomStrength, u) + warpKick * 0.14,
      lerp(from.fx.bloomRadius, to.fx.bloomRadius, u),
      lerp(from.fx.bloomThreshold, to.fx.bloomThreshold, u),
    );
    return;
  }

  if (tr.kind === "tokyo-arc") {
    const s = smooth01(u);
    const pos = lerp3(from.camera.pos, to.camera.pos, s);
    // Add lateral S-arc bow mid-transition for dramatic parallax sweep
    pos[0] += Math.sin(s * Math.PI) * 0.24;
    const tgt = lerp3(from.camera.target, to.camera.target, s);
    const fov = lerp(from.camera.fov, to.camera.fov, s) + Math.sin(s * Math.PI) * 3.5;
    const roll = lerp(from.camera.roll, to.camera.roll, s);

    applyCameraPose(pos, tgt, fov, roll);
    setModeWeights("tokyo");
    uniforms.uFxMix.value = lerp(from.fx.mix, to.fx.mix, s);
    uniforms.uTwist.value = lerp(from.fx.twist, to.fx.twist, s);
    uniforms.uFxAge.value = deckClock * 0.45;
    setBloom(
      lerp(from.fx.bloomStrength, to.fx.bloomStrength, s),
      lerp(from.fx.bloomRadius, to.fx.bloomRadius, s),
      lerp(from.fx.bloomThreshold, to.fx.bloomThreshold, s),
    );
    return;
  }

  // Standard smooth glide within same scene
  const s = smooth01(u);
  applyCameraPose(
    lerp3(from.camera.pos, to.camera.pos, s),
    lerp3(from.camera.target, to.camera.target, s),
    lerp(from.camera.fov, to.camera.fov, s),
    lerp(from.camera.roll, to.camera.roll, s),
  );
  setModeWeights(to.fx.mode);
  uniforms.uFxMix.value = lerp(from.fx.mix, to.fx.mix, s);
  uniforms.uTwist.value = lerp(from.fx.twist, to.fx.twist, s);
  uniforms.uFxAge.value = lerp(
    from.fx.ageStatic ?? 0,
    to.fx.ageStatic ?? (to.fx.mode === "wormhole" ? 2.3 : 0.8),
    s,
  );
  setBloom(
    lerp(from.fx.bloomStrength, to.fx.bloomStrength, s),
    lerp(from.fx.bloomRadius, to.fx.bloomRadius, s),
    lerp(from.fx.bloomThreshold, to.fx.bloomThreshold, s),
  );
}

function evalSteadySlide(slide: SlideSpec, elapsed: number) {
  if (!freeCam) {
    const ph = elapsed * slide.camera.driftSpeed;
    const d = slide.camera.driftAmp;
    const pos: [number, number, number] = [
      slide.camera.pos[0] + Math.sin(ph) * d[0],
      slide.camera.pos[1] + Math.sin(ph * 0.72 + 0.8) * d[1],
      slide.camera.pos[2] + (Math.cos(ph * 0.55) - 1) * d[2] * 0.5,
    ];
    applyCameraPose(pos, slide.camera.target, slide.camera.fov, slide.camera.roll);
  } else {
    controls.update(1 / 60);
    uniforms.uCamPos.value.copy(camera.position);
  }

  setModeWeights(slide.fx.mode);
  uniforms.uFxMix.value = slide.fx.mix;
  uniforms.uTwist.value = slide.fx.twist;
  uniforms.uFxAge.value = computeSlideFxAge(slide, elapsed);
  setBloom(slide.fx.bloomStrength, slide.fx.bloomRadius, slide.fx.bloomThreshold);
}

// ── UI Rendering ───────────────────────────────────────────────────────────

function renderSlideContent(slide: SlideSpec) {
  document.body.dataset.layout = slide.layout;

  const bulletsHtml = slide.bullets?.length
    ? `<ul class="slide-bullets">${slide.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`
    : "";

  const metricsHtml = slide.metrics?.length
    ? `<div class="slide-metrics">${slide.metrics
        .map(
          (m) =>
            `<div class="metric-chip"><span class="metric-label">${m.label}</span><span class="metric-value">${m.value}</span></div>`,
        )
        .join("")}</div>`
    : "";

  const summaryHtml = slide.summaryRows?.length
    ? `<div class="summary-table-wrap">
        <table class="summary-table">
          <thead>
            <tr><th>Effect</th><th>3DGS Scene</th><th>Splats</th><th>GPU TSL Technique</th></tr>
          </thead>
          <tbody>
            ${slide.summaryRows
              .map(
                (r) =>
                  `<tr><td>${r.effect}</td><td>${r.scene}</td><td class="mono">${r.splats}</td><td>${r.technique}</td></tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>
      <div class="summary-actions">
        <button class="action-link" id="btn-summary-orbit" type="button">Explore Live in Free Orbit (O)</button>
        <button class="action-link secondary" id="btn-summary-restart" type="button">Restart From Wormhole</button>
        ${IS_STANDALONE ? "" : '<a class="action-link secondary" href="../fx-lab/">Open 9-Mode FX Lab →</a>'}
      </div>`
    : "";

  slideCard.innerHTML = `
    <div class="slide-kicker">${slide.kicker}</div>
    <h1 class="slide-title">${slide.title}</h1>
    <p class="slide-lead">${slide.lead}</p>
    ${bulletsHtml}
    ${metricsHtml}
    ${summaryHtml}
  `;

  notesBody.textContent = slide.notes;
  slideCounter.textContent = `${String(currentSlideIdx + 1).padStart(2, "0")} / ${String(SLIDES.length).padStart(2, "0")}`;
  progressFill.style.width = `${((currentSlideIdx + 1) / SLIDES.length) * 100}%`;

  const btnSummaryOrbit = document.getElementById("btn-summary-orbit");
  btnSummaryOrbit?.addEventListener("click", () => toggleFreeCam(true));
  const btnSummaryRestart = document.getElementById("btn-summary-restart");
  btnSummaryRestart?.addEventListener("click", () => void goToSlide(0));

  for (const el of overviewGrid.querySelectorAll<HTMLButtonElement>(".overview-item")) {
    el.classList.toggle("active", Number(el.dataset.idx) === currentSlideIdx);
  }
}

function buildOverviewGrid() {
  overviewGrid.innerHTML = SLIDES.map(
    (s, idx) => `
      <button class="overview-item" data-idx="${idx}" type="button">
        <span class="overview-num">${String(idx + 1).padStart(2, "0")} · ${s.fx.mode.toUpperCase()}</span>
        <span class="overview-title">${s.title}</span>
        <span class="overview-scene">${DECK_SCENES[s.scene].label}</span>
      </button>
    `,
  ).join("");
  for (const el of overviewGrid.querySelectorAll<HTMLButtonElement>(".overview-item")) {
    el.addEventListener("click", () => {
      toggleOverview(false);
      void goToSlide(Number(el.dataset.idx));
    });
  }
}

// ── Navigation ─────────────────────────────────────────────────────────────

async function goToSlide(targetIdx: number, instant = false): Promise<void> {
  const clamped = clamp(targetIdx, 0, SLIDES.length - 1);
  const prevIdx = currentSlideIdx;
  const fromSlide = SLIDES[prevIdx];
  const toSlide = SLIDES[clamped];

  if (freeCam) toggleFreeCam(false);
  currentSlideIdx = clamped;

  const sameScene = activeSceneId === toSlide.scene;
  const forwardCont = clamped === prevIdx + 1 && sameScene ? toSlide.transitionFromPrev : undefined;
  const reverseCont = clamped === prevIdx - 1 && sameScene ? fromSlide.transitionFromPrev : undefined;
  const continuous = !instant && (forwardCont || reverseCont);

  if (continuous) {
    // Intra-world live camera + shader transition! Hide slide card momentarily during wormhole launch
    activeTransition = {
      from: fromSlide,
      to: toSlide,
      kind: continuous.kind,
      reverse: Boolean(reverseCont),
      startClock: deckClock,
      durationSec: continuous.durationSec,
    };
    slideEnteredAt = deckClock;

    slideOverlay.classList.add("transitioning");
    const swapDelayMs = continuous.kind === "wormhole-launch" ? 1550 : 260;
    window.setTimeout(() => {
      if (currentSlideIdx === clamped) {
        renderSlideContent(toSlide);
        slideOverlay.classList.remove("transitioning");
      }
    }, swapDelayMs);
  } else {
    activeTransition = null;
    if (!sameScene && !instant) {
      sceneVeil.style.opacity = "1";
      slideOverlay.classList.add("transitioning");
      await new Promise((r) => window.setTimeout(r, 220));
    }
    await mountScene(toSlide.scene);
    slideEnteredAt = deckClock;
    renderSlideContent(toSlide);
    evalSteadySlide(toSlide, 0);
    if (!instant) {
      sceneVeil.style.opacity = "0";
      slideOverlay.classList.remove("transitioning");
    } else {
      sceneVeil.style.opacity = "0";
      slideOverlay.classList.remove("transitioning");
    }
  }

  window.history.replaceState(null, "", `#slide-${clamped + 1}`);
}

function triggerReplay() {
  activeTransition = null;
  slideEnteredAt = deckClock;
}

function toggleFreeCam(force?: boolean) {
  freeCam = force !== undefined ? force : !freeCam;
  document.body.classList.toggle("freecam", freeCam);
  btnOrbit.classList.toggle("active", freeCam);
  if (freeCam) {
    activeTransition = null;
    const t = SLIDES[currentSlideIdx].camera.target;
    controls.lookAt(new THREE.Vector3(t[0], t[1], t[2]));
    document.body.classList.add("ui-hidden");
    btnHide.classList.add("active");
  } else {
    document.body.classList.remove("ui-hidden");
    btnHide.classList.remove("active");
  }
}

function toggleNotes(force?: boolean) {
  const next = force !== undefined ? force : !notesDrawer.classList.contains("open");
  notesDrawer.classList.toggle("open", next);
  btnNotes.classList.toggle("active", next);
}

function toggleOverview(force?: boolean) {
  const next = force !== undefined ? force : !overviewModal.classList.contains("open");
  overviewModal.classList.toggle("open", next);
  btnOverview.classList.toggle("active", next);
}

function toggleCleanUi(force?: boolean) {
  const next = force !== undefined ? force : !document.body.classList.contains("ui-hidden");
  document.body.classList.toggle("ui-hidden", next);
  btnHide.classList.toggle("active", next);
}

// ── Event Listeners ────────────────────────────────────────────────────────

btnPrev.addEventListener("click", () => void goToSlide(currentSlideIdx - 1));
btnNext.addEventListener("click", () => void goToSlide(currentSlideIdx + 1));
btnReplay.addEventListener("click", () => triggerReplay());
btnOrbit.addEventListener("click", () => toggleFreeCam());
btnNotes.addEventListener("click", () => toggleNotes());
btnOverview.addEventListener("click", () => toggleOverview());
btnHide.addEventListener("click", () => toggleCleanUi());
btnCloseOverview.addEventListener("click", () => toggleOverview(false));

window.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (overviewModal.classList.contains("open")) {
    if (e.key === "Escape" || e.key.toLowerCase() === "g") toggleOverview(false);
    return;
  }
  switch (e.key) {
    case "ArrowRight":
    case "PageDown":
    case " ":
      e.preventDefault();
      void goToSlide(currentSlideIdx + 1);
      break;
    case "ArrowLeft":
    case "PageUp":
      e.preventDefault();
      void goToSlide(currentSlideIdx - 1);
      break;
    case "r":
    case "R":
      triggerReplay();
      break;
    case "o":
    case "O":
      toggleFreeCam();
      break;
    case "n":
    case "N":
      toggleNotes();
      break;
    case "g":
    case "G":
      toggleOverview();
      break;
    case "h":
    case "H":
      toggleCleanUi();
      break;
    case "Escape":
      if (freeCam) toggleFreeCam(false);
      else if (notesDrawer.classList.contains("open")) toggleNotes(false);
      break;
    default: {
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= SLIDES.length) {
        void goToSlide(n - 1);
      }
    }
  }
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Animation Loop ─────────────────────────────────────────────────────────

function updateTelemetry() {
  if (isLoadingScene) {
    telemetryText.textContent = "Streaming 3DGS...";
    return;
  }
  const shLabel = currentShDegree > 0 ? `SH${currentShDegree}` : "SH0";
  const countLabel =
    currentSplatCount >= 1_000_000
      ? `${(currentSplatCount / 1_000_000).toFixed(2)}M`
      : `${Math.round(currentSplatCount / 1000)}k`;
  telemetryText.textContent = `${countLabel} splats · ${shLabel} · ${Math.round(fpsSmoothed)} fps`;
}

function tick(nowMs: number) {
  const dt = clamp((nowMs - lastFrameMs) / 1000, 0.001, 0.1);
  lastFrameMs = nowMs;
  fpsSmoothed = lerp(fpsSmoothed, 1 / dt, 0.08);

  if (!manualStepping) {
    deckClock += dt;
    uniforms.uTime.value = deckClock;

    if (activeTransition) {
      const u = (deckClock - activeTransition.startClock) / activeTransition.durationSec;
      evalContinuousTransition(activeTransition, u);
      if (u >= 1) {
        activeTransition = null;
        slideEnteredAt = deckClock;
      }
    } else {
      evalSteadySlide(SLIDES[currentSlideIdx], deckClock - slideEnteredAt);
    }

    pipeline.render();
  }

  updateTelemetry();
  requestAnimationFrame(tick);
}

// ── Deterministic Verification / Recording Hook (`window.splatDeck`) ───────

interface DeckWindowApi {
  ready: boolean;
  slideCount: number;
  goToSlide: (idx: number, instant?: boolean) => Promise<void>;
  renderSlideAt: (opts: {
    slideIdx: number;
    elapsedSec: number;
    timeSec?: number;
    hideUi?: boolean;
    settlePasses?: number;
  }) => Promise<void>;
  renderTransitionAt: (opts: {
    fromIdx: number;
    toIdx: number;
    u: number;
    timeSec?: number;
    hideCard?: boolean;
    settlePasses?: number;
  }) => Promise<void>;
  resumeLive: () => void;
  getState: () => {
    slideIdx: number;
    slideId: string;
    sceneId: DeckSceneId | null;
    splatCount: number;
    shDegree: number;
  };
}

declare global {
  interface Window {
    splatDeck?: DeckWindowApi;
  }
}

const api: DeckWindowApi = {
  ready: false,
  slideCount: SLIDES.length,
  goToSlide,
  async renderSlideAt({ slideIdx, elapsedSec, timeSec, hideUi = false, settlePasses = 2 }) {
    manualStepping = true;
    activeTransition = null;
    const clamped = clamp(slideIdx, 0, SLIDES.length - 1);
    const slide = SLIDES[clamped];
    currentSlideIdx = clamped;
    await mountScene(slide.scene);
    sceneVeil.style.opacity = "0";
    slideOverlay.style.opacity = "";
    slideOverlay.classList.remove("transitioning");
    document.body.classList.toggle("ui-hidden", hideUi);
    renderSlideContent(slide);
    deckClock = timeSec ?? elapsedSec;
    uniforms.uTime.value = deckClock;
    evalSteadySlide(slide, elapsedSec);
    updateTelemetry();
    for (let i = 0; i < settlePasses; i++) {
      pipeline.render();
      await new Promise((r) => requestAnimationFrame(r));
    }
  },
  async renderTransitionAt({ fromIdx, toIdx, u, timeSec, hideCard = true, settlePasses = 2 }) {
    manualStepping = true;
    const from = SLIDES[clamp(fromIdx, 0, SLIDES.length - 1)];
    const to = SLIDES[clamp(toIdx, 0, SLIDES.length - 1)];
    currentSlideIdx = toIdx;
    await mountScene(to.scene);
    sceneVeil.style.opacity = "0";
    document.body.classList.remove("ui-hidden");
    renderSlideContent(u > 0.65 ? to : from);
    const hideNow = hideCard && u > 0.08 && u < 0.88;
    slideOverlay.classList.toggle("transitioning", hideNow);
    slideOverlay.style.opacity = hideNow ? "0" : "";
    const cont = to.transitionFromPrev ?? from.transitionFromPrev ?? { kind: "glide" as const, durationSec: 1.5 };
    const tr: ActiveTransition = {
      from,
      to,
      kind: cont.kind,
      reverse: toIdx < fromIdx,
      startClock: 0,
      durationSec: cont.durationSec,
    };
    deckClock = timeSec ?? u * cont.durationSec + 1.0;
    uniforms.uTime.value = deckClock;
    evalContinuousTransition(tr, u);
    updateTelemetry();
    for (let i = 0; i < settlePasses; i++) {
      pipeline.render();
      await new Promise((r) => requestAnimationFrame(r));
    }
  },
  resumeLive() {
    manualStepping = false;
    lastFrameMs = performance.now();
  },
  getState() {
    return {
      slideIdx: currentSlideIdx,
      slideId: SLIDES[currentSlideIdx].id,
      sceneId: activeSceneId,
      splatCount: currentSplatCount,
      shDegree: currentShDegree,
    };
  },
};

window.splatDeck = api;

// ── Boot ───────────────────────────────────────────────────────────────────

buildOverviewGrid();
const hashMatch = /^#slide-(\d+)$/.exec(window.location.hash);
const initialIdx = hashMatch ? clamp(Number(hashMatch[1]) - 1, 0, SLIDES.length - 1) : 0;
await goToSlide(initialIdx, true);
api.ready = true;
prefetchLightScenes();
requestAnimationFrame(tick);

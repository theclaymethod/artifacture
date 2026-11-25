import * as THREE from "three";
import { RenderPipeline } from "three/webgpu";
import { agxToneMapping } from "three/tsl";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import {
  CameraControls,
  GpuArrays,
  GpuShPalette,
  GpuSplatMath,
  Sh,
  SplatCollection,
  SplatGenerator,
  SplatRenderer,
  Splats,
  TSL,
  createRenderer,
  getGpuCaps,
  loadSplatFile,
  type ArrayData,
  type ShTarget,
  type SplatLayout,
  type SplatModifier,
  type SplatNode,
  type TslNode,
} from "@sparkjsdev/radix";
import { MpmPlayback } from "./MpmPlayback.js";

const {
  abs,
  clamp,
  cos,
  cross,
  dot,
  exp,
  float,
  floor,
  fract,
  length,
  max,
  min,
  mix,
  normalize,
  pass,
  pow,
  select,
  sin,
  smoothstep,
  sqrt,
  uniform,
  vec2,
  vec3,
  vec4,
} = TSL;

type FxMode =
  | "shockwave"
  | "dissolve"
  | "neon"
  | "geowave"
  | "vortex"
  | "mpm"
  | "voxel"
  | "singularity"
  | "tokyo";

type SceneId =
  | "starship_bay"
  | "stump"
  | "buddha"
  | "jade_king_mpm"
  | "tokyo_alley"
  | "train"
  | "bonsai_mpm"
  | "ceramic"
  | "cozy"
  | "playroom"
  | "drjohnson"
  | "grace"
  | "sutro"
  | "garden"
  | "bicycle"
  | "greyscale"
  | "snow"
  | "ruin_archway"
  | "singularity_clearing"
  | "forest_clearing";

interface SceneMeta {
  label: string;
  sourceTag: string;
  url: string;
  placement: "catalog" | "normalized" | "mpm";
  layout: SplatLayout;
  sh: ShTarget;
  preBlur: boolean;
  sky: boolean;
  up?: [number, number, number];
  flipX: boolean;
  targetSpan: number;
  fxCenter: [number, number, number];
  fxScale: number;
  floorY: number;
  viewPos: [number, number, number];
  viewTarget: [number, number, number];
  fov: number;
  yawOffset: number;
  yawAmp: number;
}

const SCENES: Record<SceneId, SceneMeta> = {
  forest_clearing: {
    label: "Dimensional Forest Wormhole",
    sourceTag: "2.36M Dual-World 3DGS · Forest Clearing × Alien Dimension",
    url: "./assets/forest-clearing.spz",
    placement: "catalog",
    layout: "extSplats",
    sh: false,
    preBlur: false,
    sky: false,
    flipX: true,
    targetSpan: 12.0,
    fxCenter: [0.14, 1.05, -6.2],
    fxScale: 1.0,
    floorY: -0.46,
    viewPos: [0.0, 0.0, 0.0],
    viewTarget: [0.10, 0.25, -6.2],
    fov: 64.4,
    yawOffset: 0.0,
    yawAmp: 0.05,
  },
  singularity_clearing: {
    label: "Singularity Clearing",
    sourceTag: "1.18M Apple SHARP 3DGS · Forest Singularity Clearing (forest-singularity-clearing.spz)",
    url: "./assets/forest-singularity-clearing.spz",
    placement: "catalog",
    layout: "extSplats",
    sh: false,
    preBlur: false,
    sky: false,
    flipX: true,
    targetSpan: 12.0,
    fxCenter: [0.0, 0.8, -8.65],
    fxScale: 2.2,
    floorY: -1.8,
    viewPos: [0.0, 0.0, 0.0],
    viewTarget: [0.0, 0.0, -8.65],
    fov: 64.3,
    yawOffset: 0.0,
    yawAmp: 0.06,
  },
  ruin_archway: {
    label: "Forest Ruin Archway",
    sourceTag: "1.18M World Labs Forest Ruin Archway (ruin-archway.spz)",
    url: "./assets/ruin-archway.spz",
    placement: "catalog",
    layout: "extSplats",
    sh: false,
    preBlur: false,
    sky: true,
    flipX: false,
    targetSpan: 4.5,
    fxCenter: [-0.02, 0.29, -0.92],
    fxScale: 0.42,
    floorY: -0.35,
    viewPos: [0.02, 0.23, 0.34],
    viewTarget: [-0.02, 0.15, -1.05],
    fov: 48,
    yawOffset: 0.0,
    yawAmp: 0.08,
  },
  starship_bay: {
    label: "Starship Hangar Bay",
    sourceTag: "World Labs Sci-Fi Starship Hangar (starship-bay.spz)",
    url: "./assets/starship-bay.spz",
    placement: "catalog",
    layout: "extSplats",
    sh: false,
    preBlur: false,
    sky: false,
    flipX: false,
    targetSpan: 12.0,
    fxCenter: [2.2, 6.2, 16.5],
    fxScale: 4.0,
    floorY: 5.0,
    viewPos: [0.35, 6.45, 7.6],
    viewTarget: [2.8, 6.85, 19.5],
    fov: 66,
    yawOffset: 0.0,
    yawAmp: 0.12,
  },
  stump: {
    label: "Forest Stump (1.2M SH3)",
    sourceTag: "1.21M SH3 Mip-NeRF 360 Woodland (stump.spz)",
    url: "./assets/stump.spz",
    placement: "catalog",
    layout: "extSplats",
    sh: "ext",
    preBlur: true,
    sky: false,
    up: [0.016, 0.6997, 0.7143],
    flipX: true,
    targetSpan: 3.6,
    fxCenter: [0.05, -0.48, -0.02],
    fxScale: 0.72,
    floorY: -0.68,
    viewPos: [-0.62, 0.26, 0.88],
    viewTarget: [0.05, -0.45, -0.02],
    fov: 62,
    yawOffset: 0.12,
    yawAmp: 0.16,
  },
  buddha: {
    label: "Stone Buddha",
    sourceTag: "262k Budget3D Carved Stone Buddha (buddha.spz)",
    url: "./assets/buddha.spz",
    placement: "normalized",
    layout: "extSplats",
    sh: false,
    preBlur: false,
    sky: false,
    flipX: false,
    targetSpan: 2.25,
    fxCenter: [0.0, 0.0, 0.0],
    fxScale: 1.0,
    floorY: -1.15,
    viewPos: [3.85, 0.14, 0.55],
    viewTarget: [0.0, 0.02, 0.0],
    fov: 50,
    yawOffset: 0.1,
    yawAmp: 0.16,
  },
  jade_king_mpm: {
    label: "Jade King (CUDA MPM)",
    sourceTag: "NVIDIA Warp 1.19 MLS-MPM Fracture (jade-king-mpm)",
    url: "./assets/jade-king-mpm",
    placement: "mpm",
    layout: "extSplats",
    sh: false,
    preBlur: false,
    sky: false,
    flipX: true,
    targetSpan: 2.0,
    fxCenter: [0.0, 0.0, 0.0],
    fxScale: 1.0,
    floorY: -0.5,
    viewPos: [0.5, 0.3, 2.2],
    viewTarget: [0.0, 0.0, 0.0],
    fov: 50,
    yawOffset: 0.0,
    yawAmp: 0.12,
  },
  tokyo_alley: {
    label: "Tokyo Neon Alley",
    sourceTag: "500k Rain-Slicked Cyberpunk Alleyway (tokyo-alley.spz)",
    url: "./assets/tokyo-alley.spz",
    placement: "catalog",
    layout: "extSplats",
    sh: false,
    preBlur: false,
    sky: false,
    flipX: true,
    targetSpan: 6.0,
    fxCenter: [0.0, 0.2, -3.5],
    fxScale: 3.0,
    floorY: -0.62,
    viewPos: [0.02, 0.06, -0.55],
    viewTarget: [0.0, 0.04, -5.5],
    fov: 68,
    yawOffset: 0.0,
    yawAmp: 0.08,
  },
  train: {
    label: "Steam Train (SH3)",
    sourceTag: "317k SH3 Tanks & Temples Locomotive (train.spz)",
    url: "./assets/train.spz",
    placement: "catalog",
    layout: "extSplats",
    sh: "ext",
    preBlur: false,
    sky: false,
    up: [-0.0282, 0.9966, -0.077],
    flipX: true,
    targetSpan: 3.1,
    fxCenter: [0.02, 0.0, -0.08],
    fxScale: 0.62,
    floorY: -0.16,
    viewPos: [-0.62, 0.02, 0.78],
    viewTarget: [0.02, 0.0, -0.08],
    fov: 58,
    yawOffset: -0.2,
    yawAmp: 0.14,
  },
  bonsai_mpm: {
    label: "Bonsai (CUDA Warp MPM)",
    sourceTag: "NVIDIA Warp 1.19 CUDA MLS-MPM Fracture (bonsai-mpm)",
    url: "./assets/bonsai-mpm",
    placement: "mpm",
    layout: "extSplats",
    sh: false,
    preBlur: false,
    sky: false,
    up: [0.4723, 0.8406, 0.2652],
    flipX: true,
    targetSpan: 2.0,
    fxCenter: [0.0, 0.0, 0.0],
    fxScale: 1.0,
    floorY: -0.35,
    viewPos: [-0.75, 0.55, 0.75],
    viewTarget: [0.0, 0.05, -0.35],
    fov: 58,
    yawOffset: 0.0,
    yawAmp: 0.12,
  },
  ceramic: {
    label: "Ceramic Cave",
    sourceTag: "Radix Packed Splat Cave Scan (ceramic.rdx)",
    url: "./assets/ceramic.rdx",
    placement: "catalog",
    layout: "packedSplats",
    sh: false,
    preBlur: false,
    sky: false,
    flipX: true,
    targetSpan: 4.5,
    fxCenter: [0.0, 0.15, 0.05],
    fxScale: 1.55,
    floorY: -1.4,
    viewPos: [-0.23, 1.83, -4.12],
    viewTarget: [0.0, 0.15, 0.0],
    fov: 58,
    yawOffset: 0.0,
    yawAmp: 0.1,
  },
  cozy: {
    label: "Cozy Cottage",
    sourceTag: "World Labs LoD Cottage (cozy-cottage.spz)",
    url: "./assets/cozy-cottage.spz",
    placement: "catalog",
    layout: "packedSplats",
    sh: "packed",
    preBlur: false,
    sky: false,
    flipX: true,
    targetSpan: 4.5,
    fxCenter: [0.0, -0.6, 2.2],
    fxScale: 2.5,
    floorY: -2.2,
    viewPos: [0.15, -0.45, -0.4],
    viewTarget: [-0.25, -0.65, 2.6],
    fov: 66,
    yawOffset: 0.0,
    yawAmp: 0.1,
  },
  playroom: {
    label: "Playroom (SH3)",
    sourceTag: "608k SH3 Deep Blending Interior (playroom.spz)",
    url: "./assets/playroom.spz",
    placement: "normalized",
    layout: "extSplats",
    sh: "ext",
    preBlur: false,
    sky: false,
    flipX: true,
    targetSpan: 3.1,
    fxCenter: [0.0, 0.0, 0.0],
    fxScale: 1.0,
    floorY: -0.75,
    viewPos: [0.45, 0.25, 2.15],
    viewTarget: [0.0, 0.0, 0.0],
    fov: 64,
    yawOffset: 0.15,
    yawAmp: 0.14,
  },
  drjohnson: {
    label: "Victorian Hall (SH3)",
    sourceTag: "914k SH3 Deep Blending Gallery (drjohnson.spz)",
    url: "./assets/drjohnson.spz",
    placement: "catalog",
    layout: "extSplats",
    sh: "ext",
    preBlur: false,
    sky: false,
    up: [0.8623, 0.037, 0.5051],
    flipX: true,
    targetSpan: 3.2,
    fxCenter: [-0.04, -0.05, -0.22],
    fxScale: 0.25,
    floorY: -0.32,
    viewPos: [-0.36, 0.02, 0.65],
    viewTarget: [-0.04, -0.05, -0.18],
    fov: 60,
    yawOffset: 0.12,
    yawAmp: 0.14,
  },
  grace: {
    label: "Grace Cathedral (10M SH3)",
    sourceTag: "10M SH3 Gothic Nave Scan (grace-interior-10m.rdx)",
    url: "./assets/grace-interior-10m.rdx",
    placement: "catalog",
    layout: "packedSplats",
    sh: "packed",
    preBlur: false,
    sky: false,
    flipX: true,
    targetSpan: 10,
    fxCenter: [-1.5, 9.5, -3.0],
    fxScale: 24.0,
    floorY: 4.6,
    viewPos: [-14.0, 7.2, -3.0],
    viewTarget: [-2.0, 9.2, -3.0],
    fov: 68,
    yawOffset: 0,
    yawAmp: 0.08,
  },
  sutro: {
    label: "Sutro Tower (2M SH3)",
    sourceTag: "2M SH3 SF Landmark Scan (sutro-2m.rdx)",
    url: "./assets/sutro-2m.rdx",
    placement: "catalog",
    layout: "extSplats",
    sh: "ext",
    preBlur: false,
    sky: true,
    flipX: true,
    targetSpan: 4,
    fxCenter: [0.0, 1.9, 0.15],
    fxScale: 1.6,
    floorY: 0.25,
    viewPos: [0.0, 1.45, -1.25],
    viewTarget: [0.0, 1.75, 0.0],
    fov: 64,
    yawOffset: 0,
    yawAmp: 0.14,
  },
  garden: {
    label: "Mip-NeRF Garden (5.8M SH3)",
    sourceTag: "5.8M SH3 Mip-NeRF 360 Garden (garden.rdx)",
    url: "./assets/garden.rdx",
    placement: "catalog",
    layout: "packedSplats",
    sh: "packed",
    preBlur: true,
    sky: true,
    up: [-0.01, 0.877, 0.48],
    flipX: true,
    targetSpan: 4,
    fxCenter: [0.15, -1.5, -0.15],
    fxScale: 2.2,
    floorY: -2.4,
    viewPos: [-3.15, 0.43, 0.36],
    viewTarget: [1.5, -2.81, -0.36],
    fov: 62,
    yawOffset: 0,
    yawAmp: 0.12,
  },
  bicycle: {
    label: "Bicycle Bench (SH3)",
    sourceTag: "SH3 Mip-NeRF 360 Bicycle (bicycle.rdx)",
    url: "./assets/bicycle.rdx",
    placement: "catalog",
    layout: "packedSplats",
    sh: "packed",
    preBlur: true,
    sky: true,
    up: [-0.015, 0.97, 0.244],
    flipX: true,
    targetSpan: 4,
    fxCenter: [-0.15, -0.25, 0.0],
    fxScale: 1.9,
    floorY: -1.35,
    viewPos: [-3.5, 0.9, 0.0],
    viewTarget: [0.0, -0.65, 0.0],
    fov: 64,
    yawOffset: 0,
    yawAmp: 0.12,
  },
  greyscale: {
    label: "Greyscale Room",
    sourceTag: "High-Res Marble Interior (greyscale-room.spz)",
    url: "./assets/greyscale-room.spz",
    placement: "catalog",
    layout: "extSplats",
    sh: "ext",
    preBlur: false,
    sky: false,
    flipX: true,
    targetSpan: 3.1,
    fxCenter: [0.0, 0.15, -2.2],
    fxScale: 2.2,
    floorY: -1.1,
    viewPos: [0.0, 0.25, -0.25],
    viewTarget: [0.0, 0.12, -2.6],
    fov: 66,
    yawOffset: 0.0,
    yawAmp: 0.14,
  },
  snow: {
    label: "Snow Street",
    sourceTag: "Photorealistic Street Scan (snow-street.spz)",
    url: "./assets/snow-street.spz",
    placement: "normalized",
    layout: "extSplats",
    sh: "ext",
    preBlur: false,
    sky: false,
    flipX: true,
    targetSpan: 2.6,
    fxCenter: [0, 0, 0],
    fxScale: 1.0,
    floorY: -0.92,
    viewPos: [0.1, 0.34, 2.75],
    viewTarget: [0, 0.04, 0],
    fov: 64,
    yawOffset: 0.04,
    yawAmp: 0.18,
  },
};

interface ModeMeta {
  title: string;
  subtitle: string;
  weights: [number, number, number, number, number, number, number, number, number];
  roll: number;
}

const MODES: Record<FxMode, ModeMeta> = {
  shockwave: {
    title: "1 · Monochrome LiDAR Shockwave",
    subtitle: "Object-aligned radial wavefront & crisp isotropic silver point cloud on WebGPU.",
    weights: [1, 0, 0, 0, 0, 0, 0, 0, 0],
    roll: 0,
  },
  dissolve: {
    title: "2 · Volumetric Smoke & Ash Dissolution",
    subtitle: "Billowing curl-noise charcoal/silver smoke plumes & fine ash shearing intact architecture.",
    weights: [0, 1, 0, 0, 0, 0, 0, 0, 0],
    roll: 0.03,
  },
  neon: {
    title: "3 · HDR Cyan & Vermilion Neon Drift",
    subtitle: "Dutch-angle camera roll with traveling cyan-to-vermilion plasma waves and embers.",
    weights: [0, 0, 1, 0, 0, 0, 0, 0, 0],
    roll: -0.16,
  },
  geowave: {
    title: "4 · Concentric Wave & Faceted Shatter",
    subtitle: "Quantized cylindrical rings and 3D Voronoi cell shards twisting smoothly around center.",
    weights: [0, 0, 0, 1, 0, 0, 0, 0, 0],
    roll: 0.05,
  },
  vortex: {
    title: "5 · Vortex Tornado Funnel",
    subtitle: "Differential inverse-radius cyclone funnel lifting, stretching & spinning Gaussians upward.",
    weights: [0, 0, 0, 0, 1, 0, 0, 0, 0],
    roll: -0.05,
  },
  mpm: {
    title: "6 · CUDA Warp MLS-MPM Shatter",
    subtitle: "Real NVIDIA Warp continuum-mechanics plasticity & collision fracture over 3DGS splats.",
    weights: [0, 0, 0, 0, 0, 1, 0, 0, 0],
    roll: 0,
  },
  voxel: {
    title: "7 · 3D Holographic Voxel Laser Wipe",
    subtitle: "Real-time cubic lattice quantization with uniform micro-voxels & upward laser scan plane.",
    weights: [0, 0, 0, 0, 0, 0, 1, 0, 0],
    roll: 0,
  },
  singularity: {
    title: "8 · Orbiting Black-Hole Singularity",
    subtitle: "Gravitational well swallowing & spaghettifying splats around a blazing Einstein photon ring.",
    weights: [0, 0, 0, 0, 0, 0, 0, 1, 0],
    roll: 0.08,
  },
  tokyo: {
    title: "9 · Tokyo Neon Dream",
    subtitle: "Dutch-angle glide with crisp stippled neon pinpoints, wet reflections & midnight-teal mist.",
    weights: [0, 0, 0, 0, 0, 0, 0, 0, 1],
    roll: 0.24,
  },
};

export interface RenderFrameOptions {
  time: number;
  fxAge: number;
  fxMix: number;
  twist?: number;
  mpmTimeSec?: number;
  mode: FxMode;
  camPos: [number, number, number];
  camTarget: [number, number, number];
  camRoll?: number;
  fov?: number;
  skyFade?: number;
  fxCenter?: [number, number, number];
  fxScale?: number;
  floorY?: number;
  settlePasses?: number;
  caption?: { kicker?: string; title?: string; sub?: string; opacity?: number };
  titleCard?: { kicker?: string; title?: string; sub?: string; opacity?: number };
}

declare global {
  interface Window {
    example: { ready: boolean; error: string | undefined };
    artifactureFx?: {
      backend: string;
      splatCount: number;
      shDegree: number;
      layout: SplatLayout;
      sceneId: SceneId;
      mode: FxMode;
      fxCenter: [number, number, number];
      fxScale: number;
      floorY: number;
      mpmBoundsMin?: [number, number, number];
      mpmBoundsMax?: [number, number, number];
      mpmFloorY?: number;
      mpmDurationSec?: number;
      setMode: (m: FxMode) => void;
      setScene: (s: SceneId, overrides?: { layout?: SplatLayout; sh?: ShTarget }) => Promise<void>;
      renderFrame: (opts: RenderFrameOptions) => Promise<void>;
    };
  }
}

window.example = { ready: false, error: undefined };

const params = new URLSearchParams(location.search);
const isCinema = params.get("cinema") === "1";
if (isCinema) {
  document.body.classList.add("cinema");
}

const kickerEl = document.getElementById("fx-kicker") as HTMLElement;
const titleEl = document.getElementById("fx-title") as HTMLElement;
const subEl = document.getElementById("fx-sub") as HTMLElement;
const statusEl = document.getElementById("fx-status") as HTMLElement;
const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".fx-btn"));
const sceneButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".scene-btn"));

const cinemaCaptionEl = document.getElementById("cinema-caption") as HTMLElement;
const cinemaKickerEl = document.getElementById("cinema-kicker") as HTMLElement;
const cinemaTitleEl = document.getElementById("cinema-title") as HTMLElement;
const cinemaSubEl = document.getElementById("cinema-sub") as HTMLElement;
const cinemaTitleCardEl = document.getElementById("cinema-titlecard") as HTMLElement;
const cardKickerEl = document.getElementById("card-kicker") as HTMLElement;
const cardTitleEl = document.getElementById("card-title") as HTMLElement;
const cardSubEl = document.getElementById("card-sub") as HTMLElement;

const scene = new THREE.Scene();
const BLACK_BG = new THREE.Color(0x000000);
scene.background = BLACK_BG;

let skyTexCache: THREE.CanvasTexture | undefined;
function getSkyTexture(): THREE.CanvasTexture {
  if (!skyTexCache) {
    const canvas = Object.assign(document.createElement("canvas"), { width: 4, height: 512 });
    const g = canvas.getContext("2d")!;
    const gradient = g.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, "#245ca0");
    gradient.addColorStop(0.32, "#639cd6");
    gradient.addColorStop(0.49, "#d4e6f5");
    gradient.addColorStop(0.52, "#c2cad2");
    gradient.addColorStop(1, "#434950");
    g.fillStyle = gradient;
    g.fillRect(0, 0, 4, 512);
    skyTexCache = new THREE.CanvasTexture(canvas);
    skyTexCache.mapping = THREE.EquirectangularReflectionMapping;
    skyTexCache.colorSpace = THREE.SRGBColorSpace;
  }
  return skyTexCache;
}

let mistySkyTexCache: THREE.CanvasTexture | undefined;
function getMistyForestSkyTexture(): THREE.CanvasTexture {
  if (!mistySkyTexCache) {
    const canvas = Object.assign(document.createElement("canvas"), { width: 4, height: 512 });
    const g = canvas.getContext("2d")!;
    const gradient = g.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, "#7f9288");
    gradient.addColorStop(0.28, "#b7c6bd");
    gradient.addColorStop(0.47, "#dce5df");
    gradient.addColorStop(0.55, "#425147");
    gradient.addColorStop(1, "#101612");
    g.fillStyle = gradient;
    g.fillRect(0, 0, 4, 512);
    mistySkyTexCache = new THREE.CanvasTexture(canvas);
    mistySkyTexCache.mapping = THREE.EquirectangularReflectionMapping;
    mistySkyTexCache.colorSpace = THREE.SRGBColorSpace;
  }
  return mistySkyTexCache;
}

const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.02, 500);
camera.position.set(0.65, 0.45, 2.35);

const renderer = await createRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
document.body.appendChild(renderer.domElement);

const pipeline = new RenderPipeline(renderer);
const scenePass = pass(scene, camera);
const sceneColor = scenePass.getTextureNode("output");
const glow = bloom(sceneColor, 0.0, 0.48, 0.74);
pipeline.outputNode = sceneColor.add(glow);

function updateBloomForMode(mode: FxMode, fxMixVal: number) {
  const m = Math.max(0, Math.min(1, fxMixVal));
  if (mode === "tokyo") {
    glow.strength.value = 0.26 * m;
    glow.radius.value = 0.38;
    glow.threshold.value = 0.86;
  } else if (mode === "shockwave") {
    glow.strength.value = 0.10 * m;
    glow.radius.value = 0.30;
    glow.threshold.value = 0.94;
  } else if (mode === "voxel") {
    glow.strength.value = 0.16 * m;
    glow.radius.value = 0.40;
    glow.threshold.value = 0.88;
  } else if (mode === "singularity") {
    glow.strength.value = (activeSceneId === "forest_clearing" ? 0.14 : 0.16) * m;
    glow.radius.value = activeSceneId === "forest_clearing" ? 0.28 : 0.24;
    glow.threshold.value = activeSceneId === "forest_clearing" ? 0.90 : 0.82;
  } else {
    glow.strength.value = 0.0;
  }
}

const caps = getGpuCaps(renderer);
const backendName = caps.backend;

const controls = new CameraControls({
  canvas: renderer.domElement,
  object: camera,
  settings: { mode: "orbit" },
});
controls.lookAt(new THREE.Vector3(0, 0, 0));

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const uTime = uniform(0);
const uFxAge = uniform(0);
const uFxMix = uniform(isCinema ? 0 : 1);
const uFxCenter = uniform(new THREE.Vector3(0, 0, 0));
const uFxScale = uniform(1);
const uFloorY = uniform(-0.92);
const uOuterFade = uniform(1);
const uCamPos = uniform(new THREE.Vector3(0, 0, 2));
const uTwist = uniform(0);
const uCinema = uniform(isCinema ? 1 : 0);
const uClearingLive = uniform(0);
const uForestSing = uniform(0);

const uShock = uniform(isCinema ? 0 : 1);
const uDissolve = uniform(0);
const uNeon = uniform(0);
const uGeo = uniform(0);
const uVortex = uniform(0);
const uMpmShader = uniform(0);
const uVoxel = uniform(0);
const uSingularity = uniform(0);
const uTokyo = uniform(0);

const hash31 = (p: TslNode): TslNode => fract(sin(dot(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453));

const hash33 = (p: TslNode): TslNode =>
  vec3(
    fract(sin(dot(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453)),
    fract(sin(dot(p, vec3(269.5, 183.3, 246.1))).mul(43758.5453)),
    fract(sin(dot(p, vec3(113.5, 271.9, 124.6))).mul(43758.5453)),
  );

const noise3 = (p: TslNode): TslNode => {
  const i = floor(p).toVar();
  const f0 = fract(p);
  const u = f0.mul(f0).mul(vec3(3).sub(f0.mul(2))).toVar();
  const n = (dx: number, dy: number, dz: number) => hash31(i.add(vec3(dx, dy, dz)));
  const x00 = mix(n(0, 0, 0), n(1, 0, 0), u.x);
  const x10 = mix(n(0, 1, 0), n(1, 1, 0), u.x);
  const x01 = mix(n(0, 0, 1), n(1, 0, 1), u.x);
  const x11 = mix(n(0, 1, 1), n(1, 1, 1), u.x);
  return mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z);
};

const pot3 = (p: TslNode): TslNode =>
  vec3(
    noise3(p),
    noise3(p.add(vec3(31.4, 17.8, 53.2))),
    noise3(p.add(vec3(73.1, 41.6, 19.3))),
  );

const curl3 = (p: TslNode): TslNode => {
  const eps = 0.2;
  const c0 = pot3(p).toVar();
  const dx = pot3(p.add(vec3(eps, 0, 0))).sub(c0).div(eps);
  const dy = pot3(p.add(vec3(0, eps, 0))).sub(c0).div(eps);
  const dz = pot3(p.add(vec3(0, 0, eps))).sub(c0).div(eps);
  return vec3(dy.z.sub(dz.y), dz.x.sub(dx.z), dx.y.sub(dy.x));
};

const rotXZ = (v: TslNode, a: TslNode): TslNode => {
  const c = cos(a).toVar();
  const s = sin(a).toVar();
  return vec3(v.x.mul(c).sub(v.z.mul(s)), v.y, v.x.mul(s).add(v.z.mul(c)));
};

const rotXY = (v: TslNode, a: TslNode): TslNode => {
  const c = cos(a).toVar();
  const s = sin(a).toVar();
  return vec3(v.x.mul(c).sub(v.y.mul(s)), v.x.mul(s).add(v.y.mul(c)), v.z);
};

const fbm3 = (p: TslNode): TslNode =>
  noise3(p).mul(0.55).add(noise3(p.mul(2.15)).mul(0.3)).add(noise3(p.mul(4.55)).mul(0.15));

const basisToQuat = (X: TslNode, Y: TslNode, Z: TslNode): TslNode => {
  const trace = X.x.add(Y.y).add(Z.z);
  const s0 = sqrt(max(float(1).add(trace), 1e-6)).mul(2);
  const q0 = vec4(Y.z.sub(Z.y).div(s0), Z.x.sub(X.z).div(s0), X.y.sub(Y.x).div(s0), s0.mul(0.25));
  const s1 = sqrt(max(float(1).add(X.x).sub(Y.y).sub(Z.z), 1e-6)).mul(2);
  const q1 = vec4(s1.mul(0.25), Y.x.add(X.y).div(s1), Z.x.add(X.z).div(s1), Y.z.sub(Z.y).div(s1));
  const s2 = sqrt(max(float(1).add(Y.y).sub(X.x).sub(Z.z), 1e-6)).mul(2);
  const q2 = vec4(Y.x.add(X.y).div(s2), s2.mul(0.25), Z.y.add(Y.z).div(s2), Z.x.sub(X.z).div(s2));
  const s3 = sqrt(max(float(1).add(Z.z).sub(X.x).sub(Y.y), 1e-6)).mul(2);
  const q3 = vec4(Z.x.add(X.z).div(s3), Z.y.add(Y.z).div(s3), s3.mul(0.25), X.y.sub(Y.x).div(s3));
  const branchYZ = select(Y.y.greaterThan(Z.z), q2, q3);
  const branchXYZ = select(X.x.greaterThan(Y.y).and(X.x.greaterThan(Z.z)), q1, branchYZ);
  return normalize(select(trace.greaterThan(0), q0, branchXYZ));
};

const fxModifier: SplatModifier = (splat: SplatNode) => {
  const out = splat.toVar();
  const t = uTime;
  const age = uFxAge;
  const basePos = splat.get("center").toVar();
  const baseScales = splat.get("scales").toVar();
  const baseRgb = splat.get("rgb").toVar();
  const baseOp = splat.get("opacity").toVar();
  const baseQuat = splat.get("quaternion").toVar();

  const pLocal = basePos.sub(uFxCenter).div(uFxScale).toVar();
  const lum = dot(baseRgb, vec3(0.299, 0.587, 0.114)).toVar();
  const seed = hash31(pLocal.mul(13.7).add(vec3(1.9, 4.3, 7.1))).toVar();
  const seedB = fract(seed.mul(37.43)).toVar();

  const radial = length(vec3(pLocal.x, pLocal.y.mul(0.82), pLocal.z)).toVar();
  const outerFade = mix(float(1), float(1).sub(smoothstep(2.9, 5.4, radial)), uOuterFade);

  const posL = pLocal.toVar();
  const rgb = baseRgb.toVar();
  const scales = baseScales.toVar();
  const opacity = baseOp.mul(outerFade).toVar();
  const quat = baseQuat.toVar();

  const wShock = uShock.mul(uFxMix).toVar();
  const wDissolve = uDissolve.mul(uFxMix).toVar();
  const wNeon = uNeon.mul(uFxMix).toVar();
  const wGeo = uGeo.mul(uFxMix).toVar();
  const wVortex = uVortex.mul(uFxMix).toVar();
  const wMpmFallback = uMpmShader.mul(uFxMix).toVar();
  const wVoxel = uVoxel.mul(uFxMix).toVar();
  const wSingularity = uSingularity.mul(uFxMix).toVar();
  const wTokyo = uTokyo.mul(uFxMix).toVar();

  const rGround = length(vec2(pLocal.x, pLocal.z)).toVar();
  const eNoise = noise3(pLocal.mul(1.25).add(vec3(0, t.mul(-0.18), t.mul(0.1)))).sub(0.5).mul(1.2).toVar();
  const cFlow = curl3(pLocal.mul(0.95).add(vec3(t.mul(0.14), t.mul(-0.2), 0))).toVar();

  const pointMix = clamp(wNeon.mul(0.82), 0, 1).toVar();
  const isoRad = clamp(length(baseScales).mul(0.24), uFxScale.mul(0.0024), uFxScale.mul(0.011)).toVar();
  scales.assign(mix(scales, vec3(isoRad), pointMix));

  // ── 1. Stark Monochrome Particly Black & White LiDAR Sphere (Out & Back) ────
  const sphR = length(pLocal).toVar();
  const shockP = select(uCinema.greaterThan(0.5), clamp(age.div(4.15), 0.0, 1.0), fract(age.div(4.4))).toVar();
  const waveEnv = pow(max(sin(shockP.mul(3.14159265)), 0.0), 0.66).toVar();
  const rWave = float(0.04).add(waveEnv.mul(2.15)).toVar();
  const sphereLive = smoothstep(0.0, 0.05, shockP).mul(float(1.0).sub(smoothstep(0.94, 1.0, shockP))).toVar();
  const wShockEff = wShock.mul(sphereLive).toVar();

  const sphDist = abs(sphR.sub(rWave)).toVar();
  const ringGlow = exp(sphDist.mul(sphDist).mul(-420.0)).toVar();
  const insideSphere = float(1.0).sub(smoothstep(rWave.sub(0.045), rWave.add(0.028), sphR)).toVar();
  // Pure achromatic white concentric LiDAR laser scan contours (ZERO blue/cyan tint!)
  const scanContours = pow(float(0.5).add(sin(sphR.mul(34.0).sub(age.mul(6.2))).mul(0.5)), 20.0)
    .mul(insideSphere)
    .mul(0.48)
    .toVar();
  // Stark monochrome B&W point-cloud intensity: crisp bright white & silver pinpoint particles in black space
  const bwContrast = pow(clamp(lum.mul(1.18), 0.0, 1.0), 1.12).toVar();
  const bwSpark = smoothstep(0.60, 0.96, seedB).mul(0.34);
  const monoVal = clamp(
    float(0.08).add(bwContrast.mul(1.02)).add(bwSpark).add(scanContours.mul(0.95)),
    0.0,
    1.32,
  ).toVar();
  const monoBase = vec3(monoVal, monoVal, monoVal);
  // Razor-crisp pure-white spherical shockwave shell front (strictly achromatic, no bloom blowout!)
  const shellWhite = vec3(1.15, 1.15, 1.15).mul(ringGlow);
  const lidarCol = clamp(mix(baseRgb, monoBase, insideSphere).add(shellWhite), vec3(0), vec3(1.45));
  rgb.assign(mix(rgb, lidarCol, wShockEff));
  // Outward shell pulse + subtle floating particle jitter inside the B&W point cloud
  const sphDir = pLocal.div(max(sphR, 0.001));
  posL.assign(
    posL
      .add(sphDir.mul(ringGlow.mul(0.016).mul(wShockEff)))
      .add(cFlow.mul(0.007).mul(insideSphere).mul(wShockEff)),
  );
  const insideOrShell = clamp(insideSphere.add(ringGlow), 0.0, 1.0);
  // Shrink splats into razor-crisp spherical LiDAR pinpoint dots inside the sphere
  const dotRefScale = min(uFxScale, float(12.0));
  const lidarDotRad = clamp(length(baseScales).mul(0.064), dotRefScale.mul(0.00052), dotRefScale.mul(0.0020)).toVar();
  scales.assign(
    mix(scales, vec3(lidarDotRad).mul(float(1.0).add(ringGlow.mul(0.32))), wShockEff.mul(insideOrShell).mul(0.988)),
  );
  // Stochastic point-cloud decimation inside the sphere so dense scans dissolve into airy floating B&W particles over pitch-black void
  const keepThresh = mix(float(0.80), float(0.38), smoothstep(0.12, 0.64, lum));
  const keepMask = smoothstep(keepThresh.sub(0.07), keepThresh.add(0.05), seed);
  const particleKeep = clamp(keepMask.add(ringGlow.mul(0.75)).add(scanContours.mul(0.75)), 0.0, 1.0);
  opacity.assign(
    opacity.mul(
      mix(
        float(1.0),
        mix(float(1.0), particleKeep, insideSphere),
        wShockEff,
      ),
    ),
  );

  // ── 2. Thick Volumetric Smoke & Ash Dissolution (Complete Base-to-Wisp Burn)
  const axisCoord = dot(pLocal.sub(vec3(0, 0.04, 0)), normalize(vec3(0.22, 0.76, -0.58)));
  const frontThresh = float(1.25)
    .sub(pow(max(wDissolve, 0.0001), 1.05).mul(3.0))
    .add(sin(age.mul(0.35)).mul(0.05))
    .toVar();
  const erode = smoothstep(frontThresh.sub(0.18), frontThresh.add(0.46), axisCoord.add(eNoise.mul(0.95)))
    .mul(wDissolve)
    .toVar();
  const cSlow = curl3(pLocal.mul(0.95).add(vec3(age.mul(0.07), age.mul(-0.11), 0))).toVar();
  const cDetail = curl3(pLocal.mul(2.15).add(vec3(0, age.mul(-0.16), age.mul(0.09)))).toVar();
  const radialPush = vec3(pLocal.x, float(0), pLocal.z).mul(0.32);
  const advect = cSlow
    .mul(1.25)
    .add(cDetail.mul(0.52))
    .add(radialPush)
    .add(vec3(0.06, float(0.72).add(age.mul(0.10)), 0.04).mul(seed.mul(0.6).add(0.4)))
    .mul(erode.mul(erode))
    .mul(0.78)
    .toVar();
  // ~78% soft billowing volumetric smoke plumes + ~22% crisp shattered stone/ash flecks
  const isSmoke = smoothstep(0.28, 0.16, seed).toVar();
  const smokeShade = float(0.34).add(lum.mul(0.46)).add(seedB.mul(0.18));
  const smokeCol = vec3(0.56, 0.61, 0.68).mul(smokeShade);
  const seamGlow = smoothstep(0.05, 0.28, erode).mul(smoothstep(0.55, 0.22, erode));
  const ashCol = mix(vec3(0.84, 0.86, 0.9), vec3(1.02, 0.92, 0.82), seamGlow.mul(seedB));
  const finalDissipate = smoothstep(0.58, 0.95, wDissolve).mul(smoothstep(0.62, 0.96, erode));
  posL.assign(posL.add(advect));
  scales.assign(scales.mul(mix(float(1), mix(float(0.26), float(3.8).add(seedB.mul(2.4)), isSmoke), erode)));
  rgb.assign(mix(rgb, mix(ashCol, smokeCol, isSmoke), erode.mul(0.95)));
  opacity.assign(
    opacity
      .mul(mix(float(1), mix(float(0.84), float(0.28), isSmoke), erode))
      .mul(float(1.0).sub(finalDissipate)),
  );

  // ── 3. HDR Cyan & Vermilion Neon Drift ────────────────────────────────────
  const neonWave = sin(pLocal.x.mul(1.2).add(pLocal.y.mul(0.8)).sub(t.mul(1.7)).add(eNoise.mul(1.8)));
  const warmMix = smoothstep(-0.55, 0.55, neonWave).toVar();
  const cyanNeon = mix(vec3(0.02, 0.52, 0.68), vec3(0.05, 0.98, 0.95), clamp(lum.mul(1.4), 0, 1));
  const amberNeon = mix(vec3(1.22, 0.24, 0.05), vec3(1.18, 0.66, 0.1), seedB);
  const emberRise = smoothstep(0.65, 0.98, seed).mul(wNeon).mul(0.38);
  posL.assign(posL.add(cFlow.mul(emberRise).add(vec3(0, emberRise.mul(0.6), 0))));
  rgb.assign(mix(rgb, mix(cyanNeon, amberNeon, warmMix).mul(float(0.35).add(lum.mul(1.1))), wNeon));
  opacity.assign(opacity.mul(mix(float(1), clamp(float(0.75).add(lum.mul(0.45)), 0, 1), wNeon)));

  // ── 4. Concentric Wave & Faceted Cellular Shatter ─────────────────────────
  const ringIdx = floor(rGround.div(0.36)).toVar();
  const bandSign = float(1).sub(fract(ringIdx.mul(0.5)).mul(4)).toVar();
  const waveY = sin(rGround.mul(4.2).sub(t.mul(3.2))).mul(0.2).mul(smoothstep(3.2, 0.3, rGround)).mul(wGeo);
  const ringSpin = bandSign.mul(sin(t.mul(1.0).add(ringIdx.mul(0.7)))).mul(0.26).mul(wGeo).toVar();
  const spun = rotXZ(posL, ringSpin).toVar();
  const cellCoord = floor(pLocal.mul(1.6)).toVar();
  const cellRand = hash33(cellCoord).toVar();
  const cellPivot = cellCoord.add(vec3(0.5)).div(1.6).toVar();
  const shardDisp = normalize(cellRand.sub(vec3(0.5)).add(vec3(0.001, 0.22, 0.001))).mul(0.38).mul(wGeo);
  const cellLocal = fract(pLocal.mul(1.6)).sub(vec3(0.5));
  const cellEdge = smoothstep(0.3, 0.49, max(abs(cellLocal.x), max(abs(cellLocal.y), abs(cellLocal.z))));
  const shardAngle = cellRand.x.sub(0.5).mul(1.2).mul(wGeo).toVar();
  const finalGeoPos = rotXY(spun.sub(cellPivot), shardAngle).add(cellPivot).add(shardDisp).add(vec3(0, waveY, 0));
  posL.assign(mix(posL, finalGeoPos, wGeo));
  quat.assign(mix(quat, GpuSplatMath.quatMul(vec4(0, sin(ringSpin.mul(0.5)), 0, cos(ringSpin.mul(0.5))), quat), wGeo));
  rgb.assign(mix(rgb, vec3(0.55, 0.92, 1.0), cellEdge.mul(wGeo).mul(0.58)));

  // ── 5. Vortex Tornado Funnel ──────────────────────────────────────────────
  const vx = sin(t.mul(0.85)).mul(0.22).toVar();
  const vz = cos(t.mul(0.85)).mul(0.22).toVar();
  const vRel = vec3(pLocal.x.sub(vx), pLocal.y, pLocal.z.sub(vz)).toVar();
  const vr = length(vec2(vRel.x, vRel.z)).add(0.02).toVar();
  const vhN = clamp(pLocal.y.add(1.1).div(2.2), 0, 1).toVar();
  const vFunnelR = float(0.14).add(vhN.mul(0.84)).add(seed.mul(0.16));
  const vPull = clamp(float(1.25).sub(vr.mul(0.45)), 0.15, 1.0).mul(wVortex).toVar();
  const vAng = t.mul(2.8).add(float(2.2).div(vr.add(0.28))).mul(vPull).toVar();
  const vSpun = rotXZ(vRel, vAng).toVar();
  const vRadialDir = normalize(vec2(vSpun.x, vSpun.z).add(vec2(0.001, 0.001))).mul(vFunnelR);
  const vUp = vhN.mul(0.52).mul(vPull).add(cFlow.mul(0.24).mul(vPull));
  const vPos = vec3(
    mix(vSpun.x, vRadialDir.x, vPull.mul(0.62)).add(vx),
    vSpun.y.add(vUp.y).add(sin(vAng.mul(0.5)).mul(0.08).mul(vPull)),
    mix(vSpun.z, vRadialDir.y, vPull.mul(0.62)).add(vz),
  ).add(vec3(vUp.x, 0, vUp.z));
  posL.assign(mix(posL, vPos, wVortex));
  quat.assign(mix(quat, GpuSplatMath.quatMul(vec4(0, sin(vAng.mul(0.5)), 0, cos(vAng.mul(0.5))), quat), wVortex));
  const vDustGlow = smoothstep(0.45, 0.95, vPull);
  const vTint = mix(vec3(0.42, 0.78, 0.94), vec3(1.18, 0.84, 0.34), smoothstep(0.65, 0.98, seed));
  rgb.assign(mix(rgb, mix(baseRgb, vTint.mul(float(0.45).add(lum)), vDustGlow.mul(0.68)), wVortex));
  scales.assign(scales.mul(mix(float(1), float(0.85).add(vDustGlow.mul(0.55)), wVortex)));

  // ── 6. Radial Kinetic Shatter (shader fallback when not playing real CUDA MPM)
  const kCell = floor(pLocal.mul(2.2)).toVar();
  const kRand = hash33(kCell).toVar();
  const kPivot = kCell.add(vec3(0.5)).div(2.2).toVar();
  const kBlast = clamp(age.mul(0.65).sub(length(pLocal).mul(0.45)), 0, 1.8).mul(wMpmFallback).toVar();
  const kDir = normalize(pLocal.add(kRand.sub(0.5).mul(0.55)).add(vec3(0.001, 0.25, 0.001)));
  const kPos = rotXY(pLocal.sub(kPivot), kBlast.mul(kRand.x.sub(0.5)).mul(2.8))
    .add(kPivot)
    .add(kDir.mul(kBlast.mul(0.48)))
    .add(vec3(0, kBlast.mul(kBlast).mul(-0.35), 0));
  posL.assign(mix(posL, kPos, wMpmFallback));

  // ── 7. Refined 3D Holographic Voxel Laser Wipe ────────────────────────────
  const vGrid = float(26.0).add(sin(t.mul(0.8)).mul(2.0)).toVar();
  const scanY = sin(age.mul(1.18).sub(1.5708)).mul(1.05).toVar();
  const voxReveal = smoothstep(scanY.add(0.16), scanY.sub(0.16), pLocal.y).mul(wVoxel).toVar();
  const scanBand = exp(abs(pLocal.y.sub(scanY)).mul(abs(pLocal.y.sub(scanY))).mul(-68)).mul(wVoxel).toVar();
  const qCell = floor(pLocal.mul(vGrid).add(0.5)).div(vGrid).toVar();
  const qLocal = abs(fract(pLocal.mul(vGrid)).sub(0.5));
  const qWire = smoothstep(0.34, 0.49, max(qLocal.x, max(qLocal.y, qLocal.z)));
  const qPop = vec3(0, scanBand.mul(0.05), 0);
  posL.assign(mix(posL, qCell.add(qPop), voxReveal));
  const voxSize = uFxScale.mul(0.11).div(vGrid);
  scales.assign(mix(scales, vec3(voxSize), clamp(voxReveal.add(scanBand.mul(0.85)), 0, 1)));
  quat.assign(mix(quat, vec4(0, 0, 0, 1), voxReveal));
  const voxHolo = mix(baseRgb, vec3(0.16, 0.98, 0.8), qWire.mul(0.32)).add(
    vec3(0.18, 0.95, 0.84).mul(scanBand.mul(0.42)),
  );
  rgb.assign(mix(rgb, voxHolo, clamp(voxReveal.add(scanBand), 0, 1)));

  // ── 8. Outdoor Local Wormhole Singularity (16% Wormhole + 84% Intact Scene w/ Local Suction) ─
  const bhProg = clamp(age.mul(0.36), 0, 1).toVar();
  const wormholeOpen = smoothstep(0.0, 0.52, bhProg).toVar();
  const toCam = normalize(uCamPos.sub(uFxCenter)).toVar();
  const camRight = normalize(cross(vec3(0, 1, 0), toCam)).toVar();
  const camUp = normalize(cross(toCam, camRight)).toVar();
  const tiltRight = camRight.mul(0.9781476).add(camUp.mul(0.2079117)).toVar();
  const tiltUp = camUp.mul(0.9781476).sub(camRight.mul(0.2079117)).toVar();

  const camDist = length(uCamPos.sub(uFxCenter)).toVar();
  const bhUnitBase = clamp(camDist.div(max(uFxScale, 0.05)).mul(0.0155), 0.02, 0.22).toVar();
  const openScale = mix(float(0.06), float(1.0), wormholeOpen).toVar();
  const bhUnit = bhUnitBase.mul(openScale).toVar();
  const bhWorldUnit = bhUnit.mul(uFxScale).toVar();
  const bhCenter = vec3(0, 0, 0).toVar();

  const toLocal = (sx: TslNode, sy: TslNode, sz: TslNode): TslNode =>
    bhCenter.add(tiltRight.mul(sx.mul(bhUnit))).add(tiltUp.mul(sy.mul(bhUnit))).add(toCam.mul(sz.mul(bhUnit)));
  const toDir = (dx: TslNode, dy: TslNode, dz: TslNode): TslNode =>
    normalize(tiltRight.mul(dx).add(tiltUp.mul(dy)).add(toCam.mul(dz)).add(tiltRight.mul(1e-5)));

  const h3A = hash33(pLocal.mul(31.7).add(vec3(5.3, 19.1, 41.7))).toVar();
  const h3B = hash33(pLocal.mul(67.3).add(vec3(29.7, 11.3, 73.1))).toVar();

  // Only 20% forms the hovering wormhole; 80% remains the intact outdoor forest scene!
  const isCore = seed.lessThan(0.036);
  const isRing = seed.greaterThanEqual(0.036).and(seed.lessThan(0.054));
  const isUnder = seed.greaterThanEqual(0.054).and(seed.lessThan(0.068));
  const isDisk = seed.greaterThanEqual(0.068).and(seed.lessThan(0.2));
  const isWormhole = seed.lessThan(0.2);

  // Layer 1: Solid Pitch-Black Event Horizon Core (placed at z=+0.35 behind ring +0.84, under +0.50, and front disk +0.75)
  const coreR = sqrt(h3A.x).mul(2.04);
  const coreAng = h3A.y.mul(6.2831853);
  const corePos = toLocal(cos(coreAng).mul(coreR), sin(coreAng).mul(coreR), float(0.35));
  const coreScale = vec3(0.24, 0.24, 0.06).mul(bhWorldUnit);
  const coreCol = vec3(0.0, 0.0, 0.0);
  const coreOp = float(0.998);

  // Layer 2: Razor-Thin 360 Hairline Photon Ring
  const ringPhi = h3A.y.mul(6.2831853).toVar();
  const ringR = float(2.085).add(h3A.x.sub(0.5).mul(0.018));
  const ringPos = toLocal(cos(ringPhi).mul(ringR), sin(ringPhi).mul(ringR), float(0.84));
  const ringTan = toDir(sin(ringPhi).negate(), cos(ringPhi), float(0.0));
  const ringScale = vec3(0.12, 0.011, 0.01).mul(bhWorldUnit);
  const ringBoost = float(1.0).sub(cos(ringPhi).mul(0.52));
  const ringHdr = vec3(1.0, 0.86, 0.64).mul(ringBoost.mul(2.0));
  const isTopCircle = smoothstep(-0.35, 0.25, sin(ringPhi).negate());
  const ringOp = mix(float(0.38), float(0.82), isTopCircle);

  // Layer 3: Beloborodov (2002) Accretion Disk & Rounded Upper Arch
  const evalBeloborodov = (phiVal: TslNode, rVal: TslNode): TslNode => {
    const oY = float(0.255);
    const oZ = float(0.96694);
    const uY = oZ;
    const uZ = float(-0.255);
    const cPhi = cos(phiVal).toVar();
    const sPhi = sin(phiVal).toVar();
    const cosPsi = sPhi.mul(oZ).toVar();
    const fMetric = max(float(1.0).sub(float(0.8).div(rVal)), 0.05).toVar();
    const cosA = clamp(float(1.0).sub(float(1.0).sub(cosPsi).mul(fMetric)), -0.9995, 0.9995).toVar();
    const sinA = sqrt(max(float(1.0).sub(cosA.mul(cosA)), 0.0001)).toVar();
    const bRaw = rVal.mul(sinA).div(sqrt(fMetric));
    const persp = float(46.0).div(max(float(46.0).sub(rVal.mul(sPhi)), 20.0));
    const b = bRaw.mul(persp).toVar();
    const ex = cPhi;
    const ey = oY.negate().mul(cosPsi);
    const ez = sPhi.sub(oZ.mul(cosPsi));
    const eLen = sqrt(max(ex.mul(ex).add(ey.mul(ey)).add(ez.mul(ez)), 1e-6)).toVar();
    const sx = ex.div(eLen).mul(b);
    const sy = ey.mul(uY).add(ez.mul(uZ)).div(eLen).mul(b);
    return vec2(sx, sy);
  };

  const normR = pow(max(h3A.x, 0.0002), 1.38).toVar();
  const rU = float(4.1).add(normR.mul(7.8)).toVar();
  const angVel = float(-8.7).div(pow(max(rU, 0.5), 1.5)).toVar();
  const phiDisk = h3A.y.mul(6.2831853).add(age.mul(angVel).mul(0.42)).toVar();
  const p2 = evalBeloborodov(phiDisk, rU).toVar();
  const diskThick = h3B.x.sub(0.5).mul(mix(float(0.04), float(0.12), normR));
  const diskZ = mix(float(-0.75), float(0.75), smoothstep(-0.2, 0.2, sin(phiDisk)));
  const diskPos = toLocal(p2.x, p2.y.add(diskThick), diskZ);
  const pPlus = evalBeloborodov(phiDisk.add(0.03), rU);
  const pMinus = evalBeloborodov(phiDisk.sub(0.03), rU);
  const dTan2 = pPlus.sub(pMinus);
  const diskTan = toDir(dTan2.x, dTan2.y, float(0.0));
  const diskScale = vec3(mix(float(0.16), float(0.28), normR), mix(float(0.028), float(0.052), normR), float(0.024)).mul(
    bhWorldUnit,
  );

  const innerRatio = float(4.1).div(rU).toVar();
  const temp = float(49780.0).mul(pow(max(innerRatio, 0.0001), 5.22));
  const lapse = max(float(1.0).sub(float(0.8).div(rU)), 0.001);
  const beta = sqrt(max(float(0.8).div(rU.sub(0.8).mul(2.0)), 0.0001)).toVar();
  const gamma = float(1.0).div(sqrt(max(float(1.0).sub(beta.mul(beta)), 0.001)));
  const vDotO = cos(phiDisk).negate().mul(0.96694);
  const shift = sqrt(lapse.div(0.971)).div(max(gamma.mul(float(1.0).sub(beta.mul(vDotO))), 0.08)).toVar();
  const kelvin = clamp(temp.mul(shift), 1800, 40000).toVar();
  const thermalEmission = mix(
    mix(vec3(0.85, 0.36, 0.12), vec3(1.0, 0.5809, 0.2433), smoothstep(1800, 3500, kelvin)),
    mix(vec3(1.0, 0.84, 0.6), vec3(1.0, 0.95, 0.86), smoothstep(9000, 20000, kelvin)),
    smoothstep(3500, 9000, kelvin),
  );
  const diskEmission = mix(thermalEmission, vec3(1.0, 0.8392, 0.4314), 0.05);
  const shiftSq = shift.mul(shift);
  const radFlux = clamp(shiftSq.mul(shiftSq), 0.06, 5.8);
  const emissivity = pow(max(innerRatio, 0.0001), 1.5).mul(1.85).add(0.18);
  const edgeFall = smoothstep(0.02, 0.18, normR).mul(float(1.0).sub(smoothstep(0.45, 0.96, normR))).toVar();

  const cycT = fract(t.div(9.0)).mul(9.0).toVar();
  const shearA = phiDisk.add(cycT.mul(angVel).mul(0.55));
  const shearB = phiDisk.add(cycT.add(9.0).mul(angVel).mul(0.55));
  const fA = fbm3(vec3(rU.mul(3.25), cos(shearB).mul(1.33), sin(shearB).mul(1.33)));
  const fB = fbm3(vec3(rU.mul(3.25), cos(shearA).mul(1.33), sin(shearA).mul(1.33)));
  const fMix = mix(fA, fB, cycT.div(9.0));
  const filament = pow(clamp(fMix.mul(1.16), 0.001, 1.0), 3.8).toVar();
  const diskHdr = diskEmission.mul(radFlux).mul(emissivity).mul(filament.mul(2.1).add(0.08)).mul(2.55);
  const diskOp = clamp(filament.mul(0.84).add(0.06), 0.05, 0.88).mul(edgeFall);

  // Layer 4: Delicate Translucent Secondary (n = 1) Inverted Golden-Ivory Crescent
  const underNorm = pow(max(h3A.x, 0.0005), 1.25).toVar();
  const underPhi = mix(float(-3.24), float(0.10), h3A.y).toVar();
  const botArc = smoothstep(-0.1, 0.95, sin(underPhi).negate()).toVar();
  const underR = float(2.11).add(underNorm.mul(0.32).mul(float(0.3).add(botArc.mul(0.7)))).toVar();
  const underPos = toLocal(cos(underPhi).mul(underR), sin(underPhi).mul(underR).sub(underNorm.mul(0.06)), float(0.50));
  const underTan = toDir(sin(underPhi).negate(), cos(underPhi), float(0.0));
  const underScale = vec3(0.14, 0.02, 0.015).mul(bhWorldUnit);
  const underFil = pow(
    clamp(fbm3(vec3(underR.mul(6.2), cos(underPhi.sub(age.mul(0.26))).mul(1.4), sin(underPhi.sub(age.mul(0.26))).mul(1.4))).mul(1.18), 0.001, 1.0),
    2.4,
  ).toVar();
  const underLeft = clamp(float(0.5).sub(cos(underPhi).mul(0.5)), 0, 1);
  const underHdr = mix(vec3(1.25, 0.84, 0.48), vec3(1.65, 1.44, 1.12), underLeft)
    .mul(underFil.mul(1.85).add(0.45))
    .mul(float(1.0).sub(underNorm.mul(0.35)));
  const underOp = clamp(underFil.mul(0.42), 0.01, 0.42)
    .mul(float(1.0).sub(smoothstep(0.45, 1.0, underNorm)))
    .mul(smoothstep(0.0, 0.25, botArc));

  // Assemble the 16% Wormhole Target
  const p3 = select(isUnder, underPos, diskPos);
  const p2Tgt = select(isRing, ringPos, p3);
  const targetPos = select(isCore, corePos, p2Tgt).toVar();

  const t3 = select(isUnder, underTan, diskTan);
  const t2Tgt = select(isRing, ringTan, t3);
  const targetTan = normalize(select(isCore, tiltRight, t2Tgt)).toVar();

  const s3 = select(isUnder, underScale, diskScale);
  const s2Tgt = select(isRing, ringScale, s3);
  const targetScale = select(isCore, coreScale, s2Tgt).toVar();

  const h3Hdr = select(isUnder, underHdr, diskHdr);
  const h2Tgt = select(isRing, ringHdr, h3Hdr);
  const targetHdr = select(isCore, coreCol, h2Tgt).toVar();

  const o3 = select(isUnder, underOp, diskOp);
  const o2Tgt = select(isRing, ringOp, o3);
  const targetOp = select(isCore, coreOp, o2Tgt).toVar();

  const agxRgb = vec3(agxToneMapping(targetHdr as never, float(1.0) as never) as unknown as TslNode);
  const targetRgb = select(isCore, vec3(0, 0, 0), agxRgb.mul(1.12)).toVar();

  const qZ = toCam;
  const qX = normalize(targetTan.sub(qZ.mul(dot(targetTan, qZ))).add(tiltRight.mul(1e-5)));
  const qY = normalize(cross(qZ, qX));
  const targetQuat = basisToQuat(qX, qY, qZ).toVar();

  // Spatial coordinates relative to local wormhole center
  const dCore = pLocal.sub(bhCenter).toVar();
  const dR = length(dCore).add(0.001).toVar();
  const dDepth = dot(dCore, toCam).toVar();
  const dX = dot(dCore, tiltRight).toVar();
  const dY = dot(dCore, tiltUp).toVar();
  const dScrR = length(vec2(dX, dY)).add(0.001).toVar();

  // Branch A: Wormhole core & accretion disk formation (20% splats; carriers fade silently instead of painting doorway orange)
  const whArrival = clamp(
    select(isCore.or(isRing), smoothstep(0.02, 0.34, bhProg), smoothstep(0.04, 0.56, bhProg)),
    0.0,
    1.0,
  ).toVar();
  const whSwirl = whArrival.mul(float(-2.8).sub(seedB.mul(1.6))).mul(float(1.0).sub(whArrival.mul(0.35))).toVar();
  const cWh = cos(whSwirl).toVar();
  const sWh = sin(whSwirl).toVar();
  const whStartPos = bhCenter
    .add(tiltRight.mul(dX.mul(cWh).sub(dY.mul(sWh))))
    .add(tiltUp.mul(dX.mul(sWh).add(dY.mul(cWh))))
    .add(toCam.mul(dDepth.mul(float(1.0).sub(smoothstep(0.05, 0.45, whArrival).mul(0.85)))));
  const whPos = mix(whStartPos, targetPos, smoothstep(0.15, 0.85, whArrival)).toVar();
  const whScale = mix(min(scales, vec3(bhWorldUnit.mul(0.10))), targetScale, smoothstep(0.25, 0.78, whArrival));
  const whCarrierClear = mix(
    smoothstep(0.10, 0.55, whArrival),
    smoothstep(0.58, 0.92, whArrival),
    smoothstep(0.42, 0.85, dR),
  );
  const whCol = mix(baseRgb, targetRgb, smoothstep(0.55, 0.90, whArrival));
  const whOp = mix(opacity, targetOp, smoothstep(0.32, 0.82, whArrival)).mul(whCarrierClear).mul(wormholeOpen);
  const whQuat = normalize(mix(quat, targetQuat, smoothstep(0.25, 0.8, whArrival)));

  // Branch B: 80% Intact Outdoor Forest with Tight Archway Suction, Gravitational Lensing & Warm Rim Light
  const localZone = float(1.0)
    .sub(smoothstep(0.45, 1.35, dR.add(eNoise.mul(0.25))))
    .mul(smoothstep(0.08, 0.44, bhProg))
    .toVar();
  const isStreamSplat = h3B.z.lessThan(0.18);
  const streamActive = select(isStreamSplat, localZone, float(0.0)).toVar();

  // Cyclic inward spiraling vine/moss wisps stretched tangentially into the accretion rim (natural greens/stone until rim)
  const sPhase = fract(age.mul(0.30).add(h3A.z)).toVar();
  const sAng = sPhase.mul(sPhase).mul(-4.4).sub(h3B.x.mul(0.8)).mul(localZone).toVar();
  const cSt = cos(sAng).toVar();
  const sSt = sin(sAng).toVar();
  const rimTarget = mix(float(2.25), float(4.2), h3B.y).mul(bhUnit);
  const rimFrac = clamp(rimTarget.div(dScrR), 0.16, 1.0);
  const pullR = mix(float(1.0), rimFrac, pow(max(sPhase, 0.0001), 1.35)).toVar();
  const swX = dX.mul(cSt).sub(dY.mul(sSt)).mul(pullR).toVar();
  const swY = dX.mul(sSt).add(dY.mul(cSt)).mul(pullR).toVar();
  const sPos = bhCenter
    .add(tiltRight.mul(swX))
    .add(tiltUp.mul(swY))
    .add(toCam.mul(dDepth.mul(float(1.0).sub(sPhase.mul(0.88)))))
    .toVar();
  const sTan = normalize(tiltRight.mul(swY).sub(tiltUp.mul(swX)).add(tiltRight.mul(1e-5))).toVar();
  const sQuat = basisToQuat(sTan, normalize(cross(toCam, sTan)), toCam).toVar();
  const sQuatAligned = select(dot(quat, sQuat).lessThan(0.0), sQuat.negate(), sQuat);
  const streamScale = min(scales, vec3(bhWorldUnit.mul(0.22), bhWorldUnit.mul(0.045), bhWorldUnit.mul(0.045)));
  const streamCol = mix(baseRgb, vec3(0.95, 0.74, 0.46), smoothstep(0.75, 0.96, sPhase));
  const streamFade = smoothstep(0.0, 0.08, sPhase).mul(float(1.0).sub(smoothstep(0.68, 0.94, sPhase)));

  // Background Einstein deflection behind the arch + subtle warm rim highlight on stone inner archway
  const bgMask = float(1.0).sub(smoothstep(-0.15, 0.2, dDepth));
  const lensPush = bgMask
    .mul(exp(dScrR.div(max(bhUnit.mul(6.5), 0.02)).negate()))
    .mul(bhUnit.mul(2.2))
    .mul(wormholeOpen);
  const scrDir = vec2(dX, dY).div(dScrR);
  const lensOffset = tiltRight.mul(scrDir.x.mul(lensPush)).add(tiltUp.mul(scrDir.y.mul(lensPush)));

  const tidalLean = exp(dR.mul(dR).mul(-0.95)).mul(wormholeOpen).mul(0.15);
  const swirlLean = tidalLean.mul(-1.2);
  const cLn = cos(swirlLean);
  const sLn = sin(swirlLean);
  const leanedXY = tiltRight
    .mul(dX.mul(cLn).sub(dY.mul(sLn)).mul(float(1.0).sub(tidalLean)))
    .add(tiltUp.mul(dX.mul(sLn).add(dY.mul(cLn)).mul(float(1.0).sub(tidalLean))));
  const intactWarpedPos = bhCenter.add(leanedXY).add(toCam.mul(dDepth)).add(lensOffset);

  const archGlow = exp(dR.mul(dR).mul(-2.2)).mul(wormholeOpen).mul(0.32);
  const sceneLitCol = baseRgb.mul(vec3(1.0).add(vec3(0.92, 0.72, 0.44).mul(archGlow)));

  const scenePos = mix(intactWarpedPos, sPos, streamActive).toVar();
  const sRel = scenePos.sub(bhCenter).toVar();
  const sScr = sRel.sub(toCam.mul(dot(sRel, toCam))).toVar();
  const holeClear = mix(float(1.0), smoothstep(bhUnit.mul(2.02), bhUnit.mul(2.45), length(sScr)), wormholeOpen);

  const sceneScale = mix(scales, streamScale, streamActive);
  const sceneCol = mix(sceneLitCol, streamCol, streamActive);
  const sceneOp = opacity.mul(mix(float(1.0), streamFade, streamActive)).mul(holeClear);
  const sceneQuat = normalize(mix(quat, sQuatAligned, streamActive));

  // Combine Wormhole vs Remaining Intact Forest Scene and gate strictly by wSingularity
  const combPos = select(isWormhole, whPos, scenePos).toVar();
  const combWorldPos = uFxCenter.add(combPos.mul(uFxScale));
  const lensFade = mix(
    float(1.0),
    smoothstep(0.45, 0.72, length(combWorldPos.sub(uCamPos))),
    select(isWormhole, float(1.0), streamActive).mul(wSingularity),
  );
  const combScale = select(isWormhole, whScale, sceneScale);
  const combCol = select(isWormhole, whCol, sceneCol);
  const combOp = select(isWormhole, whOp, sceneOp).mul(lensFade);
  const combQuat = select(isWormhole, whQuat, sceneQuat);

  const wSynthSing = wSingularity.mul(float(1.0).sub(uClearingLive)).mul(float(1.0).sub(uForestSing)).toVar();
  posL.assign(mix(posL, combPos, wSynthSing));
  scales.assign(mix(scales, combScale, wSynthSing));
  quat.assign(mix(quat, combQuat, wSynthSing));
  rgb.assign(mix(rgb, combCol, wSynthSing));
  opacity.assign(mix(opacity, combOp, wSynthSing));

  // ── 8c. Dynamic Forest Clearing Singularity (Clean Forest -> Codex 1 Effect) ──
  const wFSing = wSingularity.mul(uForestSing).toVar();
  const fsProg = clamp(age.mul(0.28), 0.0, 1.0).toVar();
  const fsOpen = smoothstep(0.0, 0.54, fsProg).mul(wFSing).toVar();
  const fsRingOpen = smoothstep(0.06, 0.62, fsProg).mul(wFSing).toVar();
  const fsSiphOpen = smoothstep(0.16, 0.76, fsProg).mul(wFSing).toVar();

  const fsWorld = uFxCenter.add(posL.mul(uFxScale)).toVar();
  const fsBhPos = uFxCenter.toVar();
  const fsR = float(0.60).toVar();
  const fsOpenR = fsR.mul(mix(float(0.04), float(1.0), fsOpen)).toVar();

  // Lean 4.35% allocation -> crisp razor-thin Forest Pulse rings, solid sphere, airy violet mist & ~350 individual leaves
  const fsIsCore = seed.lessThan(0.026);
  const fsIsRing1 = seed.greaterThanEqual(0.026).and(seed.lessThan(0.0315));
  const fsIsRing2 = seed.greaterThanEqual(0.0315).and(seed.lessThan(0.0365));
  const fsIsRing3 = seed.greaterThanEqual(0.0365).and(seed.lessThan(0.0415));
  const fsIsSiphonMist = seed.greaterThanEqual(0.0415).and(seed.lessThan(0.0432));
  const fsIsSiphonLeaf = seed.greaterThanEqual(0.0432).and(seed.lessThan(0.04355));
  const fsIsEffect = seed.lessThan(0.04355);

  // Layer A: Razor-Crisp 3D Velvet-Black Event Horizon Sphere (no fuzzy overhang!)
  const fsCoreZ = h3A.x.mul(2.0).sub(1.0).toVar();
  const fsCoreXY = sqrt(max(float(1.0).sub(fsCoreZ.mul(fsCoreZ)), 0.0001)).toVar();
  const fsCorePhi = h3A.y.mul(6.2831853).toVar();
  const fsCoreRadScale = mix(float(0.25), float(0.97), pow(h3B.x, 0.22));
  const fsCoreDir = vec3(cos(fsCorePhi).mul(fsCoreXY), sin(fsCorePhi).mul(fsCoreXY), fsCoreZ).toVar();
  const fsCorePosW = fsBhPos.add(fsCoreDir.mul(fsOpenR.mul(fsCoreRadScale)));
  const fsCoreRim = pow(max(float(1.0).sub(abs(fsCoreZ)), 0.0), 4.2);
  const fsCoreCol = vec3(0.002, 0.001, 0.006).add(vec3(0.10, 0.03, 0.20).mul(fsCoreRim.mul(0.50)));
  const fsCoreScale = vec3(fsOpenR.mul(0.036));
  const fsCoreOp = float(0.998).mul(smoothstep(0.02, 0.20, fsOpen));

  // Layer B: Three Razor-Thin Tilted 3D Neon Rings (Codex 1 / Forest Pulse laser tubes + real GPU bloom)
  const evalRing3D = (
    ang: TslNode,
    rad: TslNode,
    tiltX: number,
    rollZ: number,
    yOff: TslNode,
  ): { pos: TslNode; tan: TslNode } => {
    const ca = cos(ang).toVar();
    const sa = sin(ang).toVar();
    const p0 = vec3(ca.mul(rad), float(0.0), sa.mul(rad));
    const t0 = vec3(sa.negate(), float(0.0), ca);
    const cx = float(Math.cos(tiltX));
    const sx = float(Math.sin(tiltX));
    const p1 = vec3(p0.x, p0.y.mul(cx).sub(p0.z.mul(sx)), p0.y.mul(sx).add(p0.z.mul(cx)));
    const t1 = vec3(t0.x, t0.y.mul(cx).sub(t0.z.mul(sx)), t0.y.mul(sx).add(t0.z.mul(cx)));
    const cz = float(Math.cos(rollZ));
    const sz = float(Math.sin(rollZ));
    const p2 = vec3(p1.x.mul(cz).sub(p1.y.mul(sz)), p1.x.mul(sz).add(p1.y.mul(cz)), p1.z);
    const t2 = normalize(vec3(t1.x.mul(cz).sub(t1.y.mul(sz)), t1.x.mul(sz).add(t1.y.mul(cz)), t1.z));
    return { pos: fsBhPos.add(vec3(0.0, yOff, 0.0)).add(p2), tan: t2 };
  };

  const fsRScaleGrow = mix(float(0.10), float(1.0), fsRingOpen).toVar();
  // Ring 1: Upper-outer crisp icy white-cyan halo arching cleanly above the sphere
  const r1Ang = h3A.y.mul(6.2831853).add(age.mul(0.50)).toVar();
  const r1Rad = fsR.mul(2.38).add(h3A.x.sub(0.5).mul(0.007)).mul(fsRScaleGrow);
  const r1G = evalRing3D(r1Ang, r1Rad, 0.72, 0.17, fsR.mul(0.28));
  const r1Wave = float(0.88).add(float(0.32).mul(sin(r1Ang.sub(age.mul(2.0)))));
  const r1Col = vec3(1.12, 1.46, 1.98).mul(r1Wave);
  const r1Scale = vec3(fsR.mul(0.036), fsR.mul(0.0072), fsR.mul(0.0072)).mul(fsRScaleGrow);

  // Ring 2: Inner hot neon magenta-pink ring hugging the equator
  const r2Ang = h3A.y.mul(6.2831853).sub(age.mul(0.72)).toVar();
  const r2Rad = fsR.mul(1.52).add(h3A.x.sub(0.5).mul(0.006)).mul(fsRScaleGrow);
  const r2G = evalRing3D(r2Ang, r2Rad, 0.62, 0.22, fsR.mul(0.04));
  const r2Wave = float(0.90).add(float(0.34).mul(sin(r2Ang.add(age.mul(2.6)))));
  const r2Col = vec3(1.98, 0.14, 1.05).mul(r2Wave);
  const r2Scale = vec3(fsR.mul(0.032), fsR.mul(0.0068), fsR.mul(0.0068)).mul(fsRScaleGrow);

  // Ring 3: Lower-outer electric cyan-lavender ring sweeping across the front & underside
  const r3Ang = h3A.y.mul(6.2831853).add(age.mul(0.40)).toVar();
  const r3Rad = fsR.mul(2.06).add(h3A.x.sub(0.5).mul(0.007)).mul(fsRScaleGrow);
  const r3G = evalRing3D(r3Ang, r3Rad, 0.68, 0.14, fsR.mul(-0.34));
  const r3Wave = float(0.85).add(float(0.30).mul(sin(r3Ang.sub(age.mul(1.7)).add(2.1))));
  const r3Col = vec3(0.92, 1.18, 1.92).mul(r3Wave);
  const r3Scale = vec3(fsR.mul(0.034), fsR.mul(0.0070), fsR.mul(0.0070)).mul(fsRScaleGrow);

  // Layer C: Airy Translucent S-Curve Violet Mist Vortex + ~350 Discrete Floating Leaves
  const siphH = fract(h3A.x.add(age.mul(0.24))).toVar();
  const siphVisibleH = smoothstep(0.0, 0.10, siphH).mul(float(1.0).sub(smoothstep(0.88, 1.0, siphH)));
  const siphFloorY = uFloorY.add(0.02);
  const siphTopY = fsBhPos.y.sub(fsR.mul(0.75));
  const siphY = mix(siphFloorY, siphTopY, siphH).toVar();
  const spineX = sin(siphH.mul(5.2).sub(0.8)).mul(0.24).mul(float(1.0).sub(siphH.mul(0.30)));
  const spineZ = cos(siphH.mul(3.8)).mul(0.10).mul(float(1.0).sub(siphH.mul(0.30)));

  // 3 intertwined translucent lilac-violet mist ribbons (~2,000 wispy splats)
  const strandIdx = floor(h3B.z.mul(3.0));
  const strandBaseAng = strandIdx.mul(2.0943951).add(siphH.mul(11.0)).sub(age.mul(2.8));
  const mistFunnelR = mix(float(0.16), float(0.042), smoothstep(0.0, 0.48, siphH))
    .add(smoothstep(0.66, 1.0, siphH).mul(0.16))
    .mul(float(0.55).add(h3B.x.mul(0.65)))
    .toVar();
  const mistPhi = strandBaseAng.add(h3A.y.sub(0.5).mul(0.42)).toVar();
  const mistPosW = vec3(
    fsBhPos.x.add(spineX).add(cos(mistPhi).mul(mistFunnelR)),
    siphY,
    fsBhPos.z.add(0.12).add(spineZ).add(sin(mistPhi).mul(mistFunnelR)),
  );
  const mistTan = normalize(vec3(sin(mistPhi).negate().mul(0.65), float(0.76), cos(mistPhi).mul(0.65)));
  const mistScale = vec3(0.032, 0.0052, 0.0052).mul(mix(float(0.65), float(1.25), h3B.y));
  const floorContact = float(1.0).sub(smoothstep(0.0, 0.14, siphH));
  const mistCol = mix(
    mix(vec3(0.68, 0.28, 1.02), vec3(1.12, 0.48, 1.08), smoothstep(0.18, 0.72, siphH)),
    vec3(1.22, 0.56, 0.52),
    floorContact,
  );
  const mistOp = float(0.22)
    .mul(siphVisibleH)
    .mul(smoothstep(0.05, 0.45, fsSiphOpen))
    .mul(smoothstep(siphH.sub(0.06), siphH.add(0.06), fsSiphOpen.mul(1.15)));

  // ~350 discrete small dark leaves drifting loosely around the translucent mist funnel (matching Codex 1!)
  const leafPhi = siphH.mul(8.2).sub(age.mul(2.0)).add(h3A.y.mul(6.2831853)).toVar();
  const leafOrbitR = mix(float(0.46), float(0.14), smoothstep(0.0, 0.78, siphH)).mul(
    float(0.42).add(h3B.x.mul(0.95)),
  );
  const leafPosW = vec3(
    fsBhPos.x.add(spineX).add(cos(leafPhi).mul(leafOrbitR)),
    siphY.add(sin(age.mul(3.0).add(seed.mul(40.0))).mul(0.04)),
    fsBhPos.z.add(0.18).add(spineZ).add(sin(leafPhi).mul(leafOrbitR)),
  );
  const leafTan = normalize(
    vec3(cos(leafPhi.add(age.mul(4.0))), sin(seed.mul(30.0).add(age.mul(3.5))), sin(leafPhi.add(age.mul(4.0)))),
  );
  const leafScale = vec3(0.017, 0.009, 0.0035).mul(mix(float(0.6), float(1.25), h3B.y));
  const leafCol = mix(vec3(0.10, 0.03, 0.06), vec3(0.32, 0.09, 0.12), h3B.y).add(
    vec3(0.22, 0.06, 0.24).mul(smoothstep(0.20, 0.85, siphH)),
  );
  const leafOp = float(0.92)
    .mul(siphVisibleH)
    .mul(smoothstep(0.08, 0.48, fsSiphOpen))
    .mul(smoothstep(siphH.sub(0.06), siphH.add(0.06), fsSiphOpen.mul(1.15)));

  // Assemble the 4.35% Dynamic Singularity Effect
  const fsEffPosW = select(
    fsIsCore,
    fsCorePosW,
    select(
      fsIsRing1,
      r1G.pos,
      select(fsIsRing2, r2G.pos, select(fsIsRing3, r3G.pos, select(fsIsSiphonMist, mistPosW, leafPosW))),
    ),
  ).toVar();
  const fsEffTan = normalize(
    select(
      fsIsCore,
      vec3(1.0, 0.0, 0.0),
      select(
        fsIsRing1,
        r1G.tan,
        select(fsIsRing2, r2G.tan, select(fsIsRing3, r3G.tan, select(fsIsSiphonMist, mistTan, leafTan))),
      ),
    ),
  ).toVar();
  const fsEffScale = select(
    fsIsCore,
    fsCoreScale,
    select(
      fsIsRing1,
      r1Scale,
      select(fsIsRing2, r2Scale, select(fsIsRing3, r3Scale, select(fsIsSiphonMist, mistScale, leafScale))),
    ),
  ).toVar();
  const fsEffCol = select(
    fsIsCore,
    fsCoreCol,
    select(
      fsIsRing1,
      r1Col,
      select(fsIsRing2, r2Col, select(fsIsRing3, r3Col, select(fsIsSiphonMist, mistCol, leafCol))),
    ),
  ).toVar();
  const ringOpFinal = float(0.96).mul(smoothstep(0.04, 0.35, fsRingOpen));
  const fsEffOp = select(
    fsIsCore,
    fsCoreOp,
    select(
      fsIsRing1.or(fsIsRing2).or(fsIsRing3),
      ringOpFinal,
      select(fsIsSiphonMist, mistOp, leafOp),
    ),
  ).toVar();
  const fsEffToCam = normalize(uCamPos.sub(fsEffPosW)).toVar();
  const fsQX = normalize(fsEffTan.sub(fsEffToCam.mul(dot(fsEffTan, fsEffToCam))).add(vec3(1e-5, 0.0, 0.0)));
  const fsQY = normalize(cross(fsEffToCam, fsQX));
  const fsEffQuat = select(fsIsCore, vec4(0, 0, 0, 1), basisToQuat(fsQX, fsQY, fsEffToCam)).toVar();

  // Branch B (95.65% Intact Natural Forest): Exact Zero-Gap Einstein Lensing (r' = sqrt(r^2 + R^2)) + Indigo Atmosphere
  const fsRay = fsWorld.sub(uCamPos).toVar();
  const fsBhRay = fsBhPos.sub(uCamPos).toVar();
  const fsBhDepth = max(length(fsBhRay), 0.1).toVar();
  const fsBhFwd = fsBhRay.div(fsBhDepth).toVar();
  const fsSplatDepth = dot(fsRay, fsBhFwd).toVar();
  const fsIsBehindBh = smoothstep(fsBhDepth.sub(0.20), fsBhDepth.add(0.80), fsSplatDepth).toVar();
  const fsScaleToBh = fsBhDepth.div(max(fsSplatDepth, 0.25)).toVar();
  const fsProjOnBhPlane = uCamPos.add(fsRay.mul(fsScaleToBh)).sub(fsBhPos).toVar();
  const fsAngR = length(fsProjOnBhPlane).add(0.001).toVar();
  const fsAngDir = fsProjOnBhPlane.div(fsAngR).toVar();

  // Exact Einstein ring map: pushes r=0 smoothly right onto r=R (ZERO dark void gap around sphere!) and decays by r=2.6R
  const fsEinR = sqrt(fsAngR.mul(fsAngR).add(fsOpenR.mul(fsOpenR).mul(0.96)));
  const fsLensFalloff = exp(pow(fsAngR.div(max(fsR.mul(2.45), 0.05)), 2.2).negate());
  const fsLensDeltaR = fsEinR.sub(fsAngR).mul(fsLensFalloff).mul(fsIsBehindBh).mul(fsOpen);
  const fsLensedPosW = fsWorld.add(fsAngDir.mul(fsLensDeltaR.div(max(fsScaleToBh, 0.12))));
  // Only hide splats right inside the solid sphere (r' >= 0.98*R already wraps cleanly around it!)
  const fsHoleClear = float(1.0);

  // Moody deep indigo-violet forest mist + localized ring & floor bounce light (matching Codex 1)
  const fsDist3 = length(fsWorld.sub(fsBhPos)).toVar();
  const fsBgFogMask = smoothstep(-5.8, -12.0, fsWorld.z).toVar();
  const fsMidGlow = exp(fsDist3.div(4.6).mul(fsDist3.div(4.6)).negate()).toVar();
  const fsUpperCanopy = smoothstep(1.2, 6.2, fsWorld.y).mul(fsBgFogMask).toVar();
  const fsFloorPool = exp(
    pow(length(fsWorld.sub(vec3(fsBhPos.x, uFloorY, fsBhPos.z))).div(1.15), 2.0).negate(),
  ).mul(fsSiphOpen);

  // Foreground creek water magenta/violet reflections synchronized to the opening rings
  const fsInCreek = float(1.0)
    .sub(smoothstep(-0.88, -0.58, fsWorld.y))
    .mul(smoothstep(-5.8, -4.0, fsWorld.z))
    .mul(float(1.0).sub(smoothstep(0.42, 0.95, abs(fsWorld.x.add(0.02)))))
    .toVar();
  const fsCreekRipple = float(0.45).add(
    float(0.55).mul(sin(t.mul(3.4).add(fsWorld.z.mul(6.5)).add(fsWorld.x.mul(4.0)))),
  );
  const fsCreekRefl = vec3(0.75, 0.14, 0.62)
    .mul(fsInCreek)
    .mul(smoothstep(0.10, 0.42, lum))
    .mul(fsCreekRipple)
    .mul(fsRingOpen)
    .mul(0.78);

  // Deep nocturnal indigo atmospheric grade (rich dark violet mist, never blown-out hot pink)
  const fsIndigoTint = vec3(
    baseRgb.r.mul(0.58).add(baseRgb.b.mul(0.42)),
    baseRgb.g.mul(0.28).add(baseRgb.b.mul(0.10)),
    baseRgb.b.mul(1.08).add(baseRgb.r.mul(0.24)),
  );
  const fsLitForest = mix(baseRgb, fsIndigoTint, fsBgFogMask.mul(0.84).add(fsMidGlow.mul(0.32)).mul(fsOpen))
    .add(vec3(0.20, 0.05, 0.36).mul(fsUpperCanopy.mul(0.32).add(fsMidGlow.mul(0.42))).mul(fsOpen))
    .add(vec3(0.95, 0.42, 0.38).mul(fsFloorPool.mul(0.52)))
    .add(fsCreekRefl);

  const fsFinalPosW = select(fsIsEffect, fsEffPosW, fsLensedPosW);
  const fsFinalScale = select(fsIsEffect, fsEffScale, scales);
  const fsFinalQuat = select(fsIsEffect, fsEffQuat, quat);
  const fsFinalRgb = select(fsIsEffect, fsEffCol, fsLitForest);
  const fsFinalOp = select(fsIsEffect, fsEffOp, opacity.mul(fsHoleClear));

  const fsEffectBlend = select(fsIsEffect, smoothstep(0.0, 0.08, fsOpen), wFSing).toVar();
  posL.assign(mix(posL, fsFinalPosW.sub(uFxCenter).div(max(uFxScale, 0.05)), fsEffectBlend));
  scales.assign(mix(scales, fsFinalScale, fsEffectBlend));
  quat.assign(mix(quat, fsFinalQuat, fsEffectBlend));
  rgb.assign(mix(rgb, fsFinalRgb, fsEffectBlend));
  opacity.assign(mix(opacity, fsFinalOp, fsEffectBlend));

  // ── 8b. Live Singularity Clearing (Codex 1 SHARP 3DGS) ────────────────────────
  const wClearingFx = wSingularity.mul(uClearingLive).toVar();
  const cWorld = uFxCenter.add(posL.mul(uFxScale)).toVar();
  const cRel = cWorld.sub(vec3(0.0, 0.8, -8.65)).toVar();
  const cChroma = max(baseRgb.r, max(baseRgb.g, baseRgb.b)).sub(min(baseRgb.r, min(baseRgb.g, baseRgb.b))).toVar();
  const inRingBox = float(1.0)
    .sub(smoothstep(2.6, 3.6, abs(cRel.x)))
    .mul(float(1.0).sub(smoothstep(1.6, 2.5, abs(cRel.y))))
    .mul(float(1.0).sub(smoothstep(3.2, 4.8, abs(cRel.z))))
    .toVar();
  const isClearingRing = smoothstep(0.34, 0.64, lum.add(cChroma.mul(0.85))).mul(inRingBox).toVar();
  const ringWave = float(0.5).add(float(0.5).mul(sin(t.mul(2.8).add(cRel.x.mul(1.35)).sub(cRel.y.mul(1.15))))).toVar();

  // Localized upward helical sway on the leaf siphon below the event horizon (outer forest untouched)
  const siphonRad = length(vec2(cWorld.x, cWorld.z.add(9.4))).toVar();
  const inSiphon = float(1.0)
    .sub(smoothstep(0.85, 1.85, siphonRad))
    .mul(smoothstep(-2.45, -1.95, cWorld.y))
    .mul(float(1.0).sub(smoothstep(0.05, 0.55, cWorld.y)))
    .mul(float(1.0).sub(smoothstep(-6.8, -5.6, cWorld.z)))
    .toVar();
  const siphAng = sin(t.mul(2.1).sub(cWorld.y.mul(2.4)).add(seed.mul(3.14))).mul(0.075).mul(inSiphon).mul(wClearingFx).toVar();
  const siphOffW = vec3(
    cos(t.mul(2.5).sub(cWorld.y.mul(3.0))).mul(0.045),
    sin(t.mul(3.2).add(seed.mul(6.283))).mul(0.028).add(0.02),
    sin(t.mul(2.5).sub(cWorld.y.mul(3.0))).mul(0.045),
  )
    .add(cFlow.mul(0.05))
    .mul(inSiphon)
    .mul(wClearingFx);
  const cSiphRot = rotXZ(vec3(cWorld.x, float(0.0), cWorld.z.add(9.4)), siphAng).sub(vec3(cWorld.x, float(0.0), cWorld.z.add(9.4)));
  posL.assign(posL.add(siphOffW.add(cSiphRot).div(max(uFxScale, 0.05))));

  // Subtle magenta reflection shimmer on the wet foreground stream synchronized to the rings
  const inStream = float(1.0)
    .sub(smoothstep(-0.95, -0.55, cWorld.y))
    .mul(smoothstep(-5.6, -4.0, cWorld.z))
    .mul(float(1.0).sub(smoothstep(0.65, 1.35, abs(cWorld.x))))
    .mul(smoothstep(0.10, 0.28, cChroma))
    .toVar();
  const streamShimmer = float(0.5).add(float(0.5).mul(sin(t.mul(2.8).add(cWorld.z.mul(2.2)))));

  const clearingBoost = float(1.0)
    .add(isClearingRing.mul(ringWave.mul(0.32).add(0.08)).mul(wClearingFx))
    .add(inStream.mul(streamShimmer.mul(0.18)).mul(wClearingFx));
  const sharpSrgbMask = max(uClearingLive, uForestSing);
  const clearingSrgb = pow(max(rgb.mul(clearingBoost), vec3(0.0001)), vec3(1.0 / 2.2));
  rgb.assign(mix(rgb, clearingSrgb, sharpSrgbMask));

  // ── 9. Counter-Parallax Elastic Wave Neon Tokyo Dream (Foreground vs Background Shear) ─
  const wPos = uFxCenter.add(posL.mul(uFxScale)).toVar();
  const hAboveFloor = wPos.y.sub(uFloorY).toVar();
  const chroma = max(baseRgb.r, max(baseRgb.g, baseRgb.b)).sub(min(baseRgb.r, min(baseRgb.g, baseRgb.b))).toVar();
  const isCompact = float(1).sub(smoothstep(0.05, 0.16, length(baseScales))).toVar();
  const isStreet = float(1).sub(smoothstep(0.02, 0.35, hAboveFloor)).toVar();
  const isSignZone = smoothstep(0.16, 0.45, hAboveFloor).mul(float(1).sub(smoothstep(2.0, 3.2, hAboveFloor))).mul(isCompact).toVar();
  const isHighSky = smoothstep(2.0, 4.4, hAboveFloor).toVar();
  const isFarCorridor = float(1).sub(smoothstep(-7.8, -2.2, wPos.z)).toVar();

  const twistAmt = uTokyo.mul(uTwist).toVar();
  const camDepth = max(uCamPos.z.sub(wPos.z), float(0.0)).toVar();
  // Opposing depth-layer parallax: foreground tilts CCW while deep corridor twists CW + elastic depth wave
  const fgLayer = float(1.0).sub(smoothstep(0.8, 2.9, camDepth));
  const bgLayer = smoothstep(2.1, 6.6, camDepth);
  const depthWave = sin(camDepth.mul(0.75).sub(t.mul(2.3))).mul(0.20).mul(smoothstep(1.0, 3.2, camDepth));
  const twistAng = twistAmt.mul(bgLayer.mul(0.56).sub(fgLayer.mul(0.20)).add(depthWave)).toVar();
  const latParallax = sin(t.mul(1.6).sub(camDepth.mul(0.48))).mul(0.18).mul(twistAmt).mul(bgLayer);
  const vertParallax = cos(t.mul(1.3).sub(camDepth.mul(0.38))).mul(0.08).mul(twistAmt).mul(bgLayer);
  const relXY = vec2(wPos.x, wPos.y.sub(0.32)).toVar();
  const cTw = cos(twistAng).toVar();
  const sTw = sin(twistAng).toVar();
  const twPosW = vec3(
    relXY.x.mul(cTw).sub(relXY.y.mul(sTw)).add(latParallax),
    relXY.x.mul(sTw).add(relXY.y.mul(cTw)).add(0.32).add(vertParallax),
    wPos.z,
  ).toVar();
  const twPosL = twPosW.sub(uFxCenter).div(uFxScale);
  const hasTwist = smoothstep(0.0, 0.001, abs(twistAmt)).toVar();
  posL.assign(mix(posL, twPosL, hasTwist));
  quat.assign(
    mix(quat, GpuSplatMath.quatMul(vec4(0, 0, sin(twistAng.mul(0.5)), cos(twistAng.mul(0.5))), quat), hasTwist),
  );
  const camClipFade = smoothstep(0.45, 1.05, length(mix(wPos, twPosW, hasTwist).sub(uCamPos))).toVar();

  const isEmissive = smoothstep(0.20, 0.52, lum.add(chroma.mul(1.22))).mul(isSignZone).toVar();
  const satSign = mix(vec3(lum), baseRgb, 1.56).toVar();
  const waveZ = mix(float(-0.2), float(-7.2), clamp(age.mul(0.45), 0, 1)).toVar();
  const zWave = exp(pow(wPos.z.sub(waveZ), 2.0).mul(-0.42)).toVar();
  const flicker = float(0.88).add(float(0.12).mul(sin(t.mul(22.0).add(seed.mul(62.83)))));
  const emissiveRgb = satSign.mul(float(1.28).add(zWave.mul(0.40))).mul(flicker);

  const noirWall = pow(max(baseRgb, vec3(0.001)), vec3(1.26)).mul(vec3(0.52, 0.65, 0.82)).toVar();
  const leftWeight = float(1).sub(smoothstep(-0.85, 0.45, wPos.x)).toVar();
  const rightWeight = smoothstep(-0.45, 0.85, wPos.x).toVar();
  const altZ = float(0.5).add(float(0.5).mul(sin(wPos.z.mul(1.15)))).toVar();
  const leftBounce = mix(vec3(0.10, 0.76, 0.96), vec3(0.92, 0.16, 0.56), altZ);
  const rightBounce = mix(vec3(0.10, 0.86, 0.50), vec3(0.98, 0.36, 0.14), float(1.0).sub(altZ));
  const bounceCol = leftBounce.mul(leftWeight).add(rightBounce.mul(rightWeight)).mul(float(1).sub(smoothstep(0.6, 4.5, hAboveFloor))).toVar();

  const puddle = smoothstep(0.30, 0.75, noise3(vec3(wPos.x.mul(2.2), float(0.4), wPos.z.mul(1.4)))).toVar();
  const wallLit = mix(
    noirWall
      .add(bounceCol.mul(float(0.22).add(zWave.mul(0.26))))
      .add(vec3(0.03, 0.09, 0.15).mul(isFarCorridor.mul(0.42))),
    baseRgb.mul(vec3(0.06, 0.18, 0.24)),
    isHighSky.mul(0.88),
  );
  const streetLit = noirWall.mul(0.72).add(bounceCol.mul(puddle.mul(0.56).add(0.18)).mul(float(0.76).add(zWave.mul(0.44))));
  const baseTokyo = mix(mix(wallLit, streetLit, isStreet), emissiveRgb, isEmissive);

  const twinkleA = pow(float(0.5).add(sin(t.mul(14.0).add(seed.mul(94.2))).mul(0.5)), 8.0);
  const twinkleB = pow(float(0.5).add(sin(t.mul(23.0).add(seedB.mul(125.6))).mul(0.5)), 10.0);
  const twinkleMask = max(twinkleA, twinkleB)
    .mul(smoothstep(0.14, 0.64, lum.add(chroma.mul(0.85)).add(isStreet.mul(puddle).mul(0.42))))
    .mul(float(1).sub(isHighSky.mul(0.92)))
    .mul(isCompact)
    .toVar();
  const rainDrop = vec3(0, float(-1).mul(fract(age.mul(0.55).add(seed))).mul(0.08), 0)
    .mul(smoothstep(0.968, 0.995, seed))
    .mul(wTokyo);
  posL.assign(posL.add(cFlow.mul(0.055).mul(wTokyo)).add(rainDrop));

  const tokyoRgb = baseTokyo.add(mix(satSign, vec3(1.45, 1.42, 1.38), 0.55).mul(twinkleMask.mul(1.42)));
  rgb.assign(mix(rgb, tokyoRgb, wTokyo));

  const tinyRad = clamp(length(baseScales).mul(0.115), float(0.0014), float(0.0048)).toVar();
  const pinpointMix = clamp(float(0.94).sub(isHighSky.mul(0.80)), 0, 1);
  const tokyoScale = mix(scales.mul(mix(vec3(1), vec3(1.22), isHighSky)), vec3(tinyRad), pinpointMix);
  scales.assign(mix(scales, tokyoScale, wTokyo));
  opacity.assign(
    opacity
      .mul(mix(float(1), camClipFade, wTokyo))
      .mul(mix(float(1), clamp(mix(mix(float(0.58), float(0.84), isStreet), float(0.96), isEmissive).add(twinkleMask.mul(0.28)), 0.10, 1.0), wTokyo)),
  );

  out.get("center").assign(uFxCenter.add(posL.mul(uFxScale)));
  out.get("scales").assign(scales);
  out.get("rgb").assign(clamp(rgb, vec3(0), vec3(2.2)));
  out.get("opacity").assign(clamp(opacity, 0, 1));
  out.get("quaternion").assign(quat);
  return out;
};

// ── Dual-World Dimensional Wormhole Modifiers (Forest Clearing × Alien Dimension Fly-Through) ──
const evalWormholePortalField = (pWorld: TslNode) => {
  const t = uTime;
  const age = uFxAge;
  const wAmt = uSingularity.mul(uFxMix).toVar();
  const prog = clamp(age.mul(0.32), 0.0, 1.0).toVar();
  // Gravity distortion leads first, then the chaotic dimensional aperture rips open inside it
  const gravAmt = smoothstep(0.0, 0.36, prog).mul(wAmt).toVar();
  const openAmt = smoothstep(0.06, 0.58, prog).mul(wAmt).toVar();

  const bhPos = uFxCenter.toVar();
  const baseR = float(0.92).toVar();
  // Signed forward distance along portal axis (-Z): stays strictly monotonic as camera flies THROUGH portal!
  const signedDist = uCamPos.z.sub(bhPos.z).toVar();
  const bhD = max(signedDist, float(0.35)).toVar();
  // Smooth traversal progress: 0 while viewing from forest -> 1 once crossing the dimensional membrane
  const crossedAmt = smoothstep(2.55, 0.45, signedDist).mul(openAmt).toVar();
  const forestPassFade = smoothstep(0.28, 1.85, signedDist).toVar();
  const throatPeak = sin(crossedAmt.mul(3.14159265)).mul(openAmt).toVar();

  // Stable portal-plane basis (never flips sign when camera crosses z = bhPos.z)
  const rawRay = bhPos.sub(uCamPos).toVar();
  const rawLen = max(length(rawRay), 0.1);
  const camToBhFwd = rawRay.div(rawLen);
  const fwd = normalize(mix(vec3(0.0, 0.0, -1.0), camToBhFwd, smoothstep(0.5, 2.2, signedDist))).toVar();
  const pRight = normalize(cross(fwd, vec3(0.0, 1.0, 0.0))).toVar();
  const pUp = normalize(cross(pRight, fwd)).toVar();

  const ray = pWorld.sub(uCamPos).toVar();
  const sD = dot(ray, fwd).toVar();
  const scaleToPortal = bhD.div(max(sD, 0.25)).toVar();
  const proj3 = uCamPos.add(ray.mul(scaleToPortal)).sub(bhPos).toVar();
  const px = dot(proj3, pRight).toVar();
  const py = dot(proj3, pUp).toVar();
  const r = length(vec2(px, py)).add(0.0005).toVar();
  const dir2 = vec2(px, py).div(r).toVar();
  const tan2 = vec2(dir2.y.negate(), dir2.x).toVar();
  const radDir3 = pRight.mul(dir2.x).add(pUp.mul(dir2.y)).toVar();
  const tanDir3 = pRight.mul(tan2.x).add(pUp.mul(tan2.y)).toVar();

  // Seamless 3-octave boiling chaotic gravitational tear contour (organic, ragged, unstable)
  const n1 = fbm3(vec3(dir2.x.mul(2.1), dir2.y.mul(2.1), t.mul(0.45))).toVar();
  const n2 = fbm3(vec3(dir2.x.mul(5.2).add(11.7), dir2.y.mul(5.2).sub(5.3), t.mul(-1.05))).toVar();
  const n3 = noise3(vec3(dir2.x.mul(11.5).sub(t.mul(2.0)), dir2.y.mul(11.5).add(t.mul(1.5)), t.mul(0.95))).toVar();
  const ellip = mix(float(1.0), float(1.22), dir2.y.mul(dir2.y));
  const chaosMod = float(1.0)
    .add(n1.sub(0.5).mul(0.58))
    .add(n2.sub(0.5).mul(0.36))
    .add(n3.sub(0.5).mul(0.20))
    .toVar();
  // Portal widens slightly as camera rushes into the throat so chaotic edges sweep cleanly past the lens
  const rEdge = baseR.mul(ellip).mul(chaosMod).mul(openAmt).mul(float(1.0).add(crossedAmt.mul(0.65))).toVar();

  return {
    t,
    age,
    gravAmt,
    openAmt,
    crossedAmt,
    forestPassFade,
    throatPeak,
    bhPos,
    baseR,
    bhD,
    fwd,
    sD,
    scaleToPortal,
    r,
    dir2,
    tan2,
    radDir3,
    tanDir3,
    n1,
    n2,
    n3,
    rEdge,
  };
};

const forestPortalOutModifier: SplatModifier = (splat) => {
  const out = splat.toVar();
  const pObj = splat.get("center").toVar();
  const scales = splat.get("scales").toVar();
  const quat = splat.get("quaternion").toVar();
  const baseRgb = splat.get("rgb").toVar();
  const opacity = splat.get("opacity").toVar();

  // Forest objectToWorld is Rx(180deg): (x, y, z)_world = (x, -y, -z)_obj
  const pWorld = vec3(pObj.x, pObj.y.negate(), pObj.z.negate()).toVar();
  const f = evalWormholePortalField(pWorld);
  const lum = dot(baseRgb, vec3(0.299, 0.587, 0.114)).toVar();
  const seed = hash31(pObj.mul(43.7).add(vec3(7.1, 13.9, 29.3))).toVar();
  const h3 = hash33(pObj.mul(59.3).add(vec3(19.3, 41.7, 3.1))).toVar();

  // Foreground forest (framing trunks, arch, sapling, ferns, creek) stays intact IN FRONT of portal until crossing
  const isBehindPlane = smoothstep(f.bhD.sub(0.55), f.bhD.add(0.45), f.sD).toVar();
  const hasPortal = smoothstep(0.01, 0.08, f.openAmt).toVar();
  // Prevent near-camera pop when foreground ferns/branches whoosh past the lens during the fly-through
  const nearCamFade = smoothstep(0.42, 1.15, length(pWorld.sub(uCamPos))).toVar();

  // Strong, realistic gravitational lensing + frame-dragging turbulence bending conifers around the chaotic tear
  const lensRefR = max(f.rEdge, f.baseR.mul(0.36).mul(f.gravAmt));
  const einR = sqrt(f.r.mul(f.r).add(lensRefR.mul(lensRefR).mul(1.12)));
  const lensFalloff = exp(pow(f.r.div(max(f.baseR.mul(2.75), 0.05)), 1.9).negate());
  const lensDeltaR = einR.sub(f.r).mul(lensFalloff).mul(isBehindPlane).mul(f.gravAmt);
  const shearZone = exp(pow(max(f.r.sub(f.rEdge), 0.0).div(max(f.baseR.mul(0.95), 0.05)), 1.35).negate())
    .mul(isBehindPlane)
    .mul(f.gravAmt)
    .toVar();
  const curlTurb = curl3(pWorld.mul(0.55).add(vec3(0.0, f.t.mul(0.50), f.t.mul(-0.40)))).toVar();
  const shearSwirl = f.tanDir3.mul(shearZone.mul(float(0.48).add(f.n2.sub(0.32).mul(0.72))));
  const invScale = float(1.0).div(max(f.scaleToPortal, 0.14));
  // Strong outward gravitational slingshot rush on peripheral forest splats as camera launches into the throat
  const throatRush = f.radDir3.mul(f.throatPeak.mul(1.35)).add(f.tanDir3.mul(f.throatPeak.mul(0.68)));
  const warpedWorld = pWorld
    .add(f.radDir3.mul(lensDeltaR.mul(invScale)))
    .add(shearSwirl.mul(invScale))
    .add(curlTurb.mul(shearZone.mul(0.56)))
    .add(throatRush.mul(isBehindPlane))
    .toVar();

  // Real forest splats tearing off near the jagged rim & tangentially spaghettifying into curved orbital wisps
  const inTearZone = smoothstep(f.rEdge.mul(0.84), f.rEdge.mul(1.06), f.r)
    .mul(float(1.0).sub(smoothstep(f.rEdge.mul(1.15), f.rEdge.mul(2.15), f.r)))
    .mul(isBehindPlane)
    .mul(f.gravAmt)
    .toVar();
  const isDebris = seed.lessThan(0.14);
  const debAct = select(isDebris, inTearZone, float(0.0)).toVar();
  const debPhase = fract(f.age.mul(0.36).add(h3.x)).toVar();
  const debSwirl = debPhase.mul(debPhase).mul(3.4).add(f.n2.mul(1.2)).mul(debAct).toVar();
  const debPull = mix(float(1.0), float(0.80), pow(max(debPhase, 0.001), 1.4)).toVar();
  const debOff = f.radDir3
    .mul(f.r.mul(debPull.sub(1.0)).mul(invScale))
    .add(f.tanDir3.mul(debSwirl.mul(0.34).mul(invScale)))
    .add(curlTurb.mul(debPhase.mul(0.42)));
  const finalWorld = mix(warpedWorld, pWorld.add(debOff), debAct).toVar();

  // Align torn debris splats tangentially around the chaotic rim (curved orbital streaks, never vertical spikes!)
  const debDirObj = normalize(vec3(f.tanDir3.x, f.tanDir3.y.negate(), f.tanDir3.z.negate())).toVar();
  const fwdObj = normalize(vec3(f.fwd.x, f.fwd.y.negate(), f.fwd.z.negate())).toVar();
  const debYObj = normalize(cross(fwdObj, debDirObj).add(vec3(0.0, 1e-5, 0.0)));
  const debZObj = normalize(cross(debDirObj, debYObj));
  const debQuat = basisToQuat(debDirObj, debYObj, debZObj);
  const debQuatAligned = select(dot(quat, debQuat).lessThan(0.0), debQuat.negate(), debQuat);
  const finalQuat = normalize(mix(quat, debQuatAligned, debAct));
  const isoS = clamp(length(scales).mul(0.55), float(0.006), float(0.045));
  const debScale = mix(scales, vec3(isoS.mul(3.4), isoS.mul(0.42), isoS.mul(0.42)), debAct);
  const debFade = mix(
    float(1.0),
    smoothstep(0.0, 0.14, debPhase).mul(float(1.0).sub(smoothstep(0.72, 0.98, debPhase))),
    debAct,
  );

  // Carve ragged chaotic portal opening through the background forest (foreground trunks untouched until we cross!)
  const portalCutout = mix(
    float(1.0),
    smoothstep(f.rEdge.mul(0.86), f.rEdge.mul(1.03), f.r),
    isBehindPlane.mul(hasPortal),
  );

  // Subtle photorealistic spacetime refraction: dark gravitational distortion shadows + hairline golden/cyan caustics
  const rimLip = exp(pow(f.r.sub(f.rEdge.mul(1.03)).div(max(f.baseR.mul(0.12), 0.02)), 2.0).negate())
    .mul(isBehindPlane)
    .mul(f.gravAmt)
    .toVar();
  const causticGlint = pow(clamp(f.n2.mul(1.18).add(f.n3.mul(0.25)), 0.0, 1.0), 3.4).toVar();
  const gravShadow = mix(float(1.0), float(0.24), rimLip.mul(float(0.85).sub(causticGlint.mul(0.65))));
  const rimRefractCol = mix(vec3(0.32, 0.72, 1.05), vec3(1.18, 0.80, 0.42), smoothstep(0.30, 0.75, f.n1))
    .mul(causticGlint)
    .mul(rimLip)
    .mul(0.42);

  // Warm alien sunlight spilling subtly out of the canyon onto damp forest mist, nearby trunks & creek
  const dist3 = length(pWorld.sub(f.bhPos)).toVar();
  const portalSpill = exp(pow(dist3.div(4.6), 2.0).negate()).mul(f.openAmt).toVar();
  const innerRimBounce = exp(pow(f.r.div(max(f.baseR.mul(2.0), 0.1)), 2.0).negate())
    .mul(smoothstep(-1.5, -5.8, pWorld.z))
    .mul(f.openAmt);
  const inCreek = float(1.0)
    .sub(smoothstep(-0.88, -0.58, pWorld.y))
    .mul(smoothstep(-5.8, -3.8, pWorld.z))
    .mul(float(1.0).sub(smoothstep(0.42, 0.95, abs(pWorld.x.add(0.02)))))
    .toVar();
  const creekWave = float(0.45).add(float(0.55).mul(sin(f.t.mul(3.2).add(pWorld.z.mul(6.8)).add(pWorld.x.mul(4.5)))));
  const creekRefl = vec3(0.92, 0.58, 0.26)
    .mul(inCreek)
    .mul(smoothstep(0.10, 0.42, lum))
    .mul(creekWave)
    .mul(f.openAmt)
    .mul(0.55);

  const litForest = baseRgb
    .mul(gravShadow)
    .add(vec3(0.88, 0.52, 0.22).mul(portalSpill.mul(0.18).add(innerRimBounce.mul(0.16))))
    .add(rimRefractCol)
    .add(vec3(0.95, 0.68, 0.40).mul(debAct.mul(smoothstep(0.55, 0.92, debPhase)).mul(0.28)))
    .add(creekRefl);

  const srgbForest = pow(max(litForest, vec3(0.0001)), vec3(1.0 / 2.2));
  out.get("center").assign(vec3(finalWorld.x, finalWorld.y.negate(), finalWorld.z.negate()));
  out.get("scales").assign(debScale);
  out.get("rgb").assign(clamp(srgbForest, vec3(0), vec3(1.8)));
  out.get("opacity").assign(clamp(opacity.mul(portalCutout).mul(debFade).mul(nearCamFade).mul(f.forestPassFade), 0, 1));
  out.get("quaternion").assign(finalQuat);
  return out;
};

// Native SHARP sweet-spot origin of alien-dimension.spz sits RIGHT at the portal exit (0.14, 0.92, -6.0)!
const ALIEN_OFFSET = new THREE.Vector3(0.14, 0.92, -6.0);
const ALIEN_SCALE = 1.0;

const alienPortalInModifier: SplatModifier = (splat) => {
  const out = splat.toVar();
  const pObj = splat.get("center").toVar();
  const scales = splat.get("scales").toVar();
  const quat = splat.get("quaternion").toVar();
  const baseRgb = splat.get("rgb").toVar();
  const opacity = splat.get("opacity").toVar();

  // Alien objectToWorld is Translate(0.14, 0.92, -6.0) * Scale(1.0) * Rx(180deg)
  const pWorld = vec3(
    pObj.x.mul(ALIEN_SCALE).add(ALIEN_OFFSET.x),
    pObj.y.negate().mul(ALIEN_SCALE).add(ALIEN_OFFSET.y),
    pObj.z.negate().mul(ALIEN_SCALE).add(ALIEN_OFFSET.z),
  ).toVar();

  const f = evalWormholePortalField(pWorld);
  const seed = hash31(pObj.mul(37.3).add(vec3(11.1, 5.7, 23.9))).toVar();

  // While viewing from the forest: strictly behind portal plane & inside chaotic aperture.
  // As camera crosses through the throat (crossedAmt -> 1): smoothly relaxes to FULL-SCREEN alien world!
  const behindPortalRaw = smoothstep(f.bhD.add(0.20), f.bhD.add(1.65), f.sD);
  const behindPortal = mix(behindPortalRaw, float(1.0), f.crossedAmt).toVar();
  const inApertureRaw = float(1.0)
    .sub(smoothstep(f.rEdge.mul(0.84), f.rEdge.mul(1.03), f.r))
    .mul(smoothstep(0.02, 0.14, f.openAmt));
  const inAperture = mix(inApertureRaw, smoothstep(0.02, 0.14, f.openAmt), f.crossedAmt).toVar();

  // Inner wormhole throat distortion eases smoothly away as we emerge into the alien dimension
  const rimNorm = clamp(f.r.div(max(f.rEdge, 0.05)), 0.0, 1.2).toVar();
  const rimIn = smoothstep(0.55, 1.0, rimNorm).toVar();
  const throatAmt = float(1.0).sub(f.crossedAmt).toVar();
  const throatWarp = rimIn.mul(rimIn).mul(f.openAmt).mul(throatAmt).toVar();
  const invScale = float(1.0).div(max(f.scaleToPortal, 0.14));
  const curlIn = curl3(pWorld.mul(0.48).add(vec3(f.t.mul(0.38), 0.0, f.t.mul(-0.48))));

  // Subtle living golden desert dust/ember drift once inside the alien canyon
  const isDust = select(seed.greaterThan(0.955), f.crossedAmt, float(0.0));
  const dustDrift = curlIn.mul(0.08).add(vec3(0.03, 0.015, 0.0).mul(sin(f.t.mul(1.4).add(seed.mul(30.0))))).mul(isDust);

  const warpedWorld = pWorld
    .add(f.radDir3.mul(throatWarp.mul(f.baseR.mul(0.28)).mul(invScale)))
    .add(f.tanDir3.mul(throatWarp.mul(f.n1.sub(0.35).mul(0.42)).mul(invScale)))
    .add(curlIn.mul(throatWarp.mul(0.32)))
    .add(dustDrift)
    .toVar();

  // Realistic refractive throat shading while outside; pure IMAX alien sunlight once crossed inside!
  const throatVig = mix(float(1.0), float(0.45), pow(rimIn, 2.2).mul(throatAmt));
  const innerCaustic = pow(rimIn, 3.6).mul(pow(clamp(f.n2.mul(1.15), 0.0, 1.0), 2.4)).mul(f.openAmt).mul(throatAmt);
  const throatGlow = mix(vec3(1.15, 0.78, 0.40), vec3(0.42, 0.80, 1.15), smoothstep(0.42, 0.82, f.n3)).mul(
    innerCaustic.mul(0.42),
  );
  // Subtle warm crossing flash as we pass right through the gravitational membrane
  const crossFlash = vec3(0.24, 0.16, 0.08).mul(f.throatPeak.mul(0.45));
  const alienCol = baseRgb.mul(throatVig).add(throatGlow).add(crossFlash);
  const srgbAlien = pow(max(alienCol, vec3(0.0001)), vec3(1.0 / 2.2));
  const nearCamAlien = smoothstep(0.35, 0.95, length(warpedWorld.sub(uCamPos)));

  const pObjOut = vec3(
    warpedWorld.x.sub(ALIEN_OFFSET.x).div(ALIEN_SCALE),
    warpedWorld.y.sub(ALIEN_OFFSET.y).div(-ALIEN_SCALE),
    warpedWorld.z.sub(ALIEN_OFFSET.z).div(-ALIEN_SCALE),
  );
  out.get("center").assign(pObjOut);
  out.get("scales").assign(scales);
  out.get("rgb").assign(clamp(srgbAlien, vec3(0), vec3(1.8)));
  out.get("opacity").assign(clamp(opacity.mul(behindPortal).mul(inAperture).mul(nearCamAlien), 0, 1));
  out.get("quaternion").assign(quat);
  return out;
};

function scanRotation(up?: [number, number, number]): THREE.Quaternion {
  const flip = new THREE.Quaternion(1, 0, 0, 0);
  if (!up) {
    return flip;
  }
  return new THREE.Quaternion()
    .setFromUnitVectors(new THREE.Vector3(...up).normalize(), new THREE.Vector3(0, 1, 0))
    .multiply(flip);
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

const model = new THREE.Object3D();
model.matrixAutoUpdate = false;
scene.add(model);

const splatRenderer = new SplatRenderer({
  renderer,
  collection: SplatCollection.EMPTY,
  modifier: fxModifier,
  modifierSpace: "world",
});
scene.add(splatRenderer);

const customUrl = params.get("url");
const initialSceneParam = params.get("scene");
const defaultScene: SceneId =
  initialSceneParam && initialSceneParam in SCENES
    ? (initialSceneParam as SceneId)
    : isCinema
      ? "stump"
      : "stump";

let activeSceneId: SceneId = defaultScene;
let activeMode: FxMode = "shockwave";
let currentDataCount = 0;
let currentShDegree = 0;
let currentLayout: SplatLayout = SCENES[activeSceneId].layout;
let manualControl = isCinema;
let activeMpm: MpmPlayback | null = null;

const targetWeights = [...MODES.shockwave.weights];
let targetRoll = MODES.shockwave.roll;
let currentRoll = 0;

let drawnFrames = 0;
let sceneSwapResolve: (() => void) | null = null;
let sceneSwapTargetFrame = 0;

const modeUniforms = [uShock, uDissolve, uNeon, uGeo, uVortex, uMpmShader, uVoxel, uSingularity, uTokyo];

function applySceneParams(meta: SceneMeta) {
  uFxCenter.value.set(meta.fxCenter[0], meta.fxCenter[1], meta.fxCenter[2]);
  uFxScale.value = meta.fxScale;
  uFloorY.value = meta.floorY;
  uOuterFade.value = meta.placement === "normalized" ? 1.0 : 0.0;
  uClearingLive.value = activeSceneId === "singularity_clearing" ? 1.0 : 0.0;
  uForestSing.value = activeSceneId === "forest_clearing" ? 1.0 : 0.0;

  splatRenderer.objectParams.blurAmount = meta.preBlur ? 0 : 0.3;
  splatRenderer.objectParams.preBlurAmount = meta.preBlur ? 0.3 : 0;

  scene.background = meta.sky
    ? activeSceneId === "ruin_archway"
      ? getMistyForestSkyTexture()
      : getSkyTexture()
    : BLACK_BG;

  camera.fov = meta.fov;
  camera.updateProjectionMatrix();
  camera.position.set(meta.viewPos[0], meta.viewPos[1], meta.viewPos[2]);
  controls.lookAt(new THREE.Vector3(meta.viewTarget[0], meta.viewTarget[1], meta.viewTarget[2]));
}

function updateHud() {
  const modeMeta = MODES[activeMode];
  const sceneMeta = SCENES[activeSceneId];
  const srcLabel = customUrl ? customUrl : sceneMeta.sourceTag;
  const shTag = activeMpm ? " · CUDA MPM" : currentShDegree > 0 ? ` · SH${currentShDegree}` : "";
  kickerEl.textContent = `@SPARKJSDEV/RADIX · ${backendName.toUpperCase()} · ${sceneMeta.label.toUpperCase()}${shTag}`;
  titleEl.textContent = modeMeta.title;
  subEl.textContent = `${currentDataCount.toLocaleString()} Gaussians (${srcLabel}) · ${modeMeta.subtitle}`;
  statusEl.textContent = `${backendName.toUpperCase()} · ${sceneMeta.label} · ${currentDataCount.toLocaleString()} splats${shTag}`;
  for (const btn of modeButtons) {
    btn.classList.toggle("active", btn.dataset.mode === activeMode);
  }
  for (const btn of sceneButtons) {
    btn.classList.toggle("active", btn.dataset.scene === activeSceneId);
  }
}

function setMode(next: FxMode) {
  activeMode = next;
  uFxAge.value = 0;
  uFxMix.value = 1;
  if (window.artifactureFx) {
    window.artifactureFx.mode = next;
  }
  const mm = MODES[next];
  for (let i = 0; i < 9; i += 1) {
    targetWeights[i] = mm.weights[i];
  }
  targetRoll = mm.roll;
  updateHud();
}

async function loadAndBindScene(
  id: SceneId,
  overrides?: { url?: string; layout?: SplatLayout; sh?: ShTarget },
): Promise<void> {
  const meta = SCENES[id];
  const url = overrides?.url ?? meta.url;
  const layout = overrides?.layout ?? meta.layout;
  const sh = overrides?.sh ?? meta.sh;

  for (const btn of sceneButtons) btn.disabled = true;
  statusEl.textContent = `Loading ${meta.label} (${backendName})...`;

  try {
    splatRenderer.collection = SplatCollection.EMPTY;
    if (activeMpm) {
      activeMpm.dispose();
      activeMpm = null;
    }
    if (manualControl) {
      pipeline.render();
    }

    if (meta.placement === "mpm") {
      const mpm = await MpmPlayback.load(renderer, url, meta.flipX, meta.up);
      activeMpm = mpm;
      activeSceneId = id;
      currentDataCount = mpm.header.numParticles;
      currentLayout = "extSplats";
      currentShDegree = 0;

      // Disable TSL modifier distortion when displaying pre-computed CUDA MPM trajectories
      splatRenderer.modifier = undefined;
      splatRenderer.collection = mpm.collection;

      const mid = mpm.header.boundsMin.clone().add(mpm.header.boundsMax).multiplyScalar(0.5);
      applySceneParams({
        ...meta,
        viewTarget: [mid.x, mid.y, mid.z],
        viewPos: [mid.x - 0.72, mid.y + 0.48, mid.z + 0.72],
      });

      if (window.artifactureFx) {
        window.artifactureFx.sceneId = id;
        window.artifactureFx.splatCount = currentDataCount;
        window.artifactureFx.shDegree = 0;
        window.artifactureFx.layout = "extSplats";
        window.artifactureFx.mpmBoundsMin = [mpm.header.boundsMin.x, mpm.header.boundsMin.y, mpm.header.boundsMin.z];
        window.artifactureFx.mpmBoundsMax = [mpm.header.boundsMax.x, mpm.header.boundsMax.y, mpm.header.boundsMax.z];
        window.artifactureFx.mpmFloorY = mpm.header.floorY;
        window.artifactureFx.mpmDurationSec = mpm.durationSec;
      }
      setMode("mpm");
    } else if (id === "forest_clearing") {
      splatRenderer.modifier = undefined;
      const [forestLoaded, alienLoaded] = await Promise.all([
        loadSplatFile(url, { name: url, worker: true, layout, sh }),
        loadSplatFile("./assets/alien-dimension.spz", { name: "./assets/alien-dimension.spz", worker: true, layout, sh }),
      ]);
      const forestFit = new THREE.Matrix4().makeRotationFromQuaternion(scanRotation(meta.up));
      const alienFit = new THREE.Matrix4()
        .makeTranslation(ALIEN_OFFSET.x, ALIEN_OFFSET.y, ALIEN_OFFSET.z)
        .multiply(new THREE.Matrix4().makeScale(ALIEN_SCALE, ALIEN_SCALE, ALIEN_SCALE))
        .multiply(new THREE.Matrix4().makeRotationFromQuaternion(scanRotation(undefined)));

      const forestArrays = GpuArrays.fromData(renderer, forestLoaded.splats);
      const alienArrays = GpuArrays.fromData(renderer, alienLoaded.splats);
      const forestGen = SplatGenerator.forArrays(forestArrays, { sh: false, modifiers: [forestPortalOutModifier] });
      const alienGen = SplatGenerator.forArrays(alienArrays, { sh: false, modifiers: [alienPortalInModifier] });

      activeSceneId = id;
      currentDataCount = forestLoaded.splats.count + alienLoaded.splats.count;
      currentLayout = layout;
      currentShDegree = 0;

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

      applySceneParams(meta);

      if (window.artifactureFx) {
        window.artifactureFx.sceneId = id;
        window.artifactureFx.splatCount = currentDataCount;
        window.artifactureFx.shDegree = 0;
        window.artifactureFx.layout = layout;
        window.artifactureFx.fxCenter = [...meta.fxCenter];
        window.artifactureFx.fxScale = meta.fxScale;
        window.artifactureFx.floorY = meta.floorY;
        window.artifactureFx.mpmBoundsMin = undefined;
        window.artifactureFx.mpmBoundsMax = undefined;
        window.artifactureFx.mpmFloorY = undefined;
        window.artifactureFx.mpmDurationSec = undefined;
      }
      updateHud();
    } else {
      splatRenderer.modifier = fxModifier;
      const loaded = await loadSplatFile(url, { name: url, worker: true, layout, sh });
      const fit =
        meta.placement === "catalog"
          ? new THREE.Matrix4().makeRotationFromQuaternion(
              meta.flipX ? scanRotation(meta.up) : new THREE.Quaternion(),
            )
          : computeFitMatrix(loaded.splats, meta.flipX, meta.targetSpan);

      const fileArrays = GpuArrays.fromData(renderer, loaded.splats);
      const paletteArrays = loaded.shPalette && GpuShPalette.upload(renderer, loaded.shPalette);
      const release = () => {
        fileArrays.dispose();
        paletteArrays?.dispose();
      };

      activeSceneId = id;
      currentDataCount = loaded.splats.count;
      currentLayout = layout;
      currentShDegree = Sh.find(loaded.splats.bundles)?.degree ?? loaded.shPalette?.degree ?? 0;

      model.matrix.copy(fit);
      model.matrixWorld.copy(fit);
      splatRenderer.collection = new SplatCollection([
        SplatCollection.arrays(fileArrays, { matrixWorld: model.matrixWorld, shPalette: paletteArrays, release }),
      ]);

      applySceneParams(meta);

      if (window.artifactureFx) {
        window.artifactureFx.sceneId = id;
        window.artifactureFx.splatCount = currentDataCount;
        window.artifactureFx.shDegree = currentShDegree;
        window.artifactureFx.layout = layout;
        window.artifactureFx.fxCenter = [...meta.fxCenter];
        window.artifactureFx.fxScale = meta.fxScale;
        window.artifactureFx.floorY = meta.floorY;
        window.artifactureFx.mpmBoundsMin = undefined;
        window.artifactureFx.mpmBoundsMax = undefined;
        window.artifactureFx.mpmFloorY = undefined;
        window.artifactureFx.mpmDurationSec = undefined;
      }
      updateHud();
    }

    if (manualControl) {
      uFxMix.value = 0;
      uTwist.value = 0;
      if (splatRenderer.sortMode === "cpu") {
        splatRenderer.requestSort();
      }
      updateBloomForMode(activeMode, 0);
      pipeline.render();
      pipeline.render();
    } else {
      await new Promise<void>((resolve) => {
        sceneSwapTargetFrame = drawnFrames + 4;
        sceneSwapResolve = resolve;
      });
    }
  } finally {
    for (const btn of sceneButtons) btn.disabled = false;
  }
}

const camUpAxis = new THREE.Vector3();
const camForwardAxis = new THREE.Vector3();
const lookTarget = new THREE.Vector3(0, 0, 0);

function applyCameraPose(
  pos: [number, number, number],
  target: [number, number, number],
  rollRad: number,
  fovDeg: number,
) {
  if (Math.abs(camera.fov - fovDeg) > 1e-3) {
    camera.fov = fovDeg;
    camera.updateProjectionMatrix();
  }
  camera.position.set(pos[0], pos[1], pos[2]);
  lookTarget.set(target[0], target[1], target[2]);
  camForwardAxis.subVectors(lookTarget, camera.position).normalize();
  camUpAxis.set(0, 1, 0).applyAxisAngle(camForwardAxis, rollRad);
  camera.up.copy(camUpAxis);
  camera.lookAt(lookTarget);
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function renderFrame(opts: RenderFrameOptions): Promise<void> {
  manualControl = true;
  uTime.value = opts.time;
  uFxAge.value = opts.fxAge;
  uFxMix.value = opts.fxMix;
  uTwist.value = opts.twist ?? 0;

  const meta = SCENES[activeSceneId];
  const center = opts.fxCenter ?? meta.fxCenter;
  const scale = opts.fxScale ?? meta.fxScale;
  const floorY = opts.floorY ?? meta.floorY;
  uFxCenter.value.set(center[0], center[1], center[2]);
  uFxScale.value = scale;
  uFloorY.value = floorY;

  if (activeMpm) {
    activeMpm.setTime(opts.mpmTimeSec ?? opts.fxAge);
  }

  const mm = MODES[opts.mode];
  activeMode = opts.mode;
  for (let i = 0; i < 9; i += 1) {
    modeUniforms[i].value = mm.weights[i];
    targetWeights[i] = mm.weights[i];
  }

  scene.background =
    (opts.skyFade ?? (meta.sky ? 1 : 0)) >= 0.5
      ? activeSceneId === "ruin_archway"
        ? getMistyForestSkyTexture()
        : getSkyTexture()
      : BLACK_BG;

  applyCameraPose(opts.camPos, opts.camTarget, opts.camRoll ?? 0, opts.fov ?? meta.fov);
  uCamPos.value.copy(camera.position);

  if (opts.caption) {
    cinemaKickerEl.textContent = opts.caption.kicker ?? "";
    cinemaTitleEl.textContent = opts.caption.title ?? "";
    cinemaSubEl.textContent = opts.caption.sub ?? "";
    cinemaCaptionEl.style.opacity = String(opts.caption.opacity ?? 1);
  } else {
    cinemaCaptionEl.style.opacity = "0";
  }

  if (opts.titleCard) {
    cardKickerEl.textContent = opts.titleCard.kicker ?? "";
    cardTitleEl.textContent = opts.titleCard.title ?? "";
    cardSubEl.textContent = opts.titleCard.sub ?? "";
    cinemaTitleCardEl.style.opacity = String(opts.titleCard.opacity ?? 1);
  } else {
    cinemaTitleCardEl.style.opacity = "0";
  }

  const passes = opts.settlePasses ?? 1;
  updateBloomForMode(activeMode, opts.fxMix);
  for (let p = 0; p < passes; p += 1) {
    if (splatRenderer.sortMode === "cpu") {
      splatRenderer.requestSort();
    }
    pipeline.render();
    await nextAnimationFrame();
  }
  await nextAnimationFrame();
}

window.artifactureFx = {
  backend: backendName,
  splatCount: 0,
  shDegree: 0,
  layout: currentLayout,
  sceneId: activeSceneId,
  mode: activeMode,
  fxCenter: [...SCENES[activeSceneId].fxCenter],
  fxScale: SCENES[activeSceneId].fxScale,
  floorY: SCENES[activeSceneId].floorY,
  setMode,
  setScene: (s: SceneId, overrides?: { layout?: SplatLayout; sh?: ShTarget }) =>
    loadAndBindScene(s, overrides),
  renderFrame,
};

for (const btn of modeButtons) {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.mode as FxMode | undefined;
    if (mode === "mpm" && activeSceneId !== "bonsai_mpm") {
      void loadAndBindScene("bonsai_mpm");
      return;
    }
    if (mode && mode in MODES) setMode(mode);
  });
}

for (const btn of sceneButtons) {
  btn.addEventListener("click", () => {
    const sid = btn.dataset.scene as SceneId | undefined;
    if (sid && sid in SCENES) {
      void loadAndBindScene(sid);
    }
  });
}

const MODE_KEYS: Record<string, FxMode> = {
  "1": "shockwave",
  "2": "dissolve",
  "3": "neon",
  "4": "geowave",
  "5": "vortex",
  "6": "mpm",
  "7": "voxel",
  "8": "singularity",
  "9": "tokyo",
};

window.addEventListener("keydown", (ev) => {
  const mode = MODE_KEYS[ev.key];
  if (mode) setMode(mode);
});

let lastMs: number | undefined;

renderer.setAnimationLoop((nowMs) => {
  if (manualControl) {
    return;
  }
  const dt = lastMs === undefined ? 0.016 : Math.min((nowMs - lastMs) / 1000, 0.08);
  lastMs = nowMs;
  uTime.value += dt;
  uFxAge.value += dt;
  uFxMix.value = 1;
  uTwist.value = activeMode === "tokyo" ? 0.5 + 0.5 * Math.sin(uFxAge.value * 0.65) : 0;

  if (activeMpm) {
    activeMpm.setTime(uFxAge.value % activeMpm.durationSec);
  }

  const alpha = Math.min(1, dt * 4.8);
  for (let i = 0; i < 9; i += 1) {
    modeUniforms[i].value += (targetWeights[i] - modeUniforms[i].value) * alpha;
  }
  currentRoll += (targetRoll - currentRoll) * alpha;

  const sm = SCENES[activeSceneId];
  const basePos = new THREE.Vector3(...sm.viewPos);
  const tgt = new THREE.Vector3(...sm.viewTarget);
  if (activeMpm) {
    const min = activeMpm.header.boundsMin;
    const max = activeMpm.header.boundsMax;
    tgt.copy(min).add(max).multiplyScalar(0.5);
    basePos.set(tgt.x - 0.72, tgt.y + 0.48, tgt.z + 0.72);
  }
  const offset = basePos.clone().sub(tgt);
  const orbitAngle = Math.sin(uTime.value * 0.42) * sm.yawAmp;
  offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbitAngle);
  if (activeMode === "tokyo" && activeSceneId === "snow") {
    offset.multiplyScalar(0.86 + Math.sin(uFxAge.value * 0.7) * 0.14);
  }
  const camPos = tgt.clone().add(offset);
  applyCameraPose([camPos.x, camPos.y, camPos.z], [tgt.x, tgt.y, tgt.z], currentRoll, sm.fov);
  uCamPos.value.copy(camera.position);

  if (splatRenderer.sortMode === "cpu") {
    splatRenderer.requestSort();
  }
  updateBloomForMode(activeMode, uFxMix.value);
  pipeline.render();

  drawnFrames += 1;
  if (sceneSwapResolve && drawnFrames >= sceneSwapTargetFrame) {
    const done = sceneSwapResolve;
    sceneSwapResolve = null;
    done();
  }
  if (drawnFrames === 6 && !window.example.ready && currentDataCount > 0) {
    window.example.ready = true;
  }
});

try {
  if (!isCinema || params.get("autoload") === "1" || params.has("scene")) {
    await loadAndBindScene(activeSceneId, customUrl ? { url: customUrl } : undefined);
  } else {
    updateHud();
  }
  window.example.ready = true;
} catch (err) {
  window.example.error = err instanceof Error ? err.message : String(err);
  statusEl.textContent = `Error: ${window.example.error}`;
}

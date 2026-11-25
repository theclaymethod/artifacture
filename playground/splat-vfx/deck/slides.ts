import type { ShTarget, SplatLayout } from "@sparkjsdev/radix";

export type DeckSceneId = "dual_world" | "tokyo_alley" | "buddha" | "grace";
export type DeckFxMode = "none" | "wormhole" | "tokyo" | "dissolve" | "shockwave";
export type SlideLayout = "left" | "bottom-left" | "summary";

export interface SceneAssetSpec {
  id: DeckSceneId;
  label: string;
  url: string;
  secondaryUrl?: string;
  placement: "catalog" | "normalized" | "dual_world";
  layout: SplatLayout;
  sh: ShTarget;
  flipX: boolean;
  preBlur: boolean;
  targetSpan: number;
  fxCenter: [number, number, number];
  fxScale: number;
  floorY: number;
  up?: [number, number, number];
}

export interface SlideMetric {
  label: string;
  value: string;
}

export interface SummaryRow {
  effect: string;
  scene: string;
  splats: string;
  technique: string;
}

export interface SlideSpec {
  id: string;
  scene: DeckSceneId;
  layout: SlideLayout;
  kicker: string;
  title: string;
  lead: string;
  bullets?: string[];
  metrics?: SlideMetric[];
  summaryRows?: SummaryRow[];
  notes: string;
  camera: {
    pos: [number, number, number];
    target: [number, number, number];
    fov: number;
    roll: number;
    driftAmp: [number, number, number];
    driftSpeed: number;
  };
  fx: {
    mode: DeckFxMode;
    mix: number;
    twist: number;
    /** Target shader age (seconds) when static, or loop duration when loopSec > 0 */
    ageStatic?: number;
    /** When > 0, shader age advances continuously from 0..loopSec (or wraps) */
    ageRate?: number;
    loopSec?: number;
    /** Pause duration at start of each loop before advancing age */
    loopLeadSec?: number;
    /** Bloom tuning */
    bloomStrength: number;
    bloomThreshold: number;
    bloomRadius: number;
  };
  /** Continuous transition profile when arriving from the previous slide in the same scene */
  transitionFromPrev?: {
    kind: "glide" | "wormhole-launch" | "tokyo-arc";
    durationSec: number;
  };
}

export const DECK_SCENES: Record<DeckSceneId, SceneAssetSpec> = {
  dual_world: {
    id: "dual_world",
    label: "Dual-World 16:9 3DGS (1.36M · 18.9 MB)",
    url: "./assets/forest-clearing-wide-opt.spz",
    secondaryUrl: "./assets/alien-dimension-wide-opt.spz",
    placement: "dual_world",
    layout: "extSplats",
    sh: false,
    flipX: true,
    preBlur: false,
    targetSpan: 10,
    fxCenter: [0.24, 0.55, -6.2],
    fxScale: 2.2,
    floorY: -1.1,
  },
  tokyo_alley: {
    id: "tokyo_alley",
    label: "Tokyo Neon Alley (400k · 5.7 MB)",
    url: "./assets/tokyo-alley-opt.spz",
    placement: "catalog",
    layout: "extSplats",
    sh: false,
    flipX: true,
    preBlur: false,
    targetSpan: 5.5,
    fxCenter: [0.0, 0.3, -2.5],
    fxScale: 2.2,
    floorY: -1.1,
  },
  buddha: {
    id: "buddha",
    label: "Carved Stone Buddha (240k · 2.9 MB)",
    url: "./assets/buddha-opt.spz",
    placement: "normalized",
    layout: "extSplats",
    sh: false,
    flipX: false,
    preBlur: false,
    targetSpan: 2.25,
    fxCenter: [0.0, 0.0, 0.0],
    fxScale: 1.0,
    floorY: -1.15,
  },
  grace: {
    id: "grace",
    label: "Grace Cathedral (1.56M · 24.1 MB)",
    url: "./assets/grace-cathedral-opt.spz",
    placement: "catalog",
    layout: "extSplats",
    sh: false,
    flipX: true,
    preBlur: false,
    targetSpan: 10,
    fxCenter: [-1.5, 9.5, -3.0],
    fxScale: 24.0,
    floorY: 4.6,
  },
};

export const SLIDES: SlideSpec[] = [
  {
    id: "intro-forest",
    scene: "dual_world",
    layout: "left",
    kicker: "WEBGPU + TSL · @SPARKJSDEV/RADIX",
    title: "Programmable 3D Gaussian Splatting",
    lead:
      "This deck renders live 3D Gaussian splats directly in WebGPU. All five scenes use 3D voxel-density-equalized Morton-sorted SPZ compression (51.5 MB total, 15× smaller than raw captures) so every transition runs smoothly in real-time TSL compute shaders.",
    metrics: [
      { label: "Renderer", value: "Three.js WebGPU + Radix" },
      { label: "Active Scene", value: "1.36M Dual-World · 18.9 MB" },
      { label: "Controls", value: "← → Navigate · O Orbit · R Replay" },
    ],
    notes:
      "Start on the intact blue-hour forest creek clearing. Both the forest (1.18M) and the hidden alien dimension (1.18M) are already mounted inside one GPU SplatCollection. Mention you can press O at any moment to orbit freely and verify it is live 3D geometry.",
    camera: {
      pos: [0.0, 0.0, -0.25],
      target: [0.0, 0.04, -6.2],
      fov: 38.5,
      roll: 0.0,
      driftAmp: [0.03, 0.014, 0.04],
      driftSpeed: 0.35,
    },
    fx: {
      mode: "wormhole",
      mix: 0.0,
      twist: 0.0,
      ageStatic: 0.0,
      bloomStrength: 0.2,
      bloomThreshold: 0.92,
      bloomRadius: 0.25,
    },
  },
  {
    id: "wormhole-rift",
    scene: "dual_world",
    layout: "left",
    kicker: "01 · INTERSTELLAR WARP BUBBLE · GRAVITATIONAL LENSING",
    title: "Spherical Wormhole & Einstein Lens",
    lead:
      "Two independently synthesized SHARP worlds share one GPU radix depth sort. A serene Morris-Thorne warp bubble bends surrounding Douglas firs symmetrically around a floating crystal sphere revealing the curved alien horizon inside.",
    bullets: [
      "Symmetric Schwarzschild lensing (<code>r' = sqrt(r² + R²)</code>) curves the surrounding forest smoothly around the sphere",
      "Convex spherical lens mapping bows the alien canyon & ringed gas giant edge-to-edge inside the floating warp bubble",
      "Clean Fresnel glass limb refraction unwraps smoothly 1:1 to native 16:9 perspective as the camera flies through",
    ],
    metrics: [
      { label: "Splat Budget", value: "1.36M Unified Sort · 18.9 MB" },
      { label: "Lensing", value: "Morris-Thorne Warp Bubble" },
    ],
    notes:
      "Notice there was no scene reload from Slide 1—gravitational lensing bends the forest first, then the spherical wormhole blooms open cleanly once without re-triggering. Press R to replay the lensing bloom, or advance to launch through the throat.",
    camera: {
      pos: [0.04, 0.14, -1.05],
      target: [-0.08, 0.42, -6.2],
      fov: 40,
      roll: 0.0,
      driftAmp: [0.03, 0.014, 0.04],
      driftSpeed: 0.42,
    },
    fx: {
      mode: "wormhole",
      mix: 1.0,
      twist: 0.0,
      ageStatic: 2.3,
      bloomStrength: 0.14,
      bloomThreshold: 0.94,
      bloomRadius: 0.24,
    },
    transitionFromPrev: {
      kind: "glide",
      durationSec: 2.35,
    },
  },
  {
    id: "wormhole-launch",
    scene: "dual_world",
    layout: "bottom-left",
    kicker: "02 · CONTINUOUS TRAVERSAL",
    title: "Gravitational Slingshot Into a Second World",
    lead:
      "Advancing from Slide 2 accelerates the camera along an exponential gravity ramp (u^2.35) with a dynamic warp-FOV kick (40° → 62° → 39°) and outward throat-rush splat shear right across the membrane.",
    bullets: [
      "Monotonic portal axis (<code>signedDist = cam.z − portal.z</code>) prevents projection sign flips during zero-crossing",
      "Alien world origin sits dead-on <code>z = −6.0</code> so native 16:9 SHARP parallax takes over edge-to-edge with zero disocclusion holes",
    ],
    metrics: [
      { label: "Launch Curve", value: "p = u^2.35 + FOV Kick" },
      { label: "Color Space", value: "sRGB 1/2.2 Compensated" },
    ],
    notes:
      "The camera physically crossed z = -6.2 through the wormhole into the warm alien canyon. Press Left Arrow if you want to show the audience the reverse traversal back out into the forest.",
    camera: {
      pos: [0.24, 0.56, -6.55],
      target: [0.18, 0.72, -16.5],
      fov: 39,
      roll: 0.0,
      driftAmp: [0.04, 0.016, 0.04],
      driftSpeed: 0.34,
    },
    fx: {
      mode: "wormhole",
      mix: 1.0,
      twist: 0.0,
      ageStatic: 3.4,
      bloomStrength: 0.24,
      bloomThreshold: 0.9,
      bloomRadius: 0.28,
    },
    transitionFromPrev: {
      kind: "wormhole-launch",
      durationSec: 2.45,
    },
  },
  {
    id: "tokyo-parallax",
    scene: "tokyo_alley",
    layout: "left",
    kicker: "03 · COUNTER-PARALLAX DEPTH SHEAR",
    title: "Elastic Depth Waves in Neon Tokyo",
    lead:
      "Instead of uniform rotation, per-splat depth coordinates drive opposing foreground-versus-background parallax combined with a traveling sinusoidal shear wave along the corridor axis.",
    bullets: [
      "Foreground lanterns tilt counter-clockwise while deep alleyway walls twist clockwise with <code>sin(depth − t)</code> phase lag",
      "Quaternion orientation updates via <code>GpuSplatMath.quatMul</code> keep anisotropic splats aligned to deformed signage",
      "Near-camera clip fading removes foreground pop as the crane glides past hanging signs",
    ],
    metrics: [
      { label: "Scene", value: "400k Splats · 5.7 MB SPZ" },
      { label: "Parallax", value: "Opposing FG/BG + Shear" },
    ],
    notes:
      "This slide keeps the Tokyo alleyway intact so the audience can clearly read the counter-parallax depth shear. Advancing to Slide 5 continuously pushes deeper into the alley and shatters the signage into a glowing micro-Gaussian point cloud.",
    camera: {
      pos: [-0.26, 0.04, 0.65],
      target: [-0.54, 0.2, -5.8],
      fov: 56,
      roll: -0.04,
      driftAmp: [0.09, 0.03, 0.08],
      driftSpeed: 0.45,
    },
    fx: {
      mode: "tokyo",
      mix: 0.0,
      twist: 0.62,
      ageRate: 0.4,
      bloomStrength: 0.34,
      bloomThreshold: 0.78,
      bloomRadius: 0.34,
    },
  },
  {
    id: "tokyo-pointcloud",
    scene: "tokyo_alley",
    layout: "left",
    kicker: "03B · MICRO-GAUSSIAN BLOOM BREAKUP",
    title: "Signage Isolation & Emissive Particle Void",
    lead:
      "Continuous transition inside the same 500k-splat scene: walls recede into ink-black noir while chroma-gated signage splats shrink to pinpoint radii and ignite HDR AgX bloom.",
    bullets: [
      "Chroma + luminance masking separates emissive neon signs and wet puddle reflections from dark masonry",
      "Isotropic pinpoint clamping (<code>1.4–4.8mm</code>) turns solid facades into suspended neon constellations",
      "Dual-frequency hash twinkling and falling rain streaks run at zero CPU cost inside the TSL vertex graph",
    ],
    metrics: [
      { label: "Post-Process", value: "AgX + WebGPU Bloom" },
      { label: "Transition", value: "Continuous Intra-Scene" },
    ],
    notes:
      "Same exact Tokyo scene as Slide 4—only the uniform mix and camera crane position interpolated. Highlights how a single 3DGS capture supports radically different visual registers.",
    camera: {
      pos: [0.08, 0.22, -2.05],
      target: [-0.42, 0.24, -7.8],
      fov: 58,
      roll: 0.06,
      driftAmp: [0.07, 0.025, 0.08],
      driftSpeed: 0.5,
    },
    fx: {
      mode: "tokyo",
      mix: 1.0,
      twist: 0.85,
      ageRate: 0.45,
      bloomStrength: 0.54,
      bloomThreshold: 0.64,
      bloomRadius: 0.44,
    },
    transitionFromPrev: {
      kind: "tokyo-arc",
      durationSec: 1.85,
    },
  },
  {
    id: "buddha-smoke",
    scene: "buddha",
    layout: "left",
    kicker: "04 · CURL-NOISE VOLUMETRIC ADVECTION",
    title: "Complete Smoke & Ash Dissolution",
    lead:
      "A diagonal erosion front sweeps across an isolated 262k-Gaussian stone sculpture, splitting each splat probabilistically into volumetric charcoal smoke puffs or bright rising ash grains.",
    bullets: [
      "Divergence-free 3D curl noise advects eroded particles upward in coherent turbulent plumes",
      "Dual-population scaling: 32% expand <code>3.2×</code> into soft slate wisps; 68% collapse to crisp glowing ash embers",
      "Press <code>R</code> at any time to re-trigger the dissolution from intact carved stone",
    ],
    metrics: [
      { label: "Scene", value: "240k Splats · 2.9 MB SPZ" },
      { label: "Advection", value: "Analytic 3D Curl Field" },
    ],
    notes:
      "The dissolution loops cleanly so you can talk over it, or press R to reset to intact stone right before explaining the dual-population puff vs ember split.",
    camera: {
      pos: [-0.66, 0.14, 2.92],
      target: [-0.52, 0.18, 0.0],
      fov: 49,
      roll: -0.01,
      driftAmp: [0.1, 0.03, 0.04],
      driftSpeed: 0.35,
    },
    fx: {
      mode: "dissolve",
      mix: 1.0,
      twist: 0.0,
      ageRate: 0.58,
      loopSec: 4.5,
      loopLeadSec: 0.75,
      bloomStrength: 0.16,
      bloomThreshold: 0.94,
      bloomRadius: 0.22,
    },
  },
  {
    id: "grace-lidar",
    scene: "grace",
    layout: "left",
    kicker: "05 · FULL-VOLUME 30× COMPRESSED CATHEDRAL · MONOCHROME LIDAR",
    title: "Stark B&W Spherical Point-Cloud Matrix",
    lead:
      "Voxel-density-equalized Grace Cathedral (715 MB 10M SH3 compressed 30× to 24.1 MB Morton-sorted SPZ across all 79k 3D voxels): a pure achromatic spherical wavefront sweeps across pews, Gothic vaults, transepts, organ pipes, and the rose window before contracting back to color.",
    bullets: [
      "3D voxel-density equalization retains 100% of the cathedral interior (nave, back nave, transepts, and 33m vaults) at 1.56M splats",
      "Stochastic hash decimation thins interior fill splats so crisp white particles float in pure black space",
      "Scale clamping (<code>dotRefScale = min(fxScale, 12)</code>) keeps pinpoint dot radii sharp across a 50-meter nave",
    ],
    metrics: [
      { label: "Compressed Asset", value: "1.56M SPZ · 24.1 MB (30×)" },
      { label: "Sweep Radius", value: "52m Full Nave Return" },
    ],
    notes:
      "Wait for the white spherical LiDAR wave to hit peak expansion over the stained-glass rose window, then mention the 10M SH3 packed splat count. Press R to fire the wave again or O to orbit inside the live point cloud.",
    camera: {
      pos: [-13.8, 7.35, -3.55],
      target: [-2.0, 9.6, -4.55],
      fov: 60,
      roll: 0.0,
      driftAmp: [0.35, 0.12, 0.16],
      driftSpeed: 0.28,
    },
    fx: {
      mode: "shockwave",
      mix: 1.0,
      twist: 0.0,
      ageRate: 0.92,
      loopSec: 4.35,
      loopLeadSec: 0.55,
      bloomStrength: 0.14,
      bloomThreshold: 0.96,
      bloomRadius: 0.2,
    },
  },
  {
    id: "architecture-summary",
    scene: "grace",
    layout: "summary",
    kicker: "SUMMARY · WEBGPU 3DGS PIPELINE",
    title: "Four Real-Time Modifiers, One Sort Pipeline",
    lead:
      "Every slide in this presentation runs directly on WebGPU compute sorting with zero pre-baked video layers.",
    summaryRows: [
      {
        effect: "Dual-World Wormhole",
        scene: "Forest × Alien Canyon",
        splats: "1.36M (18.9 MB SPZ)",
        technique: "Per-object SplatGenerator + Einstein lensing + spherical Morris-Thorne refraction",
      },
      {
        effect: "Neon Tokyo Parallax",
        scene: "Kabukichō Alleyway",
        splats: "400k (5.7 MB SPZ)",
        technique: "Opposing FG/BG depth shear + chroma emissive isolation + bloom",
      },
      {
        effect: "Volumetric Smoke & Ash",
        scene: "Carved Stone Buddha",
        splats: "240k (2.9 MB SPZ)",
        technique: "Diagonal burn front + 3D curl advection + dual puff/ember scaling",
      },
      {
        effect: "B&W LiDAR Shockwave",
        scene: "Grace Cathedral Nave",
        splats: "1.56M (24.1 MB SPZ · 30×)",
        technique: "3D voxel-density equalization + stochastic decimation + pure-white shell",
      },
    ],
    notes:
      "Wrap up with the comparison table. You can click 'Explore in Free Orbit' or open the full 9-mode FX Lab directly from this slide for live Q&A.",
    camera: {
      pos: [-15.2, 7.7, -3.0],
      target: [-2.0, 9.5, -3.0],
      fov: 62,
      roll: 0.0,
      driftAmp: [0.4, 0.14, 0.22],
      driftSpeed: 0.22,
    },
    fx: {
      mode: "shockwave",
      mix: 0.35,
      twist: 0.0,
      ageRate: 0.42,
      loopSec: 4.5,
      loopLeadSec: 1.0,
      bloomStrength: 0.12,
      bloomThreshold: 0.96,
      bloomRadius: 0.2,
    },
    transitionFromPrev: {
      kind: "glide",
      durationSec: 1.5,
    },
  },
];

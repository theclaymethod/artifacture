import '@artifacture/themes/tokens.css';
import '@artifacture/kit/styles.css';
import { GpuMorphCanvas } from '@artifacture/gpu';
import { createSplatFxScene, SPLAT_FX_COUNT } from '@artifacture/gpu/scenes';
import { MorphElement, type Page, type SlideMeta, type SlideTransition } from '@open-slide/core';
import fxDissolveStill from './assets/fx-dissolve.png';
import fxGeowaveStill from './assets/fx-geowave.png';
import fxNeonStill from './assets/fx-neon.png';
import fxShockwaveStill from './assets/fx-shockwave.png';
import stumpSplatUrl from './assets/stump-lidar.splat.gz?url';

export const meta: SlideMeta = {
  title: 'Splat FX — 262k 3DGS Particle Manipulation Showcase',
  theme: 'iso',
  createdAt: '2026-11-24T05:30:00Z',
};

const stumpFxScene = createSplatFxScene({
  id: 'splat-fx-stump',
  source: stumpSplatUrl,
  splatCount: SPLAT_FX_COUNT,
});

const morphSlideTransition: SlideTransition = {
  duration: 0,
  morph: { duration: 1250, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
};

export const transition: SlideTransition = morphSlideTransition;

const BASE_SLIDE_STYLE = {
  position: 'relative' as const,
  width: '100%',
  height: '100%',
  overflow: 'hidden' as const,
  background: '#000000',
  color: '#f5f8fc',
  fontFamily: 'var(--osd-font-body)',
};

const KICKER_STYLE = {
  fontFamily: 'var(--ve-font-mono)',
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: '0.14em',
  color: '#6ce8ff',
  textTransform: 'uppercase' as const,
};

const LEFT_SCRIM_STYLE = {
  position: 'absolute' as const,
  inset: 0,
  pointerEvents: 'none' as const,
  background:
    'linear-gradient(90deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.72) 34%, rgba(0,0,0,0.14) 60%, rgba(0,0,0,0) 76%)',
};

const HEADLINE_STYLE = {
  position: 'absolute' as const,
  left: 96,
  top: 134,
  width: 660,
  margin: 0,
  fontFamily: 'var(--osd-font-display)',
  fontSize: 68,
  fontWeight: 500,
  lineHeight: 1.03,
  letterSpacing: '-0.02em',
  color: '#ffffff',
};

const CAPTION_STYLE = {
  position: 'absolute' as const,
  left: 96,
  bottom: 84,
  width: 620,
  margin: 0,
  fontSize: 25,
  lineHeight: 1.42,
  color: '#d8e3ef',
};

const LidarShockwave: Page = () => (
  <section style={BASE_SLIDE_STYLE}>
    <GpuMorphCanvas
      stageId="splat-fx-stage"
      scene={stumpFxScene}
      stillSrc={fxShockwaveStill}
      morphMs={1250}
      label="Monochrome LiDAR point cloud swept by an expanding spherical shockwave across 262,144 Gaussians"
      params={{
        monochrome: 1.0,
        pointMix: 0.84,
        shockMix: 1.0,
        shockSpeed: 1.15,
        dissolveAmt: 0.0,
        curlStrength: 1.0,
        geoWave: 0.0,
        shatterAmt: 0.0,
        neonHdr: 0.0,
        camDist: 8.6,
        camYaw: 0.35,
        camPitch: 0.32,
        camRoll: 0.0,
        focusY: 1.05,
        fov: 0.92,
        offsetX: 0.2,
        splatScale: 1.0,
        orbitSpeed: 0.14,
        exposure: 1.14,
      }}
      style={{ position: 'absolute', inset: 0 }}
    />
    <div style={LEFT_SCRIM_STYLE} />

    <MorphElement id="fx-kicker">
      <div style={{ ...KICKER_STYLE, position: 'absolute', left: 96, top: 88 }}>
        SPLAT-FX · 262,144 REAL 3D GAUSSIANS
      </div>
    </MorphElement>

    <h1 style={HEADLINE_STYLE}>Monochrome LiDAR shockwaves across forest geometry</h1>

    <p style={CAPTION_STYLE}>
      An expanding spherical wave illuminates crisp isotropic silver points across the clearing and
      stump against pure #000000 obsidian darkness.
    </p>
  </section>
);
LidarShockwave.transition = morphSlideTransition;

const CurlSmokeDissolve: Page = () => (
  <section style={BASE_SLIDE_STYLE}>
    <GpuMorphCanvas
      stageId="splat-fx-stage"
      scene={stumpFxScene}
      stillSrc={fxDissolveStill}
      morphMs={1250}
      label="Photorealistic tree stump eroding diagonally into volumetric curl-noise smoke and fine sand grains"
      params={{
        monochrome: 0.08,
        pointMix: 0.0,
        shockMix: 0.0,
        shockSpeed: 1.0,
        dissolveAmt: 0.74,
        curlStrength: 1.45,
        geoWave: 0.0,
        shatterAmt: 0.0,
        neonHdr: 0.0,
        camDist: 6.4,
        camYaw: -0.45,
        camPitch: 0.2,
        camRoll: 0.03,
        focusY: 1.05,
        fov: 0.88,
        offsetX: 0.18,
        splatScale: 1.05,
        orbitSpeed: 0.1,
        exposure: 1.1,
      }}
      style={{ position: 'absolute', inset: 0 }}
    />
    <div style={LEFT_SCRIM_STYLE} />

    <MorphElement id="fx-kicker">
      <div style={{ ...KICKER_STYLE, position: 'absolute', left: 96, top: 88, color: '#a8b8cc' }}>
        SPLAT-FX · 262,144 REAL 3D GAUSSIANS
      </div>
    </MorphElement>

    <h1 style={HEADLINE_STYLE}>Curl-noise smoke plumes &amp; fine sand erosion</h1>

    <p style={CAPTION_STYLE}>
      A moving noise front splits splats into expanding slate smoke puffs and fine high-velocity ash
      grains drifting upward along 3D curl trajectories.
    </p>
  </section>
);
CurlSmokeDissolve.transition = morphSlideTransition;

const NeonVoidDrift: Page = () => (
  <section style={BASE_SLIDE_STYLE}>
    <GpuMorphCanvas
      stageId="splat-fx-stage"
      scene={stumpFxScene}
      stillSrc={fxNeonStill}
      morphMs={1250}
      label="Dutch-angle cyan and vermilion HDR point-cloud drift with upward ember filaments"
      params={{
        monochrome: 0.0,
        pointMix: 0.85,
        shockMix: 0.0,
        shockSpeed: 1.0,
        dissolveAmt: 0.0,
        curlStrength: 1.25,
        geoWave: 0.0,
        shatterAmt: 0.0,
        neonHdr: 1.0,
        camDist: 7.4,
        camYaw: 0.95,
        camPitch: 0.22,
        camRoll: -0.22,
        focusY: 1.15,
        fov: 0.94,
        offsetX: 0.18,
        splatScale: 1.05,
        orbitSpeed: 0.16,
        exposure: 1.16,
      }}
      style={{ position: 'absolute', inset: 0 }}
    />
    <div style={LEFT_SCRIM_STYLE} />

    <MorphElement id="fx-kicker">
      <div style={{ ...KICKER_STYLE, position: 'absolute', left: 96, top: 88, color: '#ff7d47' }}>
        SPLAT-FX · 262,144 REAL 3D GAUSSIANS
      </div>
    </MorphElement>

    <h1 style={HEADLINE_STYLE}>Dutch-angle HDR cyan &amp; vermilion point drift</h1>

    <p style={CAPTION_STYLE}>
      Traveling split-graded energy waves sweep luminous teal-to-amber pulses and stretched ember
      streaks across tilted point clouds.
    </p>
  </section>
);
NeonVoidDrift.transition = morphSlideTransition;

const GeometricWaveShatter: Page = () => (
  <section style={BASE_SLIDE_STYLE}>
    <GpuMorphCanvas
      stageId="splat-fx-stage"
      scene={stumpFxScene}
      stillSrc={fxGeowaveStill}
      morphMs={1250}
      label="Concentric geometric wave ripples and faceted crystalline shard dispersion across the forest clearing"
      params={{
        monochrome: 0.0,
        pointMix: 0.22,
        shockMix: 0.0,
        shockSpeed: 1.0,
        dissolveAmt: 0.0,
        curlStrength: 0.8,
        geoWave: 1.0,
        shatterAmt: 0.45,
        neonHdr: 0.0,
        camDist: 8.4,
        camYaw: -1.05,
        camPitch: 0.34,
        camRoll: 0.06,
        focusY: 1.1,
        fov: 0.94,
        offsetX: 0.2,
        splatScale: 1.02,
        orbitSpeed: 0.16,
        exposure: 1.08,
      }}
      style={{ position: 'absolute', inset: 0 }}
    />
    <div style={LEFT_SCRIM_STYLE} />

    <MorphElement id="fx-kicker">
      <div style={{ ...KICKER_STYLE, position: 'absolute', left: 96, top: 88, color: '#8ae2ff' }}>
        SPLAT-FX · 262,144 REAL 3D GAUSSIANS
      </div>
    </MorphElement>

    <h1 style={HEADLINE_STYLE}>Concentric wave rings &amp; crystalline cell shatter</h1>

    <p style={CAPTION_STYLE}>
      Counter-rotating radial bands ripple the forest floor while spatial 3D facet cells lift and
      twist apart with crisp cyan edge seams.
    </p>
  </section>
);
GeometricWaveShatter.transition = morphSlideTransition;

export const notes = [
  'Slide 1: Monochrome LiDAR expanding spherical & ground shockwave across real stump Gaussians.',
  'Slide 2: Organic diagonal dissolution front with dual-population curl-noise smoke and sand grains.',
  'Slide 3: Dutch-angle HDR cyan/vermilion energy wave and stretched luminous ember drift.',
  'Slide 4: Quantized concentric ground ripples, counter-rotating rings, and 3D cellular shatter.',
];

export default [
  LidarShockwave,
  CurlSmokeDissolve,
  NeonVoidDrift,
  GeometricWaveShatter,
] satisfies Page[];

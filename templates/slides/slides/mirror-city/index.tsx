import '@artifacture/themes/tokens.css';
import '@artifacture/kit/styles.css';
import { GpuMorphCanvas } from '@artifacture/gpu';
import { createMirrorCityScene } from '@artifacture/gpu/scenes';
import { MorphElement, type Page, type SlideMeta, type SlideTransition } from '@open-slide/core';
import cityAerialStill from './assets/city-aerial.png';
import cityFoldStill from './assets/city-fold.png';
import cityNormalStill from './assets/city-normal.png';
import cityTunnelStill from './assets/city-tunnel.png';
import nycSplatUrl from './assets/nyc-skyfall.splat.gz?url';

export const meta: SlideMeta = {
  title: 'Skyfall NYC — Mirror Dimension 3D Gaussian Splats',
  theme: 'iso',
  createdAt: '2026-11-24T05:00:00Z',
};

const nycMirrorScene = createMirrorCityScene({
  id: 'mirror-city',
  splatSource: nycSplatUrl,
  splatCount: 262144,
});

const morphSlideTransition: SlideTransition = {
  duration: 0,
  morph: { duration: 1150, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
};

export const transition: SlideTransition = morphSlideTransition;

const BASE_SLIDE_STYLE = {
  position: 'relative' as const,
  width: '100%',
  height: '100%',
  overflow: 'hidden' as const,
  background: '#080e1a',
  color: '#f4f7fb',
  fontFamily: 'var(--osd-font-body)',
};

const KICKER_STYLE = {
  fontFamily: 'var(--ve-font-mono)',
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: '0.14em',
  color: '#f4c76b',
  textTransform: 'uppercase' as const,
};

const LEFT_SCRIM_STYLE = {
  position: 'absolute' as const,
  inset: 0,
  pointerEvents: 'none' as const,
  background:
    'linear-gradient(90deg, rgba(8,14,26,0.88) 0%, rgba(8,14,26,0.68) 38%, rgba(8,14,26,0.16) 66%, rgba(8,14,26,0) 80%)',
};

const RIGHT_SCRIM_STYLE = {
  position: 'absolute' as const,
  inset: 0,
  pointerEvents: 'none' as const,
  background:
    'linear-gradient(270deg, rgba(8,14,26,0.9) 0%, rgba(8,14,26,0.68) 38%, rgba(8,14,26,0.16) 66%, rgba(8,14,26,0) 80%)',
};

const ManhattanFlythrough: Page = () => (
  <section style={BASE_SLIDE_STYLE}>
    <GpuMorphCanvas
      stageId="mirror-city-stage"
      scene={nycMirrorScene}
      stillSrc={cityNormalStill}
      morphMs={1150}
      label="Daytime New York City block reconstructed with 262,144 GPU-sorted 3D Gaussian splats"
      params={{
        foldStreet: 0.0,
        fractalSplit: 0.0,
        kaleidoscope: 0.0,
        fractureLift: 0.0,
        tunnelWrap: 0.0,
        daylight: 1.0,
        camX: -14.0,
        camY: 16.0,
        camZ: 38.0,
        camYaw: -0.3,
        camPitch: -0.22,
        camRoll: 0.0,
        fov: 0.9,
        offsetX: 0.14,
        splatScale: 1.15,
        flySpeed: 1.0,
      }}
      style={{ position: 'absolute', inset: 0 }}
    />
    <div style={LEFT_SCRIM_STYLE} />

    <MorphElement id="city-kicker">
      <div style={{ ...KICKER_STYLE, position: 'absolute', left: 96, top: 88 }}>
        SKYFALL-GS NYC · 262,144 REAL 3D GAUSSIANS
      </div>
    </MorphElement>

    <h1
      style={{
        position: 'absolute',
        left: 96,
        top: 132,
        width: 720,
        margin: 0,
        fontFamily: 'var(--osd-font-display)',
        fontSize: 70,
        fontWeight: 500,
        lineHeight: 1.02,
        letterSpacing: '-0.02em',
        color: '#f7faff',
      }}
    >
      Real Manhattan 3DGS, sorted & flown live on WebGPU
    </h1>

    <p
      style={{
        position: 'absolute',
        left: 96,
        bottom: 84,
        width: 650,
        margin: 0,
        fontSize: 26,
        lineHeight: 1.42,
        color: '#dce6f5',
      }}
    >
      262,144 anisotropic Gaussians from Skyfall-GS NYC unpack directly into a GPU storage buffer
      for in-place bitonic depth sorting every frame.
    </p>
  </section>
);
ManhattanFlythrough.transition = morphSlideTransition;

const FractalHorizonFold: Page = () => (
  <section style={BASE_SLIDE_STYLE}>
    <GpuMorphCanvas
      stageId="mirror-city-stage"
      scene={nycMirrorScene}
      stillSrc={cityFoldStill}
      morphMs={1150}
      label="Manhattan skyline cleaving along 45-degree diagonal planes and folding overhead"
      params={{
        foldStreet: 1.0,
        fractalSplit: 0.55,
        kaleidoscope: 0.15,
        fractureLift: 0.18,
        tunnelWrap: 0.0,
        daylight: 1.0,
        camX: -15.0,
        camY: 15.5,
        camZ: 42.0,
        camYaw: -0.22,
        camPitch: -0.02,
        camRoll: 0.0,
        fov: 0.94,
        offsetX: 0.16,
        splatScale: 1.15,
        flySpeed: 1.0,
      }}
      style={{ position: 'absolute', inset: 0 }}
    />
    <div style={LEFT_SCRIM_STYLE} />

    <MorphElement id="city-kicker">
      <div style={{ ...KICKER_STYLE, position: 'absolute', left: 96, top: 88 }}>
        SKYFALL-GS NYC · 262,144 REAL 3D GAUSSIANS
      </div>
    </MorphElement>

    <h1
      style={{
        position: 'absolute',
        left: 96,
        top: 132,
        width: 660,
        margin: 0,
        fontFamily: 'var(--osd-font-display)',
        fontSize: 70,
        fontWeight: 500,
        lineHeight: 1.03,
        letterSpacing: '-0.02em',
        color: '#f7faff',
      }}
    >
      Fractal geometric splits fold the skyline overhead
    </h1>

    <p
      style={{
        position: 'absolute',
        left: 96,
        bottom: 84,
        width: 630,
        margin: 0,
        fontSize: 26,
        lineHeight: 1.42,
        color: '#dce6f5',
      }}
    >
      Three-tier origami shear planes, Menger story-slab drawers, and stepped horizon hinges bend
      real NYC towers upward across crystalline seams.
    </p>
  </section>
);
FractalHorizonFold.transition = morphSlideTransition;

const KaleidoscopeTunnel: Page = () => (
  <section style={BASE_SLIDE_STYLE}>
    <GpuMorphCanvas
      stageId="mirror-city-stage"
      scene={nycMirrorScene}
      stillSrc={cityTunnelStill}
      morphMs={1150}
      label="Manhattan blocks counter-rotating into an 8-fold octagonal Mirror Dimension tunnel"
      params={{
        foldStreet: 0.2,
        fractalSplit: 0.8,
        kaleidoscope: 1.0,
        fractureLift: 0.28,
        tunnelWrap: 1.0,
        daylight: 1.0,
        camX: 0.0,
        camY: 12.0,
        camZ: 32.0,
        camYaw: 0.0,
        camPitch: 0.0,
        camRoll: 0.05,
        fov: 1.12,
        offsetX: 0.16,
        splatScale: 1.2,
        flySpeed: 1.15,
      }}
      style={{ position: 'absolute', inset: 0 }}
    />
    <div style={LEFT_SCRIM_STYLE} />

    <MorphElement id="city-kicker">
      <div style={{ ...KICKER_STYLE, position: 'absolute', left: 96, top: 88 }}>
        SKYFALL-GS NYC · 262,144 REAL 3D GAUSSIANS
      </div>
    </MorphElement>

    <h1
      style={{
        position: 'absolute',
        left: 96,
        top: 132,
        width: 650,
        margin: 0,
        fontFamily: 'var(--osd-font-display)',
        fontSize: 70,
        fontWeight: 500,
        lineHeight: 1.03,
        letterSpacing: '-0.02em',
        color: '#f7faff',
      }}
    >
      Eight-fold clockwork city vortex around sunlit sky
    </h1>

    <p
      style={{
        position: 'absolute',
        left: 96,
        bottom: 84,
        width: 620,
        margin: 0,
        fontSize: 26,
        lineHeight: 1.42,
        color: '#dce6f5',
      }}
    >
      Quaternion 3D covariance axes rotate alongside each octagonal sector as counter-rotating depth
      rings stream down the avenue.
    </p>
  </section>
);
KaleidoscopeTunnel.transition = morphSlideTransition;

const TectonicCityFracture: Page = () => (
  <section style={BASE_SLIDE_STYLE}>
    <GpuMorphCanvas
      stageId="mirror-city-stage"
      scene={nycMirrorScene}
      stillSrc={cityAerialStill}
      morphMs={1150}
      label="Elevated oblique view of NYC towers splitting along diagonal Mirror Dimension faults"
      params={{
        foldStreet: 0.2,
        fractalSplit: 0.68,
        kaleidoscope: 0.2,
        fractureLift: 0.72,
        tunnelWrap: 0.0,
        daylight: 1.0,
        camX: -32.0,
        camY: 30.0,
        camZ: 44.0,
        camYaw: -0.52,
        camPitch: -0.4,
        camRoll: 0.0,
        fov: 0.94,
        offsetX: -0.14,
        splatScale: 1.15,
        flySpeed: 1.0,
      }}
      style={{ position: 'absolute', inset: 0 }}
    />
    <div style={RIGHT_SCRIM_STYLE} />

    <MorphElement id="city-kicker">
      <div
        style={{
          ...KICKER_STYLE,
          position: 'absolute',
          right: 96,
          top: 88,
          textAlign: 'right',
        }}
      >
        SKYFALL-GS NYC · 262,144 REAL 3D GAUSSIANS
      </div>
    </MorphElement>

    <h1
      style={{
        position: 'absolute',
        right: 96,
        top: 132,
        width: 680,
        margin: 0,
        textAlign: 'right',
        fontFamily: 'var(--osd-font-display)',
        fontSize: 70,
        fontWeight: 500,
        lineHeight: 1.03,
        letterSpacing: '-0.02em',
        color: '#f7faff',
      }}
    >
      Zero buffer uploads across tectonic skyline cuts
    </h1>

    <p
      style={{
        position: 'absolute',
        right: 96,
        bottom: 84,
        width: 640,
        margin: 0,
        textAlign: 'right',
        fontSize: 26,
        lineHeight: 1.42,
        color: '#dce6f5',
      }}
    >
      One persistent WebGPU canvas and 16.7 MB storage buffer drive real-time slide morphs and
      headless Dawn stills from any compressed .splat capture.
    </p>
  </section>
);
TectonicCityFracture.transition = morphSlideTransition;

export const notes = [
  'Open on real Skyfall-GS NYC 262,144-splat daytime flythrough.',
  'Advance to cleave blocks along 45-degree diagonal & story-slab planes while folding overhead.',
  'Advance to twist Manhattan towers into an 8-fold counter-rotating clockwork tunnel.',
  'Advance to pull out to an elevated oblique Escher tectonic fracture across NYC.',
];

export default [
  ManhattanFlythrough,
  FractalHorizonFold,
  KaleidoscopeTunnel,
  TectonicCityFracture,
] satisfies Page[];

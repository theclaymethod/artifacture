import '@artifacture/themes/tokens.css';
import '@artifacture/kit/styles.css';
import { GpuMorphCanvas } from '@artifacture/gpu';
import { gaussianSplatScene } from '@artifacture/gpu/scenes';
import { MorphElement, type Page, type SlideMeta, type SlideTransition } from '@open-slide/core';
import splatCloseupStill from './assets/splat-closeup.png';
import splatDioramaStill from './assets/splat-diorama.png';
import splatRibbonStill from './assets/splat-ribbon.png';
import splatTunnelStill from './assets/splat-tunnel.png';

export const meta: SlideMeta = {
  title: '3D Gaussian Splat Morphs & Tunnel Warp',
  theme: 'iso',
  createdAt: '2026-11-24T04:00:00Z',
};

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
  background: '#050912',
  color: '#f4f7fb',
  fontFamily: 'var(--osd-font-body)',
};

const KICKER_STYLE = {
  fontFamily: 'var(--ve-font-mono)',
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: '0.14em',
  color: '#5ad8f5',
  textTransform: 'uppercase' as const,
};

const SplatDiorama: Page = () => (
  <section style={BASE_SLIDE_STYLE}>
    <GpuMorphCanvas
      stageId="splat-stage"
      scene={gaussianSplatScene}
      stillSrc={splatDioramaStill}
      morphMs={1150}
      label="Anisotropic 3D Gaussian splats forming an orbital crystal diorama"
      params={{
        tunnelMorph: 0.0,
        vortexMorph: 0.0,
        camDist: 3.15,
        camYaw: 0.55,
        camPitch: 0.34,
        fov: 1.0,
        flySpeed: 1.35,
        offsetX: 0.26,
        splatScale: 1.0,
        exposure: 0.92,
        swirlStrength: 1.45,
      }}
      style={{ position: 'absolute', inset: 0 }}
    />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background:
          'linear-gradient(90deg, rgba(5,9,18,0.82) 0%, rgba(5,9,18,0.45) 44%, rgba(5,9,18,0) 75%)',
      }}
    />

    <MorphElement id="splat-kicker">
      <div style={{ ...KICKER_STYLE, position: 'absolute', left: 96, top: 88 }}>
        WEBGPU · 10,240 3D GAUSSIANS
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
        fontSize: 74,
        fontWeight: 500,
        lineHeight: 1.02,
        letterSpacing: '-0.02em',
        color: '#f7faff',
      }}
    >
      Anisotropic Gaussian splats, projected live on vgpu
    </h1>

    <p
      style={{
        position: 'absolute',
        left: 96,
        bottom: 84,
        width: 650,
        margin: 0,
        fontSize: 27,
        lineHeight: 1.4,
        color: '#b4c5dc',
      }}
    >
      Each elliptical splat carries 3D covariance projected via the EWA screen Jacobian into an HDR
      rgba16float target before ACES tonemapping.
    </p>
  </section>
);
SplatDiorama.transition = morphSlideTransition;

const SplatTunnel: Page = () => (
  <section style={BASE_SLIDE_STYLE}>
    <GpuMorphCanvas
      stageId="splat-stage"
      scene={gaussianSplatScene}
      stillSrc={splatTunnelStill}
      morphMs={1150}
      label="Gaussian splats warped into a curving infinite tunnel"
      params={{
        tunnelMorph: 1.0,
        vortexMorph: 0.0,
        camDist: 2.8,
        camYaw: 0.0,
        camPitch: 0.0,
        fov: 1.22,
        flySpeed: 1.65,
        offsetX: 0.16,
        splatScale: 1.05,
        exposure: 0.94,
        swirlStrength: 1.45,
      }}
      style={{ position: 'absolute', inset: 0 }}
    />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background:
          'linear-gradient(90deg, rgba(5,9,18,0.84) 0%, rgba(5,9,18,0.48) 38%, rgba(5,9,18,0) 68%)',
      }}
    />

    <MorphElement id="splat-kicker">
      <div style={{ ...KICKER_STYLE, position: 'absolute', left: 96, top: 72 }}>
        WEBGPU · 10,240 3D GAUSSIANS
      </div>
    </MorphElement>

    <h1
      style={{
        position: 'absolute',
        left: 96,
        top: 116,
        width: 580,
        margin: 0,
        fontFamily: 'var(--osd-font-display)',
        fontSize: 64,
        fontWeight: 500,
        lineHeight: 1.04,
        letterSpacing: '-0.02em',
        color: '#f7faff',
      }}
    >
      One uniform cut warps the diorama into a tunnel
    </h1>

    <p
      style={{
        position: 'absolute',
        left: 96,
        bottom: 84,
        width: 540,
        margin: 0,
        fontSize: 25,
        lineHeight: 1.42,
        color: '#b9cae2',
      }}
    >
      Tangential arches and z-stretched velocity splats stream continuously along a curving path as
      the orbital camera flies inside.
    </p>
  </section>
);
SplatTunnel.transition = morphSlideTransition;

const SplatRibbon: Page = () => (
  <section style={BASE_SLIDE_STYLE}>
    <GpuMorphCanvas
      stageId="splat-stage"
      scene={gaussianSplatScene}
      stillSrc={splatRibbonStill}
      morphMs={1150}
      label="Gaussian splats untwisting from the tunnel into a 3D Mobius ribbon wave"
      params={{
        tunnelMorph: 0.0,
        vortexMorph: 1.0,
        camDist: 3.15,
        camYaw: 0.42,
        camPitch: 0.48,
        fov: 1.02,
        flySpeed: 1.1,
        offsetX: 0.22,
        splatScale: 1.0,
        exposure: 0.94,
        swirlStrength: 1.45,
      }}
      style={{ position: 'absolute', inset: 0 }}
    />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background:
          'linear-gradient(90deg, rgba(5,9,18,0.82) 0%, rgba(5,9,18,0.42) 44%, rgba(5,9,18,0) 74%)',
      }}
    />

    <MorphElement id="splat-kicker">
      <div style={{ ...KICKER_STYLE, position: 'absolute', left: 96, top: 88 }}>
        WEBGPU · 10,240 3D GAUSSIANS
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
        fontSize: 64,
        fontWeight: 500,
        lineHeight: 1.04,
        letterSpacing: '-0.02em',
        color: '#f7faff',
      }}
    >
      Every splat keeps its own basis through the Möbius twist
    </h1>

    <p
      style={{
        position: 'absolute',
        left: 96,
        bottom: 84,
        width: 620,
        margin: 0,
        fontSize: 25,
        lineHeight: 1.42,
        color: '#b4c5dc',
      }}
    >
      Orthonormal axes orthogonalize in the vertex shader while helical swirl lifts points cleanly
      between topological attractors.
    </p>
  </section>
);
SplatRibbon.transition = morphSlideTransition;

const SplatCloseup: Page = () => (
  <section style={BASE_SLIDE_STYLE}>
    <GpuMorphCanvas
      stageId="splat-stage"
      scene={gaussianSplatScene}
      stillSrc={splatCloseupStill}
      morphMs={1150}
      label="Orbital close-up of the crystal diorama reassembled from the ribbon"
      params={{
        tunnelMorph: 0.0,
        vortexMorph: 0.0,
        camDist: 2.75,
        camYaw: -0.95,
        camPitch: 0.18,
        fov: 0.96,
        flySpeed: 1.35,
        offsetX: -0.24,
        splatScale: 1.0,
        exposure: 0.94,
        swirlStrength: 1.45,
      }}
      style={{ position: 'absolute', inset: 0 }}
    />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background:
          'linear-gradient(270deg, rgba(5,9,18,0.88) 0%, rgba(5,9,18,0.52) 48%, rgba(5,9,18,0) 76%)',
      }}
    />

    <MorphElement id="splat-kicker">
      <div
        style={{ ...KICKER_STYLE, position: 'absolute', right: 96, top: 88, textAlign: 'right' }}
      >
        WEBGPU · 10,240 3D GAUSSIANS
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
        fontSize: 64,
        fontWeight: 500,
        lineHeight: 1.05,
        letterSpacing: '-0.02em',
        color: '#f7faff',
      }}
    >
      Shared storage buffer, zero re-uploads per slide
    </h1>

    <p
      style={{
        position: 'absolute',
        right: 96,
        bottom: 84,
        width: 640,
        margin: 0,
        textAlign: 'right',
        fontSize: 25,
        lineHeight: 1.42,
        color: '#b4c5dc',
      }}
    >
      One persistent canvas, GPU storage buffer, and headless Dawn still pipeline drive live decks,
      thumbnails, and PDF/PPTX exports.
    </p>
  </section>
);
SplatCloseup.transition = morphSlideTransition;

export const notes = [
  'Open on the 3D Gaussian crystal diorama framed on the right.',
  'Advance to warp the splats smoothly into the infinite curving tunnel.',
  'Advance to uncoil the tunnel into the striped 3D Mobius ribbon wave.',
  'Advance to swing the orbital camera around to the left close-up without re-uploading splat seeds.',
];

export default [SplatDiorama, SplatTunnel, SplatRibbon, SplatCloseup] satisfies Page[];

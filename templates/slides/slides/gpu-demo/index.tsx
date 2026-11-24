import '@artifacture/themes/tokens.css';
import '@artifacture/kit/styles.css';
import { GpuMorphCanvas } from '@artifacture/gpu';
import { blindsGlassScene, liquidPrismScene } from '@artifacture/gpu/scenes';
import {
  ComparisonSlide,
  type ComparisonSlideSpec,
  DiagramCanvas,
  DrillCard,
  LieflatChart,
  validateSlideSpec,
} from '@artifacture/kit';
import {
  MorphElement,
  type Page,
  type SlideMeta,
  type SlideTransition,
  Step,
  Steps,
} from '@open-slide/core';
import { design as isoDesign } from '../../themes/iso.demo';
import blindsStill from './assets/blinds-cover.png';
import prismPose0Still from './assets/prism-pose-0.png';
import prismPose1Still from './assets/prism-pose-1.png';

export const meta: SlideMeta = {
  title: 'WebGPU 3D Morphs on Open-Slide',
  theme: 'iso',
  createdAt: '2026-11-23T23:55:00Z',
};

export const design = isoDesign;

export const transition: SlideTransition = {
  duration: 300,
  exit: {
    duration: 300,
    easing: 'cubic-bezier(0.4, 0, 1, 1)',
    keyframes: [{ opacity: 1 }, { opacity: 1 }],
  },
  enter: {
    duration: 300,
    easing: 'cubic-bezier(0, 0, 0.2, 1)',
    keyframes: [{ opacity: 0 }, { opacity: 1 }],
  },
  morph: { duration: 760, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
};

export const comparisonSpec: ComparisonSlideSpec = {
  id: 'runtime-comparison',
  layout: 'comparison',
  kicker: 'Architecture comparison',
  title: 'Stock open-slide host vs custom slide runtime',
  takeaway:
    'Keeping navigation, PDF, and PPTX in @open-slide/core avoids maintaining a parallel presentation shell.',
  criteria: ['Slide shell', 'WGSL pipeline', 'Print / PPTX fallback', 'Interactive drill-down'],
  items: [
    {
      name: 'Artifacture v2 + open-slide',
      summary: 'Thin React canvas and SVG primitives mounted inside standard open-slide pages.',
      highlight: true,
      metrics: {
        'Slide shell': 'Stock @open-slide/core',
        'WGSL pipeline': 'Precompiled vgpu modules',
        'Print / PPTX fallback': 'Deterministic Dawn PNGs',
        'Interactive drill-down': 'Slide-scoped DrillSheet',
      },
    },
    {
      name: 'Legacy bespoke shell',
      summary: 'Custom Vite server, duplicated presenter UI, and runtime Three.js fallback code.',
      metrics: {
        'Slide shell': 'Forked runtime + scripts',
        'WGSL pipeline': 'Ad-hoc WebGL/Three setup',
        'Print / PPTX fallback': 'Dual implementation',
        'Interactive drill-down': 'Deck-specific wrappers',
      },
    },
  ],
};

const specIssues = validateSlideSpec(comparisonSpec);
if (specIssues.length > 0) {
  throw new Error(specIssues.map((issue) => `${issue.field}: ${issue.message}`).join('; '));
}

const Cover: Page = () => (
  <section
    style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      background: 'var(--osd-bg)',
      color: 'var(--osd-text)',
      fontFamily: 'var(--osd-font-body)',
    }}
  >
    <GpuMorphCanvas
      stageId="spike-hero"
      scene={liquidPrismScene}
      stillSrc={prismPose0Still}
      label="Refractive liquid prism in initial resting pose"
      params={{
        morph: 0.0,
        yaw: 0.45,
        pitch: 0.22,
        zoom: 1.0,
        offsetX: 0.36,
      }}
      style={{
        position: 'absolute',
        inset: 0,
      }}
    />

    <MorphElement id="hero-title">
      <h1
        style={{
          position: 'absolute',
          left: 96,
          top: 96,
          width: 760,
          margin: 0,
          fontFamily: 'var(--osd-font-display)',
          fontSize: 78,
          fontWeight: 500,
          lineHeight: 1.02,
          letterSpacing: '-0.02em',
          color: '#16181d',
        }}
      >
        Persistent WebGPU scenes inside stock open-slide
      </h1>
    </MorphElement>

    <MorphElement id="hero-caption">
      <p
        style={{
          position: 'absolute',
          left: 96,
          bottom: 84,
          width: 680,
          margin: 0,
          fontSize: 28,
          lineHeight: 1.4,
          color: '#2a2e36',
        }}
      >
        One shared vgpu device holds pipeline state across cuts while MorphElement carries DOM
        typography.
      </p>
    </MorphElement>
  </section>
);

const MorphFollowup: Page = () => (
  <section
    style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      background: 'var(--osd-bg)',
      color: 'var(--osd-text)',
      fontFamily: 'var(--osd-font-body)',
    }}
  >
    <GpuMorphCanvas
      stageId="spike-hero"
      scene={liquidPrismScene}
      stillSrc={prismPose1Still}
      morphMs={760}
      label="Refractive liquid prism morphed into torus state"
      params={{
        morph: 1.0,
        yaw: -0.35,
        pitch: 0.32,
        zoom: 0.9,
        offsetX: -0.02,
      }}
      style={{
        position: 'absolute',
        inset: 0,
      }}
    />

    <MorphElement id="hero-title">
      <h1
        style={{
          position: 'absolute',
          left: 96,
          top: 96,
          width: 620,
          margin: 0,
          fontFamily: 'var(--osd-font-display)',
          fontSize: 52,
          fontWeight: 500,
          lineHeight: 1.08,
          letterSpacing: '-0.02em',
          color: '#16181d',
        }}
      >
        Uniforms interpolate without cloning the canvas
      </h1>
    </MorphElement>

    <MorphElement id="hero-caption">
      <p
        style={{
          position: 'absolute',
          left: 96,
          bottom: 84,
          width: 600,
          margin: 0,
          fontSize: 24,
          lineHeight: 1.4,
          color: '#2a2e36',
        }}
      >
        Print, PPTX, thumbnails, and non-WebGPU browsers swap cleanly to deterministic Dawn stills.
      </p>
    </MorphElement>

    <div
      style={{
        position: 'absolute',
        right: 72,
        top: 108,
        width: 460,
        display: 'grid',
        gap: 20,
      }}
    >
      <Steps>
        <Step>
          <div
            style={{
              padding: 24,
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid #dde2ea',
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>
              1. Snapshot on exit
            </div>
            <div style={{ fontSize: 20, lineHeight: 1.4, color: '#5e6573' }}>
              Outgoing layer displays the frozen Dawn still rather than duplicating WebGPU state.
            </div>
          </div>
        </Step>
        <Step>
          <div
            style={{
              padding: 24,
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid #dde2ea',
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>
              2. Interpolate on entry
            </div>
            <div style={{ fontSize: 20, lineHeight: 1.4, color: '#5e6573' }}>
              Incoming page eases morph, yaw, pitch, and zoom from the outgoing parameters.
            </div>
          </div>
        </Step>
      </Steps>
    </div>
  </section>
);

const MachineHinge: Page = () => (
  <section
    style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      background: '#0d1916',
      color: '#fef9ef',
      fontFamily: 'var(--osd-font-body)',
    }}
  >
    <GpuMorphCanvas
      stageId="spike-blinds"
      scene={blindsGlassScene}
      stillSrc={blindsStill}
      params={{ focusX: 0.8, focusY: 0.46 }}
      label="Fluted chromatic glass backdrop over Function Intelligence palette"
      style={{ position: 'absolute', inset: 0 }}
    />
    <div
      style={{
        position: 'relative',
        height: '100%',
        padding: '96px',
        maxWidth: 1080,
        background:
          'linear-gradient(90deg, rgba(13,25,22,0.82) 0%, rgba(13,25,22,0.52) 55%, rgba(13,25,22,0) 100%)',
      }}
    >
      <h1
        style={{
          fontFamily: "'Financier Display', 'Cormorant Garamond', Georgia, serif",
          fontSize: 78,
          fontWeight: 300,
          lineHeight: 0.98,
          margin: 0,
        }}
      >
        Fluted glass in 85 lines of WGSL
      </h1>
      <p
        style={{
          fontSize: 28,
          lineHeight: 1.45,
          color: 'rgba(254, 249, 239, 0.9)',
          marginTop: 28,
          maxWidth: 820,
        }}
      >
        Replaces 1,790 lines of custom Three.js and WebGL fallback boilerplate with precompiled vgpu
        WGSL and Dawn stills.
      </p>
    </div>
  </section>
);

const DataAndDrill: Page = () => (
  <section
    style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      padding: '64px 80px',
      background: 'var(--osd-bg)',
      color: 'var(--osd-text)',
      fontFamily: 'var(--osd-font-body)',
      display: 'grid',
      gridTemplateColumns: '1.05fr 0.95fr',
      gap: 36,
      alignItems: 'start',
    }}
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <div
          style={{
            fontFamily: 'var(--ve-font-mono)',
            fontSize: 14,
            letterSpacing: '0.12em',
            color: 'var(--ve-accent)',
            textTransform: 'uppercase',
          }}
        >
          Measured pipeline stages
        </div>
        <h2 style={{ margin: '8px 0 0', fontSize: 40, lineHeight: 1.1, fontWeight: 500 }}>
          Single WGSL source drives live WebGPU, Dawn stills, and slides
        </h2>
      </div>
      <LieflatChart
        title="Build & verification step budgets"
        description="Representative stage times across shader compilation, Dawn still output, and bundle builds."
        spec={{
          kind: 'rung-bars',
          unit: 200,
          unitLabel: 'ms',
          data: [
            { label: 'WGSL compile + Dawn reflect', value: 140 },
            { label: 'Headless Dawn still (1080p)', value: 420 },
            { label: 'Vite open-slide bundle', value: 500 },
            { label: 'Chrome GPU frame audit', value: 640 },
          ],
        }}
      />
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <DiagramCanvas
        title="Unified output flow"
        description="Shaders compile once and emit browser modules plus headless PNG stills."
        layout="flow"
        direction="vertical"
        nodes={[
          { id: 'wgsl', label: 'scene.wgsl', detail: 'Authoritative GPU kernel' },
          { id: 'dawn', label: 'vgpu/node + tsdown', detail: 'Validation & fallback stills' },
          {
            id: 'surfaces',
            label: 'Slides · Explainer · Video',
            detail: 'Same GpuSceneDefinition',
          },
        ]}
        edges={[
          { from: 'wgsl', to: 'dawn', label: 'compile + inspect' },
          { from: 'dawn', to: 'surfaces', label: 'render' },
        ]}
      />
      <DrillCard
        drillId="pipeline-detail"
        eyebrow="Artifacture core"
        title="Inspect Dawn still synchronization"
        body="See how print, PPTX, and thumbnail rails resolve pre-rendered PNG fallbacks."
        hint="Open inspection note"
      >
        <div style={{ display: 'grid', gap: 16, fontSize: 18, lineHeight: 1.5 }}>
          <p style={{ margin: 0 }}>
            <strong>Thumbnail &amp; print immunity:</strong> Components inside{' '}
            <code>[data-osd-freeze-motion]</code> or print contexts bypass GPU adapter creation and
            render the matching Dawn still immediately.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Zero canvas cloning:</strong> Transitions freeze the outgoing slide via its Dawn
            snapshot while the incoming page eases uniform values in place on the shared stage
            device.
          </p>
        </div>
      </DrillCard>
    </div>
  </section>
);

const ArchitectureComparison: Page = () => (
  <section
    style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      padding: '72px 96px',
      background: 'var(--osd-bg)',
      color: 'var(--osd-text)',
      fontFamily: 'var(--osd-font-body)',
    }}
  >
    <ComparisonSlide
      spec={comparisonSpec}
      footer={
        <span>
          Validated at authoring time by <code>validateSlideSpec</code> in{' '}
          <code>@artifacture/kit</code>.
        </span>
      }
    />
  </section>
);

export const notes = [
  'Open on the liquid prism resting pose. The shader is precompiled to static JS with zero runtime WGSL parser.',
  'Advance through both step cards while MorphFollowup interpolates the prism into a torus.',
  'Show the fluted chromatic glass backdrop with directional scrim contrast.',
  'Walk through build/verification timings and open the interactive DrillSheet.',
  'Summarize the clean separation between stock @open-slide/core and @artifacture/* primitives.',
];

export default [
  Cover,
  MorphFollowup,
  MachineHinge,
  DataAndDrill,
  ArchitectureComparison,
] satisfies Page[];

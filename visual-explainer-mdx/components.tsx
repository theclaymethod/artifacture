import React, { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { wrapWords } from './diagram-layout';
import { assertSupportedPreset, type BuiltinPreset } from './preset-policy.mjs';
export { DiagramCanvas } from './diagram-canvas';
export { AsciiImage, AsciiSweep } from './ascii-effects';
export { AsciiObject } from './ascii-object';
export { VhsEffect } from './vhs-effect';
export { ModelView, createModelView, modelAsset } from './model-view';
export { createLivingForm } from './living-forms';
export { createProceduralProp } from './procedural-models';
export { OrbitalText } from './orbital-text';
export { TracePath } from './trace-path';
export type { ModelViewProps } from './model-view';
export type { ModelAsset, ModelFactory, ModelSource, ModelFrame, ModelFrameReport, ModelViewController, GlyphMatcherSettings, ParticleSettings } from './model-types';
export type { OrbitalTextProps, OrbitalTextPalette } from './orbital-text';
export type { TracePathProps, TracePathStyle } from './trace-path';
export type { AsciiImageProps, AsciiSweepProps } from './ascii-effects';
export type { AsciiModel, AsciiObjectProps } from './ascii-object';
export type { VhsEffectProps } from './vhs-effect';
export { CodeBlock, DiffBlock, TerminalBlock, JsonTree, Quiz } from './code-blocks';
export type { CodeBlockProps, DiffRow, DiffBlockProps, TerminalBlockProps, JsonTreeProps, JsonTreePrimitive, JsonTreeRecord, JsonTreeData, QuizProps } from './code-blocks';
export { Pipeline, DecisionMatrix, RiskLedger } from './content-blocks';
export type { PipelineProps, DecisionMatrixProps, RiskLedgerProps } from './content-blocks';
export type { DiagramCanvasProps, DiagramEdge, DiagramLane, DiagramNode } from './diagram-types';
export { GraphicCanvas, createGraphicScene } from './graphics';
export { projectAxonometric, createAxonometricPlan, createAxonometricPlanMotion, createExplodedScene, createExplodedMotion } from './axonometric-scene';
export type { AxonometricRect, AxonometricBox, AxonometricMark, AxonometricPlanInput, ExplodedPart, ExplodedSceneInput } from './axonometric-scene';
export type { GraphicScene, GraphicObject, GraphicPrimitive, GraphicBounds, GraphicPaint, GraphicPlacement, GraphicClip, GraphicFont, GraphicStrokeRole } from './graphics-types';
export { composeGraphics } from './graphics-composition';
export type { GraphicInstance, GraphicCompositionInput, GraphicComposition } from './graphics-composition';
export { createDiagramScene } from './diagram-scene';
export { createHairlineScene } from './hairline-scene';
export type { HairlineSolid } from './hairline-scene';
export { defineGraphicMotion, sampleScene } from './graphic-motion';
export type { GraphicMotion, GraphicMotionTrack } from './graphic-motion';
export { prepareGraphicRoute } from './graphic-routes';
export type { GraphicPoint, GraphicRouteSegment, GraphicRouteInput, PreparedGraphicRoute } from './graphic-routes';
export { followPath } from './teaching-motion';
export type { RouteTimestamp, FollowPathInput } from './teaching-motion';
export { comparisonWipe } from './comparison-motion';
export type { ComparisonWipeInput } from './comparison-motion';
export { createSourceScene } from './source-scenes';
export type { SourcePart, SourceVersion, SourcePosition, SourceRange, SourceLayout, SourceCell, SourceSceneInput, PreparedSourceScene } from './source-scenes';
export { focusSourceRange, editWithIdentity } from './narrated-motion';
export type { SourceEdit, SourceCueBinding, SourceCueFocusInput, SourceCueFocus } from './narrated-motion';
export { createSlideScene, sequenceSlides, sampleSlideSequence, GraphicSlide } from './graphic-slides';
export type { GraphicSlideScene, GraphicSlideSequence } from './graphic-slides';
export { GraphicVideo } from './graphic-video';
export { NativeClip, NativeStill, validateNativeClipAsset } from './native-clip';
export { DagCanvas } from './dag-canvas';
export type { DagCanvasProps } from './dag-canvas';
export { prepareDag, createDagScene, createDagDiagram, dagNeighborhood, focusDagScene, createDagReveal } from './dag-scene';
export type { DagNode, DagInput, DagEdge, PreparedDag, DagNeighborhood } from './dag-scene';
export type { NativeClipAsset, NativeClipPlacement } from './native-clip';
export { DataChart } from './charts';
export type { ChartDatum, DataChartProps } from './charts';
export { LieflatChart } from './lieflat-charts';
export type { LieflatChartProps, LieflatChartSpec, RungBarsSpec, UnitFieldSpec, BarcodeSpec, BubbleMatrixSpec, ThreadsSpec } from './lieflat-types';
export { DiagramWalkthrough } from './diagram-walkthrough';
export type { DiagramWalkthroughProps, DiagramWalkthroughStep } from './diagram-walkthrough';

declare global {
  interface Window {
    mermaid?: {
      initialize(config: MermaidConfiguration): void;
      render(id: string, chart: string): Promise<{ svg: string }>;
    };
  }
}

type MermaidThemeVariables = {
  background: string;
  primaryColor: string;
  primaryTextColor: string;
  primaryBorderColor: string;
  lineColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  fontFamily: string;
};

type MermaidConfiguration = {
  startOnLoad: boolean;
  securityLevel: 'strict';
  theme: 'base';
  themeVariables: MermaidThemeVariables;
};

// Built-in preset names, plus any slug resolvable from the external
// design-system registry (see docs/design-systems.md). `(string & {})` keeps
// literal autocompletion for the built-ins while admitting registry names.
export type VisualPreset = BuiltinPreset | (string & {});

/* Presentation deck engine + primitives (fixed-stage interactive decks).
   Re-exported here so users keep a single import entry; implementation lives
   in ./presentation. The roster-sync guard in scripts/ve-mdx/check.mjs parses
   this re-export block alongside the `export function` declarations below. */
export {
  PresentationDeck,
  PresentationSlide,
  DrillCard,
  DrillChip,
  DrillSheet,
  CloseX,
  LadderDiagram,
  FanoutDiagram,
  LayerExplorer,
  PullQuote,
  Metric,
  StatRow,
  HairlineList,
  Stepper,
  CodePanel,
  MonoLabel,
  DisplayText,
  IconChip,
  ShineOverlay,
  IconBase,
  IconFile,
  IconTool,
  IconAction,
  IconLoop,
  IconGauge,
  IconTag,
  IconFit,
  IconFilter,
  IconCorpus,
  IconArrowDown,
  IconArrowRight,
  trackShine,
  useEscape,
  usePresentationStateNavigation,
} from './presentation';
export type {
  PresentationTone,
  PresentationSlideProps,
  PresentationDeckProps,
  PresentationStateNavigationOptions,
  LadderStage,
  FanoutOutput,
  ExplorerLayer,
  HairlineItem,
} from './presentation';
export {
  fitStage,
  clampSlideIndex,
  shouldDismissDrillSheet,
  tint,
  solidTint,
  presentationEase,
} from './presentation-core';

type ShellProps = {
  title: string;
  eyebrow?: string;
  summary?: string;
  preset?: VisualPreset;
  reviewTools?: boolean;
  children: ReactNode;
};

type SectionProps = {
  title: string;
  kicker?: string;
  children: ReactNode;
};

type MermaidBlockProps = {
  chart: string;
  caption?: string;
};

type SlideDeckProps = {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  orientation?: 'vertical' | 'horizontal';
  preset?: VisualPreset;
  reviewTools?: boolean;
};

type SlideProps = {
  title: string;
  kicker?: string;
  tone?: 'dark' | 'light' | 'accent';
  children: ReactNode;
};

type PosterCanvasProps = {
  eyebrow?: string;
  title: string;
  stat?: string;
  footer?: string;
  preset?: VisualPreset;
  reviewTools?: boolean;
  children: ReactNode;
};

type Annotation = {
  id: number;
  target: string;
  text: string;
  note: string;
};

export function ExplainerShell({
  title,
  summary,
  preset = 'hairline',
  reviewTools = true,
  children,
}: ShellProps) {
  assertSupportedPreset(preset);
  return (
    <main className={`ve-shell min-h-screen bg-[var(--ve-bg)] text-[var(--ve-text)] [font-family:var(--ve-font-body)]${reviewTools ? ' ve-has-review' : ''}`} data-ve-preset={preset}>
      <div className="ve-shell-inner mx-auto flex w-full max-w-[var(--ve-page-max)] flex-col gap-[var(--ve-section-gap)] px-5 py-8 sm:px-8 lg:px-10">
        <header className="ve-shell-header grid gap-6">
          <div>
            <h1 className="max-w-[var(--ve-shell-title-measure,18ch)] text-balance text-[length:var(--ve-shell-title-size)] leading-[1.04] tracking-normal text-[var(--ve-heading)] [font-family:var(--ve-font-display)] [font-weight:var(--ve-display-weight)]">
              {title}
            </h1>
            {summary ? <p className="mt-6 max-w-[52ch] text-[length:var(--ve-shell-summary-size)] leading-[1.5] text-[var(--ve-muted)]">{summary}</p> : null}
          </div>
        </header>
        {children}
      </div>
      {reviewTools ? <AnnotationLayer /> : null}
    </main>
  );
}

export function Section({ title, children }: SectionProps) {
  return (
    <section className="ve-section grid min-w-0 gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="ve-section-heading">
        <h2 className="text-2xl tracking-normal text-[var(--ve-heading)] [font-family:var(--ve-font-display)] [font-weight:var(--ve-heading-weight)]">{title}</h2>
      </div>
      <div className="ve-section-body min-w-0">{children}</div>
    </section>
  );
}

export function Callout({ children }: { children: ReactNode }) {
  return <div className="ve-callout text-[var(--ve-text)]">{children}</div>;
}

export function MermaidBlock({ chart, caption }: MermaidBlockProps) {
  const rawId = useId().replace(/:/g, '');
  const hostRef = useRef<HTMLDivElement | null>(null);
  const wrappedChart = useMemo(() => wrapMermaidLabels(chart), [chart]);
  const [scale, setScale] = useState(1);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let media: MediaQueryList | null = null;
    async function render() {
      const host = hostRef.current;
      if (!host) return;
      await loadMermaid();
      const mermaid = window.mermaid;
      if (cancelled || !mermaid) return;
      const styles = getComputedStyle(document.documentElement);
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        themeVariables: {
          background: styles.getPropertyValue('--ve-diagram-bg').trim() || '#09090b',
          primaryColor: styles.getPropertyValue('--ve-node-bg').trim() || '#18181b',
          primaryTextColor: styles.getPropertyValue('--ve-heading').trim() || '#fafafa',
          primaryBorderColor: styles.getPropertyValue('--ve-node-stroke').trim() || '#71717a',
          lineColor: styles.getPropertyValue('--ve-accent').trim() || '#5eead4',
          secondaryColor: styles.getPropertyValue('--ve-panel').trim() || '#18181b',
          tertiaryColor: styles.getPropertyValue('--ve-diagram-bg').trim() || '#09090b',
          fontFamily: styles.getPropertyValue('--ve-font-body').trim() || 'ui-sans-serif',
        },
      });
      const result = await mermaid.render(`ve-mermaid-${rawId}`, wrappedChart);
      if (!cancelled) {
        host.replaceChildren(parseMermaidSvg(result.svg));
        requestAnimationFrame(() => {
          if (!cancelled) fitMermaidForeignObjects(host);
        });
      }
    }
    render();
    media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', render);
    return () => {
      cancelled = true;
      media?.removeEventListener('change', render);
    };
  }, [wrappedChart, rawId]);

  return (
    <figure className={`rounded-[var(--ve-radius)] border border-[color:var(--ve-rule)] bg-[var(--ve-panel)] ${expanded ? 'fixed inset-4 z-50 overflow-auto p-5' : 'p-5'}`} data-ve-mermaid-shell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {caption ? <figcaption className="text-sm text-[var(--ve-muted)]">{caption}</figcaption> : <span />}
        <div className="flex gap-2">
          <button className="min-h-11 min-w-11 border border-[color:var(--ve-rule)] px-3 py-2 text-xs text-[var(--ve-muted)]" onClick={() => setScale((value) => Math.max(0.7, value - 0.1))} type="button">-</button>
          <button className="min-h-11 min-w-11 border border-[color:var(--ve-rule)] px-3 py-2 text-xs text-[var(--ve-muted)]" onClick={() => setScale(1)} type="button">1x</button>
          <button className="min-h-11 min-w-11 border border-[color:var(--ve-rule)] px-3 py-2 text-xs text-[var(--ve-muted)]" onClick={() => setScale((value) => Math.min(1.8, value + 0.1))} type="button">+</button>
          <button className="min-h-11 min-w-11 border border-[color:var(--ve-rule)] px-3 py-2 text-xs text-[var(--ve-muted)]" onClick={() => setExpanded((value) => !value)} type="button">{expanded ? 'Close' : 'Expand'}</button>
        </div>
      </div>
      <div className="overflow-auto" style={{ cursor: 'grab' }}>
        <div ref={hostRef} style={{ display: 'inline-block', maxWidth: '100%', overflowX: 'auto', overflowY: 'auto', transform: `scale(${scale})`, transformOrigin: 'top left' }} />
      </div>
    </figure>
  );
}

function loadMermaid() {
  if (window.mermaid) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>('script[data-ve-mermaid]');
  if (existing) {
    return new Promise<void>((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Mermaid')), { once: true });
    });
  }
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.dataset.veMermaid = 'true';
    script.src = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Mermaid'));
    document.head.appendChild(script);
  });
}

function parseMermaidSvg(svgText: string) {
  const document = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (document.querySelector('parsererror') || document.documentElement.localName !== 'svg') {
    throw new Error('Mermaid returned invalid SVG');
  }
  const svg = document.documentElement;
  for (const element of svg.querySelectorAll('script, iframe, object, embed, link')) element.remove();
  for (const element of [svg, ...svg.querySelectorAll('*')]) {
    for (const attribute of element.attributes) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith('on') || ((name === 'href' || name === 'xlink:href') && /^(?:javascript:|data:text\/html)/.test(value))) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  return window.document.importNode(svg, true);
}

function fitMermaidForeignObjects(host: HTMLElement) {
  const svg = host.querySelector<SVGSVGElement>('svg');
  const viewBox = svg?.viewBox.baseVal;
  let maxRight = viewBox ? viewBox.x + viewBox.width : 0;
  let maxBottom = viewBox ? viewBox.y + viewBox.height : 0;

  for (const node of host.querySelectorAll<SVGForeignObjectElement>('foreignObject')) {
    node.style.overflow = 'hidden';
    const width = Number(node.getAttribute('width')) || node.getBoundingClientRect().width;
    const height = Number(node.getAttribute('height')) || node.getBoundingClientRect().height;
    const child = node.firstElementChild instanceof HTMLElement ? node.firstElementChild : null;
    if (child) {
      child.style.maxWidth = 'none';
      child.style.whiteSpace = 'normal';
    }
    const neededWidth = Math.max(width, node.scrollWidth + 12, child?.scrollWidth ? child.scrollWidth + 12 : 0);
    const neededHeight = Math.max(height, node.scrollHeight + 6, child?.scrollHeight ? child.scrollHeight + 6 : 0);
    node.setAttribute('width', String(Math.ceil(neededWidth)));
    node.setAttribute('height', String(Math.ceil(neededHeight)));
    const x = Number(node.getAttribute('x')) || 0;
    const y = Number(node.getAttribute('y')) || 0;
    maxRight = Math.max(maxRight, x + Math.ceil(neededWidth) + 12);
    maxBottom = Math.max(maxBottom, y + Math.ceil(neededHeight) + 12);
  }

  if (svg && viewBox) {
    const nextWidth = Math.ceil(Math.max(viewBox.width, maxRight - viewBox.x));
    const nextHeight = Math.ceil(Math.max(viewBox.height, maxBottom - viewBox.y));
    if (nextWidth !== viewBox.width || nextHeight !== viewBox.height) {
      svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${nextWidth} ${nextHeight}`);
      svg.setAttribute('width', String(nextWidth));
      svg.setAttribute('height', String(nextHeight));
    }
  }
}

function wrapMermaidLabels(chart: string) {
  return chart.split('\n').map((line) => line.replace(
    /(\b[A-Za-z][\w-]*\b)(\[\[|\[\(|\[|\{\{|\{|\(\(|\()("[^"]+"|'[^']+'|[^\]})\n]+)(\]\]|\]\)|\]|\}\}|\}|\)\)|\))/g,
    (match, id, open, rawLabel, close) => {
      const quote = rawLabel.startsWith('"') || rawLabel.startsWith("'") ? rawLabel[0] : '';
      const label = quote ? rawLabel.slice(1, -1) : rawLabel;
      const wrapped = wrapMermaidLabelText(label);
      if (wrapped === label) return match;
      return `${id}${open}${quote}${wrapped}${quote}${close}`;
    },
  )).join('\n');
}

function wrapMermaidLabelText(label: string) {
  if (label.length <= 18 || /<br\s*\/?>/i.test(label) || label.includes('\n')) return label;
  const lines = wrapWords(label, 18);
  return lines.length > 1 ? lines.join('<br/>') : label;
}

export function SlideDeck({
  title,
  eyebrow,
  children,
  orientation = 'vertical',
  preset = 'hairline',
  reviewTools = true,
}: SlideDeckProps) {
  assertSupportedPreset(preset);
  const isHorizontal = orientation === 'horizontal';
  return (
    <main
      className={`h-screen scroll-smooth bg-[var(--ve-bg)] text-[var(--ve-text)] [font-family:var(--ve-font-body)] ${
        isHorizontal
          ? 'flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory'
          : 'overflow-y-auto snap-y snap-mandatory'
      }`}
      data-ve-deck={orientation}
      data-ve-preset={preset}
      // Autofit safety net: `--min-font-size` is a real floor, not decoration —
      // Slide's body-text font-size is computed as `clamp(var(--min-font-size), <fluid>, <cap>)`,
      // so shrinking the fluid term below this floor at narrow viewports still
      // renders at (at least) --min-font-size instead of continuing to shrink.
      // SAFETY: React's standard CSSProperties excludes custom properties, but this
      // declaration supplies exactly the documented --min-font-size token above.
      style={{ '--min-font-size': '16px' } as React.CSSProperties}
    >
      <nav aria-label="Presentation title" className="fixed left-4 top-4 z-40 max-w-[calc(100%-2rem)] bg-[var(--ve-nav-bg)] px-3 py-2 text-sm text-[var(--ve-muted)]">
        {title}
        {eyebrow ? <span className="ml-3">{eyebrow}</span> : null}
      </nav>
      {children}
      {reviewTools ? <AnnotationLayer /> : null}
    </main>
  );
}

export function Slide({ title, kicker, tone = 'dark', children }: SlideProps) {
  return (
    <section
      className="flex min-h-screen min-w-full snap-start flex-col justify-between overflow-hidden bg-[var(--ve-slide-bg)] px-6 py-20 text-[var(--ve-slide-text)] sm:px-10 lg:px-16"
      data-ve-slide
      data-ve-tone={tone}
    >
      <div className="grid min-h-0 flex-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)] lg:items-end">
        <div className="min-w-0 self-start">
          <h1 className="max-w-5xl text-5xl leading-[0.95] tracking-normal sm:text-7xl lg:text-8xl [font-family:var(--ve-font-display)] [font-weight:var(--ve-display-weight)]">
            {title}
          </h1>
          {kicker ? <p className="mt-5 text-base text-[var(--ve-slide-muted)]">{kicker}</p> : null}
        </div>
        <div className="min-w-0 border-l border-[color:var(--ve-slide-rule)] pl-6 text-[clamp(var(--min-font-size),3vw,1.125rem)] leading-8 sm:text-[clamp(var(--min-font-size),2.2vw,1.25rem)]">{children}</div>
      </div>
    </section>
  );
}

export function PosterCanvas({ eyebrow, title, stat, footer, preset = 'hairline', reviewTools = true, children }: PosterCanvasProps) {
  assertSupportedPreset(preset);
  return (
    <main className="min-h-screen bg-[var(--ve-bg)] p-4 text-[var(--ve-text)] sm:p-8 [font-family:var(--ve-font-body)]" data-ve-preset={preset}>
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] items-center justify-center sm:min-h-[calc(100vh-4rem)]">
        <section
          className="relative grid w-full max-w-[1200px] rounded-[var(--ve-poster-radius)] border border-[color:var(--ve-poster-rule)] bg-[var(--ve-poster-bg)] p-[5%] text-[var(--ve-poster-text)] lg:aspect-[16/10]"
          data-ve-label={title}
          data-ve-poster
        >
          <div className="relative z-10 grid h-full gap-10 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.8fr)] md:gap-[6%]">
            <div className="flex min-w-0 flex-col justify-between">
              <div>
                <h1 className="max-w-[14ch] text-balance text-[clamp(2.8rem,8vw,5rem)] leading-[1.04] tracking-normal [font-family:var(--ve-font-display)] [font-weight:var(--ve-display-weight)]">
                  {title}
                </h1>
                {eyebrow ? <p className="mt-[4%] text-[clamp(1rem,1.5vw,1.125rem)] leading-[1.5] text-[var(--ve-poster-muted)]">{eyebrow}</p> : null}
              </div>
              {footer ? (
                <p className="max-w-[42ch] border-t border-[color:var(--ve-poster-rule)] pt-[3%] text-base leading-[1.5] text-[var(--ve-poster-muted)]">
                  {footer}
                </p>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-col justify-between border-t border-[color:var(--ve-poster-rule)] pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-[10%]">
              {stat ? <div className="text-[clamp(4rem,12vw,9rem)] leading-none tracking-normal [font-family:var(--ve-font-mono)]">{stat}</div> : null}
              <div className="text-[clamp(1rem,1.8vw,1.35rem)] leading-[1.5] text-[var(--ve-poster-muted)] [&_h2]:mb-3 [&_h2]:text-balance [&_h2]:font-semibold [&_h2]:text-[var(--ve-poster-text)]">{children}</div>
            </div>
          </div>
        </section>
      </div>
      {reviewTools ? <AnnotationLayer /> : null}
    </main>
  );
}

function AnnotationLayer() {
  const [enabled, setEnabled] = useState(false);
  const [target, setTarget] = useState<{ path: string; text: string } | null>(null);
  const [note, setNote] = useState('');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [copied, setCopied] = useState(false);
  const payload = useMemo(() => JSON.stringify({ annotations }, null, 2), [annotations]);

  useEffect(() => {
    if (!enabled) return;
    const onClick = (event: MouseEvent) => {
      const element = event.target instanceof HTMLElement ? event.target : null;
      if (!element || element.closest('[data-ve-review-ui]')) return;
      event.preventDefault();
      event.stopPropagation();
      setTarget({ path: describeElement(element), text: element.innerText?.trim().slice(0, 160) || element.tagName.toLowerCase() });
      setNote('');
      setCopied(false);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [enabled]);

  function save() {
    if (!target || !note.trim()) return;
    setAnnotations((items) => [...items, { id: items.length + 1, target: target.path, text: target.text, note: note.trim() }]);
    setTarget(null);
    setNote('');
    setCopied(false);
  }

  async function copy() {
    await navigator.clipboard?.writeText(payload);
    setCopied(true);
  }

  return (
    <aside
      className="ve-review-panel z-50 flex w-[min(420px,calc(100vw-32px))] flex-col gap-3 rounded-[var(--ve-radius)] border border-[color:var(--ve-rule)] bg-[var(--ve-review-bg)] p-4 text-sm text-[var(--ve-text)] [font-family:var(--ve-font-body)]"
      data-ve-review-ui
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--ve-accent)] [font-family:var(--ve-font-mono)]">review</p>
          <p className="mt-1 text-[var(--ve-muted)]">{enabled ? 'Click the page to annotate.' : 'Point-and-click feedback is off.'}</p>
        </div>
        <button
          className={`min-h-11 border px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] ${
            enabled ? 'border-[var(--ve-accent)] bg-[var(--ve-accent)] text-[var(--ve-accent-contrast)]' : 'border-[color:var(--ve-rule)] bg-[var(--ve-panel)] text-[var(--ve-muted)]'
          }`}
          onClick={() => setEnabled((value) => !value)}
          type="button"
        >
          {enabled ? 'On' : 'Annotate'}
        </button>
      </div>

      {target ? (
        <div className="rounded-[var(--ve-radius)] border border-[color:var(--ve-accent)] bg-[var(--ve-accent-soft)] p-3">
          <p className="text-xs text-[var(--ve-accent)] [font-family:var(--ve-font-mono)]">{target.path}</p>
          <p className="mt-2 max-h-16 overflow-y-auto text-xs leading-5 text-[var(--ve-muted)]">{target.text}</p>
          <textarea
            className="mt-3 min-h-24 w-full resize-y border border-[color:var(--ve-rule)] bg-[var(--ve-bg)] p-3 text-sm text-[var(--ve-text)] outline-none focus:border-[var(--ve-accent)]"
            onChange={(event) => setNote(event.target.value)}
            placeholder="What should change here?"
            value={note}
          />
          <div className="mt-3 flex gap-2">
            <button className="min-h-11 bg-[var(--ve-accent)] px-3 py-2 text-[var(--ve-accent-contrast)]" onClick={save} type="button">
              Save note
            </button>
            <button className="min-h-11 border border-[color:var(--ve-rule)] px-3 py-2 text-[var(--ve-muted)]" onClick={() => setTarget(null)} type="button">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {annotations.length ? (
        <div className="max-h-48 overflow-y-auto border border-[color:var(--ve-rule)]">
          {annotations.map((item) => (
            <div className="border-b border-[color:var(--ve-rule)] p-3 last:border-b-0" key={item.id}>
              <p className="text-xs text-[var(--ve-faint)] [font-family:var(--ve-font-mono)]">
                #{item.id} {item.target}
              </p>
              <p className="mt-1 text-[var(--ve-text)]">{item.note}</p>
            </div>
          ))}
        </div>
      ) : null}

      <button
        className="min-h-11 border border-[color:var(--ve-rule)] px-3 py-2 text-left text-xs uppercase tracking-[0.14em] text-[var(--ve-muted)] disabled:cursor-not-allowed disabled:opacity-40 [font-family:var(--ve-font-mono)]"
        disabled={!annotations.length}
        onClick={copy}
        type="button"
      >
        {copied ? 'Copied feedback JSON' : `Copy feedback JSON (${annotations.length})`}
      </button>
    </aside>
  );
}

function describeElement(element: HTMLElement) {
  const label = element.getAttribute('aria-label') || element.getAttribute('data-ve-label');
  if (label) return `${element.tagName.toLowerCase()}[label="${label}"]`;
  if (element.id) return `#${element.id}`;
  const parts = [];
  let current: HTMLElement | null = element;
  while (current && current !== document.body && parts.length < 4) {
    const tag = current.tagName.toLowerCase();
    const text = current.innerText?.trim().split(/\s+/).slice(0, 4).join(' ');
    parts.unshift(text ? `${tag}("${text}")` : tag);
    current = current.parentElement;
  }
  return parts.join(' > ');
}

export { DiagramDesignFigure, diagramDesignExamples, type DiagramDesignFigureProps, type DiagramDesignExample } from './diagram-design-figure';
export * from './hairline-figures';

export { NativeLivingForm, nativeLivingFormSettings } from "./native-living-forms";
export type { NativeLivingFormProps } from "./native-living-forms";

export { NativeProceduralProp } from "./native-procedural-props";
export type { NativeProceduralPropProps } from "./native-procedural-props";

export { PrLensFigure, prLensExamples } from './pr-lens-figure';
export type { PrLensExample } from './pr-lens-figure';

export { ChalkboardFigure, chalkboardExamples } from './chalkboard-figure';
export type { ChalkboardExample } from './chalkboard-figure';

export { SourceFigure, prepareSourceDocument, seekSourceFrame } from './source-figure';
export type { SourceDocument, SourceTiming, SourceFigureProps } from './source-figure';

import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { diagramTypography, edgePath, labelLeaderEndpoint, layoutDiagram, wrapWords, type LaidOutNode } from './diagram-layout';
import type { DiagramCanvasProps } from './diagram-types';
export type { DiagramCanvasProps, DiagramEdge, DiagramLane, DiagramNode } from './diagram-types';
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
export type VisualPreset =
  | 'lieflat'
  | 'mono-color'
  | 'algebrica'
  | 'oa-design'
  | 'mono-industrial'
  | 'nothing'
  | 'blueprint'
  | 'editorial'
  | 'paper-ink'
  | 'terminal'
  | 'custom'
  | (string & {});

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

type PipelineProps = {
  steps: Array<string | { title: string; body?: string }>;
};

type PipelineStep = PipelineProps['steps'][number];

type DecisionMatrixProps = {
  rows: Array<Record<string, ReactNode>>;
};

type RiskLedgerProps = {
  risks: Array<{ risk: string; signal: string; mitigation: string; level?: 'low' | 'medium' | 'high' }>;
};

type CodeBlockProps = {
  code: string;
  language: string;
  filename?: string;
  highlightLines?: number[];
  annotations?: Array<{ line: number; note: string }>;
  diff?: 'unified';
  html?: string;
};

type DiffRow = {
  kind: 'context' | 'add' | 'remove' | 'hunk';
  oldNo?: number;
  newNo?: number;
  code: string;
  html?: string;
};

type DiffBlockProps = {
  patch?: string;
  before?: string;
  after?: string;
  language?: string;
  filename?: string;
  mode?: 'unified' | 'split';
  rows?: DiffRow[];
};

type TerminalBlockProps = {
  content: string;
  title?: string;
  showPrompt?: boolean;
};

type JsonTreeProps = {
  data: JsonTreeData;
  collapsedDepth?: number;
};

type JsonTreePrimitive = null | boolean | number | string;
type JsonTreeRecord = { readonly [key: string]: JsonTreeData };
type JsonTreeData = JsonTreePrimitive | readonly JsonTreeData[] | JsonTreeRecord;

type QuizProps = {
  questions: Array<{
    q: string;
    options: Array<{ text: string; correct?: boolean; why: string }>;
  }>;
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
  preset = 'lieflat',
  reviewTools = true,
  children,
}: ShellProps) {
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

export function Pipeline({ steps }: PipelineProps) {
  return (
    <ol className="ve-pipeline grid md:grid-cols-2 xl:grid-cols-4">
      {steps.map((step, index) => {
        const item = normalizePipelineStep(step);
        return (
          <li key={`${item.title}-${index}`} className="ve-pipeline-item min-w-0">
            <div className="text-sm text-[var(--ve-accent)] [font-family:var(--ve-font-mono)]">{String(index + 1).padStart(2, '0')}</div>
            <h3 className="mt-4 text-xl tracking-normal text-[var(--ve-heading)] [font-family:var(--ve-font-display)] [font-weight:var(--ve-heading-weight)]">{item.title}</h3>
            {item.body ? <p className="mt-3 text-base leading-6 text-[var(--ve-muted)]">{item.body}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}

function normalizePipelineStep(step: PipelineStep): { title: string; body?: string } {
  return isPipelineTitle(step) ? { title: step } : step;
}

function isPipelineTitle(step: PipelineStep): step is string {
  return Object.prototype.toString.call(step) === '[object String]';
}

export function DecisionMatrix({ rows }: DecisionMatrixProps) {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return (
    <div className="ve-table-shell overflow-x-auto rounded-[var(--ve-radius)] border border-[color:var(--ve-rule)]">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead className="bg-[var(--ve-panel-strong)] text-sm text-[var(--ve-muted)]">
          <tr>
            {columns.map((column) => (
              <th key={column} className="border-b border-[color:var(--ve-rule)] px-4 py-3 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="odd:bg-[var(--ve-row)]">
              {columns.map((column) => (
                <td key={column} className="border-b border-[color:var(--ve-rule)] px-4 py-4 align-top text-[var(--ve-muted)]">
                  {row[column]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RiskLedger({ risks }: RiskLedgerProps) {
  return (
    <div className="ve-risk-ledger grid md:grid-cols-3">
      {risks.map((risk) => (
        <article data-ve-risk-level={risk.level ?? 'medium'} key={risk.risk} className="ve-risk-card">
          {risk.level ? <p className="text-sm text-[var(--ve-faint)]">{risk.level} risk</p> : null}
          <h3 className="mt-3 text-lg tracking-normal text-[var(--ve-heading)] [font-family:var(--ve-font-display)] [font-weight:var(--ve-heading-weight)]">{risk.risk}</h3>
          <p className="mt-3 text-base leading-6 text-[var(--ve-muted)]">
            <span className="text-[var(--ve-text)]">Signal:</span> {risk.signal}
          </p>
          <p className="mt-2 text-base leading-6 text-[var(--ve-muted)]">
            <span className="text-[var(--ve-text)]">Mitigation:</span> {risk.mitigation}
          </p>
        </article>
      ))}
    </div>
  );
}

export function DiagramCanvas({ nodes, edges, layout = 'flow', direction = 'auto', lanes, dates, title = 'Diagram', description }: DiagramCanvasProps) {
  const rawId = useId().replace(/:/g, '');
  const figureRef = useRef<HTMLElement>(null);
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  const candidates = useMemo(() => {
    const initial = layoutDiagram(nodes, edges, layout, lanes, dates, direction);
    if (layout !== 'flow' || direction !== 'auto') return { initial, horizontal: initial, vertical: initial };
    return {
      initial,
      horizontal: layoutDiagram(nodes, edges, layout, lanes, dates, 'horizontal'),
      vertical: layoutDiagram(nodes, edges, layout, lanes, dates, 'vertical'),
    };
  }, [nodes, edges, layout, lanes, dates, direction]);
  useLayoutEffect(() => {
    const figure = figureRef.current;
    if (!figure || layout !== 'flow' || direction !== 'auto') return;
    const updateWidth = (width: number) => {
      if (width <= 0) return;
      const next = Math.floor(width);
      setAvailableWidth((previous) => previous === next ? previous : next);
    };
    updateWidth(figure.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) updateWidth(entry.contentRect.width);
    });
    observer.observe(figure);
    return () => observer.disconnect();
  }, [layout, direction]);
  const diagram = useMemo(() => {
    if (availableWidth === null || layout !== 'flow' || direction !== 'auto') return candidates.initial;
    const { horizontal, vertical } = candidates;
    if (horizontal.viewBox.width <= availableWidth) return horizontal;
    return vertical.viewBox.width < horizontal.viewBox.width ? vertical : horizontal;
  }, [availableWidth, candidates, layout, direction]);
  const arrowId = `ve-arrow-${rawId}`;
  const titleId = `ve-diagram-title-${rawId}`;
  const descriptionId = `ve-diagram-desc-${rawId}`;
  const accessibleDescription = description ?? nodes.map((node) => {
    const targets = diagram.edges.filter(({ edge }) => edge.from === node.id).map(({ edge, to }) => `${edge.label ? `${edge.label}: ` : ''}${to.label}${edge.style === 'bidirectional' ? ' (both directions)' : ''}`);
    return `${node.label}${node.detail ? `: ${node.detail}` : ''}.${targets.length ? ` Connects to ${targets.join('; ')}.` : ''}`;
  }).join(' ');
  return (
    <figure className="ve-diagram-shell ve-diagram-has-mobile" ref={figureRef}>
      <div aria-label={`${title}, scroll to explore`} className="ve-diagram-variant ve-diagram-variant-desktop" data-diagram-role="diagram-desktop" data-ve-variant="desktop" role="region" tabIndex={0}>
        <svg
          aria-labelledby={`${titleId} ${descriptionId}`}
          className="h-auto w-full"
          data-diagram-role="diagram"
          role="img"
          style={{ aspectRatio: `${diagram.viewBox.width} / ${diagram.viewBox.height}`, minWidth: diagram.viewBox.width, maxWidth: diagram.viewBox.width, marginInline: 'auto' }}
          viewBox={`${diagram.viewBox.x} ${diagram.viewBox.y} ${diagram.viewBox.width} ${diagram.viewBox.height}`}
          width="100%"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title id={titleId}>{title}</title>
          <desc id={descriptionId}>{accessibleDescription || 'No nodes to display.'}</desc>
          <defs>
            <marker id={arrowId} markerHeight="7" markerWidth="7" orient="auto-start-reverse" refX="9" refY="5" viewBox="0 0 10 10">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
            </marker>
          </defs>
          <rect fill="var(--ve-diagram-bg)" height={diagram.viewBox.height} width={diagram.viewBox.width} x={diagram.viewBox.x} y={diagram.viewBox.y} />
          <g data-diagram-role="layer">
            {diagram.lanes.map((lane) => (
              <g data-diagram-role="lane" key={lane.id}>
                {lane.orientation === 'vertical' ? (
                  <>
                    {lane.divider ? <line stroke="var(--ve-diagram-frame)" x1={lane.x + lane.width} x2={lane.x + lane.width} y1={lane.y} y2={lane.y + lane.height} /> : null}
                    <line stroke="var(--ve-diagram-frame)" x1={lane.x + 16} x2={lane.x + lane.width - 16} y1={lane.y + lane.lines.length * 20 + 20} y2={lane.y + lane.lines.length * 20 + 20} />
                  </>
                ) : <line stroke="var(--ve-diagram-frame)" x1={lane.x} x2={lane.x + lane.width} y1={lane.y} y2={lane.y} />}
                <text fill="var(--ve-diagram-ink)" fontFamily="var(--ve-font-body)" fontSize="14" fontWeight="600" textAnchor={lane.orientation === 'vertical' ? 'middle' : 'start'} x={lane.orientation === 'vertical' ? lane.x + lane.width / 2 : lane.x + 16} y={lane.y + 24}>
                  {lane.lines.map((line, index) => <tspan dy={index ? 20 : 0} key={index} x={lane.orientation === 'vertical' ? lane.x + lane.width / 2 : lane.x + 16}>{line}</tspan>)}
                </text>
              </g>
            ))}
            {diagram.timeline.map((tick) => (
              <text fill="var(--ve-diagram-ink)" fontFamily="var(--ve-font-body)" fontSize="14" fontWeight="600" key={tick.label} textAnchor="middle" x={tick.x} y={tick.y}>
                {tick.lines.map((line, index) => <tspan dy={index ? 20 : 0} key={index} x={tick.x}>{line}</tspan>)}
              </text>
            ))}
            {diagram.edges.map(({ edge, from, to, path }, index) => (
              <path
                d={edgePath(path)}
                data-diagram-role="arrow"
                data-diagram-source={`ve-node-${rawId}-${from.order}`}
                data-diagram-source-anchor={diagramNodeAnchor(from, path[0])}
                data-diagram-target={`ve-node-${rawId}-${to.order}`}
                data-diagram-target-anchor={diagramNodeAnchor(to, path.at(-1))}
                data-ve-edge-id={edge.id}
                fill="none"
                key={`${edge.from}-${edge.to}-${index}`}
                markerEnd={`url(#${arrowId})`}
                markerStart={edge.style === 'bidirectional' ? `url(#${arrowId})` : undefined}
                stroke={from.isAccented || to.isAccented ? 'var(--ve-accent)' : 'var(--ve-diagram-muted)'}
                strokeDasharray={edge.style === 'dashed' ? '6 5' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
              />
            ))}
            {diagram.edges.map(({ edge, label }, index) => label ? (
              <g data-diagram-role="arrow-label" key={`${edge.from}-${edge.to}-label-${index}`}>
                {label.leader ? <line stroke="var(--ve-diagram-muted)" strokeWidth="1" x1={label.anchor.x} x2={labelLeaderEndpoint(label).x} y1={label.anchor.y} y2={labelLeaderEndpoint(label).y} /> : null}
                <rect data-diagram-role="arrow-label-mask" fill="var(--ve-diagram-bg)" height={label.height} width={label.width} x={label.x - label.width / 2} y={label.y - label.height / 2} />
                <text fill="var(--ve-diagram-ink)" fontFamily="var(--ve-font-body)" fontSize={diagramTypography.edgeSize} textAnchor="middle" x={label.x} y={label.y - (label.lines.length - 1) * diagramTypography.edgeLeading / 2 + 5}>
                  {label.lines.map((line, lineIndex) => <tspan dy={lineIndex ? diagramTypography.edgeLeading : 0} key={lineIndex} x={label.x}>{line}</tspan>)}
                </text>
              </g>
            ) : null)}
            {diagram.nodes.map((item) => <DiagramNodeGlyph item={item} key={item.id} nodeId={`ve-node-${rawId}-${item.order}`} />)}
            {!nodes.length ? <text fill="var(--ve-diagram-muted)" fontFamily="var(--ve-font-body)" fontSize="16" x="40" y="64">No nodes to display.</text> : null}
          </g>
        </svg>
      </div>
      <MobileSwimlaneVariant diagram={diagram} idPrefix={rawId} title={title} />
    </figure>
  );
}

function MobileSwimlaneVariant({ diagram, idPrefix, title }: { diagram: ReturnType<typeof layoutDiagram>; idPrefix: string; title: string }) {
  const sortedNodes = [...diagram.nodes].sort((a, b) => a.rank - b.rank || a.order - b.order);
  return (
    <div aria-label={title} className="ve-diagram-variant ve-diagram-variant-mobile" data-diagram-role="diagram-mobile" data-ve-variant="mobile" role="group">
      <div className="ve-diagram-mobile-list">
        {sortedNodes.map((node) => {
          const connections = diagram.edges.filter(({ edge }) => edge.from === node.id || (edge.style === 'bidirectional' && edge.to === node.id && edge.from !== node.id));
          const context = [node.lane ? diagram.laneLabels.get(node.lane) ?? node.lane : undefined, node.date].filter(Boolean).join(' · ');
          return (
            <article className="ve-diagram-mobile-node" data-diagram-role="mobile-node" data-ve-accent={node.isAccented ? 'true' : undefined} data-ve-node-id={node.id} id={`ve-mobile-${idPrefix}-${node.order}`} key={node.id}>
              {context ? <p className="ve-diagram-mobile-lane">{context}</p> : null}
              <h3>{node.label}</h3>
              {node.detail ? <p>{node.detail}</p> : null}
              {connections.length ? (
                <ul aria-label={`Connections from ${node.label}`} className="ve-diagram-mobile-connections">
                  {connections.map(({ edge, from, to }, index) => {
                    const target = from.id === node.id ? to : from;
                    return <li key={index}>{edge.label ? `${edge.label}: ` : 'To '}<a href={`#ve-mobile-${idPrefix}-${target.order}`}>{target.label}</a>{edge.style === 'bidirectional' ? ' (both directions)' : ''}</li>;
                  })}
                </ul>
              ) : null}
            </article>
          );
        })}
        {!sortedNodes.length ? <p>No nodes to display.</p> : null}
      </div>
    </div>
  );
}

export function CodeBlock({ code, language, filename, highlightLines = [], annotations = [], diff, html }: CodeBlockProps) {
  const highlighted = html ?? `<pre><code>${escapeHtml(code)}</code></pre>`;
  const highlightSet = new Set(highlightLines);
  const annotationMap = new Map(annotations.map((item) => [item.line, item.note]));
  return (
    <figure className="overflow-hidden rounded-[var(--ve-radius)] border border-[color:var(--ve-code-rule)] bg-[var(--ve-code-bg)] text-[var(--ve-code-text)]" data-ve-code-block>
      <figcaption className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--ve-code-rule)] px-4 py-3 text-sm text-[var(--ve-code-muted)] [font-family:var(--ve-font-mono)]">
        <span>{filename ?? language}</span>
        {diff === 'unified' ? <span>diff</span> : null}
      </figcaption>
      <div className="grid max-h-[620px] overflow-auto">
        <div className="ve-code-shiki" dangerouslySetInnerHTML={{ __html: highlighted }} />
        {highlightSet.size || annotationMap.size ? (
          <ol className="border-t border-[color:var(--ve-code-rule)] px-4 py-3 text-sm text-[var(--ve-code-muted)] [font-family:var(--ve-font-mono)]">
            {Array.from(new Set([...highlightSet, ...annotationMap.keys()])).sort((a, b) => a - b).map((line) => (
              <li className="py-1" key={line}>
                <span className="text-[var(--ve-code-accent)]">L{line}</span>
                {annotationMap.get(line) ? <span className="ml-3 text-[var(--ve-code-text)]">{annotationMap.get(line)}</span> : null}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </figure>
  );
}

export function DiffBlock({ patch, before, after, language = 'text', filename, mode = 'unified', rows }: DiffBlockProps) {
  const diffRows = rows ?? buildDiffRows({ patch, before, after });
  return (
    <figure className="ve-diff-block" data-ve-diff-block>
      <figcaption className="ve-code-caption">
        <span>{filename ?? 'diff'}</span>
        <span>{mode === 'split' ? 'split diff' : `${language} diff`}</span>
      </figcaption>
      {mode === 'split' ? <SplitDiffTable rows={diffRows} /> : <UnifiedDiffTable rows={diffRows} />}
    </figure>
  );
}

function UnifiedDiffTable({ rows }: { rows: DiffRow[] }) {
  return (
    <div className="ve-scroll-x">
      <table className="ve-diff-table">
        <tbody>
          {rows.map((row, index) => (
            <tr data-ve-diff-kind={row.kind} key={`${row.kind}-${row.oldNo ?? 'x'}-${row.newNo ?? 'x'}-${index}`}>
              <td className="ve-diff-gutter">{row.oldNo ?? ''}</td>
              <td className="ve-diff-gutter">{row.newNo ?? ''}</td>
              <td className="ve-diff-mark">{diffGlyph(row.kind)}</td>
              <td className="ve-diff-code" dangerouslySetInnerHTML={{ __html: row.html ?? escapeHtml(row.code) }} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SplitDiffTable({ rows }: { rows: DiffRow[] }) {
  const left = rows.filter((row) => row.kind !== 'add');
  const right = rows.filter((row) => row.kind !== 'remove');
  return (
    <div className="ve-diff-split ve-scroll-x">
      <DiffSide title="Before" rows={left} side="old" />
      <DiffSide title="After" rows={right} side="new" />
    </div>
  );
}

function DiffSide({ title, rows, side }: { title: string; rows: DiffRow[]; side: 'old' | 'new' }) {
  return (
    <div className="ve-diff-side">
      <div className="ve-diff-side-title">{title}</div>
      <table className="ve-diff-table">
        <tbody>
          {rows.map((row, index) => (
            <tr data-ve-diff-kind={row.kind} key={`${side}-${row.oldNo ?? 'x'}-${row.newNo ?? 'x'}-${index}`}>
              <td className="ve-diff-gutter">{side === 'old' ? row.oldNo ?? '' : row.newNo ?? ''}</td>
              <td className="ve-diff-mark">{diffGlyph(row.kind)}</td>
              <td className="ve-diff-code" dangerouslySetInnerHTML={{ __html: row.html ?? escapeHtml(row.code) }} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TerminalBlock({ content, title = 'Terminal', showPrompt = false }: TerminalBlockProps) {
  const lines = showPrompt ? content.split('\n').map((line) => `$ ${line}`).join('\n') : content;
  return (
    <figure className="ve-terminal-block" data-ve-terminal-block>
      <figcaption className="ve-code-caption">
        <span>{title}</span>
      </figcaption>
      <pre className="ve-terminal-content">
        {parseAnsi(lines).map((segment, index) => (
          <span className={segment.className} key={`${segment.text}-${index}`}>{segment.text}</span>
        ))}
      </pre>
    </figure>
  );
}

export function JsonTree({ data, collapsedDepth = 2 }: JsonTreeProps) {
  const rootEntry = parseJsonTreeEntry(data);
  return (
    <div className="ve-json-tree" data-ve-json-tree>
      <JsonNode name="root" entry={rootEntry} depth={0} collapsedDepth={collapsedDepth} root />
    </div>
  );
}

type JsonTreeEntry = JsonLeafEntry | JsonBranchEntry;

type JsonLeafEntry = {
  kind: 'leaf';
  display: string;
  valueType: string;
};

type JsonBranchEntry = {
  kind: 'branch';
  branchType: 'Array' | 'Object';
  children: Array<[string, JsonTreeEntry]>;
};

function JsonNode({ name, entry, depth, collapsedDepth, root = false }: { name: string; entry: JsonTreeEntry; depth: number; collapsedDepth: number; root?: boolean }) {
  if (entry.kind === 'leaf') {
    return (
      <div className="ve-json-leaf">
        {!root ? <span className="ve-json-key">{JSON.stringify(name)}: </span> : null}
        <JsonPrimitive entry={entry} />
      </div>
    );
  }
  const label = `${entry.branchType}(${entry.children.length})`;
  return (
    <details className="ve-json-branch" open={depth < collapsedDepth}>
      <summary>
        {!root ? <span className="ve-json-key">{JSON.stringify(name)}: </span> : null}
        <span className="ve-json-type">{label}</span>
      </summary>
      <div className="ve-json-children">
        {entry.children.map(([key, child]) => (
          <JsonNode collapsedDepth={collapsedDepth} depth={depth + 1} key={key} name={key} entry={child} />
        ))}
      </div>
    </details>
  );
}

function JsonPrimitive({ entry }: { entry: JsonLeafEntry }) {
  return <span data-ve-json-type={entry.valueType}>{entry.display}</span>;
}

function parseJsonTreeEntry(value: JsonTreeData): JsonTreeEntry {
  if (value === null) return { kind: 'leaf', display: 'null', valueType: 'null' };
  if (isJsonTreeList(value)) {
    return {
      kind: 'branch',
      branchType: 'Array',
      children: value.map((item, index) => [String(index), parseJsonTreeEntry(item)]),
    };
  }
  if (isJsonTreeRecord(value)) {
    return {
      kind: 'branch',
      branchType: 'Object',
      children: Object.entries(value).map(([key, child]) => [key, parseJsonTreeEntry(child)]),
    };
  }
  const valueType = jsonValueType(value);
  return {
    kind: 'leaf',
    display: isJsonText(value) ? JSON.stringify(value) : String(value),
    valueType,
  };
}

function isJsonTreeRecord(value: JsonTreeData): value is JsonTreeRecord {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function isJsonTreeList(value: JsonTreeData): value is readonly JsonTreeData[] {
  return Array.isArray(value);
}

function isJsonText(value: JsonTreePrimitive): value is string {
  return Object.prototype.toString.call(value) === '[object String]';
}

function jsonValueType(value: JsonTreePrimitive): string {
  const tag = Object.prototype.toString.call(value);
  return tag.slice(8, -1).toLowerCase();
}

export function Quiz({ questions }: QuizProps) {
  const [answers, setAnswers] = useState<Array<number | null>>(() => questions.map(() => null));
  const answeredCount = answers.filter((answer) => answer !== null).length;
  const score = answers.reduce<number>((sum, answer, index) => {
    if (answer === null) return sum;
    return questions[index]?.options[answer]?.correct ? sum + 1 : sum;
  }, 0);
  return (
    <section className="ve-quiz" data-ve-quiz>
      {questions.map((question, questionIndex) => {
        const selected = answers[questionIndex];
        return (
          <article className="ve-quiz-question" key={question.q}>
            <h3>{question.q}</h3>
            <div className="ve-quiz-options" role="group" aria-label={question.q}>
              {question.options.map((option, optionIndex) => {
                const isSelected = selected === optionIndex;
                const state = selected === null ? 'idle' : option.correct ? 'correct' : isSelected ? 'incorrect' : 'idle';
                return (
                  <button
                    aria-pressed={isSelected}
                    className="ve-quiz-option"
                    data-ve-quiz-state={state}
                    key={option.text}
                    onClick={() => setAnswers((current) => current.map((answer, index) => index === questionIndex ? optionIndex : answer))}
                    type="button"
                  >
                    <span className="ve-quiz-choice">{String.fromCharCode(65 + optionIndex)}</span>
                    <span>{option.text}</span>
                    {isSelected ? <span className="ve-quiz-result">{option.correct ? 'Correct' : 'Incorrect'}</span> : null}
                  </button>
                );
              })}
            </div>
            {selected !== null ? (
              <p className="ve-quiz-feedback" data-ve-quiz-state={question.options[selected]?.correct ? 'correct' : 'incorrect'}>
                {question.options[selected]?.why}
              </p>
            ) : null}
          </article>
        );
      })}
      {answeredCount === questions.length ? (
        <p className="ve-quiz-score">Score: {score}/{questions.length}</p>
      ) : null}
    </section>
  );
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

function diagramNodeAnchor(node: LaidOutNode, point?: { x: number; y: number }) {
  if (!point) return undefined;
  const dot = node['shape'] === 'dot';
  const cx = node.x + node.width / 2;
  const cy = dot ? node.y + 12 : node.y + node.height / 2;
  const halfWidth = dot ? 12 : node.width / 2;
  const halfHeight = dot ? 12 : node.height / 2;
  if (Math.abs(point.y - cy) < 0.5) {
    if (point.x < cx - halfWidth) return 'left-center';
    if (point.x > cx + halfWidth) return 'right-center';
  }
  if (Math.abs(point.x - cx) < 0.5) {
    if (point.y < cy - halfHeight) return 'top-center';
    if (point.y > cy + halfHeight) return 'bottom-center';
  }
  return undefined;
}

function DiagramNodeGlyph({ item, nodeId }: { item: LaidOutNode; nodeId: string }) {
  const glyph = item['shape'] ?? 'rect';
  const centered = glyph === 'diamond' || glyph === 'oval' || glyph === 'dot';
  const textX = centered ? item.x + item.width / 2 : item.x + 20;
  const textTop = glyph === 'dot' ? item.y + 40 : item.y + (item.height - item.textHeight) / 2;
  const labelY = textTop + 16;
  const detailY = textTop + item.labelLines.length * diagramTypography.labelLeading + 8 + 14;
  const stroke = item.isAccented ? 'var(--ve-accent)' : 'var(--ve-node-stroke)';
  const fill = item.isAccented ? 'var(--ve-diagram-accent-fill)' : 'var(--ve-node-bg)';
  return (
    <g data-ve-label={item.label}>
      {glyph === 'oval' ? (
        <rect data-diagram-id={nodeId} data-diagram-role="node" data-ve-node-id={item.id} fill={fill} height={item.height} rx={item.height / 2} stroke={stroke} strokeWidth="1.5" width={item.width} x={item.x} y={item.y} />
      ) : glyph === 'diamond' ? (
        <polygon data-diagram-id={nodeId} data-diagram-role="node" data-ve-node-id={item.id} fill={fill} points={`${item.x + item.width / 2},${item.y} ${item.x + item.width},${item.y + item.height / 2} ${item.x + item.width / 2},${item.y + item.height} ${item.x},${item.y + item.height / 2}`} stroke={stroke} strokeWidth="1.5" />
      ) : glyph === 'dot' ? (
        <circle data-diagram-id={nodeId} data-diagram-role="node" data-ve-node-id={item.id} cx={item.x + item.width / 2} cy={item.y + 12} fill={stroke} r="12" />
      ) : (
        <rect data-diagram-id={nodeId} data-diagram-role="node" data-ve-node-id={item.id} fill={fill} height={item.height} rx="var(--ve-node-radius, 6)" stroke={stroke} strokeWidth="1.5" width={item.width} x={item.x} y={item.y} />
      )}
      <text className="ve-diagram-node-label" fill="var(--ve-diagram-ink)" fontFamily="var(--ve-font-body)" fontSize={diagramTypography.labelSize} fontWeight="600" textAnchor={centered ? 'middle' : 'start'} x={textX} y={labelY}>
        {item.labelLines.map((line, index) => <tspan dy={index ? diagramTypography.labelLeading : 0} key={index} x={textX}>{line}</tspan>)}
      </text>
      {item.detailLines.length ? (
        <text fill="var(--ve-diagram-muted)" fontFamily="var(--ve-font-body)" fontSize={diagramTypography.detailSize} textAnchor={centered ? 'middle' : 'start'} x={textX} y={detailY}>
          {item.detailLines.map((line, index) => <tspan dy={index ? diagramTypography.detailLeading : 0} key={index} x={textX}>{line}</tspan>)}
        </text>
      ) : null}
    </g>
  );
}

function escapeHtml(input: string) {
  return input.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

function diffGlyph(kind: DiffRow['kind']) {
  if (kind === 'add') return '+';
  if (kind === 'remove') return '-';
  if (kind === 'hunk') return '@';
  return ' ';
}

function buildDiffRows({ patch, before, after }: Pick<DiffBlockProps, 'patch' | 'before' | 'after'>): DiffRow[] {
  if (patch) return parseUnifiedDiff(patch);
  if (before !== undefined && after !== undefined) return diffLines(before, after);
  return [];
}

function parseUnifiedDiff(patch: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldLine = 0;
  let newLine = 0;
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith('@@')) {
      const match = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
      oldLine = match ? Number(match[1]) : oldLine;
      newLine = match ? Number(match[2]) : newLine;
      rows.push({ kind: 'hunk', code: line });
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      rows.push({ kind: 'add', newNo: newLine, code: line.slice(1) });
      newLine += 1;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      rows.push({ kind: 'remove', oldNo: oldLine, code: line.slice(1) });
      oldLine += 1;
    } else if (line.startsWith(' ')) {
      rows.push({ kind: 'context', oldNo: oldLine, newNo: newLine, code: line.slice(1) });
      oldLine += 1;
      newLine += 1;
    } else if (line.startsWith('\\ No newline')) {
      continue;
    }
  }
  return rows;
}

function diffLines(before: string, after: string): DiffRow[] {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const table = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const rows: DiffRow[] = [{ kind: 'hunk', code: `@@ -1,${a.length} +1,${b.length} @@` }];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      rows.push({ kind: 'context', oldNo: i + 1, newNo: j + 1, code: a[i] });
      i += 1;
      j += 1;
    } else if (j < b.length && (i === a.length || table[i][j + 1] >= table[i + 1][j])) {
      rows.push({ kind: 'add', newNo: j + 1, code: b[j] });
      j += 1;
    } else if (i < a.length) {
      rows.push({ kind: 'remove', oldNo: i + 1, code: a[i] });
      i += 1;
    }
  }
  return rows;
}

function parseAnsi(input: string) {
  const output: Array<{ text: string; className?: string }> = [];
  let active = '';
  const ansiEscape = String.fromCharCode(27);
  const pattern = new RegExp(`${ansiEscape}\\[([0-9;]*)m`, 'g');
  let last = 0;
  for (const match of input.matchAll(pattern)) {
    if (match.index > last) output.push({ text: input.slice(last, match.index), className: active || undefined });
    active = sgrClass(match[1], active);
    last = match.index + match[0].length;
  }
  if (last < input.length) output.push({ text: input.slice(last), className: active || undefined });
  return output;
}

function sgrClass(code: string, active: string) {
  const parts = code.split(';').filter(Boolean).map(Number);
  if (!parts.length || parts.includes(0)) return '';
  let className = active;
  for (const part of parts) {
    if (part === 1) className = appendClass(className, 've-ansi-bold');
    else if (part === 22) className = removeClass(className, 've-ansi-bold');
    else if (part >= 30 && part <= 37) className = replaceAnsiClass(className, `ve-ansi-fg-${part - 30}`);
    else if (part >= 90 && part <= 97) className = replaceAnsiClass(className, `ve-ansi-fg-${part - 90}-bright`);
  }
  return className;
}

function appendClass(className: string, next: string) {
  return className.split(' ').includes(next) ? className : `${className} ${next}`.trim();
}

function removeClass(className: string, target: string) {
  return className.split(' ').filter((item) => item && item !== target).join(' ');
}

function replaceAnsiClass(className: string, next: string) {
  return appendClass(className.split(' ').filter((item) => !item.startsWith('ve-ansi-fg-')).join(' '), next);
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
  preset = 'lieflat',
  reviewTools = true,
}: SlideDeckProps) {
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

export function PosterCanvas({ eyebrow, title, stat, footer, preset = 'lieflat', reviewTools = true, children }: PosterCanvasProps) {
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

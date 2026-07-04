import React, { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

export type VisualPreset = 'mono-industrial' | 'nothing' | 'blueprint' | 'editorial' | 'paper-ink' | 'terminal' | 'custom';

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

type DecisionMatrixProps = {
  rows: Array<Record<string, ReactNode>>;
};

type RiskLedgerProps = {
  risks: Array<{ risk: string; signal: string; mitigation: string; level?: 'low' | 'medium' | 'high' }>;
};

type FlowDiagramProps = {
  nodes: Array<{ id: string; label: string; detail?: string }>;
  edges: Array<{ from: string; to: string; label?: string }>;
};

type DiagramNode = {
  id: string;
  label: string;
  detail?: string;
  shape?: 'rect' | 'oval' | 'diamond' | 'dot';
  accent?: boolean;
  lane?: string;
  date?: string;
};

type DiagramEdge = {
  from: string;
  to: string;
  label?: string;
  style?: 'solid' | 'dashed' | 'bidirectional';
};

type DiagramCanvasProps = {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  layout?: 'flow' | 'tree' | 'swimlane' | 'timeline';
  lanes?: Array<{ id: string; label: string }>;
  dates?: string[];
  title?: string;
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
  data: unknown;
  collapsedDepth?: number;
};

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
  eyebrow = 'Visual Explainer',
  summary,
  preset = 'mono-industrial',
  reviewTools = true,
  children,
}: ShellProps) {
  return (
    <main className={`min-h-screen bg-[var(--ve-bg)] text-[var(--ve-text)] [font-family:var(--ve-font-body)]${reviewTools ? ' ve-has-review' : ''}`} data-ve-preset={preset}>
      <div className="mx-auto flex w-full max-w-[var(--ve-page-max)] flex-col gap-[var(--ve-section-gap)] px-5 py-8 sm:px-8 lg:px-10">
        <header className="grid gap-6 border-b border-[color:var(--ve-rule)] pb-10 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--ve-accent)] [font-family:var(--ve-font-mono)]">{eyebrow}</p>
            <h1 className="mt-5 max-w-5xl text-5xl leading-[0.95] tracking-normal text-[var(--ve-heading)] sm:text-7xl [font-family:var(--ve-font-display)] [font-weight:var(--ve-display-weight)]">
              {title}
            </h1>
            {summary ? <p className="mt-6 max-w-3xl text-lg leading-8 text-[var(--ve-muted)]">{summary}</p> : null}
          </div>
          <aside className="self-end rounded-[var(--ve-radius)] border border-[color:var(--ve-rule)] bg-[var(--ve-panel)] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--ve-faint)] [font-family:var(--ve-font-mono)]">source contract</p>
            <p className="mt-3 text-sm leading-6 text-[var(--ve-muted)]">
              Authored as MDX or TSX. Exported as generated standalone HTML.
            </p>
          </aside>
        </header>
        {children}
      </div>
      {reviewTools ? <AnnotationLayer /> : null}
    </main>
  );
}

export function Section({ title, kicker, children }: SectionProps) {
  return (
    <section className="grid min-w-0 gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div>
        {kicker ? <p className="text-xs uppercase tracking-[0.2em] text-[var(--ve-faint)] [font-family:var(--ve-font-mono)]">{kicker}</p> : null}
        <h2 className="mt-2 text-2xl tracking-normal text-[var(--ve-heading)] [font-family:var(--ve-font-display)] [font-weight:var(--ve-heading-weight)]">{title}</h2>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function Callout({ children }: { children: ReactNode }) {
  return <div className="rounded-[var(--ve-radius)] border-l-4 border-[var(--ve-accent)] bg-[var(--ve-accent-soft)] p-5 text-[var(--ve-text)]">{children}</div>;
}

export function Pipeline({ steps }: PipelineProps) {
  return (
    <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {steps.map((step, index) => {
        const item = typeof step === 'string' ? { title: step } : step;
        return (
          <li key={`${item.title}-${index}`} className="min-w-0 rounded-[var(--ve-radius)] border border-[color:var(--ve-rule)] bg-[var(--ve-panel)] p-5">
            <div className="text-xs text-[var(--ve-accent)] [font-family:var(--ve-font-mono)]">{String(index + 1).padStart(2, '0')}</div>
            <h3 className="mt-4 text-xl tracking-normal text-[var(--ve-heading)] [font-family:var(--ve-font-display)] [font-weight:var(--ve-heading-weight)]">{item.title}</h3>
            {item.body ? <p className="mt-3 text-sm leading-6 text-[var(--ve-muted)]">{item.body}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function DecisionMatrix({ rows }: DecisionMatrixProps) {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return (
    <div className="overflow-x-auto rounded-[var(--ve-radius)] border border-[color:var(--ve-rule)]">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead className="bg-[var(--ve-panel-strong)] text-xs uppercase tracking-[0.16em] text-[var(--ve-muted)] [font-family:var(--ve-font-mono)]">
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
  const color = { low: 'border-[var(--ve-info)]', medium: 'border-[var(--ve-warn)]', high: 'border-[var(--ve-danger)]' };
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {risks.map((risk) => (
        <article key={risk.risk} className={`rounded-[var(--ve-radius)] border-l-4 ${color[risk.level ?? 'medium']} bg-[var(--ve-panel)] p-5`}>
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--ve-faint)] [font-family:var(--ve-font-mono)]">{risk.level ?? 'medium'}</p>
          <h3 className="mt-3 text-lg tracking-normal text-[var(--ve-heading)] [font-family:var(--ve-font-display)] [font-weight:var(--ve-heading-weight)]">{risk.risk}</h3>
          <p className="mt-3 text-sm leading-6 text-[var(--ve-muted)]">
            <span className="text-[var(--ve-text)]">Signal:</span> {risk.signal}
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--ve-muted)]">
            <span className="text-[var(--ve-text)]">Mitigation:</span> {risk.mitigation}
          </p>
        </article>
      ))}
    </div>
  );
}

export function DiagramCanvas({ nodes, edges, layout = 'flow', lanes, dates, title = 'Diagram' }: DiagramCanvasProps) {
  const rawId = useId().replace(/:/g, '');
  const diagram = useMemo(() => layoutDiagram(nodes, edges, layout, lanes, dates), [nodes, edges, layout, lanes, dates]);
  const hasMobileVariant = layout === 'swimlane' && diagram.orientation === 'vertical';
  const arrowId = `ve-arrow-${rawId}`;
  const arrowAccentId = `ve-arrow-accent-${rawId}`;
  const arrowStartId = `ve-arrow-start-${rawId}`;
  const dotsId = `ve-diagram-dots-${rawId}`;
  return (
    <figure className={`ve-diagram-shell${hasMobileVariant ? ' ve-diagram-has-mobile' : ''} rounded-[var(--ve-radius)] border border-[color:var(--ve-rule)] bg-[var(--ve-panel)] p-4 sm:p-5`}>
      <div className="ve-diagram-variant ve-diagram-variant-desktop" data-diagram-role="diagram-desktop" data-ve-variant="desktop">
      <svg
        aria-label={title}
        className="h-auto w-full"
        data-diagram-role="diagram"
        role="img"
        style={{
          aspectRatio: `${diagram.viewBox.width} / ${diagram.viewBox.height}`,
          // Legibility floor: never render below 90% of natural scale — the figure
          // scrolls horizontally instead (responsive contract: wide SVGs scroll in
          // their own container; text stays >=12px effective).
          minWidth: Math.max(560, Math.round(diagram.viewBox.width * 0.9)),
        }}
        viewBox={`${diagram.viewBox.x} ${diagram.viewBox.y} ${diagram.viewBox.width} ${diagram.viewBox.height}`}
        width="100%"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <marker id={arrowId} markerHeight="7" markerWidth="7" orient="auto-start-reverse" refX="9" refY="5" viewBox="0 0 10 10">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--ve-diagram-muted)" />
          </marker>
          <marker id={arrowAccentId} markerHeight="7" markerWidth="7" orient="auto-start-reverse" refX="9" refY="5" viewBox="0 0 10 10">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--ve-accent)" />
          </marker>
          <marker id={arrowStartId} markerHeight="7" markerWidth="7" orient="auto-start-reverse" refX="1" refY="5" viewBox="0 0 10 10">
            <path d="M 10 0 L 0 5 L 10 10 z" fill="var(--ve-diagram-muted)" />
          </marker>
          <pattern id={dotsId} height="var(--ve-diagram-grid-size, 22)" patternUnits="userSpaceOnUse" width="var(--ve-diagram-grid-size, 22)" x="0" y="0">
            <line opacity="var(--ve-grid-line-opacity, 0)" stroke="var(--ve-grid-line)" strokeWidth="var(--ve-grid-line-width, 1)" x1="0" x2="100%" y1="0" y2="0" />
            <line opacity="var(--ve-grid-line-opacity, 0)" stroke="var(--ve-grid-line)" strokeWidth="var(--ve-grid-line-width, 1)" x1="0" x2="0" y1="0" y2="100%" />
            <line opacity="var(--ve-grid-scanline-opacity, 0)" stroke="var(--ve-grid-line)" strokeWidth="var(--ve-grid-scanline-width, 1)" x1="0" x2="100%" y1="50%" y2="50%" />
            <circle cx="50%" cy="50%" fill="var(--ve-grid-line)" opacity="var(--ve-grid-dot-opacity, 0.58)" r="var(--ve-grid-dot-r, 0.9)" />
          </pattern>
        </defs>
        <rect fill="var(--ve-diagram-bg)" height={diagram.viewBox.height} width={diagram.viewBox.width} x={diagram.viewBox.x} y={diagram.viewBox.y} />
        <rect fill={`url(#${dotsId})`} height={diagram.bodyBottom - diagram.viewBox.y} width={diagram.viewBox.width} x={diagram.viewBox.x} y={diagram.viewBox.y} />
        <rect fill="none" height={diagram.viewBox.height - 1} stroke="var(--ve-diagram-frame)" strokeWidth="1" width={diagram.viewBox.width - 1} x={diagram.viewBox.x + 0.5} y={diagram.viewBox.y + 0.5} />
        <g data-diagram-role="layer">
          {diagram.lanes.map((lane) => (
            <g data-diagram-role="lane" key={lane.id}>
              {lane.orientation === 'vertical' ? (
                <>
                  {lane.divider ? <line stroke="var(--ve-diagram-frame)" strokeWidth="1" x1={lane.x + lane.width} x2={lane.x + lane.width} y1={lane.y + 8} y2={lane.y + lane.height} /> : null}
                  <line stroke="var(--ve-diagram-frame)" strokeWidth="1" x1={lane.x + 12} x2={lane.x + lane.width - 12} y1={lane.y + 38} y2={lane.y + 38} />
                </>
              ) : (
                <line stroke="var(--ve-diagram-frame)" strokeWidth="1" x1={lane.x} x2={lane.x + lane.width} y1={lane.y} y2={lane.y} />
              )}
              <text fill="var(--ve-faint)" fontFamily="var(--ve-font-mono)" fontSize="10" letterSpacing="1.8" style={svgTextOverflowStyle} textAnchor={lane.orientation === 'vertical' ? 'middle' : 'start'} x={lane.orientation === 'vertical' ? lane.x + lane.width / 2 : lane.x + 16} y={lane.orientation === 'vertical' ? lane.y + 24 : lane.y + 24}>
                {lane.label}
              </text>
            </g>
          ))}
          {diagram.edges.map(({ edge, from, to, path, label }, index) => {
            const isAccentEdge = from.isAccented || to.isAccented;
            return (
              <g key={`${edge.from}-${edge.to}-${index}`}>
                <path
                  d={edgePath(path)}
                  data-diagram-role="arrow"
                  fill="none"
                  markerEnd={`url(#${isAccentEdge ? arrowAccentId : arrowId})`}
                  markerStart={edge.style === 'bidirectional' ? `url(#${arrowStartId})` : undefined}
                  stroke={isAccentEdge ? 'var(--ve-accent)' : 'var(--ve-diagram-muted)'}
                  strokeDasharray={edge.style === 'dashed' ? '5 5' : undefined}
                  strokeLinecap="round"
                  strokeWidth={isAccentEdge ? '1.6' : '1.2'}
                />
                {label ? (
                  <g data-diagram-role="arrow-label">
                    {label.leader ? (
                      <line
                        opacity="0.72"
                        stroke="var(--ve-diagram-frame)"
                        strokeDasharray="3 3"
                        strokeWidth="1"
                        x1={label.anchor.x}
                        x2={labelLeaderEndpoint(label).x}
                        y1={label.anchor.y}
                        y2={labelLeaderEndpoint(label).y}
                      />
                    ) : null}
                    <rect data-diagram-role="arrow-label-mask" fill="var(--ve-diagram-bg)" height={label.height} rx="var(--ve-chip-radius, 0)" stroke="var(--ve-diagram-frame)" strokeWidth="1" width={label.width} x={label.x - label.width / 2} y={label.y - label.height / 2} />
                    <text fill="var(--ve-diagram-ink)" fontFamily="var(--ve-font-mono)" fontSize="10" letterSpacing="0.6" style={svgTextOverflowStyle} textAnchor="middle" x={label.x} y={label.y - (label.lines.length > 1 ? 5 : -3)}>
                      {label.lines.map((line, lineIndex) => (
                        <tspan dy={lineIndex === 0 ? 0 : 12} key={`${edge.from}-${edge.to}-label-${lineIndex}`} x={label.x}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}
          {diagram.nodes.map((item, index) => (
            <DiagramNodeShape item={item} index={index} key={item.id} />
          ))}
          {diagram.legend.entries.length ? (
            <g data-diagram-role="legend">
              <line stroke="var(--ve-diagram-frame)" strokeWidth="1" x1={diagram.viewBox.x + 24} x2={diagram.viewBox.x + diagram.viewBox.width - 24} y1={diagram.bodyBottom} y2={diagram.bodyBottom} />
              <text fill="var(--ve-faint)" fontFamily="var(--ve-font-mono)" fontSize="10" letterSpacing="1" style={svgTextOverflowStyle} x={diagram.legend.x} y={diagram.legend.y}>
                {layout.toUpperCase()} / {nodes.length} nodes / {edges.length} edges
              </text>
              {diagram.legend.entries.map((entry, entryIndex) => (
                <g key={entry.label}>
                  <line stroke={entry.accent ? 'var(--ve-accent)' : 'var(--ve-diagram-muted)'} strokeDasharray={entry.dashed ? '5 5' : undefined} strokeWidth={entry.accent ? '1.6' : '1.2'} x1={diagram.legend.entryStartX + entryIndex * 136} x2={diagram.legend.entryStartX + 32 + entryIndex * 136} y1={diagram.legend.y - 3} y2={diagram.legend.y - 3} />
                  <text fill="var(--ve-faint)" fontFamily="var(--ve-font-mono)" fontSize="10" letterSpacing="0.8" style={svgTextOverflowStyle} x={diagram.legend.entryStartX + 40 + entryIndex * 136} y={diagram.legend.y}>
                    {entry.label}
                  </text>
                </g>
              ))}
            </g>
          ) : null}
        </g>
      </svg>
      </div>
      {hasMobileVariant ? <MobileSwimlaneVariant diagram={diagram} /> : null}
    </figure>
  );
}

function MobileSwimlaneVariant({ diagram }: { diagram: ReturnType<typeof layoutDiagram> }) {
  const sortedNodes = [...diagram.nodes].sort((a, b) => a.rank - b.rank || a.order - b.order);
  const nodeOrder = new Map(sortedNodes.map((node, index) => [node.id, index]));
  return (
    <div className="ve-diagram-variant ve-diagram-variant-mobile" data-diagram-role="diagram-mobile" data-ve-variant="mobile">
      <div className="ve-diagram-mobile-list">
        {sortedNodes.map((node, index) => {
          const connectorEdges = mobileConnectorEdges(diagram.edges, nodeOrder, index);
          const dashed = connectorEdges.some(({ edge }) => edge.style === 'dashed');
          return (
            <React.Fragment key={node.id}>
              <article className="ve-diagram-mobile-node" data-diagram-role="mobile-node" data-ve-accent={node.isAccented ? 'true' : undefined}>
                <p className="ve-diagram-mobile-lane">{diagram.laneLabels.get(node.lane ?? 'default') ?? node.lane ?? 'Default'}</p>
                <h3>{node.label}</h3>
                {node.detail ? <p>{node.detail}</p> : null}
              </article>
              {index < sortedNodes.length - 1 ? (
                <div className="ve-diagram-mobile-connector" data-diagram-role="mobile-connector" data-ve-edge-style={dashed ? 'dashed' : 'solid'}>
                  <span className="ve-diagram-mobile-line" />
                  {connectorEdges.length ? (
                    <div className="ve-diagram-mobile-chips">
                      {connectorEdges.map(({ edge }, edgeIndex) => edge.label ? (
                        <span className="ve-diagram-mobile-chip" data-ve-edge-style={edge.style === 'dashed' ? 'dashed' : 'solid'} key={`${edge.from}-${edge.to}-${edgeIndex}`}>
                          {edge.label}
                        </span>
                      ) : null)}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function mobileConnectorEdges(edges: LaidOutEdge[], nodeOrder: Map<string, number>, index: number) {
  const nextIndex = index + 1;
  const incoming = edges.filter(({ edge }) => {
    const fromIndex = nodeOrder.get(edge.from);
    const toIndex = nodeOrder.get(edge.to);
    return fromIndex !== undefined && toIndex === nextIndex && fromIndex < toIndex;
  });
  if (incoming.length) return incoming.slice(0, 3);
  return edges.filter(({ edge }) => {
    const fromIndex = nodeOrder.get(edge.from);
    const toIndex = nodeOrder.get(edge.to);
    return fromIndex === index && toIndex !== undefined && toIndex > fromIndex;
  }).slice(0, 3);
}

export function FlowDiagram({ nodes, edges }: FlowDiagramProps) {
  return <DiagramCanvas edges={edges} layout="flow" nodes={nodes} title="Flow diagram" />;
}

export function CodeBlock({ code, language, filename, highlightLines = [], annotations = [], diff, html }: CodeBlockProps) {
  const highlighted = html ?? `<pre><code>${escapeHtml(code)}</code></pre>`;
  const highlightSet = new Set(highlightLines);
  const annotationMap = new Map(annotations.map((item) => [item.line, item.note]));
  return (
    <figure className="overflow-hidden rounded-[var(--ve-radius)] border border-[color:var(--ve-code-rule)] bg-[var(--ve-code-bg)] text-[var(--ve-code-text)]" data-ve-code-block>
      <figcaption className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--ve-code-rule)] px-4 py-3 text-xs uppercase tracking-[0.14em] text-[var(--ve-code-muted)] [font-family:var(--ve-font-mono)]">
        <span>{filename ?? language}</span>
        <span>{diff === 'unified' ? 'diff' : language}</span>
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
        <span>ansi</span>
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
  return (
    <div className="ve-json-tree" data-ve-json-tree>
      <JsonNode name="root" value={data} depth={0} collapsedDepth={collapsedDepth} root />
    </div>
  );
}

function JsonNode({ name, value, depth, collapsedDepth, root = false }: { name: string; value: unknown; depth: number; collapsedDepth: number; root?: boolean }) {
  if (value === null || typeof value !== 'object') {
    return (
      <div className="ve-json-leaf">
        {!root ? <span className="ve-json-key">{JSON.stringify(name)}: </span> : null}
        <JsonPrimitive value={value} />
      </div>
    );
  }
  const entries = Array.isArray(value) ? value.map((item, index) => [String(index), item] as const) : Object.entries(value as Record<string, unknown>);
  const label = Array.isArray(value) ? `Array(${entries.length})` : `Object(${entries.length})`;
  return (
    <details className="ve-json-branch" open={depth < collapsedDepth}>
      <summary>
        {!root ? <span className="ve-json-key">{JSON.stringify(name)}: </span> : null}
        <span className="ve-json-type">{label}</span>
      </summary>
      <div className="ve-json-children">
        {entries.map(([key, child]) => (
          <JsonNode collapsedDepth={collapsedDepth} depth={depth + 1} key={key} name={key} value={child} />
        ))}
      </div>
    </details>
  );
}

function JsonPrimitive({ value }: { value: unknown }) {
  const type = value === null ? 'null' : typeof value;
  return <span data-ve-json-type={type}>{typeof value === 'string' ? JSON.stringify(value) : String(value)}</span>;
}

export function Quiz({ questions }: QuizProps) {
  const [answers, setAnswers] = useState<Array<number | null>>(() => questions.map(() => null));
  const answeredCount = answers.filter((answer) => answer !== null).length;
  const score = answers.reduce((sum, answer, index) => {
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
      if (cancelled || !window.mermaid) return;
      const styles = getComputedStyle(document.documentElement);
      window.mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
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
      const result = await window.mermaid.render(`ve-mermaid-${rawId}`, wrappedChart);
      if (!cancelled) {
        host.innerHTML = result.svg;
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

type LaidOutNode = DiagramNode & {
  x: number;
  y: number;
  width: number;
  height: number;
  rank: number;
  row: number;
  order: number;
  isAccented: boolean;
};

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type SwimlaneOrientation = 'horizontal' | 'vertical';

type LaidOutEdge = {
  edge: DiagramEdge;
  from: LaidOutNode;
  to: LaidOutNode;
  path: Point[];
  label?: EdgeLabelLayout;
};

type EdgeLabelLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  anchor: Point;
  leader?: boolean;
};

type LegendEntry = {
  label: string;
  accent?: boolean;
  dashed?: boolean;
};

function layoutDiagram(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  layout: NonNullable<DiagramCanvasProps['layout']>,
  lanes?: DiagramCanvasProps['lanes'],
  dates?: string[],
) {
  const rankMap = computeRanks(nodes, edges);
  const dense = nodes.length >= 7 || edges.length >= 10;
  const nodeHeight = dense ? 76 : 96;
  const columnGap = layout === 'timeline' ? 180 : layout === 'swimlane' ? (dense ? 176 : 204) : dense ? 204 : 240;
  const rowGap = layout === 'tree' ? 128 : layout === 'swimlane' ? (dense ? 164 : 176) : dense ? 112 : 144;
  const padding = { top: 64, right: 64, bottom: 72, left: 72 };
  const laneList = layout === 'swimlane'
    ? lanes ?? Array.from(new Set(nodes.map((node) => node.lane ?? 'default'))).map((id) => ({ id, label: id }))
    : [];
  const laneIndex = new Map(laneList.map((lane, index) => [lane.id, index]));
  const rankValues = Array.from(new Set(nodes.map((node, declarationIndex) => rankForNode(node, declarationIndex, layout, rankMap, dates)))).sort((a, b) => a - b);
  const rankIndex = new Map(rankValues.map((rank, index) => [rank, index]));
  const swimlaneOrientation: SwimlaneOrientation = layout === 'swimlane' && rankValues.length > 4 ? 'vertical' : 'horizontal';
  const swimlaneRankGap = dense ? 34 : 42;
  const swimlaneColumnPitch = swimlaneOrientation === 'vertical'
    ? laneList.length <= 6
      ? Math.max(136, Math.floor((960 - padding.left - padding.right) / Math.max(1, laneList.length)))
      : dense ? 168 : 184
    : columnGap;
  const swimlaneNodeMax = swimlaneOrientation === 'vertical' ? Math.max(124, Math.min(164, swimlaneColumnPitch - 32)) : 240;
  const orderedDates = dates ?? Array.from(new Set(nodes.map((node) => node.date).filter(Boolean))) as string[];
  const dateIndex = new Map(orderedDates.map((date, index) => [date, index]));
  const rankCounts = new Map<number, number>();
  const laneRankCounts = new Map<string, number>();
  let accentsUsed = 0;
  const measured = nodes.map((node, declarationIndex) => {
    const rank = layout === 'timeline' && node.date ? dateIndex.get(node.date) ?? declarationIndex : rankMap.get(node.id) ?? declarationIndex;
    const inRank = rankCounts.get(rank) ?? 0;
    rankCounts.set(rank, inRank + 1);
    const wrapsDenseFlow = dense && layout !== 'swimlane' && layout !== 'timeline';
    const wrapColumns = 4;
    const rankBand = wrapsDenseFlow ? Math.floor(rank / wrapColumns) : 0;
    const visualRank = wrapsDenseFlow
      ? rankBand % 2 === 0
        ? rank % wrapColumns
        : wrapColumns - 1 - (rank % wrapColumns)
      : rank;
    const laneKey = `${node.lane ?? 'default'}::${rank}`;
    const laneStack = layout === 'swimlane' ? laneRankCounts.get(laneKey) ?? 0 : 0;
    if (layout === 'swimlane') laneRankCounts.set(laneKey, laneStack + 1);
    const row = layout === 'swimlane' ? laneIndex.get(node.lane ?? 'default') ?? 0 : inRank + rankBand * 2;
    const { width, height } = measureDiagramNode(node, dense, nodeHeight, swimlaneNodeMax);
    const isAccented = Boolean(node.accent && accentsUsed < 2);
    if (isAccented) accentsUsed += 1;
    return { ...node, x: 0, y: 0, width, height, rank, row, order: declarationIndex, visualRank, laneStack, inRank, isAccented };
  });
  const laidOut = swimlaneOrientation === 'vertical'
    ? layoutVerticalSwimlane(measured, laneIndex, rankIndex, padding, swimlaneColumnPitch, swimlaneRankGap)
    : measured.map((node) => ({
      ...node,
      x: padding.left + node.visualRank * columnGap,
      y: padding.top + node.row * rowGap + (layout === 'timeline' && node.row % 2 ? 58 : 0) + node.laneStack * (nodeHeight + 16),
    }));
  const byId = new Map(laidOut.map((node) => [node.id, node]));
  const connectedEdgePairs = edges.flatMap((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    return from && to ? [{ edge, from, to }] : [];
  });
  const minX = Math.min(...laidOut.map((node) => node.x), padding.left) - padding.left;
  const minY = Math.min(...laidOut.map((node) => node.y), padding.top) - padding.top;
  const maxX = Math.max(...laidOut.map((node) => node.x + node.width), padding.left + 520) + padding.right;
  const maxY = Math.max(...laidOut.map((node) => node.y + node.height), padding.top + 300) + padding.bottom;
  const bounds = { minX, minY, maxX, maxY };
  const connectedEdges = placeEdgeLabels(
    connectedEdgePairs.map(({ edge, from, to }) => ({
      edge,
      from,
      to,
      path: edgeRoute(from, to, swimlaneOrientation === 'vertical' && layout === 'swimlane' ? 'vertical' : 'horizontal'),
    })),
    laidOut,
    bounds,
    dense,
  );
  const finalMaxX = Math.max(maxX, ...connectedEdges.flatMap(({ label }) => label ? [label.x + label.width / 2 + 24] : []));
  const finalMaxY = Math.max(maxY, ...connectedEdges.flatMap(({ label }) => label ? [label.y + label.height / 2 + 32] : []));
  const bodyBottom = finalMaxY - 56;
  const laneRects = laneList.map((lane, index) => swimlaneOrientation === 'vertical' ? ({
    id: lane.id,
    label: lane.label.toUpperCase(),
    orientation: 'vertical' as const,
    divider: index < laneList.length - 1,
    x: padding.left + index * swimlaneColumnPitch - swimlaneColumnPitch / 2 + 8,
    y: minY + 22,
    width: swimlaneColumnPitch,
    height: bodyBottom - minY - 28,
  }) : ({
    id: lane.id,
    label: lane.label.toUpperCase(),
    orientation: 'horizontal' as const,
    divider: false,
    x: minX + 18,
    y: padding.top + index * rowGap - 28,
    width: finalMaxX - minX - 36,
    height: rowGap,
  }));
  const shapeSet = new Set(nodes.map((node) => node.shape ?? 'rect'));
  const styleSet = new Set(edges.map((edge) => edge.style ?? 'solid'));
  const legendEntries: LegendEntry[] = [];
  if (nodes.some((node) => node.accent)) legendEntries.push({ label: 'FOCAL', accent: true });
  if (styleSet.has('solid') && styleSet.size > 1) legendEntries.push({ label: 'SOLID' });
  if (styleSet.has('dashed')) legendEntries.push({ label: 'DASHED', dashed: true });
  if (styleSet.has('bidirectional')) legendEntries.push({ label: 'TWO-WAY' });
  if (shapeSet.size > 1) legendEntries.push({ label: 'SHAPES VARY' });
  return {
    nodes: laidOut,
    edges: connectedEdges,
    lanes: laneRects,
    laneLabels: new Map(laneList.map((lane) => [lane.id, lane.label.toUpperCase()])),
    dense,
    orientation: swimlaneOrientation,
    bodyBottom,
    legend: {
      x: minX + 28,
      y: finalMaxY - 24,
      entries: legendEntries.slice(0, 5),
      // Entries start after the measured meta text ("SWIMLANE / 8 nodes / 12 edges")
      // instead of a fixed offset that collides with longer meta strings.
      entryStartX: minX + 28 + `${layout.toUpperCase()} / ${nodes.length} nodes / ${edges.length} edges`.length * 6.6 + 32,
    },
    viewBox: { x: minX, y: minY, width: finalMaxX - minX, height: finalMaxY - minY },
  };
}

function rankForNode(
  node: DiagramNode,
  declarationIndex: number,
  layout: NonNullable<DiagramCanvasProps['layout']>,
  rankMap: Map<string, number>,
  dates?: string[],
) {
  if (layout !== 'timeline' || !node.date) return rankMap.get(node.id) ?? declarationIndex;
  const orderedDates = dates ?? [];
  const dateIndex = new Map(orderedDates.map((date, index) => [date, index]));
  return dateIndex.get(node.date) ?? declarationIndex;
}

function measureDiagramNode(node: DiagramNode, dense: boolean, nodeHeight: number, maxWidth = 240) {
  const width = node.shape === 'dot'
    ? 32
    : dense
      ? Math.max(124, Math.min(Math.min(152, maxWidth), node.label.length * 8 + 48))
      : Math.max(Math.min(152, maxWidth), Math.min(maxWidth, node.label.length * 10 + 72, (node.detail?.length ?? 0) * 5 + 72));
  const compact = width <= 140;
  const detailMaxLines = compact ? 2 : 3;
  const labelLineCount = node.shape === 'dot' ? 1 : splitSvgText(node.label, compact ? 15 : 20, { maxLines: 2 }).length;
  const detailLineCount = node.detail && node.shape !== 'dot' ? splitSvgText(node.detail, compact ? 17 : 28, { ellipsis: true, maxLines: detailMaxLines }).length : 0;
  const textBottom = (compact ? 59 : 72) + Math.max(0, labelLineCount - 1) * (compact ? 16 : 18) + (detailLineCount > 0 ? (detailLineCount - 1) * 13 + 12 : 0);
  const height = node.shape === 'dot' ? 42 : Math.max(nodeHeight, textBottom + 14);
  return { width, height };
}

function layoutVerticalSwimlane<T extends LaidOutNode & { laneStack: number }>(
  measured: T[],
  laneIndex: Map<string, number>,
  rankIndex: Map<number, number>,
  padding: { top: number; left: number },
  columnPitch: number,
  rowGap: number,
) {
  const groupMap = new Map<string, T[]>();
  for (const node of measured) {
    const key = `${node.lane ?? 'default'}::${node.rank}`;
    groupMap.set(key, [...groupMap.get(key) ?? [], node]);
  }
  const rowHeights = new Map<number, number>();
  for (const [key, group] of groupMap) {
    const rank = Number(key.split('::').at(-1));
    const sideBySideWidth = group.reduce((sum, node) => sum + node.width, 0) + Math.max(0, group.length - 1) * 12;
    const groupHeight = sideBySideWidth <= columnPitch - 32
      ? Math.max(...group.map((node) => node.height))
      : group.reduce((sum, node) => sum + node.height, 0) + Math.max(0, group.length - 1) * 16;
    const rankRow = rankIndex.get(rank) ?? rank;
    rowHeights.set(rankRow, Math.max(rowHeights.get(rankRow) ?? 0, groupHeight));
  }
  const rankY = new Map<number, number>();
  let cursorY = padding.top + 54;
  const rankRows = Array.from(new Set([...rankIndex.values()])).sort((a, b) => a - b);
  for (const rankRow of rankRows) {
    rankY.set(rankRow, cursorY);
    cursorY += (rowHeights.get(rankRow) ?? 96) + rowGap;
  }
  const groupPositions = new Map<string, Map<string, Point>>();
  for (const [key, group] of groupMap) {
    const rank = Number(key.split('::').at(-1));
    const rankRow = rankIndex.get(rank) ?? rank;
    const sideBySideWidth = group.reduce((sum, node) => sum + node.width, 0) + Math.max(0, group.length - 1) * 12;
    const fitsSideBySide = sideBySideWidth <= columnPitch - 32;
    const lane = laneIndex.get(group[0]?.lane ?? 'default') ?? 0;
    const laneCenter = padding.left + lane * columnPitch;
    const y = rankY.get(rankRow) ?? padding.top;
    const positions = new Map<string, Point>();
    if (fitsSideBySide) {
      let x = laneCenter - sideBySideWidth / 2;
      for (const node of group) {
        positions.set(node.id, { x, y });
        x += node.width + 12;
      }
    } else {
      let stackY = y;
      for (const node of group) {
        positions.set(node.id, { x: laneCenter - node.width / 2, y: stackY });
        stackY += node.height + 16;
      }
    }
    groupPositions.set(key, positions);
  }
  return measured.map((node) => {
    const key = `${node.lane ?? 'default'}::${node.rank}`;
    const point = groupPositions.get(key)?.get(node.id) ?? { x: padding.left, y: padding.top };
    return { ...node, x: point.x, y: point.y };
  });
}

function edgeRoute(from: LaidOutNode, to: LaidOutNode, orientation: SwimlaneOrientation): Point[] {
  const start = edgePoint(from, to, orientation, true);
  const end = edgePoint(to, from, orientation, false);
  if (Math.abs(start.x - end.x) < 4 || Math.abs(start.y - end.y) < 4) return [start, end];
  if (orientation === 'vertical') {
    const midY = Math.round((start.y + end.y) / 2 / 4) * 4;
    return [{ ...start }, { x: start.x, y: midY }, { x: end.x, y: midY }, { ...end }];
  }
  const midX = Math.round((start.x + end.x) / 2 / 4) * 4;
  return [{ ...start }, { x: midX, y: start.y }, { x: midX, y: end.y }, { ...end }];
}

function placeEdgeLabels(edges: Array<Omit<LaidOutEdge, 'label'>>, nodes: LaidOutNode[], bounds: { minX: number; minY: number; maxX: number; maxY: number }, dense: boolean): LaidOutEdge[] {
  const occupied = nodes.map((node) => expandRect(nodeRect(node), 5));
  const laidOut = edges.map((item) => {
    const lines = item.edge.label ? splitSvgText(item.edge.label, dense ? 18 : 24).slice(0, 2) : [];
    if (!lines.length) return item;
    const width = Math.max(64, Math.min(dense ? 128 : 168, Math.max(...lines.map((line) => line.length)) * 6 + 24));
    const height = lines.length > 1 ? 34 : 22;
    const label = findLabelSlot(item.path, width, height, occupied, bounds, lines);
    occupied.push(expandRect(labelRect(label), 4));
    return { ...item, label };
  });
  const overlaps = collectLabelOverlaps(laidOut.filter((edge): edge is LaidOutEdge => Boolean(edge.label)), nodes);
  if (overlaps.length && typeof console !== 'undefined') {
    console.warn(`DiagramCanvas edge-label overlap avoided incompletely: ${overlaps.slice(0, 4).join(', ')}`);
  }
  return laidOut;
}

function findLabelSlot(path: Point[], width: number, height: number, occupied: Rect[], bounds: { minX: number; minY: number; maxX: number; maxY: number }, lines: string[]): EdgeLabelLayout {
  const tValues = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74];
  const offsets = [0, -16, 16, -24, 24];
  for (const t of tValues) {
    const sample = pointAtPath(path, t);
    for (const offset of offsets) {
      const candidate = labelFromSample(sample, width, height, lines, offset);
      if (labelFits(candidate, occupied, bounds)) return candidate;
    }
  }
  const anchor = pointAtPath(path, 0.5);
  for (const yOffset of [28, 44, 60, 76, 96, 116]) {
    const x = clamp(anchor.point.x, bounds.minX + width / 2 + 12, bounds.maxX - width / 2 - 12);
    const y = anchor.point.y + yOffset;
    const candidate = { x, y, width, height, lines, anchor: anchor.point, leader: true };
    if (labelFits(candidate, occupied, { ...bounds, maxY: bounds.maxY + 160 })) return candidate;
  }
  return { x: anchor.point.x, y: anchor.point.y + 116, width, height, lines, anchor: anchor.point, leader: true };
}

function labelFromSample(sample: { point: Point; tangent: Point }, width: number, height: number, lines: string[], offset: number): EdgeLabelLayout {
  const length = Math.hypot(sample.tangent.x, sample.tangent.y) || 1;
  const normal = { x: -sample.tangent.y / length, y: sample.tangent.x / length };
  const x = sample.point.x + normal.x * offset;
  const y = sample.point.y + normal.y * offset;
  return {
    x,
    y,
    width,
    height,
    lines,
    anchor: sample.point,
    leader: Math.hypot(x - sample.point.x, y - sample.point.y) > 20,
  };
}

function pointAtPath(path: Point[], t: number) {
  const segments = path.slice(1).map((point, index) => {
    const start = path[index]!;
    const length = Math.hypot(point.x - start.x, point.y - start.y);
    return { start, end: point, length };
  });
  const total = segments.reduce((sum, segment) => sum + segment.length, 0) || 1;
  let remaining = total * t;
  for (const segment of segments) {
    if (remaining <= segment.length || segment === segments.at(-1)) {
      const local = segment.length ? remaining / segment.length : 0;
      return {
        point: {
          x: segment.start.x + (segment.end.x - segment.start.x) * local,
          y: segment.start.y + (segment.end.y - segment.start.y) * local,
        },
        tangent: { x: segment.end.x - segment.start.x, y: segment.end.y - segment.start.y },
      };
    }
    remaining -= segment.length;
  }
  return { point: path[0] ?? { x: 0, y: 0 }, tangent: { x: 1, y: 0 } };
}

function labelFits(label: EdgeLabelLayout, occupied: Rect[], bounds: { minX: number; minY: number; maxX: number; maxY: number }) {
  const rect = labelRect(label);
  if (rect.x < bounds.minX + 8 || rect.x + rect.width > bounds.maxX - 8 || rect.y < bounds.minY + 8 || rect.y + rect.height > bounds.maxY + 8) return false;
  return occupied.every((other) => !rectsIntersect(rect, other));
}

function collectLabelOverlaps(edges: LaidOutEdge[], nodes: LaidOutNode[]) {
  const nodeRects = nodes.map((node) => ({ id: node.id, rect: nodeRect(node) }));
  const labels = edges.flatMap((edge, index) => edge.label ? [{ id: `${edge.edge.from}->${edge.edge.to}#${index}`, rect: labelRect(edge.label) }] : []);
  const overlaps: string[] = [];
  for (const label of labels) {
    for (const node of nodeRects) {
      if (rectsIntersect(label.rect, node.rect)) overlaps.push(`${label.id} over ${node.id}`);
    }
  }
  for (let i = 0; i < labels.length; i += 1) {
    for (let j = i + 1; j < labels.length; j += 1) {
      if (rectsIntersect(labels[i]!.rect, labels[j]!.rect)) overlaps.push(`${labels[i]!.id} over ${labels[j]!.id}`);
    }
  }
  return overlaps;
}

function computeRanks(nodes: DiagramNode[], edges: DiagramEdge[]) {
  const ids = new Set(nodes.map((node) => node.id));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) continue;
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }
  const ranks = new Map<string, number>();
  const queue = nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0).map((node) => node.id);
  for (const id of queue) ranks.set(id, 0);
  while (queue.length) {
    const id = queue.shift()!;
    const nextRank = (ranks.get(id) ?? 0) + 1;
    for (const child of outgoing.get(id) ?? []) {
      ranks.set(child, Math.max(ranks.get(child) ?? 0, nextRank));
      incoming.set(child, (incoming.get(child) ?? 1) - 1);
      if ((incoming.get(child) ?? 0) === 0) queue.push(child);
    }
  }
  nodes.forEach((node, index) => {
    if (!ranks.has(node.id)) ranks.set(node.id, index);
  });
  return ranks;
}

function edgePoint(node: LaidOutNode, toward: LaidOutNode, orientation: SwimlaneOrientation, isStart: boolean) {
  const gap = 8;
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const tx = toward.x + toward.width / 2;
  const ty = toward.y + toward.height / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (orientation === 'vertical' && node.rank !== toward.rank) {
    const forward = toward.rank > node.rank;
    if ((isStart && forward) || (!isStart && !forward)) return { x: cx, y: node.y + node.height + gap };
    return { x: cx, y: node.y - gap };
  }
  if (Math.abs(dx) > Math.abs(dy)) return { x: cx + Math.sign(dx) * (node.width / 2 + gap), y: cy };
  return { x: cx, y: cy + Math.sign(dy) * (node.height / 2 + gap) };
}

function edgePath(points: Point[]) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function nodeRect(node: LaidOutNode): Rect {
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

function labelRect(label: EdgeLabelLayout): Rect {
  return { x: label.x - label.width / 2, y: label.y - label.height / 2, width: label.width, height: label.height };
}

function labelLeaderEndpoint(label: EdgeLabelLayout): Point {
  const rect = labelRect(label);
  const center = { x: label.x, y: label.y };
  const dx = label.anchor.x - center.x;
  const dy = label.anchor.y - center.y;
  if (Math.abs(dx) * rect.height > Math.abs(dy) * rect.width) {
    return {
      x: dx > 0 ? rect.x + rect.width : rect.x,
      y: clamp(center.y + dy * (rect.width / 2) / (Math.abs(dx) || 1), rect.y, rect.y + rect.height),
    };
  }
  return {
    x: clamp(center.x + dx * (rect.height / 2) / (Math.abs(dy) || 1), rect.x, rect.x + rect.width),
    y: dy > 0 ? rect.y + rect.height : rect.y,
  };
}

function expandRect(rect: Rect, amount: number): Rect {
  return { x: rect.x - amount, y: rect.y - amount, width: rect.width + amount * 2, height: rect.height + amount * 2 };
}

function rectsIntersect(a: Rect, b: Rect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function DiagramNodeShape({ item, index }: { item: LaidOutNode; index: number }) {
  const compact = item.width <= 140;
  const labelY = item.shape === 'dot' ? item.y + item.height + 20 : item.y + (compact ? 37 : 44);
  const labelLines = splitSvgText(item.label, item.shape === 'dot' ? 14 : compact ? 15 : 20, { maxLines: 2 });
  const detailLines = item.detail ? splitSvgText(item.detail, compact ? 17 : 28, { ellipsis: true, maxLines: compact ? 2 : 3 }) : [];
  const detailY = item.y + (compact ? 59 : 72) + Math.max(0, labelLines.length - 1) * (compact ? 16 : 18);
  const stroke = item.isAccented ? 'var(--ve-accent)' : 'var(--ve-node-stroke)';
  const fill = item.isAccented ? 'var(--ve-diagram-accent-fill)' : 'var(--ve-node-bg)';
  const textX = item.shape === 'dot' ? item.x + item.width / 2 : item.x + (compact ? 12 : 20);
  return (
    <g data-diagram-role="node" data-ve-label={item.label} key={item.id}>
      {item.shape === 'oval' ? (
        <rect fill={fill} height={item.height} rx={compact ? 16 : 24} stroke={stroke} strokeWidth={item.isAccented ? '2' : '1'} width={item.width} x={item.x} y={item.y} />
      ) : item.shape === 'diamond' ? (
        <polygon fill={fill} points={`${item.x + item.width / 2},${item.y} ${item.x + item.width},${item.y + item.height / 2} ${item.x + item.width / 2},${item.y + item.height} ${item.x},${item.y + item.height / 2}`} stroke={stroke} strokeWidth={item.isAccented ? '2' : '1'} />
      ) : item.shape === 'dot' ? (
        <circle cx={item.x + item.width / 2} cy={item.y + item.height / 2} fill={stroke} r={item.width / 2} />
      ) : (
        <rect fill={fill} height={item.height} rx="var(--ve-node-radius, 6)" stroke={stroke} strokeWidth={item.isAccented ? '2' : '1'} width={item.width} x={item.x} y={item.y} />
      )}
      {item.shape === 'dot' ? null : (
        <text fill={item.isAccented ? 'var(--ve-accent)' : 'var(--ve-faint)'} fontFamily="var(--ve-font-mono)" fontSize="10" letterSpacing="0.8" style={svgTextOverflowStyle} x={item.x + (compact ? 12 : 20)} y={item.y + 20}>
          {String(index + 1).padStart(2, '0')}
        </text>
      )}
      <text className="ve-diagram-node-label" fill="var(--ve-diagram-ink)" fontFamily="var(--ve-font-body)" fontSize={item.shape === 'dot' ? 14 : compact ? 14 : 15} fontWeight={item.isAccented ? '700' : '600'} style={svgTextOverflowStyle} textAnchor={item.shape === 'dot' ? 'middle' : 'start'} x={textX} y={labelY}>
        {labelLines.map((line, lineIndex) => (
          <tspan dy={lineIndex === 0 ? 0 : item.shape === 'dot' ? 16 : compact ? 16 : 18} key={`${item.id}-label-${lineIndex}`} x={textX}>
            {line}
          </tspan>
        ))}
      </text>
      {item.detail && item.shape !== 'dot' ? (
        <text fill="var(--ve-muted)" fontFamily="var(--ve-font-mono)" fontSize={compact ? 8 : 10} style={svgTextOverflowStyle} x={textX} y={detailY}>
          {detailLines.map((line, lineIndex) => (
            <tspan dy={lineIndex === 0 ? 0 : 13} key={`${item.id}-detail-${lineIndex}`} x={textX}>
              {line}
            </tspan>
          ))}
        </text>
      ) : null}
    </g>
  );
}

const svgTextOverflowStyle: React.CSSProperties = { overflowX: 'auto', overflowY: 'auto' };

function splitSvgText(value: string, maxChars: number, options: { ellipsis?: boolean; maxLines?: number } = {}) {
  const explicit = String(value).split(/\n/g);
  const lines = explicit.flatMap((line) => wrapWords(line, maxChars)).filter((line) => line.length > 0);
  if (!options.maxLines || lines.length <= options.maxLines) return lines.length ? lines : [''];
  const visible = lines.slice(0, options.maxLines);
  if (options.ellipsis) visible[visible.length - 1] = withEllipsis(visible[visible.length - 1]!, maxChars);
  return visible.length ? visible : [''];
}

function wrapWords(value: string, maxChars: number) {
  const normalized = value.replace(/\s*·\s*/gu, ' · ').replace(/\s+\/\s+/gu, ' / ');
  const words = normalized.split(/(\s+)/).filter((part) => part.length > 0);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const compact = /^\s+$/.test(word) ? ' ' : word;
    const candidate = `${current}${compact}`;
    if (current && candidate.trim().length > maxChars) {
      const line = cleanWrappedLine(current);
      if (line) lines.push(line);
      current = isDanglingSeparator(compact) ? '' : compact.trimStart();
    } else {
      current = candidate;
    }
  }
  const line = cleanWrappedLine(current);
  if (line) lines.push(line);
  return balanceWrappedLines(lines, maxChars);
}

function balanceWrappedLines(lines: string[], maxChars: number) {
  if (lines.length < 2) return lines.length ? lines : [''];
  const balanced = [...lines];
  for (let index = balanced.length - 1; index > 0; index -= 1) {
    const line = balanced[index]!;
    if (line.length > 8) continue;
    const previous = balanced[index - 1]!;
    const previousWords = previous.split(/\s+/);
    if (previousWords.length < 2) continue;
    const moved = previousWords.pop()!;
    const candidate = cleanWrappedLine(`${moved} ${line}`);
    if (candidate.length > maxChars) continue;
    balanced[index - 1] = cleanWrappedLine(previousWords.join(' '));
    balanced[index] = candidate;
  }
  return balanced.filter((line) => line.length > 0);
}

function cleanWrappedLine(value: string) {
  return value.trim().replace(/^[·,/]\s*/u, '').replace(/\s*[·,/]\s*$/u, '').trim();
}

function isDanglingSeparator(value: string) {
  return /^[\s·,/]+$/u.test(value);
}

function withEllipsis(value: string, maxChars: number) {
  const clean = cleanWrappedLine(value);
  if (clean.length + 1 <= maxChars) return `${clean}…`;
  const clipped = clean.slice(0, Math.max(1, maxChars - 1));
  const boundary = Math.max(clipped.lastIndexOf(' '), clipped.lastIndexOf('·'), clipped.lastIndexOf('/'), clipped.lastIndexOf(','));
  const base = boundary > 4 ? clipped.slice(0, boundary) : clipped;
  return `${cleanWrappedLine(base)}…`;
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
  const pattern = /\x1b\[([0-9;]*)m/g;
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

function fitMermaidForeignObjects(host: HTMLElement) {
  const svg = host.querySelector<SVGSVGElement>('svg');
  const viewBox = svg?.viewBox.baseVal;
  let maxRight = viewBox ? viewBox.x + viewBox.width : 0;
  let maxBottom = viewBox ? viewBox.y + viewBox.height : 0;

  for (const node of host.querySelectorAll<SVGForeignObjectElement>('foreignObject')) {
    node.style.overflow = 'hidden';
    const width = Number(node.getAttribute('width')) || node.getBoundingClientRect().width;
    const height = Number(node.getAttribute('height')) || node.getBoundingClientRect().height;
    const child = node.firstElementChild as HTMLElement | null;
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
    /(\b[A-Za-z][\w-]*\b)(\[\[|\[\(|\[|\{\{|\{|\(\(|\()("[^"]+"|'[^']+'|[^\]\}\)\n]+)(\]\]|\]\)|\]|\}\}|\}|\)\)|\))/g,
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
  eyebrow = 'Slide Deck',
  children,
  orientation = 'vertical',
  preset = 'mono-industrial',
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
    >
      <nav className="fixed left-4 top-4 z-40 rounded-[var(--ve-radius)] border border-[color:var(--ve-rule)] bg-[var(--ve-nav-bg)] px-3 py-2 text-xs uppercase tracking-[0.16em] text-[var(--ve-muted)] [font-family:var(--ve-font-mono)]">
        <span className="text-[var(--ve-accent)]">{eyebrow}</span>
        <span className="mx-2 text-[var(--ve-faint)]">/</span>
        {title}
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
          {kicker ? <p className="text-xs uppercase tracking-[0.18em] text-[var(--ve-slide-muted)] [font-family:var(--ve-font-mono)]">{kicker}</p> : null}
          <h1 className="mt-5 max-w-5xl text-5xl leading-[0.95] tracking-normal sm:text-7xl lg:text-8xl [font-family:var(--ve-font-display)] [font-weight:var(--ve-display-weight)]">
            {title}
          </h1>
        </div>
        <div className="min-w-0 border-l border-[color:var(--ve-slide-rule)] pl-6 text-lg leading-8 sm:text-xl">{children}</div>
      </div>
      <div className="mt-10 border-t border-[color:var(--ve-slide-rule)] pt-4 text-xs uppercase tracking-[0.16em] text-[var(--ve-slide-muted)] [font-family:var(--ve-font-mono)]">
        Generated from MDX/React source
      </div>
    </section>
  );
}

export function PosterCanvas({ eyebrow = 'Poster', title, stat, footer, preset = 'mono-industrial', children }: PosterCanvasProps) {
  return (
    <main className="min-h-screen bg-[var(--ve-bg)] p-4 text-[var(--ve-text)] sm:p-8 [font-family:var(--ve-font-body)]" data-ve-preset={preset}>
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] items-center justify-center sm:min-h-[calc(100vh-4rem)]">
        <section
          className="relative grid aspect-[16/10] w-full max-w-[1200px] overflow-hidden rounded-[var(--ve-poster-radius)] border border-[color:var(--ve-poster-rule)] bg-[var(--ve-poster-bg)] p-[5%] text-[var(--ve-poster-text)] shadow-2xl shadow-black/50"
          data-ve-label={title}
          data-ve-poster
        >
          <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--ve-poster-grid)_1px,transparent_1px),linear-gradient(var(--ve-poster-grid)_1px,transparent_1px)] bg-[size:40px_40px]" />
          <div className="relative z-10 grid h-full grid-cols-[minmax(0,1fr)_minmax(180px,0.42fr)] gap-[5%]">
            <div className="flex min-w-0 flex-col justify-between">
              <div>
                <p className="text-[clamp(0.55rem,1.2vw,0.9rem)] uppercase tracking-[0.18em] text-[var(--ve-poster-muted)] [font-family:var(--ve-font-mono)]">
                  {eyebrow}
                </p>
                <h1 className="mt-[4%] max-w-[10ch] text-[clamp(2.8rem,8vw,6rem)] leading-[0.9] tracking-normal [font-family:var(--ve-font-display)] [font-weight:var(--ve-display-weight)]">
                  {title}
                </h1>
              </div>
              {footer ? (
                <p className="max-w-[42ch] border-t border-[color:var(--ve-poster-rule)] pt-[3%] text-[clamp(0.55rem,1.1vw,0.85rem)] uppercase tracking-[0.14em] text-[var(--ve-poster-muted)] [font-family:var(--ve-font-mono)]">
                  {footer}
                </p>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-col justify-between border-l border-[color:var(--ve-poster-rule)] pl-[10%]">
              {stat ? <div className="text-[clamp(4rem,12vw,9rem)] leading-none tracking-normal [font-family:var(--ve-font-mono)]">{stat}</div> : null}
              <div className="text-[clamp(0.8rem,1.8vw,1.35rem)] leading-[1.35] text-[var(--ve-poster-muted)]">{children}</div>
            </div>
          </div>
        </section>
      </div>
      <AnnotationLayer />
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
      className="ve-review-panel z-50 flex w-[min(420px,calc(100vw-32px))] flex-col gap-3 rounded-[var(--ve-radius)] border border-[color:var(--ve-rule)] bg-[var(--ve-review-bg)] p-4 text-sm text-[var(--ve-text)] shadow-2xl shadow-black/40 [font-family:var(--ve-font-body)]"
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

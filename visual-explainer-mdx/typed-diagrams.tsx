// Typed diagrams for a guided review, drawn in the grammar of Diagram Design (Cathryn Lavery, MIT;
// see DIAGRAM-DESIGN-LICENSE and plugins/visual-explainer/vendor/diagram-design): a sequence
// (lifelines, activation bars, dashed returns, U-shaped self calls, one loop frame), a state machine
// (rounded states, a start dot, ringed end dots, labelled transitions, self-loops above), a schema
// (two-part entity boxes with mono fields), a flow and the map of how the changed files connect
// (ranked boxes, right-angle elbows, fan-in badges, one marked cycle). The host's tokens replace the
// upstream skin, and its type floor (14px) replaces the 8px mono labels.
// On top of that grammar sit our own layers: a change status on each element (added, changed,
// removed, same) in colour and in words, a Before / After switch, the page's Simple / Detailed mode
// (a `code` name per element) and links from elements to their chapter. The chapter shapes follow
// the guide schema of the MIT `guided-review` plugin (see GUIDED-REVIEW-NOTICE.md).
import { Fragment, useId, useState, type ReactNode } from 'react';
import { useDiagramMode } from './diagram-modes';
import { TrustMapError } from './trust-map-rules';
import './typed-diagrams.css';

export type ChangeStatus = 'added' | 'changed' | 'removed' | 'same';
type Layered = { status?: ChangeStatus; chapter?: string; code?: string };
type Move = { from: string; to: string; label?: string; code?: string; status?: ChangeStatus };
export type SequenceSpec = {
  kind: 'sequence'; title?: string; caption?: string;
  actors: Array<{ id: string; label: string } & Layered>;
  steps: Array<(Move & { label: string; reply?: boolean; async?: boolean; headline?: boolean }) | { note: string; over: string[] } | { divider: string } | { loop: string; over: string[] } | { end: true }>;
};
export type StateSpec = { kind: 'state'; title?: string; caption?: string; start?: string; nodes: Array<{ id: string; label: string; end?: boolean; focal?: boolean } & Layered>; edges: Move[] };
export type SchemaSpec = {
  kind: 'schema'; title?: string; caption?: string;
  entities: Array<{ name: string; fields: Array<{ name: string; type?: string; key?: 'pk' | 'fk'; status?: ChangeStatus }>; focal?: boolean } & Layered>;
  links: Array<{ from: string; to: string; label?: string; cardinality?: [string, string]; status?: ChangeStatus }>;
};
export type FlowSpec = { kind: 'flow'; title?: string; caption?: string; nodes: Array<{ id: string; label: string; focal?: boolean } & Layered>; edges: Move[] };
export type MapSpec = { kind: 'map'; title?: string; caption?: string; nodes: Array<{ id: string; label: string; chapter?: string }>; edges: Array<{ from: string; to: string; n: number }> };
export type TypedDiagramSpec = SequenceSpec | StateSpec | SchemaSpec | FlowSpec | MapSpec;
type View = 'before' | 'after';

const STATUS_WORD = { added: 'new', changed: 'changed', removed: 'removed', same: 'unchanged' } satisfies Record<ChangeStatus, string>;
const MAX_LABEL = 40;
const FONT = 14;
const CHAR = 0.55 * FONT;
const MONO = 0.62 * 13;
const g4 = (n: number) => Math.ceil(n / 4) * 4;
/** A figure shrinks to 88% of its size to fit its column, then the column scrolls, so its 14px type never drops below about 12px. */
const fit = (width: number) => ({ width: '100%', maxWidth: width, minWidth: Math.round(width * 0.88) });
const textWidth = (text: string, mono = false) => text.length * (mono ? MONO : CHAR);

/** Shown in this view? Before hides what the PR adds; After keeps what it removes, struck through. */
const shown = (status: ChangeStatus | undefined, view: View) => !(view === 'before' && status === 'added');
const word = (status?: ChangeStatus) => (status && status !== 'same' ? STATUS_WORD[status] : '');
export const chapterHref = (chapter?: string) => (chapter ? `#spine-${chapter.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}` : undefined);

type Ctx = { view: View; detailed: boolean; markers: string };
const name = (x: { label: string; code?: string }, c: Ctx) => (c.detailed && x.code ? x.code : x.label);

/** The markers of one figure: a filled head for calls and returns, an open head for async, an accent head. */
function Markers({ id }: { id: string }) {
  return (
    <defs>
      <marker id={`${id}-arrow`} markerHeight="6" markerWidth="8" orient="auto" refX="7" refY="3"><polygon className="ve-dd-head" points="0 0, 8 3, 0 6" /></marker>
      <marker id={`${id}-open`} markerHeight="6" markerWidth="8" orient="auto" refX="7" refY="3"><polyline className="ve-dd-head-open" points="0 0, 8 3, 0 6" /></marker>
      <marker id={`${id}-accent`} markerHeight="6" markerWidth="8" orient="auto" refX="7" refY="3"><polygon className="ve-dd-head-accent" points="0 0, 8 3, 0 6" /></marker>
    </defs>
  );
}

/** A label on a line, on an opaque paper mask so the line never runs through the words. */
function MaskedLabel({ x, y, text, anchor = 'middle', className = 've-dd-label', mono = false }: { x: number; y: number; text: string; anchor?: 'middle' | 'start'; className?: string; mono?: boolean }) {
  const w = g4(textWidth(text, mono) + 12);
  const left = anchor === 'middle' ? x - w / 2 : x - 6;
  return (
    <g>
      <rect className="ve-dd-mask" height="20" rx="2" width={w} x={left} y={y - 15} />
      <text className={className} data-ve-mono={mono ? 'true' : undefined} textAnchor={anchor} x={x} y={y}>{text}</text>
    </g>
  );
}

function Linked({ chapter, children }: { chapter?: string; children: ReactNode }) {
  const href = chapterHref(chapter);
  return href ? <a href={href}>{children}</a> : <>{children}</>;
}

// ---- Sequence ------------------------------------------------------------------------------------

function Sequence({ spec, c }: { spec: SequenceSpec; c: Ctx }) {
  const actors = spec.actors.filter((a) => shown(a.status, c.view));
  const col = new Map(actors.map((a, i) => [a.id, i]));
  const steps = spec.steps.filter((s) => !('from' in s) || (shown(s.status, c.view) && col.has(s.from) && col.has(s.to)));
  const boxW = g4(Math.max(136, ...actors.map((a) => textWidth(name(a, c), c.detailed && Boolean(a.code)) + 32)));
  const gap = 24;
  const X = (i: number) => 24 + i * (boxW + gap) + boxW / 2;
  const width = 48 + actors.length * boxW + (actors.length - 1) * gap;
  let y = 104;
  type Row = { s: (typeof steps)[number]; y: number; n?: number };
  const rows: Row[] = [];
  let n = 0;
  for (const s of steps) {
    if ('from' in s) n += 1;
    rows.push({ s, y, n: 'from' in s ? n : undefined });
    y += 'divider' in s ? 36 : 'end' in s ? 16 : 'loop' in s ? 40 : 'note' in s ? 44 : 'from' in s && s.from === s.to ? 56 : 44;
  }
  const height = y + 24;
  // Activation bars: from a call that an actor receives to the reply it sends back.
  const bars: Array<{ x: number; y1: number; y2: number }> = [];
  rows.forEach((r, i) => {
    const s = r.s;
    if (!('from' in s) || s.reply || s.async || s.from === s.to) return;
    const back = rows.slice(i + 1).find((q) => 'from' in q.s && q.s.reply && q.s.from === s.to && q.s.to === s.from);
    bars.push({ x: X(col.get(s.to)!), y1: r.y + 2, y2: (back ? back.y : r.y + 24) + 2 });
  });
  const loops = rows.flatMap((r, i) => {
    if (!('loop' in r.s)) return [];
    const end = rows.slice(i + 1).find((q) => 'end' in q.s);
    const cols = r.s.over.map((id) => col.get(id)).filter((v): v is number => v !== undefined);
    if (!cols.length) return [];
    return [{ x1: X(Math.min(...cols)) - boxW / 2 + 8, x2: X(Math.max(...cols)) + boxW / 2 - 8, y1: r.y - 4, y2: (end ? end.y : height - 24) - 4, guard: r.s.loop }];
  });
  return (
    <svg aria-hidden="true" className="ve-dd ve-sequence" data-ve-sequence style={fit(width)} viewBox={`0 0 ${width} ${height}`}>
      <Markers id={c.markers} />
      {loops.map((f, i) => (
        <g className="ve-dd-frame" key={`f${i}`}>
          <rect height={f.y2 - f.y1} rx="4" width={f.x2 - f.x1} x={f.x1} y={f.y1} />
          <rect className="ve-dd-frame-tab" height="20" rx="2" width="52" x={f.x1} y={f.y1} />
          <text className="ve-dd-frame-op" textAnchor="middle" x={f.x1 + 26} y={f.y1 + 14}>LOOP</text>
          <text className="ve-dd-guard" x={f.x1 + 60} y={f.y1 + 14}>[{f.guard}]</text>
        </g>
      ))}
      {actors.map((a, i) => (
        <g data-ve-status={a.status ?? 'same'} key={a.id}>
          <line className="ve-dd-life" x1={X(i)} x2={X(i)} y1="64" y2={height - 12} />
          <Linked chapter={a.chapter}>
            <rect className="ve-dd-node" height="44" rx="6" width={boxW} x={X(i) - boxW / 2} y="16" />
            <text className="ve-dd-name" data-ve-mono={c.detailed && a.code ? 'true' : undefined} textAnchor="middle" x={X(i)} y={word(a.status) ? 36 : 43}>{name(a, c)}</text>
            {word(a.status) ? <text className="ve-dd-status" textAnchor="middle" x={X(i)} y="52">{word(a.status)}</text> : null}
          </Linked>
        </g>
      ))}
      {bars.map((b, i) => <rect className="ve-dd-activation" height={Math.max(8, b.y2 - b.y1)} key={`b${i}`} width="8" x={b.x - 4} y={b.y1} />)}
      {rows.map(({ s, y: at, n: k }, i) => {
        if ('divider' in s) return <g key={i}><line className="ve-dd-divider" x1="16" x2={width - 16} y1={at + 4} y2={at + 4} /><MaskedLabel className="ve-dd-divider-label" text={s.divider} x={width / 2} y={at + 9} /></g>;
        if ('note' in s) {
          const cols = s.over.map((id) => col.get(id)).filter((v): v is number => v !== undefined);
          if (!cols.length) return null;
          const w = g4(Math.max(boxW, textWidth(s.note) + 24));
          const x1 = Math.max(8, Math.min(X(Math.min(...cols)) - w / 2, width - 8 - w));
          return <g key={i}><rect className="ve-dd-note" height="28" rx="4" width={w} x={x1} y={at - 6} /><text className="ve-dd-note-label" x={x1 + 12} y={at + 13}>{s.note}</text></g>;
        }
        if (!('from' in s)) return null;
        const a = X(col.get(s.from)!);
        const b = X(col.get(s.to)!);
        const struck = c.view === 'after' && s.status === 'removed';
        const head = s.headline ? `url(#${c.markers}-accent)` : s.async ? `url(#${c.markers}-open)` : `url(#${c.markers}-arrow)`;
        const text = `${k}  ${name({ label: s.label, code: s.code }, c)}${word(s.status) ? ` (${word(s.status)})` : ''}`;
        const cls = `ve-dd-msg${s.reply || s.async ? ' ve-dd-dashed' : ''}${s.headline ? ' ve-dd-accent' : ''}`;
        if (s.from === s.to) {
          return (
            <g className={cls} data-ve-status={s.status ?? 'same'} data-ve-struck={struck ? 'true' : undefined} key={i}>
              <path d={`M ${a + 4} ${at} L ${a + 40} ${at} L ${a + 40} ${at + 28} L ${a + 6} ${at + 28}`} markerEnd={head} />
              <MaskedLabel anchor="start" text={text} x={a + 52} y={at + 19} />
            </g>
          );
        }
        const dir = b > a ? 1 : -1;
        return (
          <g className={cls} data-ve-status={s.status ?? 'same'} data-ve-struck={struck ? 'true' : undefined} key={i}>
            <line markerEnd={head} x1={a + dir * 4} x2={b - dir * 6} y1={at + 4} y2={at + 4} />
            <MaskedLabel text={text} x={(a + b) / 2} y={at - 4} />
          </g>
        );
      })}
    </svg>
  );
}

function SequenceList({ spec, c }: { spec: SequenceSpec; c: Ctx }) {
  const actor = (id: string) => spec.actors.find((x) => x.id === id)!;
  const steps = spec.steps.filter((s) => !('from' in s) || shown(s.status, c.view));
  return (
    <ol className="ve-typed-list" data-ve-typed-list>
      {steps.map((s, k) => {
        if ('divider' in s) return <li className="ve-typed-list-aside" key={k}>{s.divider}</li>;
        if ('note' in s) return <li className="ve-typed-list-aside" key={k}>{s.note}</li>;
        if ('loop' in s) return <li className="ve-typed-list-aside" key={k}>Repeat, {s.loop}:</li>;
        if ('end' in s) return <li className="ve-typed-list-aside" key={k}>End of the repeat.</li>;
        return (
          <li data-ve-status={s.status ?? 'same'} data-ve-struck={c.view === 'after' && s.status === 'removed' ? 'true' : undefined} key={k}>
            <strong>{name(actor(s.from), c)}</strong>{s.from === s.to ? '' : <> to <strong>{name(actor(s.to), c)}</strong></>}: {name({ label: s.label, code: s.code }, c)}{s.reply ? ' (a reply)' : s.async ? ' (no reply)' : ''}{word(s.status) ? <span className="ve-typed-word"> ({word(s.status)})</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

// ---- Ranked graphs: state, flow and the map of the changed files -------------------------------

/** A box label in lines of about 24 characters, so a long name makes a taller box, not a wider one. */
function wrapLabel(text: string, max = 24): string[] {
  const out: string[] = [];
  for (const w of text.split(' ')) {
    const last = out.at(-1);
    if (last !== undefined && (last + ' ' + w).length <= max) out[out.length - 1] = last + ' ' + w;
    else out.push(w);
  }
  return out;
}

type GNode = { id: string; label: string; sub?: string; status?: ChangeStatus; chapter?: string; focal?: boolean; end?: boolean; mono?: boolean; badge?: string };
type GEdge = { from: string; to: string; label?: string; status?: ChangeStatus; cycle?: boolean };

/** Ranks by the longest path from the sources, with the edges that close a cycle set aside. */
function rank(nodes: GNode[], edges: GEdge[]) {
  const out = new Map(nodes.map((n) => [n.id, [] as string[]]));
  for (const e of edges) if (e.from !== e.to) out.get(e.from)?.push(e.to);
  const state = new Map<string, number>();
  const back = new Set<string>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const to of out.get(id) ?? []) {
      if (state.get(to) === 1) back.add(`${id}>${to}`);
      else if (!state.has(to)) visit(to);
    }
    state.set(id, 2);
  };
  for (const n of nodes) if (!state.has(n.id)) visit(n.id);
  const r = new Map(nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < nodes.length; pass += 1) {
    for (const e of edges) if (e.from !== e.to && !back.has(`${e.from}>${e.to}`)) r.set(e.to, Math.max(r.get(e.to)!, r.get(e.from)! + 1));
  }
  return { r, back };
}

function RankedGraph({ nodes, edges, c, vertical = false, ends = false, start }: { nodes: GNode[]; edges: GEdge[]; c: Ctx; vertical?: boolean; ends?: boolean; start?: string }) {
  const { r, back } = rank(nodes, edges);
  const ranks = Math.max(0, ...r.values()) + 1;
  const lines = new Map(nodes.map((n) => [n.id, n.mono ? [n.label] : wrapLabel(n.label)]));
  const size = new Map(nodes.map((n) => [n.id, { w: g4(Math.max(120, ...lines.get(n.id)!.map((l) => textWidth(l, n.mono) + 40), n.sub ? textWidth(n.sub) + 32 : 0)), h: 24 + lines.get(n.id)!.length * 20 + (n.sub ? 16 : 0) }]));
  const lanes: GNode[][] = Array.from({ length: ranks }, () => []);
  for (const n of nodes) lanes[r.get(n.id)!]!.push(n);
  const labelRoom = Math.max(0, ...edges.map((e) => (e.label ? textWidth(e.label + (e.status && e.status !== 'same' ? ' (changed)' : '')) + 40 : 0)));
  const step = vertical ? Math.max(...nodes.map((n) => size.get(n.id)!.h)) + 84 : Math.max(...nodes.map((n) => size.get(n.id)!.w)) + Math.max(96, labelRoom);
  const lead = start ? 56 : 24;
  const across = (lane: GNode[]) => lane.reduce((s, n) => s + (vertical ? size.get(n.id)!.w : size.get(n.id)!.h) + 32, -32);
  const span = Math.max(...lanes.map(across));
  const pos = new Map<string, { x: number; y: number; w: number; h: number }>();
  lanes.forEach((lane, i) => {
    const selfRoom = vertical ? Math.max(0, ...edges.filter((e) => e.from === e.to).map((e) => textWidth(e.label ?? '') + 64)) : 0;
    let at = (span - across(lane)) / 2 + (vertical ? 64 + selfRoom : 40);
    for (const n of lane) {
      const s = size.get(n.id)!;
      pos.set(n.id, vertical ? { x: at, y: (start ? 64 : 24) + i * step, w: s.w, h: s.h } : { x: lead + i * step, y: at, w: s.w, h: s.h });
      at += (vertical ? s.w : s.h) + 32;
    }
  });
  const trunkRoom = vertical ? Math.max(64, ...edges.map((e) => textWidth(e.label ?? '') + 56)) : 24;
  const width = g4(Math.max(...[...pos.values()].map((p) => p.x + p.w)) + (ends ? 64 : 32) + trunkRoom);
  const height = g4(Math.max(...[...pos.values()].map((p) => p.y + p.h)) + 56 + (ends && vertical ? 24 : 0) + (edges.some((e) => back.has(`${e.from}>${e.to}`) || r.get(e.to)! - r.get(e.from)! > 1) && !vertical ? 36 : 0));
  const center = (id: string) => { const p = pos.get(id)!; return { cx: p.x + p.w / 2, cy: p.y + p.h / 2, ...p }; };
  // Fanned attach points: each edge leaves and enters its box at its own port, 24px apart.
  const port = (id: string, list: GEdge[], e: GEdge, end: 'from' | 'to') => {
    const mine = list.filter((x) => x[end] === id && x.from !== x.to);
    const other = (x: GEdge) => center(end === 'from' ? x.to : x.from)[vertical ? 'cx' : 'cy'];
    mine.sort((a, b) => other(a) - other(b));
    const i = mine.indexOf(e);
    return (i - (mine.length - 1) / 2) * 24;
  };
  const path = (e: GEdge) => {
    const a = center(e.from);
    const b = center(e.to);
    if (e.from === e.to) {
      // A self-loop curves above the state (on its right side in a top-to-bottom figure, clear of the arrow coming in).
      if (vertical) return { d: `M ${a.x} ${a.cy - 10} C ${a.x - 40} ${a.cy - 24}, ${a.x - 40} ${a.cy + 24}, ${a.x - 4} ${a.cy + 10}`, lx: a.x - 48 - textWidth(e.label ?? '') / 2, ly: a.cy + 5 };
      return { d: `M ${a.cx - 16} ${a.y} C ${a.cx - 28} ${a.y - 40}, ${a.cx + 28} ${a.y - 40}, ${a.cx + 16} ${a.y}`, lx: a.cx, ly: a.y - 34 };
    }
    const isBack = back.has(`${e.from}>${e.to}`) || r.get(e.to)! <= r.get(e.from)!;
    const skips = !isBack && r.get(e.to)! - r.get(e.from)! > 1;
    const pa = port(e.from, edges, e, 'from');
    const pb = port(e.to, edges, e, 'to');
    if (vertical) {
      if (isBack || skips) {
        // Around the outside of the stack, never behind a box that the edge does not join.
        // Alternate sides, so no two trunks run stacked on one side.
        const k = edges.filter((x) => back.has(`${x.from}>${x.to}`) || r.get(x.to)! - r.get(x.from)! > 1).indexOf(e);
        const left = k % 2 === 1;
        const xs = [...pos.values()];
        const x = left ? Math.min(...xs.map((q) => q.x)) - 24 - Math.floor(k / 2) * 12 : Math.max(...xs.map((q) => q.x + q.w)) + 24 + Math.floor(k / 2) * 12;
        const ax0 = left ? a.x : a.x + a.w;
        const bx0 = left ? b.x - 4 : b.x + b.w + 4;
        const t = left ? 8 : -8;
        const v = b.cy < a.cy ? -8 : 8;
        const half = textWidth(e.label ?? '') / 2 + 8;
        return { d: `M ${ax0} ${a.cy} H ${x + t} Q ${x} ${a.cy} ${x} ${a.cy + v} V ${b.cy - v} Q ${x} ${b.cy} ${x + t} ${b.cy} H ${bx0}`, lx: x + (left ? -half : half), ly: (a.cy + b.cy) / 2 };
      }
      const ax = a.cx + pa; const bx = b.cx + pb;
      const y0 = a.y + a.h; const y1 = b.y - 4;
      const lane = (edges.filter((x) => r.get(x.from) === r.get(e.from)).indexOf(e) % 4) * 12;
      const mid = y0 + 16 + lane;
      // The label sits just above the box that the edge enters, so the labels of a fan-out never meet.
      if (Math.abs(ax - bx) < 2) return { d: `M ${ax} ${y0} V ${y1}`, lx: bx, ly: y1 - 12 };
      const s = bx > ax ? 1 : -1;
      return { d: `M ${ax} ${y0} V ${mid - 8} Q ${ax} ${mid} ${ax + 8 * s} ${mid} H ${bx - 8 * s} Q ${bx} ${mid} ${bx} ${mid + 8} V ${y1}`, lx: bx, ly: y1 - 12 };
    }
    if (isBack || skips) {
      const below = Math.max(...[...pos.values()].map((p) => p.y + p.h)) + 28 + (edges.indexOf(e) % 3) * 12;
      return { d: `M ${a.cx} ${a.y + a.h} C ${a.cx} ${below}, ${b.cx} ${below}, ${b.cx} ${b.y + b.h + 4}`, lx: (a.cx + b.cx) / 2, ly: below - 4 };
    }
    const x0 = a.x + a.w; const x1 = b.x - 4;
    const y0 = a.cy + pa; const y1 = b.cy + pb;
    // The label sits by the box that the transition enters, so labels of a fan-out never meet.
    return { d: `M ${x0} ${y0} C ${(x0 + x1) / 2} ${y0}, ${(x0 + x1) / 2} ${y1}, ${x1} ${y1}`, lx: x1 - 16 - textWidth(e.label ?? '') / 2, ly: y1 - 8 };
  };
  const first = start ? pos.get(start) : undefined;
  return (
    <svg aria-hidden="true" className="ve-dd" style={fit(width)} viewBox={`0 0 ${width} ${height}`}>
      <Markers id={c.markers} />
      {first && vertical ? <g><circle className="ve-dd-start" cx={first.x + first.w / 2} cy="20" r="6" /><line className="ve-dd-edge" markerEnd={`url(#${c.markers}-arrow)`} x1={first.x + first.w / 2} x2={first.x + first.w / 2} y1="28" y2={first.y - 4} /></g> : null}
      {first && !vertical ? <g><circle className="ve-dd-start" cx="22" cy={first.y + first.h / 2} r="6" /><line className="ve-dd-edge" markerEnd={`url(#${c.markers}-arrow)`} x1="30" x2={first.x - 4} y1={first.y + first.h / 2} y2={first.y + first.h / 2} /></g> : null}
      {edges.map((e, i) => {
        const p = path(e);
        const struck = c.view === 'after' && e.status === 'removed';
        return (
          <g className={`ve-dd-edge-g${e.cycle ? ' ve-dd-accent ve-dd-dashed' : ''}`} data-ve-status={e.status ?? 'same'} data-ve-struck={struck ? 'true' : undefined} key={i}>
            <path className="ve-dd-edge" d={p.d} markerEnd={`url(#${c.markers}-${e.cycle ? 'accent' : 'arrow'})`} />
            {e.label || e.cycle ? <MaskedLabel text={`${e.cycle ? 'cycle · ' : ''}${e.label ?? ''}${word(e.status) ? ` (${word(e.status)})` : ''}`} x={p.lx} y={p.ly} /> : null}
          </g>
        );
      })}
      {nodes.map((n) => {
        const p = pos.get(n.id)!;
        return (
          <g data-ve-focal={n.focal ? 'true' : undefined} data-ve-status={n.status ?? 'same'} data-ve-struck={c.view === 'after' && n.status === 'removed' ? 'true' : undefined} key={n.id}>
            <Linked chapter={n.chapter}>
              <rect className="ve-dd-node" height={p.h} rx="8" width={p.w} x={p.x} y={p.y} />
              <text className="ve-dd-name" data-ve-mono={n.mono ? 'true' : undefined} textAnchor="middle" x={p.x + p.w / 2} y={p.y + 27}>{lines.get(n.id)!.map((l, i) => <tspan dy={i ? 20 : 0} key={i} x={p.x + p.w / 2}>{l}</tspan>)}</text>
              {n.sub ? <text className="ve-dd-status" textAnchor="middle" x={p.x + p.w / 2} y={p.y + 27 + lines.get(n.id)!.length * 20}>{n.sub}</text> : null}
            </Linked>
            {n.badge ? <g><rect className="ve-dd-badge" height="20" rx="2" width={g4(textWidth(n.badge, true) + 12)} x={p.x + p.w - g4(textWidth(n.badge, true) + 12) - 4} y={p.y - 10} /><text className="ve-dd-badge-text" textAnchor="end" x={p.x + p.w - 10} y={p.y + 4}>{n.badge}</text></g> : null}
            {ends && n.end && vertical ? <g><line className="ve-dd-edge" x1={p.x + p.w / 2} x2={p.x + p.w / 2} y1={p.y + p.h} y2={p.y + p.h + 16} /><circle className="ve-dd-end-ring" cx={p.x + p.w / 2} cy={p.y + p.h + 26} r="8" /><circle className="ve-dd-start" cx={p.x + p.w / 2} cy={p.y + p.h + 26} r="5" /></g> : null}
            {ends && n.end && !vertical ? <g><line className="ve-dd-edge" markerEnd={`url(#${c.markers}-arrow)`} x1={p.x + p.w} x2={p.x + p.w + 24} y1={p.y + p.h / 2} y2={p.y + p.h / 2} /><circle className="ve-dd-end-ring" cx={p.x + p.w + 40} cy={p.y + p.h / 2} r="8" /><circle className="ve-dd-start" cx={p.x + p.w + 40} cy={p.y + p.h / 2} r="5" /></g> : null}
          </g>
        );
      })}
    </svg>
  );
}

function State({ spec, c }: { spec: StateSpec; c: Ctx }) {
  const nodes: GNode[] = spec.nodes.filter((n) => shown(n.status, c.view)).map((n) => ({ id: n.id, label: name(n, c), mono: c.detailed && Boolean(n.code), sub: word(n.status) || undefined, status: n.status, chapter: n.chapter, focal: n.focal, end: n.end }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges: GEdge[] = spec.edges.filter((e) => shown(e.status, c.view) && ids.has(e.from) && ids.has(e.to)).map((e) => ({ from: e.from, to: e.to, label: e.label && name({ label: e.label, code: e.code }, c), status: e.status }));
  const { r } = rank(nodes, edges);
  const ranks = Math.max(0, ...r.values()) + 1;
  const wide = ranks * (Math.max(...nodes.map((n) => textWidth(n.label) + 40), 120) + Math.max(96, ...edges.map((e) => textWidth(e.label ?? '') + 40))) > 900;
  return <RankedGraph c={c} edges={edges} ends nodes={nodes} start={spec.start && ids.has(spec.start) ? spec.start : undefined} vertical={wide} />;
}

function Flow({ spec, c }: { spec: FlowSpec; c: Ctx }) {
  const nodes: GNode[] = spec.nodes.filter((n) => shown(n.status, c.view)).map((n) => ({ id: n.id, label: name(n, c), mono: c.detailed && Boolean(n.code), sub: word(n.status) || undefined, status: n.status, chapter: n.chapter, focal: n.focal }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges: GEdge[] = spec.edges.filter((e) => shown(e.status, c.view) && ids.has(e.from) && ids.has(e.to)).map((e) => ({ from: e.from, to: e.to, label: e.label && name({ label: e.label, code: e.code }, c), status: e.status }));
  return <RankedGraph c={c} edges={edges} nodes={nodes} />;
}

/** The map of how the changed files connect: each chapter a box, an arrow for its imports of another, its fan-in as a badge, one cycle marked. */
function FileMap({ spec, c }: { spec: MapSpec; c: Ctx }) {
  const fanIn = new Map<string, number>();
  for (const e of spec.edges) fanIn.set(e.to, (fanIn.get(e.to) ?? 0) + 1);
  const nodes: GNode[] = spec.nodes.map((n) => ({ id: n.id, label: n.label, chapter: n.chapter, badge: `${fanIn.get(n.id) ?? 0} in` }));
  const { back } = rank(nodes, spec.edges);
  // Diagram Design marks one cycle: the back edge with the most imports. The others stay in the list below the figure.
  const cycle = spec.edges.filter((e) => back.has(`${e.from}>${e.to}`)).sort((a, b) => b.n - a.n)[0];
  const edges: GEdge[] = spec.edges.filter((e) => !back.has(`${e.from}>${e.to}`) || e === cycle).map((e) => ({ from: e.from, to: e.to, cycle: e === cycle, label: e === cycle ? `${e.n} ${e.n === 1 ? 'import' : 'imports'}` : undefined }));
  return <RankedGraph c={c} edges={edges} nodes={nodes} vertical />;
}

// ---- Schema ------------------------------------------------------------------------------------

function Schema({ spec, c }: { spec: SchemaSpec; c: Ctx }) {
  const entities = spec.entities.filter((e) => shown(e.status, c.view));
  const at = new Map(entities.map((e, i) => [e.name, i]));
  const boxW = g4(Math.max(200, ...entities.flatMap((e) => [textWidth(name({ label: e.name, code: e.code }, c)) + 40, ...e.fields.map((f) => textWidth(`${f.key === 'pk' ? '# ' : f.key === 'fk' ? '→ ' : ''}${f.name}${f.type ? ': ' + f.type : ''}`, true) + 40)])));
  const gap = 96;
  const heights = entities.map((e) => 52 + e.fields.filter((f) => shown(f.status, c.view)).length * 24 + 12);
  const width = 48 + entities.length * boxW + (entities.length - 1) * gap;
  const height = Math.max(...heights, 80) + 72;
  const X = (i: number) => 24 + i * (boxW + gap);
  return (
    <svg aria-hidden="true" className="ve-dd" style={fit(width)} viewBox={`0 0 ${width} ${height}`}>
      <Markers id={c.markers} />
      {spec.links.filter((l) => shown(l.status, c.view) && at.has(l.from) && at.has(l.to)).map((l, i) => {
        const a = at.get(l.from)!;
        const b = at.get(l.to)!;
        const [left, right] = a < b ? [a, b] : [b, a];
        const y = 40;
        const x1 = X(left) + boxW;
        const x2 = X(right);
        const adjacent = right - left === 1;
        const d = adjacent ? `M ${x1} ${y + 8} H ${x2}` : `M ${X(left) + boxW / 2} ${height - 60} V ${height - 24} H ${X(right) + boxW / 2} V ${height - 60}`;
        return (
          <g className="ve-dd-edge-g" data-ve-status={l.status ?? 'same'} key={i}>
            <path className="ve-dd-edge" d={d} />
            {l.cardinality ? <><text className="ve-dd-card" x={adjacent ? x1 + 10 : X(left) + boxW / 2 + 8} y={adjacent ? y : height - 64}>{a < b ? l.cardinality[0] : l.cardinality[1]}</text><text className="ve-dd-card" textAnchor="end" x={adjacent ? x2 - 10 : X(right) + boxW / 2 - 8} y={adjacent ? y : height - 64}>{a < b ? l.cardinality[1] : l.cardinality[0]}</text></> : null}
            {l.label ? <MaskedLabel text={`${l.label}${word(l.status) ? ` (${word(l.status)})` : ''}`} x={adjacent ? (x1 + x2) / 2 : (X(left) + X(right) + boxW) / 2} y={adjacent ? y + 30 : height - 12} /> : null}
          </g>
        );
      })}
      {entities.map((e, i) => {
        const fields = e.fields.filter((f) => shown(f.status, c.view));
        return (
          <g data-ve-focal={e.focal ? 'true' : undefined} data-ve-status={e.status ?? 'same'} key={e.name}>
            <Linked chapter={e.chapter}>
              <rect className="ve-dd-node" height={heights[i]} rx="6" width={boxW} x={X(i)} y="16" />
              <text className="ve-dd-tag" x={X(i) + 16} y="36">ENTITY{word(e.status) ? ` · ${word(e.status).toUpperCase()}` : ''}</text>
              <text className="ve-dd-name" data-ve-mono={c.detailed && e.code ? 'true' : undefined} x={X(i) + 16} y="56">{name({ label: e.name, code: e.code }, c)}</text>
              <line className="ve-dd-rule" x1={X(i)} x2={X(i) + boxW} y1="66" y2="66" />
            </Linked>
            {fields.map((f, j) => (
              <text className="ve-dd-field" data-ve-status={f.status ?? 'same'} data-ve-struck={c.view === 'after' && f.status === 'removed' ? 'true' : undefined} key={f.name} x={X(i) + 16} y={88 + j * 24}>
                {f.key === 'pk' ? '# ' : f.key === 'fk' ? '→ ' : ''}{f.name}{f.type ? `: ${f.type}` : ''}{word(f.status) ? `  (${word(f.status)})` : ''}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

// ---- The figure ------------------------------------------------------------------------------------

function textList(spec: TypedDiagramSpec, c: Ctx): ReactNode {
  if (spec.kind === 'sequence') return <SequenceList c={c} spec={spec} />;
  let items: string[];
  if (spec.kind === 'schema') {
    items = spec.entities.filter((e) => shown(e.status, c.view)).map((e) => `${name({ label: e.name, code: e.code }, c)}${word(e.status) ? ` (${word(e.status)})` : ''}: ${e.fields.filter((f) => shown(f.status, c.view)).map((f) => f.name + (word(f.status) ? ` (${word(f.status)})` : '')).join(', ')}.`);
  } else if (spec.kind === 'map') {
    const label = (id: string) => spec.nodes.find((n) => n.id === id)?.label ?? id;
    items = spec.edges.map((e) => `${label(e.from)} imports ${label(e.to)}: ${e.n} ${e.n === 1 ? 'import' : 'imports'}.`);
  } else {
    const nodes: Array<{ id: string; label: string; code?: string }> = spec.nodes;
    const at = (id: string) => nodes.find((n) => n.id === id) ?? { label: id };
    items = spec.edges.filter((e) => shown(e.status, c.view)).map((e) => `${name(at(e.from), c)} to ${name(at(e.to), c)}${e.label ? `: ${name({ label: e.label, code: e.code }, c)}` : ''}${word(e.status) ? ` (${word(e.status)})` : ''}.`);
  }
  return <ul className="ve-typed-list" data-ve-typed-list>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>;
}

const BUDGET = { sequence: { lifelines: 5, messages: 12 }, map: { nodes: 9 } } as const;

function assertSpec(spec: TypedDiagramSpec, title: string) {
  const errors: string[] = [];
  if (spec.kind === 'sequence') {
    const actors = new Set(spec.actors.map((a) => a.id));
    const moves = spec.steps.flatMap((s) => ('from' in s ? [s] : []));
    for (const s of spec.steps) {
      if ('from' in s) {
        if (!actors.has(s.from) || !actors.has(s.to)) errors.push(`a message names an actor that the diagram does not have: ${s.from} to ${s.to}`);
        if (s.label.length > MAX_LABEL) errors.push(`the message "${s.label}" is longer than ${MAX_LABEL} characters`);
      }
      if (('note' in s || 'loop' in s) && s.over.some((id) => !actors.has(id))) errors.push(`a note or a loop is over an actor that the diagram does not have: ${s.over.join(', ')}`);
    }
    if (spec.actors.length > BUDGET.sequence.lifelines) errors.push(`it has ${spec.actors.length} lifelines; Diagram Design allows ${BUDGET.sequence.lifelines}: split it`);
    if (moves.length > BUDGET.sequence.messages) errors.push(`it has ${moves.length} messages; Diagram Design allows ${BUDGET.sequence.messages}: split it into an overview and a detail`);
    if (moves.filter((s) => s.headline).length > 2) errors.push('it has more than two headline messages; keep the accent for one or two');
    if (spec.steps.filter((s) => 'loop' in s).length > 1) errors.push('it has more than one loop frame');
  } else if (spec.kind === 'state' || spec.kind === 'flow') {
    const nodes = new Set(spec.nodes.map((n) => n.id));
    if (spec.kind === 'state' && spec.start && !nodes.has(spec.start)) errors.push(`start names ${spec.start}, which is not a state`);
    for (const e of spec.edges) {
      if (!nodes.has(e.from) || !nodes.has(e.to)) errors.push(`an edge names a node that the diagram does not have: ${e.from} to ${e.to}`);
      if (spec.kind === 'state' && !e.label) errors.push(`the transition ${e.from} to ${e.to} has no label: say what moves the state`);
    }
    if (spec.kind === 'state' && spec.edges.length > spec.nodes.length * 2) errors.push('it has more transitions than twice its states: it is likely two state machines');
  } else if (spec.kind === 'schema') {
    const names = new Set(spec.entities.map((e) => e.name));
    for (const l of spec.links) if (!names.has(l.from) || !names.has(l.to)) errors.push(`a link names an entity that the diagram does not have: ${l.from} to ${l.to}`);
    if (spec.entities.length > 4) errors.push('it has more than four entities; split it');
  } else if (spec.kind === 'map') {
    if (spec.nodes.length > BUDGET.map.nodes) errors.push(`it has ${spec.nodes.length} boxes; Diagram Design allows ${BUDGET.map.nodes}`);
  } else {
    errors.push('its kind is not a typed diagram (sequence, state, schema, flow or map)');
  }
  if (errors.length) throw new TrustMapError(`diagram ${title}: ` + errors.join('; '));
}

function Switch<T extends string>({ title, legend, value, options, onChange }: { title: string; legend: string; value: T; options: ReadonlyArray<readonly [T, string]>; onChange: (v: T) => void }) {
  const id = `ve-typed-${useId().replace(/:/g, '')}`;
  return (
    <fieldset className="ve-diagram-mode-switch ve-typed-switch">
      <legend>{title}: {legend.toLowerCase()}</legend>
      {options.map(([v, label]) => (
        <label data-ve-checked={value === v ? 'true' : undefined} key={v}>
          <input checked={value === v} name={id} onChange={() => onChange(v)} type="radio" value={v} />
          <span>{label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function elements(spec: TypedDiagramSpec): Array<{ status?: ChangeStatus; code?: string }> {
  if (spec.kind === 'sequence') return [...spec.actors, ...spec.steps.flatMap((s) => ('from' in s ? [s] : []))];
  if (spec.kind === 'schema') return [...spec.entities, ...spec.entities.flatMap((e) => e.fields), ...spec.links];
  if (spec.kind === 'map') return [];
  return [...spec.nodes, ...spec.edges];
}

/**
 * A typed diagram from explain.json (or the derived map of the changed files), in Diagram Design's
 * grammar, with the guided review's layers: Before / After (Before hides what the PR adds; After shows
 * what it removes, struck through), Simple / Detailed when an element names its code, and links to the
 * chapters. Each status also shows as a word, so colour is never the only cue. The same steps show as
 * a list for a screen reader, and in place of the figure on a narrow column.
 */
export function TypedDiagram({ spec, name: fallback, chapters = {} }: { spec: TypedDiagramSpec; name: string; chapters?: Record<string, string> }) {
  if (!spec) throw new TrustMapError(`TypedDiagram ${fallback}: the spec is missing`);
  const title = spec.title ?? fallback;
  assertSpec(spec, title);
  const [view, setView] = useState<View>('after');
  const [mode, setMode] = useDiagramMode();
  const markers = `ve-dd-${useId().replace(/:/g, '')}`;
  const c: Ctx = { view, detailed: mode === 'detailed', markers };
  const all = elements(spec);
  const used = new Set(all.map((x) => x.status ?? 'same'));
  const coded = all.some((x) => x.code);
  const figure = spec.kind === 'sequence' ? <Sequence c={c} spec={spec} /> : spec.kind === 'state' ? <State c={c} spec={spec} /> : spec.kind === 'schema' ? <Schema c={c} spec={spec} /> : spec.kind === 'flow' ? <Flow c={c} spec={spec} /> : <FileMap c={c} spec={spec} />;
  const linked: Array<{ label: string; chapter?: string }> = spec.kind === 'sequence' ? spec.actors : spec.kind === 'schema' ? spec.entities.map((e) => ({ label: e.name, chapter: e.chapter })) : spec.nodes;
  const links = spec.kind === 'map' ? [] : linked.filter((x) => x.chapter && chapters[x.chapter]);
  const changes = used.has('added') || used.has('removed');
  return (
    <figure className="ve-typed" data-ve-typed={spec.kind} data-ve-view={view}>
      <figcaption>
        <span className="ve-figure-head">
          <span className="ve-typed-title">{title}</span>
          {changes || coded ? (
            <span className="ve-typed-switches">
              {changes ? <Switch legend="Show" onChange={setView} options={[['before', 'Before the PR'], ['after', 'After the PR']]} title={title} value={view} /> : null}
              {coded ? <Switch legend="View" onChange={setMode} options={[['simple', 'Simple'], ['detailed', 'Detailed']]} title={title} value={mode} /> : null}
            </span>
          ) : null}
        </span>
        {spec.caption ? <span className="ve-typed-caption">{spec.caption}</span> : null}
      </figcaption>
      <div aria-label={`${title}, scroll to see all of it`} className="ve-typed-body" role="region" tabIndex={0}>{figure}</div>
      <div className="ve-typed-text">{textList(spec, c)}</div>
      {used.has('added') || used.has('changed') || used.has('removed') ? (
        <ul aria-label="Key" className="ve-typed-key">
          {(['added', 'changed', 'removed'] as const).filter((s) => used.has(s)).map((s) => <li data-ve-status={s} key={s}><span aria-hidden="true" />{STATUS_WORD[s]} in this PR</li>)}
        </ul>
      ) : null}
      {links.length ? <p className="ve-typed-links">Read about it: {links.map((x, i) => <Fragment key={x.label}>{i ? ' · ' : ''}<a href={chapterHref(x.chapter)}>{x.label}</a></Fragment>)}</p> : null}
    </figure>
  );
}

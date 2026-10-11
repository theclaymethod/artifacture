// Numbered stations: a run drawn as a row of numbered boxes, left to right, with each loop back
// drawn once as a return band under the boxes it repeats. It shows a chain (each forward edge goes
// to the next box) in Simple and Detailed modes, and follows the page's diagram mode. The numbers
// are the numbers of a Steps list, so the figure and the steps read as one.
import { useId } from 'react';
import { useDiagramMode, type DiagramModeGraph } from './diagram-modes';
import type { DiagramNode } from './diagram-types';
import './station-flow.css';

type Graph = Pick<DiagramModeGraph, 'nodes' | 'edges'>;

/** The node order of a chain, or null when a forward edge skips a box or a box has no way in. */
export function chainOrder(graph: Graph): string[] | null {
  const ids = graph.nodes.map((n) => n.id);
  const at = new Map(ids.map((id, i) => [id, i]));
  for (const e of graph.edges) {
    const from = at.get(e.from);
    const to = at.get(e.to);
    if (from === undefined || to === undefined) return null;
    if (to > from && to !== from + 1) return null;
  }
  for (let i = 1; i < ids.length; i += 1) if (!graph.edges.some((e) => e.from === ids[i - 1] && e.to === ids[i])) return null;
  return ids;
}

export type StationFlowProps = { simple: Graph; detailed: Graph; title: string; description?: string };

export function StationFlow({ simple, detailed, title, description }: StationFlowProps) {
  const rawId = useId().replace(/:/g, '');
  const [mode, setMode] = useDiagramMode();
  // Each Simple box keeps its number in both modes; a Detailed box with no Simple twin is unnumbered.
  const number = new Map(simple.nodes.map((n, i) => [n.id, i + 1]));
  const graph = mode === 'detailed' && chainOrder(detailed) ? detailed : simple;
  const nodes = graph.nodes;
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const via = (n: DiagramNode, i: number) => (i ? graph.edges.find((e) => e.from === nodes[i - 1]!.id && e.to === n.id)?.label : undefined);
  const backs = graph.edges.filter((e) => index.get(e.to)! <= index.get(e.from)!);
  const name = (id: string) => {
    const n = nodes.find((x) => x.id === id)!;
    return number.has(id) ? `${number.get(id)}. ${n.label}` : n.label;
  };
  const label = { simple: 'Simple', detailed: 'Detailed' } as const;
  return (
    <figure aria-label={title} className="ve-diagram-modes ve-stations" data-ve-diagram-modes data-ve-mode={mode} data-ve-stations>
      <fieldset className="ve-diagram-mode-switch">
        <legend><span className="ve-visually-hidden">{title}: </span>View</legend>
        {(['simple', 'detailed'] as const).map((option) => (
          <label data-ve-checked={mode === option ? 'true' : undefined} key={option}>
            <input checked={mode === option} name={`ve-stations-mode-${rawId}`} onChange={() => setMode(option)} type="radio" value={option} />
            <span>{label[option]}</span>
          </label>
        ))}
      </fieldset>
      <div className="ve-stations-track" style={{ gridTemplateColumns: `${'minmax(0, 1fr) 1.25rem '.repeat(nodes.length - 1)}minmax(0, 1fr)` }}>
        <ol className="ve-stations-row">
          {nodes.map((n, i) => {
            const back = backs.filter((e) => e.from === n.id);
            return (
              <li className="ve-station" data-ve-shape={n.shape ?? 'rect'} key={n.id} style={{ gridColumn: 2 * i + 1 }}>
                {via(n, i) ? <span className="ve-station-via"><svg aria-hidden="true" height="10" viewBox="0 0 14 14" width="10"><path d="M1 7h11M8 3l4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>{via(n, i)}</span> : null}
                <span className="ve-station-box">
                  {number.has(n.id) ? <span className="ve-station-number">{number.get(n.id)}</span> : <span aria-hidden="true" className="ve-station-number" data-ve-extra="true" />}
                  <span className="ve-station-label" data-ve-code={mode === 'detailed' ? 'true' : undefined}>{n.label}</span>
                  {n.detail ? <span className="ve-station-detail">{n.detail}</span> : null}
                </span>
                {back.map((e) => <span className="ve-station-back" key={e.to}>Back to {name(e.to)}{e.label ? `: ${e.label}` : ''}</span>)}
              </li>
            );
          })}
        </ol>
        {nodes.slice(1).map((n, i) => <svg aria-hidden="true" className="ve-station-arrow" height="14" key={'a' + n.id} style={{ gridColumn: 2 * i + 2 }} viewBox="0 0 14 14" width="14"><path d="M1 7h11M8 3l4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" /></svg>)}
        {backs.map((e) => (
          <span aria-hidden="true" className="ve-station-return" key={'r' + e.from + e.to} style={{ gridColumn: `${2 * index.get(e.to)! + 1} / ${2 * index.get(e.from)! + 2}` }}>
            <span>{e.label ?? 'again'}</span>
          </span>
        ))}
      </div>
      {description ? <figcaption className="ve-visually-hidden">{description}</figcaption> : null}
    </figure>
  );
}

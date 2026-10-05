import React, { useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { GraphicCanvas } from './graphics';
import { dagNeighborhood, focusDagScene, prepareDag, type DagInput } from './dag-scene';
import './dag-canvas.css';

export type DagCanvasProps = DagInput & Readonly<{ scope?: 'neighbors' | 'lineage'; initialSelection?: string }>;
type DagStyle = CSSProperties & { '--ve-dag-row-height': string };

export function DagCanvas({ scope = 'neighbors', initialSelection, ...input }: DagCanvasProps) {
  if (!['neighbors', 'lineage'].includes(scope)) throw new Error(`Unknown DAG focus scope: ${scope}.`);
  const dag = useMemo(() => prepareDag(input), [input.id, input.title, input.description, input.nodes]);
  if (initialSelection !== undefined && !dag.order.includes(initialSelection)) throw new Error(`Unknown initial DAG selection: ${initialSelection}.`);
  const [selected, setSelected] = useState(initialSelection);
  const [hovered, setHovered] = useState<string>();
  const [focused, setFocused] = useState<string>();
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const rawId = useId();
  const active = [hovered, focused, selected].find(id => id !== undefined && dag.order.includes(id));
  const neighborhood = active ? dagNeighborhood(dag, active, scope) : undefined;
  const related = new Set(active ? [active, ...neighborhood!.parents, ...neighborhood!.children] : dag.order);
  const scene = useMemo(() => focusDagScene(dag, active, scope, true), [dag, active, scope]);
  const nodeById = new Map(dag.nodes.map(node => [node.id, node]));
  const selectedNode = active ? nodeById.get(active) : undefined;
  const labels = (ids: readonly string[]) => ids.map(id => nodeById.get(id)!.label).join(', ');
  const style: DagStyle = { '--ve-dag-row-height': `${dag.rowHeight}px` };
  return <figure className="ve-dag" style={style}>
    <div className="ve-dag-scroll" tabIndex={0} role="region" aria-label={`${input.title}, scroll to explore`}>
      <div className="ve-dag-columns" onMouseLeave={() => setHovered(undefined)}>
        <GraphicCanvas scene={scene} className="ve-dag-minimap" style={{ width: scene.bounds.width, height: scene.bounds.height, flex: 'none' }} />
        <div className="ve-dag-list" role="group" aria-label={input.title}>
          {dag.order.map((id, index) => { const node = nodeById.get(id)!; return <button key={id} ref={button => { if (button) buttons.current.set(id, button); else buttons.current.delete(id); }} type="button" className="ve-dag-node" data-dag-node={id} data-dag-active={active === id || undefined} data-dag-related={related.has(id)} aria-pressed={selected === id} aria-describedby={active === id ? `${rawId}-relationships` : undefined} onMouseEnter={() => setHovered(id)} onFocus={() => { setFocused(id); setHovered(undefined); }} onBlur={() => setFocused(undefined)} onClick={() => setSelected(previous => previous === id ? undefined : id)} onKeyDown={event => {
            const offset = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
            if (offset || event.key === 'Home' || event.key === 'End') { event.preventDefault(); const target = event.key === 'Home' ? 0 : event.key === 'End' ? dag.order.length - 1 : Math.max(0, Math.min(dag.order.length - 1, index + offset)); buttons.current.get(dag.order[target])?.focus(); }
            if (event.key === 'Escape') { setSelected(undefined); setHovered(undefined); setFocused(undefined); event.currentTarget.blur(); }
          }}><span>{node.label}</span>{node.detail ? <span className="ve-dag-detail">{node.detail}</span> : null}</button>; })}
        </div>
      </div>
    </div>
    <figcaption id={`${rawId}-relationships`} className="ve-dag-relationships" aria-live="polite" aria-atomic="true">
      {selectedNode && neighborhood ? <><strong>{selectedNode.label}</strong><span>{neighborhood.parents.length ? `${scope === 'lineage' ? 'Upstream' : 'Depends on'}: ${labels(neighborhood.parents)}.` : 'No upstream dependencies.'}</span><span>{neighborhood.children.length ? `${scope === 'lineage' ? 'Downstream' : 'Used by'}: ${labels(neighborhood.children)}.` : 'No downstream dependents.'}</span><button type="button" onClick={() => { setSelected(undefined); setHovered(undefined); setFocused(undefined); }}>Clear focus</button></> : 'Select or focus an item to trace its dependencies.'}
    </figcaption>
  </figure>;
}

import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { layoutDiagram } from './diagram-layout';
import { GraphicCanvas } from './graphics';
import { diagramSceneFromLayout } from './diagram-scene';
import type { DiagramCanvasProps } from './diagram-types';
import './diagram-canvas.css';

export type { DiagramCanvasProps, DiagramEdge, DiagramLane, DiagramNode } from './diagram-types';

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
  const scene = useMemo(() => diagramSceneFromLayout(diagram, { id: 'diagram', title, description }), [diagram, title, description]);
  return (
    <figure className="ve-diagram-shell ve-diagram-has-mobile" ref={figureRef}>
      <div aria-label={`${title}, scroll to explore`} className="ve-diagram-variant ve-diagram-variant-desktop" data-diagram-role="diagram-desktop" data-ve-variant="desktop" role="region" tabIndex={0}>
        <GraphicCanvas className="ve-diagram-canvas" scene={scene} instancePrefix={rawId} style={{ aspectRatio: `${diagram.viewBox.width} / ${diagram.viewBox.height}`, minWidth: diagram.viewBox.width, maxWidth: diagram.viewBox.width, marginInline: 'auto' }} />
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

/// <reference types="vite/client" />
import React, { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DiagramCanvas } from './components';
import type { DiagramCanvasProps, DiagramEdge, DiagramNode } from './diagram-types';
import './diagram-walkthrough.css';

export type DiagramWalkthroughStep = {
  edgeId: string;
  caption: string;
  durationMs?: number;
};

export type DiagramWalkthroughProps = DiagramCanvasProps & {
  steps: DiagramWalkthroughStep[];
};

type ResolvedStep = { edge: DiagramEdge; caption: string; durationMs: number };
type Playback = { step: number; playing: boolean; elapsed: number };
type DiagramScene = { svg: SVGSVGElement; routes: Map<string, SVGPathElement> };
const StaticDiagram = memo(DiagramCanvas);

export function DiagramWalkthrough({ steps, ...diagramProps }: DiagramWalkthroughProps) {
  const { nodes, edges, layout, direction, lanes, dates, title = 'Diagram walkthrough' } = diagramProps;
  const resolved = useMemo(() => resolveSteps(nodes, edges, steps), [nodes, edges, steps]);
  const [playback, setPlayback] = useState<Playback>({ step: 0, playing: false, elapsed: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);
  const [visibleDiagram, setVisibleDiagram] = useState<boolean | null>(null);
  const [scene, setScene] = useState<DiagramScene | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const captionId = useId();
  const current = resolved[Math.min(playback.step, resolved.length - 1)];
  const complete = playback.step === resolved.length - 1 && playback.elapsed >= current.durationMs;

  useEffect(() => {
    setPlayback({ step: 0, playing: false, elapsed: 0 });
  }, [resolved]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      setReducedMotion(media.matches);
      if (media.matches) setPlayback((value) => ({ ...value, playing: false }));
    };
    const pauseWhenHidden = () => {
      if (document.hidden) setPlayback((value) => ({ ...value, playing: false }));
    };
    update();
    media.addEventListener('change', update);
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => {
      media.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', pauseWhenHidden);
    };
  }, []);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const svg = host?.querySelector<SVGSVGElement>('svg[data-diagram-role="diagram"]');
    if (!host || !svg) return;
    const routes = new Map<string, SVGPathElement>();
    for (const route of svg.querySelectorAll<SVGPathElement>('path[data-ve-edge-id]')) {
      const id = route.getAttribute('data-ve-edge-id');
      if (id) routes.set(id, route);
    }
    for (const step of resolved) {
      if (!step.edge.id || !routes.has(step.edge.id)) {
        throw new Error(`DiagramWalkthrough: edge "${step.edge.id}" has no rendered route.`);
      }
    }
    const updateGeometry = () => {
      const bounds = svg.getBoundingClientRect();
      const visible = bounds.width > 0 && bounds.height > 0;
      setScene({ svg, routes });
      setVisibleDiagram(visible);
      if (!visible) setPlayback((value) => ({ ...value, playing: false }));
    };
    updateGeometry();
    const observer = new ResizeObserver(updateGeometry);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [nodes, edges, layout, direction, lanes, dates, resolved]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !scene) return;
    const selected = [...host.querySelectorAll<SVGElement | HTMLElement>('[data-ve-node-id], [data-ve-edge-id]')]
      .filter((element) => element.getAttribute('data-ve-edge-id') === current.edge.id
        || element.getAttribute('data-ve-node-id') === current.edge.from
        || element.getAttribute('data-ve-node-id') === current.edge.to);
    for (const element of selected) element.setAttribute('data-ve-walkthrough-active', '');
    return () => {
      for (const element of selected) element.removeAttribute('data-ve-walkthrough-active');
    };
  }, [scene, current.edge]);

  useEffect(() => {
    if (!playback.playing || reducedMotion || !visibleDiagram) return;
    let previous: number | null = null;
    let frame = 0;
    const tick = (now: number) => {
      if (previous !== null) {
        const delta = Math.min(now - previous, 250);
        setPlayback((value) => {
          if (!value.playing) return value;
          const duration = resolved[value.step].durationMs;
          const elapsed = value.elapsed + delta;
          if (elapsed < duration) return { ...value, elapsed };
          if (value.step === resolved.length - 1) return { ...value, elapsed: duration, playing: false };
          return { step: value.step + 1, playing: true, elapsed: 0 };
        });
      }
      previous = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playback.playing, reducedMotion, visibleDiagram, resolved]);

  const selectStep = (step: number) => setPlayback({ step, playing: false, elapsed: 0 });
  const route = current.edge.id ? scene?.routes.get(current.edge.id) : null;
  const packet = route && scene && !reducedMotion && playback.elapsed > 0 && playback.elapsed < current.durationMs
    ? routePoint(route, scene.svg, playback.elapsed / current.durationMs)
    : null;

  return (
    <section aria-label={title} className="ve-diagram-walkthrough" data-ve-walkthrough data-ve-walkthrough-state={complete ? 'complete' : playback.playing ? 'playing' : 'paused'} data-ve-walkthrough-step={playback.step} data-ve-walkthrough-edge={current.edge.id}>
      <div ref={hostRef}>
        <StaticDiagram {...diagramProps} title={title} />
      </div>
      {packet && scene ? createPortal(
        <circle aria-hidden="true" className="ve-walkthrough-packet" data-ve-walkthrough-packet r="5" transform={`translate(${packet.x} ${packet.y})`} />,
        scene.svg,
      ) : null}
      <div className="ve-walkthrough-reader">
        <p aria-atomic="true" aria-live="polite" className="ve-walkthrough-caption" id={captionId}>
          <span className="ve-walkthrough-position">{playback.step + 1} of {resolved.length}</span>
          <span>{current.caption}</span>
        </p>
        <div aria-describedby={captionId} aria-label="Walkthrough playback" className="ve-walkthrough-controls" role="group">
          <button disabled={playback.step === 0} onClick={() => selectStep(playback.step - 1)} type="button">Previous</button>
          <button aria-pressed={playback.playing} disabled={reducedMotion || !visibleDiagram || complete} onClick={() => setPlayback((value) => ({ ...value, playing: !value.playing }))} type="button">{playback.playing ? 'Pause' : 'Play'}</button>
          <button disabled={playback.step === resolved.length - 1} onClick={() => selectStep(playback.step + 1)} type="button">Next</button>
          <button disabled={playback.step === 0 && playback.elapsed === 0 && !playback.playing} onClick={() => selectStep(0)} type="button">Reset</button>
        </div>
        {reducedMotion ? <p className="ve-walkthrough-motion-note">Motion is reduced. Use Previous and Next to follow the sequence.</p> : visibleDiagram === false ? <p className="ve-walkthrough-motion-note">Use Previous and Next to follow the sequence on this screen.</p> : null}
      </div>
    </section>
  );
}

function resolveSteps(nodes: DiagramNode[], edges: DiagramEdge[], steps: DiagramWalkthroughStep[]): ResolvedStep[] {
  const fail = (message: string): never => { throw new Error(`DiagramWalkthrough: ${message}`); };
  if (!Array.isArray(steps) || !steps.length) fail('provide at least one step with an edgeId and caption.');
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (!node.id?.trim() || nodeIds.has(node.id)) fail(`node id "${node.id}" must be nonempty and unique.`);
    nodeIds.add(node.id);
  }
  const edgesById = new Map<string, DiagramEdge>();
  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) fail(`edge "${edge.id ?? `${edge.from} → ${edge.to}`}" references an undeclared node.`);
    if (edge.id !== undefined) {
      if (!edge.id.trim() || edgesById.has(edge.id)) fail(`edge id "${edge.id}" must be nonempty and unique.`);
      edgesById.set(edge.id, edge);
    }
  }
  return steps.map((step, index) => {
    const edge = edgesById.get(step.edgeId);
    if (!edge) return fail(`step[${index}] references unknown edge "${step.edgeId}". Add that id to a declared edge.`);
    if (!step.caption?.trim()) return fail(`step[${index}] needs a nonempty caption.`);
    const durationMs = step.durationMs ?? 3200;
    if (!Number.isFinite(durationMs) || durationMs <= 0) return fail(`step[${index}].durationMs must be a finite positive number.`);
    return { edge, caption: step.caption, durationMs };
  });
}

function routePoint(route: SVGPathElement, svg: SVGSVGElement, progress: number): { x: number; y: number } | null {
  const routeMatrix = route.getScreenCTM();
  const svgMatrix = svg.getScreenCTM();
  if (!routeMatrix || !svgMatrix || !svgMatrix.a || !svgMatrix.d) return null;
  const point = route.getPointAtLength(route.getTotalLength() * progress);
  return new DOMPoint(point.x, point.y).matrixTransform(svgMatrix.inverse().multiply(routeMatrix));
}

import { useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { layoutDiagramModes } from './diagram-layout';
import { GraphicCanvas } from './graphics';
import { diagramSceneFromLayout } from './diagram-scene';
import { fittedCanvasStyle, MobileSwimlaneVariant, pickDirection, useDiagramVariant } from './diagram-canvas';
import { Legend, type LegendItem } from './data-table';
import type { DiagramEdge, DiagramNode } from './diagram-types';
import './diagram-canvas.css';
import './diagram-modes.css';

export type DiagramMode = 'simple' | 'detailed';
export type DiagramModeGraph = { nodes: DiagramNode[]; edges: DiagramEdge[]; legend?: readonly LegendItem[] };
export type DiagramModesProps = {
  /** Plain words, about four to six boxes, no code names. The default mode. */
  simple: DiagramModeGraph;
  /** The same boxes named by their real modules or functions; a few more boxes at most. Each simple node id must also be a detailed node id. */
  detailed: DiagramModeGraph;
  layout?: 'flow' | 'tree';
  /** `wrap` sets the flow left to right in rows that fit the column (below 600px it is vertical). */
  direction?: 'auto' | 'horizontal' | 'vertical' | 'wrap';
  title?: string;
  description?: string;
  /**
   * `shared` (the default) lays both modes out on one grid, so a box keeps its place when the
   * reader switches. `independent` lays each mode out for its own labels, so the Simple mode has no
   * room left for the longer Detailed names: use it when the shared grid leaves dead space.
   */
  modes?: 'shared' | 'independent';
};

/** Each mode on its own grid and in its own frame. */
function layoutEach(simple: DiagramModeGraph, detailed: DiagramModeGraph, layout: 'flow' | 'tree', direction: Parameters<typeof layoutDiagramModes>[3], wrapWidth = 0) {
  return { simple: layoutDiagramModes(simple, simple, layout, direction, wrapWidth).simple, detailed: layoutDiagramModes(detailed, detailed, layout, direction, wrapWidth).detailed };
}

// One choice for the whole page: every DiagramModes on the page follows it, and a reload keeps it.
const listeners = new Set<() => void>();
const storageKey = () => `ve-diagram-mode:${window.location.pathname}`;
let memory: DiagramMode = 'simple';

function readMode(): DiagramMode {
  try {
    const stored = window.localStorage.getItem(storageKey());
    if (stored === 'simple' || stored === 'detailed') memory = stored;
  } catch {
    // Storage can be off (private mode, some file URLs); the choice then lasts for this page view.
  }
  return memory;
}

function writeMode(mode: DiagramMode) {
  memory = mode;
  try {
    window.localStorage.setItem(storageKey(), mode);
  } catch {
    // See readMode.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === storageKey()) listener(); };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** The page's diagram mode: `simple` until the reader picks `detailed`. */
export function useDiagramMode(): [DiagramMode, (mode: DiagramMode) => void] {
  const mode = useSyncExternalStore(subscribe, readMode, () => 'simple' as DiagramMode);
  return [mode, writeMode];
}

/**
 * One diagram in two modes, Simple and Detailed, on one grid: a node keeps its place when the
 * reader switches. A labelled two-option control switches every DiagramModes on the page, and the
 * page remembers the choice. The switch fades only when the reader allows motion.
 */
export function DiagramModes({ simple, detailed, layout = 'flow', direction = 'auto', title = 'Diagram', description, modes = 'shared' }: DiagramModesProps) {
  const rawId = useId().replace(/:/g, '');
  const figureRef = useRef<HTMLElement>(null);
  const [mode, setMode] = useDiagramMode();
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  // Rows may be a little wider than the column: the figure then shrinks to fit, to 85% at most.
  const wrapWidth = direction === 'wrap' && availableWidth !== null && availableWidth >= 600 ? Math.floor(availableWidth / 0.85) : 0;
  const candidates = useMemo(() => {
    const lay = modes === 'independent' ? layoutEach : layoutDiagramModes;
    if (direction === 'wrap') {
      const initial = wrapWidth ? lay(simple, detailed, layout, 'wrap', wrapWidth) : lay(simple, detailed, layout, 'vertical');
      return { initial, horizontal: initial, vertical: initial };
    }
    const initial = lay(simple, detailed, layout, direction);
    if (direction !== 'auto') return { initial, horizontal: initial, vertical: initial };
    return { initial, horizontal: lay(simple, detailed, layout, 'horizontal'), vertical: lay(simple, detailed, layout, 'vertical') };
  }, [simple, detailed, layout, direction, wrapWidth, modes]);
  useLayoutEffect(() => {
    const figure = figureRef.current;
    if (!figure || (direction !== 'auto' && direction !== 'wrap')) return;
    const update = (width: number) => { if (width > 0) setAvailableWidth((previous) => previous === Math.floor(width) ? previous : Math.floor(width)); };
    update(figure.clientWidth);
    const observer = new ResizeObserver(([entry]) => { if (entry) update(entry.contentRect.width); });
    observer.observe(figure);
    return () => observer.disconnect();
  }, [direction]);
  const variant = useDiagramVariant();
  const pair = useMemo(() => {
    if (availableWidth === null || direction !== 'auto') return candidates.initial;
    const { horizontal, vertical } = candidates;
    // An independent pair picks the direction for the mode on show, so the Simple mode fits its own frame.
    const key = modes === 'independent' ? mode : 'detailed';
    return pickDirection(horizontal[key], vertical[key], availableWidth) === horizontal[key] ? horizontal : vertical;
  }, [availableWidth, candidates, direction, modes, mode]);
  const diagram = pair[mode];
  const graph = mode === 'simple' ? simple : detailed;
  const scene = useMemo(() => diagramSceneFromLayout(diagram, { id: `diagram-${mode}`, title: `${title} (${mode})`, description }), [diagram, mode, title, description]);
  const label = { simple: 'Simple', detailed: 'Detailed' } as const;
  return (
    <figure className="ve-diagram-shell ve-diagram-has-mobile ve-diagram-modes" data-ve-diagram-modes data-ve-mode={mode} data-ve-shown-variant={variant} ref={figureRef}>
      <fieldset className="ve-diagram-mode-switch">
        <legend><span className="ve-visually-hidden">{title}: </span>View</legend>
        {(['simple', 'detailed'] as const).map((option) => (
          <label data-ve-checked={mode === option ? 'true' : undefined} key={option}>
            <input checked={mode === option} name={`ve-diagram-mode-${rawId}`} onChange={() => setMode(option)} type="radio" value={option} />
            <span>{label[option]}</span>
          </label>
        ))}
      </fieldset>
      {variant === 'desktop' ? (
        <div aria-label={`${title}, ${label[mode].toLowerCase()} view, scroll to explore`} className="ve-diagram-variant ve-diagram-variant-desktop" data-diagram-role="diagram-desktop" data-ve-variant="desktop" key={`desktop-${mode}`} role="region" tabIndex={0}>
          <GraphicCanvas className="ve-diagram-canvas" scene={scene} instancePrefix={`${rawId}-${mode}`} style={fittedCanvasStyle(diagram.viewBox)} />
        </div>
      ) : <MobileSwimlaneVariant diagram={diagram} idPrefix={`${rawId}-${mode}`} key={`mobile-${mode}`} title={`${title}, ${label[mode].toLowerCase()} view`} />}
      {graph.legend?.length ? <Legend items={graph.legend} /> : null}
    </figure>
  );
}

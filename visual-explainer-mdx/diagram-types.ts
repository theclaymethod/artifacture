import type { LegendItem, StatusTone } from './data-table';

export type DiagramNodeGlyph = 'rect' | 'oval' | 'diamond' | 'dot';

export type DiagramNode = {
  id: string;
  label: string;
  detail?: string;
  // Kept as the authored MDX prop name; glyph is the domain concept it selects.
  ['shape']?: DiagramNodeGlyph;
  accent?: boolean;
  /** A factual state from the shared --ve-status-* ramp. Pair it with a word in `detail`. */
  tone?: StatusTone;
  /** `dashed` draws a dashed, hatched outline: the secondary cue for a weaker evidence tier. */
  stroke?: 'solid' | 'dashed';
  lane?: string;
  date?: string;
};

export type DiagramEdge = {
  id?: string;
  from: string;
  to: string;
  label?: string;
  style?: 'solid' | 'dashed' | 'bidirectional';
};

export type DiagramLane = {
  id: string;
  label: string;
};

export type DiagramCanvasProps = {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  layout?: 'flow' | 'tree' | 'swimlane' | 'timeline';
  /** `wrap` lays the ranks out left to right in rows that fit the figure width, so a long flow reads across a wide screen; below 600px it falls back to vertical. */
  direction?: 'auto' | 'horizontal' | 'vertical' | 'wrap';
  lanes?: DiagramLane[];
  dates?: string[];
  title?: string;
  description?: string;
  /** A key under the figure. List only encodings that the figure uses. */
  legend?: readonly LegendItem[];
};

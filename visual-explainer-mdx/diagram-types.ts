export type DiagramNodeGlyph = 'rect' | 'oval' | 'diamond' | 'dot';

export type DiagramNode = {
  id: string;
  label: string;
  detail?: string;
  // Kept as the authored MDX prop name; glyph is the domain concept it selects.
  ['shape']?: DiagramNodeGlyph;
  accent?: boolean;
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
  direction?: 'auto' | 'horizontal' | 'vertical';
  lanes?: DiagramLane[];
  dates?: string[];
  title?: string;
  description?: string;
};

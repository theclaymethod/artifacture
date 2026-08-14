export type DiagramNode = {
  id: string;
  label: string;
  detail?: string;
  shape?: 'rect' | 'oval' | 'diamond' | 'dot';
  accent?: boolean;
  lane?: string;
  date?: string;
};

export type DiagramEdge = {
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
  lanes?: DiagramLane[];
  dates?: string[];
  title?: string;
  description?: string;
};

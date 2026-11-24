export type {
  CaseFact,
  CaseSlideSpec,
  ComparisonItem,
  ComparisonSlideSpec,
  DecisionOption,
  DecisionSlideSpec,
  ProcessSlideSpec,
  ProcessStep,
  SemanticSlideLayout,
  SemanticSlideSpec,
  SlideValidationIssue,
} from './authoring-contract.ts';
export { assertValidSlideSpec, validateSlideSpec } from './authoring-contract.ts';
export type { KitBlockEntry, KitBlockSurface } from './catalog.ts';
export { KIT_CATALOG } from './catalog.ts';
export type { CodeBlockProps, DiffBlockProps, DiffRow } from './code-blocks.tsx';
export { CodeBlock, DiffBlock } from './code-blocks.tsx';
export type { DecisionMatrixProps, PipelineProps } from './content-blocks.tsx';
export { DecisionMatrix, Pipeline } from './content-blocks.tsx';
export type { DagCanvasProps } from './dag-canvas.tsx';
export { DagCanvas } from './dag-canvas.tsx';
export type { DagEdge, DagInput, DagNeighborhood, DagNode, PreparedDag } from './dag-scene.ts';
export {
  createDagDiagram,
  createDagScene,
  dagNeighborhood,
  focusDagScene,
  prepareDag,
} from './dag-scene.ts';
export { DiagramCanvas } from './diagram-canvas.tsx';
export {
  edgePath,
  labelLeaderEndpoint,
  layoutDiagram,
  mobileConnectorEdges,
  splitSvgText,
  wrapWords,
} from './diagram-layout.ts';
export { createDiagramScene, diagramSceneFromLayout } from './diagram-scene.ts';
export type {
  DiagramCanvasProps,
  DiagramEdge,
  DiagramLane,
  DiagramNode,
  DiagramNodeGlyph,
} from './diagram-types.ts';
export type { AlignedDiffRow } from './diff-lines.ts';
export { alignDiffRows, diffLines } from './diff-lines.ts';
export type { DrillCardProps, DrillChipProps, DrillSheetProps } from './drill-sheet.tsx';
export { DrillCard, DrillChip, DrillSheet } from './drill-sheet.tsx';
export { createGraphicScene, GraphicCanvas } from './graphics.tsx';
export type {
  GraphicBounds,
  GraphicClip,
  GraphicFont,
  GraphicObject,
  GraphicPaint,
  GraphicPlacement,
  GraphicPrimitive,
  GraphicScene,
  GraphicStrokeRole,
} from './graphics-types.ts';
export { validateGraphicBounds, validateGraphicScene } from './graphics-types.ts';
export { LieflatChart } from './lieflat-charts.tsx';
export { ThreadPlot, validateThreadsSpec } from './lieflat-threads.tsx';
export type {
  BarcodeSpec,
  BubbleMatrixSpec,
  LieflatChartProps,
  LieflatChartSpec,
  RungBarsSpec,
  ThreadsSpec,
  UnitFieldSpec,
} from './lieflat-types.ts';
export {
  CaseSlide,
  ComparisonSlide,
  DecisionSlide,
  ProcessSlide,
  SemanticSlide,
} from './semantic-slides.tsx';

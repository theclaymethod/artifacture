export type KitBlockSurface = 'explainer' | 'slides' | 'video';

export type KitBlockEntry = Readonly<{
  id: string;
  title: string;
  packageName: '@artifacture/kit' | '@artifacture/gpu';
  surfaces: readonly KitBlockSurface[];
  summary: string;
}>;

/**
 * Curated Artifacture v2 core block catalog exposed by CLI discovery and playground boundary checks.
 */
export const KIT_CATALOG: readonly KitBlockEntry[] = [
  {
    id: 'lieflat-chart',
    title: 'LieflatChart',
    packageName: '@artifacture/kit',
    surfaces: ['explainer', 'slides', 'video'],
    summary: 'Data-driven SVG charts (rung-bars, barcode, bubble-matrix, unit-field, threads).',
  },
  {
    id: 'diagram-canvas',
    title: 'DiagramCanvas',
    packageName: '@artifacture/kit',
    surfaces: ['explainer', 'slides'],
    summary: 'Deterministic box-and-edge layout and responsive connector diagrammer.',
  },
  {
    id: 'dag-canvas',
    title: 'DagCanvas',
    packageName: '@artifacture/kit',
    surfaces: ['explainer', 'slides'],
    summary: 'Layered DAG renderer powered by d3-dag with interactive lineage selection.',
  },
  {
    id: 'code-block',
    title: 'CodeBlock',
    packageName: '@artifacture/kit',
    surfaces: ['explainer', 'slides'],
    summary:
      'Line-annotated source display paired with lazy @artifacture/kit/highlight Shiki formatting.',
  },
  {
    id: 'diff-block',
    title: 'DiffBlock',
    packageName: '@artifacture/kit',
    surfaces: ['explainer', 'slides'],
    summary: 'Unified and split code diff viewer computed from patches or before/after strings.',
  },
  {
    id: 'decision-matrix',
    title: 'DecisionMatrix',
    packageName: '@artifacture/kit',
    surfaces: ['explainer', 'slides'],
    summary: 'Structured criteria table and numbered Pipeline strip.',
  },
  {
    id: 'drill-sheet',
    title: 'DrillSheet',
    packageName: '@artifacture/kit',
    surfaces: ['explainer', 'slides'],
    summary: 'Slide-scoped drill-down dialog with focus trap, Escape capture, and surface dismiss.',
  },
  {
    id: 'semantic-slide',
    title: 'SemanticSlide',
    packageName: '@artifacture/kit',
    surfaces: ['slides'],
    summary: 'Enforced four-layout semantic slide grammar (case, comparison, process, decision).',
  },
  {
    id: 'gpu-canvas',
    title: 'GpuCanvas',
    packageName: '@artifacture/gpu',
    surfaces: ['explainer', 'slides', 'video'],
    summary:
      'Single-viewport WebGPU shader canvas with Dawn still fallback and reduced-motion discipline.',
  },
  {
    id: 'gpu-morph-canvas',
    title: 'GpuMorphCanvas',
    packageName: '@artifacture/gpu',
    surfaces: ['slides'],
    summary: 'Shared WebGPU stage across open-slide Deck pages with smooth parameter morphing.',
  },
] as const;

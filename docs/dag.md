# Dependency graphs

`DagCanvas` combines a compact directed acyclic graph with a focusable node list. Immediate parents and children appear in one accent; unrelated branches recede. Use `scope="lineage"` to trace the full upstream and downstream path. Select a row to retain focus, use arrow keys/Home/End to move, and Escape or Clear focus to reset. Rows retain readable text and scroll horizontally or vertically when necessary.

```sh
artifacture list --query dag --json
artifacture add dag --cwd ./explainer
```

```tsx
import { DagCanvas } from './artifacture/dag-canvas';
import { prepareDag, createDagReveal, createDagDiagram } from './artifacture/dag-scene';
import { GraphicCanvas } from './artifacture/graphics';
import { sampleScene } from './artifacture/graphic-motion';

const input = {
  id: 'build', title: 'Build dependencies',
  nodes: [
    { id: 'source', label: 'Source', parentIds: [] },
    { id: 'styles', label: 'Styles', parentIds: [] },
    { id: 'bundle', label: 'Bundle', parentIds: ['source', 'styles'] },
    { id: 'publish', label: 'Publish', parentIds: ['bundle'] },
  ],
};
const dag = prepareDag(input);
const motion = createDagReveal(dag, 0.5, 1);

<DagCanvas {...input} scope="lineage" />;
<GraphicCanvas scene={sampleScene(dag.scene, motion, 1.2)} />;
// Larger card-and-arrow view from the same input:
<GraphicCanvas scene={createDagDiagram(input, 'vertical')} />;
```

`prepareDag` validates and snapshots the input, returns a stable topological order, edges, a labeled `GraphicScene`, and the matching label-free minimap. The d3-dag 1.2.2 grid layout puts each node on its own row, preserving multi-parent merges and disconnected roots. Stable author order resolves ties between ready nodes; nodes may be supplied before their parents. Edge identities derive from their endpoint IDs, independent of array position. All geometry uses the existing SVG primitive renderer and theme roles. Hairline retains thin strokes and a single accent; the same scenes work in 3b1b, Mono Color and Algebrica.

`dagNeighborhood` returns related IDs and edges. `focusDagScene` produces a frozen focused pose, with an optional minimap view. `createDagReveal` returns ordinary finite `GraphicMotion` data. It introduces no renderer or animation clock: use `sampleScene`, composition, slides and video as with other blocks. The interactive list is a page control; use the labeled scene for a static poster or authored video.

Limits are explicit: 1–256 nodes and at most 2048 edges. Duplicate IDs, repeated parents, unknown parents, self loops and cycles reject. A cycle error names an actual path, such as `a → b → a`. Ordinary `DiagramCanvas` still supports its existing cyclic diagrams; DAG validation applies only to this block.

The [worked preview](../examples/visual-explainer-mdx/dag.tsx) includes all retained themes, lineage tracing, time seeking and the larger diagram. Its [source](../examples/visual-explainer-mdx/dag-source.ts) also exports a slide sequence for the existing graphic-video pipeline.

The interaction was independently authored after examining the supplied [Svelte playground](https://svelte.dev/playground/83b44d5d50be4b8bb65d55cea1a5d1f1?version=5.57.1), which uses a d3-dag grid, a dependency list and parent/child focus. No playground code or Svelte runtime was copied. The layout dependency is [d3-dag](https://github.com/erikbrinkman/d3-dag), MIT licensed.

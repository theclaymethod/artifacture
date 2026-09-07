# Web diagram

Choose the route before authoring:

- **Compact flow, tree, swimlane, or timeline:** `DiagramCanvas` sizes and lays out nodes from their content. Use the example below; no additional diagram reference is needed.
- **Ordered walkthrough of a compact graph:** read [animated-diagrams.md](../references/animated-diagrams.md) for opt-in `DiagramWalkthrough`. Author explicit steps against stable edge IDs; playback starts paused.
- **Complex architecture, workflow, sequence, dataflow, or lifecycle:** read [archify.md](../references/archify.md). Keep editable typed JSON and use Archify's validated standalone HTML delivery.
- **Quantitative comparison or trend:** read [charts.md](../references/charts.md).
- **Specialized diagram family:** read [diagram-design.md](../references/diagram-design.md). If no computed layout fits and custom SVG geometry is justified, read [diagrams-svg.md](../references/diagrams-svg.md).

Start with the relationship the reader needs to understand. Use short, specific node names; add detail only when it distinguishes the node. Label edges with information that direction alone cannot convey. Add lanes for actual ownership and legends only for non-obvious encodings.

```mdx
{/* REPO = Artifacture checkout; see SKILL.md "Resolve the runtime" */}
import { ExplainerShell, Section, DiagramCanvas } from 'REPO/visual-explainer-mdx/components';

<ExplainerShell title="How a cache miss reaches storage">
  <Section title="Request path">
    <DiagramCanvas layout="flow" description="The API checks the cache before reading Postgres."
      nodes={[
        {id:'client',label:'Browser',shape:'oval'},
        {id:'api',label:'API'},
        {id:'cache',label:'Cache'},
        {id:'db',label:'Postgres'}
      ]}
      edges={[
        {from:'client',to:'api'},
        {from:'api',to:'cache',label:'lookup'},
        {from:'cache',to:'db',label:'miss'}
      ]} />
  </Section>
</ExplainerShell>
```

This example shows a logical request path; replace it with relationships verified in the source. Keep figure labels at least 14px at initial display size and body text at least 16px. Measure content, expand spacing, or split the graph before reducing type. Inspect branches, labels, arrowheads, and mobile containment after export; zoom is for detail, not basic readability.

In MDX prose, escape literal braces as `&#123;` or put them inside code spans. Use shared spacing tokens. Mermaid remains available when explicitly requested or when it fits an unsupported graph grammar better; retain zoom, pan, reset, and expand controls.

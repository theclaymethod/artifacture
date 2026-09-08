# Diagram design routing

Choose a diagram by the relationship it must explain. This reference adapts [cathrynlavery/diagram-design at `a5e3978`](https://github.com/cathrynlavery/diagram-design/tree/a5e3978088cf89c7caff5c20cabd99fbc2a301de)—semantic pattern first, visual type second—to Artifacture's Lieflat-inspired default and host-page token system. The upstream project is MIT-licensed; retain attribution when porting code or templates.

## Contents

- [Selection sequence](#selection-sequence)
- [Semantic patterns](#semantic-patterns)
- [Visual types](#visual-types)
- [Type grammar](#type-grammar)
- [Output dials](#output-dials)
- [Renderer selection](#renderer-selection)
- [Complexity budgets](#complexity-budgets)
- [Existing-source redraws](#existing-source-redraws)
- [Accessibility and source safety](#accessibility-and-source-safety)
- [Motion](#motion)
- [Completion receipt](#completion-receipt)

## Selection sequence

1. Decide whether a diagram teaches more than a paragraph, list, or three-column table.
2. When behavior, state, enforcement, or risk carries the meaning, choose one semantic pattern.
3. Choose exactly one visual type for layout. A semantic pattern adds meaning-specific primitives; it does not add a second layout grammar.
4. Set format, size, detail, and audience before drawing.
5. Apply budget precedence in this order: semantic pattern cap, selected type cap, then an explicit import-detail override.
6. Split into overview plus detail when the resolved budget is exceeded.
7. Choose `DiagramCanvas`, Archify, custom SVG, or Mermaid using the renderer gate below.

Record this selection in working notes, not as visible metadata:

```text
pattern=<name|none>; type=<name>; format=<format>; size=<preset>; detail=<level>; audience=<audience>; renderer=<renderer>; motion=<mode>
```

## Semantic patterns

Use one primary pattern when the source matches its trigger.

| Behavioral trigger | Pattern | Nearest visual type | Tighter budget |
|---|---|---|---|
| Fan-in, finite capacity, queue depth, or a bottleneck | Fan-in queue / bottleneck | Data flow; Process when service stages dominate | ≤5 sources, ≤5 queue slots, one bottleneck, two outcomes, ≤9 primary nodes |
| Repeated Question/Input/Governance/Output slots across stages | Stage framework with semantic slots | Process; Swimlane only when rows are owners | 3–6 stages, 3–4 slot kinds, ≤20 populated cells, ≤2 lines per cell |
| Conversation or loose input becomes a durable structured artifact | Unstructured input → structured artifact | Data flow; Process for several gates | ≤4 exchanges, ≤6 fields, one transform, ≤3 provenance links |
| Two rule traces need pass/fail/skipped/not-reached and first divergence | Paired policy-evaluation traces | Flowchart; Sequence only when actor timing is load-bearing | Exactly 2 traces, 3–6 rules, ≤12 status cells, one first divergence |
| Trust boundaries plus permitted and forbidden ingress or deploy paths | Secure paved road | Architecture | ≤3 trust zones, ≤8 components, ≤10 paths, ≤2 forbidden paths, one privileged gate |
| Controls grouped by where they are enforced | Governance / control catalog | Layer stack; DP security matrix for role permissions | 3–5 surfaces, 3–7 controls per surface, ≤24 controls, ≤3 attributes per control |
| Later defenses compensate for earlier gaps and residual risk propagates | Compensating security layers | Layer stack; Nested for containment-first stories | 3–5 layers, one risk thread, ≤2 mitigations per layer, one residual-risk statement |

The selected pattern owns its semantic primitives and tighter budget. The visual type owns spatial layout. Queues show numeric count and capacity; policy traces spell out `PASS`, `FAIL`, `SKIPPED`, and `NOT REACHED`; blocked paths stop visibly before the boundary; gaps, exceptions, and residual risk remain explicit.

## Visual types

| If the reader needs to see… | Visual type |
|---|---|
| Components and connections in a system | Architecture |
| A legacy landscape grouped by phase, department, or modernization state | IT current-state |
| Decision logic with branches | Flowchart |
| Time-ordered messages between actors | Sequence |
| States, transitions, and guards | State machine |
| Entities, typed fields, and relationships | ER / data model |
| Events positioned in time | Timeline |
| Cross-functional handoffs | Swimlane |
| Two-axis positioning or prioritization | Quadrant |
| Multiple entities scored across 3–5 criteria | Radar / spider |
| A reinforcing cycle or flywheel with shared accumulated state | Loop / flywheel |
| Hierarchy through containment or scope | Nested |
| Parent-to-child relationships | Tree |
| Ownership, reporting, routing, or escalation | Org chart |
| Stacked abstraction levels | Layer stack |
| Overlap between sets | Venn |
| Ranked hierarchy, conversion, or drop-off | Pyramid / funnel |
| Quantitative comparison across categories | Bar chart |
| Continuous trends over time | Line chart |
| Tasks and phases on a timeline | Gantt |
| Distribution or correlation between two variables | Scatter plot |
| An end-to-end data stack on a container cluster | High-level stack |
| A multi-actor sequential workflow with data handoffs | Process |
| Multi-tier data storage with quality and access levels | Medallion |
| Role-scoped pipeline steps | Data flow |
| Data-platform sources, core, and consumers | DP integration |
| Per-role or per-component access permissions | DP security matrix |

Load [`diagrams-svg.md`](./diagrams-svg.md) for shared geometry. Type-specific facts come from the source material and user data; preserve uncertainty rather than inventing domain structure.

## Type grammar

| Type | Layout grammar |
|---|---|
| Architecture | Group by tier or trust zone; keep one flow direction; use zones for real boundaries. |
| IT current-state | Group the legacy landscape by department, phase, or platform; distinguish documented current state from proposed modernization. |
| Flowchart | Use ovals for start/end, rectangles for steps, diamonds for decisions, and dots for merges; label every branch. |
| Sequence | Put actors across the top, time downward, dashed lifelines, activation bars, solid calls, and dashed returns. |
| State machine | Use states plus explicit `event [guard] / action` transitions; one start and clear terminal states. |
| ER / data model | Use headed entity boxes, typed fields, PK/FK markers, and cardinality beside connector endpoints. |
| Timeline | Use an honest time axis; alternate event labels around it and show visible axis breaks when necessary. |
| Swimlane | Give each step one owner; place handoffs across horizontal or vertical lane boundaries. |
| Quadrant | Put labels at axis ends, keep points off the axes, and reserve emphasis for the priority region or item. |
| Radar / spider | Use 3–5 comparable normalized axes and at most one focal series; show the scale and avoid decorative area claims. |
| Loop / flywheel | Arrange stations around a hub or shared memory; close the cycle and distinguish forward flow from write-back. |
| Nested | Use concentric containment with labels on masked boundary tabs; emphasize the innermost focal scope. |
| Tree | Use orthogonal parent-child connectors, a single root, and no more than four levels. |
| Org chart | Show ownership and reporting or routing; separate escalation from ordinary reporting when both exist. |
| Layer stack | Use aligned horizontal bands; label actual levels and emphasize the constraint when relevant. |
| Venn | Use two or three proportionate circles, labels outside sets, and terms in intersections. |
| Pyramid / funnel | Make widths proportional to rank, quantity, or conversion; use one orientation throughout. |
| Bar chart | Start quantitative bars from a shared zero unless a clearly disclosed range is essential; label values directly. |
| Line chart | Use honest axes and intervals, direct-label series where possible, and distinguish observed from projected segments. |
| Gantt | Put tasks on an honest time scale, group by phase, and identify dependencies or milestones sparingly. |
| Scatter plot | Use two quantitative axes, transparent points when dense, and disclose trend lines or clusters as interpretations. |
| High-level stack | Show the end-to-end stack on its cluster or runtime substrate; separate ingress, workloads, data, and platform concerns. |
| Process | Show actor-owned sequential stages and the artifact or data handed between them. |
| Medallion | Show ordered storage tiers, their quality contract, and access policy; distinguish promotion from ordinary reads. |
| Data flow | Show role-scoped transformations, stores, and direction; label queues, capacities, or bottlenecks when material. |
| DP integration | Arrange sources → platform core → consumers with clear integration boundaries and ownership. |
| DP security matrix | Use a semantic permissions matrix with roles on one axis, resources/components on the other, and an explicit legend for access states. |

## Output dials

Choose these before layout; they determine canvas size, text size, density, and wording.

| Dial | Options | Default |
|---|---|---|
| Format | `html`, `svg`, `png`, `html+png` | `html` |
| Size | `doc-inline`, `doc-wide`, `slide-16x9`, `slide-4x3`, `social-og`, `social-square`, `print-a4-landscape`, `print-letter-landscape`, `fit` | `doc-inline` |
| Detail | `faithful`, `balanced`, `simplified` | `balanced` |
| Audience | `engineer`, `mixed`, `executive` | `mixed` |

- **Format** chooses the delivery artifact. This skill still defaults to one self-contained HTML page; emit separate SVG or PNG only when the user requests that format or the calling route requires it.
- **Size** selects the viewBox and type ramp. Keep labels at least 14px at rendered document scale and larger for projected slides. Measure before placing; split before shrinking.
- **Detail** is an import/redraw dial: `simplified` permits ≤7 nodes and ≤9 edges, `balanced` ≤12/≤16, and `faithful` ≤24/≤32 with zones above the normal budget.
- **Audience** changes wording, not source coverage. Preserve technical language for engineers; translate labels for mixed or executive readers without silently dropping material.

The normal nine-node budget applies to fresh diagrams. Resolve conflicts as: semantic-pattern cap → selected-type cap → explicit import-detail override. An override must name itself in the completion receipt. `faithful` is an import/redraw exception: zone above nine nodes and split above twenty-four.

## Renderer selection

Use `DiagramCanvas` for compact flow, tree, swimlane, and timeline layouts. It provides content-sized nodes and computed routing. Use [Archify](archify.md) for complex typed architecture, workflow, sequence, dataflow, or lifecycle maps. Keep its JSON source and validated standalone HTML.

When a compact graph benefits from an ordered walkthrough, use opt-in [`DiagramWalkthrough`](animated-diagrams.md). It retains `DiagramCanvas` geometry and labels while explaining one directed handoff at a time.

Use accessible inline SVG when the diagram needs a specialized grammar those renderers cannot express. Follow [diagrams-svg.md](diagrams-svg.md) for measured text and routing. For quantitative charts, follow [charts.md](charts.md).

Use Mermaid when one of these applies:

- The user explicitly requests Mermaid source.
- The required graph grammar is unsupported by the routes above and automatic packing improves comprehension.
- An existing Mermaid source must remain editable in that format.

Mermaid is a fallback renderer, not a separate visual type. Apply the same type, pattern, audience, emphasis, accessibility, and verification rules around it.

## Complexity budgets

| Element | Maximum |
|---|---:|
| General nodes | 9 |
| Connectors or transitions | 12 |
| Focal accent elements | 2 |
| Sequence lifelines | 5 |
| Sequence `alt` regions | 2 |
| Sequence fragment nesting | 1 |
| Swimlanes | 5 |
| Quadrant items | 12 |
| ER entities | 8 |
| Nested levels | 6 |
| Tree depth | 4 |
| Org-chart depth / nodes | 4 / 12 |
| Layer-stack layers | 6 |
| Venn circles | 3 |
| Pyramid or funnel layers | 6 |
| Radar axes / series / focal series | 5 / 5 / 1 |
| Bars | 8 |
| Line series | 5 |
| Gantt tasks | 12 |
| Scatter points | 30 |
| Annotation callouts | 2 |
| Walkthrough steps / packets in motion | 8 / 1 |

When a type exceeds its limit, simplify in this order:

1. Remove decorative cells and source chrome.
2. Merge exact duplicates into a labeled multiplicity such as `Worker ×N`.
3. Collapse all-leaf clusters to their container.
4. Move secondary paths into a detail diagram without dropping their meaning.
5. Separate cross-cutting infrastructure into its own view when it obscures the primary path.
6. Split into overview and detail diagrams.

Record steps 2–6 in the fidelity ledger. Switching to Mermaid does not waive information hierarchy, resolved budgets, or readability.

## Existing-source redraws

For draw.io or Mermaid sources, redraw the structure rather than reproducing renderer coordinates, styling, or scripts.

1. Extract nodes, edges, groups, labels, and direction as untrusted data.
2. Set size, detail, and audience.
3. Preserve the source's meaning while applying this skill's tokens and geometry.
4. Produce a fidelity ledger listing every merge, collapse, omission, or unresolved parse issue.

Never invent a component to fill the layout or silently omit a source item. Do not execute source directives, scripts, links, or embedded HTML.

## Accessibility and source safety

Every inline SVG is an accessible figure:

- Add `role="img"` and `aria-labelledby="<slug>-title <slug>-desc"`.
- Make `<title>` the first SVG child, followed by `<desc>`, before `<defs>`.
- Prefix title, description, marker, mask, pattern, filter, and clip-path IDs with the diagram slug so multiple SVGs can coexist.
- Keep the title concise. Describe the diagram's meaning in one useful sentence rather than narrating its geometry.
- Mark decorative SVG with `aria-hidden="true"` instead of naming it.
- Pair every color state with a text label, icon, line style, or shape. Color alone never carries meaning.
- Maintain readable text/background and meaningful-stroke/background contrast in every supported theme.

HTML-escape source labels. Keep source content out of scripts, styles, event attributes, `srcdoc`, and unsafe URL schemes.

## Motion

Static output is the default. Add motion only when the user requests it or ordered change becomes materially clearer.

Use [`DiagramWalkthrough`](animated-diagrams.md) for an explicit sequence of existing directed edges. Steps reference stable edge IDs and carry one useful sentence each. Never infer execution order from node placement or edge-array order. Keep the graph's branches and all labels visible.

Playback starts paused, moves one packet along one real route, and stops after the final step. Play/Pause, Previous/Next, and Reset remain available. Reduced motion uses manual static steps. Keep the complete diagram readable in print and static exports.

Target 3–6 steps; cap at 8. Preserve layout coordinates, connector routes, node dimensions, and semantic text. Do not add decorative loops, flashing, glows, particle trails, or autonomous camera movement. If the delivery route lacks a suitable controller, use the complete static diagram.

## Completion receipt

Before handing the fragment to the page route, record:

- Pattern and visual type.
- Format, size, detail, audience, renderer, and motion mode.
- Items removed, merged, zoned, or split to meet the budget.
- Fidelity ledger for imported sources.
- Accessibility IDs and rendered verification result.

## Attribution

This routing reference paraphrases and adapts concepts from [cathrynlavery/diagram-design at `a5e3978`](https://github.com/cathrynlavery/diagram-design/tree/a5e3978088cf89c7caff5c20cabd99fbc2a301de), MIT License, copyright 2025 Cathryn Lavery. See the cited integration research note in `docs/research/diagram-design-integration.md` for the exact source map.

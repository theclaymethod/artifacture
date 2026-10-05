# Reusable graphics blocks and cleanup

The shared drawing layer now composes reusable scenes into one drawing, then carries that drawing through posters, diagrams, slides, and finite video. A block is an immutable `GraphicScene`. `composeGraphics` handles fitting, instance identities, connector ownership, rectangular clipping, and local motion binding. Existing `GraphicCanvas` remains the only primitive renderer.

## Evidence and design decision

The audit reproduced a concrete composition defect: renaming two diagram copies left four physical node references with only two unique order-based identities. It also found that an edge pointing to node order 99 could validate without that node. Creation now rejects duplicate node identities/orders and dangling endpoints. Composition maps source-local semantic nodes into fresh global orders and scopes object, node, edge, and motion identities together.

Two alternatives were sketched: flatten instances into the current scene model, or replace it with recursive blocks/groups/instance paths. An independent assessment favored flattening for the present callers. The recursive option offers natural subtree motion and retained instance boundaries, but first requires migrating every producer, renderer traversal, endpoint representation, and motion address. No measured workload currently justifies that migration.

The chosen design keeps structured addresses private to the compiler and validates relationships inside each source before placement. All paths, masks, leaders, and native silhouettes retain their local geometry and paint order. Nested placements and rectangular clips fold into the same payload. This makes the nearest authoring example safe to copy without knowledge of endpoint remapping or clip-reference construction.

Detailed investigation receipts live in `~/.codex/investigations/artifacture-primitives-2026-10-04/`: `grounding.md`, `style-inventory.md`, both candidate designs, `cross-judge.md`, and verification receipts. Scores in the assessment are design judgments, rather than performance measurements.

## Implemented caller migrations

The shared source example places one diagram twice, animating only the first instance. Its poster, interactive slide, and bundled video consume the same composition. Poster framing delegates to the same inner slide layout.

The long-form retry video uses three semantic diagram scenes and three eight-second slots in the shared sequence. Its former inline GSAP timeline, CDN dependency, handwritten stage/scene implementation, and private palette are removed. Supported hard cuts replace its earlier 0.3-second fades. Static source rendering remains a separate document/content check; playable shared videos use the bundled exporter.

The previous desktop diagram SVG loop and private glyph/anchor helpers were already removed by the foundation. Responsive diagram layout selection and mobile relationships remain in `DiagramCanvas`.

Older template, poster, and diagram guidance now selects Hairline/3b1b and locates palette ownership in `themes.css`. Legacy document guidance distinguishes shared bundled video from source-owned static export, preventing agents from copying an obsolete private video engine.

## Verification

All 190 existing tests, typecheck, manifest checks, lint, and the MDX export checks passed. Inline probes established scoped identities, valid endpoint remapping, independent motion, nested placement/clipping, immutable inputs, and unchanged native paths. Actual browser exports verified readable geometry and backward seeking; the native static/video pair is pixel-exact. The [verification receipt](../verification/reusable-graphics-blocks.md) records source hashes, font conditions, the small raster tolerance in one comparison, and remaining capability limits.

## Next geometry migrations

Migrate a caller and inspect its visible behavior before deleting its previous geometry owner. Build reusable capabilities from accepted examples, rather than inventing a large catalog without callers.

| Migration | Shared owner to build | Delete after parity |
| --- | --- | --- |
| Lieflat rung bars and threads, then the other three encodings | Pure encoding layout, including real units, fractions, missing measurements, exact records, and both thread orientations | Inline mark calculations and duplicate SVG loops; new-film SSR extraction |
| Accepted Hairline and mathematical mechanisms | Native projected glyphs, function plots, labels/leaders, stable anchors, and explicit font roles | Successor-film private circle/line/label helpers and custom SVG patcher |
| Simple `DataChart` encodings | Shared signed bars, categorical lines with gaps, dots, formatting and responsive modes | Its duplicate geometry, preserving its public contract |
| Function/rotation baseline and narrated templates | Finite function/pose sampling plus audio, captions, and supported aspect ratios | Earlier private animation strings and duplicate template engines |

The existing Lieflat geometry remains inside React encoding views. This pass establishes composition; it does not claim those five encodings are already scene blocks. The accepted six movies and review evidence remain frozen. Their successor sources can migrate once shared geometry matches the accepted painted appearance.

## Keep meaningful delivery adapters

Scrolling decks, fixed-stage presentations, posters, mobile diagrams, chart interaction/exact tables/provenance, walkthrough controls, and external Mermaid/Archify renderers have different live contracts. Share their inner geometry. Age alone is not evidence that a wrapper or exporter is redundant.

The obsolete nine-video authoring tree is outside the active delivery, but its font assets still feed the accepted rebuild. Move and verify those inputs before retiring that historical source. Do not delete `visuals/` wholesale.

## Style review

Hairline and 3b1b remain primary, with Lieflat data geometry and one contrasting accent. Other palette removal awaits the user's keep/remove choices. Lieflat's palette and its five chart encodings are separate decisions. Shared Editorial and Archify's gray-paper Editorial are separate catalog entries. `custom` is an extension point.

## Capability limits

Placement uniformly contains declared bounds, preserves local geometry, and is static. Scene creation does not infer arbitrary path bounds. Cross-block connectors need explicit exported anchors and a parent geometry owner; they are not synthesized by the renderer. Arbitrary transforms/clips, rich equation layout, scene transitions, multi-preview runtime ownership, narration, and native Manim/Psychopomp execution are separate work. There is no measured performance claim or new retained-state cache in this increment.

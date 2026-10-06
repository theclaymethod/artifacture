# Reusable component catalog

The same registry owns search and source copying. There are **53 public installation entries**, including the original eight bundles. This counts copy boundaries. Named variants share their owning implementation. The broad MDX API also contains presentation components and icons awaiting leaf extraction.

```bash
artifacture list --query sequence --json
artifacture list --query split --json
artifacture add sequence-scene reveal-in-order --cwd ./explainer
```

Read an entry's `entryPoints`, `variants`, `constraints`, and `examples` before using it. The [preview source](../examples/visual-explainer-mdx/component-catalog.tsx) renders 34 examples with actual local components, four theme choices, and direct time seeking. Export it with `npm run ve:export -- examples/visual-explainer-mdx/component-catalog.tsx --out dist/components.html`.

The [worked showcase](../examples/visual-explainer-mdx/showcase.tsx) demonstrates how these blocks combine: a Hairline agent workflow, calculated toy attention in 3b1b, a Mono Color code fix that preserves zero, and an Algebrica circle generating a sine wave. Its [scene samplers](../examples/visual-explainer-mdx/showcase-scenes.ts) share the existing renderer and sample explicit authored time. These compositions are examples of the indexed APIs, rather than additional installation entries. Export with `npm run ve:export -- examples/visual-explainer-mdx/showcase.tsx --out dist/showcase/index.html`; the [examples guide](../examples/README.md) describes the optional video gallery assets.

| Copy entry | Public API | Implemented choices and useful behavior |
| --- | --- | --- |
| graphics | `GraphicCanvas`, `createGraphicScene` | Rect, circle, polygon, path, line, text; arrows; validated immutable scene data |
| diagram | `DiagramDesignFigure`, `createDiagramScene`, `diagramSceneFromLayout` | Flow, tree, swimlane, timeline; horizontal, vertical, auto; labeled and bidirectional edges |
| diagram-canvas | `DiagramCanvas` | Same scene/layout owner, React wrapper, readable narrow-screen relationships |
| diagram-walkthrough | `PrLensFigure`, `DiagramWalkthrough` | Explicit edge steps, moving packet, play/pause, previous/next/reset, reduced-motion manual steps |
| dag | `DagCanvas`, `prepareDag`, `createDagScene`, `createDagDiagram`, `dagNeighborhood`, `focusDagScene`, `createDagReveal` | Compact multi-parent DAG, stable ordering, cycle witnesses, keyboard focus, full lineage, shared-scene reveal |
| ascii-image, ascii-sweep | `AsciiImage`, `AsciiSweep` | Media-to-glyph sampling and deterministic four-direction image reveals |
| ascii-object | `AsciiObject` | Three.js geometry or Blender GLB with authored-time pose and shared glyph output |
| model-view, shape-ascii, particle-object | `ModelView`, `createModelView`, `modelAsset` | One factory or GLB as shaded geometry, measured six-region ASCII or original seeded points; awaitable capture |
| living-forms | `NativeLivingForm`, `createLivingForm` | Original Strata, Arbor, Resonance TSL renderer; native or explicit-time poses |
| procedural-props | `NativeProceduralProp`, `createProceduralProp` | Original clay trophies, native scene and analytic reveal |
| orbital-text, trace-path | `OrbitalText`, `TracePath` | Explicit-time SVG phrase rings and normalized path reveal |
| vhs | `VhsEffect` | Explicit-time scanlines, drift, grain and channel separation |
| native-clip | `NativeClip`, `NativeStill`, `validateNativeClipAsset` | Validated rendered assets, selected frames, finite HyperFrames placement |
| manim-clip | Native source and job; `NativeClip`, `NativeStill` | Pinned Manim mathematical source, Typst formulas, secant-to-tangent recipe |
| psychopomp-clip | Native source and job; `NativeClip`, `NativeStill` | Pinned Rust Scene Program, bowed connections, springs and travelling packets |
| axonometric-plan | `DiagramDesignFigure`, `createAxonometricPlan`, `createAxonometricPlanMotion` | Rounded floor/site geometry, topological occlusion, horizontal roof/floor names and phased reveal |
| exploded-axonometric | `DiagramDesignFigure`, `createExplodedScene`, `createExplodedMotion` | 2–5 physical parts, hollow trays, shared levels, equal lift gaps, horizontal leaders and top-first motion |
| hairline | 27 original figures, `createHairlineScene` | Official Hairline runtime plus separate prepared-path scene adapter |
| shaders | Original React exports, `NativeShader`, `createShaderSurface` | Official Shader Effects WebGPU library; reversible GPU-fenced frames for Plasma, SimplexNoise and Spiral |
| data-chart | `DataChart` | Bar, line, dot; signed values, missing measurements, exact narrow-screen views |
| charts | `LieflatChart` | Rung bars, unit field, barcode, bubble matrix, threads; exact values and encoding explanations |
| thread-plot | `ThreadPlot` | Smaller record-trace leaf; stage/category paths, selectable record, portrait layout |
| code-block | `CodeBlock` | Escaped plain code or prepared highlighted HTML; filename, line annotations |
| diff-block | `DiffBlock` | Unified/split; patch or before/after text; real addition/removal marks |
| terminal-block | `TerminalBlock` | ANSI transcript and optional prompt; a component, not a retired art theme |
| json-tree | `JsonTree` | Native disclosures for objects/arrays; configurable initial depth |
| quiz | `Quiz` | Choices, explanations, correct/incorrect feedback and completed score |
| pipeline | `Pipeline` | Ordered titled steps with optional bodies |
| decision-matrix | `DecisionMatrix` | Columns from supplied row keys; comparable real choices |
| risk-ledger | `RiskLedger` | Risk, observable signal, mitigation; optional actual risk level |
| sequence-scene | `createSequenceScene` | Participant lanes and stable message IDs; requests, dashed responses, self-messages |
| state-scene | `createStateScene` | States around a cycle, labeled transitions, optional active state; at most two transitions per pair |
| layer-scene | `createLayerScene` | Nested labeled regions communicate containment/ownership |
| plot-scene | `createPlotScene` | Numeric line/scatter; explicit or observed domains; null breaks paths; at most one accented series |
| token-scene | `ChalkboardFigure`, `createTokenScene` | Grid of labeled tokens; neutral, accepted, rejected; rejected tokens have a strike |
| playhead-scene | `createPlayheadScene` | Event rows on a finite numeric axis; an independent translatable playhead |
| grid-scene | `createGridScene` | Explicit scalar domain, fractional cell fill, null slash; at most 32 columns and 1,024 cells |
| reveal-in-order | `revealInOrder` | Ordered opacity or path reveal; explicit duration, start, step, transition |
| focus-in-order | `focusInOrder` | Transfer highlight through unique object IDs; final focus holds |
| follow-path | `prepareGraphicRoute`, `followPath` | Bounded line/curve preparation, distance traversal, authored waits, exact arrival focus, reverse seeking |
| comparison-wipe | `comparisonWipe` | Registered physical geometry, complementary masks, retained static and nested frame clips |
| source-range-focus | `createSourceScene`, `editWithIdentity`, `focusSourceRange` | Stable literal character IDs, exact versioned ranges, identity-preserving edits, half-open cue focus and provenance receipt |
| authored-values | `createMonotoneTrack`, `createVectorTrack` | Scalar/vector cubic sampling at authored seconds; increasing keys, equal dimensions, endpoint holds |
| video-frames | `createVideoFramePlan`, `inspectLoopFrames` | Explicit frame rounding and encoded sample times; awaited exact-endpoint closure separated from last-frame similarity |
| narration-cues | `normalizeNarrationCues`, `alignedWordsToCues`, `formatSubtitleTime`, `serializeNarrationCues` | Immutable absolute-second cues; alignment provenance; explicit overlap/bounds policy; SRT/WebVTT |
| motion | `defineGraphicMotion`, `sampleScene` | Opacity, reveal, highlight, illustration translation/routes, rectangular masks; linear/smooth and discrete boundaries; deterministic seeking |
| composition | `composeGraphics` | Fitted scene instances, scoped identities, frame clipping, one duration |
| slides | `createSlideScene`, `sequenceSlides`, `GraphicSlide` | Frame, title, explanation, theme, finite sequence |
| video | `GraphicVideo`, `registerGraphicVideo` | Same slide sampler, paused GSAP playback, explicit disposal |

The new scene builders are in [teaching-scenes.ts](../visual-explainer-mdx/teaching-scenes.ts). Ordered tracks are in [teaching-motion.ts](../visual-explainer-mdx/teaching-motion.ts). They return the existing `GraphicScene` and `GraphicMotion` data; no additional renderer, grouping layer, or clock exists. Sibling APIs share a source module and dependency closure. Broad imports still re-export extracted React leaves for existing consumers.

[Motion presets](motion-presets.md) describes the new traversal, comparison, and narrated source compilers. The [worked motion review](../examples/visual-explainer-mdx/motion-review.tsx) composes those APIs on one finite clock. Install them with `artifacture add follow-path comparison-wipe source-range-focus`; route and clip helpers travel with existing motion consumers, and narration preserves its license closure.

[Authored values](../visual-explainer-mdx/authored-values.ts) and [narration cues](../visual-explainer-mdx/narration-cues.ts) adapt small MIT helpers from Lemo-Opuscar. Each copies without React, CSS, or npm dependencies and retains the full [Lemo notice](../visual-explainer-mdx/LEMO-LICENSE). Parameter samplers hold outside their key range and do not advance time. Cue normalization rejects overlaps by default; truncation is explicit. ASR padding can produce negative source times: `alignedWordsToCues` rejects them by default, or clips with `bounds: 'clip'` while preserving `sourceInterval`. Measured and estimated alignments remain distinguishable. Subtitle formatting rounds total milliseconds before decomposition, so a carry does not produce an invalid timestamp.

[Frame plans](../visual-explainer-mdx/video-frames.ts) are an original tool informed by the Lemo Wake audit. Choose `ceil`, `floor`, or `nearest` explicitly for a duration that is not on the frame grid. Encode `timeAtFrame(index)` for indices below `frameCount`; probe `endpointTime` separately. `inspectLoopFrames` awaits detached snapshots and reports exact endpoint closure separately from similarity to the last encoded frame. Its caller defines equality. These results do not establish velocity continuity, audio alignment, or pixel quality.

## Reuse through the levels

A scene's semantic IDs remain stable within its source. Use `composeGraphics` to place independent instances and scope their identities. Posters render a sampled scene; slides frame it; video advances the same authored sequence. Theme tokens supply paint, font, and stroke roles. Hairline is the default, with thin structural/detail strokes and one cyan accent; 3b1b, Mono Color, and Algebrica share the geometry.

Reactive charts and the interactive walkthrough have browser layout/control behavior. They are not automatically finite video samplers. The numeric plot, grid, sequence, token, and playhead builders supply a reusable scene route for authored output. Native Hairline camera/prism/spring/pointer tools and the editable Terrain/Riffle figures remain in the pinned vendor skill. Archify remains the larger architecture/workflow/sequence/dataflow/lifecycle CLI. Neither is miscounted as a React leaf.

## Original source integrations

The current [source inventory](source-libraries.md) supersedes the earlier reference-only audit. Hairline installs the official original runtime. Diagram Design retains all 204 documents and the original axonometric/exploded builders. PR Lens uses its real renderer; Chalkboarding retains its native painter. Source wrappers delegate time to the native implementation, and `artifacture source-video` renders original source into reusable clips and decoded stills. Fonts, excluded media and external license restrictions are recorded beside the source.

[Dependency graphs](dag.md) documents DAG reuse. [Native engines](native-engines.md) documents optional Manim and Psychopomp setup and the source-to-clip contract. Native pixels remain rendered media; their source and provenance travel with each output.

[Media effects](media-effects.md) documents the independent ASCII/sweep/VHS blocks and optional Blender source workflow. The [gallery source](../examples/visual-explainer-mdx/media-effects.tsx) exposes four themes, seeking and PNG frame export. [Selected model visuals](model-visuals.md) documents the imported shape matcher, factories, points and SVG leaves. The [selected gallery source](../examples/visual-explainer-mdx/selected-visuals.tsx) compares their live output.

[Axonometric plans and exploded views](../plugins/visual-explainer/references/source-fidelity.md) now default to the original Diagram Design documents. The [compact scene gallery](../examples/visual-explainer-mdx/axonometric.tsx) remains a separate authored adaptation; the [original-source presentation](../examples/visual-explainer-mdx/source-libraries.tsx) demonstrates faithful reuse.

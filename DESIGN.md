# Artifacture visual language

ISO is the default host for new explainers, diagrams, posters, slides, and videos. Use the `3b1b` preset for mathematical mechanisms and derivations. Combine either with Lieflat's data encodings when the explanation includes observations. Retained presets and external brands keep their authored tokens. Retired palettes must migrate to a kept theme.

## Composition

Each chart, diagram, or section answers a question. Establish hierarchy with position, scale, weight, and spacing. Use containers for an interaction or a bounded technical region; let prose sit on the page.

Remove any element whose removal changes neither understanding nor operation. Do not add kickers, decorative numbering, status badges, metric tiles, source-like labels, or captions that repeat the title. Keep real sources, units, sequence, navigation, and state visible.

## Default: ISO illustrations

Use a white canvas, readable neutral text, fine gray geometry, and one cyan accent. The accent identifies the active causal object, edge, or trace. Keep small labels in readable neutral ink. Move the accent when the cause moves; do not leave unrelated objects colored.

Build recognizable isometric objects with `createIsoScene`, face-local details and opaque rounded faces. Use the unchanged Hairline engine for pointer-driven prepared figures. A solid has an opaque ground-colored silhouette, one inset crease, and only the marks its identity needs. Omit vertical corner lines and hidden edges. Paint back to front and fit the most extreme pose before animation.

Use the source figure's 400 × 320 logical frame. The silhouette must read at 240px wide. At that frame, the default outline, crease, and active strokes are 1.5, 0.8, and 1.5 units. Selection changes color rather than adding thickness. Inspect larger video exports and compressed frames before accepting these weights.

Compose a complete resting pose. A stack separates, a tray receives a real item, or an instrument changes a measured quantity. Give each figure one mechanism. Keep words and equations outside the physical illustration. Renaming and recoloring generic node boxes does not establish an illustration style.

Keep the vendored kernel, bench, examples, and license unchanged. The host wrapper maps the active stroke to cyan for this collection. That color override is an explicit adaptation of Hairline's monochrome highlight rule. See [the default explainer theme](plugins/visual-explainer/references/default-explainer-theme.md) for authoring routes.

## Mathematical mechanisms

Use `3b1b` for a black canvas, white and gray geometry, large directional arrowheads, and serif mathematical notation. Keep the same cyan family for the current variable, causal operation, or resulting trace. Distinguish other quantities with position, shape, notation, and line weight.

Construct the actual relationship. One angle drives the point, projection, and sine trace. A weighted sum uses the shown inputs and weights. Axes name quantities and units; their scale agrees with the values. State illustrative assumptions explicitly and never present them as measured evidence.

Reveal the premise, carry the same objects through the operation, and then show the result. Transform related notation in stages while preserving the quantity it denotes. A black background and circular nodes alone do not explain a mathematical mechanism. This visual language does not imply a native Manim backend.

## Lieflat data encodings

Choose the observations and relationships the reader needs to see. Use countable marks for quantities and individual paths for outcomes that a total would hide. A simple comparison is enough when there are few observations.

Use the host's paper, text, and accent roles. ISO replaces the former Lieflat palette; its chart encodings remain reusable. Keep Mono Color and Algebrica as alternatives, with Mono-Industrial optional. Monospace belongs to code and machine identifiers.

Open space separates sections. Fine rules connect related rows. Charts use direct labels, honest scales, and marks tied to actual observations. Bars start at zero; a missing observation remains missing. Use the one accent for the focal record or relationship. Separate other series with direct labels, position, or line style.

## Typography

Treat text as blocks, following [Pierrick Calvez’s typography guide](https://www.pierrickcalvez.com/journal/a-five-minute-guide-to-better-typography). Start with the preset’s type family; establish hierarchy through scale, distinct weights, and spacing. Body copy is at least 16px and figure labels at least 14px at rendered scale.

Keep prose near 40–70 characters per line. Start around 56ch and inspect actual text with fonts loaded; keep tables and diagrams independent of that measure. Use 1.45–1.6 line-height for prose and approximately 1.04–1.15 for large headings. Balance short headings, keep related words together, and avoid isolated final words in paragraphs.

Align left by default and judge visible edges optically. Do not apply blanket punctuation offsets. Comparable numeric columns use tabular figures, right alignment, explicit units, and consistent precision. Review desktop and mobile before adjusting type or measure further.

## Algebrica

Use warm stone (`#f4f0ef`), charcoal (`#312f2f`), and EB Garamond for headings and reading prose. Inter serves controls and figure labels. Keep a comfortable reading measure, useful contents navigation, and generous space around mathematical notation. Draw original, precise SVG geometry; identify axes, quantities, and relationships. This theme replaces the former standalone Nothing starter.

## Mono Color

Use neutral paper (`#fafaf7`) and cobalt (`#2148b8`) with a restrained terracotta accent. Use ink to distinguish content. Arrange the page around one image or typographic region, leaving open paper around it. Halftone is an image treatment for supplied or original imagery, never a background pattern behind diagrams or text.

## Diagrams

Use `DiagramCanvas` for embedded node-and-edge diagrams and the pinned Archify CLI for typed architecture, workflow, sequence, data-flow, or lifecycle artifacts. Preserve the editable source: MDX/TSX for shared components, JSON for Archify.

Size nodes from complete labels before placing them. Separate branches, fan attachment points, route around unrelated nodes, and give edge labels their own space. Do not truncate source labels or shrink text to make a dense graph fit. Split the view, use vertical layout, or provide local scrolling. Check legibility at the actual rendered size.

Use shapes and line styles consistently. A legend is useful only when the encoding is not already clear. Motion may trace a real relationship; the static frame must remain complete.

## Motion

Animate the mechanism the narration explains. A change must have a visible cause and a readable result. Keep object identity, geometry, variable names, and color meaning across formats and adjacent videos. Use measured narration times for reveals and allow time to read the result.

For interactive Hairline figures, use the engine's pointer, spring, tween, reduced-motion, and offscreen lifecycle. For video, sample the authored pose from absolute time; a pointer spring is not a seekable clock. Prove a forward seek and backward seek return the same geometry. Remove idle wobble, glow pulses, unmotivated camera moves, and decorative progress dots.

## Charts

Use `LieflatChart` to author editorial data stories. Five families are implemented: fixed-unit rung bars, countable unit fields, date-positioned barcodes, area-scaled bubble matrices, and individual record threads. Select a form for what its encoding explains. Rungs preserve fractional remainders; barcode positions preserve time intervals; bubble radius follows the square root of quantity; each thread represents one actual record. Never invent records to fill a pattern.

Author a standalone figure as chart JSON with `ve:chart`, or compose several figures in MDX/TSX from shared records. Use `DataChart` for quick bar, line, or dot comparisons. Keep titles factual, units explicit, and source citations real. Avoid 3D, decorative gradients, fake density, and invented headline metrics. Every plotted value must be available without hover. See the [chart authoring guide](plugins/visual-explainer/references/charts.md) for contracts and recipes.

## Interaction and verification

Preserve visible focus, browser zoom, reduced motion, and local overflow for dense content. Controls name their action. Review desktop and mobile together; fix the observed defects, then confirm the affected states. Run mechanical checks as well as inspecting screenshots.

The source references and their licenses are recorded in [visual-sources.json](tools/visual-sources.json). Lieflat charts and mathematical scenes are original implementations; upstream reference images and noncommercial chart code are not bundled. The Hairline skill and engine are vendored unchanged under MIT with their pinned provenance.

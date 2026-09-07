# Artifacture visual language

Lieflat is the default for new artifacts. Use Algebrica for sustained reading and mathematical explanations, Mono Color for editorial posters and covers, and an explicit legacy preset when maintaining an existing artifact.

## Composition

Give the reader one clear question per chart, diagram, or section. Establish hierarchy with position, scale, weight, and spacing. Use containers for an interaction or a bounded technical region; let prose sit on the page.

Remove any element whose removal changes neither understanding nor operation. Do not add kickers, decorative numbering, status badges, metric tiles, source-like labels, or captions that repeat the title. Keep real sources, units, sequence, navigation, and state visible.

## Default: Lieflat

Start with the observations, units, and relationships the reader needs to see. Compose those into a visual story: countable units can make a population tangible; individual paths can reveal outcomes hidden by an aggregate. Choose a simple comparison when the evidence is sparse.

Paper gray (`#f0efeb`), charcoal (`#1c1c1a`), and Inter support the story. Use readable secondary ink (`#65645f`) rather than low-contrast gray. Monospace belongs to code and machine identifiers.

Open space separates sections. Fine rules connect related rows. Charts use direct labels, honest scales, and marks tied to actual observations. Bars start at zero; a missing observation remains missing. One color system serves the whole artifact. Color must identify a series, state, or focal relationship.

## Typography

Treat text as blocks, following [Pierrick Calvez’s typography guide](https://www.pierrickcalvez.com/journal/a-five-minute-guide-to-better-typography). Start with the preset’s type family; establish hierarchy through scale, distinct weights, and spacing. Body copy is at least 16px and figure labels at least 14px at rendered scale.

Keep prose near 40–70 characters per line. Start around 56ch and inspect actual text with fonts loaded; keep tables and diagrams independent of that measure. Use 1.45–1.6 line-height for prose and approximately 1.04–1.15 for large headings. Balance short headings, keep related words together, and avoid isolated final words in paragraphs.

Align left by default and judge visible edges optically. Do not apply blanket punctuation offsets. Comparable numeric columns use tabular figures, right alignment, explicit units, and consistent precision. Review desktop and mobile before adjusting type or measure further.

## Algebrica

Use warm stone (`#f4f0ef`), charcoal (`#312f2f`), and EB Garamond for headings and reading prose. Inter serves controls and figure labels. Keep a comfortable reading measure, useful contents navigation, and generous space around mathematical notation. Draw original, precise SVG geometry; identify axes, quantities, and relationships. This theme replaces the former standalone Nothing starter.

## Mono Color

Use neutral paper (`#fafaf7`) and cobalt (`#2148b8`) with a restrained terracotta accent. Give each ink a job. Let an asymmetric composition and one strong image or typographic region carry the page. Preserve empty paper. Halftone is an image treatment for supplied or original imagery, never a background pattern behind diagrams or text.

## Diagrams

Use `DiagramCanvas` for embedded node-and-edge diagrams and the pinned Archify CLI for typed architecture, workflow, sequence, data-flow, or lifecycle artifacts. Preserve the editable source: MDX/TSX for shared components, JSON for Archify.

Size nodes from complete labels before placing them. Separate branches, fan attachment points, route around unrelated nodes, and give edge labels their own space. Do not truncate source labels or shrink text to make a dense graph fit. Split the view, use vertical layout, or provide local scrolling. Check legibility at the actual rendered size.

Use shapes and line styles consistently. A legend is useful only when the encoding is not already clear. Motion may trace a real relationship; the static frame must remain complete.

## Charts

Use `LieflatChart` to author editorial data stories. Five families are implemented: fixed-unit rung bars, countable unit fields, date-positioned barcodes, area-scaled bubble matrices, and individual record threads. Select a form for what its encoding explains. Rungs preserve fractional remainders; barcode positions preserve time intervals; bubble radius follows the square root of quantity; each thread represents one actual record. Never invent records to fill a pattern.

Author a standalone figure as chart JSON with `ve:chart`, or compose several figures in MDX/TSX from shared records. Use `DataChart` for quick bar, line, or dot comparisons. Keep titles factual, units explicit, and source citations real. Avoid 3D, decorative gradients, fake density, and invented headline metrics. Every plotted value must be available without hover. See the [chart authoring guide](plugins/visual-explainer/references/charts.md) for contracts and recipes.

## Interaction and verification

Preserve visible focus, browser zoom, reduced motion, and local overflow for dense content. Controls name their action. Review desktop and mobile together; fix the observed defects, then confirm the affected states. Mechanical checks supplement visual judgment.

The source references and their licenses are recorded in [visual-sources.json](tools/visual-sources.json). Themes and components are original implementations; upstream reference images and noncommercial code are not bundled.

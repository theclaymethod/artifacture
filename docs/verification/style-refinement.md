# Explainer style refinement

Verified in the shared working tree on October 4, 2026. This receipt covers palette retirement, shared line and text roles, and the mathematical activation specimen. It does not describe a native Manim port.

Hairline is the default. The primary alternatives are 3b1b, Mono Color, and Algebrica. Mono-Industrial remains optional because it was not included in the removal request. Custom and new external brand slugs remain available. Lieflat's palette is retired; its five chart encodings remain usable under the kept themes.

The shared browser-safe preset policy rejects Lieflat, OA Design, Nothing, Blueprint, Editorial, Paper & Ink, and Terminal before external registry lookup or fallback. Current callers and generation defaults have migrated. Retired preset styles, output scaffolding, and OA/Nothing authoring references and starters have been removed. Archify's active menu contains Hairline and Signal Flow; its pinned schema still names Hairline `classic`.

## Shared drawing contract

One immutable `GraphicScene` and one renderer serve diagrams, posters, slides, and finite video sequences. Closed text roles (`body`, `display`, `math`, `mono`) and line roles (`structure`, `detail`, `guide`, `data`, `active`) travel through composition and JSON. CSS owns the destination widths and fonts. Positive finite authored numeric widths take precedence over theme roles.

Hairline diagrams use 0.85 logical units for ordinary outlines and routes, 0.6 for details, and 1.15 for active outlines. Native solids use 1.2 / 0.65 / 1.2 for outlines, creases, and active strokes. Chart marks, guides, and selected threads use 0.85 / 0.55 / 1.3. Filled count and area marks retain their quantitative geometry. These widths scale with the authored geometry; the strict upstream Hairline bench retains its independent non-scaling strokes and unchanged vendor files.

This follows **Model the Domain**, **Laziness Protocol**, and **Migrate Callers Then Delete Legacy APIs**: extend existing scalar scene roles, keep a single rendering path, migrate active callers, and remove the obsolete palette paths.

## Mathematical reference and specimen

The [weighted-neuron and sigmoid example](../../examples/visual-explainer-mdx/math-activation.tsx) composes two reusable blocks. Five semantic nodes and four directed edges show weighted inputs, bias, sum, function, and activation in causal order over twelve seconds. The sigmoid samples the actual function at 81 points from −4 through 4. The poster samples the sequence's final state.

The reference is [3Blue1Brown's neural-network lesson](https://www.3blue1brown.com/lessons/neural-networks/), alongside [Manim's text and formula guide](https://docs.manim.community/en/stable/guides/using_text.html). Our adaptation uses black, white/gray geometry, readable arrowheads, EB Garamond headings, STIX Two Math notation, and one cyan focus. [STIX](https://github.com/stipub/stixfonts) supplies mathematical Unicode glyphs, including italic variables and proper subscripts. Unicode text does not provide TeX parsing, formula layout, `MathTex`, or matching-term transforms.

## Verification

| Check | Observed result |
| --- | --- |
| Existing tests | 190 passed |
| Typecheck, lint, manifests, export checks | Passed |
| Registry and runtime retirement | Seven names rejected before registry access; shell/deck/poster and shared slide boundaries reject them |
| Scene roles | Invalid roles/fonts and non-finite or zero widths rejected; explicit 2.75-unit width survives composition, deep freezing, JSON, and browser rendering |
| JSON sequence round trip | Identical rendered markup at 0, 2, 6, 10, and 12 seconds |
| Hairline charts | All five families and exact-data tables preserved at 390, 960, and 1920px; no document overflow or page errors |
| Thread interaction | Selected trace 1.3 units, other traces at 0.08 opacity; clearing returns 0.85-unit traces; portrait and horizontal layouts work |
| Diagram browser checks | 0.85-unit ordinary outlines at 390, 960, and 1920px; no document overflow |
| Mathematical browser export | STIX notation loaded; no page errors; normalized geometry, attributes, and computed paint repeat exactly when seeking back to 0, 2, and 12 seconds |
| Actual frame comparison | Final repeat is pixel-identical. Earlier repeats differ slightly along circle edges; poster/final-frame comparison also has minor edge antialiasing differences. No pixel-exact claim for those comparisons |
| Review player | Play advances; keyboard scrub reaches the final pose; replay works after scrub and completion; controls fit 320, 736, and 1400px |
| Archify | 9/9 validation checks and showcase composition pass; routes, node groups, and masks preserve earlier geometry; menu, theme, zoom, and mobile scrolling pass |

No new test files, test-only helpers, or fixtures were created. Direct probes and actual artifact exports supply the additional evidence. The six previously delivered Ainthony movies remain frozen; this twelve-second specimen is a visual/motion preview without narration.

Archify retains an existing readability limitation: its authored label sizes are 11px, 9px, and 8px, below the guide's 14px target at natural scale. Increasing them through CSS alone would break its fitting and mask assumptions. The palette work does not claim that typography target passes.

Detailed receipts and exported frames are in `/Users/claytonkim/.codex/investigations/artifacture-style-refinement-2026-10-04`. Raw browser exports require network access for their named web fonts; system fallbacks remain available.

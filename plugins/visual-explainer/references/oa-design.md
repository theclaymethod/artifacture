# OA Design — Default Reference

Artifacture's default explainer preset follows [OpenLabs' oa-design](https://github.com/OpenLabs-so/oa-design/tree/bd200daeac8eca2501139cb0fa29cc12e4709303) as its visual reference. The upstream design language is the authority for interaction and surface grammar; Artifacture maps it onto the existing `--ve-*` token contract so exported explainers remain standalone and named legacy presets remain available.

## Default character

- White surfaces rest on a quiet `#f6f6f6` stage.
- One ink (`#292929`) derives borders, rows, hover washes, and secondary surfaces by percentage.
- Inter Tight carries display and body text at weights 300–500; Geist Mono is reserved for code and tabular technical detail.
- Structural surfaces use continuous-curvature corners. Actions and compact controls are pills.
- The only non-semantic accent is `#305dde`, reserved for primary actions and the focal path in a diagram.
- Elevation is binary: a resting `0 1px 2px rgb(0 0 0 / 0.06)` shadow or the upstream floating shadow. Do not invent intermediate elevations.
- Decorative grid, dot-matrix, graph-paper, and scanline backgrounds are forbidden across every preset. Diagram geometry may align to a hidden coordinate grid, but the canvas stays clean.

## Explainer adaptation

Explainers are Read surfaces. Keep the body measure readable, render the title and shell immediately, and group content into a small number of white plates separated by the grey stage. Avoid rules between page sections; the gap is the divider. Tables, code, diagrams, and dense lists may scroll inside their own surface, while the page root never scrolls sideways.

Use semantic colors only on text, dots, or the focal path. A status must include a label; color never carries meaning alone. Keep headings at 500 or below and use size, spacing, and ink opacity for hierarchy.

## Motion and controls

Use the oa-design spring family when a React surface needs motion: PANEL `550/38`, LAYOUT `550/40`, POP `400/26`, POP_EXIT `380/28`, BANNER `400/30`, FLICK `900/50`, and CHART `300/28`. Static HTML uses 100–180ms ease-out transitions and preserves the same enter/exit asymmetry. Respect `prefers-reduced-motion`.

Buttons name the result of the action, keep their label while loading, press by `translateY(1px) scale(.98)`, and retain a visible three-pixel focus ring. Chrome renders immediately; only data regions may skeleton.

## Provenance and upstream use

Reference reviewed at commit `bd200daeac8eca2501139cb0fa29cc12e4709303` (MIT). For component-level work, consult upstream `DESIGN-SKILL.md` and the relevant recipe under `skills/oa-design/`; do not approximate a recipe from this summary when its exact values matter.

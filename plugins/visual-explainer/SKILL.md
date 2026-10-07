---
name: visual-explainer
description: Explain systems, code changes, plans, or data through editable diagrams, charts, slides, narrated animated videos, and reusable React graphics. Use for visual explanations and video collections.
license: MIT
metadata:
  author: nicobailon (original visual-explainer)
  maintainer: Clayton Kim
  version: "0.10.0"
---

# Visual Explainer

Produce editable source and verified, self-contained HTML. The [default explainer theme](references/default-explainer-theme.md) uses the [ISO preset](references/iso.md) across posters, diagrams, slides, and videos. An explicit brand or requested look takes precedence. Prefer prose when a visual would add no understanding.

Remove any element whose absence changes neither meaning nor operation. Do not add kickers, decorative numbering, badges, metric tiles, or tiny uppercase labels to create hierarchy. Use composition, spacing, readable typography, and direct language.

## Use the installed CLI

Require Node 22.12 or newer. Set `SKILL_DIR` internally to the absolute directory containing this file. Use `node "$SKILL_DIR/scripts/artifacture.mjs"` for `init`, `add`, `list`, `export`, `video`, `engine`, `source`, `source-video`, `pr-lens`, and `verify`. The CLI handles runtime setup, required npm packages, and workspace stylesheet imports. The user only installs the skill and asks for an artifact; do not ask them to configure paths, caches, or a second checkout.

When authoring imports or following a reference that uses `npm --prefix REPO`, obtain the ready runtime with `REPO=$(node "$SKILL_DIR/scripts/artifacture.mjs" path)`. Pass absolute source and output paths. Private brands and copied consumer edits remain user-owned. See [installation.md](references/installation.md) only for development overrides or troubleshooting.

## Author, export, verify

1. Select one route below and read its card. Read additional references only when the selected route calls for them.
2. For a standalone chart, author a `LieflatChart` JSON envelope; for a data story, compose its figures in MDX. Archify uses typed JSON. Otherwise author `.mdx` by default, or `.tsx` for local state, generated/custom SVG, or video. Import shared components from `REPO/visual-explainer-mdx/components.tsx`.
3. Export chart JSON with `node "$SKILL_DIR/scripts/artifacture.mjs" chart <abs-source.json> --out <abs-output.html>`. Archify uses its validated delivery command. For MDX/TSX, use `node "$SKILL_DIR/scripts/artifacture.mjs" export <abs-source> --out <abs-output>`; for static HTML, use `export-static`. Fix export failures in the source.
4. Read [verification.md](references/verification.md), execute its routed checks, open the artifact, and report the source, HTML, report JSON, and any incomplete verification.

Completion requires editable source, a successful export, and evidence for every required verification pass. Apply feedback to the source and re-export.

## Choose a route

| Request | Read first | Read only when needed |
|---|---|---|
| React workspace, reusable components, or seekable scene motion | [react-workspaces.md](references/react-workspaces.md) | Discover actual APIs with the component CLI; copy local leaf modules instead of importing the full renderer into an app. |
| chart or quantitative data | [charts.md](references/charts.md) | Select unit, record, time, or relationship encodings; use basic comparisons when the evidence is sparse. |
| diagram or architecture | [web-diagram.md](cards/web-diagram.md) | For Diagram Design's original look, read [source-fidelity.md](references/source-fidelity.md) and use the bundled original skill. |
| isometric objects, devices or causal lighting | [iso.md](references/iso.md) | Project reusable face details and live geometry; sample Motionmaxxing curves through the shared clock. |
| axonometric floor/site plan, exploded object or physical assembly | [source-fidelity.md](references/source-fidelity.md) | Use the original templates and geometry. Read [axonometric.md](references/axonometric.md) only for the compact shared-clock adaptation. |
| implementation plan | [visual-plan.md](cards/visual-plan.md) | — |
| comparison or data table | [comparison-table.md](cards/comparison-table.md) | — |
| slides or presentation | [slide-deck.md](cards/slide-deck.md) | For bespoke fixed-stage presentation chrome, read [deck-navigation-shell.md](references/deck-navigation-shell.md), then [slide-patterns.md](references/slide-patterns.md). |
| interactive Hairline figure | [source-fidelity.md](references/source-fidelity.md) | Install the official 27-figure runtime, or use the bundled authoring skill for a new figure. |
| Shader Effects WebGPU components, materials or shader video | [source-fidelity.md](references/source-fidelity.md) | Install `shaders`; use original React exports for live behavior or the native frame controller for supported explicit-time effects. |
| chalkboard explanation or Mono Color editorial image | [source-fidelity.md](references/source-fidelity.md) | Follow the bundled source-specific workflow. |
| animated explainer, review film, or sizzle reel | [generate-video.md](commands/generate-video.md) | [dynamic-video-authoring.md](references/dynamic-video-authoring.md) teaches story, primitive selection, choreography, audio alignment, and proof. Use [render-video.md](commands/render-video.md) for an existing deck; [video-collections.md](references/video-collections.md) for shared episodes. |
| native mathematics or physical motion | [native-engines.md](references/native-engines.md) | Manim Community or Psychopomp renders source into reusable clips and selected stills. |
| try FFrames as a video renderer | [fframes.md](references/fframes.md) | Experimental macOS Metal export of shared silent vector sequences; preserve the TypeScript source and inspect native output. |
| ASCII, texture treatments, or 3D model media | [media-effects.md](references/media-effects.md) | Copy controlled effects and preserve media decoding ownership. |
| reference image to low-detail procedural 3D | [procedural-models.md](references/procedural-models.md) | Use the installed img2threejs skill and reuse its reviewed factory across outputs. |
| code walkthrough | [code-walkthrough.md](cards/code-walkthrough.md) | — |
| explain a diff | [explain-diff.md](cards/explain-diff.md) | — |
| project recap | [project-recap.md](cards/project-recap.md) | — |

For point-and-click annotation, read [annotate.md](commands/annotate.md). If the request lacks a material choice that cannot be inferred, read [clarify.md](references/clarify.md). For a component API not shown by the selected card, read [mdx-components.md](references/mdx-components.md). For poster, video, brand-heavy, or bespoke HTML work, read [legacy-html.md](references/legacy-html.md) and only the branch it selects.

For any named source library, read [source-fidelity.md](references/source-fidelity.md) before substituting or recreating a visual. Resolve its original with `source`; vendor unchanged allowed code, isolate shims, and feed explicit time only where its native controller supports seeking. Reuse rendered clips/stills across presentations and videos.

## Authoring rules

- Keep MDX/TSX, chart JSON, or Archify JSON as the source of truth; generated HTML is disposable output.
- Prefer shared components, semantic content, and tokens over hand-authored coordinates or page CSS.
- For illustrations, read [default-explainer-theme.md](references/default-explainer-theme.md). Reuse shared geometry across formats; isolate strict Hairline pointer figures from seekable video scenes.
- For reusable React work, keep the scene → composition → slide → video boundary. Sample explicit time, author narrow layouts separately, and call `disposeGraphicVideo` when a registered host leaves.
- For video, stage a visible event and its consequence. Keep subjects identifiable as they move, compare, separate, and recombine. Use the component index to find implemented motion; a component tour and a narrated argument need different scripts. Align important events to the recorded narration, then inspect the encoded film as well as the source preview.
- Use `LieflatChart` for editorial data stories and `DataChart` for quick bar, line, or dot comparisons. Marks must encode evidence; never invent records or quantities to fill a pattern.
- When adjusting type, read [typography.md](references/typography.md). Compose readable text blocks through measure, grouping, weight, and spacing.
- Use `DiagramCanvas` for compact supported layouts; use Archify for complex typed system maps. The diagram card routes both. Keep labels readable at initial scale: at least 14px in figures and 16px in body copy. Resize or split content before shrinking it.
- Discover `dag` for compact multi-parent dependencies, keyboard focus and lineage tracing. Its labeled scene and authored reveal reuse the existing graphics, slides and video pipeline; the interactive list remains a page control.
- Treat facts, labels, and visual encodings as claims. Keep them traceable to the user brief or inspected sources; mark uncertainty instead of inventing rationale.
- Preserve accessibility, responsive containment, and reduced-motion behavior. Optional metadata requires factual state, sequence, provenance, ownership, or navigation.

Use [delegated-skills.md](references/delegated-skills.md) only when its delegated visual/prose checks are available. Use [model-routing.md](references/model-routing.md) only when dispatching visual-review passes. The main thread orchestrates those passes and consumes their evidence; a visual-capable reviewer judges screenshots.

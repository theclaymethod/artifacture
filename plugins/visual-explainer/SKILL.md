---
name: visual-explainer
description: Use when explaining systems, code changes, plans, or data with diagrams, charts, comparison tables, HTML pages, or slides.
license: MIT
metadata:
  author: nicobailon (original visual-explainer)
  maintainer: Clayton Kim
  version: "0.8.0"
---

# Visual Explainer

Produce editable source and verified, self-contained HTML. Use Lieflat by default: visual stories shaped by observations, units, and relationships, with readable type and generous space. Prefer prose when a visual would add no understanding.

Remove any element whose absence changes neither meaning nor operation. Do not add kickers, decorative numbering, badges, metric tiles, or tiny uppercase labels to create hierarchy. Use composition, spacing, readable typography, and direct language.

## Resolve the runtime

Set `REPO` to the Artifacture checkout before authoring:

1. If `../../visual-explainer-mdx/components.tsx` exists relative to this file, use the repository two directories above this file.
2. Otherwise, use `~/.artifacture` when it contains `visual-explainer-mdx/components.tsx` and `package.json`.
3. If neither exists, clone `https://github.com/theclaymethod/artifacture` to `~/.artifacture` and run `npm install --prefix ~/.artifacture`, then resume. Require Node 22 or newer. Do not update an existing runtime as a side effect of generation.

Run every `npm run ve:*` command from `REPO`. Sources may live elsewhere; pass absolute paths.

## Execute the flow

1. Select one route below and read its card. Covered flows need this file and that card only until a conditional pointer fires.
2. For a standalone chart, author a `LieflatChart` JSON envelope; for a data story, compose its figures in MDX. Archify uses typed JSON. Otherwise author `.mdx` by default, or `.tsx` for local state, generated/custom SVG, or video. Import shared components from `REPO/visual-explainer-mdx/components.tsx`.
3. Export chart JSON with `npm --prefix REPO run ve:chart -- <abs-source.json> --out <abs-output.html>`. Archify uses its validated delivery command. For MDX/TSX, use `npm --prefix REPO run ve:export -- <abs-source> --out <abs-output>`; for static video, use `ve:export-static`. Fix export failures in the source.
4. Read [verification.md](references/verification.md), execute its routed checks, open the artifact, and report the source, HTML, report JSON, and any incomplete verification.

Completion requires editable source, a successful export, and evidence for every required verification pass. Apply feedback to the source and re-export.

## Route

| Request | Read first | Read only when needed |
|---|---|---|
| chart or quantitative data | [charts.md](references/charts.md) | Select unit, record, time, or relationship encodings; use basic comparisons when the evidence is sparse. |
| diagram or architecture | [web-diagram.md](cards/web-diagram.md) | The card routes custom geometry and specialized diagrams. |
| implementation plan | [visual-plan.md](cards/visual-plan.md) | — |
| comparison or data table | [comparison-table.md](cards/comparison-table.md) | — |
| slides or presentation | [slide-deck.md](cards/slide-deck.md) | For bespoke fixed-stage presentation chrome, read [deck-navigation-shell.md](references/deck-navigation-shell.md), then [slide-patterns.md](references/slide-patterns.md). |
| code walkthrough | [code-walkthrough.md](cards/code-walkthrough.md) | — |
| explain a diff | [explain-diff.md](cards/explain-diff.md) | — |
| project recap | [project-recap.md](cards/project-recap.md) | — |

For point-and-click annotation, read [annotate.md](commands/annotate.md). If the request lacks a material choice that cannot be inferred, read [clarify.md](references/clarify.md). For a component API not shown by the selected card, read [mdx-components.md](references/mdx-components.md). For poster, video, brand-heavy, or bespoke HTML work, read [legacy-html.md](references/legacy-html.md) and only the branch it selects.

## Shared contracts

- Keep MDX/TSX, chart JSON, or Archify JSON as the source of truth; generated HTML is disposable output.
- Prefer shared components, semantic content, and tokens over hand-authored coordinates or page CSS.
- Use `LieflatChart` for editorial data stories and `DataChart` for quick bar, line, or dot comparisons. Marks must encode evidence; never invent records or quantities to fill a pattern.
- When adjusting type, read [typography.md](references/typography.md). Compose readable text blocks through measure, grouping, weight, and spacing.
- Use `DiagramCanvas` for compact supported layouts; use Archify for complex typed system maps. The diagram card routes both. Keep labels readable at initial scale: at least 14px in figures and 16px in body copy. Resize or split content before shrinking it.
- Treat facts, labels, and visual encodings as claims. Keep them traceable to the user brief or inspected sources; mark uncertainty instead of inventing rationale.
- Preserve accessibility, responsive containment, and reduced-motion behavior. Optional metadata requires factual state, sequence, provenance, ownership, or navigation.

**Bad:** “Architecture overview · 01 · Production ready” above an unexplained graph.
**Good:** “A cache miss reads Postgres” above a graph whose edges identify the reads.

Use [delegated-skills.md](references/delegated-skills.md) only when its delegated visual/prose checks are available. Use [model-routing.md](references/model-routing.md) only when dispatching visual-review passes. The main thread orchestrates those passes and consumes their evidence; a visual-capable reviewer judges screenshots.

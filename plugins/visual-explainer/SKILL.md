---
name: visual-explainer
description: Generate beautiful, self-contained HTML artifacts from MDX/React sources that visually explain systems, code changes, plans, and data. Use when the user asks for a diagram, architecture overview, diff review, plan review, project recap, comparison table, code walkthrough, or any visual explanation of technical concepts. Also use proactively when a table would need at least 4 rows or 3 columns.
license: MIT
metadata:
  author: nicobailon (original visual-explainer)
  maintainer: Clayton Kim
  version: "0.8.0"
---

# Visual Explainer

Produce an editable MDX/TSX source, export it to self-contained HTML, and verify the result. Use HTML instead of ASCII for substantial diagrams and tables.

## Resolve the runtime

Set `REPO` to the Artifacture checkout before authoring:

1. If `../../visual-explainer-mdx/components.tsx` exists relative to this file, use the repository two directories above this file.
2. Otherwise, use `~/.artifacture` when it contains `visual-explainer-mdx/components.tsx` and `package.json`.
3. If neither exists, clone `https://github.com/theclaymethod/artifacture` to `~/.artifacture` and run `npm install --prefix ~/.artifacture`, then resume. Require Node 22 or newer. Do not update an existing runtime as a side effect of generation.

Run every `npm run ve:*` command from `REPO`. Sources may live elsewhere; pass absolute paths.

## Execute the flow

1. Select one route below and read its card. Covered flows need this file and that card only until a conditional pointer fires.
2. Author `.mdx` by default. Use `.tsx` only for local state, generated/custom SVG, or video. Import shared components from `REPO/visual-explainer-mdx/components.tsx` as the card shows.
3. Export with `npm --prefix REPO run ve:export -- <abs-source> --out <abs-output>`. For static video, use `npm --prefix REPO run ve:export-static -- <abs-source.tsx> --out <abs-output>`. Fix strict-export failures in the source.
4. Read [verification.md](references/verification.md), execute its routed checks, open the artifact, and report the source, HTML, report JSON, and any incomplete verification.

Completion requires an editable source, a successful export, and evidence for every required verification pass. Apply feedback to the source and re-export.

## Route

| Request | Read first | Read only when needed |
|---|---|---|
| diagram or architecture | [web-diagram.md](cards/web-diagram.md) | The card routes custom geometry and specialized diagrams. |
| implementation plan | [visual-plan.md](cards/visual-plan.md) | — |
| comparison or data table | [comparison-table.md](cards/comparison-table.md) | — |
| slides or presentation | [slide-deck.md](cards/slide-deck.md) | For bespoke fixed-stage presentation chrome, read [deck-navigation-shell.md](references/deck-navigation-shell.md), then [slide-patterns.md](references/slide-patterns.md). |
| code walkthrough | [code-walkthrough.md](cards/code-walkthrough.md) | — |
| explain a diff | [explain-diff.md](cards/explain-diff.md) | — |
| project recap | [project-recap.md](cards/project-recap.md) | — |

For point-and-click annotation, read [annotate.md](commands/annotate.md). If the request lacks a material choice that cannot be inferred, read [clarify.md](references/clarify.md). For a component API not shown by the selected card, read [mdx-components.md](references/mdx-components.md). For poster, video, brand-heavy, or bespoke HTML work, read [legacy-html.md](references/legacy-html.md) and only the branch it selects.

## Shared contracts

- Keep MDX/TSX as the source of truth; generated HTML is disposable output.
- Prefer shared components, semantic content, and tokens over hand-authored coordinates or page CSS.
- Use `DiagramCanvas` for ordinary diagrams. Use Mermaid only when automatic graph layout is materially better and the result retains zoom, pan, reset, and expand controls.
- Treat facts, labels, and visual encodings as claims. Keep them traceable to the user brief or inspected sources; mark uncertainty instead of inventing rationale.
- Preserve accessibility, responsive containment, and reduced-motion behavior.

Use [delegated-skills.md](references/delegated-skills.md) only when its delegated visual/prose checks are available. Use [model-routing.md](references/model-routing.md) only when dispatching visual-review passes. The main thread orchestrates those passes and consumes their evidence; a visual-capable reviewer judges screenshots.

---
name: visual-explainer
description: Generate beautiful, self-contained HTML artifacts from MDX/React sources that visually explain systems, code changes, plans, and data. Use when the user asks for a diagram, architecture overview, diff review, plan review, project recap, comparison table, code walkthrough, or any visual explanation of technical concepts. Also use proactively when you are about to render a complex ASCII table (4+ rows or 3+ columns) — present it as a styled generated HTML page instead.
license: MIT
metadata:
  author: nicobailon (original visual-explainer)
  maintainer: Clayton Kim
  version: "0.8.0"
---

# Visual Explainer

MDX/TSX -> HTML -> verify. Never ASCII; 4+ row or 3+ column tables become HTML.

## Pipeline location

Rendering requires the Artifacture repo (components + export pipeline).
Resolve `REPO` first:
- If `../../visual-explainer-mdx/components.tsx` exists relative to this
  file, you are inside a full clone: `REPO` = the repo root (two directories
  up from this file).
- Otherwise clone or update it once: `git clone --depth 1
  https://github.com/theclaymethod/artifacture ~/.artifacture` (if
  `~/.artifacture` exists: `git -C ~/.artifacture pull --ff-only`), then
  `npm install --prefix ~/.artifacture`. `REPO` = `~/.artifacture`.
  Requires Node >= 22.

All `npm run ve:*` commands below run from `REPO`; author your `.mdx`/`.tsx`
source anywhere and pass absolute paths.

## Tier 0

Workflow, in order:

1. Pick the flow's card from the routing table below and read it (plus this file — nothing else for covered flows).
2. Author `.mdx` (default; `.tsx` only for state/custom SVG/video). Import shared components from `REPO/visual-explainer-mdx/components.tsx` exactly as the card skeleton shows.
3. Export: `npm --prefix REPO run ve:export -- <abs-src> --out <abs-out>` (static video: `npm --prefix REPO run ve:export-static -- <abs-tsx> --out <abs-out>`). Fix any strict-export integrity errors at the source.
4. Verify (§6 below), then open the artifact and tell the user the file path. The MDX/TSX source stays the editable source of truth — apply feedback there and re-export.

## Components

- ExplainerShell(title,summary?,preset?,reviewTools?)
- Section(title,kicker?)
- Callout(children)
- Pipeline(steps)
- DecisionMatrix(rows)
- RiskLedger(risks)
- DiagramCanvas(nodes,edges,layout?,lanes?,dates?; shape rect/oval/diamond/dot; style solid/dashed/bidirectional)
- FlowDiagram(nodes,edges)
- CodeBlock(code,language,filename?,highlightLines?,annotations?,diff?)
- DiffBlock(patch? OR before+after,language?,filename?,mode?)
- TerminalBlock(content,title?,showPrompt?)
- JsonTree(data,collapsedDepth?)
- Quiz(questions)
- MermaidBlock(chart,caption?)
- SlideDeck(title,orientation?,preset?,reviewTools?)
- Slide(title,kicker?,tone?)
- PosterCanvas(eyebrow?,title,stat?,footer?,preset?)

Presentation deck (presented/interactive decks — fixed 1920×1080 stage scaled to fit, slide rail, keyboard nav, drill-downs; when in doubt see `REPO/docs/presentation-deck.md` for PresentationDeck vs SlideDeck):

Before creating or editing presentation chrome, read
`./references/deck-navigation-shell.md`. Reuse the workspace's canonical shell
and shader when present; do not copy either implementation into a new deck.

- PresentationDeck(title,eyebrow?,preset?,stageWidth?,stageHeight?,railAutoCollapseMs?)
- PresentationSlide(kicker,title?,shortTitle?,tone?,rightLabel?,footer?,sub?)
- DrillCard(drillId,title,eyebrow?,body?,hint?,accent?,origin?,minHeight?)
- DrillChip(label,onClick,drillId,variant?,hint?)
- DrillSheet(eyebrow,onClose,origin?)
- CloseX(onClose)
- LayerExplorer(layers,initialIndex?,drillIdPrefix?,listWidth?)
- LadderDiagram(stages,stepOffset?,gridBackdrop?,renderStage?,framed?)
- FanoutDiagram(source,outputs,sourceWidth?,connectorWidth?)
- PullQuote(quote,attribution,size?,panel?)
- Metric(value,label,size?)
- StatRow(stats)
- HairlineList(items,accent?,gap?,columns?)
- Stepper(steps,accentIndex?)
- CodePanel(rows? OR lines?,fontSize?)
- MonoLabel(children,size?,color?,ls?,caps?,block?)
- DisplayText(children,size?,lh?,color?,italic?,maxW?)
- IconChip(icon,accent?,size?)
- ShineOverlay(color?,radius?)
- IconBase(children,size?,color?)
- IconFile(color?,size?)
- IconTool(color?,size?)
- IconAction(color?,size?)
- IconLoop(color?,size?)
- IconGauge(color?,size?)
- IconTag(color?,size?)
- IconFit(color?,size?)
- IconFilter(color?,size?)
- IconCorpus(color?,size?)
- IconArrowDown(color?,size?)
- IconArrowRight(color?,size?)

Presets: mono-industrial, nothing, blueprint, editorial, paper-ink, terminal, custom; use `--ve-*`. Any other preset name resolves against the external design-system registry ($ARTIFACTURE_DESIGN_DIR → ~/.artifacture/design-systems → repo design-systems/) and its tokens.css is inlined at export; learn new systems with `npm run ve:learn -- <code|url|image> --name <slug>`. See docs/design-systems.md.

|Flow|Card|Tier 2|
|-|-|-|
|diagram|cards/web-diagram.md|references/diagram-design.md, then references/diagrams-svg.md|
|plan|cards/visual-plan.md||
|table|cards/comparison-table.md||
|slides|cards/slide-deck.md|references/slide-patterns.md|
|code|cards/code-walkthrough.md||
|explain-diff|cards/explain-diff.md||
|annotate|commands/annotate.md|references/developer-preview.md|

Clarify: `./references/clarify.md`. Use components/tokens, not hand CSS/coords. Run Unslop on drafted copy. Delegated checks: `./references/delegated-skills.md`; model policy: `./references/model-routing.md`. Optional media: `./references/media.md`. Diagram mechanics: `./references/quality.md`. Poster/video/brand/bespoke -> `./references/legacy-html.md`.

## 6. Verify

Read `./references/verification.md`, `./references/delegated-skills.md`, and `./references/model-routing.md`; run `node {{skill_dir}}/scripts/verify/ve-verify.mjs <artifact.html> --json <report.json> --screens <screens-dir>` (in this repo, `{{skill_dir}}` = `plugins/visual-explainer`); run only the routed Artifacture passes and delegated Impeccable/Unslop checks. For a slide or fixed-stage presentation, consume the generated deck-review manifest and review every base, drill, and progressive state; never substitute the opening screenshot for the complete state set. If `P-deck-review` fails, read `./references/deck-visual-review-repair.md` and use that bounded repair operator on only the grounded findings before the final complete-deck recapture. The main thread orchestrates and summarizes; it does not perform screenshot judgment. Dispatch each Artifacture-owned visual pass to the smallest eval-qualified model and exact batch size in the generated policy. If no qualified route can run, use the best available visual-capable model, preserve the pass evidence contract, and label its execution `unqualified-fallback`; skip only when no visual-capable model is available. Report the artifact path, report JSON, actual model/batch/qualification per pass, per-pass pass/fail, and an explicit disclosure if anything could not be verified.

## Design-craft delegation

Artifacture does not maintain a general AI-slop checklist. Use the ownership
contract in `./references/delegated-skills.md`:

- Impeccable owns general visual craft, design specificity, typography, color,
  generic decoration, and visual AI tells.
- Unslop owns prose patterns, cadence, voice, and AI-writing tells.
- Artifacture owns mechanical artifact checks and the explicit
  `artifacture:slop-gap` pass.

The Artifacture gap is limited to decoration that falsely implies sequence,
measured state/confidence, or provenance/verification. Do not expand that list
with generic taste rules. If Impeccable or Unslop is unavailable, disclose the
skipped delegated check instead of recreating its rubric here.

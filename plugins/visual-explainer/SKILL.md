---
name: visual-explainer
description: Generate beautiful, self-contained HTML artifacts from MDX/React sources that visually explain systems, code changes, plans, and data. Use when the user asks for a diagram, architecture overview, diff review, plan review, project recap, comparison table, code walkthrough, or any visual explanation of technical concepts. Also use proactively when you are about to render a complex ASCII table (4+ rows or 3+ columns) — present it as a styled generated HTML page instead.
license: MIT
compatibility: Requires a browser to view generated HTML files. Optional surf-cli for AI image generation.
metadata:
  author: nicobailon (original visual-explainer)
  maintainer: Clayton Kim
  version: "0.7.0"
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

Presets: mono-industrial, nothing, blueprint, editorial, paper-ink, terminal, custom; use `--ve-*`.

|Flow|Card|Tier 2|
|-|-|-|
|diagram|cards/web-diagram.md|references/diagrams-svg.md; references/legacy-html.md|
|plan|cards/visual-plan.md|references/legacy-html.md|
|table|cards/comparison-table.md|references/legacy-html.md|
|slides|cards/slide-deck.md|references/slide-patterns.md; references/legacy-html.md|
|code|cards/code-walkthrough.md|references/legacy-html.md|
|explain-diff|cards/explain-diff.md|references/legacy-html.md|

Clarify: `./references/clarify.md`. Use components/tokens, not hand CSS/coords. Run /unslop (or apply `./scripts/verify/rubrics/pass-copy.md`) on drafted copy; poster/video/brand/bespoke -> `./references/legacy-html.md`.

## 6. Verify

Read `./references/verification.md`; run `node {{skill_dir}}/scripts/verify/ve-verify.mjs <artifact.html> --json <report.json> --screens <screens-dir>` (in this repo, `{{skill_dir}}` = `plugins/visual-explainer`); run the LLM passes including visual-tells; report the artifact path, report JSON, per-pass pass/fail, and an explicit disclosure if anything could not be verified.

## Anti-Patterns (AI Slop)

These patterns are explicitly forbidden. They signal "AI-generated template" and undermine the skill's purpose of producing distinctive, high-quality diagrams. Review every generated page against this list. Each ban includes the positive alternative to use instead.

### Typography

- Do not use Inter, Roboto, Arial, Helvetica, or `system-ui, sans-serif` alone as the primary `--font-body`; pick from the font pairings in `./references/libraries.md` or preserve a real project font stack.
- Cap each page at four named font families. Prefer one family in three or four weights over fake variety.
- Do not pair two fonts from the same class, such as two geometric sans or two humanist sans faces. Contrast on a real axis, such as serif plus sans or mono plus sans, or stay within one family.
- Do not reach for reflex webfonts such as Fraunces, Playfair Display, Cormorant, Lora, Syne, Space Grotesk, DM Sans/Serif, Outfit, Plus Jakarta Sans, or Instrument Sans/Serif as the voice face on a custom page. Pick against three brand-voice words from a real catalog; mono variants inside code are fine.
- Keep a committed type scale. Adjacent levels need at least a 1.25x difference carried by size plus weight or color; avoid 14/15/16px muddle and lone 500-vs-400 weight bumps.
- Set body and running prose at 16px or larger in `rem`. Never ship `user-scalable=no` or `maximum-scale=1`.
- Bound `clamp()` type: max/min should stay at or below about 2.5, and hero/display max should stay at or below about `6rem`.
- Add `0.05em` to `0.12em` tracking to all-caps labels unless a house aesthetic sets its own value.
- Load webfonts with `font-display: swap`; Google Fonts links must include `&display=swap`.

### Color

- Do not use indigo/violet defaults (`#8b5cf6`, `#7c3aed`, `#a78bfa`) or the cyan + magenta + pink neon set (`#06b6d4` -> `#d946ef` -> `#f472b6`). Build palettes from reference templates or from a real named theme.
- Do not default body or surface neutrals to warm cream/sand (`OKLCH` L `.84-.99`, C `<.06`, hue `40-100`, or tokens such as `--paper`, `--cream`, `--sand`, `--linen`) unless the aesthetic explicitly owns paper. Tint neutrals toward the real brand hue or stay chroma-0; carry warmth through accent, type, or imagery.
- Do not use indigo/blue around hue 250 or warm orange around hue 60 as the only accent without a brand reason. Choose accents that match the subject, theme, or data semantics.
- Cap decorative chrome at about four hue families. Chart series, syntax highlighting, and semantic status colors are exempt.
- Never put mid-gray text on a saturated background. Use the ink color at reduced alpha or a shade of the background hue.
- Verify body-text contrast at 4.5:1 or better, and large/bold text at 3:1 or better, against the real rendered background in both themes.
- Never encode meaning by color alone. Add a label, icon, shape, or texture; avoid legends made only of bare swatches.

### Backgrounds & Effects

- Do not use full-bleed violet-to-blue/cyan or purple-to-pink gradient washes as backgrounds. Use a solid brand color, a real image/chart, or an intentional non-default multi-stop gradient.
- Do not add ambient decorative layers such as blurred gradient orbs, particle canvases, floating dot grids, or multiple radial glows. Tie atmosphere to real content, once and restrained.
- Do not use gradient text on headings. Use actual type scale, weight, layout, and color contrast.
- Do not use glassmorphism (`backdrop-blur` plus translucent surface) as the default card/nav/modal treatment. Reserve one frosted moment over real imagery; otherwise use opaque surfaces with a hairline or shadow.
- Do not use animated glowing box-shadows or pulsing/breathing effects on static content. Use entrance reveals, hover feedback, or user-initiated transitions only.
- Do not use a colored one-sided `border-left` or `border-right` stripe as a card accent. Use a full hairline border, a background tint, or a leading glyph.
- Do not copy-paste one box-shadow onto every raised element. Use two or three elevation levels tied to importance, or rely on spacing and borders.

### Layout & Structure

- Do not center everything with uniform padding. Build hierarchy with visible differences in scale, alignment, density, and section rhythm.
- Do not style every card identically. Hero, primary, secondary, and reference material need different weight.
- Do not nest a card directly inside another card. Use spacing, a divider, or a subheading for subgrouping.
- Do not box every block by default. Render standalone paragraphs, images, and lone stats as plain flow content.
- Do not stamp out big-number plus small-label stat tiles unless the numbers are real, sourced data. Use narrative cards, tables, or diagrams when the values are illustrative.
- Do not dump a wall of eight or more undifferentiated bullets. Group the content into two to four labeled clusters, a table, or a diagram; flat glossaries and changelogs are exceptions.
- Do not append a tiny lowercase descriptor gloss to every item in a grid/list/catalog (`collapsible data`, `one canvas`, `titled region`).
- Name things once; add a descriptor only when it disambiguates a specific item.
- Derive spacing from one small scale such as `4/8/12/16/24/32/48/64`. Avoid scattered one-off values like `13px`, `17px`, and `22px`.
- Create rhythm: tight spacing within groups, generous spacing between sections.
- Vary section structure to match content type. Do not force a diff, timeline, and comparison into one grid mold. Break the grid once for a deliberate focal point.
- Avoid symmetric layouts where both halves mirror each other without a reason.

### Motion

- Reveal animations must enhance already-visible content. Never default content to `opacity: 0` gated on a JavaScript class; headless, PDF, and PNG exports can ship blank.
- Gate reveals behind CSS scroll timelines or provide reduced-motion and `noscript` fallbacks.
- Do not loop the same fade-and-rise on every section or choreograph header, sections, and footer on load. Pick one hero moment; stagger only siblings within a list.
- Use ease-out quart/quint/expo curves. Do not use bounce or elastic curves, including `cubic-bezier()` control points outside `[0,1]`.
- Animate `transform` and `opacity`, not `width`, `height`, `top`, `left`, or `margin`.
- Keep hover and press feedback at or below 300ms.
- Never write `outline: none` on a focusable element without a `:focus-visible` replacement. Give interactive controls at least a `44px` by `44px` hit area.
- Do not stage a spinner or skeleton in a static artifact that fetches nothing.

### Iconography

- Do not use emoji icons in section headers or inline body bullets. Use styled monospace labels, numbered badges, asymmetric section dividers, or inline SVG that matches the palette.
- Pick one icon system per role and use it uniformly. Do not mix emoji, inline SVG, and unicode glyphs for equivalent items.
- Do not repeat the same icon-in-rounded-box pattern for every section header.

### Copy

- Open with the claim. Cut throat-clearing such as "Here's the thing:", chatbot artifacts such as "Great question!" and "I hope this helps", and significance inflation such as "stands as a testament to".
- Do not let a heading restate its own next sentence. The first sentence after a heading must add a fact, number, or mechanism.
- Do not repeat a point across sections. Say it once in the strongest place.
- Define load-bearing jargon on first use.
- Keep one capitalization convention per heading level.
- Use zero or one em dash per section. Avoid colon-before-dramatic-reveal and manufactured "not just X, it's Y" parallelism.
- Run `/unslop` on drafted copy when available. If it is unavailable, apply the rubric in `./scripts/verify/rubrics/pass-copy.md` before writing prose into HTML.
- Code blocks should use a simple header with filename or language label, never three-dot window chrome.

### The Slop Test

Before delivering, apply this test: **Would a developer looking at this page immediately think "AI generated this"?** The telltale signs:

1. Inter or Roboto font with purple/violet gradient accents
2. Every heading has `background-clip: text` gradient
3. Emoji icons leading every section
4. Glowing cards with animated shadows
5. Cyan-magenta-pink color scheme on dark background
6. Perfectly uniform card grid with no visual hierarchy
7. Three-dot code block chrome

If two or more of these are present, the page is slop. Regenerate with a different aesthetic direction — Editorial, Blueprint, Paper/ink, or a specific IDE theme. These constrained aesthetics are harder to mess up because they have specific visual requirements that prevent defaulting to generic patterns.

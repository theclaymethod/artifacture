# Template Status Ledger

The `frozen-reference` templates predate the current 207-check verifier and ALL fail it (verified 2026-07-06 with `scripts/verify/ve-verify.mjs`). They are kept as historical reference for hand-authoring patterns only — do NOT copy them as-is. New work goes through the MDX pipeline (SKILL.md Tier 0), and hand-authored output must pass ve-verify regardless. Deletion candidates are tracked by the Consumer column; removal is a maintainer decision.

| Template | Status | Consumer | Verified |
|---|---|---|---|
| architecture.html | frozen-reference | references/poster.md, references/legacy-html.md | FAIL — contrast, overflow-clip, callout roles |
| data-table.html | frozen-reference | references/poster.md, references/legacy-html.md | FAIL — contrast, overflow-clip |
| hyperframes-longform.html | active | references/hyperframes.md, references/legacy-html.md, commands/generate-video.md, commands/render-video.md | not gated (active authoring path) |
| hyperframes-reel-landscape.html | active | references/reel-patterns.md, references/legacy-html.md, commands/generate-video.md | not gated (active authoring path) |
| hyperframes-reel.html | active | references/hyperframes.md, references/reel-patterns.md, references/legacy-html.md, commands/generate-video.md | not gated (active authoring path) |
| mermaid-flowchart.html | frozen-reference | references/poster.md, references/components.md, references/css-patterns.md, references/diagrams-svg.md, references/legacy-html.md | FAIL — overflow-clip, flex shrink refusal |
| mono-industrial-magazine.html | frozen-reference | references/legacy-html.md | FAIL — theme, type budget, motion, hue leak |
| mono-industrial-poster.tsx | active | references/poster.md, commands/generate-poster.md | not gated (active authoring path) |
| mono-industrial-slides.html | frozen-reference | references/poster.md, references/mono-industrial.md, references/legacy-html.md | FAIL — theme, type budget, motion, text size |
| mono-industrial.html | frozen-reference | references/poster.md, references/components.md, references/mono-industrial.md, references/legacy-html.md | FAIL — type budget, hue leak, theme override |
| nothing-magazine.html | active | references/nothing.md, references/legacy-html.md | not gated (active authoring path) |
| nothing.html | active | references/nothing.md, references/legacy-html.md | not gated (active authoring path) |
| slide-deck.html | frozen-reference | references/legacy-html.md | FAIL — 12 errors: theme, runtime, contrast |
| svg-diagram-starter.html | frozen-reference | references/legacy-html.md | FAIL — grid, accent count, label masking |

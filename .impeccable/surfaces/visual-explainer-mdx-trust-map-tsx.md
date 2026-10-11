---
version: 1
slug: "visual-explainer-mdx-trust-map-tsx"
primary_target: "visual-explainer-mdx/trust-map.tsx"
related_targets: []
---

# Trust-map explainer (understando PR explainer)

Scope: the default look of trust-map explainers in visual-explainer (ExplainerShell with chapterNav, the trust-map components). Mode: Read.
Audience: a developer new to the PR, and readers outside the team. Job: understand what changed and how it works, then judge how far to trust it. Constraints: data comes only from derived values; no page CSS; no-JS pre-render readable; ISO host palette kept so decks, posters and charts do not change.

## Direction contract
THESIS: A field guide to one PR. Each level is a question heading with a plain-words answer first, then a figure, then detail behind labelled openers. It refuses the audit dashboard: stacked pills, rules and amber paragraphs at one density.
OWN-WORLD: ISO host kept (white or near-black ground, Inter, one cyan accent for the current thing). New: one 4px-based spacing scale; a 17px reading column capped near 66 characters; two weights (400, 600); quiet light code plates in light mode; one mark language (check, half, warning, cross glyphs in tone pills) shared by verdicts, bars and control results; countable square marks for every "N of M".
STORY: A guided review. The reader sees what the PR does and the merge state with its progress, then the problem and the change, one finding through the numbered stations, the chapters of the change with their flags, how to read the evidence, the checks, a short self-check, the checklist with their own calls, and the verdict.
FIRST VIEWPORT: Title and one-line summary; the plain-words lead; the merge state panel ("Not ready: N things to review", the reviewed squares, the riskiest three, the ways in). Chapter rail left at 1200px and up with the "you are here" marker; sticky top bar below.
FORM: field guide with numbered stations (own list position 4), fused with the question ladder (5) and the textbook chapter lead (1). Seed key 15e18c7c.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

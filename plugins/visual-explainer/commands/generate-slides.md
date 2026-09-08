---
description: Generate an editable HTML slide deck or horizontal magazine
argument-hint: "<topic or source> [--magazine] [--poster-export] [--pdf] [--no-ask]"
---
Load `SKILL.md` and `cards/slide-deck.md`, then present: $@
Slides are opt-in: generate them only when requested or when this command is invoked.

## Compose

1. Establish the audience, central claim, and source evidence. Use available context and defaults; consult `references/clarify.md` only for a material unresolved choice.
2. Plan a sequence in which each slide advances the argument. Start with the conclusion or question, supply evidence, and end with the decision or action the brief requires.
3. Use `SlideDeck` and `Slide`. Default to vertical orientation and Lieflat-inspired. Set `orientation="horizontal"` only for `--magazine` or an explicit horizontal-magazine request.
4. Choose composition from the content: comparison, sequence, diagram, data, or focused prose. Preserve reading order and readable labels. Split crowded slides; do not shrink text to fit.

Variation should follow the argument. Do not prescribe dark covers, tint rotation, giant statistics, decorative images, repeated kickers, or a fixed number of card layouts. Use images only when they add evidence or explain something the text cannot.

Read `references/slide-patterns.md` only for custom mechanics, magazine pacing, or export details. Read `references/deck-navigation-shell.md` for bespoke fixed-stage navigation and drill-downs.

## Deliver

Author MDX/TSX beside `~/.agent/diagrams/<slug>.html` (`<slug>-magazine.html` in magazine mode), export, and complete `references/verification.md`. Open the result and report source, HTML, final report, and any incomplete output.

- `--poster-export`: also export individual slides as PNGs using `references/poster.md` → "Slide decks as per-slide posters". Use browser capture or the available `poster` path; report any export that cannot be completed. Save to `~/.agent/diagrams/<slug>/slides/`.
- `--pdf`: use `node <skill-dir>/scripts/export-slides-pdf.mjs <input.html> <output.pdf>`. The exporter captures each slide separately. It requires Playwright and Chromium; see `references/slide-patterns.md` → "PDF export" for setup and flags. Report missing dependencies instead of silently dropping the PDF.
- `--no-ask`: use the request and documented defaults without optional clarification.

---
description: Generate a magazine-quality slide deck as a self-contained HTML page. Vertical (default) or --magazine horizontal.
argument-hint: "<topic or source> [--magazine] [--poster-export] [--pdf] [--no-ask]"
---
Read cards/slide-deck.md.

Load the visual-explainer skill, then generate a slide deck for: $@

**Authoring contract.** Prefer the MDX/React pipeline. Write the editable source as `.mdx` by default, or `.tsx` when the deck needs heavier state, custom generated SVG, or bespoke interaction. Use shared components from `visual-explainer-mdx/components.tsx`, especially `SlideDeck` and `Slide`, and export the generated standalone HTML with:

```bash
npm run ve:export -- <source.mdx> --out ~/.agent/diagrams/<slug>.html
```

The generated HTML is the artifact, not the source of truth. If a revision is needed, edit the MDX/TSX source and re-export. The legacy HTML templates below are reference material for layout, pacing, and aesthetic conventions; do not hand-write final HTML unless the MDX/React path is blocked and you explicitly report that fallback.

Follow the visual-explainer skill workflow and the card. Escalate to `./references/slide-patterns.md` only for custom deck mechanics, magazine-specific pacing, or poster/PDF export details; use `./references/legacy-html.md` only if the MDX/React deck path is blocked.

**Slide output is always opt-in.** Only generate slides when this command is invoked or the user explicitly asks for a slide deck or magazine.

**Orientation — vertical vs horizontal (magazine).** Slides can be authored in two orientations:

- **Vertical (default)** — scroll-snap-type: y mandatory. Each slide is 100dvh. Deck feels like a presentation. Good for plans, reviews, recaps, any sequence where the user progresses one slide at a time.
- **Horizontal (`--magazine`)** — scroll-snap-type: x mandatory. Each page is 100vw × 100vh. Deck feels like a print zine. Good for editorial narratives, brand pieces, year-in-review content, longer 12–30 page arcs. Nav dots at bottom, arrow-key + swipe support, dark cover + dark back cover + ≥ 1 interior dark panel, different tint per interior page (tint ramp adapts to active aesthetic — see `./references/diagram-tokens.md`), at least one full-bleed stat page with 100px+ anchor.

If the user hasn't specified and the content is ambiguous (could work as either), ask via AskUserQuestion: "Vertical slide deck, horizontal magazine, or video (MP4)?" See `./references/clarify.md` for the tiered ask policy — slides are a high-cost command and benefit from confirmation.

**Aesthetic.** Pick from the 4 slide presets in slide-patterns.md (Midnight Editorial, Warm Signal, Terminal Mono, Swiss Clean) or use the default Mono-Industrial. Vary from previous decks. Commit to one direction and carry it through every slide.

**Narrative structure.** Slides have a temporal dimension — compose a story arc, not a list of sections. Start with impact (title/cover), build context, deep dive (content, diagrams, data), resolve (summary/next steps/back cover). Plan the sequence and assign a layout per slide before writing HTML.

**Visual richness.** Proactively reach for visuals. If `surf` CLI is available (`which surf`), generate images for title/cover backgrounds and full-bleed pages via `surf gemini --generate-image`. Add SVG decorative accents, inline sparklines, mini-charts, and small diagrams (use inline SVG per `./references/diagrams-svg.md`, or Mermaid as fallback). Visual-first, text-second.

**Compositional variety.** Consecutive slides must vary their spatial approach — centered, left-heavy, right-heavy, split, edge-aligned, full-bleed, quadrant, grid. Three centered slides in a row means push one off-axis. For magazine mode specifically: dark panels interrupt tint rotation; full-bleed stat pages land roughly every 4–6 pages, never back-to-back.

**Magazine-specific rules (when `--magazine` is passed).**
- Use the MDX/React deck primitive with `<SlideDeck orientation="horizontal">` unless a blocker forces a reported fallback.
- Cover page is dark. Back cover is dark. At least one interior dark panel (≥ 3 dark pages total).
- Every interior page uses a different tint from the active aesthetic's tint ramp; never repeat consecutively.
- At least one full-bleed stat page with the primary number rendered at 100px+ (`clamp(160px, 22vw, 360px)`).
- Layouts available: title cover, content, split (left/right color-block), quadrant (2×2), full-bleed stat, dark panel, color block, viewport-filling grid (3×2 or 4×3).
- Nav chrome: dot strip at bottom, arrow-key support, page counter top-right.
- The horizontal-snap engine replaces the vertical engine — don't mix.

Write source to a sibling `.mdx` or `.tsx` file when practical, then write generated HTML to `~/.agent/diagrams/<slug>.html` (or `<slug>-magazine.html` for `--magazine`) and open the result in the browser.

**`--poster-export` flag (optional).** If the user passes this flag, after producing the interactive HTML deck/magazine, also render each slide/page to its own fixed-canvas PNG via `poster-ai`. Check `which poster`; skip the export silently if unavailable. Write per-slide PNGs to `~/.agent/diagrams/<deck-name>/slides/` at 1920×1080 (or 1080×1920 for a vertical-stat magazine page). See `./references/poster.md` → "Slide decks as per-slide posters" for the workflow. The interactive HTML remains canonical; PNGs are a secondary artifact for sharing.

**`--pdf` flag (optional).** After producing the interactive HTML deck/magazine, also render a multi-page landscape PDF (one slide/page per PDF page, 1920×1080) using the bundled Playwright-based exporter:

```bash
node <skill-dir>/scripts/export-slides-pdf.mjs <input.html> <output.pdf>
```

The script auto-detects the mode (slides vs magazine) from the DOM, screenshots each slide individually, and composites them so scroll-snap pagination quirks and live zoom/scroll state don't leak into the output. Requires `playwright` installed and a Chromium binary — install once per project directory via `npm install playwright && npx playwright install chromium`. If Playwright is unavailable, skip the export with a note to the user and deliver only the HTML. Write PDFs to `~/.agent/diagrams/<deck-name>.pdf` alongside the HTML. See `./references/slide-patterns.md` → "PDF export" for the full contract, flag list, and troubleshooting.

**`--no-ask` flag.** Skip AskUserQuestion. Use the user's request verbatim + defaults.

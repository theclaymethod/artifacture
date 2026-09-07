# Custom slide and magazine patterns

Read this for mechanics beyond `SlideDeck` and `Slide`. Ordinary decks use [the slide card](../cards/slide-deck.md). The runtime components and [slide-deck.html](../templates/slide-deck.html) are the implementation references; do not maintain a second copy of their engine in generated source.

## Plan from the source

1. Inventory requested claims, decisions, comparisons, examples, and qualifications.
2. Map each material item to a slide or a deliberate detail state. Preserve the requested depth; record any omission.
3. Choose each layout from its information: a comparison needs aligned counterparts, a sequence needs order, and a diagram needs routing space.
4. Check the sequence before authoring. A reader should reconstruct the argument without the original document.

The source determines the slide count. Do not require a divider for every section, a statistic every few slides, generated cover imagery, or a fixed rhythm of dark pages.

## Composition and typography

Use the `lieflat` preset by default. Named alternatives may change the palette and typography; they do not change readability or factual standards. Keep titles descriptive, body copy direct, and supporting evidence near the claim.

| Content | Starting treatment |
|---|---|
| Opening | A clear conclusion or question with enough context to orient the reader |
| Comparison | Aligned sides with matching terms, scales, and units |
| Sequence | A small number of ordered steps; split when labels compete |
| Diagram | A large readable figure; supporting detail belongs in a separate view |
| Data | One useful comparison, honest axes, directly labeled values |
| Code | A focused snippet and its behavioral consequence |
| Quote | Verbatim attributed evidence, when it adds something the summary cannot |
| Closing | The requested decision, implication, or action |

Start headings around 32–48px, body copy 22–28px, and figure labels 18–24px on a presentation canvas. At the displayed size, body text must remain at least 16px and figure labels at least 14px; projected work needs larger type. Adjust composition or split content before reducing type. Preserve paragraph line height and comfortable measure.

Use open space and alignment before containers. Remove decorative numbering, kickers, badges, metric tiles, redundant captions, and corner labels. Navigation, sources, real state, and required notices may remain when they help the reader. Do not hide material qualifications merely because they look like metadata.

## Fixed-stage mechanics

For bespoke 1920×1080 decks, use [deck-navigation-shell.md](deck-navigation-shell.md). Keep stage coordinates stable and verify every drill-down or progressive state with its paired base frame. Export and screenshots must show the same production state.

For viewport decks, preserve these contracts:

- Vertical mode uses a `100dvh` scroll container and one slide per snap position. Horizontal magazine mode uses a width-constrained container with `overflow-x: auto`, `scroll-snap-type: x mandatory`, and pages with `flex: 0 0 100%`.
- One navigation system owns active-page state. Keep keyboard, pointer, and touch behavior consistent; do not handle navigation keys inside inputs or dialogs.
- Controls have visible focus and at least 44px touch targets. Expose names and current position to assistive technology. Avoid repeated hint bars once the controls explain themselves.
- The page root never scrolls sideways. Wide figures scroll inside their bounded surface. On small screens, reflow content or use the runtime's deliberate stage scaling without making the first view unreadable.
- Content renders visibly before JavaScript. Motion is optional; reduced-motion, print, and exported states show the complete meaning.

Read [responsive-contract.md](responsive-contract.md) for containment and only the required section of [css-patterns.md](css-patterns.md) for custom CSS.

## Diagrams, charts, and imagery

Use [web-diagram.md](../cards/web-diagram.md) for `DiagramCanvas`, Archify, or specialized SVG. Use [charts.md](charts.md) for quantitative data. Never squeeze a whole architecture into a slide thumbnail; preserve an overview and put detailed paths in separate views.

Images must explain the subject or supply evidence. Use [media.md](media.md) when needed. Flat backgrounds are the default; there is no fallback requirement for gradients or decorative SVG when images are absent.

## Magazine mode (horizontal)

Use `orientation="horizontal"` only for an explicit magazine request or `--magazine`. Keep the content sequence readable as pages. Preserve a clear current-page indicator and previous/next navigation.

Covers, interior pages, and ending pages share one visual language. A dark page, split layout, full-width image, or large number is optional and must serve the argument. Do not rotate tints, require three dark pages, force a full-bleed statistic, or fill the viewport with unrelated tiles.

On narrow screens, preserve readable text, complete comparisons, and reachable controls. Inspect first, middle, final, and expanded states; verify every page after export.

## Verification

Follow [verification.md](verification.md), including ordered screenshot pairs for base-to-detail states and adjacent slides. Verify factual coverage, readable text, purposeful composition, complete diagrams, and functional navigation. Fix the source, re-export, and recapture affected pairs after changes.

## PDF Export

Any slide deck or magazine can be exported to a multi-page PDF via `scripts/export-slides-pdf.mjs`. The HTML remains canonical; the PDF is a secondary artifact for email, print, or offline review. Triggered by the `--pdf` flag on `/generate-slides` — run after the HTML is written and opened.

```bash
node <skill-dir>/scripts/export-slides-pdf.mjs <input.html> <output.pdf>
```

### What the script does

1. **Auto-detects mode** from the DOM: `.slide` → vertical deck, `.page` + horizontal scroll-snap → magazine, neither → flow-paginated long page.
2. **Hides interactive chrome** — theme toggle, progress bar, nav dots, zoom controls, scroll-to-navigate hint, page counter, and any other `position: fixed` helpers. All of it is useful on screen, noise on paper.
3. **Neutralizes live state** — resets Mermaid zoom, forces diagrams to fill their wrapper, unwraps any transform applied by pan/zoom controllers.
4. **Screenshots each slide individually** at the configured page size (default 1920×1080), then composites the PNGs into a PDF with a hard page break between each. This bypasses Chromium's scroll-snap + `break-after: page` pagination quirks (trailing blank pages, content bleed across boundaries, fixed chrome repeating on every page).
5. **Writes a landscape PDF** with zero margins and `printBackground: true` so dark backgrounds survive.

### Flags

| Flag | Default | Meaning |
|---|---|---|
| `--mode=slides\|magazine\|scroll` | auto-detect | Explicit override. `scroll` uses flow-based pagination for long scrollable pages (architecture, project-recap) instead of per-element screenshots. |
| `--orientation=landscape\|portrait` | landscape for slides/magazine, portrait for scroll | Page orientation. |
| `--width=<px>` / `--height=<px>` | 1920 × 1080 landscape, 1080 × 1920 portrait | Override dimensions — useful for 9:16 reel-shaped stat decks or custom paper sizes. |
| `--selector=<css>` | `.slide` for slides, `.page` for magazine | Override the per-page selector if a custom template uses different class names. |

### Prerequisites

Playwright + a Chromium build. Install once per project directory:

```bash
npm install playwright
npx playwright install chromium
```

If `playwright` isn't available, skip the PDF export with a note to the user and deliver only the HTML. Don't add it to the skill as a hard dependency — the PDF is always opt-in.

### Why screenshot-and-composite, not browser Print-to-PDF

Chromium's native `page.pdf()` is the obvious first attempt. It reliably fails on scroll-snap slide decks for four reasons that interact:

- **Trailing blank page.** `break-after: page` on the last slide creates an extra empty page because Chromium forces the break even without content after it. `:last-child { break-after: avoid }` misses when the slide isn't literally the last child of its parent (trailing whitespace nodes, sibling nav elements, etc.).
- **Fixed chrome repeats.** Theme toggles and progress bars set to `position: fixed` render on *every* printed page. Hiding them via `@media print` works but requires knowing every class name in every template.
- **Flex-centered Mermaid collapses.** `.mermaid-wrap { display: flex; justify-content: center }` computes the flex item's main-size from the SVG's intrinsic width in print layout, so diagrams that filled the slide on screen shrink to their authored Mermaid dimensions (often ~270px wide).
- **Live zoom state leaks.** Pan/zoom controllers set `transform: translate(...)` or `style.zoom` on the diagram wrapper. That state persists into the print render.

Per-slide screenshots capture the live view exactly as the author intended, so none of those failure modes apply. The tradeoff is file size — a 10-slide deck at 1920×1080 renders to ~1 MB instead of ~175 KB — which is acceptable for presentations and still small enough to email.

### Troubleshooting

| Symptom | Fix |
|---|---|
| PDF has extra blank page(s) at the end | Check that `--mode` was auto-detected correctly; wrong selector produces no matches and the script composites zero pages. |
| Slides render at wrong aspect ratio | Viewport didn't match page size. The script sets both to the same dimensions — confirm `--width` and `--height` match the slide's intended aspect. |
| Chart.js canvas appears blank | The canvas-to-image shim runs at `load + 1200ms`; increase `data-pdf-ready` wait if the chart has a longer animation (edit the script or accept the delay). |
| Interactive toggle still visible | Template uses a class name not in the chrome hide list. Add it via `el.style.display = 'none'` before the export, or extend the script's `chromeSelectors` array. |
| Mermaid rendered at authored size, not full-slide | Zoom/transform wasn't neutralized; check the script's surgery block still runs before screenshots (look for the `.mermaid-wrap` override). |

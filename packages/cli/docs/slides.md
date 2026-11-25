# Slides Surface (Stock @open-slide/core)

Artifacture v2 never forks `@open-slide/core`. Run decks directly with stock commands:

```bash
pnpm dev      # open-slide dev
pnpm build    # open-slide build
```

Patterns:
- Import `@artifacture/themes/tokens.css` and `@artifacture/kit/styles.css` in the deck entry.
- Wrap WebGPU backdrops in `<GpuMorphCanvas stageId="..." scene={...} stillSrc={...} />`.
- Supply a Dawn-rendered `stillSrc` PNG so `ThumbnailRail` (`[data-osd-freeze-motion]`), print PDF (`#os-print-root`), PPTX capture, and `prefers-reduced-motion` render deterministically without duplicating GPU devices.
- Validate semantic slide payloads via `validateSlideSpec` (`case`, `comparison`, `process`, `decision`).
- Keep `@artifacture/*` marked `"injected": true` in workspace `package.json` `dependenciesMeta` so `open-slide`'s Vite `server.fs.allow` guard permits workspace imports cleanly.

## Standalone HTML/SVG Slide Decks

For self-contained single-file HTML/SVG technical presentations (outside `@open-slide/core`), verify statically and visually in headless Chromium before finishing:

```bash
artifacture check path/to/index.html
artifacture review path/to/index.html --surface html-slides --viewport 1280x720 --all --no-webgpu
```

`artifacture check` validates inline `<script>` syntax, catches invalid HTML tags nested inside `<svg>` (e.g. `<code>` outside `<foreignObject>`), and scans for placeholders. `artifacture review --surface html-slides` steps every slide at the target viewport, audits HTML and inline SVG geometry (`viewport-clip`, `html-nav-overlap`, `svg-text-overlap`, `svg-box-overflow`, `svg-edge-clip`, `svg-undersized-text`), and emits per-slide PNGs plus a contact sheet.

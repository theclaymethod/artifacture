# Poster output

Use fixed-canvas output when the user requests a poster, social image, infographic, or individual slide image. Responsive pages remain the normal reading format. Keep editable TSX and deliver HTML plus the requested raster output.

Default to `lieflat`; [Algebrica](algebrica.md) and [Mono Color](mono-color.md) are available when requested. Typography, palette, and composition follow the selected preset. A focal statistic, metadata strip, or display-font effect is never required.

## Select the renderer

Prefer `PosterCanvas` with shared components, export through `npm run ve:export`, then capture the settled canvas using browser screenshot tooling. For `poster-ai`, check `which poster`; use that path only when available. If both paths are blocked, report the missing capability and retain the source.

The `poster` CLI takes TSX and bundles a self-contained HTML page or rasterized output:

```bash
poster build entry.tsx -o out.html
poster export entry.tsx -o out.png
poster export entry.tsx -o out.svg
poster export entry.tsx -o out.pdf
poster export entry.tsx -o out.jpg
poster export entry.tsx -o out.webp
poster build entry.tsx -o out.html --json --quiet
```

Read the installed CLI help before using version-dependent flags. The [poster-ai project](https://github.com/Michaelliv/poster) is the upstream implementation reference.

## Canvas and source

| Purpose | Starting size |
|---|---|
| Landscape poster / architecture | 1600×1000 |
| Portrait reading or data story | 1200×1500 |
| Presentation slide | 1920×1080 |
| Social card | 1200×628 |
| Square | 1080×1080 |

Honor the requested aspect ratio. For poster-ai, use a single root element with explicit width and height; a Fragment has no measurable canvas. Load only the selected fonts and bundle local assets at build time. No runtime filesystem access is available.

Use deterministic SVG or settled shared charts for data. Do not depend on Mermaid's asynchronous render during rasterization: prerender its SVG or use another supported diagram route. Keep labels readable at the final display size, with at least 14px figure labels and 16px body text. A large canvas does not justify tiny type when scaled down.

Use [mono-industrial-poster.tsx](../templates/mono-industrial-poster.tsx) only as a poster-ai mechanics reference. Shared preset tokens, rather than that template's historical palette, govern new work.

## Slide decks as per-slide posters

Produce the interactive HTML deck first. For a requested PNG export:

1. Capture each settled production slide at the requested dimensions, or author one TSX entry per slide for poster-ai.
2. For poster-ai, run `poster export <slide>.tsx -o <slide>.png` for each entry.
3. Inspect every PNG and save to `~/.agent/diagrams/<deck-name>/slides/`.
4. Return the interactive HTML and slide-image directory. Report missing exports explicitly.

## Embedded graphics

Use a raster graphic inside a page only when it explains content better than native, accessible markup. Preserve a useful alternative description and link its data or source when needed. Keep local assets embedded for self-containment. Follow [media.md](media.md) for optional illustrations and capture.

## Canvas-fit verification loop

After every export, inspect the PNG itself. The live page can overflow beyond a canvas while the raster silently clips it.

1. Check all edges for clipped text, shapes, arrows, and footnotes.
2. Confirm that the main claim, figure, units, and qualifications remain readable at intended display size.
3. Check that unexpected empty space is not a collapsed layout and that color communicates only supported meaning.
4. Compare figures and values against source evidence.

Repair the source: remove redundant copy, wrap labels, rebalance space, or split the content. Do not shrink below the readability floor or silently change the requested aspect ratio. Re-export and inspect again; stop after three unsuccessful rounds and report the specific remaining defect.

Complete [verification.md](verification.md) for HTML mechanics and artifact review. Return TSX, HTML, PNG, final report, and any incomplete check. Use `.poster.` in output names, such as `<slug>.poster.tsx`, `<slug>.poster.html`, and `<slug>.poster.png`.

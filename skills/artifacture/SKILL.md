---
name: artifacture
description: Guide for building and verifying Artifacture v2 slides (stock open-slide or standalone HTML/SVG decks), MDX explainers, deterministic video compositions, and vgpu WebGPU shaders.
---

# Artifacture v2 Router

1. **Discover packages and docs offline** before authoring:
   - `artifacture list` / `artifacture info <block-or-theme>`
   - `artifacture docs <overview|slides|explainer|video|gpu|playground>`
   - `artifacture init <slides|explainer|video> [dir]`
2. **Slides (`templates/slides`)**:
   - Stay on stock `@open-slide/core` (`open-slide dev`, `open-slide build`); never fork it.
   - Keep `@artifacture/*` injected in `dependenciesMeta` so `open-slide`'s Vite filesystem allowlist resolves workspace builds cleanly.
   - Always supply a Dawn `stillSrc` PNG to `<GpuMorphCanvas>` for thumbnails, print, and PPTX.
3. **Standalone HTML/SVG decks & technical diagrams**:
   - Ground every metric, equation, and file size in a single authoritative source (never trust stale prose comments when metadata/code differs).
   - Prefer procedural / formula-plotted SVG paths and point clouds over hand-estimated coordinates; never nest HTML tags (`<code>`, `<div>`, `<span>`) inside `<svg>` without `<foreignObject>`.
   - Keep standalone decks self-contained (inline CSS/SVG/JS, zero external font/CDN fetches) and support `?slide=N`, `#slide-N`, and `ArrowLeft`/`ArrowRight` navigation cleanly within the target viewport (e.g. `1280×720`) with clear clearance above any fixed/absolute `<nav>` or footer bar.
4. **Explainers (`templates/explainer`)**:
   - Load `@artifacture/themes/tokens.css` and `@artifacture/kit/styles.css`; import `.wgsl` files with `wgslVitePlugin()`.
   - Run `artifacture stills .` before singlefile builds (`pnpm run build:singlefile`).
5. **Video (`templates/video`)**:
   - Drive every animated uniform and DOM overlay from `seconds` and `window.__seek(seconds)` (`Date.now()` and unseeded randomness are forbidden).
6. **Mandatory verification gate before declaring done** (never declare HTML/SVG slides or UI work done from mental pixel math alone):
   - `artifacture check <dir-or-html-file>` — Dawn WGSL validation, semantic slide validation, standalone HTML/SVG hygiene (invalid SVG-nested tags, inline `<script>` syntax), and placeholder scan.
   - `artifacture review <url-or-html-file> --surface <slides|html-slides|explainer|video> [--viewport 1280x720] --all [--no-webgpu]` — real Chromium render, stage & SVG geometry audit (`overflow-x`, `clipped-y`, `viewport-clip`, `html-nav-overlap`, `svg-text-overlap`, `svg-box-overflow`, `svg-edge-clip`, `svg-undersized-text`), and visual inspection (`read_file` on captured PNGs).
   - For video, verify `render:dawn` (`pixelmatch` rewind diff `=== 0` across `0 -> 1.5 -> 0`).
7. **Playground vs Core boundary**:
   - Keep experimental visual treatments in `clayton-portfolio`; follow `docs/playground-blocks-contract.md`.

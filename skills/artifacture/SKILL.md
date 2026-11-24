---
name: artifacture
description: Guide for building and verifying Artifacture v2 slides (stock open-slide), MDX explainers, deterministic video compositions, and vgpu WebGPU shaders.
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
3. **Explainers (`templates/explainer`)**:
   - Load `@artifacture/themes/tokens.css` and `@artifacture/kit/styles.css`; import `.wgsl` files with `wgslVitePlugin()`.
   - Run `artifacture stills .` before singlefile builds (`pnpm run build:singlefile`).
4. **Video (`templates/video`)**:
   - Drive every animated uniform and DOM overlay from `seconds` and `window.__seek(seconds)` (`Date.now()` and unseeded randomness are forbidden).
5. **Mandatory verification gate before declaring done**:
   - `artifacture check <dir>` — Dawn WGSL validation, semantic slide validation, placeholder scan.
   - `artifacture review <url> --surface <slides|explainer|video> --all` — Chrome WebGPU check (`--enable-unsafe-webgpu`), stage geometry audit, and PNG inspection (`read_file` on screenshots).
   - For video, verify `render:dawn` (`pixelmatch` rewind diff `=== 0` across `0 -> 1.5 -> 0`).
6. **Playground vs Core boundary**:
   - Keep experimental visual treatments in `clayton-portfolio`; follow `docs/playground-blocks-contract.md`.

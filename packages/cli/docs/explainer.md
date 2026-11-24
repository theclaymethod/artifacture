# Explainer Surface (Vite + MDX)

Explainers combine Markdown prose in `src/content/*.mdx` with interactive `@artifacture/kit` blocks and `@artifacture/gpu` canvases.

- Use `@vgpu/wgsl/loader-vite` (`wgslVitePlugin()`) in `vite.config.ts` to import `.wgsl` files directly into TypeScript modules.
- Load `@artifacture/kit/styles.css` and `@artifacture/themes/tokens.css` inside `src/styles.css`, and scope the page root with `data-ve-theme="iso"` (or `function`, `3b1b`, `algebrica`, `mono-color`).
- Render fallback PNG stills before shipping singlefile builds: `node scripts/render-stills.mjs` or `artifacture stills .`.
- Build options: `vite build` (standard static bundle) and `SINGLEFILE=1 vite build` (self-contained single HTML via `vite-plugin-singlefile`).

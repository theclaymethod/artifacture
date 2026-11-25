# Artifacture v2 — Repository Instructions

## Core Rules
- **No slogans:** Use concrete, factual technical language everywhere (docs, skills, slide copy, code comments).
- **Stock `open-slide` compatibility:** Slide templates and decks must run on stock `@open-slide/core` (`open-slide dev` / `open-slide build`) without custom Vite forks or monkeypatches.
- **Curated core only:** Experimental / expressive blocks (ASCII treatments, VHS, `glass-intro`, `living-forms`, `procedural-props`, `chalkboarding`, `poppy`) belong in Clayton's playground repository (`clayton-portfolio`), never in Artifacture v2 core packages.
- **Decorator gate:** Use calm semantic typography, charts, and diagrams by default. Add GPU (`vgpu`) scenes only when the visual carries a clear structural, spatial, or explanatory job.
- **Explicit CSS in library packages:** `@artifacture/kit` and `@artifacture/themes` must export plain CSS files (`styles.css` / `tokens.css`) rather than relying on consumer Tailwind v4 scanning `node_modules`.
- **Verification discipline:** Verify WebGPU with `--enable-unsafe-webgpu`, non-black pixel variance checks, `vgpu check` on every `.wgsl` shader, and `vgpu/node` (Dawn) deterministic stills. Always inspect captured PNGs visually.

## Enforced Rule Table

| Rule | Enforced By |
| --- | --- |
| Inline SVG diagrams must have zero text overlaps, zero box-spill overflow, and zero viewport-edge clipping | `@artifacture/verify` `auditPageGeometry()` (`packages/verify/src/geometry.ts`) + `pnpm test` (`packages/verify/test/geometry.test.ts`) |
| No stale pre-optimization splat counts or double-play `ageStatic`+`ageRate` slide configs in `playground/splat-vfx` | `SlideFxTiming` discriminated union (`playground/splat-vfx/deck/slides.ts`) + `DECK_STATS` single source of truth + `node playground/splat-vfx/scripts/check-deck-contracts.mjs` |
| Every deployed static asset in `playground/splat-vfx` stays `< 25 MiB` (Cloudflare Workers Static Assets limit) | Hard size guard in `playground/splat-vfx/scripts/build-deck-dist.mjs` |
| Grace Cathedral compression rejects mid-air floaters (`maxScale <= 0.30`, `densityFloor >= 8`) and wormhole avoids `scaleToPortal` `0.14` sky-leak clamp | `node playground/splat-vfx/scripts/check-deck-contracts.mjs` |
| Prefer latest versions per model family when delegating (`gemini-4-hydrogen` over `3.8`, `gpt-6.2-*` over `gpt-6-luna`, never `grok-4.5`) | Agent orchestration rule (judgment call; no repo lint applies to T3 routing) |

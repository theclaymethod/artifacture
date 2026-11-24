# Artifacture v2 — Repository Instructions

## Core Rules
- **No slogans:** Use concrete, factual technical language everywhere (docs, skills, slide copy, code comments).
- **Stock `open-slide` compatibility:** Slide templates and decks must run on stock `@open-slide/core` (`open-slide dev` / `open-slide build`) without custom Vite forks or monkeypatches.
- **Curated core only:** Experimental / expressive blocks (ASCII treatments, VHS, `glass-intro`, `living-forms`, `procedural-props`, `chalkboarding`, `poppy`) belong in Clayton's playground repository (`clayton-portfolio`), never in Artifacture v2 core packages.
- **Decorator gate:** Use calm semantic typography, charts, and diagrams by default. Add GPU (`vgpu`) scenes only when the visual carries a clear structural, spatial, or explanatory job.
- **Explicit CSS in library packages:** `@artifacture/kit` and `@artifacture/themes` must export plain CSS files (`styles.css` / `tokens.css`) rather than relying on consumer Tailwind v4 scanning `node_modules`.
- **Verification discipline:** Verify WebGPU with `--enable-unsafe-webgpu`, non-black pixel variance checks, `vgpu check` on every `.wgsl` shader, and `vgpu/node` (Dawn) deterministic stills. Always inspect captured PNGs visually.

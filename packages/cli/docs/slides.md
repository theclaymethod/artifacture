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

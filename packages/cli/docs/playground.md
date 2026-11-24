# Core vs Playground Boundary

- **Artifacture v2 Core (`@artifacture/kit`, `@artifacture/gpu`)** holds only the curated ~10-block multi-surface core: `LieflatChart`, `DiagramCanvas`, `DagCanvas`, `CodeBlock`, `DiffBlock`, `DecisionMatrix`/`Pipeline`, `DrillCard`/`DrillSheet`, `SemanticSlide`, `GpuCanvas`, and `GpuMorphCanvas`.
- **Playground (`clayton-portfolio`)** owns experimental treatments (`ascii-art`, VHS, `glass-intro`, Effects Lab, living forms, orbital text, procedural props, trace paths, kinetic typography).
- `artifacture playground status` inspects `apps/portfolio/src/lib/playground-blocks.json` (and legacy `artifacture-catalog.json`) in `clayton-portfolio` and checks alignment with `docs/playground-blocks-contract.md`.
- Promotion from playground to Artifacture core requires cross-surface reuse across >=2 surfaces, Dawn WGSL validation + still fallback, and clean Playwright review across geometry and WebGPU checks.

# Template pipeline: first implementation receipt

Candidate: `codex/template-pipeline`, based on merged PR #26 (`f790de7`). This is an unpublished `1.0.0-next.0` implementation slice, not the completed migration.

## Delivered

- Dependency-free CLI for template/reference discovery, selected info, scaffold and minimal entry-skill installation.
- Editable `iso-diagram` (native Hairline) and `custom-slides` (React/MDX/Tailwind/Vite) starters, with actual previews.
- Native FFrames project scaffolding and a story workflow; PR-review and HyperFrames-browser recipes.
- References for ISO Glow, Hairline, iso-figure, Diagram Design, Anatomy, Manim Community, ManimGL, experimental FrankenManim, FFrames and HyperFrames.
- One project-owned browser configuration for dev, build and standalone export. Native package manifests/lockfiles own dependencies; no Artifacture lockfile or cross-renderer compiler.
- Published file allowlist excludes vendor trees, generated gallery copies, evaluator corpora and `runtime.json.gz`. Optional visual/render packages are contributor dev dependencies rather than consumer runtime dependencies.

## Observed checks

- Installed the actual npm tarball in an empty consumer: one package, zero transitive runtime dependencies. The three optional Vite plugin peers remain absent until a browser workspace selects them.
- Archive: 43 entries, 141,661 compressed bytes, 185,858 unpacked bytes, including two PNG previews. This is the first smaller product surface, not a feature-equivalent compression comparison with the old runtime.
- Both browser starters: dependency installation, TypeScript check, Vite build and standalone export succeeded. A missing Vite CSS declaration found in the first probe was corrected.
- Offline Chromium delivery: no page errors; native Hairline SVG visible; custom slides support progressive states, deep links, browser history, focus-safe keyboard navigation and a disclosure. No horizontal overflow at 390px. Reduced-motion mode inspected.
- Edited an MDX module through a workspace-defined Vite alias. HMR displayed the edit; the native `npm run export` command delivered the same edit through the same configuration. A cross-directory programmatic Vite probe failed on macOS path normalization; the supported project-owned native command passed.
- Existing destinations were rejected without changing a sentinel file; dry-run created no directory; a recipe could not be mistaken for a runnable starter. Required references and native-manifest-derived dependency details were checked.
- The native skills CLI installed the selected FFrames skill into the generated project: one skill, four upstream instruction files.
- Entry skill validated and installed as two files. The launcher ran against the candidate checkout using `ARTIFACTURE_REPO`.
- Upstream `cargo-fframes` 1.2.0 generated its own project. Using an existing Rust 1.99 toolchain/cache, the generated native project compiled, inspected 48 sampled frames with zero findings, and rendered a 360-frame, 12-second draft. FFprobe decoded H.264 960x540 plus AAC. This is the upstream multi-scene demonstration, not a newly authored finished explainer. Native compilation reported a macOS linker warning and an upstream future-compatibility warning; rendering succeeded.
- Existing `npm test`: 36 passed, zero failed. The first suite run exposed parallel pre-render exporters racing on a shared Vite cache; a per-export temporary cache fixed the race, and the full suite passed again.
- Root TypeScript, manifest consistency, skill validation, `ve:check`, whitespace checks and lint of new CLI/template code passed. The broader touched-file lint still reports two pre-existing `no-runtime-typeof` findings in PR #26's exporter data parser; confirmed present in base source. `ve:check` also reports existing legacy component-documentation drift as a warning.
- No new test files or test-only fixtures/helpers were created. Runtime/browser probes were inline commands; committed PNGs are catalog previews.

## Remaining release work

Migrate representative Function Intelligence consumers and their rich figure/state/drill contracts. Expand the runnable catalog to the selected existing diagram/slide/video families. Refresh native rendering recipes with real authored examples and narration. Replace legacy plugin distribution, then delete old primitive/runtime implementations after their callers migrate. The old source exporters remain available in the contributor checkout during this work; the new npm package excludes them.

The primary dirty checkout was preserved. The approved plan was synchronized there; implementation lives in the isolated worktree. Nothing was published or pushed.

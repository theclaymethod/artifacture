# End-to-end verification and primitive discovery

Work performed on 2026-10-04. This receipt supersedes the earlier test-suite count in [component workspaces](component-workspaces.md). Combined verification and film encoding are complete.

## Test reduction

Removed 19 files containing internal-function, mocked, or source-text tests. Also removed the internal-helper design-system eval runner. Deleted files' preexisting uncommitted changes were saved in the local investigation before removal; tracked originals remain recoverable through Git.

Seven existing verification files remain. `npm test` delegates to `test:e2e`; no new test files, saved test helpers, or fixtures were added. The retained flows exercise public CLI commands, real exported pages, preview HTTP mutations and browser editing, browser-rendered evidence, finalization, PDF output, and source-copy consumer workspaces. Presentation navigation, layout, and theme behavior remain in `ve:eval-presentation`. Removed helper branch coverage is not claimed to be equivalent to these user journeys.

The obsolete visual-policy unit-test command was removed. Measured model qualification, manifest checks, type checking, production validation, and release audits remain. The real `ve:learn` → export → browser journey replaces the removed helper-based design-system runner.

## Agent index

[One registry](../../scripts/components/registry.mjs) owns discovery and copy membership. The initial eight bundles have been expanded to 32 installation entries. `artifacture list --json` includes capabilities, primitives, reuse levels, delivery formats, public module exports and types, supported variants, limits, example paths, transitive files, package requirements, stylesheets, and an exact add command. Existing JSON fields remain available.

`list --query` searches all supplied words, case-insensitively, across positive capabilities, API names, primitives, and delivery information. `circle` finds graphics, `focus` finds motion, and `threads` finds charts. Future capabilities such as springs are not advertised as shipped. Default imports are relative to `src`; file destinations are relative to the configured component directory.

Generated workspace README and AGENTS instructions teach discover → inspect → copy → compose. Geometry stays below composition, slides, and video. The index states the prepared-path Hairline boundary, illustration-only translation, path-only reveal, and single-host video runtime. Interactive charts still require a separate authored transition adapter; numeric plot and scalar-grid scenes now provide a route for sampled output.

The existing production audit now also rejects indexed modules that are not copied, missing named exports, and missing example files. Direct in-memory negative probes rejected all three drift cases, then passed after restoration. The audit runs in `prepack` and `ve:check`.

## Initial verification before catalog expansion

- `npm run check` passed in **115.24 seconds**, below the unchanged 120-second budget. It includes **24 Node end-to-end tests**, zero failures/skips, **24 presentation browser checks**, and the seeded verifier corpus.
- Lint, strict TypeScript, manifest consistency, and the eight-block release audit passed.
- `ve:check` exported and checked the current examples, static video, bundled video, and mathematical video.
- `ve:eval` passed 153 seeded violations and seven clean fixtures through the verifier CLI.
- Normal `npm pack` passed the release audit. Its unpacked CLI discovered `focus` and created an agent-ready workspace when invoked from `/private/tmp`.
- The CI source-copy journey builds copied modules with the repository dependency runtime, disclosed in TAP diagnostics. The earlier independent packed consumer installed its own dependencies; that prior result is recorded in the linked scaffold receipt.

## Primitives film

The rendered film is `/Users/claytonkim/.agent/videos/artifacture-primitives-tour-2026-10-04/video.mp4`. It is **107.4 seconds**, **1920×1080 at 30 fps**, H.264 video with **48 kHz stereo AAC**, 4,823,873 bytes. Root independently probed the encoded file and inspected its decoded 3b1b and ending frames, alongside the contact sheet and full-resolution chart frame.

The tour covers six graphic primitive kinds, prepared Hairline solids, routed diagrams, opacity/reveal/highlight/illustration translation, five actual chart encodings, independent composition, all four retained themes, and delivery through slides/video. Ainthony narration was generated locally. Browser evidence records 20 forward/backward repeated frame comparisons without errors.

Chart panels in the film are frozen captures of the actual React components. They do not establish a chart-to-scene or authored-clock adapter; that is a prioritized candidate in the research. The film has an authored landscape layout. Its player can scale on narrow screens, but a separate portrait composition was not produced.

## Expanded catalog and source-tooling verification

The [catalog](../component-catalog.md) now documents 32 copy boundaries and the [real component preview](../../examples/visual-explainer-mdx/component-catalog.tsx) renders 33 examples. The retained themes share geometry. Existing React diagram, chart, code and content components were extracted into leaves with scoped CSS; redundant copies of those rules were removed from `global.css`. Broad imports preserve their existing re-exports. New sequence/state/containment/plot/token/event/grid builders return the existing validated `GraphicScene`; ordered reveal/focus helpers return existing finite motion data.

The existing copied-consumer E2E was extended, without adding test files. It compiles copied leaves, inspects themed previews, interaction and backward seeking at wide/narrow sizes, and rejects conflicting consumer edits. API discovery reports actual named variants, APIs, transitive files and dependency requirements. Normal component-catalog export and strict TypeScript pass. Runtime/browser checks found and repaired self-message clipping, long state/axis labels, numeric-domain overflow, floating-point motion boundaries and object-ID collisions. The ten-line axis-label reproduction and multiline legends fit at 1280 and 390 px. Natural scaling can still make a dense scene too small to read; a separate narrow composition is the consumer's responsibility.

Two Lemo-Opuscar MIT leaves entered the source-copy catalog with the complete LemoLab notice: `authored-values` and `narration-cues`. Read-only numeric rechecks sampled 2,121 positions in eight ordinary/extreme tracks, including tiny values beside huge values, plateaus and reversals. Results were finite, bounded, monotone within segments and exact at keys; ordinary one-sided slopes converged. Cue checks cover millisecond carry, escaping, overlaps, clipping padded ASR starts, rejected invalid provenance, and preserved original intervals. Existing browser checks inspect nonlinear playhead movement, endpoint holds, actual cue text and serialized WebVTT.

Lemo Wake was inspected separately at its CC BY-NC pin. Original `video-frames` tooling requires an explicit rounding policy and separates the last encoded sample from the exact authored endpoint. Direct runtime checks cover all three rounding policies, safe finite configuration, index bounds, awaited snapshots, separate closure/similarity results and propagated missing-sample errors. It copies no Wake source or assets. Source references, licenses and integration boundaries are recorded in [visual sources](../../tools/visual-sources.json).

## Worked teaching film

The earlier montage is preserved. The new [worked film](../../examples/visual-explainer-mdx/primitives-tour.tsx) follows one save request through validation, storage and the response, then builds that explanation using the actual catalog and CLI. It holds the same diagram geometry and identities while showing the source, finite motion, exact 6 → 2 → 6 sampling, composition and format transfer. The four retained appearances briefly reuse the same example.

Output is `/Users/claytonkim/.agent/videos/artifacture-blocks-explainer-2026-10-04/video.mp4`: 192.7 seconds, 5,781 frames, 1920×1080 at 30 fps, H.264 with 48 kHz stereo AAC. Fresh Ainthony narration recovered all 329 normalized script words through unprompted recognition. Decoded audio correlates with the source at its authored offset at 0.999874, with no clipped source samples. Audio input was unavailable, so no manual audition is claimed.

The artifact receipt records 31 repeated authored seeks, 13 native movie seeks, stable diagram geometry, four motion midpoint checks and 71/71 contrast checks. Root inspected the contact sheet and full-resolution source frame. The worked consumer installed its own dependencies, passed strict TypeScript/Vite build, and works at wide and 390 px widths. Source, encoded input, timing, audio provenance and output hashes are frozen in the artifact's `review/delivery-receipt.json`. The movie is a landscape composition; portrait recomposition and Manim TeX matching remain outside this snapshot.

## Final combined check

After the 32-entry expansion, `npm run check` passed in **111.77 seconds** under the unchanged **120-second budget**. It ran **25 Node end-to-end tests**, zero failures/skips, **24 presentation browser checks**, and **153 seeded violations plus seven clean fixtures**. Type checking, manifest consistency, copy closure/API audit, example exports, mathematical video and integrity checks passed. Full repository lint and `git diff --check` passed separately. The bundled skill runtime contains the current helpers, notices, registry, examples and the linked primitive research documents.

The retained source-copy journey also independently passed 5/5 TAP tests in 8.38 seconds. Its gallery check builds actual copied modules and validates cue text, nonlinear sampling, endpoint holds and the exact loop-inspection result at 1280/390 px. This CI journey shares the repository dependency runtime, while the worked-film consumer installed its own dependencies. Neither is reported as broader render-quality coverage.

The packed public CLI was checked separately from the copy-only backend. Invoked from `/private/tmp`, it initialized a real editable workspace with its own installed npm dependencies, copied all 32 entries, installed the declared GSAP dependency, and wired host stylesheet imports. The full catalog app in that consumer passed strict TypeScript and Vite production build. Its browser rendered 33 examples with working authored-time controls, narration cues and loop inspection, without horizontal overflow. The editable consumer is `/Users/claytonkim/.agent/diagrams/artifacture-component-catalog-2026-10-04/workspace`.

Normal `npm pack` completed its registry audit and automatic skill-runtime rebuild. The final tarball contains 578 entries and is 14,346,861 bytes, SHA-1 `94af64e783be2c65d9ea87dc63ccc8a6fecb4f01`. A copy of only the packaged skill, with a fresh runtime cache and no repository override, discovered all 32 entries from `/private/tmp`. All three new helper leaves report no npm or CSS requirements; the two MIT adaptations retain the complete donor notice. The installed runtime also contains the linked research documents. Logs, the packed index and release receipt are saved under `~/.codex/investigations/artifacture-e2e-and-primitives-2026-10-04/release-expanded32/`.

## Research and design decisions

[Candidate research](../research/primitive-candidates-2026-10-04.md) separates available APIs from proposals. Priorities are source-range code focus, matched equation terms, chart geometry/data identity, and teaching beats compiled into the existing motion model. Morphing, projected solids, and finite spring settling remain bounded experiments. No proposed API was inserted into the available catalog.

Pstack's **Test Behavior, Not Implementation** replaced private-helper expectations with public journeys. **Subtract Before You Add** removed obsolete test layers. **Model the Domain** kept one explicit catalog and described actual reuse boundaries. **Prove It Works** requires real browser/export evidence before claiming a block or film works.

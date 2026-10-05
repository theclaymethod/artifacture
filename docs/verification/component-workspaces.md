# Component workspaces verification

Verified on 2026-10-04 with Node 22.23.1 and Chrome through Playwright 1.60.0. No test files or saved test helpers were added.

This receipt records the earlier scaffold verification. The later [end-to-end and primitive discovery receipt](e2e-and-primitives.md) supersedes its test-suite count and documents the expanded agent index.

## Shipped behavior

The globally linked `artifacture` command supports `list`, `init`, and `add`. Eight blocks copy the existing leaf sources: graphics, diagram, hairline, motion, composition, slides, video, and charts. Their shared dependency closure contains 21 source, stylesheet, declaration, and license files. `init` creates 22 files for a React, TypeScript, and Vite workspace, including its authored starter and project instructions.

The default Hairline starter composes a diagram with an independent delivery illustration. Its four-second sequence uses the existing opacity, reveal, highlight, and translation tracks. A native range control sets authored time directly. Horizontal and vertical layouts are composed before sampling.

The copy manifest owns source membership and package requirements. One source audit runs in both `prepack` and the exporter check. It derives runtime imports, type directives, and React typing requirements, then rejects missing or unnecessary package advice. It also checks local imports, CSS imports, the preset module's declaration, and available tested version declarations. Direct negative probes exercised each drift case.

## Independent consumer

The generated workspace is `/Users/claytonkim/.agent/workspaces/explainer-baseline-2026-10-04`. Its dependencies were installed with `npm install --ignore-scripts`, without a node_modules link to this checkout. Strict TypeScript and Vite production builds passed before and after adding all blocks. The consumer installed React 19.2.7, GSAP 3.14.2, and Vite 8.3.2 from the printed declarations.

All 21 copied files were compared byte-for-byte with their package source. A global `add` rerun created zero files and preserved their bytes and mtimes. An earlier exact `init` rerun preserved all 22 initial files. Adding charts, slides, video, and Hairline created 12 further files without editing the consumer's package or application entry; GSAP was installed separately as instructed.

The CLI was first packed with scripts skipped, then packed again through the normal `npm pack` lifecycle after the safety review. The final `prepack` guard passed. Each package was unpacked and invoked from a directory outside the checkout; it listed all eight blocks and completed `init` and all-block `add` using its own source files. `npm link --ignore-scripts --no-audit --no-fund` made the command available globally. This is a local link, not a registry publication.

The final unpacked package's generated consumer also installed its own dependencies, including the printed GSAP requirement, and passed strict TypeScript and Vite production compilation. Its output matched the independently installed review workspace's default bundle.

## Browser behavior

At 1280 and 390 CSS pixels, the starter rendered with white Hairline surfaces, thin strokes, no page overflow, and no page errors. Its authored viewBox changed from `0 0 744 288` to `0 0 320 640`, proving that the narrow version uses a separate layout. Computed strokes included 0.85px for diagram structure and 0.65px for illustration detail.

The range control visited 0, 1, 2, 3, and 4 seconds, then sought back through those times. Each repeated frame retained the same geometry, state, and text. SVG attribute order was normalized for comparison because React may reorder attributes after removing and restoring them.

The built production starter was also checked at both viewport sizes. At 0.7 seconds, compose opacity and connection reveal were each 0.5. At 1.15 seconds, focus used the cyan accent. At 2.2 seconds, illustration opacity was 0.5; at 2.85 seconds, its smooth translation was 120 authored units. These checks verify all four motion primitives at intermediate states, within floating-point tolerance.

Additional authored consumer pages exercised the copied Hairline adapter, composition, slide, all five chart encodings, and video runtime. Both viewport sizes passed. The catalog switched between Hairline, Mono Color, Algebrica, and 3b1b. The video page registered one host, repeated five sampled frames after reverse seeking, and played and paused successfully. Its fixed 16:9 frame scales to the available width; it is not a separately authored portrait video.

Local review pages while the Vite server is running:

- `http://127.0.0.1:8797/`: generated motion starter.
- `http://127.0.0.1:8797/catalog.html`: authored examples of copied blocks.
- `http://127.0.0.1:8797/video.html`: authored GSAP sequence playback.

The extra catalog and video pages are consumer examples, not part of the default scaffold. Their TypeScript passed the consumer build and their runtime was checked in Vite's development server. The default production entry is the starter.

## Copy safety

Direct CLI and inline filesystem probes passed for unknown blocks, missing flag values, repeated flags, unsupported options, dry-run zero writes, traversal in `sourceDirectory`, and symlink destinations. All copied source files retained their bytes and mtimes during rejected plans.

The implementation owner additionally verified an edited shared file followed by a request for new blocks, a late exclusive-create conflict, and a partial-byte write failure. Preflight conflicts wrote nothing. The final implementation revalidates unchanged files before creation and every planned destination before success. Late edits roll back completed owned copies. Modified new files and incomplete writes are retained and reported as recoverable; the copier does not adopt filesystem bytes as proof of ownership. Probes covered an external write during partial failure and edits to shared and newly created files during application. Evidence is in `~/.codex/investigations/artifacture-component-cli-2026-10-04/cli-implementation-receipt.md`. The independent reviewer cleared all three initial implementation findings after these repairs.

The planner rejects symlinks in any ancestor. Package declarations are reported without claiming semver compatibility for existing consumer ranges. The native Hairline pointer kernel is separately licensed and pinned; the copied Hairline block accepts prepared paths. Video registration supports one host per document.

## Existing checks and style cleanup

The existing 190 tests, lint, typecheck, manifest consistency, and exporter checks passed. The exporter also generated the mathematical 3b1b video and checked the new component copy closures. No new tests were created.

Eight default HTML starters now use white/black Hairline surfaces and one cyan accent. Default SVG and video diagram strokes were thinned. The hardcoded retired font request was removed from the React exporter; the canonical theme font request includes STIX Two Math. Default HTML previews rendered without page errors, including the Mermaid starter in light and dark appearance. Retained theme palettes and the native Hairline vendor were preserved.

Three pstack principles shaped this implementation: **Model the Domain** kept source membership, dependency closure, and destination planning explicit; **Subtract Before You Add** removed stale palette and font defaults before introducing the scaffold; **Make Operations Idempotent** made exact reruns preserve bytes and mtimes while refusing changed copies.

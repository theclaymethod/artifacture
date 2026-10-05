# ASCII rendering: public pipeline reconstruction

Research date: 2026-10-05. This reconstructs documented behavior and public source; it does not claim access to ASCII Magic's private cloud renderer or authentication.

## ASCII Magic

The [MCP page](https://www.ascii-magic.com/mcp-server) exposes a remote service for styling images, choosing styles, preparing uploads, encoding/decoding recipes and account status. It uses OAuth and account entitlements. The MCP protocol is an orchestration surface, not the glyph shader itself. No account was connected, private renderer code accessed or local asset uploaded during this research.

The public [image-to-ASCII tool](https://www.ascii-magic.com/tools/image-to-ascii) documents the conversion algorithm:

1. Decode an image into a local canvas and downsample into a cell grid.
2. Compute weighted luminance: `0.2126R + 0.7152G + 0.0722B`.
3. Adjust tone and select a character from a density-ordered ramp.
4. Reverse polarity for dark ink on light paper versus light glyphs on black.
5. Correct for monospace character aspect ratio, then draw or emit text.

That tool exports text and PNG. The full studio's [documentation](https://www.ascii-magic.com/docs) distinguishes a canvas image of glyphs from selectable plain text, and ordinary local editor rendering from the MCP's cloud flow. Reproducible recipes encode rendering choices; these are not a reason to send imagery to a remote service when the local sampler suffices.

The [style documentation](https://www.ascii-magic.com/docs/styles) describes stable per-cell culling and coverage, plus ordered dithering versus error-diffusion choices. A useful video lesson is to keep the pattern tied to cell identity, avoiding fresh random glyph choices on every frame. The [effects documentation](https://www.ascii-magic.com/docs/effects) places captions after the image treatment and scales effect dimensions with export resolution. Both ideas are adopted as design constraints. Recipes and MCP tool-detail pages could not be fetched reliably in the follow-up; no undocumented schema is implemented.

## Shape-aware alternative

CanvasUI's [public object source at a pinned revision](https://github.com/DavidHDev/canvas-ui/tree/a04a99b235299ee79a123a16ccb2e6cf9da74b6b/src/lib/AsciiObject) uses Three.js for the source. Its HTML sweep and VHS routes use experimental HTML-in-canvas capture; their object route does not require that capture API. The license prevents porting those components into this source-copy library.

The local f-explainer audit found an existing measured six-region matcher with GPU fallback and source adapters. The user selected it with its procedural sources. Artifacture now adapts its measurement/matching algorithm into a Canvas 2D treatment above the shared WebGL model source, replacing wall-clock smoothing with direct requested frames. It remains distinct from the independent luminance sampler. Read the [selected runtime contracts](../model-visuals.md).

## Implemented here

`ascii-frame.ts` owns the original bounded luminance sampler, cell aspect, transparency, contrast and two-ink palette. `ascii-effects.tsx` supplies media and sweep adapters. `ascii-object.tsx` supplies Three.js geometry or glTF input with direct-time pose. `vhs-renderer.ts` is an independently written analytic filter with deterministic time-indexed noise. None copies CanvasUI or ASCII Magic shader/source code. See [the contracts and Blender workflow](../media-effects.md).

The measured matcher accepts the shared model source boundary, including GLB, factories and caller-decoded imagery. Independent point sampling uses that same owner. Model geometry remains editable upstream; glyph output is a sampled presentation layer.

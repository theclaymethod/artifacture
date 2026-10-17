# Create low-detail models for explainers

Use the globally installed `img2threejs` skill when a reference image should become an editable procedural Three.js model. Its output is code, a sculpt specification and review evidence. A reference image is required for reconstruction. This integration does not send images to a mesh service or replace the skill's gates.

Read `img2threejs/SKILL.md` from the active skill directory. Keep one canonical checkout across hosts. The Codex entry points to the existing shared installation, so model generation tools and contracts do not drift into a second copy.

For a low-detail explainer model:

1. Analyze the image, then run the skill's local state gate. Validate that the target is suitable for 3D reconstruction.
2. Write the quality contract and sculpt specification. Choose stylized low-detail output explicitly. Preserve the silhouette, part proportions and action-defining features.
3. Keep the component hierarchy, material roles, pivots and sockets in the specification. Give repeated geometry a deterministic seed.
4. Build and review the unlocked passes. Inspect more than one angle. A triangle budget does not waive identity or attachment checks.
5. Preserve the generated model factory, specification, original reference provenance, semantic part manifest and reviewed screenshots.

The authoring factory should return a Three.js group with meaningful part names. Scene framing and animation time belong to the consuming model view, not a private RAF inside the factory. Animate named parts from absolute seconds. Keep disposal explicit. A model used by a poster, slide and video should share the same factory and source settings.

Discover and copy the renderer with `artifacture list --query ModelView --json` and `artifacture add model-view`. Wrap the generated factory with `modelAsset(root, {sample, paint})`; the view accepts that stable factory as `source`. Use `treatment="shaded"`, `"shape-ascii"` or `"particles"` with the same palette and seconds. The copied `MODEL-AUTHORING.md` records ownership and capture rules. Await the imperative controller's `draw(frame)` before exporting a frame; its promise includes asset and font readiness.

Use `living-forms` for Strata/Arbor/Resonance and `procedural-props` for the selected soft geometric objects. These are prebuilt factories, not image reconstruction results. `orbital-text` and `trace-path` add controlled SVG leaves without Three.js. Read the indexed constraints before mixing them into a slide or video.

Use Hairline material roles: neutral surfaces and thin edges with one contrasting cyan feature. Use stronger neutral contrast for 3b1b on black. Avoid textures, subdivisions or hidden-side detail that do not improve the explanation. State when geometry is approximate. A single image cannot establish the hidden sides.

Use procedural code for compact props and diagrams. Use the [Blender workflow](media-effects.md) for authored modifiers, rigging, simulation or baked media. Retain editable `.blend` source when exporting GLB. A Blender asset does not silently replace an image-to-procedural reconstruction factory.

Before delivery, check the real model in the target renderer, verify reverse seeking at repeated times, and inspect the exported frame. Keep captions and diagram labels outside glyph or texture treatments.

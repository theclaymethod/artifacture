---
name: shader-for-interfaces
description: Decide whether an interface effect should stay in CSS, SVG, or Canvas 2D or needs WebGL or WebGPU, then create, integrate, diagnose, and visually verify focused GPU effects inside product interfaces. Use for contained Three.js/WebGL2/GLSL or vgpu/WebGPU/WGSL surfaces, modest particles, GPU data views, and responsive canvases in TypeScript or React. Do not use for dependent passes, persistent simulations, formal render graphs, adaptive-quality systems, or renderer migrations.
license: MIT
---

# Shader for Interfaces

Build the effect as part of the product. Keep content, controls, layout, and accessibility in the interface while the GPU supplies the visual layer.

## Task mode

- Recommend: read [effect-selection.md](references/effect-selection.md), compare the viable renderers, and return a decision, tradeoffs, fallback, and validation gaps. Do not change files unless asked.
- Diagnose: reproduce and isolate the failure. Explain the cause and a scoped fix; implement it only when the request includes fixing the issue.
- Build or change: follow the complete workflow, integrate the effect, and pass the browser gate.

## Scope

For GPU implementation, this skill handles a focused, contained surface: one effect or draw, modest particles or data, and fixed quality caps chosen from measurement. It does not implement dependent render targets, ping-pong or feedback state, persistent GPU simulations, measured adaptive-quality controllers, formal render graphs, Three.js TSL/WebGPU migrations, or reusable delivery systems.

When a request crosses this boundary, name the features outside scope. Offer a contained simplification only when it still meets the user's goal; if it does not, return a system and acceptance outline and leave the advanced implementation undone. Never present a partial advanced system as complete.

Load only what the current decision or symptom needs:

| Symptom | Read |
|---|---|
| Renderer choice among CSS, SVG, Canvas 2D, WebGL, and WebGPU | [effect-selection.md](references/effect-selection.md) |
| Blank, black, malformed, or non-compiling GLSL or `ShaderMaterial` | [glsl-patterns.md](references/glsl-patterns.md) |
| Vague visual idea, mood, or request without shader vocabulary | [brief-to-effect.md](references/brief-to-effect.md) |
| Resize, layering, pointer, alpha, or lifecycle failure | [ui-integration.md](references/ui-integration.md) |
| Low frame rate, leak, context loss, or fallback failure | [performance-accessibility.md](references/performance-accessibility.md) |
| Texture load, crop, edge, or distortion problem | [textures-and-distortion.md](references/textures-and-distortion.md) |
| Particle count, bounds, update, or overdraw problem | [particles.md](references/particles.md) |
| React Three Fiber ownership or frame-loop problem | [r3f-integration.md](references/r3f-integration.md) |
| Blank or non-compiling WGSL, or a vgpu adapter, binding, surface, device, or headless-render problem | [vgpu-wgsl.md](references/vgpu-wgsl.md) |
| Incorrect or misleading data output | [data-visualization.md](references/data-visualization.md) |
| Generic or unmotivated palette, muddy gradient, or low contrast | [color-direction.md](references/color-direction.md) |

## Workflow for build and change tasks

1. Inspect the project, target surface, existing renderer, installed Three.js, R3F, or vgpu versions, design tokens, interaction states, and device constraints. Resolve version-specific APIs from the target lockfile and installed documentation. Keep the current stack unless it blocks the requested result.
2. Write a brief visual contract that names the effect's UI role, protected content, applicable component states, readiness condition, inputs, still composition, motion, target devices, fallback, and reduced-motion state. When the user starts from a mood or plain-language visual idea, read [brief-to-effect.md](references/brief-to-effect.md) and translate it without requiring shader vocabulary. Use [color-direction.md](references/color-direction.md) to record the palette source, role map, and purpose of every gradient or glow before fixing color values.
3. Choose the lightest renderer that can meet the contract. Read [effect-selection.md](references/effect-selection.md) before adding a GPU renderer to a project that does not already use one. For a contained vgpu/WGSL path, also read [vgpu-wgsl.md](references/vgpu-wgsl.md). Apply the scope boundary above before implementation.
   When CSS, SVG, or Canvas 2D wins, keep the same contract discipline: name the first stable visual checkpoint, state what readiness and fallback mean for that renderer, and explicitly mark GPU-only compilation, context/device failure, and teardown checks as not applicable instead of silently omitting them.
4. Build a no-post baseline. Verify geometry, coordinates, color, alpha, resize behavior, and one motion source before adding polish.
5. Expose design-facing controls such as `intensity`, `scale`, `softness`, `turbulence`, `depth`, `contrast`, `motionSpeed`, `interactionRadius`, and `dataExaggeration`. Give each public control a default, useful range, visible meaning, and a cost note when it changes GPU work. Keep raw shader constants out of the public control surface.
6. Integrate the canvas with [ui-integration.md](references/ui-integration.md). Preserve clipping, stacking, input, responsive layout, DOM semantics, and cleanup.
7. Use [glsl-patterns.md](references/glsl-patterns.md) while writing or adapting GLSL. Diagnose intermediate values before changing several parameters at once.
8. Profile GPU and page-level outcomes, add fallbacks with [performance-accessibility.md](references/performance-accessibility.md), then pass the browser checks below.

For data-driven work, read [data-visualization.md](references/data-visualization.md) before uploading buffers or textures. Define each source-to-visual mapping, including units, domain, missing values, legend, and accessible alternative. Keep decorative motion separate from represented values.

For image sampling or distortion, read [textures-and-distortion.md](references/textures-and-distortion.md). For point or instanced effects, read [particles.md](references/particles.md). For an effect inside an existing R3F application, read [r3f-integration.md](references/r3f-integration.md).

When a separate `vgpu` skill is available and vgpu is the selected renderer, use it as the version-specific API and performance companion after reading [vgpu-wgsl.md](references/vgpu-wgsl.md). Keep this skill responsible for renderer choice, product integration, visual direction, accessibility, fallback, and browser acceptance. The companion skill remains optional.

## Implementation constraints

- Reuse the host application's renderer. Once Three.js is justified, default to `WebGLRenderer` with `ShaderMaterial` for custom GLSL. Do not add vgpu beside an existing Three.js or R3F renderer for one effect unless the product explicitly needs a separate WebGPU surface and accepts the extra device, bundle, lifecycle, and fallback cost.
- Choose vgpu for a contained WebGPU/WGSL effect when the project already uses it or when WebGPU, WGSL modules, or browser-and-Node pixel validation provides a concrete benefit. vgpu does not supply an automatic WebGL fallback; keep a designed non-WebGPU state.
- Give a contained vgpu surface one `Gpu` owner. Create its surface, effect, and resource objects once. After the first `set()`, keep each binding in the same ownership category: continue sending plain values to value-backed bindings, and keep user-owned textures, buffers, and samplers resource-backed. Stop the frame loop, unsubscribe resize callbacks, and call `gpu.dispose()` during teardown.
- Use the installed vgpu documentation or companion skill to resolve current API details. Load only the concept, guide, or symbol needed for the next decision; do not vendor the upstream manual or assume the latest online API matches the lockfile.
- Check the installed Three.js and R3F versions before using version-specific shader chunks, color APIs, renderer compilation hooks, or frame-loop behavior. Translate older APIs deliberately rather than presenting current syntax as version-agnostic.
- Use `RawShaderMaterial` only when full shader declarations are intentional. Then own precision, attributes, uniforms, GLSL version, fragment output, and output color conversion explicitly.
- Keep an existing React Three Fiber setup. Do not add R3F to a vanilla Three.js project for one effect.
- Keep DOM or application state authoritative. Feed shaders bounded visual derivatives of hover, focus, press, selection, disabled, loading, error, and progress states instead of making the GPU the component state machine.
- Name the owner of the renderer, scene, camera, geometry, material, uniforms, animation loop, resize logic, and cleanup.
- Mutate stable uniforms in the frame loop. Do not recreate materials, geometry, typed arrays, or React state each frame.
- Normalize pointer input within the canvas container unless the interaction is intentionally global.
- Use `ResizeObserver` for component-sized canvases. Distinguish CSS size, drawing-buffer size, and shader resolution.
- Avoid unbounded renderer, context, device, loop, and observer counts across repeated components. Use [ui-integration.md](references/ui-integration.md) to choose isolated, shared, or demand-driven surfaces. Carry focus, disabled/loading suppression, interruption, readiness, and fallback behavior into the chosen repeated-surface approach.
- Cap DPR. Start at `Math.min(devicePixelRatio, 2)` and lower it for fragment-heavy surfaces.
- Test color space, alpha, and transparent edges over the real interface background.
- Require a product, brand, reference, material, or data reason for dominant hues. Do not default to purple-cyan gradients, neon-on-dark glow, glass surfaces, or any replacement canned palette.
- Keep essential text, controls, status, and the only representation of data out of the canvas.
- Adapt shader source, textures, models, fonts, and data only when the user owns them or the applicable license permits the use. Preserve required attribution in the target project.

## Browser gate

Before claiming completion:

1. Run the real app and check JavaScript, shader compilation, selected GPU backend, and asset errors.
2. Inspect desktop, mobile, and one unusual aspect ratio. When the effect repeats, test a representative grid or list rather than one isolated instance. Record layout stability, primary interaction latency, loading, and the first stable effect frame in addition to GPU timing.
3. Freeze time or use a fixed seed to judge the still composition.
4. Watch several seconds of motion for seams, hard bands, popping, unstable transparency, and discontinuities.
5. Test applicable default, hover, focus-visible, pressed, selected, disabled, loading, error, and progress states; input at the surface edges; resize; pointer cancellation; touch-scroll takeover; route interruption; and rapid re-entry.
6. Test reduced motion, initialization or context/device failure, unavailable selected GPU backend, and the static fallback.
7. Check the readability of the actual UI and inspect canvas accessibility semantics: decorative surfaces stay hidden and unfocusable, while meaningful or interactive surfaces have an accessible DOM equivalent or a complete name, description, and keyboard model.
8. Run the acceptance checklist in [color-direction.md](references/color-direction.md), including light/dark and runtime theme changes, supported forced-colors/high-contrast modes, grayscale, worst-frame contrast, non-color cues, and the generic-palette test.
9. Record browser, viewport, DPR, quality setting, and remaining gaps.

When output looks wrong, inspect UVs, normals, depth, field value, particle age, data value, alpha, and overdraw before tuning the final color.

## Handoff

Match the handoff to the task:

- Recommend: report the renderer decision, rationale, constraints, fallback, and next validation step.
- Diagnose: report the cause, affected files or shader stages, reproduction evidence, scoped fix, and anything still inferred or unverified.
- Build or change: return the runnable integration and report changed files, public controls, input or data paths, browser checks, fallback behavior, and unverified states.

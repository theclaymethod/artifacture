# Performance and accessibility

## Budgets

Set a target before polishing. Measure frame time, draw calls, triangles/points, render-target sizes, texture memory proxies, and shader hot spots on representative hardware.

Start with:

- Cap DPR at 2 for ordinary surfaces and between 1 and 1.5 for expensive fullscreen passes.
- Keep a fullscreen effect to one draw call unless the visual contract requires passes.
- Set separate particle limits for mobile and desktop tiers.
- Avoid per-frame material, geometry, texture, and typed-array allocation.
- Stop rendering hidden and offscreen canvases.

Profile first. Reduce the measured bottleneck in the order of least perceptual impact: post passes or samples for fill-rate-heavy effects, particle or instance count for vertex-bound effects, and render resolution when the surface tolerates softer output. Use a 16.7 ms frame budget for a 60 fps tier or 33.3 ms for an intentional 30 fps tier on representative hardware. Do not lower layout resolution or DOM text quality.

## Page-level performance

- Treat the GPU layer as progressive enhancement. Render meaningful DOM content, controls, layout, and fallback without waiting for adapter creation, shader compilation, textures, or the first GPU frame.
- Measure page outcomes as well as renderer statistics: Largest Contentful Paint, Cumulative Layout Shift, Interaction to Next Paint, long tasks, scroll responsiveness, and time from navigation to the first stable effect frame.
- Reserve the canvas or fallback dimensions before GPU readiness. Renderer initialization, font loading, theme changes, and target resizing must not move surrounding content or create a late layout shift.
- Keep adapter requests, module loading, pipeline warm-up, texture decode, and large data preparation off the critical path for primary interaction. A visible hero may warm early, but its title and controls must remain usable while the fallback is shown.
- Delay below-the-fold and collapsed surfaces until they approach the viewport. Code-split a renderer that the page does not otherwise use, and do not download a large 3D stack for an effect that CSS, SVG, or Canvas 2D can deliver.
- Measure repeated surfaces in aggregate. Report total contexts/devices, drawing-buffer pixels, animation loops, observers, listeners, and main-thread work under realistic scroll and mount/unmount churn.
- Compare before/after traces on representative mobile and desktop hardware. A stable GPU frame time does not excuse worse layout, input latency, loading, battery use, or thermal behavior.

## Motion

- Read `prefers-reduced-motion` and default to a still, reduced-amplitude, or non-spatial composition. Slowing motion alone is acceptable only when it materially reduces the triggering movement and has been checked in the real interaction.
- Avoid rapid full-screen luminance changes, high-frequency flicker, and motion that competes with reading.
- For nonessential automatic motion that runs longer than five seconds beside other content, provide a pause, stop, or hide control. Keep `prefers-reduced-motion` as the default preference signal.
- Let users disable nonessential spatial motion triggered by pointer or scroll input when the product must meet the stricter animation-from-interactions criterion.
- Provide an idle state for pointer-reactive effects.
- Make animation speed independent of frame rate and clamp large delta times after tab suspension.

For the product-level accessibility requirements behind these controls, see W3C guidance for [Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide) and [Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).

## Fallbacks

Prefer a designed fallback: captured still, CSS gradient, poster image, or simplified SVG. Match the composition and palette; do not leave a blank region. If the shader represents data, retain the accessible DOM representation regardless of GPU support.

## Ownership check

Use the lifecycle checklist in [ui-integration.md](ui-integration.md). During profiling, confirm that repeated mount and unmount cycles return renderer memory counts to their expected baseline. Dispose the renderer or remove the canvas only when this component created them.

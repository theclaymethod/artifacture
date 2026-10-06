# UI integration

## Layering

- Place the canvas in a positioned visual layer and keep semantic UI in normal DOM flow.
- Use `pointer-events: none` for decorative canvases. Attach input to the containing UI region when interaction is required.
- Clip with the containing DOM element when matching card or hero radius. Do not rely on approximate shader corners.
- Define which layer owns the stacking context. Avoid arbitrary extreme z-index values.
- Choose an opaque or transparent drawing buffer separately from premultiplied canvas compositing and material blending. Test shader output and transparent edges over the real background.

## Sizing and coordinates

- Observe the canvas container. Do not rely on `window.resize` alone.
- Ignore or safely clamp transient non-positive `ResizeObserver` dimensions during mobile relayout. Render again when the container has a valid size.
- Set renderer size in CSS pixels and pass drawing-buffer resolution to the shader when sampling pixels.
- When shader math uses `gl_FragCoord`, derive its resolution uniform from `renderer.getDrawingBufferSize()`, not the CSS rectangle.
- Recompute camera projection after size changes only when the camera or projection depends on the surface aspect or dimensions; a clip-space fullscreen triangle with no camera projection does not need that update.
- Convert pointer coordinates from the container rectangle:

```ts
const x = (event.clientX - rect.left) / rect.width
const y = 1 - (event.clientY - rect.top) / rect.height
```

- Distinguish UV coordinates, normalized device coordinates, view space, world space, and screen pixels. Name varyings accordingly.

## Component states and readiness

- Keep the DOM or application state machine as the source of truth. Pass bounded, derived visual values to the shader; do not make GPU state the only record of whether a control is selected, disabled, loading, or in error.
- List the states that apply before implementation. Check `default`, `hover`, `focus-visible`, `pressed`, `selected`, `disabled`, `loading`, `error`, and `progress` rather than assuming pointer idle/active is the complete component model.
- When hover communicates a useful state, provide an equivalent keyboard-focus treatment. Preserve a non-color cue for focus, selection, errors, and represented status.
- Neutralize misleading interaction while disabled or loading. A disabled control must not keep a hover attraction, click burst, or cursor response that implies it can act.
- Make rapid state changes converge from the current visual state. Do not queue stale hover, press, selection, or route-transition animations after the owning DOM state has changed.
- Keep the designed fallback visible until required assets, shader compilation, sizing, and the first requested stable frame are ready. Do not reveal a black canvas, uninitialized texture, or half-built composition between DOM loading and GPU readiness.
- Expose readiness only after the state displayed to the user is actually stable. If initialization, asset loading, compilation, or recovery fails, return to the designed non-GPU state and keep semantic status in the DOM.

## Interruptible input and navigation

- Handle `pointercancel`, lost pointer capture, window blur, touch-scroll takeover, and component unmount. Release transient input and converge to the current DOM state instead of leaving a stuck hover, press, drag, or attraction field.
- Do not prevent scrolling for a decorative or hover-only effect. Use container-local coordinates and passive input where possible; claim pointer capture only when direct manipulation requires it and provide an explicit release path.
- Make hover, press, reveal, and route transitions reversible or cancellable from the current visual frame. Rapid re-entry, back/forward navigation, and repeated triggers must not replay stale queued animations.
- Tie every animation loop, timer, promise continuation, and async asset callback to the owning lifecycle. An interrupted route or remount must not draw into a disposed surface or reveal a late frame over the new interface.
- Reduced motion should move directly to the correct semantic end state. It is not a reason to leave a transition half-complete or postpone navigation.

## Canvas accessibility semantics

- Classify the canvas as decorative, content-bearing, or genuinely interactive before choosing ARIA and focus behavior.
- For a decorative canvas, use `aria-hidden="true"`, keep it out of the tab order, and leave its content, controls, and status in semantic DOM.
- For a meaningful image or data surface, prefer an equivalent DOM description, table, or image alternative and hide the raw canvas from the accessibility tree. If the canvas itself is exposed as an image, give it an accessible name and description without duplicating the same announcement elsewhere.
- Make a canvas focusable only when direct spatial interaction is essential. Then provide an accessible name, instructions, a complete keyboard model, visible focus, and equivalent DOM controls or output for essential actions and values.
- Verify the accessibility tree as well as the pixels. Fallback and reduced-motion states must preserve the same semantic meaning without leaving a duplicate, unnamed, or empty canvas node.

## Multiple surfaces and repeated components

- Choose deliberately between one renderer per isolated surface, one shared renderer/device for coordinated surfaces, and a pooled or demand-driven approach for repeated components. Do not create an unbounded WebGL context or WebGPU device for every card in a long list.
- Prefer an existing shared renderer when the host already owns render order, viewport, DPR, and cleanup. A new shared renderer needs one application-level owner; individual cards or sections must not dispose it.
- A shared full-page canvas with scissor or viewport regions can reduce context count, but it must track DOM rectangles, clipping, stacking order, scroll, transforms, DPR, and hit mapping without covering semantic content. Use it only when those coordination costs are justified.
- Per-component canvases are simpler when surfaces are few and independently mounted. Count active contexts/devices, total drawing-buffer pixels, animation loops, observers, and listeners rather than evaluating one component in isolation.
- Carry the full component-state contract into repeated layouts. Hover and focus-visible must remain equivalent where useful; disabled and loading surfaces must suppress misleading response; interruption must clear transient state; every isolated, shared, scissored, pooled, or CSS-first path needs a defined ready state and designed fallback.
- Pause or avoid work for hidden, offscreen, virtualized, collapsed, and zero-size surfaces. Re-entry must restore the correct state without creating duplicate resources or visible stale frames.
- Test a representative repeated layout under scroll, resize, mount/unmount churn, theme/state changes, and mobile memory pressure. Verify that one surface cannot clear, clip, intercept input for, or dispose another.
- Shared render targets, feedback, simulations, formal pass ordering, and global render graphs are outside this skill's scope. Keep the work here to surface ownership and scheduling, not a multi-pass rendering system.

## Lifecycle

- Give each surface one renderer owner unless the application already shares a renderer.
- Cancel animation frames, disconnect observers, remove listeners, and dispose geometry, materials, textures, render targets, and the renderer during teardown.
- Handle both `webglcontextlost` and `webglcontextrestored`. Pause the loop while the context is lost and keep a visible fallback behind the canvas.
- Pause when `document.hidden`, outside the viewport, or motion is not needed.

## React and R3F

- Keep fast-changing values in refs or uniforms; do not route them through React state every frame.
- Memoize stable geometry, materials, and typed data.
- Use `useFrame` for mutation and `useThree` for renderer-owned dimensions and viewport data.
- Preserve the application's frameloop policy. For demand rendering, invalidate only when inputs change.

## Product checks

- Verify keyboard navigation and focus rings without the canvas intercepting input.
- Keep text selection, links, buttons, and scrolling functional.
- Test coarse pointers and touch. Hover cannot be the only useful state.
- Test pointer cancellation, lost capture, touch scrolling, window blur, rapid re-entry, and route interruption.
- Define screenshot and export paths when the effect must be captured.

# React Three Fiber integration

Use this path only inside an application that already owns an R3F `Canvas`. Do not create a nested canvas for one shader surface.

## Ownership

- Read renderer, size, viewport, DPR, and invalidation from `useThree` instead of duplicating window listeners.
- Update uniforms or refs in `useFrame`. Do not call React state setters each frame.
- Create stable geometry, materials, textures, and typed data with `useMemo` or declarative JSX.
- R3F disposes most declarative Three.js objects on unmount. Objects attached through `<primitive>` and shared caches need an explicit ownership and disposal policy.

## Frame loop

Preserve the host `frameloop` setting. In a demand-driven canvas, call `invalidate()` only when an input, asset, animation, or control change requires a frame. A reduced-motion surface can render its deterministic composition once and remain idle.

If the effect takes over rendering with a positive `useFrame` priority, it also takes responsibility for the complete render order. Keep ordinary material effects at the default priority.

## Interaction and readiness

- Use the host event system when mesh picking is required. For a decorative fullscreen layer, read input from the containing DOM region without blocking controls.
- Keep loading UI and semantic content outside the canvas. Treat Suspense resolution as asset readiness, not proof that shaders compiled or captures are stable.
- Expose a deterministic ready signal only after textures, fonts, data, shader compilation, and the requested warmup frames are complete.

## React checks

Test development Strict Mode remounts, route changes, error boundaries, Suspense fallback, server-rendered shells, hidden tabs, context loss, and repeated mount and unmount. Confirm that no duplicate frame callbacks, listeners, canvases, or GPU resources survive teardown.

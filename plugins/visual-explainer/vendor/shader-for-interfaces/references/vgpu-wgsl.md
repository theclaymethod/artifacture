# vgpu and WGSL

Use vgpu for a contained effect when the project already uses it or when WebGPU, WGSL modules, or browser-and-Node pixel validation provides a concrete product benefit. This skill has no vgpu runtime dependency; `vgpu` belongs in the target application only after the renderer decision justifies it.

## Scope boundary

Keep the work in this skill when it is one focused fullscreen effect, one contained draw, or a modest data surface with no dependent pass graph or persistent GPU state.

Dependent offscreen passes, ping-pong resources, feedback, simulation state, measured adaptive quality, formal render graphs, and Three.js TSL/WebGPU migrations are outside this skill's scope. The boundary is system complexity, not whether the shader uses WGSL. Follow the entrypoint's scope rule instead of implementing a partial substitute.

Do not add vgpu beside an existing Three.js or React Three Fiber renderer for one effect by default. Reuse the host renderer unless a separate WebGPU surface has a user-visible benefit and the product accepts another device, bundle, lifecycle, and fallback path.

## Companion skill and installed documentation

vgpu is pre-1.0 and its API can change. Inspect the target project's `package.json` and lockfile before writing code. Read the documentation shipped with that installed version instead of assuming the latest website matches it:

```sh
npx --no-install vgpu docs cat getting-started.md
npx --no-install vgpu docs find effect
npx --no-install vgpu docs grep -i "pipeline"
```

These commands require Node.js, a package manager, and `vgpu` installed in the target project. Use the project package manager's equivalent local-exec command when it is not an npm project. Do not use an unpinned `npx vgpu` invocation to silently download a different version. A browser-only integration can still use this skill without Node tooling, but it must not claim CLI or Node pixel validation that did not run.

If a separate `vgpu` skill is available, use it for package-specific API, diagnostics, performance, bundler, and Node-adapter mechanics. Use this skill for renderer choice, visual contract, DOM integration, data truthfulness, accessibility, fallback, and browser acceptance. Load one upstream reference at a time based on the active question; do not inject its full API catalog into the task.

The workflow must still work when the companion skill is absent. The package-local CLI is the fallback source of truth when Node tooling is available; otherwise inspect the installed package's exports and type declarations. Prefer the root `vgpu` API for normal effects, `vgpu/scene` only when geometry or camera helpers are actually needed, and `vgpu/core` or `@vgpu/render/*` only when the higher layer cannot express a required contract. `vgpu/core` is a `vgpu` package export; `@vgpu/render/*` is a separate package surface and may require `@vgpu/render` as a direct pinned dependency. Confirm the installed exports and lockfile instead of assuming `vgpu` alone provides it. A lower-level import is not an optimization by itself.

## Contained renderer pattern

- Call `init()` once for the owned surface group. Create `surface`, `effect` or `draw`, bindings, and other long-lived resources outside the frame loop.
- Use `effect(gpu, source)` for fullscreen fragment work and `draw(gpu, options)` when the effect owns vertex or geometry work.
- Use `surface(gpu, canvas, { dpr: [1, 2] })` for a layout-backed canvas. Treat CSS size, surface size, DPR, and shader texel size as distinct values.
- Set constants once, resolution-class bindings from `surface.onResize()`, and only genuinely dynamic values such as time or pointer input each frame.
- Drive animation with `frameLoop(gpu, callback)` and submit the effect with `frame.pass(surface, effect)`. Keep the returned loop handle when teardown needs to stop it explicitly.
- Unsubscribe resize callbacks, stop loops, remove product listeners, and call `gpu.dispose()` when the component owns the `Gpu`. React development remounts must not create orphaned devices or loops.

A typical ownership shape is:

```ts
const gpu = await init()
const output = surface(gpu, canvas, { dpr: [1, 2] })
const effectPass = effect(gpu, shader, { set: initialBindings })
const time = clock(gpu)
const unsubscribe = output.onResize(() => {
  effectPass.set({ params: { texel: output.texelSize } })
})
const loop = frameLoop(gpu, (frame) => {
  effectPass.set({ params: { time: time.time } })
  frame.pass(output, effectPass)
})

return () => {
  unsubscribe()
  loop.stop()
  gpu.dispose()
}
```

Adapt binding names and structure to the shader. Do not copy this shape into an existing renderer without first resolving ownership.

## Compilation and stable identity

vgpu pipelines compile lazily for a render signature: color formats, depth format, and sample count. A first visible draw can therefore include compilation work. When first-frame smoothness matters, derive an explicit `TargetSignature` from the actual surface during loading and catch the failure there:

```ts
import type { TargetSignature } from "vgpu"

const visibleSignature: TargetSignature = {
  colors: [output.format],
  sampleCount: output.sampleCount,
}

await effectPass.compile(visibleSignature)
```

Do not pass a live `Surface` to `compile()` outside `frame(gpu)`; `vgpu@0.3.1` reports `VGPU-SURFACE-NOT-IN-FRAME`. Keep loading-time warm-up out of the frame loop and use the explicit signature instead. Read the surface's public format and sample count to build that signature rather than guessing them. Target or canvas identity and target dimensions are not part of the render signature: the same effect or draw under the same `Gpu` can reuse its pipeline across targets or canvases with the same signature. A different color format, depth format, sample count, shader, or immutable pipeline state needs another pipeline; a different `Gpu` has a separate cache. Lazy compilation failures arrive through the installed version's error channel; register `gpu.onError(...)` and use `await gpu.settled()` in tests instead of assuming a synchronous draw throws.

Read the installed `performance-model` before optimizing. Binding ownership and resource identity are related but distinct. The first `set()` makes each binding either value-backed or resource-backed. Keep plain JS values plain and update them through later `set()` calls; do not replace them with a user-owned resource. Keep textures, buffers, samplers, and other user-owned bindings resource-backed, and reuse their identities when possible. Switching ownership categories triggers an ownership error in `vgpu@0.3.1`; replacing a resource identity can rebuild bind groups or stale recorded bundles. Reuse targets, effects, and draws instead of recreating them every frame, and verify the exact rules against the locked version.

## WGSL contract

- Declare bindings explicitly and set them by their WGSL names. A struct binding stays nested when passed to `set()`.
- Keep imported WGSL modules pure: export helpers, structs, or constants from them and declare resources in the entry shader.
- vgpu fullscreen effects inject top-origin UVs: `(0, 0)` is top-left and `v` grows downward. When porting GLSL or Shadertoy code that assumes upward-growing `v`, invert once at the boundary and do not add compensating flips elsewhere.
- Record the target format, working color space, display transform, alpha mode, and premultiplication contract. vgpu is not Three.js color management; apply the intended tone or output transform exactly once and test it over the real interface background.
- Keep essential content, status, controls, and the only representation of data in the DOM.

For imported `.wgsl` files, use the installed vgpu documentation to configure the target bundler and its ambient TypeScript declaration. An inline WGSL string is acceptable for a small isolated effect when module composition is not needed.

## Bundler and validation boundary

Use a WGSL-aware loader only when the project keeps shaders in `.wgsl` files or composes WGSL modules. Read the installed `nextjs` or bundler guide for the exact loader and TypeScript declaration; do not paste configuration from a different vgpu or framework version.

A successful Vite, Next.js, or TypeScript build is not proof that WGSL compiled for a real device. Keep shader validation as a separate gate. Check entry shaders and pure helper modules, inspect reflected binding names before calling `set()`, and use the installed version's device-backed validation option in CI when that environment is available.

## Debugging and measurement

- Pre-warm the real target signature when isolating a first-frame hitch. Do not measure compilation, resize, allocation, and steady rendering in the same sample.
- JavaScript time around `frame.pass()` measures command encoding, not GPU execution. Use the installed timing API only when the adapter exposes the required feature, and label CPU encoding and GPU pass cost separately.
- When math is non-trivial, render selected intermediate values into a tiny explicit target, decode them, and compare them with a CPU reference. Derive tolerance from the chosen encoding and algorithm; do not tune the final color until the wrong intermediate value is located.
- Use fixed time, seed, target size, inputs, and warm-up count for evidence renders. Two runs in the same recorded vgpu, backend, adapter, and driver environment should produce identical bytes before they are used for regression claims. Across drivers or platforms, define an algorithm-appropriate tolerance or perceptual diff instead of promising byte identity.
- Use upstream examples for API discovery, not as anonymous source material. Before copying example code or assets, inspect the applicable license and provenance and record attribution in the target project.

## Capability and fallback

WebGPU requires a secure context and a usable adapter. `init()` can fail, and vgpu does not automatically replace the effect with WebGL. Catch initialization failure at the product boundary, retain a designed CSS, SVG, image, or semantic-data fallback, and keep the interface usable without a canvas.

Runtime device loss is separate from initialization failure. In `vgpu@0.3.1`, the device wrapper observes `GPUDevice.lost`; subsequent work fails with `VGPU-DEVICE-LOST` and vgpu does not recreate the device. Register `gpu.onError(...)`, treat that code as terminal for the owned `Gpu`, stop the frame loop, unsubscribe product and resize listeners, reveal the designed fallback, dispose the old `Gpu`, and prevent late work from drawing. Retry only when the product defines a bounded recovery policy; create a completely new `Gpu` and resource graph, and never replay stale user actions. Otherwise remain on the usable fallback and report the loss.

Reduced motion should normally render one deterministic frame or use a still, reduced-amplitude, or non-spatial response. Slowing motion alone is appropriate only when it materially reduces the triggering movement and has been checked in the real interaction. A no-WebGPU state is separate from reduced motion: users can have WebGPU and still request less movement.

## Validation

1. Run the installed CLI against every entry and helper module. Use `vgpu check path/to/shader.wgsl` for resolution and reflection; use the installed version's validation flag when the environment is prepared for device-backed validation. A normal application build does not replace this gate.
2. Use `vgpu doctor` only as an environment diagnostic. Do not install its optional software renderer or other system packages without the required authorization.
3. Pre-warm the actual visible target signature when first-frame behavior matters. Derive it from the surface format and sample count rather than passing a live surface outside a frame, and surface compilation or asynchronous validation errors through the installed version's error and settled paths.
4. For a deterministic static proof, render a small explicit target through `vgpu/node`, read its pixels, and assert expected values. `vgpu/mock` can verify deterministic command and binding behavior, but it is not evidence that real WebGPU pixels are correct.
5. Run the product in the real browser. Check desktop, mobile, and one stress aspect ratio; adapter or initialization failure; runtime device loss and the chosen bounded recovery policy; resize; pointer edges; reduced motion; fallback; and teardown.
6. If a headless screenshot is black, do not call the shader broken or verified from that artifact alone. Confirm an offscreen pixel readback and use a headed WebGPU-capable browser capture when presentation is the missing link.

Record the vgpu version, browser, OS, adapter/backend, viewport, DPR, shader state, and unresolved differences. Node readback supplements the browser gate; it does not replace product integration or accessibility checks.

## Upstream maintenance boundary

This reference is an original, focused integration guide informed by the MIT-licensed [vgpu repository](https://github.com/vercel-labs/vgpu), its generated [vgpu skill](https://github.com/vercel-labs/vgpu/tree/main/skills/vgpu), and the versioned documentation shipped in the `vgpu` package. This package does not redistribute vgpu source, its generated documentation corpus, its examples, or its assets. Recheck the locked package before changing API-specific guidance.

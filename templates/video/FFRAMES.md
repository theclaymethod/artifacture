# Native FFrames Handoff

Use the HyperFrames + `vgpu/node` (Dawn) path in this template for rapid browser prototyping and CI verification. When scaling to long 60fps native renders or GPU compute pipelines:

1. **Keep the WGSL source authoritative**: share your `.wgsl` uniform struct and `timelineState(seconds)` math unchanged.
2. **Drive frame rendering in Rust FFrames (`fframes`)**: implement `Scene::render_frame(&self, frame, ctx)` using pure functions of `frame.timestamp` (`f64`).
3. **Avoid wall-clock timers**: pass frame time directly into uniform buffers, mirroring `<GpuCanvas seconds={t} />` and `renderSceneSequence`.
4. **Verify determinism**: compare seek `0 -> 1.5 -> 0` PNG pairs with `pixelmatch` before kicking off full encodes.

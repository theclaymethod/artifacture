# Particles

## Choose the representation

- Use `THREE.Points` for small screen-facing marks with one material and modest per-particle variation.
- Use instanced geometry when particles need shaped meshes, stable orientation, lighting, or per-instance transforms.
- Use a CPU-updated buffer for bounded counts and simple motion. Render-target feedback, GPGPU simulation, and persistent GPU state are outside this skill's scope.

## Data and motion

- Create positions, seeds, ages, and other attributes once. Mutate typed arrays in place and flag only changed attributes for upload.
- Use a stable seeded generator for initial layout. A deterministic reset is required for visual comparison.
- Keep time-based motion independent of refresh rate. Define lifetime, respawn, bounds, and an idle state instead of letting particles drift without limit.
- If only a small attribute range changes, update that range rather than uploading the entire buffer.

## Rendering

- Account for DPR when point size is specified in screen pixels, then cap the final size on mobile hardware.
- Choose depth testing, depth writing, blending, and transparency as a set. Additive blending can hide sorting problems while creating severe overdraw.
- Compute or assign a correct bounding sphere when positions move. Disable frustum culling only with a measured reason.
- Prefer soft analytical edges in the fragment shader over large transparent textures.

## Quality tiers

Set separate count and size caps for representative mobile and desktop devices. Profile whether the bottleneck is vertex work, fragment overdraw, buffer upload, or CPU simulation before reducing quality. A useful downgrade order might remove secondary emitters, lower count, simplify geometry, reduce update frequency, and finally freeze on a designed still.

## Checks

Inspect edges of the viewport, resize, tab resume, coarse pointers, reduced motion, deterministic reset, and repeated teardown. Record particle count, draw calls, frame-time percentile, and whether transparent overlap remains legible over the real UI.

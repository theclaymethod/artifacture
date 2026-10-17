# Effect selection

Choose the least complex renderer that can express the visual contract.

| Need | Prefer | Escalate when |
|---|---|---|
| Static gradient, glow, grain, mask | CSS backgrounds, filters, masks | Per-pixel motion or spatial interaction is essential |
| Vector shape, path, text outline | SVG | Many independently animated elements or dense per-pixel deformation are required |
| Lightweight particles or bitmap drawing | Canvas 2D | GPU fields, 3D projection, large particle counts, or shader materials are required |
| Procedural full-surface effect | Fullscreen triangle/plane with GLSL | Geometry, depth, multiple surfaces, or scene interaction are required |
| 3D material or scene | Three.js WebGLRenderer | Compute-heavy systems justify a separate WebGPU/TSL track |
| Contained WebGPU effect or WGSL data surface | vgpu with `effect` or `draw` | Dependent targets, feedback, persistent state, or formal quality control are required |
| Existing React Three Fiber app | R3F primitives and hooks | The host app exposes a shared lower-level render graph |

## UI-role routing

- Background atmosphere: fullscreen fragment shader, restrained contrast, slow motion, no pointer capture.
- Local card or hero surface: component-sized canvas, transparent alpha, ResizeObserver, rounded clipping in the DOM.
- Image distortion: texture sampling with contain/cover math; preserve alt text in the DOM.
- Hover material: pointer-local uniforms, a defined idle state, and a coarse-pointer fallback.
- Particle accent: Points or instancing, bounded count, stable seed, pause offscreen.
- Data terrain: BufferGeometry or vertex texture displacement with declared value-to-height/color mappings.
- Transition: short-lived render surface with deterministic start/end states and immediate cleanup.

## Backend checks

- Preserve the host renderer. Do not introduce vgpu beside Three.js or R3F for one effect unless a separate WebGPU surface has a concrete benefit.
- When the project has no GPU stack, use raw WebGL2 for one owned fullscreen shader only when the effect needs no scene graph, camera, asset loaders, material system, picking, or shared renderer and the project accepts owning compilation, context loss, sizing, and disposal directly. Choose Three.js when those facilities, existing Three components, or likely adjacent GPU work justify its bundle and lifecycle. Do not import a full scene framework for one fragment shader by convenience alone.
- Inspect the installed Three.js and R3F versions before choosing exact color, shader-chunk, compilation, or frame-loop APIs. Treat current examples as versioned implementation details, not portable syntax.
- Choose vgpu when the project already uses it, the request explicitly requires WGSL/WebGPU, or browser-and-Node pixel validation materially improves the delivery.
- Treat Node.js and package-manager tooling as optional development evidence, not a browser runtime requirement. It is required only when the plan includes the package-local vgpu CLI or `vgpu/node` pixel checks.
- Treat browser support and adapter availability as product constraints. A vgpu effect needs a designed non-WebGPU state because it does not automatically fall back to WebGL.
- Read [vgpu-wgsl.md](vgpu-wgsl.md) before implementing the vgpu path. Dependent pass graphs, ping-pong state, simulations, and formal adaptive quality are outside this skill's scope.

## Decision checks

Reject a GPU renderer when the same result is credible with a small CSS or SVG implementation, when the surface conveys essential content without an accessible alternative, or when the effect cannot degrade safely. Choose WebGL when broad browser coverage, existing Three.js ownership, per-pixel procedural motion, dense particles, 3D projection, GPU data fields, or material response is central. Choose vgpu when a contained WebGPU/WGSL path has a concrete benefit and the capability boundary is acceptable.

# GPU Shader Pipeline (@artifacture/gpu)

Artifacture v2 uses `vgpu` (`^0.6.0`) and Dawn (`vgpu/node`) for both browser rendering and headless verification:

- Define scenes once via `GpuSceneDefinition<TParams>`: `{ id, label, shader, defaultParams, stillTime, stillSize, setup? }`.
- Uniform bindings reflected on `@group(0) @binding(0) var<uniform> params: Params;` automatically receive `time`, `resolution`, `texel`, `_pad*`, and matching keys from `params`.
- For stock `open-slide` (which does not load custom Vite WGSL plugins), precompile `.wgsl` -> `.wgsl.ts` using `compileWgslDirectory` (`transformWgsl`) so static frozen modules execute with zero client WGSL parser.
- Run `artifacture shaders <dir>` to validate all `.wgsl` files through Dawn (`resolveShader({ validate: 'require' })`).

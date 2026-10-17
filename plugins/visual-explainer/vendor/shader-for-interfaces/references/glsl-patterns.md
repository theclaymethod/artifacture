# GLSL patterns

Check the target project's installed Three.js version before using exact shader chunks, renderer hooks, or color APIs. The patterns below describe the current `ShaderMaterial` contract; translate older versions deliberately.

## Stable fullscreen surface

Use a fullscreen triangle or plane and pass a normalized UV. Correct aspect ratio before applying radial distance or noise:

```glsl
vec2 p = vUv * 2.0 - 1.0;
p.x *= uResolution.x / max(uResolution.y, 1.0);
```

Keep time bounded before uploading it to a float uniform when long-running precision matters. Shader-side `mod(uTime, ...)` cannot recover fractional precision already lost during float32 conversion. Wrap a JavaScript double only when every downstream use is periodic at the same boundary:

```ts
const LOOP_SECONDS = 512
const phaseSeconds = ((elapsedSeconds % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS
uniforms.uPhase.value = phaseSeconds * (Math.PI * 2 / LOOP_SECONDS)
```

```glsl
uniform float uPhase;
float phase = uPhase;
vec2 loopOffset = vec2(cos(phase), sin(phase));
```

For non-periodic motion, keep a local time origin or split time into coarse and fine values instead of wrapping arbitrary drifting noise at a visible boundary.

## Perceptual uniforms

Translate user controls into safe shader ranges in TypeScript. Keep public controls stable even if implementation constants change.

```ts
uniforms.uSpeed.value = controls.motionSpeed * 0.35
uniforms.uNoiseScale.value = 0.8 + (5.0 - 0.8) * controls.detail
```

Avoid dozens of unexplained scalar uniforms. Group controls by composition, motion, interaction, color, and quality.

## Anti-aliasing and transitions

- Use `fwidth` plus `smoothstep` for analytical shape edges.
- Replace hard thresholds with a width derived from pixel footprint where possible.
- Keep alpha premultiplication consistent with the renderer and blend mode.
- Inspect gradients for banding; add subtle dither only after fixing color-space and precision issues.

## Color output

Work in Linear-sRGB. Mark color textures as `SRGBColorSpace` and leave data, normal, roughness, and other non-color textures at `NoColorSpace`. A default `ShaderMaterial` that renders to the display should finish with the Three.js output transforms enabled by the renderer:

```glsl
#include <tonemapping_fragment>
#include <colorspace_fragment>
```

Those chunks write `gl_FragColor`. With current Three.js, the default `ShaderMaterial` path supplies that output alias, but explicit `glslVersion: THREE.GLSL3` does not. Declare a GLSL3 output and alias it before including the chunks:

```glsl
layout(location = 0) out vec4 fragColor;
#define gl_FragColor fragColor

void main() {
  fragColor = vec4(linearColor, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
```

Do not declare a second output at the same location. A `RawShaderMaterial` owns its shader declarations and output transforms completely; do not assume the `ShaderMaterial` prefix or helper functions are available.

In an `EffectComposer` chain whose intermediate passes stay in the working color space, normally place `OutputPass` after those passes and near the screen boundary. It applies the tone mapping and output color-space conversion selected on the renderer. A pass that explicitly requires sRGB input, such as FXAA, may follow it. Do not repeat the same tone mapping or output transfer in a custom pass or shader.

## Compilation and readiness

- Keep `renderer.debug.checkShaderErrors` enabled during development and capture `renderer.debug.onShaderError` diagnostics when the installed Three.js version provides that hook.
- When first-frame latency matters and the installed version supports it, use `renderer.compileAsync(scene, camera)` during the loading state. Do not assume a synchronous render throws every shader error.
- Keep the designed fallback visible through valid sizing, asset readiness, compilation, and the first requested stable render. Compilation alone is not product readiness.

## Debug views

Temporarily route one quantity to the output. Replace `gl_FragColor` with the declared output name when a GLSL3 shader does not define the compatibility alias:

```glsl
gl_FragColor = vec4(vUv, 0.0, 1.0);             // coordinates
gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);  // normals
gl_FragColor = vec4(vec3(fieldValue), 1.0);     // scalar field
gl_FragColor = vec4(vec3(alpha), 1.0);          // coverage
```

If output is blank, verify shader logs, camera and bounds, alpha, depth, culling, uniforms, and finite numeric values. If output has rigid bands or columns, inspect quantization, `floor`, `step`, repeated domains, constant anchors, and insufficient phase variation.

## Adaptation rules

- Do not paste ShaderToy code unchanged. Map `iTime`, `iResolution`, `iMouse`, fragment coordinates, texture channels, and entry points explicitly.
- Use `gl_FragColor` with the default `ShaderMaterial` compatibility path. If the material sets `glslVersion: THREE.GLSL3`, declare one fragment output, use GLSL 3 syntax consistently, and alias that output before using Three.js chunks that still reference `gl_FragColor`.
- Do not mix screen-space and world-space values without naming the transform between them.
- Bound ray-march, volume, and nested noise loops. Make quality steps compile-time constants where practical.
- Use a deterministic seed for particles and procedural layouts so captures can be compared.

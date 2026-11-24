import { linearToSrgb3, srgbToLinear3 } from '@vgpu/wgsl-std/color';

struct Params {
  resolution: vec2f,
  time: f32,
  frequency: f32,
  amplitude: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
  baseColor: vec3f,
  _pad3: f32,
  accentColor: vec3f,
  _pad4: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = select(1.7777778, params.resolution.x / max(params.resolution.y, 1.0), params.resolution.y > 0.0);
  let centered = (uv - 0.5) * vec2f(aspect, 1.0);

  let w1 = sin(centered.x * params.frequency + params.time * 0.65) * params.amplitude;
  let w2 = cos(centered.x * (params.frequency * 0.55) - params.time * 0.42 + centered.y * 2.1) * (params.amplitude * 0.7);
  let field = centered.y - (w1 + w2);

  let primary = exp(-abs(field) * 26.0);
  let harmonicA = exp(-abs(field - 0.14) * 22.0) * 0.6;
  let harmonicB = exp(-abs(field + 0.14) * 22.0) * 0.45;
  let envelope = smoothstep(0.02, 0.25, exp(-centered.y * centered.y * 1.4));

  let gridX = smoothstep(0.975, 1.0, abs(sin(centered.x * 14.0)));
  let gridY = smoothstep(0.975, 1.0, abs(sin(centered.y * 14.0)));
  let grid = max(gridX, gridY) * 0.06;

  let base = srgbToLinear3(params.baseColor);
  let accent = srgbToLinear3(params.accentColor);
  let deepInk = accent * 0.55;
  let intensity = clamp((primary + harmonicA + harmonicB) * (0.65 + 0.35 * envelope), 0.0, 1.0);
  let washed = mix(base, deepInk, grid);
  let color = mix(washed, mix(accent, deepInk, primary * 0.35), intensity);

  return vec4f(linearToSrgb3(clamp(color, vec3f(0.0), vec3f(1.0))), 1.0);
}

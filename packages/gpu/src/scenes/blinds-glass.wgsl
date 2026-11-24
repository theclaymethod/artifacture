import { linearToSrgb3, srgbToLinear3, tonemapAces } from '@vgpu/wgsl-std/color';
import { hash2 } from '@vgpu/wgsl-std/hash';

struct Params {
  time: f32,
  periods: f32,
  angleDeg: f32,
  refraction: f32,
  dispersion: f32,
  phase: f32,
  focusX: f32,
  focusY: f32,
  baseColor: vec3f,
  _pad0: f32,
  signalColor: vec3f,
  _pad1: f32,
  heatColor: vec3f,
  _pad2: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

fn sampleField(uv: vec2f, t: f32) -> vec3f {
  let base = srgbToLinear3(params.baseColor);
  let signal = srgbToLinear3(params.signalColor);
  let heat = srgbToLinear3(params.heatColor);

  let wave1 = sin(uv.x * 3.1 + t * 0.35 + uv.y * 1.7) * 0.5 + 0.5;
  let wave2 = cos(uv.y * 4.2 - t * 0.28 + uv.x * 2.3) * 0.5 + 0.5;
  let band = smoothstep(0.18, 0.92, wave1 * 0.65 + wave2 * 0.35);

  let focus = vec2f(params.focusX, params.focusY);
  let dFocus = length((uv - focus) * vec2f(1.7777778, 1.0));
  let heatGlow = exp(-dFocus * dFocus * 3.6);

  var col = mix(base, base * 1.5 + signal * 0.42, band);
  col = mix(col, signal * 0.92, smoothstep(0.55, 0.98, wave2) * 0.45);
  col += heat * (heatGlow * 0.52);
  return col;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let rad = radians(params.angleDeg);
  let dir = vec2f(cos(rad), sin(rad));
  let perp = vec2f(-dir.y, dir.x);

  let aspect = vec2f(1.7777778, 1.0);
  let p = (uv - 0.5) * aspect;
  let coord = dot(p, dir) * params.periods + params.phase;
  let cell = fract(coord);
  let id = floor(coord);

  // Convex glass slat profile [-1, 1] across each blind
  let slatX = cell * 2.0 - 1.0;
  let breath = 0.08 * sin(id * 0.45 + params.time * 0.6);
  let radius = 0.62 + breath;
  let inside = smoothstep(radius, radius - 0.06, abs(slatX));
  let normalX = clamp(slatX / max(radius, 0.01), -1.0, 1.0);
  let normalZ = sqrt(max(0.0, 1.0 - normalX * normalX));

  let offset = dir * (normalX * 0.032 * params.refraction);
  let disp = dir * (normalX * 0.014 * params.dispersion);

  let fieldR = sampleField(uv + offset + disp, params.time);
  let fieldG = sampleField(uv + offset, params.time);
  let fieldB = sampleField(uv + offset - disp, params.time);
  let refracted = vec3f(fieldR.r, fieldG.g, fieldB.b);

  let bg = sampleField(uv, params.time) * 0.72;
  let rim = pow(1.0 - normalZ, 2.8) * 0.42 * inside;
  let spec = pow(max(0.0, normalX * 0.55 + normalZ * 0.82), 20.0) * 0.24 * inside;

  let slatColor = refracted + vec3f(rim + spec) * (srgbToLinear3(params.signalColor) * 0.7 + vec3f(0.3));
  var outCol = mix(bg, slatColor, inside);

  // Vignette and gentle film grain
  let vig = 1.0 - dot(p * 0.62, p * 0.62);
  outCol *= clamp(vig, 0.45, 1.0);
  let grain = (hash2(uv * 1024.0 + vec2f(params.time * 7.0, 3.0)).x - 0.5) * 0.012;

  let srgb = linearToSrgb3(tonemapAces(outCol)) + vec3f(grain);
  return vec4f(clamp(srgb, vec3f(0.0), vec3f(1.0)), 1.0);
}

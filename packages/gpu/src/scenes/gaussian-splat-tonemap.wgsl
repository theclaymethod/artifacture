import {
  applyExposure,
  linearToSrgb3,
  tonemapAces,
} from '@vgpu/wgsl-std/color';
import { hash2 } from '@vgpu/wgsl-std/hash';

struct TonemapUniforms {
  time: f32,
  exposure: f32,
  tunnelMorph: f32,
  vortexMorph: f32,
  resolution: vec2f,
  _pad0: vec2f,
}

@group(0) @binding(0) var<uniform> params: TonemapUniforms;
@group(0) @binding(1) var hdrTex: texture_2d<f32>;
@group(0) @binding(2) var hdrSampler: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let res = max(params.resolution, vec2f(1.0));
  let stepUv = vec2f(1.8) / res;

  let hdr = textureSample(hdrTex, hdrSampler, uv);
  let b0 = textureSample(hdrTex, hdrSampler, uv + vec2f(stepUv.x, stepUv.y)).rgb;
  let b1 = textureSample(hdrTex, hdrSampler, uv + vec2f(-stepUv.x, stepUv.y)).rgb;
  let b2 = textureSample(hdrTex, hdrSampler, uv + vec2f(stepUv.x, -stepUv.y)).rgb;
  let b3 = textureSample(hdrTex, hdrSampler, uv + vec2f(-stepUv.x, -stepUv.y)).rgb;
  let halo = 0.25 * (b0 + b1 + b2 + b3);

  let centered = uv - vec2f(0.5);
  let radial = exp(-dot(centered, centered) * 2.8);
  let backdropEdge = vec3f(0.0012, 0.0022, 0.0055);
  let backdropCenter = mix(
    vec3f(0.0038, 0.0095, 0.022),
    vec3f(0.011, 0.0055, 0.024),
    clamp(params.tunnelMorph + params.vortexMorph * 0.5, 0.0, 1.0),
  );
  let backdrop = mix(backdropEdge, backdropCenter, radial);

  let rawSplat = hdr.rgb + halo * 0.14;
  // Soft HDR knee keeps dense overlapping Gaussian cores rich in hue rather than flat whiteout
  let splatLum = dot(rawSplat, vec3f(0.2126, 0.7152, 0.0722));
  let splatColor = rawSplat / (1.0 + splatLum * 0.42);

  let linearColor = backdrop + splatColor;
  let mapped = tonemapAces(applyExposure(linearColor, params.exposure));
  let grain = (hash2(uv * res + vec2f(params.time * 11.0, 5.0)).x - 0.5) * 0.005;
  let srgb = linearToSrgb3(mapped) + vec3f(grain);
  return vec4f(clamp(srgb, vec3f(0.0), vec3f(1.0)), 1.0);
}

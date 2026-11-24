import { linearToSrgb3, tonemapAces } from '@vgpu/wgsl-std/color';
import { hash2 } from '@vgpu/wgsl-std/hash';

struct SkyUniforms {
  time: f32,
  foldStreet: f32,
  tunnelWrap: f32,
  kaleidoscope: f32,
  daylight: f32,
  fractalSplit: f32,
  resolution: vec2f,
}

@group(0) @binding(0) var<uniform> params: SkyUniforms;

fn noise2D(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash2(i).x;
  let b = hash2(i + vec2f(1.0, 0.0)).x;
  let c = hash2(i + vec2f(0.0, 1.0)).x;
  let d = hash2(i + vec2f(1.0, 1.0)).x;
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn cloudFbm(p: vec2f) -> f32 {
  var val = 0.0;
  val += 0.54 * noise2D(p);
  val += 0.28 * noise2D(p * 2.03 + vec2f(13.1, 7.4));
  val += 0.14 * noise2D(p * 4.17 + vec2f(5.7, 19.3));
  return val;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let y = 1.0 - uv.y;
  let horizonT = smoothstep(0.08, 0.78, y);

  // Dusk sky (for twilight toggle / blend)
  let duskZenith = mix(vec3f(0.045, 0.075, 0.175), vec3f(0.025, 0.032, 0.095), params.tunnelWrap);
  let duskMid = mix(vec3f(0.18, 0.24, 0.42), vec3f(0.11, 0.09, 0.26), params.tunnelWrap);
  let duskHorizon = mix(vec3f(0.92, 0.48, 0.24), vec3f(0.58, 0.34, 0.62), params.tunnelWrap);
  let groundMist = vec3f(0.08, 0.07, 0.12);

  var duskSky = mix(duskHorizon, duskMid, smoothstep(0.28, 0.64, y));
  duskSky = mix(duskSky, duskZenith, smoothstep(0.55, 0.98, y));
  duskSky = mix(groundMist, duskSky, horizonT);
  let duskSunPos = vec2f(0.52, 0.62);
  let dDuskSun = length((uv - duskSunPos) * vec2f(1.4, 1.0));
  duskSky += vec3f(1.0, 0.64, 0.34) * exp(-dDuskSun * 3.8) * (0.48 * (1.0 - params.tunnelWrap * 0.65));

  // Crisp sunlit daytime Manhattan sky + drifting cumulus clouds (linear HDR before ACES)
  let dayZenith = vec3f(0.055, 0.20, 0.56);
  let dayMid = vec3f(0.18, 0.44, 0.78);
  let dayHorizon = vec3f(0.54, 0.70, 0.86);

  var daySky = mix(dayHorizon, dayMid, smoothstep(0.14, 0.54, y));
  daySky = mix(daySky, dayZenith, smoothstep(0.50, 0.98, y));

  let cloudUv = vec2f(uv.x * 3.4 + params.time * 0.008, y * 5.2 - 1.1);
  let cSample = cloudFbm(cloudUv);
  let cloudBand = smoothstep(0.32, 0.58, y) * (1.0 - smoothstep(0.88, 1.0, y));
  let cloudMask = smoothstep(0.5, 0.76, cSample) * cloudBand;
  daySky = mix(daySky, vec3f(0.88, 0.90, 0.94), cloudMask * 0.55);

  // High midday solar scatter glow + crisp central cerulean tunnel aperture
  let daySunPos = vec2f(0.68, 0.24);
  let dDaySun = length((uv - daySunPos) * vec2f(1.35, 1.0));
  let sunScatter = exp(-dDaySun * 3.2) * 0.28;
  daySky += vec3f(0.95, 0.86, 0.70) * sunScatter;

  if (params.tunnelWrap > 0.001) {
    let apCenter = vec2f(0.56, 0.5);
    let dAp = length((uv - apCenter) * vec2f(1.5, 1.0));
    let apBright = exp(-dAp * 4.8) * (0.26 + 0.1 * params.fractalSplit);
    let prismFlare = vec3f(0.42, 0.66, 0.94) * apBright + vec3f(0.92, 0.78, 0.46) * exp(-dAp * 10.0) * 0.16;
    daySky = mix(daySky, dayMid * 0.96 + prismFlare, params.tunnelWrap * 0.68);
  }

  let day = clamp(params.daylight, 0.0, 1.0);
  let sky = mix(duskSky, daySky, day);
  let mapped = tonemapAces(sky);
  let grain = (hash2(uv * max(params.resolution, vec2f(1.0)) + vec2f(params.time * 7.0, 3.0)).x - 0.5) * 0.004;
  let outCol = linearToSrgb3(mapped) + vec3f(grain);
  return vec4f(clamp(outCol, vec3f(0.0), vec3f(1.0)), 1.0);
}

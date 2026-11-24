struct BgUniforms {
  time: f32,
  shockMix: f32,
  dissolveAmt: f32,
  neonHdr: f32,
  resolution: vec2f,
  _pad0: vec2f,
}

@group(0) @binding(0) var<uniform> params: BgUniforms;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let res = max(params.resolution, vec2f(1.0));
  let aspect = res.x / res.y;
  let centered = (uv - vec2f(0.5)) * vec2f(aspect, 1.0);
  let r2 = dot(centered, centered);

  // Pure #000000 obsidian void for monochrome LiDAR shockwave & clean depth separation
  let obsidian = vec3f(0.0, 0.0, 0.0);
  let smokeCenter = vec3f(0.011, 0.013, 0.017);
  let smokeBg = mix(obsidian, smokeCenter, exp(-r2 * 2.2)) * clamp(params.dissolveAmt, 0.0, 1.0);

  let pulseA = 0.5 + 0.5 * sin(params.time * 1.3 - centered.x * 1.4);
  let dLeft = centered - vec2f(-0.36, -0.06);
  let dRight = centered - vec2f(0.32, 0.1);
  let tealGlow = vec3f(0.003, 0.028, 0.04) * exp(-dot(dLeft, dLeft) * 2.2);
  let amberGlow = vec3f(0.045, 0.01, 0.004) * exp(-dot(dRight, dRight) * 2.4);
  let neonBg = mix(tealGlow, amberGlow, 0.38 + 0.28 * pulseA) * clamp(params.neonHdr, 0.0, 1.0);

  let shockBg = vec3f(0.002, 0.0025, 0.0032) * exp(-r2 * 4.2) * clamp(params.shockMix, 0.0, 1.0);

  let col = max(obsidian, smokeBg + neonBg + shockBg);
  return vec4f(col, 1.0);
}

struct SplatUniforms {
  time: f32,
  tunnelMorph: f32,
  vortexMorph: f32,
  camDist: f32,
  camYaw: f32,
  camPitch: f32,
  fov: f32,
  flySpeed: f32,
  offsetX: f32,
  splatScale: f32,
  exposure: f32,
  swirlStrength: f32,
  resolution: vec2f,
  _pad0: vec2f,
}

struct SplatSeed {
  form0: vec4f,
  form1: vec4f,
  form2: vec4f,
  colorOpacity: vec4f,
}

@group(0) @binding(0) var<uniform> params: SplatUniforms;
@group(0) @binding(1) var<storage, read> splats: array<SplatSeed>;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) localCoord: vec2f,
  @location(1) colorAlpha: vec4f,
}

fn rot2(a: f32) -> mat2x2<f32> {
  let c = cos(a);
  let s = sin(a);
  return mat2x2<f32>(vec2f(c, -s), vec2f(s, c));
}

fn tunnelCenter(z: f32, t: f32) -> vec2f {
  let phase = z * 0.24;
  return vec2f(
    sin(phase + t * 0.55) * 0.72 + cos(phase * 0.6 - t * 0.32) * 0.24,
    cos(z * 0.19 - t * 0.42) * 0.48 + sin(z * 0.31 + t * 0.28) * 0.14,
  );
}

fn safeNormalize(v: vec3f, fallback: vec3f) -> vec3f {
  let lenSq = dot(v, v);
  if (lenSq < 1e-8) {
    return fallback;
  }
  return v * inverseSqrt(lenSq);
}

@vertex
fn vs_main(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> VertexOut {
  var out: VertexOut;
  let corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f(1.0, -1.0),
    vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0),
    vec2f(1.0, 1.0),
    vec2f(-1.0, 1.0),
  );
  let corner = corners[vid % 6u];
  let s = splats[iid];

  let tRaw = clamp(params.tunnelMorph, 0.0, 1.0);
  let vRaw = clamp(params.vortexMorph, 0.0, 1.0);
  let wSum = max(1.0, tRaw + vRaw);
  let tW = tRaw / wSum;
  let vW = vRaw / wSum;
  let sW = max(0.0, 1.0 - tW - vW);

  // Form 0: Sculpted architectural crystal diorama (sharp small anisotropic splats)
  var p0 = s.form0.xyz;
  let rot0 = rot2(params.time * 0.16);
  let p0xz = rot0 * p0.xz;
  p0 = vec3f(p0xz.x, p0.y + sin(params.time * 1.15 + length(s.form0.xz) * 2.5) * 0.015, p0xz.y);
  let size0 = max(s.form0.w, 0.35);
  let u0 = safeNormalize(vec3f(-p0.z, 0.0, p0.x), vec3f(1.0, 0.0, 0.0));
  let n0 = safeNormalize(vec3f(p0.x * 0.45, 0.9, p0.z * 0.45), vec3f(0.0, 1.0, 0.0));
  let scale0 = vec3f(0.022, 0.0085, 0.019) * size0;

  // Form 1: Infinite warping wormhole tunnel flowing past the viewer
  let zFlow = fract(s.form1.z + params.time * params.flySpeed * 0.13);
  let zTun = mix(-15.5, 2.0, zFlow);
  let tunFade = smoothstep(-15.5, -12.5, zTun) * (1.0 - smoothstep(0.9, 2.0, zTun));
  let ctr = tunnelCenter(zTun, params.time);
  let angleTwist = s.form1.x + zTun * 0.16 + params.time * 0.22;
  let rPulse = 1.0 + 0.085 * sin(zTun * 0.65 + params.time * 1.35);
  let rTun = s.form1.y * rPulse;
  let p1 = vec3f(ctr.x + cos(angleTwist) * rTun, ctr.y + sin(angleTwist) * rTun, zTun);
  let u1 = safeNormalize(vec3f(-sin(angleTwist), cos(angleTwist), 0.0), vec3f(1.0, 0.0, 0.0));
  let n1 = safeNormalize(vec3f(cos(angleTwist), sin(angleTwist), 0.0), vec3f(0.0, 1.0, 0.0));
  let isRib = step(0.5, s.form1.w);
  let ribScale = vec3f(0.056, 0.012, 0.022);
  let streakScale = vec3f(0.011, 0.011, 0.165);
  let scale1 = mix(streakScale, ribScale, isRib);

  // Form 2: Sweeping 3D Möbius ribbon wave
  let wavePhase = s.form2.w;
  let ribbonRot = rot2(params.time * 0.15);
  var p2 = s.form2.xyz + vec3f(
    0.0,
    sin(wavePhase * 2.0 - params.time * 1.35) * 0.11,
    cos(wavePhase - params.time * 0.65) * 0.04,
  );
  let p2xz = ribbonRot * p2.xz;
  p2 = vec3f(p2xz.x, p2.y, p2xz.y);
  let tangentAngle2 = wavePhase + params.time * 0.15;
  let u2 = safeNormalize(
    vec3f(-sin(tangentAngle2), 0.24 * cos(wavePhase), cos(tangentAngle2)),
    vec3f(1.0, 0.0, 0.0),
  );
  let n2 = safeNormalize(vec3f(cos(tangentAngle2) * sin(wavePhase * 0.5), cos(wavePhase * 0.5), sin(tangentAngle2) * sin(wavePhase * 0.5)), vec3f(0.0, 1.0, 0.0));
  let scale2 = vec3f(0.046, 0.0085, 0.016) * mix(0.75, 1.15, size0 * 0.5);

  // Blend position & mid-morph helical swirl
  var worldPos = p0 * sW + p1 * tW + p2 * vW;
  let transAct = clamp(4.0 * (sW * tW + tW * vW + vW * sW), 0.0, 1.0);
  let swirlAngle = transAct * params.swirlStrength * (1.1 + 0.45 * sin(f32(iid) * 0.017));
  let radialBoost = 1.0 + transAct * 0.26;
  let swirlXY = rot2(swirlAngle) * (worldPos.xy * radialBoost);
  worldPos = vec3f(swirlXY.x, swirlXY.y, worldPos.z);

  let axis0Dir = safeNormalize(u0 * sW + u1 * tW + u2 * vW, vec3f(1.0, 0.0, 0.0));
  let rawAxis1 = n0 * sW + n1 * tW + n2 * vW;
  let ortho1 = safeNormalize(rawAxis1 - axis0Dir * dot(rawAxis1, axis0Dir), vec3f(0.0, 1.0, 0.0));
  let ortho2 = safeNormalize(cross(axis0Dir, ortho1), vec3f(0.0, 0.0, 1.0));
  let worldScale = (scale0 * sW + scale1 * tW + scale2 * vW) * params.splatScale;

  // Directional light modulation so crystal diorama & ribbon read sculpted depth
  let keyLight = normalize(vec3f(0.62, 0.72, 0.32));
  let lit0 = 0.42 + 0.85 * max(dot(n0, keyLight), 0.0);
  let lit2 = 0.48 + 0.80 * abs(dot(n2, keyLight));

  // Camera setup blending smoothly from orbital diorama/ribbon into tunnel flight
  let orbitFwd = normalize(vec3f(
    -sin(params.camYaw) * cos(params.camPitch),
    -sin(params.camPitch),
    -cos(params.camYaw) * cos(params.camPitch),
  ));
  let orbitCamPos = -orbitFwd * params.camDist;

  let tunCamZ = 1.65;
  let tunCamXY = tunnelCenter(tunCamZ, params.time) * 0.48;
  let tunLookXY = tunnelCenter(-4.2, params.time) * 0.52;
  let tunCamPos = vec3f(tunCamXY.x, tunCamXY.y, tunCamZ);
  let tunTarget = vec3f(tunLookXY.x, tunLookXY.y, -4.2);

  let camPos = mix(orbitCamPos, tunCamPos, tW);
  let camTarget = mix(vec3f(0.0, 0.02, 0.0), tunTarget, tW);
  let camFwd = normalize(camTarget - camPos);
  let roll = tW * sin(params.time * 0.55) * 0.11;
  let worldUp = normalize(vec3f(sin(roll), cos(roll), 0.0));
  let camRight = safeNormalize(cross(camFwd, worldUp), vec3f(1.0, 0.0, 0.0));
  let camUp = cross(camRight, camFwd);

  let rel = worldPos - camPos;
  let vx = dot(rel, camRight);
  let vy = dot(rel, camUp);
  let vz = dot(rel, camFwd);

  if (vz < 0.22) {
    out.position = vec4f(2.0, 2.0, 2.0, 1.0);
    out.localCoord = vec2f(0.0);
    out.colorAlpha = vec4f(0.0);
    return out;
  }

  let res = max(params.resolution, vec2f(1.0));
  let aspect = res.x / res.y;
  let tanHalfY = tan(clamp(params.fov, 0.35, 2.1) * 0.5);
  let fy = 0.5 * res.y / tanHalfY;
  let fx = fy;

  let limX = 1.35 * tanHalfY * aspect;
  let limY = 1.35 * tanHalfY;
  let tx = clamp(vx / vz, -limX, limX);
  let ty = clamp(vy / vz, -limY, limY);

  let a0 = axis0Dir * worldScale.x;
  let a1 = ortho1 * worldScale.y;
  let a2 = ortho2 * worldScale.z;

  let cv0 = vec3f(dot(a0, camRight), dot(a0, camUp), dot(a0, camFwd));
  let cv1 = vec3f(dot(a1, camRight), dot(a1, camUp), dot(a1, camFwd));
  let cv2 = vec3f(dot(a2, camRight), dot(a2, camUp), dot(a2, camFwd));

  let invZ = 1.0 / vz;
  let j0 = vec2f(fx * (cv0.x - tx * cv0.z) * invZ, fy * (cv0.y - ty * cv0.z) * invZ);
  let j1 = vec2f(fx * (cv1.x - tx * cv1.z) * invZ, fy * (cv1.y - ty * cv1.z) * invZ);
  let j2 = vec2f(fx * (cv2.x - tx * cv2.z) * invZ, fy * (cv2.y - ty * cv2.z) * invZ);

  let aRaw = j0.x * j0.x + j1.x * j1.x + j2.x * j2.x;
  let b = j0.x * j0.y + j1.x * j1.y + j2.x * j2.y;
  let cRaw = j0.y * j0.y + j1.y * j1.y + j2.y * j2.y;

  let a = aRaw + 0.25;
  let c = cRaw + 0.25;
  let detRaw = max(aRaw * cRaw - b * b, 0.001);
  let detReg = max(a * c - b * b, 0.01);
  let aaGain = clamp(sqrt(detRaw / detReg), 0.30, 1.0);

  let mid = 0.5 * (a + c);
  let halfDiff = 0.5 * (a - c);
  let disc = sqrt(max(halfDiff * halfDiff + b * b, 0.0));
  let lambda1 = mid + disc;
  let lambda2 = max(mid - disc, 0.12);

  let rawAxisA = vec2f(b, lambda1 - a);
  let rawAxisB = vec2f(lambda1 - c, b);
  let bestAxis = select(rawAxisB, rawAxisA, dot(rawAxisA, rawAxisA) >= dot(rawAxisB, rawAxisB));
  let axisLenSq = dot(bestAxis, bestAxis);
  let eigVec1 = select(vec2f(1.0, 0.0), bestAxis * inverseSqrt(axisLenSq), axisLenSq > 1e-8);
  let eigVec2 = vec2f(-eigVec1.y, eigVec1.x);

  let r1 = clamp(2.8 * sqrt(lambda1), 1.0, 64.0);
  let r2 = clamp(2.8 * sqrt(lambda2), 1.0, 64.0);

  let pxCenter = vec2f(
    fx * (vx * invZ) + params.offsetX * 0.5 * res.x,
    fy * (vy * invZ),
  );
  let pxVert = pxCenter + corner.x * eigVec1 * r1 + corner.y * eigVec2 * r2;
  let ndc = pxVert / (0.5 * res);

  // Per-form jewel palette tuning (restrained luminance to avoid whiteout)
  let col0 = s.colorOpacity.rgb * lit0 * 0.52;
  let tunRibCol = vec3f(0.88, 0.42, 0.24);
  let tunWallCol = mix(vec3f(0.08, 0.42, 0.85), vec3f(0.38, 0.18, 0.85), 0.5 + 0.5 * sin(angleTwist * 2.0));
  let tunCol = mix(tunWallCol, tunRibCol, isRib);
  let col2 = (mix(s.colorOpacity.rgb * 0.72, vec3f(0.82, 0.26, 0.72) + vec3f(0.10, 0.45, 0.35) * cos(wavePhase), 0.52)) * lit2 * 0.55;
  let finalRgb = col0 * sW + tunCol * tW + col2 * vW;

  let edgeVisibility = mix(1.0, tunFade, tW);
  let depthFade = clamp(1.0 - (vz - 11.0) * 0.08, 0.20, 1.0);
  let densityGain = 0.38 * sW + 0.62 * tW + 0.42 * vW;
  let opacity = clamp(s.colorOpacity.a * densityGain * aaGain * edgeVisibility * depthFade, 0.0, 0.55);

  out.position = vec4f(ndc, 0.0, 1.0);
  out.localCoord = corner * 2.8;
  out.colorAlpha = vec4f(finalRgb, opacity);
  return out;
}

@fragment
fn fs_main(@location(0) localCoord: vec2f, @location(1) colorAlpha: vec4f) -> @location(0) vec4f {
  let r2 = dot(localCoord, localCoord);
  if (r2 > 7.84) {
    discard;
  }
  let gauss = exp(-0.62 * r2);
  let alpha = clamp(gauss * colorAlpha.a, 0.0, 1.0);
  if (alpha < 0.002) {
    discard;
  }
  return vec4f(colorAlpha.rgb * alpha, alpha);
}

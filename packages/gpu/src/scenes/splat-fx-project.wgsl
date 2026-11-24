struct FxUniforms {
  time: f32,
  monochrome: f32,
  pointMix: f32,
  shockMix: f32,
  shockSpeed: f32,
  dissolveAmt: f32,
  curlStrength: f32,
  geoWave: f32,
  shatterAmt: f32,
  neonHdr: f32,
  camDist: f32,
  camYaw: f32,
  camPitch: f32,
  camRoll: f32,
  focusY: f32,
  fov: f32,
  offsetX: f32,
  splatScale: f32,
  orbitSpeed: f32,
  exposure: f32,
  resolution: vec2f,
  _pad0: vec2f,
}

struct RealSplatSeed {
  // xyz = Y-up world position (meters), w = opacity
  posOpacity: vec4f,
  // xyz = Gaussian principal scales (meters), w = random hash / tag
  scaleMeta: vec4f,
  // xyzw = orientation quaternion (x, y, z, w)
  quat: vec4f,
  // rgb = captured sRGB albedo [0..1], w = normalized height
  colorHeight: vec4f,
}

struct ProjectedSplat {
  // xy = ndc center, zw = radius1Px, radius2Px
  centerRad: vec4f,
  // xy = eigVec1, z = depth (vz), w = visibleFlag (1.0 or 0.0)
  axisDepth: vec4f,
  // rgba = display sRGB color + final opacity
  colorAlpha: vec4f,
}

@group(0) @binding(0) var<uniform> params: FxUniforms;
@group(0) @binding(1) var<storage, read> seeds: array<RealSplatSeed>;
@group(0) @binding(2) var<storage, read_write> projected: array<ProjectedSplat>;
@group(0) @binding(3) var<storage, read_write> sortKeys: array<u32>;
@group(0) @binding(4) var<storage, read_write> sortIndices: array<u32>;

fn hash11(p: f32) -> f32 {
  let x = sin(p * 127.1 + 311.7) * 43758.5453;
  return fract(x);
}

fn hash31(p: vec3f) -> f32 {
  let h = dot(p, vec3f(127.1, 311.7, 74.7));
  return fract(sin(h) * 43758.5453123);
}

fn hash33(p: vec3f) -> vec3f {
  let x = fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453);
  let y = fract(sin(dot(p, vec3f(269.5, 183.3, 246.1))) * 43758.5453);
  let z = fract(sin(dot(p, vec3f(113.5, 271.9, 124.6))) * 43758.5453);
  return vec3f(x, y, z);
}

fn noise3(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (vec3f(3.0) - 2.0 * f);

  let n000 = hash31(i + vec3f(0.0, 0.0, 0.0));
  let n100 = hash31(i + vec3f(1.0, 0.0, 0.0));
  let n010 = hash31(i + vec3f(0.0, 1.0, 0.0));
  let n110 = hash31(i + vec3f(1.0, 1.0, 0.0));
  let n001 = hash31(i + vec3f(0.0, 0.0, 1.0));
  let n101 = hash31(i + vec3f(1.0, 0.0, 1.0));
  let n011 = hash31(i + vec3f(0.0, 1.0, 1.0));
  let n111 = hash31(i + vec3f(1.0, 1.0, 1.0));

  let nx00 = mix(n000, n100, u.x);
  let nx10 = mix(n010, n110, u.x);
  let nx01 = mix(n001, n101, u.x);
  let nx11 = mix(n011, n111, u.x);
  let nxy0 = mix(nx00, nx10, u.y);
  let nxy1 = mix(nx01, nx11, u.y);
  return mix(nxy0, nxy1, u.z);
}

fn fbm2(p: vec3f) -> f32 {
  var v = 0.65 * noise3(p);
  v += 0.35 * noise3(p * 2.07 + vec3f(17.3, 9.2, 13.7));
  return v;
}

fn potentialField(p: vec3f) -> vec3f {
  let px = noise3(p);
  let py = noise3(p + vec3f(31.4, 17.8, 53.2));
  let pz = noise3(p + vec3f(73.1, 41.6, 19.3));
  return vec3f(px, py, pz);
}

fn curlNoise3D(p: vec3f) -> vec3f {
  let eps = 0.14;
  let c0 = potentialField(p);
  let dx = (potentialField(p + vec3f(eps, 0.0, 0.0)) - c0) / eps;
  let dy = (potentialField(p + vec3f(0.0, eps, 0.0)) - c0) / eps;
  let dz = (potentialField(p + vec3f(0.0, 0.0, eps)) - c0) / eps;
  return vec3f(dy.z - dz.y, dz.x - dx.z, dx.y - dy.x);
}

fn safeNorm(v: vec3f, fallback: vec3f) -> vec3f {
  let l2 = dot(v, v);
  if (l2 < 1e-8) {
    return fallback;
  }
  return v * inverseSqrt(l2);
}

fn rotXZ(v: vec3f, a: f32) -> vec3f {
  let c = cos(a);
  let s = sin(a);
  return vec3f(v.x * c - v.z * s, v.y, v.x * s + v.z * c);
}

fn rotXY(v: vec3f, a: f32) -> vec3f {
  let c = cos(a);
  let s = sin(a);
  return vec3f(v.x * c - v.y * s, v.x * s + v.y * c, v.z);
}

@compute @workgroup_size(256)
fn cs_project(@builtin(global_invocation_id) gid: vec3u) {
  let iid = gid.x;
  let count = arrayLength(&seeds);
  if (iid >= count) {
    return;
  }

  let s = seeds[iid];
  let baseOpacity = s.posOpacity.w;
  if (baseOpacity <= 0.004) {
    projected[iid].centerRad = vec4f(2.0, 2.0, 0.0, 0.0);
    projected[iid].axisDepth = vec4f(1.0, 0.0, 0.0, 0.0);
    projected[iid].colorAlpha = vec4f(0.0);
    sortKeys[iid] = 0u;
    sortIndices[iid] = iid;
    return;
  }

  let seedA = hash11(f32(iid) * 0.0173 + s.scaleMeta.w * 19.7);
  let seedB = hash11(f32(iid) * 0.0317 + 7.13);
  let t = params.time;

  let basePos = s.posOpacity.xyz;
  let baseRgb = s.colorHeight.rgb;
  let lum = dot(baseRgb, vec3f(0.299, 0.587, 0.114));

  // Unpack unit quaternion (qx, qy, qz, qw) -> orthonormal columns [a0, a1, a2] * scale
  let qLenSq = dot(s.quat, s.quat);
  let q = select(vec4f(0.0, 0.0, 0.0, 1.0), s.quat * inverseSqrt(max(qLenSq, 1e-8)), qLenSq > 1e-8);
  let qx = q.x;
  let qy = q.y;
  let qz = q.z;
  let qw = q.w;
  let xx = qx * qx;
  let yy = qy * qy;
  let zz = qz * qz;
  let xy = qx * qy;
  let xz = qx * qz;
  let yz = qy * qz;
  let wx = qw * qx;
  let wy = qw * qy;
  let wz = qw * qz;

  let col0 = vec3f(1.0 - 2.0 * (yy + zz), 2.0 * (xy + wz), 2.0 * (xz - wy));
  let col1 = vec3f(2.0 * (xy - wz), 1.0 - 2.0 * (xx + zz), 2.0 * (yz + wx));
  let col2 = vec3f(2.0 * (xz + wy), 2.0 * (yz - wx), 1.0 - 2.0 * (xx + yy));

  let sVec = max(s.scaleMeta.xyz, vec3f(0.002));
  let isoRad = clamp(length(sVec) * 0.2, 0.008, 0.024);
  let effScale = mix(
    sVec * max(params.splatScale, 0.1),
    vec3f(isoRad) * max(params.splatScale, 0.1),
    clamp(params.pointMix, 0.0, 1.0),
  );

  var a0 = col0 * effScale.x;
  var a1 = col1 * effScale.y;
  var a2 = col2 * effScale.z;

  var fxPos = basePos;
  var fxRgb = baseRgb;
  let radialFade = 1.0 - smoothstep(7.4, 10.6, length(basePos.xz));
  var fxOpacity = baseOpacity * radialFade;

  // Base monochrome LiDAR grade (silver-white crisp contrast)
  if (params.monochrome > 0.001) {
    let monoCurve = pow(clamp(lum * 1.18, 0.0, 1.0), 0.78);
    let monoCol = vec3f(0.92, 0.95, 1.0) * monoCurve;
    fxRgb = mix(fxRgb, monoCol, clamp(params.monochrome, 0.0, 1.0));
  }

  // ── Effect A: Monochrome LiDAR Spherical Shockwave (@gerrylistudio) ─────────
  if (params.shockMix > 0.001) {
    let shockW = clamp(params.shockMix, 0.0, 1.0);
    let shockOrigin = vec3f(0.0, 0.05, 0.0);
    let dVec = basePos - shockOrigin;
    let rGround = length(basePos.xz);
    let rSph = length(vec3f(basePos.x, (basePos.y - 0.9) * 0.9, basePos.z));

    // Continually expanding spherical / ground shockwave ring across the upright clearing
    let waveCycle = fract(t * 0.23 * max(params.shockSpeed, 0.1));
    let rWave = 1.1 + waveCycle * 6.4;
    let ringDist = abs(rSph - rWave);
    let groundRingDist = abs(rGround - rWave);

    let ringBand = exp(-ringDist * ringDist * 14.0);
    let groundRingBand = exp(-groundRingDist * groundRingDist * 16.0) * smoothstep(1.1, 0.0, abs(basePos.y));
    let waveGlow = max(ringBand, groundRingBand * 1.2);

    // Soft spherical boundary veil & interior reveal
    let revealedMask = 1.0 - smoothstep(rWave - 0.15, rWave + 1.35, rSph);
    let outerSphereFade = 1.0 - smoothstep(5.8, 8.0, rSph);
    let groundKeep = smoothstep(1.1, 0.0, abs(basePos.y)) * smoothstep(7.2, 4.8, rGround);
    let visMask = max(revealedMask * outerSphereFade, groundKeep * revealedMask * 0.92);

    // Secondary echo ripple for LiDAR ring crispness
    let rEcho = max(0.25, rWave - 1.35);
    let echoDist = abs(rGround - rEcho);
    let echoGlow = exp(-echoDist * echoDist * 26.0) * smoothstep(1.1, 0.0, abs(basePos.y)) * 0.42;

    let crestLift = (ringBand + groundRingBand) * 0.14 * shockW;
    let dirXZ = safeNorm(vec3f(dVec.x, 0.0, dVec.z), vec3f(0.0, 0.0, 1.0));
    fxPos += vec3f(dirXZ.x * crestLift * 0.45, crestLift, dirXZ.z * crestLift * 0.45);

    let brightLidar = vec3f(0.98, 0.99, 1.0) * (0.28 + 0.95 * pow(clamp(lum * 1.25, 0.0, 1.0), 0.72));
    let ringColor = vec3f(1.38, 1.4, 1.44) * (waveGlow + echoGlow);
    fxRgb = mix(fxRgb, brightLidar * visMask + ringColor * outerSphereFade, shockW);

    let activeAlpha = clamp(visMask * (0.72 + waveGlow * 1.4 + echoGlow) + waveGlow * 0.85, 0.02, 1.0);
    fxOpacity *= mix(1.0, activeAlpha, shockW);

    let crestBoost = 1.0 + (waveGlow * 0.55) * shockW;
    a0 *= crestBoost;
    a1 *= crestBoost;
    a2 *= crestBoost;
  }

  // ── Effect B: Curl-Noise Smoke & Fine Sand Dissolution (chantal.matar) ─────
  if (params.dissolveAmt > 0.001) {
    let dissW = clamp(params.dissolveAmt, 0.0, 1.0);
    let planeAxis = normalize(vec3f(0.66, 0.52, -0.3));
    let diagCoord = dot(basePos - vec3f(0.0, 0.9, 0.0), planeAxis);
    let edgeNoise = (fbm2(basePos * 0.72 + vec3f(0.0, -t * 0.12, t * 0.06)) - 0.5) * 1.65;
    let waveBreath = sin(t * 0.65) * 0.25;
    let threshold = mix(2.7, -0.35, dissW) + waveBreath;
    let erode = smoothstep(threshold - 0.55, threshold + 1.15, diagCoord + edgeNoise);

    if (erode > 0.001) {
      let curlPos = fxPos * 0.48 + vec3f(t * 0.08, -t * 0.16, t * 0.05);
      let curlA = curlNoise3D(curlPos);
      let curlB = curlNoise3D(fxPos * 1.25 - vec3f(t * 0.14, t * 0.22, 0.0));
      let driftDir = curlA * 1.25 + vec3f(0.28, 1.15, 0.16) * (0.45 + 0.75 * seedA);
      let dispScale = erode * erode * clamp(params.curlStrength, 0.0, 2.5) * 1.55;

      if (seedA < 0.58) {
        // Population 1: Broad swirling volumetric smoke puffs
        fxPos += driftDir * dispScale + curlB * (0.28 * erode);
        let puffScale = mix(1.0, 3.8 + seedB * 2.0, smoothstep(0.05, 0.9, erode));
        a0 *= puffScale;
        a1 *= puffScale;
        a2 *= puffScale;

        let smokeSlate = vec3f(0.46, 0.5, 0.57) * (0.38 + 0.72 * lum);
        let warmEdge = mix(smokeSlate, vec3f(0.62, 0.64, 0.68), smoothstep(0.0, 0.35, erode) * (1.0 - erode));
        fxRgb = mix(fxRgb, warmEdge, smoothstep(0.04, 0.78, erode) * 0.92);
        fxOpacity *= mix(1.0, 0.19 + 0.11 * seedB, smoothstep(0.08, 0.85, erode));
      } else {
        // Population 2: Fine turbulent sparkling sand & ash grains
        fxPos += (driftDir * 1.18 + curlB * 0.72) * dispScale;
        let grainScale = mix(1.0, 0.34 + 0.16 * seedB, smoothstep(0.05, 0.8, erode));
        a0 *= grainScale;
        a1 *= grainScale;
        a2 *= grainScale;

        let ashGrain = mix(vec3f(0.72, 0.75, 0.8), vec3f(0.95, 0.92, 0.86), seedB);
        fxRgb = mix(fxRgb, ashGrain * (0.42 + 0.85 * lum), smoothstep(0.08, 0.72, erode));
        fxOpacity *= mix(1.0, 0.52 + 0.28 * seedB, erode) * (1.0 - smoothstep(0.85, 1.25, erode) * 0.45);
      }
    }
  }

  // ── Effect C: HDR Neon Point-Cloud Drift (sur.render Reel DfpnAGbAClG) ──────
  if (params.neonHdr > 0.001) {
    let neonW = clamp(params.neonHdr, 0.0, 1.0);
    let splitWave = sin(fxPos.x * 0.52 + fxPos.y * 0.34 - t * 1.45 + (fbm2(fxPos * 0.55) - 0.5) * 2.2);
    let splitT = smoothstep(-0.55, 0.55, splitWave);
    let emberPulse = smoothstep(0.35, 0.95, fbm2(fxPos * 0.85 + vec3f(0.0, -t * 0.42, t * 0.18)));

    let electricCyan = vec3f(0.04, 0.96, 0.94);
    let deepTeal = vec3f(0.02, 0.48, 0.64);
    let blazingVermilion = vec3f(1.24, 0.22, 0.04);
    let hotAmber = vec3f(1.18, 0.62, 0.09);

    let cyanSide = mix(deepTeal, electricCyan, clamp(lum * 1.4 + emberPulse * 0.35, 0.0, 1.0));
    let warmSide = mix(blazingVermilion, hotAmber, emberPulse * 0.7 + lum * 0.3);
    let neonBase = mix(cyanSide, warmSide, splitT);

    let lumBoost = 0.24 + 1.15 * pow(clamp(lum * 1.25, 0.0, 1.0), 0.72) + 0.45 * emberPulse;
    let neonColor = neonBase * lumBoost;

    let emberMask = smoothstep(0.55, 0.98, seedA) * smoothstep(0.25, 2.0, fxPos.y);
    let nCurl = curlNoise3D(fxPos * 0.65 + vec3f(0.0, -t * 0.28, t * 0.14));
    fxPos += vec3f(nCurl.x * 0.32, 0.18 + abs(nCurl.y) * 0.48, nCurl.z * 0.32) * emberMask * neonW * clamp(params.curlStrength, 0.2, 1.8);

    // Restrained vertical specular streaks keeping isotropic points clean without spiky triangles
    let streakAmp = 1.0 + 0.95 * smoothstep(0.82, 0.99, seedA) * neonW;
    a1 *= streakAmp;

    fxRgb = mix(fxRgb, neonColor, neonW);
    fxOpacity *= mix(1.0, 0.78 + 0.32 * emberPulse, neonW);
  }

  // ── Effect D: Geometric Concentric Wave & Faceted 3D Shatter ───────────────
  if (params.geoWave > 0.001 || params.shatterAmt > 0.001) {
    let waveW = clamp(params.geoWave, 0.0, 1.5);
    let shatW = clamp(params.shatterAmt, 0.0, 1.5);
    let radXZ = length(basePos.xz);
    let ringStep = 0.65;
    let ringIdx = floor(radXZ / ringStep);
    let bandBit = i32(ringIdx) & 1;
    let bandSign = select(-1.0, 1.0, bandBit == 0);

    let wavePhase = radXZ * 2.4 - t * 3.0;
    let yWave = sin(wavePhase) * 0.45 * smoothstep(8.2, 0.6, radXZ) * waveW;
    let ringSpin = bandSign * (0.24 * sin(t * 0.95 + ringIdx * 0.75)) * waveW;

    fxPos = rotXZ(fxPos, ringSpin);
    fxPos.y += yWave;
    a0 = rotXZ(a0, ringSpin);
    a1 = rotXZ(a1, ringSpin);
    a2 = rotXZ(a2, ringSpin);

    let peakHighlight = smoothstep(0.55, 0.98, sin(wavePhase)) * waveW;
    fxRgb = mix(fxRgb, mix(fxRgb, vec3f(0.45, 0.9, 1.0), 0.65), peakHighlight * 0.45);

    if (shatW > 0.001) {
      let cellCoord = floor(basePos * 0.85);
      let cellLocal = fract(basePos * 0.85) - vec3f(0.5);
      let cellEdge = smoothstep(0.32, 0.49, max(abs(cellLocal.x), max(abs(cellLocal.y), abs(cellLocal.z))));
      let cellRand = hash33(cellCoord);
      let shardDir = safeNorm(cellRand - vec3f(0.5), vec3f(0.0, 1.0, 0.0));
      let shardLift = smoothstep(0.15, 0.95, cellRand.y) * 0.85;
      let radialExplode = safeNorm(vec3f(basePos.x, 0.25, basePos.z), vec3f(0.0, 1.0, 0.0)) * 0.55;
      let shardDisp = (shardDir * 0.75 + radialExplode + vec3f(0.0, shardLift, 0.0)) * shatW;

      let shardSpin = (cellRand.x - 0.5) * 1.35 * shatW;
      let cellPivot = (cellCoord + vec3f(0.5)) / 0.85;
      fxPos = rotXY(fxPos - cellPivot, shardSpin) + cellPivot + shardDisp;
      a0 = rotXY(a0, shardSpin);
      a1 = rotXY(a1, shardSpin);
      a2 = rotXY(a2, shardSpin);

      fxRgb = mix(fxRgb, vec3f(0.58, 0.92, 1.04), cellEdge * shatW * 0.52);
    }
  }

  // Soft roll-off so HDR highlights stay saturated before 8-bit render buffer output
  fxRgb = fxRgb / (vec3f(1.0) + max(fxRgb, vec3f(0.0)) * 0.16);
  fxRgb *= clamp(params.exposure, 0.2, 2.5);

  // ── Orbital & Dutch-Angle Camera ───────────────────────────────────────────
  let yaw = params.camYaw + t * params.orbitSpeed;
  let pitch = clamp(params.camPitch, -0.6, 0.85);
  let dist = max(params.camDist, 1.2);
  let targetPos = vec3f(0.0, params.focusY, 0.0);

  let cp = cos(pitch);
  let sp = sin(pitch);
  let cy = cos(yaw);
  let sy = sin(yaw);

  let camOffset = vec3f(dist * cp * sy, dist * sp, dist * cp * cy);
  let camPos = targetPos + camOffset;

  let worldUp = vec3f(0.0, 1.0, 0.0);
  let camFwd = safeNorm(targetPos - camPos, vec3f(0.0, 0.0, -1.0));
  let baseRight = safeNorm(cross(camFwd, worldUp), vec3f(1.0, 0.0, 0.0));
  let baseUp = safeNorm(cross(baseRight, camFwd), worldUp);

  let cr = cos(params.camRoll);
  let sr = sin(params.camRoll);
  let camRight = baseRight * cr + baseUp * sr;
  let camUp = -baseRight * sr + baseUp * cr;

  let rel = fxPos - camPos;
  let vx = dot(rel, camRight);
  let vy = dot(rel, camUp);
  let vz = dot(rel, camFwd);

  let res = max(params.resolution, vec2f(1.0));
  let aspect = res.x / res.y;
  let tanHalfY = tan(clamp(params.fov, 0.35, 2.0) * 0.5);
  let fy = 0.5 * res.y / tanHalfY;
  let fx = fy;

  let nearFade = smoothstep(0.35, 1.1, vz);
  var visible = vz > 0.35 && fxOpacity * nearFade > 0.008;
  let invZ = 1.0 / max(vz, 0.35);
  let pxCenter = vec2f(
    fx * (vx * invZ) + params.offsetX * 0.5 * res.x,
    fy * (vy * invZ),
  );
  let ndc = pxCenter / (0.5 * res);
  if (abs(ndc.x) > 1.38 || abs(ndc.y) > 1.38) {
    visible = false;
  }

  if (!visible) {
    projected[iid].centerRad = vec4f(2.0, 2.0, 0.0, 0.0);
    projected[iid].axisDepth = vec4f(1.0, 0.0, 0.0, 0.0);
    projected[iid].colorAlpha = vec4f(0.0);
    sortKeys[iid] = 0u;
    sortIndices[iid] = iid;
    return;
  }

  // Standard 3DGS EWA Jacobian projection
  let limX = 1.35 * tanHalfY * aspect;
  let limY = 1.35 * tanHalfY;
  let tx = clamp(vx * invZ, -limX, limX);
  let ty = clamp(vy * invZ, -limY, limY);

  let cv0 = vec3f(dot(a0, camRight), dot(a0, camUp), dot(a0, camFwd));
  let cv1 = vec3f(dot(a1, camRight), dot(a1, camUp), dot(a1, camFwd));
  let cv2 = vec3f(dot(a2, camRight), dot(a2, camUp), dot(a2, camFwd));

  let j0 = vec2f(fx * (cv0.x - tx * cv0.z) * invZ, fy * (cv0.y - ty * cv0.z) * invZ);
  let j1 = vec2f(fx * (cv1.x - tx * cv1.z) * invZ, fy * (cv1.y - ty * cv1.z) * invZ);
  let j2 = vec2f(fx * (cv2.x - tx * cv2.z) * invZ, fy * (cv2.y - ty * cv2.z) * invZ);

  let a = j0.x * j0.x + j1.x * j1.x + j2.x * j2.x + 0.25;
  let b = j0.x * j0.y + j1.x * j1.y + j2.x * j2.y;
  let c = j0.y * j0.y + j1.y * j1.y + j2.y * j2.y + 0.25;

  let mid = 0.5 * (a + c);
  let halfDiff = 0.5 * (a - c);
  let disc = sqrt(max(halfDiff * halfDiff + b * b, 0.0));
  let lambda1 = mid + disc;
  let lambda2 = max(mid - disc, 0.14);

  let rawAxisA = vec2f(b, lambda1 - a);
  let rawAxisB = vec2f(lambda1 - c, b);
  let bestAxis = select(rawAxisB, rawAxisA, dot(rawAxisA, rawAxisA) >= dot(rawAxisB, rawAxisB));
  let axisLenSq = dot(bestAxis, bestAxis);
  let eigVec1 = select(vec2f(1.0, 0.0), bestAxis * inverseSqrt(axisLenSq), axisLenSq > 1e-8);

  let r1 = clamp(3.0 * sqrt(lambda1), 0.6, 56.0);
  let r2 = clamp(3.0 * sqrt(lambda2), 0.6, 56.0);
  let outAlpha = clamp(fxOpacity * nearFade, 0.0, 1.0);

  projected[iid].centerRad = vec4f(ndc, r1, r2);
  projected[iid].axisDepth = vec4f(eigVec1, vz, 1.0);
  projected[iid].colorAlpha = vec4f(clamp(fxRgb, vec3f(0.0), vec3f(1.0)), outAlpha);

  // Farther splats receive SMALLER keys so ascending bitonic sort renders back-to-front
  sortKeys[iid] = 0xFFFFFFFFu - bitcast<u32>(vz);
  sortIndices[iid] = iid;
}

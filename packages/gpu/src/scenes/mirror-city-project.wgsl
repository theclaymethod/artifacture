struct CityUniforms {
  time: f32,
  foldStreet: f32,
  kaleidoscope: f32,
  fractureLift: f32,
  tunnelWrap: f32,
  fractalSplit: f32,
  daylight: f32,
  camX: f32,
  camY: f32,
  camZ: f32,
  camYaw: f32,
  camPitch: f32,
  camRoll: f32,
  fov: f32,
  offsetX: f32,
  splatScale: f32,
  flySpeed: f32,
  _pad0: f32,
  resolution: vec2f,
}

struct RealSplatSeed {
  // xyz = Y-up world position (meters), w = opacity
  posOpacity: vec4f,
  // xyz = Gaussian principal scales (meters), w = city-block hash [0..1)
  scaleMeta: vec4f,
  // xyzw = orientation quaternion (x, y, z, w)
  quat: vec4f,
  // rgb = captured sRGB albedo [0..1], w = normalized height
  colorHeight: vec4f,
}

struct ProjectedSplat {
  // xy = ndc center, zw = r1Px, r2Px
  centerRad: vec4f,
  // xy = eigVec1, z = depth (vz), w = visibleFlag (1.0 or 0.0)
  axisDepth: vec4f,
  // rgba = display sRGB color + final opacity
  colorAlpha: vec4f,
}

@group(0) @binding(0) var<uniform> params: CityUniforms;
@group(0) @binding(1) var<storage, read> seeds: array<RealSplatSeed>;
@group(0) @binding(2) var<storage, read_write> projected: array<ProjectedSplat>;
@group(0) @binding(3) var<storage, read_write> sortKeys: array<u32>;
@group(0) @binding(4) var<storage, read_write> sortIndices: array<u32>;

fn hash11(p: f32) -> f32 {
  let x = sin(p * 127.1 + 311.7) * 43758.5453;
  return fract(x);
}

fn safeNorm(v: vec3f, fallback: vec3f) -> vec3f {
  let l2 = dot(v, v);
  if (l2 < 1e-8) {
    return fallback;
  }
  return v * inverseSqrt(l2);
}

fn rotXY(v: vec3f, a: f32) -> vec3f {
  let c = cos(a);
  let s = sin(a);
  return vec3f(v.x * c - v.y * s, v.x * s + v.y * c, v.z);
}

fn rotXZ(v: vec3f, a: f32) -> vec3f {
  let c = cos(a);
  let s = sin(a);
  return vec3f(v.x * c - v.z * s, v.y, v.x * s + v.z * c);
}

fn rotYZ(v: vec3f, a: f32) -> vec3f {
  let c = cos(a);
  let s = sin(a);
  return vec3f(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
}

fn rotateInXYToAngle(v: vec3f, theta: f32) -> vec3f {
  let cW = cos(theta);
  let sW = sin(theta);
  return vec3f(-v.x * sW - v.y * cW, v.x * cW - v.y * sW, v.z);
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

  // Exact quaternion -> orthonormal basis axes scaled by principal splat sigmas
  let qx = s.quat.x;
  let qy = s.quat.y;
  let qz = s.quat.z;
  let qw = s.quat.w;
  let xx = qx * qx;
  let yy = qy * qy;
  let zz = qz * qz;
  let xy = qx * qy;
  let xz = qx * qz;
  let yz = qy * qz;
  let wx = qw * qx;
  let wy = qw * qy;
  let wz = qw * qz;

  let rotCol0 = vec3f(1.0 - 2.0 * (yy + zz), 2.0 * (xy + wz), 2.0 * (xz - wy));
  let rotCol1 = vec3f(2.0 * (xy - wz), 1.0 - 2.0 * (xx + zz), 2.0 * (yz + wx));
  let rotCol2 = vec3f(2.0 * (xz + wy), 2.0 * (yz - wx), 1.0 - 2.0 * (xx + yy));

  var a0 = rotCol0 * (s.scaleMeta.x * params.splatScale);
  var a1 = rotCol1 * (s.scaleMeta.y * params.splatScale);
  var a2 = rotCol2 * (s.scaleMeta.z * params.splatScale);

  // Camera frame + bounded forward cruise through the real NYC capture
  let tun = clamp(params.tunnelWrap, 0.0, 1.0);
  let baseCamPos = vec3f(params.camX, params.camY, params.camZ);
  let camFwd = normalize(vec3f(
    -sin(params.camYaw) * cos(params.camPitch),
    sin(params.camPitch),
    -cos(params.camYaw) * cos(params.camPitch),
  ));
  let baseUp = vec3f(sin(params.camRoll), cos(params.camRoll), 0.0);
  let camRight = safeNorm(cross(camFwd, baseUp), vec3f(1.0, 0.0, 0.0));
  let camUp = cross(camRight, camFwd);

  let flatFwd = safeNorm(vec3f(camFwd.x, 0.0, camFwd.z), vec3f(0.0, 0.0, -1.0));
  let flyDist = sin(params.time * 0.32 * params.flySpeed) * 6.5
    + clamp(params.time * 0.95 * params.flySpeed, -8.5, 8.5) * (1.0 - tun);
  let camPos = baseCamPos + flatFwd * flyDist;

  // Step 1: Coherent architectural 3-tier Doctor Strange fractal splits + tectonic block lift
  let basePos = s.posOpacity.xyz;
  let blockCoord = floor(basePos.xz / 16.0);
  let blockCenter = vec3f((blockCoord.x + 0.5) * 16.0, 0.0, (blockCoord.y + 0.5) * 16.0);
  var localP = basePos - blockCenter;

  let fSplit = clamp(params.fractalSplit, 0.0, 1.0);
  let fLift = clamp(params.fractureLift, 0.0, 1.0);
  var seamGlow = 0.0;

  if (fSplit > 0.001) {
    // Tier 1: Crisp 45-degree diagonal origami shear plane per tower block
    let diag = (localP.x + (basePos.y - 6.0)) * 0.7071;
    let diagSign = select(-1.0, 1.0, diag >= 0.0);
    localP += vec3f(diagSign * 1.4, diagSign * 1.15, diagSign * 0.45) * fSplit;
    localP = rotXY(localP, diagSign * 0.09 * fSplit);
    a0 = rotXY(a0, diagSign * 0.09 * fSplit);
    a1 = rotXY(a1, diagSign * 0.09 * fSplit);
    a2 = rotXY(a2, diagSign * 0.09 * fSplit);
    seamGlow += exp(-abs(diag) * 2.2);

    // Tier 2: Menger story-slab telescoping drawers (5m tiers stay sharp & architectural)
    let slabIdx = floor(basePos.y / 5.0);
    let slabParity = select(-1.0, 1.0, (i32(slabIdx) & 1) == 0);
    localP += vec3f(slabParity * 1.65, 0.0, slabParity * 1.05) * fSplit;
    localP = rotXZ(localP, slabParity * 0.14 * fSplit);
    a0 = rotXZ(a0, slabParity * 0.14 * fSplit);
    a1 = rotXZ(a1, slabParity * 0.14 * fSplit);
    a2 = rotXZ(a2, slabParity * 0.14 * fSplit);
    seamGlow += exp(-abs(fract(basePos.y / 5.0) - 0.5) * 14.0);

    // Tier 3: Sub-block stepped prism terraces
    let triIdx = floor((localP.x - localP.z) * 0.22);
    let triParity = select(-1.0, 1.0, (i32(triIdx) & 1) == 0);
    localP.y += triParity * 0.48 * fSplit;
  }

  var liftVec = vec3f(0.0);
  if (fLift > 0.001) {
    let bh0 = hash11(blockCoord.x * 13.7 + blockCoord.y * 31.3);
    let bh1 = hash11(blockCoord.x * 23.1 - blockCoord.y * 17.9);
    let bh2 = hash11(blockCoord.x * 7.3 + blockCoord.y * 41.1);

    let rotY = (bh1 - 0.5) * 0.32 * fLift;
    localP = rotXZ(localP, rotY);
    a0 = rotXZ(a0, rotY);
    a1 = rotXZ(a1, rotY);
    a2 = rotXZ(a2, rotY);

    let tiltZ = (bh2 - 0.5) * 0.26 * fLift;
    localP = rotXY(localP, tiltZ);
    a0 = rotXY(a0, tiltZ);
    a1 = rotXY(a1, tiltZ);
    a2 = rotXY(a2, tiltZ);

    let sideSign = select(-1.0, 1.0, blockCenter.x >= 0.0);
    let liftY = (bh0 * 4.2 + 0.35 * sin(params.time * 0.45 + bh1 * 6.283)) * fLift;
    let pushX = sideSign * (0.9 + bh2 * 1.4) * fLift;
    liftVec = vec3f(pushX, liftY, 0.0);
  }

  var pos = blockCenter + localP + liftVec;

  // Step 2: Faceted 125-degree Mirror Dimension horizon fold ahead of foreground canyon
  let fold = clamp(params.foldStreet, 0.0, 1.0);
  var foldedPos = pos;
  if (fold > 0.001) {
    let zHinge = camPos.z - 14.0;
    let dAhead = max(0.0, zHinge - pos.z);
    let kappa = fold * 0.025;
    let maxTheta = 2.18;
    let arcLen = min(dAhead, maxTheta / max(kappa, 1e-5));
    let remLen = max(0.0, dAhead - arcLen);
    let rawArcTheta = arcLen * kappa;
    let discArcTheta = floor(rawArcTheta / 0.52) * 0.52
      + smoothstep(0.18, 0.82, fract(rawArcTheta / 0.52)) * 0.52;
    let arcTheta = mix(rawArcTheta, discArcTheta, fSplit * 0.30);

    let sinT = sin(arcTheta);
    let cosT = cos(arcTheta);
    let curveY = (1.0 - cosT) / max(kappa, 1e-5) + remLen * sin(maxTheta);
    let curveZ = zHinge - sinT / max(kappa, 1e-5) - remLen * cos(maxTheta);

    let h = pos.y;
    let rawFinalTheta = min(dAhead * kappa, maxTheta);
    let discFinalTheta = min(
      floor(rawFinalTheta / 0.52) * 0.52
        + smoothstep(0.18, 0.82, fract(rawFinalTheta / 0.52)) * 0.52,
      maxTheta,
    );
    let finalTheta = mix(rawFinalTheta, discFinalTheta, fSplit * 0.30);
    let nY = cos(finalTheta);
    let nZ = sin(finalTheta);

    if (pos.z < zHinge) {
      foldedPos = vec3f(pos.x, curveY + h * nY, curveZ + h * nZ);
      a0 = rotYZ(a0, finalTheta);
      a1 = rotYZ(a1, finalTheta);
      a2 = rotYZ(a2, finalTheta);
    }
  }

  // Step 3: Counter-rotating 8-fold octagonal kaleidoscope skyscraper tunnel strictly ahead of camZ
  var edgeAlphaMul = 1.0;
  if (tun > 0.001) {
    let tunZ = camPos.z - 14.0
      - fract((-pos.z + 45.0) / 68.0 - params.time * params.flySpeed * 0.055 * tun) * 68.0;
    let tunEdgeFade = smoothstep(camPos.z - 82.0, camPos.z - 66.0, tunZ)
      * (1.0 - smoothstep(camPos.z - 22.0, camPos.z - 14.0, tunZ));

    let ringIdx = floor((tunZ + 90.0) / 8.5);
    let ringParity = select(-1.0, 1.0, (i32(ringIdx) & 1) == 0);
    let clockT = params.time * 0.40;
    let steppedSpin = (floor(clockT) + smoothstep(0.15, 0.85, fract(clockT))) * 0.34;
    let ringSpin = ringParity * params.kaleidoscope * (steppedSpin + params.time * 0.08);

    // Dense 8-sector angular tiling using block cell hash + iid parity so all 8 walls stay richly populated
    let fineSector = f32((iid + u32(floor(clamp(s.scaleMeta.w, 0.0, 0.9999) * 8.0))) & 7u);
    let sector = mix(floor(clamp(s.scaleMeta.w, 0.0, 0.9999) * 8.0), fineSector, 0.5);
    let octIdx = floor(sector + 0.5);
    let localFrac = clamp((basePos.x - blockCenter.x) / 16.0, -0.45, 0.45);
    let wrapTheta = octIdx * 0.78539816 + localFrac * 0.76 + ringSpin;

    let octLocal = fract((wrapTheta / 6.2831853) * 8.0 + 0.5) - 0.5;
    let octScale = 1.0 / max(0.78, cos(octLocal * 0.78539816));
    let fractalRadial = select(-1.0, 1.0, (i32(floor(basePos.y / 5.0)) & 1) == 0) * 1.15 * fSplit;
    let tunRad = max(10.5, (23.0 - basePos.y * 0.40) * octScale + fractalRadial);
    let tunPos = vec3f(camPos.x + cos(wrapTheta) * tunRad, camPos.y + sin(wrapTheta) * tunRad, tunZ);

    foldedPos = mix(foldedPos, tunPos, tun);
    a0 = mix(a0, rotateInXYToAngle(a0, wrapTheta), tun);
    a1 = mix(a1, rotateInXYToAngle(a1, wrapTheta), tun);
    a2 = mix(a2, rotateInXYToAngle(a2, wrapTheta), tun);
    edgeAlphaMul = mix(1.0, tunEdgeFade, tun);
  }

  // Camera view & projection
  let rel = foldedPos - camPos;
  let vx = dot(rel, camRight);
  let vy = dot(rel, camUp);
  let vz = dot(rel, camFwd);

  let res = max(params.resolution, vec2f(1.0));
  let aspect = res.x / res.y;
  let tanHalfY = tan(clamp(params.fov, 0.35, 2.0) * 0.5);
  let fy = 0.5 * res.y / tanHalfY;
  let fx = fy;

  let nearFade = smoothstep(1.6, 3.8, vz);
  var visible = vz > 1.6 && edgeAlphaMul * nearFade > 0.02;
  let invZ = 1.0 / max(vz, 1.6);
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

  // Preserve real captured display sRGB colors + subtle crystal seam glint & distant sky haze
  var outRgb = s.colorHeight.rgb;
  let morphAct = clamp(fold + fSplit + params.kaleidoscope + fLift + tun, 0.0, 1.0);
  if (seamGlow > 0.01 && morphAct > 0.01) {
    outRgb = mix(outRgb, vec3f(0.95, 0.92, 0.78), clamp(seamGlow * 0.32 * morphAct, 0.0, 0.45));
  }

  let fogDist = clamp((vz - 42.0) / 85.0, 0.0, 0.45) * (1.0 - tun * 0.65);
  let fogColor = mix(vec3f(0.24, 0.25, 0.34), vec3f(0.62, 0.76, 0.92), clamp(params.daylight, 0.0, 1.0));
  outRgb = mix(outRgb, fogColor, fogDist);

  let outAlpha = clamp(baseOpacity * edgeAlphaMul * nearFade, 0.0, 1.0);

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

  let a = j0.x * j0.x + j1.x * j1.x + j2.x * j2.x + 0.3;
  let b = j0.x * j0.y + j1.x * j1.y + j2.x * j2.y;
  let c = j0.y * j0.y + j1.y * j1.y + j2.y * j2.y + 0.3;

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

  let r1 = clamp(3.0 * sqrt(lambda1), 0.6, 36.0);
  let r2 = clamp(3.0 * sqrt(lambda2), 0.6, 36.0);

  projected[iid].centerRad = vec4f(ndc, r1, r2);
  projected[iid].axisDepth = vec4f(eigVec1, vz, 1.0);
  projected[iid].colorAlpha = vec4f(clamp(outRgb, vec3f(0.0), vec3f(1.0)), outAlpha);

  // Farther splats receive SMALLER keys so ascending bitonic sort renders back-to-front
  sortKeys[iid] = 0xFFFFFFFFu - bitcast<u32>(vz);
  sortIndices[iid] = iid;
}

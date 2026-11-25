import * as THREE from "three";
import {
  GpuSplatMath,
  TSL,
  type SplatModifier,
  type SplatNode,
  type TslNode,
} from "@sparkjsdev/radix";

const {
  abs,
  clamp,
  cos,
  cross,
  dot,
  exp,
  float,
  floor,
  fract,
  length,
  max,
  min,
  mix,
  normalize,
  pow,
  select,
  sin,
  smoothstep,
  sqrt,
  uniform,
  vec2,
  vec3,
  vec4,
} = TSL;

export function createDeckUniforms() {
  return {
    uTime: uniform(0.0),
    uFxAge: uniform(0.0),
    uFxMix: uniform(0.0),
    uFxCenter: uniform(new THREE.Vector3(0, 0, 0)),
    uFxScale: uniform(1.0),
    uFloorY: uniform(-1.0),
    uOuterFade: uniform(0.0),
    uTwist: uniform(0.0),
    uCamPos: uniform(new THREE.Vector3(0, 0, 0)),

    // Mode weights
    uShock: uniform(0.0),
    uDissolve: uniform(0.0),
    uTokyo: uniform(0.0),
    uWormhole: uniform(0.0),
  };
}

export type DeckUniforms = ReturnType<typeof createDeckUniforms>;

// ── Procedural Noise & Quaternion Helpers ──────────────────────────────────

const hash31 = (p: TslNode) => {
  const q = fract(p.mul(0.1031)).toVar();
  q.addAssign(dot(q, vec3(q.y, q.z, q.x).add(33.33)));
  return fract(q.x.add(q.y).mul(q.z));
};

const hash33 = (p: TslNode) => {
  const p3 = fract(p.mul(vec3(0.1031, 0.103, 0.0973))).toVar();
  p3.addAssign(dot(p3, vec3(p3.y, p3.x, p3.z).add(33.33)));
  return fract(vec3(p3.x.add(p3.y), p3.x.add(p3.z), p3.y.add(p3.z)).mul(vec3(p3.z, p3.y, p3.x)));
};

const noise3 = (p: TslNode) => {
  const i = floor(p).toVar();
  const f = fract(p).toVar();
  const u = f.mul(f).mul(float(3).sub(f.mul(2))).toVar();

  const n000 = hash31(i);
  const n100 = hash31(i.add(vec3(1, 0, 0)));
  const n010 = hash31(i.add(vec3(0, 1, 0)));
  const n110 = hash31(i.add(vec3(1, 1, 0)));
  const n001 = hash31(i.add(vec3(0, 0, 1)));
  const n101 = hash31(i.add(vec3(1, 0, 1)));
  const n011 = hash31(i.add(vec3(0, 1, 1)));
  const n111 = hash31(i.add(vec3(1, 1, 1)));

  const nx00 = mix(n000, n100, u.x);
  const nx10 = mix(n010, n110, u.x);
  const nx01 = mix(n001, n101, u.x);
  const nx11 = mix(n011, n111, u.x);
  const nxy0 = mix(nx00, nx10, u.y);
  const nxy1 = mix(nx01, nx11, u.y);
  return mix(nxy0, nxy1, u.z);
};

const fbm3 = (p: TslNode) => {
  const n1 = noise3(p);
  const n2 = noise3(p.mul(2.07).add(vec3(17.1, 31.7, 11.3)));
  const n3 = noise3(p.mul(4.19).add(vec3(41.9, 13.3, 27.1)));
  return n1.mul(0.54).add(n2.mul(0.31)).add(n3.mul(0.15));
};

const curl3 = (p: TslNode) => {
  const e = 0.08;
  const n1 = noise3(p.add(vec3(0, e, 0))).sub(noise3(p.sub(vec3(0, e, 0))));
  const n2 = noise3(p.add(vec3(0, 0, e))).sub(noise3(p.sub(vec3(0, 0, e))));
  const n3 = noise3(p.add(vec3(e, 0, 0))).sub(noise3(p.sub(vec3(e, 0, 0))));
  const m1 = noise3(p.add(vec3(11.3, 27.1, 5.7)).add(vec3(0, 0, e))).sub(
    noise3(p.add(vec3(11.3, 27.1, 5.7)).sub(vec3(0, 0, e))),
  );
  const m2 = noise3(p.add(vec3(11.3, 27.1, 5.7)).add(vec3(e, 0, 0))).sub(
    noise3(p.add(vec3(11.3, 27.1, 5.7)).sub(vec3(e, 0, 0))),
  );
  const m3 = noise3(p.add(vec3(11.3, 27.1, 5.7)).add(vec3(0, e, 0))).sub(
    noise3(p.add(vec3(11.3, 27.1, 5.7)).sub(vec3(0, e, 0))),
  );
  return vec3(n1.sub(m1), n2.sub(m2), n3.sub(m3)).mul(1.8);
};

const basisToQuat = (X: TslNode, Y: TslNode, Z: TslNode) => {
  const trace = X.x.add(Y.y).add(Z.z).toVar();
  const s0 = sqrt(max(trace.add(1), 1e-6)).mul(2);
  const q0 = vec4(Y.z.sub(Z.y).div(s0), Z.x.sub(X.z).div(s0), X.y.sub(Y.x).div(s0), s0.mul(0.25));
  const s1 = sqrt(max(float(1).add(X.x).sub(Y.y).sub(Z.z), 1e-6)).mul(2);
  const q1 = vec4(s1.mul(0.25), X.y.add(Y.x).div(s1), X.z.add(Z.x).div(s1), Y.z.sub(Z.y).div(s1));
  const s2 = sqrt(max(float(1).add(Y.y).sub(X.x).sub(Z.z), 1e-6)).mul(2);
  const q2 = vec4(Y.x.add(X.y).div(s2), s2.mul(0.25), Z.y.add(Y.z).div(s2), Z.x.sub(X.z).div(s2));
  const s3 = sqrt(max(float(1).add(Z.z).sub(X.x).sub(Y.y), 1e-6)).mul(2);
  const q3 = vec4(Z.x.add(X.z).div(s3), Z.y.add(Y.z).div(s3), s3.mul(0.25), X.y.sub(Y.x).div(s3));
  const branchYZ = select(Y.y.greaterThan(Z.z), q2, q3);
  const branchXYZ = select(X.x.greaterThan(Y.y).and(X.x.greaterThan(Z.z)), q1, branchYZ);
  return normalize(select(trace.greaterThan(0), q0, branchXYZ));
};

// ── Main World-Space VFX Modifier (Tokyo · Smoke & Ash · Stark B&W LiDAR) ──

export function createMainFxModifier(u: DeckUniforms): SplatModifier {
  return (splat: SplatNode) => {
    const out = splat.toVar();
    const t = u.uTime;
    const age = u.uFxAge;
    const basePos = splat.get("center").toVar();
    const baseScales = splat.get("scales").toVar();
    const baseRgb = splat.get("rgb").toVar();
    const baseOp = splat.get("opacity").toVar();
    const baseQuat = splat.get("quaternion").toVar();

    const pLocal = basePos.sub(u.uFxCenter).div(u.uFxScale).toVar();
    const lum = dot(baseRgb, vec3(0.299, 0.587, 0.114)).toVar();
    const seed = hash31(pLocal.mul(13.7).add(vec3(1.9, 4.3, 7.1))).toVar();
    const seedB = fract(seed.mul(37.43)).toVar();

    const radial = length(vec3(pLocal.x, pLocal.y.mul(0.82), pLocal.z)).toVar();
    const outerFade = mix(float(1), float(1).sub(smoothstep(2.9, 5.4, radial)), u.uOuterFade);

    const posL = pLocal.toVar();
    const rgb = baseRgb.toVar();
    const scales = baseScales.toVar();
    const opacity = baseOp.mul(outerFade).toVar();
    const quat = baseQuat.toVar();

    const wShock = u.uShock.mul(u.uFxMix).toVar();
    const wDissolve = u.uDissolve.mul(u.uFxMix).toVar();
    const wTokyo = u.uTokyo.mul(u.uFxMix).toVar();

    const eNoise = noise3(pLocal.mul(1.25).add(vec3(0, t.mul(-0.18), t.mul(0.1)))).sub(0.5).mul(1.2).toVar();
    const cFlow = curl3(pLocal.mul(0.95).add(vec3(t.mul(0.14), t.mul(-0.2), 0))).toVar();

    // ── 1. Stark Monochrome Particly B&W LiDAR Sphere (Out & Back) ───────────
    const sphR = length(pLocal).toVar();
    const shockP = clamp(age.div(4.15), 0.0, 1.0).toVar();
    const waveEnv = pow(max(sin(shockP.mul(3.14159265)), 0.0), 0.66).toVar();
    const rWave = float(0.04).add(waveEnv.mul(2.15)).toVar();
    const sphereLive = smoothstep(0.0, 0.05, shockP).mul(float(1.0).sub(smoothstep(0.94, 1.0, shockP))).toVar();
    const wShockEff = wShock.mul(sphereLive).toVar();

    const sphDist = abs(sphR.sub(rWave)).toVar();
    const ringGlow = exp(sphDist.mul(sphDist).mul(-420.0)).toVar();
    const insideSphere = float(1.0).sub(smoothstep(rWave.sub(0.045), rWave.add(0.028), sphR)).toVar();
    const scanContours = pow(float(0.5).add(sin(sphR.mul(34.0).sub(age.mul(6.2))).mul(0.5)), 20.0)
      .mul(insideSphere)
      .mul(0.48)
      .toVar();
    const bwContrast = pow(clamp(lum.mul(1.18), 0.0, 1.0), 1.12).toVar();
    const bwSpark = smoothstep(0.6, 0.96, seedB).mul(0.34);
    const monoVal = clamp(
      float(0.08).add(bwContrast.mul(1.02)).add(bwSpark).add(scanContours.mul(0.95)),
      0.0,
      1.32,
    ).toVar();
    const monoBase = vec3(monoVal, monoVal, monoVal);
    const shellWhite = vec3(1.15, 1.15, 1.15).mul(ringGlow);
    const lidarCol = clamp(mix(baseRgb, monoBase, insideSphere).add(shellWhite), vec3(0), vec3(1.45));
    rgb.assign(mix(rgb, lidarCol, wShockEff));

    const sphDir = pLocal.div(max(sphR, 0.001));
    posL.assign(
      posL
        .add(sphDir.mul(ringGlow.mul(0.016).mul(wShockEff)))
        .add(cFlow.mul(0.007).mul(insideSphere).mul(wShockEff)),
    );
    const insideOrShell = clamp(insideSphere.add(ringGlow), 0.0, 1.0);
    const dotRefScale = min(u.uFxScale, float(12.0));
    const lidarDotRad = clamp(length(baseScales).mul(0.064), dotRefScale.mul(0.00052), dotRefScale.mul(0.002)).toVar();
    scales.assign(
      mix(scales, vec3(lidarDotRad).mul(float(1.0).add(ringGlow.mul(0.32))), wShockEff.mul(insideOrShell).mul(0.988)),
    );
    const keepThresh = mix(float(0.8), float(0.38), smoothstep(0.12, 0.64, lum));
    const keepMask = smoothstep(keepThresh.sub(0.07), keepThresh.add(0.05), seed);
    const particleKeep = clamp(keepMask.add(ringGlow.mul(0.75)).add(scanContours.mul(0.75)), 0.0, 1.0);
    opacity.assign(opacity.mul(mix(float(1.0), mix(float(1.0), particleKeep, insideSphere), wShockEff)));

    // ── 2. Volumetric Curl-Noise Smoke & Ash Dissolution ─────────────────────
    const axisCoord = dot(pLocal.sub(vec3(0, 0.04, 0)), normalize(vec3(0.22, 0.76, -0.58)));
    const front = mix(float(-1.45), float(2.55), clamp(age.div(2.4), 0.0, 1.0));
    const erode = clamp(front.sub(axisCoord).add(eNoise.mul(0.62)), 0.0, 1.0).toVar();
    const isSmokePuff = smoothstep(0.68, 0.92, seed).toVar();
    const drift = pow(erode, 1.38).mul(wDissolve).toVar();

    const smokeAdvect = vec3(
      cFlow.x.mul(0.62).add(0.14),
      float(0.88).add(abs(cFlow.y).mul(0.55)),
      cFlow.z.mul(0.52).sub(0.22),
    ).mul(drift.mul(mix(float(1.38), float(1.75), isSmokePuff)));
    posL.assign(posL.add(smokeAdvect));

    const smokeCol = mix(vec3(0.07, 0.08, 0.1), vec3(0.24, 0.27, 0.32), seedB);
    const ashCol = mix(vec3(0.14, 0.15, 0.17), vec3(0.74, 0.78, 0.84), smoothstep(0.25, 0.88, seedB));
    const emberCol = vec3(0.95, 0.97, 1.0).mul(exp(pow(erode.sub(0.08), 2).mul(-55.0)).mul(0.45));
    const dissRgb = mix(baseRgb, mix(ashCol, smokeCol, isSmokePuff), smoothstep(0.02, 0.34, erode)).add(emberCol);
    rgb.assign(mix(rgb, dissRgb, wDissolve));

    const puffScale = mix(scales, scales.mul(3.2), smoothstep(0.08, 0.72, erode));
    const grainRad = clamp(length(baseScales).mul(0.14), u.uFxScale.mul(0.002), u.uFxScale.mul(0.008));
    const grainScale = mix(scales, vec3(grainRad), smoothstep(0.04, 0.42, erode));
    scales.assign(mix(scales, mix(grainScale, puffScale, isSmokePuff), wDissolve));

    const dissFade = mix(
      float(1).sub(smoothstep(0.74, 0.99, erode)),
      float(1).sub(smoothstep(0.28, 0.96, erode)).mul(0.46),
      isSmokePuff,
    );
    opacity.assign(opacity.mul(mix(float(1), dissFade, wDissolve)));

    // ── 3. Counter-Parallax Elastic Wave Neon Tokyo Dream ────────────────────
    const wPos = u.uFxCenter.add(posL.mul(u.uFxScale)).toVar();
    const hAboveFloor = wPos.y.sub(u.uFloorY).toVar();
    const chroma = max(baseRgb.r, max(baseRgb.g, baseRgb.b)).sub(min(baseRgb.r, min(baseRgb.g, baseRgb.b))).toVar();
    const isCompact = float(1).sub(smoothstep(0.05, 0.16, length(baseScales))).toVar();
    const isStreet = float(1).sub(smoothstep(0.02, 0.35, hAboveFloor)).toVar();
    const isSignZone = smoothstep(0.16, 0.45, hAboveFloor)
      .mul(float(1).sub(smoothstep(2.0, 3.2, hAboveFloor)))
      .mul(isCompact)
      .toVar();
    const isHighSky = smoothstep(2.0, 4.4, hAboveFloor).toVar();
    const isFarCorridor = float(1).sub(smoothstep(-7.8, -2.2, wPos.z)).toVar();

    const twistAmt = u.uTokyo.mul(u.uTwist).toVar();
    const camDepth = max(u.uCamPos.z.sub(wPos.z), float(0.0)).toVar();
    const fgLayer = float(1.0).sub(smoothstep(0.8, 2.9, camDepth));
    const bgLayer = smoothstep(2.1, 6.6, camDepth);
    const depthWave = sin(camDepth.mul(0.75).sub(t.mul(2.1))).mul(0.2).mul(smoothstep(1.0, 3.2, camDepth));
    const twistAng = twistAmt.mul(bgLayer.mul(0.54).sub(fgLayer.mul(0.22)).add(depthWave)).toVar();
    const latParallax = sin(t.mul(1.5).sub(camDepth.mul(0.48))).mul(0.18).mul(twistAmt).mul(bgLayer);
    const vertParallax = cos(t.mul(1.25).sub(camDepth.mul(0.38))).mul(0.08).mul(twistAmt).mul(bgLayer);
    const relXY = vec2(wPos.x, wPos.y.sub(0.32)).toVar();
    const cTw = cos(twistAng).toVar();
    const sTw = sin(twistAng).toVar();
    const twPosW = vec3(
      relXY.x.mul(cTw).sub(relXY.y.mul(sTw)).add(latParallax),
      relXY.x.mul(sTw).add(relXY.y.mul(cTw)).add(0.32).add(vertParallax),
      wPos.z,
    ).toVar();
    const twPosL = twPosW.sub(u.uFxCenter).div(u.uFxScale);
    const hasTwist = smoothstep(0.0, 0.001, abs(twistAmt)).toVar();
    posL.assign(mix(posL, twPosL, hasTwist));
    quat.assign(
      mix(quat, GpuSplatMath.quatMul(vec4(0, 0, sin(twistAng.mul(0.5)), cos(twistAng.mul(0.5))), quat), hasTwist),
    );
    const camClipFade = smoothstep(0.45, 1.05, length(mix(wPos, twPosW, hasTwist).sub(u.uCamPos))).toVar();

    const isEmissive = smoothstep(0.2, 0.52, lum.add(chroma.mul(1.22))).mul(isSignZone).toVar();
    const satSign = mix(vec3(lum), baseRgb, 1.56).toVar();
    const waveZ = mix(float(-0.2), float(-7.2), fract(age.mul(0.25))).toVar();
    const zWave = exp(pow(wPos.z.sub(waveZ), 2.0).mul(-0.42)).toVar();
    const flicker = float(0.88).add(float(0.12).mul(sin(t.mul(22.0).add(seed.mul(62.83)))));
    const emissiveRgb = satSign.mul(float(1.28).add(zWave.mul(0.4))).mul(flicker);

    const noirWall = pow(max(baseRgb, vec3(0.001)), vec3(1.26)).mul(vec3(0.52, 0.65, 0.82)).toVar();
    const leftWeight = float(1).sub(smoothstep(-0.85, 0.45, wPos.x)).toVar();
    const rightWeight = smoothstep(-0.45, 0.85, wPos.x).toVar();
    const altZ = float(0.5).add(float(0.5).mul(sin(wPos.z.mul(1.15)))).toVar();
    const leftBounce = mix(vec3(0.1, 0.76, 0.96), vec3(0.92, 0.16, 0.56), altZ);
    const rightBounce = mix(vec3(0.1, 0.86, 0.5), vec3(0.98, 0.36, 0.14), float(1.0).sub(altZ));
    const bounceCol = leftBounce
      .mul(leftWeight)
      .add(rightBounce.mul(rightWeight))
      .mul(float(1).sub(smoothstep(0.6, 4.5, hAboveFloor)))
      .toVar();

    const puddle = smoothstep(0.3, 0.75, noise3(vec3(wPos.x.mul(2.2), float(0.4), wPos.z.mul(1.4)))).toVar();
    const wallLit = mix(
      noirWall
        .add(bounceCol.mul(float(0.22).add(zWave.mul(0.26))))
        .add(vec3(0.03, 0.09, 0.15).mul(isFarCorridor.mul(0.42))),
      baseRgb.mul(vec3(0.06, 0.18, 0.24)),
      isHighSky.mul(0.88),
    );
    const streetLit = noirWall
      .mul(0.72)
      .add(bounceCol.mul(puddle.mul(0.56).add(0.18)).mul(float(0.76).add(zWave.mul(0.44))));
    const baseTokyo = mix(mix(wallLit, streetLit, isStreet), emissiveRgb, isEmissive);

    const twinkleA = pow(float(0.5).add(sin(t.mul(14.0).add(seed.mul(94.2))).mul(0.5)), 8.0);
    const twinkleB = pow(float(0.5).add(sin(t.mul(23.0).add(seedB.mul(125.6))).mul(0.5)), 10.0);
    const twinkleMask = max(twinkleA, twinkleB)
      .mul(smoothstep(0.14, 0.64, lum.add(chroma.mul(0.85)).add(isStreet.mul(puddle).mul(0.42))))
      .mul(float(1).sub(isHighSky.mul(0.92)))
      .mul(isCompact)
      .toVar();
    const rainDrop = vec3(0, float(-1).mul(fract(t.mul(0.42).add(seed))).mul(0.08), 0)
      .mul(smoothstep(0.968, 0.995, seed))
      .mul(wTokyo);
    posL.assign(posL.add(cFlow.mul(0.055).mul(wTokyo)).add(rainDrop));

    const tokyoRgb = baseTokyo.add(mix(satSign, vec3(1.45, 1.42, 1.38), 0.55).mul(twinkleMask.mul(1.42)));
    rgb.assign(mix(rgb, tokyoRgb, wTokyo));

    const tinyRad = clamp(length(baseScales).mul(0.115), float(0.0014), float(0.0048)).toVar();
    const pinpointMix = clamp(float(0.94).sub(isHighSky.mul(0.8)), 0, 1);
    const tokyoScale = mix(scales.mul(mix(vec3(1), vec3(1.22), isHighSky)), vec3(tinyRad), pinpointMix);
    scales.assign(mix(scales, tokyoScale, wTokyo));
    opacity.assign(
      opacity
        .mul(mix(float(1), camClipFade, u.uTokyo))
        .mul(
          mix(
            float(1),
            clamp(
              mix(mix(float(0.58), float(0.84), isStreet), float(0.96), isEmissive).add(twinkleMask.mul(0.28)),
              0.1,
              1.0,
            ),
            wTokyo,
          ),
        ),
    );

    out.get("center").assign(u.uFxCenter.add(posL.mul(u.uFxScale)));
    out.get("scales").assign(scales);
    out.get("rgb").assign(clamp(rgb, vec3(0), vec3(2.2)));
    out.get("opacity").assign(clamp(opacity, 0, 1));
    out.get("quaternion").assign(quat);
    return out;
  };
}

// ── Dual-World Dimensional Wormhole Modifiers (Object Space) ───────────────

export const ALIEN_WORLD_OFFSET = new THREE.Vector3(0.14, 0.92, -6.0);

export function createWormholeModifiers(u: DeckUniforms) {
  const evalPortalField = (pWorld: TslNode) => {
    const t = u.uTime;
    const age = u.uFxAge;
    const wAmt = u.uWormhole.mul(u.uFxMix).toVar();
    const prog = clamp(age.mul(0.45), 0.0, 1.0).toVar();
    const gravAmt = smoothstep(0.0, 0.36, prog).mul(wAmt).toVar();
    const openAmt = smoothstep(0.06, 0.58, prog).mul(wAmt).toVar();

    const bhPos = u.uFxCenter.toVar();
    const baseR = float(0.98).toVar();
    const signedDist = u.uCamPos.z.sub(bhPos.z).toVar();
    const bhD = max(signedDist, float(0.35)).toVar();
    const crossedAmt = smoothstep(2.55, 0.45, signedDist).mul(openAmt).toVar();
    const forestPassFade = smoothstep(0.28, 1.85, signedDist).toVar();
    const throatPeak = sin(crossedAmt.mul(3.14159265)).mul(openAmt).toVar();

    const rawRay = bhPos.sub(u.uCamPos).toVar();
    const rawLen = max(length(rawRay), 0.1);
    const camToBhFwd = rawRay.div(rawLen);
    const fwd = normalize(mix(vec3(0.0, 0.0, -1.0), camToBhFwd, smoothstep(0.5, 2.2, signedDist))).toVar();
    const pRight = normalize(cross(fwd, vec3(0.0, 1.0, 0.0))).toVar();
    const pUp = normalize(cross(pRight, fwd)).toVar();

    const ray = pWorld.sub(u.uCamPos).toVar();
    const sD = dot(ray, fwd).toVar();
    const scaleToPortal = bhD.div(max(sD, 0.25)).toVar();
    const proj3 = u.uCamPos.add(ray.mul(scaleToPortal)).sub(bhPos).toVar();
    const px = dot(proj3, pRight).toVar();
    const py = dot(proj3, pUp).toVar();
    const r = length(vec2(px, py)).add(0.0005).toVar();
    const dir2 = vec2(px, py).div(r).toVar();
    const tan2 = vec2(dir2.y.negate(), dir2.x).toVar();
    const radDir3 = pRight.mul(dir2.x).add(pUp.mul(dir2.y)).toVar();
    const tanDir3 = pRight.mul(tan2.x).add(pUp.mul(tan2.y)).toVar();

    const n1 = fbm3(vec3(dir2.x.mul(2.1), dir2.y.mul(2.1), t.mul(0.45))).toVar();
    const n2 = fbm3(vec3(dir2.x.mul(5.2).add(11.7), dir2.y.mul(5.2).sub(5.3), t.mul(-1.05))).toVar();
    const n3 = noise3(vec3(dir2.x.mul(11.5).sub(t.mul(2.0)), dir2.y.mul(11.5).add(t.mul(1.5)), t.mul(0.95))).toVar();
    const ellip = mix(float(1.0), float(1.18), dir2.y.mul(dir2.y));
    const chaosMod = float(1.0)
      .add(n1.sub(0.5).mul(0.58))
      .add(n2.sub(0.5).mul(0.36))
      .add(n3.sub(0.5).mul(0.2))
      .toVar();
    const rEdge = baseR.mul(ellip).mul(chaosMod).mul(openAmt).mul(float(1.0).add(crossedAmt.mul(0.65))).toVar();

    return {
      t,
      age,
      gravAmt,
      openAmt,
      crossedAmt,
      forestPassFade,
      throatPeak,
      bhPos,
      baseR,
      bhD,
      fwd,
      sD,
      scaleToPortal,
      r,
      radDir3,
      tanDir3,
      n1,
      n2,
      n3,
      rEdge,
    };
  };

  const forestPortalOutModifier: SplatModifier = (splat) => {
    const out = splat.toVar();
    const pObj = splat.get("center").toVar();
    const scales = splat.get("scales").toVar();
    const quat = splat.get("quaternion").toVar();
    const baseRgb = splat.get("rgb").toVar();
    const opacity = splat.get("opacity").toVar();

    const pWorld = vec3(pObj.x, pObj.y.negate(), pObj.z.negate()).toVar();
    const f = evalPortalField(pWorld);
    const seed = hash31(pObj.mul(43.7).add(vec3(7.1, 13.9, 29.3))).toVar();
    const h3 = hash33(pObj.mul(59.3).add(vec3(19.3, 41.7, 3.1))).toVar();

    const isBehindPlane = smoothstep(f.bhD.sub(0.55), f.bhD.add(0.45), f.sD).toVar();
    const hasPortal = smoothstep(0.01, 0.08, f.openAmt).toVar();
    const nearCamFade = smoothstep(0.42, 1.15, length(pWorld.sub(u.uCamPos))).toVar();

    const lensRefR = max(f.rEdge, f.baseR.mul(0.36).mul(f.gravAmt));
    const einR = sqrt(f.r.mul(f.r).add(lensRefR.mul(lensRefR).mul(1.12)));
    const lensFalloff = exp(pow(f.r.div(max(f.baseR.mul(2.75), 0.05)), 1.9).negate());
    const lensDeltaR = einR.sub(f.r).mul(lensFalloff).mul(isBehindPlane).mul(f.gravAmt);
    const shearZone = exp(pow(max(f.r.sub(f.rEdge), 0.0).div(max(f.baseR.mul(0.95), 0.05)), 1.35).negate())
      .mul(isBehindPlane)
      .mul(f.gravAmt)
      .toVar();
    const curlTurb = curl3(pWorld.mul(0.55).add(vec3(0.0, f.t.mul(0.5), f.t.mul(-0.4)))).toVar();
    const shearSwirl = f.tanDir3.mul(shearZone.mul(float(0.48).add(f.n2.sub(0.32).mul(0.72))));
    const invScale = float(1.0).div(max(f.scaleToPortal, 0.14));
    const throatRush = f.radDir3.mul(f.throatPeak.mul(1.35)).add(f.tanDir3.mul(f.throatPeak.mul(0.68)));
    const warpedWorld = pWorld
      .add(f.radDir3.mul(lensDeltaR.mul(invScale)))
      .add(shearSwirl.mul(invScale))
      .add(curlTurb.mul(shearZone.mul(0.56)))
      .add(throatRush.mul(isBehindPlane))
      .toVar();

    const inTearZone = smoothstep(f.rEdge.mul(0.84), f.rEdge.mul(1.06), f.r)
      .mul(float(1.0).sub(smoothstep(f.rEdge.mul(1.15), f.rEdge.mul(2.15), f.r)))
      .mul(isBehindPlane)
      .mul(f.gravAmt)
      .toVar();
    const isDebris = seed.lessThan(0.14);
    const debAct = select(isDebris, inTearZone, float(0.0)).toVar();
    const debPhase = fract(f.t.mul(0.32).add(h3.x)).toVar();
    const debSwirl = debPhase.mul(debPhase).mul(3.4).add(f.n2.mul(1.2)).mul(debAct).toVar();
    const debPull = mix(float(1.0), float(0.8), pow(max(debPhase, 0.001), 1.4)).toVar();
    const debOff = f.radDir3
      .mul(f.r.mul(debPull.sub(1.0)).mul(invScale))
      .add(f.tanDir3.mul(debSwirl.mul(0.34).mul(invScale)))
      .add(curlTurb.mul(debPhase.mul(0.42)));
    const finalWorld = mix(warpedWorld, pWorld.add(debOff), debAct).toVar();

    const debDirObj = normalize(vec3(f.tanDir3.x, f.tanDir3.y.negate(), f.tanDir3.z.negate())).toVar();
    const fwdObj = normalize(vec3(f.fwd.x, f.fwd.y.negate(), f.fwd.z.negate())).toVar();
    const debYObj = normalize(cross(fwdObj, debDirObj).add(vec3(0.0, 1e-5, 0.0)));
    const debZObj = normalize(cross(debDirObj, debYObj));
    const debQuat = basisToQuat(debDirObj, debYObj, debZObj);
    const debQuatAligned = select(dot(quat, debQuat).lessThan(0.0), debQuat.negate(), debQuat);
    const finalQuat = normalize(mix(quat, debQuatAligned, debAct));
    const isoS = clamp(length(scales).mul(0.55), float(0.006), float(0.045));
    const debScale = mix(scales, vec3(isoS.mul(3.4), isoS.mul(0.42), isoS.mul(0.42)), debAct);
    const debFade = mix(
      float(1.0),
      smoothstep(0.0, 0.14, debPhase).mul(float(1.0).sub(smoothstep(0.72, 0.98, debPhase))),
      debAct,
    );

    const portalCutout = mix(
      float(1.0),
      smoothstep(f.rEdge.mul(0.86), f.rEdge.mul(1.03), f.r),
      isBehindPlane.mul(hasPortal),
    );

    const rimLip = exp(pow(f.r.sub(f.rEdge.mul(1.03)).div(max(f.baseR.mul(0.12), 0.02)), 2.0).negate())
      .mul(isBehindPlane)
      .mul(f.gravAmt)
      .toVar();
    const causticGlint = pow(clamp(f.n2.mul(1.18).add(f.n3.mul(0.25)), 0.0, 1.0), 3.4).toVar();
    const gravShadow = mix(float(1.0), float(0.24), rimLip.mul(float(0.85).sub(causticGlint.mul(0.65))));
    const rimRefractCol = mix(vec3(0.32, 0.72, 1.05), vec3(1.18, 0.8, 0.42), smoothstep(0.3, 0.75, f.n1))
      .mul(causticGlint)
      .mul(rimLip)
      .mul(0.48);

    const srgbCol = pow(max(baseRgb, vec3(0.0001)), vec3(1.0 / 2.2));
    const finalRgb = srgbCol.mul(gravShadow).add(rimRefractCol);
    const finalOp = opacity.mul(portalCutout).mul(debFade).mul(f.forestPassFade).mul(nearCamFade);

    out.get("center").assign(vec3(finalWorld.x, finalWorld.y.negate(), finalWorld.z.negate()));
    out.get("scales").assign(debScale);
    out.get("quaternion").assign(finalQuat);
    out.get("rgb").assign(clamp(finalRgb, vec3(0.0), vec3(1.8)));
    out.get("opacity").assign(clamp(finalOp, 0.0, 1.0));
    return out;
  };

  const alienPortalInModifier: SplatModifier = (splat) => {
    const out = splat.toVar();
    const pObj = splat.get("center").toVar();
    const scales = splat.get("scales").toVar();
    const baseRgb = splat.get("rgb").toVar();
    const opacity = splat.get("opacity").toVar();

    const pWorld = vec3(
      pObj.x.add(ALIEN_WORLD_OFFSET.x),
      pObj.y.negate().add(ALIEN_WORLD_OFFSET.y),
      pObj.z.negate().add(ALIEN_WORLD_OFFSET.z),
    ).toVar();
    const f = evalPortalField(pWorld);
    const seed = hash31(pObj.mul(37.1).add(vec3(3.3, 19.1, 7.7))).toVar();

    const isBehindCam = smoothstep(0.18, 0.55, f.sD).toVar();
    const nearCamFade = smoothstep(0.35, 0.95, length(pWorld.sub(u.uCamPos))).toVar();

    const insideHole = float(1.0).sub(smoothstep(f.rEdge.mul(0.84), f.rEdge.mul(1.03), f.r)).toVar();
    const alienVis = mix(insideHole, float(1.0), f.crossedAmt).mul(smoothstep(0.03, 0.14, f.openAmt));

    const edgeBand = exp(pow(f.r.sub(f.rEdge.mul(0.95)).div(max(f.baseR.mul(0.16), 0.02)), 2.0).negate())
      .mul(float(1.0).sub(f.crossedAmt))
      .toVar();
    const curlAlien = curl3(pWorld.mul(0.5).add(vec3(f.t.mul(0.35), 0.0, f.t.mul(-0.45))));
    const dustDrift = curlAlien.mul(select(seed.greaterThan(0.955), f.crossedAmt, float(0.0)).mul(0.16));
    const warpedWorld = pWorld
      .add(f.tanDir3.mul(edgeBand.mul(0.16).mul(f.n2.sub(0.35))))
      .add(curlAlien.mul(edgeBand.mul(0.18)))
      .add(dustDrift);

    const srgbCol = pow(max(baseRgb, vec3(0.0001)), vec3(1.0 / 2.2));
    const innerCaustic = vec3(1.1, 0.72, 0.34).mul(edgeBand.mul(pow(f.n2, 2.6)).mul(0.32));
    const finalRgb = srgbCol.mul(float(1.04)).add(innerCaustic);

    out
      .get("center")
      .assign(
        vec3(
          warpedWorld.x.sub(ALIEN_WORLD_OFFSET.x),
          float(ALIEN_WORLD_OFFSET.y).sub(warpedWorld.y),
          float(ALIEN_WORLD_OFFSET.z).sub(warpedWorld.z),
        ),
      );
    out.get("scales").assign(scales);
    out.get("rgb").assign(clamp(finalRgb, vec3(0.0), vec3(1.9)));
    out.get("opacity").assign(clamp(opacity.mul(alienVis).mul(isBehindCam).mul(nearCamFade), 0.0, 1.0));
    return out;
  };

  return { forestPortalOutModifier, alienPortalInModifier };
}

/**
 * Neon tube effect.
 *
 * `applyNeonEffect(params, sdfSampler, time, options?): Expr` is an Expr-level BUILDER: it computes
 * the SDF UV, samples the field at the centre + 4 cardinal neighbours (the corner-smoothing diamond
 * stencil), then feeds all 5 vec4 taps + the uniforms + `time` into the pure `neonComposite`
 * `'use gpu'` fn that does the cylinder shading / lighting / glow / flicker / flow math and returns
 * the final vec4. Neon is a GENERATOR (no child texture) that always renders as a cutout, so its
 * output is STRAIGHT rgba (no unpremultiply needed).
 *
 * NOTES:
 *   1. NO PER-PIXEL EARLY-OUT: all 4 neighbour taps + all lighting run unconditionally (builders
 *      have no control flow). `neonComposite` ends with a `std.select` threshold that forces 0
 *      beyond `glowR*1.5 + softPx + smoothEPS` (the glow's `exp` tail is otherwise a sub-0.2%
 *      non-zero remnant), so the result matches skipping those pixels.
 *   2. `volumetric` is a RUNTIME f32 flag (`0`/`1`) selected inside the bodies via `std.select`,
 *      not build-time-pruned WGSL — for body reuse + golden-testability.
 *   3. lightAngle cos/sin computed IN-SHADER (neon never CPU-precomputes lx/ly).
 *   4. `time` is passed explicitly — the shader supplies its accumulated, speed-controlled
 *      animated-time Expr.
 */
import {tgpu, d, std} from '../index'
import {call, floatE} from '../../composer'
import type {Expr, GpuFragmentParams} from '../../contract'
import {sdfSpaceUV, offsetUV} from './glass'

const DEG_TO_RAD = 0.017453292519943295 // Math.PI / 180

// Light-direction constants: lz=0.7 is constant, so lightLen=sqrt(1+0.49) is invariant. Precomputed
// at module scope (plain JS, NOT inside a body) → referenced as number literals.
const _LZ = 0.7
const _INV_LIGHT_LEN = 1 / Math.sqrt(1 + _LZ * _LZ) // ≈ 0.8192
const _LZN = _LZ * _INV_LIGHT_LEN // ≈ 0.5735
const _HZ = _LZN + 1.0 // ≈ 1.5735 (half-vector z; view dir = (0,0,1))
const _INV_H_LEN = 1 / Math.sqrt(_INV_LIGHT_LEN * _INV_LIGHT_LEN + _HZ * _HZ) // ≈ 0.5640

/** Uniform keys the neon builder reads via `params.uniforms.<key>`. */
export interface NeonEffectUniforms {
    center: unknown; scale: unknown; rotation: unknown; color: unknown; secondaryColor: unknown
    secondaryBlend: unknown; glowColor: unknown; tubeThickness: unknown; intensity: unknown
    hotCoreIntensity: unknown; glowIntensity: unknown; glowRadius: unknown; lightAngle: unknown
    specularIntensity: unknown; specularSize: unknown; cornerSmoothing: unknown
    flickerSpeed: unknown; flickerAmount: unknown; flowSpeed: unknown; flowAmount: unknown
}

export interface NeonEffectOptions {
    /** Treat the field as a 3D thickness map — trace tubes along all edges via view-depth creases. */
    volumetric?: boolean
    /** Cheap bilinear sampler for the neighbour taps (compute path). Falls back to sdfSampler. */
    gradSampler?: (uv: Expr) => Expr
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Pure-math body fns
// ═══════════════════════════════════════════════════════════════════════════════════════

/** Corner-smoothing / tube stencil radius. Volumetric: doubles as the tube radius. Pure. */
export const neonSmoothEPS = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((tubeThickness, cornerSmoothing, volumetric) => {
    'use gpu'
    const vol = std.max(tubeThickness, 0.006)
    const flat = 0.008 + cornerSmoothing * 0.03
    return std.select(flat, vol, volumetric > 0.5)
})

/** Two-layer outer glow (tight inner + wide outer bloom), masked to the exterior. Returns
 *  `glowMasked`. `sdf` is the corner-smoothed field value. Pure — CPU-golden-testable. */
export const neonGlow = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((sdf, glowRadius, glowIntensity) => {
    'use gpu'
    const glowR = std.max(glowRadius, 0.001)
    const sdfOutside = std.max(sdf, 0.0)
    const innerGlow = std.exp(sdfOutside * -1.0 * (12.0 / glowR)) * 0.7
    const outerGlow = std.exp(sdfOutside * -1.0 * (4.0 / glowR)) * 0.35
    const totalGlow = (innerGlow + outerGlow) * glowIntensity
    const outsideFactor = std.smoothstep(-0.003, 0.003, sdf)
    return totalGlow * outsideFactor
})

/** Sporadic on/off flicker from three irrational-ratio sines. Higher `flickerAmount` → dark more
 *  often. Pure — CPU-golden-testable. */
export const neonFlicker = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((time, flickerSpeed, flickerAmount) => {
    'use gpu'
    const flickerTime = time * flickerSpeed
    const f1 = std.sin(flickerTime * 17.13)
    const f2 = std.sin(flickerTime * 31.71)
    const f3 = std.sin(flickerTime * 47.29)
    const combined = f1 + f2 * 0.5 + f3 * 0.3
    const threshold = std.mix(-2.0, 0.8, flickerAmount)
    return std.smoothstep(threshold - 0.1, threshold + 0.1, combined)
})

/** Rotating brightness band (`flowMod`): angular position drives a sweeping sine. Pure. */
export const neonFlow = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32], d.f32)((sdfUV, time, flowSpeed, flowAmount) => {
    'use gpu'
    const flowDx = sdfUV.x - 0.5
    const flowDy = sdfUV.y - 0.5
    const flowAngle = std.atan2(flowDy, flowDx)
    const flowPhase = flowAngle * 2.0 + time * flowSpeed
    const flowWave = std.sin(flowPhase) * 0.5 + 0.5
    return std.mix(1.0, flowWave, flowAmount)
})

/**
 * The full neon tube + glow composite. Takes the 5 SDF taps (centre + R/L/U/D), the stencil
 * radius, the field-space `sdfUV` (for the flow angle), `scale`/`viewportSize` (softPx), `time`,
 * and the uniforms. Models the interior depth as a semicircular tube cross-section, shades it with
 * Blinn-Phong + self-emission + hot core, adds the multi-layer glow, and merges tube over glow.
 * Returns STRAIGHT rgba (always cutout). Resolve-goldenable.
 */
export const neonComposite = tgpu.fn(
    [d.vec4f, d.vec4f, d.vec4f, d.vec4f, d.vec4f, d.f32, d.vec2f, d.f32, d.vec2f, d.f32,
     d.f32, d.f32, d.vec3f, d.vec3f, d.f32, d.vec3f, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32], d.vec4f)(
    (sC, sR, sL, sU, sD, smoothEPS, sdfUV, scale, viewportSize, time,
     cornerSmoothing, tubeThickness, color, secondaryColor, secondaryBlend, glowColor, intensity, hotCoreIntensity, glowIntensity, glowRadius, lightAngle, specularIntensity, specularSize, flickerSpeed, flickerAmount, flowSpeed, flowAmount, volumetric) => {
        'use gpu'
        const sdfCenter = sC.x
        const sdfRight = sR.x
        const sdfLeft = sL.x
        const sdfUp = sU.x
        const sdfDown = sD.x
        const pxH = 1.0 / viewportSize.y
        const glowR = std.max(glowRadius, 0.001)
        const softPx = std.max(pxH / scale, 0.004)

        // Central-difference gradient + corner-smoothed SDF.
        const gradX = (sdfRight - sdfLeft) / (smoothEPS * 2.0)
        const gradY = (sdfUp - sdfDown) / (smoothEPS * 2.0)
        const smoothedSdf = (sdfCenter + sdfRight + sdfLeft + sdfUp + sdfDown) / 5.0
        const sdf = std.mix(sdfCenter, smoothedSdf, cornerSmoothing)

        // Outward normal — volumetric reads the view-depth (.a) gradient.
        const gxRaw = std.select(gradX, sR.w - sL.w, volumetric > 0.5)
        const gyRaw = std.select(gradY, sU.w - sD.w, volumetric > 0.5)
        const gradLen = std.max(std.sqrt(gxRaw * gxRaw + gyRaw * gyRaw), 0.0001)
        const gnx = gxRaw / gradLen
        const gny = gyRaw / gradLen

        // Tube geometry: 2D depth band vs volumetric depth-crease detector.
        const depthNorm2D = std.clamp(sdf * -1.0 / std.max(tubeThickness, 0.001), 0.0, 1.0)
        const innerMask2D = std.smoothstep(tubeThickness + softPx, tubeThickness - softPx, sdf * -1.0)
        const lap = std.abs(sR.w + sL.w - sC.w * 2.0) + std.abs(sU.w + sD.w - sC.w * 2.0)
        const slopeMag = std.abs(gxRaw) + std.abs(gyRaw)
        const crease = lap / (lap + smoothEPS * 0.6 + slopeMag * 0.35)
        const innerMaskVol = std.smoothstep(0.08, 0.35, crease)
        const depthNorm = std.select(depthNorm2D, crease, volumetric > 0.5)
        const innerMask = std.select(innerMask2D, innerMaskVol, volumetric > 0.5)

        const outerMask = std.smoothstep(softPx, softPx * -1.0, sdf)
        const tubeMask = outerMask * innerMask

        // Semicircular cross-section: height sqrt(d(2-d)), horizontal (1-d).
        const t = depthNorm
        const cylinderZ = std.sqrt(std.max(t * (2.0 - t), 0.0))
        const cylinderR = 1.0 - t
        const nx = gnx * cylinderR
        const ny = gny * cylinderR
        const nz = cylinderZ

        // Directional light (lz=0.7 constant → precomputed reciprocals).
        const lightRad = lightAngle * DEG_TO_RAD
        const lx = std.cos(lightRad)
        const ly = std.sin(lightRad)
        const lxn = lx * _INV_LIGHT_LEN
        const lyn = ly * _INV_LIGHT_LEN
        const lzn = _LZN
        const NdotL = nx * lxn + ny * lyn + nz * lzn
        const diffuse = std.clamp(NdotL, 0.0, 1.0)
        const NdotH = nx * (lxn * _INV_H_LEN) + ny * (lyn * _INV_H_LEN) + nz * (_HZ * _INV_H_LEN)
        const shininess = std.exp2(8.0 - specularSize * 7.0)
        const specular = std.pow(std.clamp(NdotH, 0.0, 1.0), shininess) * specularIntensity

        const flowMod = neonFlow(sdfUV, time, flowSpeed, flowAmount)

        // Two-tone coloring + shading + self-emission.
        const twoTone = std.mix(secondaryColor, color, diffuse)
        const baseColor = std.mix(color, twoTone, secondaryBlend)
        const ambient = 0.12
        const selfEmission = cylinderZ * 0.35
        const shadedRgb = baseColor.mul(ambient + diffuse * 0.55 + selfEmission)
        const tubeRgb = d.vec3f(shadedRgb.x + specular, shadedRgb.y + specular, shadedRgb.z + specular)

        // Hot gas-discharge core.
        const coreProfile = std.smoothstep(0.55, 1.0, depthNorm)
        const hotCoreAmt = coreProfile * hotCoreIntensity * flowMod
        const hotCoreCol = std.mix(color, d.vec3f(1.0, 1.0, 1.0), 0.75)
        const tubeWithCore = std.mix(tubeRgb, hotCoreCol, hotCoreAmt)
        const tubeFlowed = tubeWithCore.mul(std.mix(1.0, flowMod, 0.4))

        // Outer glow + flicker.
        const glowMasked = neonGlow(sdf, glowRadius, glowIntensity)
        const flickerValue = neonFlicker(time, flickerSpeed, flickerAmount)
        const intensityMul = intensity * flickerValue

        const finalTubeRgb = tubeFlowed.mul(intensityMul)
        const finalGlowRgb = glowColor.mul(glowMasked * intensityMul)
        const finalR = std.mix(finalGlowRgb.x, finalTubeRgb.x, tubeMask)
        const finalG = std.mix(finalGlowRgb.y, finalTubeRgb.y, tubeMask)
        const finalB = std.mix(finalGlowRgb.z, finalTubeRgb.z, tubeMask)
        const glowAlpha = std.clamp(glowMasked * 0.6, 0.0, 1.0)
        const finalA = std.max(tubeMask, glowAlpha)
        const result = d.vec4f(finalR, finalG, finalB, finalA)

        // Pixels beyond the glow threshold read exactly 0 (forces the exp tail to zero).
        const threshOut = glowR * 1.5 + softPx + smoothEPS
        return std.select(result, d.vec4f(0.0, 0.0, 0.0, 0.0), sdfCenter > threshOut)
    })

// ═══════════════════════════════════════════════════════════════════════════════════════
// The Expr-level builder
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * Apply the neon tube effect. Composition-time Expr builder — see the file header for the notes.
 *
 * @param params      the fragment builder params (reads `uniforms`/`ctx`)
 * @param sdfSampler  `(uvExpr) → vec4 Expr`: `.r` = signed distance/−chord, `.a` = view depth
 * @param time        accumulated animated-time Expr
 * @param options     `volumetric` + an optional cheap `gradSampler` for the neighbour taps
 */
export function applyNeonEffect(
    params: GpuFragmentParams,
    sdfSampler: (uv: Expr) => Expr,
    time: Expr,
    options?: NeonEffectOptions,
): Expr {
    const {uniforms, ctx} = params
    const gradSampler = options?.gradSampler ?? sdfSampler
    const volFlag = floatE(options?.volumetric ? 1 : 0)

    const sdfUV = call(sdfSpaceUV, 'sdfSpaceUV', [uniforms.center, uniforms.scale, uniforms.rotation, ctx.uv, ctx.aspect])
    const smoothEPS = call(neonSmoothEPS, 'neonSmoothEPS', [uniforms.tubeThickness, uniforms.cornerSmoothing, volFlag])
    const negEPS = smoothEPS.mul(-1)

    // 5-point diamond stencil: centre via sdfSampler, neighbours via gradSampler.
    const sC = sdfSampler(sdfUV)
    const sR = gradSampler(call(offsetUV, 'offsetUV', [sdfUV, smoothEPS, floatE(0)]))
    const sL = gradSampler(call(offsetUV, 'offsetUV', [sdfUV, negEPS, floatE(0)]))
    const sU = gradSampler(call(offsetUV, 'offsetUV', [sdfUV, floatE(0), smoothEPS]))
    const sD = gradSampler(call(offsetUV, 'offsetUV', [sdfUV, floatE(0), negEPS]))

    // color uniforms are vec4 rgba (transformColor); neonComposite takes vec3 → swizzle `.rgb`.
    return call(neonComposite, 'neonComposite', [
        sC, sR, sL, sU, sD, smoothEPS, sdfUV, uniforms.scale, ctx.viewportSize, time,
        uniforms.cornerSmoothing, uniforms.tubeThickness, uniforms.color.member('rgb'), uniforms.secondaryColor.member('rgb'), uniforms.secondaryBlend,
        uniforms.glowColor.member('rgb'), uniforms.intensity, uniforms.hotCoreIntensity, uniforms.glowIntensity, uniforms.glowRadius,
        uniforms.lightAngle, uniforms.specularIntensity, uniforms.specularSize, uniforms.flickerSpeed, uniforms.flickerAmount,
        uniforms.flowSpeed, uniforms.flowAmount, volFlag,
    ])
}

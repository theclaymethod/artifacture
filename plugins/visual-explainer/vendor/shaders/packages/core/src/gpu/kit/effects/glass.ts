/**
 * Glass lens effect.
 *
 * `applyGlassEffect(params, sdfSampler, childTexture, blurredTexture?, options?): Expr` is an
 * Expr-level BUILDER that runs at COMPOSITION time and assembles KitExprs via the composer
 * factories, like kit/noiseStylize's `applyNoiseReliefExpr` and the ChromaticAberration/Glitch
 * RTT-filter path. The heavy branchless lighting/refraction/tint/fresnel math lives in pure
 * `'use gpu'` `tgpu.fn`s (the durable resolve/golden-tested artifacts); the builder computes UVs,
 * samples the SDF + child/blurred textures at those UVs, and feeds the samples into
 * `glassComposite`.
 *
 * NOTES:
 *   1. NO PER-PIXEL EARLY-OUT: all taps run unconditionally (builders have no control flow).
 *      Outside a shape `transition = smoothstep(0,1,rb1) = 0`, so `mix(baseColor, lighting, 0) =
 *      baseColor` and `cutoutAlpha = cutout ? 0 : 1` — the child passthrough. Likewise there is no
 *      `transition == 1` inner-sample skip: `mix(base, lit, 1) ≡ lit`, so always sampling
 *      `baseColor` is correct.
 *   2. lightAngle cos/sin computed IN-SHADER (per fragment) rather than as precomputed `lx`/`ly`
 *      uniforms. A kit builder can't add ad-hoc uniforms; 2 trig per fragment is negligible.
 *   3. `volumetric` is a RUNTIME f32 flag (`0`/`1`) selected inside the bodies via `std.select`,
 *      not build-time-pruned WGSL — for body reuse + golden-testability. `bakedGradients` IS a
 *      build-time JS branch (skips the 2 finite-difference taps). The blur/aberration sampling
 *      structure (1 vs 3 vs 9 vs 27 taps) is genuine build-time JS branching.
 *   4. RTT PREMULTIPLY: `childTexture`/`blurredTexture` samples come back PREMULTIPLIED; the math
 *      treats the child as STRAIGHT color. So the builder `unpremultiplyAlpha`s both the base
 *      sample and the assembled lens sample BEFORE the composite math and returns STRAIGHT rgba
 *      (the final pass re-premultiplies globally).
 */
import {tgpu, d, std} from '../index'
import {unpremultiplyAlpha} from '../blend'
import {call, vec4, floatE, asLocal} from '../../composer'
import type {Expr, GpuFragmentParams, KitTexture} from '../../contract'

// Math constants as plain number literals — the pattern for values referenced INSIDE a
// `'use gpu'` body (NEVER `Math.*` in a body).
const DEG_TO_RAD = 0.017453292519943295 // Math.PI / 180
// hLen for the Phong half-vector: lx²+ly²=1, hlz=2 → hLen=sqrt(5) always.
const INV_HLEN_GLASS = 0.4472135954999579 // 1 / Math.sqrt(5)

// ─── Precomputed Vogel disk for the in-shader blur fallback ───────────────────────────────────
const GOLDEN_ANGLE = 2.39996322972865332
const BLUR_SAMPLE_COUNT = 9
export const BLUR_DISK: [number, number][] = []
for (let i = 0; i < BLUR_SAMPLE_COUNT; i++) {
    const angle = i * GOLDEN_ANGLE
    const r = Math.sqrt(i / BLUR_SAMPLE_COUNT)
    BLUR_DISK.push([Math.cos(angle) * r, Math.sin(angle) * r])
}

/**
 * Uniform keys the glass builder reads via `params.uniforms.<key>` (GPU accessor Exprs).
 * `blur`/`aberration` are ALSO read via `params.propValues` for compile-time branching.
 */
export interface GlassEffectUniforms {
    center: unknown; scale: unknown; rotation: unknown; edgeSoftness: unknown
    refraction: unknown; innerZoom: unknown; aberration: unknown; blur: unknown
    tintColor: unknown; tintIntensity: unknown; tintPreserveLuminosity: unknown
    lightAngle: unknown; highlight: unknown; highlightColor: unknown; highlightSoftness: unknown
    fresnel: unknown; fresnelColor: unknown; fresnelSoftness: unknown; cutout: unknown; thickness: unknown
}

export interface GlassEffectOptions {
    /** 3D thickness field (−chord/2): fresnel + refraction from surface slope instead of rim distance. */
    volumetric?: boolean
    /** Sampler carries forward differences in .g/.b of the centre tap — skip the 2 extra taps. */
    bakedGradients?: boolean
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// SHARED body fns (glass owns them; neon.ts + emboss.ts import sdfSpaceUV/offsetUV) — ONE copy.
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * Aspect-correct + rotate + scale the screen UV into SDF sample space, shared by the
 * glass/neon/emboss preamble: aspect-correct the X delta, flip `center.y` back (transformPosition
 * stores `1 - y`), rotate the delta by `rotation` degrees (rigid; rotation=0 is identity), scale,
 * and offset by 0.5 into the 0–1 field. Pure — CPU-golden-testable.
 */
export const sdfSpaceUV = tgpu.fn([d.vec2f, d.f32, d.f32, d.vec2f, d.f32], d.vec2f)((center, scale, rotation, uv, aspect) => {
    'use gpu'
    const centerX = center.x
    const centerY = 1.0 - center.y
    const dxAc = (uv.x - centerX) * aspect
    const dy = uv.y - centerY
    const rotRad = rotation * DEG_TO_RAD
    const cosR = std.cos(rotRad)
    const sinR = std.sin(rotRad)
    const rdx = dxAc * cosR + dy * sinR
    const rdy = dy * cosR - dxAc * sinR
    return d.vec2f(rdx / scale + 0.5, rdy / scale + 0.5)
})

/** `uv + vec2(ox, oy)` — builds a neighbour/trace sample UV from a base UV + scalar offsets. */
export const offsetUV = tgpu.fn([d.vec2f, d.f32, d.f32], d.vec2f)((uv, ox, oy) => {
    'use gpu'
    return d.vec2f(uv.x + ox, uv.y + oy)
})

// ═══════════════════════════════════════════════════════════════════════════════════════
// Glass pure-math body fns
// ═══════════════════════════════════════════════════════════════════════════════════════

/** Forward-difference gradient of the SDF (non-baked path): `((sdfX - sdf)/EPS, (sdfY - sdf)/EPS)`
 *  with EPS = 0.01. Pure. */
export const glassGradient = tgpu.fn([d.f32, d.f32, d.f32], d.vec2f)((sdfRaw, sdfX, sdfY) => {
    'use gpu'
    const eps = 0.01
    return d.vec2f((sdfX - sdfRaw) / eps, (sdfY - sdfRaw) / eps)
})

/**
 * Refraction strength from depth. 2D plates fade refraction with depth `(1-d)²`; 3D thickness
 * fields ramp it in with `smoothstep(0,1,d)`. `sdf` is already `sdfRaw/scale`. Pure.
 */
export const glassRefrStrength = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((sdf, thickness, volumetric) => {
    'use gpu'
    const thicknessRange = std.max(thickness * 0.3, 0.005)
    const depthNorm = std.clamp(sdf * -1.0 / thicknessRange, 0.0, 1.0)
    const vol = std.smoothstep(0.0, 1.0, depthNorm)
    const flat = (1.0 - depthNorm) * (1.0 - depthNorm)
    return std.select(flat, vol, volumetric > 0.5)
})

/** The refracted lens sample UV + the ±chromatic-aberration r/b UVs. Pure. */
export const GlassLensUVs = d.struct({lensUV: d.vec2f, rUV: d.vec2f, bUV: d.vec2f})
export const glassLensUVs = tgpu.fn(
    [d.vec2f, d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32], GlassLensUVs)(
    (uv, center, sdfRaw, scale, gradX, gradY, refraction, innerZoom, thickness, aberration, aspect, volumetric) => {
        'use gpu'
        const sdf = sdfRaw / scale
        const refrStrength = glassRefrStrength(sdf, thickness, volumetric)
        const refrScale = refraction * 0.15
        // Slope cap: a volumetric chord field is discontinuous where one lobe occludes another,
        // giving near-vertical slopes for a texel or two — uncapped, the refraction offset would
        // displace the lens sample across the whole canvas (dark smeared halos at overlaps).
        // Legitimate steep-rim slopes stay well under the cap wherever refrStrength is
        // meaningfully > 0; flat 2D fields (|grad| ≈ 1) are untouched.
        const slopeLen = std.max(std.sqrt(gradX * gradX + gradY * gradY), 0.0001)
        const slopeScale = std.min(d.f32(1), 12.0 / slopeLen)
        const offsetX = gradX * slopeScale * -1.0 * refrScale * refrStrength / aspect
        const offsetY = gradY * slopeScale * -1.0 * refrScale * refrStrength
        const centerX = center.x
        const centerY = 1.0 - center.y
        const zoomedX = centerX + (uv.x - centerX) / innerZoom
        const zoomedY = centerY + (uv.y - centerY) / innerZoom
        const lensX = zoomedX + offsetX
        const lensY = zoomedY + offsetY
        const chrScale = aberration * 0.06
        const chrOffX = offsetX * chrScale
        const chrOffY = offsetY * chrScale
        return GlassLensUVs({
            lensUV: d.vec2f(lensX, lensY),
            rUV: d.vec2f(lensX + chrOffX, lensY + chrOffY),
            bUV: d.vec2f(lensX - chrOffX, lensY - chrOffY),
        })
    })

/** One Vogel-disk blur tap offset in UV space: `(1/viewport) * (ox,oy) * blur*2`. Pure. */
export const glassBlurOffset = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32], d.vec2f)((viewportSize, blur, ox, oy) => {
    'use gpu'
    const m = blur * 2.0
    return d.vec2f(ox / viewportSize.x * m, oy / viewportSize.y * m)
})

/**
 * color tint (mix-based, matches the Tint shader). Optional luminosity preservation rescales the
 * tinted color back to the source luminance. `preserveLum` is 0/1. Pure — CPU-golden-testable
 * (the boolean choice is a `std.mix` with a 0/1 factor, not a vec `std.select`).
 */
export const glassTint = tgpu.fn([d.vec3f, d.vec3f, d.f32, d.f32], d.vec3f)((rgb, tintColor, tintIntensity, preserveLum) => {
    'use gpu'
    const lumWeights = d.vec3f(0.299, 0.587, 0.114)
    const origLum = std.dot(rgb, lumWeights)
    const tinted = std.mix(rgb, tintColor, tintIntensity)
    const tintedLum = std.dot(tinted, lumWeights)
    const lumPreserved = tinted.mul(origLum / std.max(tintedLum, 0.0001))
    const preserveFactor = std.select(d.f32(0), d.f32(1), preserveLum > 0.5)
    return std.mix(tinted, lumPreserved, preserveFactor)
})

/** Directional border highlight ring (rb2): a thin 1px ring modulated by `normal·light`. Pure.
 *  The ring's transition width is clamped to ≥ 1 device pixel (an anti-aliased edge instead of a
 *  raw step at low edgeSoftness), and `lightFacing` is clamped to [0,1] — a volumetric chord
 *  field's rim slopes are ≫ 1, which otherwise blows the ring brightness out unboundedly. */
export const glassBorderHighlight = tgpu.fn([d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32], d.f32)(
    (sdf, edgeSoftness, pxH, gradX, gradY, lightAngle, highlight) => {
        'use gpu'
        const sharp = std.max(edgeSoftness * 0.5, 0.001)
        const w2 = std.max(sharp * 0.0625, pxH * 1.5)
        const sdfOuter = sdf - pxH
        const rb2base = std.clamp(sdfOuter * -1.0 / w2, 0.0, 1.0) - std.clamp(sdf * -1.0 / w2, 0.0, 1.0)
        const lx = std.cos(lightAngle * DEG_TO_RAD)
        const ly = std.sin(lightAngle * DEG_TO_RAD)
        const normalDotLight = gradX * lx + gradY * ly
        const lightFacing = std.clamp(normalDotLight * 0.5 + 0.5, 0.0, 1.0)
        return rb2base * lightFacing * highlight
    })

/** Phong specular glint on the SDF normal (view dir = +z). Pure — CPU-golden-testable. */
export const glassSpecular = tgpu.fn([d.f32, d.f32, d.f32, d.f32, d.f32, d.f32], d.f32)(
    (gradX, gradY, lightAngle, highlight, highlightSoftness, refrStrength) => {
        'use gpu'
        const lx = std.cos(lightAngle * DEG_TO_RAD)
        const ly = std.sin(lightAngle * DEG_TO_RAD)
        const nz = d.f32(2.0) // d.f32-wrap: an integer-valued literal binding types i32 (the select trap)
        const nLen = std.sqrt(gradX * gradX + gradY * gradY + nz * nz)
        const nx = gradX / nLen
        const ny = gradY / nLen
        const nnz = nz / nLen
        const nDotH = nx * (lx * INV_HLEN_GLASS) + ny * (ly * INV_HLEN_GLASS) + nnz * (2.0 * INV_HLEN_GLASS)
        const shininess = std.exp2(8.0 - highlightSoftness * 7.0)
        return std.pow(std.clamp(nDotH, 0.0, 1.0), shininess) * highlight * refrStrength
    })

/** Fresnel rim glow. Volumetric: view-angle from the thickness-field slope; 2D: distance-to-rim.
 *  `rb1` is the inside mask. Pure — CPU-golden-testable. */
export const glassFresnelRim = tgpu.fn([d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32], d.f32)(
    (sdf, gradX, gradY, fresnel, fresnelSoftness, rb1, volumetric) => {
        'use gpu'
        const slopeSq = gradX * gradX + gradY * gradY
        const cosView = 1.0 / std.sqrt(slopeSq + 1.0)
        const exponent = std.mix(6.0, 1.5, std.clamp(fresnelSoftness, 0.0, 1.0))
        const volRim = std.pow(1.0 - cosView, exponent) * fresnel * 2.0 * rb1
        const fresnelWidth = std.max(fresnelSoftness * 0.06, 0.001)
        const fresnelDepth = std.clamp(sdf * -1.0 / fresnelWidth, 0.0, 1.0)
        const flatRim = (1.0 - fresnelDepth) * (1.0 - fresnelDepth) * fresnel * rb1
        return std.select(flatRim, volRim, volumetric > 0.5)
    })

/**
 * The full glass composite. `baseColor` = STRAIGHT child sample at screen UV; `blurred` = STRAIGHT
 * refracted lens sample. Builds the inside mask, border ring, tint, specular, and fresnel, blends
 * lighting over the child by `transition`, and applies cutout alpha. Returns STRAIGHT rgba. Pure
 * (texture-derived only via the vec4 args) — resolve-goldenable.
 */
export const glassComposite = tgpu.fn(
    [d.vec4f, d.vec4f, d.f32, d.f32, d.f32, d.f32, d.vec2f, d.f32, d.f32, d.f32, d.vec3f, d.f32, d.f32, d.vec3f, d.f32, d.f32, d.vec3f, d.f32, d.f32, d.f32, d.f32], d.vec4f)(
    (baseColor, blurred, sdfRaw, scale, gradX, gradY, viewportSize, edgeSoftness, lightAngle, highlight, highlightColor, highlightSoftness, fresnel, fresnelColor, fresnelSoftness, thickness, tintColor, tintIntensity, tintPreserveLuminosity, cutout, volumetric) => {
        'use gpu'
        const sharp = std.max(edgeSoftness * 0.5, 0.001)
        const pxH = 1.0 / viewportSize.y
        const sdf = sdfRaw / scale
        // Inside-mask width clamped to ≥ 1.5 device pixels: a hard edge (edgeSoftness → 0)
        // resolves anti-aliased instead of as a raw step (this also anti-aliases cutout), and the
        // extra half pixel hides sub-pixel contour noise from the field's texel lattice.
        const w1 = std.max(sharp * 0.03125, pxH * 1.5)
        const rb1 = std.clamp(sdf * -1.0 / w1, 0.0, 1.0)
        const refrStrength = glassRefrStrength(sdf, thickness, volumetric)
        const rb2 = glassBorderHighlight(sdf, edgeSoftness, pxH, gradX, gradY, lightAngle, highlight)
        const blurredRgb = d.vec3f(blurred.x, blurred.y, blurred.z)
        const tintedRgb = glassTint(blurredRgb, tintColor, tintIntensity, tintPreserveLuminosity)
        const specGlint = glassSpecular(gradX, gradY, lightAngle, highlight, highlightSoftness, refrStrength)
        const fresnelRim = glassFresnelRim(sdf, gradX, gradY, fresnel, fresnelSoftness, rb1, volumetric)
        const litR = tintedRgb.x + highlightColor.x * rb2 + highlightColor.x * specGlint + fresnelColor.x * fresnelRim
        const litG = tintedRgb.y + highlightColor.y * rb2 + highlightColor.y * specGlint + fresnelColor.y * fresnelRim
        const litB = tintedRgb.z + highlightColor.z * rb2 + highlightColor.z * specGlint + fresnelColor.z * fresnelRim
        const litA = blurred.w + rb2
        const lighting = d.vec4f(litR, litG, litB, litA)
        const transition = std.smoothstep(0.0, 1.0, rb1)
        const composited = std.mix(baseColor, lighting, transition)
        const cutoutAlpha = std.select(d.f32(1), transition, cutout > 0.5)
        return d.vec4f(composited.x, composited.y, composited.z, composited.w * cutoutAlpha)
    })

// ═══════════════════════════════════════════════════════════════════════════════════════
// The Expr-level builder
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * Apply the glass lens effect. Composition-time Expr builder — see the file header for the notes.
 *
 * @param params        the fragment builder params (reads `uniforms`/`propValues`/`ctx`)
 * @param sdfSampler    `(uvExpr) → vec4 Expr`: `.r` = signed distance/−chord, `.g`/`.b` = baked
 *                      gradients (when `options.bakedGradients`)
 * @param childTexture  the child RTT (from the shader's `convertToTexture(childNode)`)
 * @param blurredTexture optional pre-blurred buffer (compute path); undefined → in-shader Vogel blur
 * @param options       `volumetric` / `bakedGradients` build-time flags
 */
export function applyGlassEffect(
    params: GpuFragmentParams,
    sdfSampler: (uv: Expr) => Expr,
    childTexture: KitTexture,
    blurredTexture?: KitTexture,
    options?: GlassEffectOptions,
): Expr {
    const {uniforms, propValues, ctx} = params
    const volumetric = options?.volumetric ?? false
    const bakedGradients = options?.bakedGradients ?? false
    const volFlag = floatE(volumetric ? 1 : 0)

    // ── SDF UV + centre/neighbour taps ─────────────────────────────────────────────
    // Hoisted via `asLocal`: `Expr.member()` re-emits its whole subtree (no CSE), so without
    // the hoist every `.r`/`.g`/`.b` read below — and every lens-UV member downstream — would
    // re-emit the FULL sdf sample (a 16-load bicubic fetch on the volumetric path). With
    // aberration on that multiplied the sampler ~15× per pixel; hoisted it emits exactly once.
    const sdfUV = asLocal(call(sdfSpaceUV, 'sdfSpaceUV', [uniforms.center, uniforms.scale, uniforms.rotation, ctx.uv, ctx.aspect]), 'glassSdfUV')
    const surf0 = asLocal(sdfSampler(sdfUV), 'glassSurf')
    const sdfRaw = surf0.member('r')

    let gradX: Expr
    let gradY: Expr
    if (bakedGradients) {
        gradX = surf0.member('g')
        gradY = surf0.member('b')
    } else {
        const surfX = sdfSampler(call(offsetUV, 'offsetUV', [sdfUV, floatE(0.01), floatE(0)]))
        const surfY = sdfSampler(call(offsetUV, 'offsetUV', [sdfUV, floatE(0), floatE(0.01)]))
        const grad = asLocal(call(glassGradient, 'glassGradient', [sdfRaw, surfX.member('r'), surfY.member('r')]), 'glassGrad')
        gradX = grad.member('x')
        gradY = grad.member('y')
    }

    // ── Refracted lens UVs (hoisted — lensUV/rUV/bUV are member reads of one call) ─────
    const lens = asLocal(call(glassLensUVs, 'glassLensUVs', [
        ctx.uv, uniforms.center, sdfRaw, uniforms.scale, gradX, gradY,
        uniforms.refraction, uniforms.innerZoom, uniforms.thickness, uniforms.aberration, ctx.aspect, volFlag,
    ]), 'glassLens')
    const lensUV = lens.member('lensUV')
    const rUV = lens.member('rUV')
    const bUV = lens.member('bUV')

    // ── Sampling: compile-time branch on blur/aberration ─────
    const blurVal = propValues.blur
    const blurEnabled = typeof blurVal === 'number' ? blurVal > 0 : true
    const abVal = propValues.aberration
    const aberrationEnabled = typeof abVal === 'number' ? abVal > 0 : true

    const blurTap = (tex: KitTexture, uv: Expr, offOx: number, offOy: number): Expr =>
        tex.sample(uv.add(call(glassBlurOffset, 'glassBlurOffset', [ctx.viewportSize, uniforms.blur, floatE(offOx), floatE(offOy)])))
    const vogelAccum = (tex: KitTexture, uv: Expr): Expr => {
        let acc = blurTap(tex, uv, BLUR_DISK[0][0], BLUR_DISK[0][1])
        for (let i = 1; i < BLUR_DISK.length; i++) acc = acc.add(blurTap(tex, uv, BLUR_DISK[i][0], BLUR_DISK[i][1]))
        return acc.mul(1.0 / BLUR_SAMPLE_COUNT)
    }

    let blurred: Expr
    if (blurredTexture && blurEnabled) {
        // Compute path: pre-blurred buffer sampled at the refracted UV (+ 3-tap aberration).
        blurred = aberrationEnabled
            ? vec4(blurredTexture.sample(rUV).member('r'), blurredTexture.sample(lensUV).member('g'), blurredTexture.sample(bUV).member('b'), blurredTexture.sample(lensUV).member('a'))
            : blurredTexture.sample(lensUV)
    } else if (!blurEnabled && !aberrationEnabled) {
        blurred = childTexture.sample(lensUV) // fast path: 1 tap
    } else if (!blurEnabled && aberrationEnabled) {
        blurred = vec4(childTexture.sample(rUV).member('r'), childTexture.sample(lensUV).member('g'), childTexture.sample(bUV).member('b'), childTexture.sample(lensUV).member('a'))
    } else if (blurEnabled && !aberrationEnabled) {
        blurred = vogelAccum(childTexture, lensUV) // 9-tap Vogel blur
    } else {
        // 27-tap Vogel blur + aberration.
        const accR = vogelAccum(childTexture, rUV)
        const accG = vogelAccum(childTexture, lensUV)
        const accB = vogelAccum(childTexture, bUV)
        blurred = vec4(accR.member('r'), accG.member('g'), accB.member('b'), accG.member('a'))
    }

    // ── Unpremultiply the child-derived color (RTT samples are premultiplied) + composite ─────
    const blurredStraight = call(unpremultiplyAlpha, 'unpremultiplyAlpha', [blurred])
    const baseColor = call(unpremultiplyAlpha, 'unpremultiplyAlpha', [childTexture.sample(ctx.uv)])

    // The color uniforms are vec4 rgba (transformColor); glassComposite takes vec3 → swizzle to `.rgb`.
    return call(glassComposite, 'glassComposite', [
        baseColor, blurredStraight, sdfRaw, uniforms.scale, gradX, gradY, ctx.viewportSize,
        uniforms.edgeSoftness, uniforms.lightAngle, uniforms.highlight, uniforms.highlightColor.member('rgb'), uniforms.highlightSoftness,
        uniforms.fresnel, uniforms.fresnelColor.member('rgb'), uniforms.fresnelSoftness, uniforms.thickness,
        uniforms.tintColor.member('rgb'), uniforms.tintIntensity, uniforms.tintPreserveLuminosity, uniforms.cutout, volFlag,
    ])
}

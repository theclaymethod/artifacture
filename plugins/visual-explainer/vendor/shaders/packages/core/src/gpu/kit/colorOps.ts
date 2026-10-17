/**
 * Pointwise color-op bodies — the GPU implementations behind std/effects/color.
 *
 * Every fn here takes the composed child color first (straight alpha, preserved) and is wired
 * into the pointwise filter species by its noun. Luminance weights differ deliberately per op:
 * the adjustment ops (saturate/grayscale/gradientMapT) use Rec.709, the tone-mapping ops
 * (solarize/tint/duotone/tritone) use Rec.601 — each op keeps the weights that define its look.
 */
import {tgpu, d, std} from './index'
import {DEG_TO_RAD, SQRT3, TAU} from './constants'
import {hash12} from './noise'
import {luma709Dot} from './tone'

const TWO_PI = TAU

/**
 * Hue rotation via Rodrigues' rotation of RGB around the (1,1,1) achromatic axis. Takes RAW
 * DEGREES (the deg→rad conversion is folded here, full-precision constants).
 */
export const hueRotate = tgpu.fn([d.vec4f, d.f32], d.vec4f)((color, shiftDeg) => {
    'use gpu'
    const angle = shiftDeg * DEG_TO_RAD
    const cosA = std.cos(angle)
    const sinA = std.sin(angle)

    const k = 1.0 / 3.0
    const oneMinusCos = 1.0 - cosA
    const kOneMinusCos = oneMinusCos * k
    const sinOverSqrt3 = sinA / SQRT3

    // Rotation matrix rows.
    const m00 = cosA + kOneMinusCos
    const m01 = kOneMinusCos - sinOverSqrt3
    const m02 = kOneMinusCos + sinOverSqrt3

    const m10 = kOneMinusCos + sinOverSqrt3
    const m11 = cosA + kOneMinusCos
    const m12 = kOneMinusCos - sinOverSqrt3

    const m20 = kOneMinusCos - sinOverSqrt3
    const m21 = kOneMinusCos + sinOverSqrt3
    const m22 = cosA + kOneMinusCos

    const r = color.x
    const g = color.y
    const b = color.z

    const newR = r * m00 + g * m01 + b * m02
    const newG = r * m10 + g * m11 + b * m12
    const newB = r * m20 + g * m21 + b * m22

    return d.vec4f(newR, newG, newB, color.w)
})

/**
 * Rec.709 luminance-weighted desaturate/saturate: intensity 0 = grayscale, 1 = unchanged,
 * >1 oversaturates. The scalar mix factor is wrapped `d.vec3f(intensity)` for the vector mix.
 */
export const saturate = tgpu.fn([d.vec4f, d.f32], d.vec4f)((color, intensity) => {
    'use gpu'
    const rgb = d.vec3f(color.x, color.y, color.z)
    // Grayscale via luminance weights (ITU-R BT.709).
    const luminance = std.dot(rgb, d.vec3f(0.2126, 0.7152, 0.0722))
    const gray = d.vec3f(luminance, luminance, luminance)
    // Mix between grayscale and original by saturation intensity.
    const saturated = std.mix(gray, rgb, d.vec3f(intensity))
    return d.vec4f(saturated.x, saturated.y, saturated.z, color.w)
})

/**
 * Vibrance: selective saturation that protects already-saturated pixels. An ADJUSTMENT around
 * zero (0 = unchanged), unlike saturate's multiplier.
 */
export const vibrance = tgpu.fn([d.vec4f, d.f32], d.vec4f)((color, adjustment) => {
    'use gpu'
    const r = color.x
    const g = color.y
    const b = color.z
    // Average of RGB channels.
    const average = (r + g + b) / 3.0
    // Max channel value.
    const mx = std.max(r, std.max(g, b))
    // Mix amount: (max - average) * adjustment * -3.
    const amt = (mx - average) * adjustment * -3.0
    // Mix between original color and max value.
    const rgb = d.vec3f(r, g, b)
    const vibrant = std.mix(rgb, d.vec3f(mx, mx, mx), d.vec3f(amt))
    return d.vec4f(vibrant.x, vibrant.y, vibrant.z, color.w)
})

/**
 * Contrast around the midpoint, then additive brightness offset:
 * `(rgb - 0.5) * (contrast + 1) + 0.5 + brightness`. Takes the RAW [-1, 1] contrast slider
 * value — the `+ 1` is folded here, so raw 0 is the identity for both params.
 */
export const brightnessContrast = tgpu.fn([d.vec4f, d.f32, d.f32], d.vec4f)((color, brightness, contrastRaw) => {
    'use gpu'
    const contrast = contrastRaw + 1.0
    const half = d.vec3f(0.5, 0.5, 0.5)
    // Contrast around the midpoint, then additive brightness offset.
    const contrasted = color.xyz.sub(half).mul(contrast).add(half)
    const result = contrasted.add(d.vec3f(brightness, brightness, brightness))
    return d.vec4f(result, color.w)
})

/**
 * Pure scalar gain. Multiplication leaves 0 at 0 (blacks stay black) and is intentionally NOT
 * clamped — values above 1.0 survive to the renderer's tone-mapping shoulder.
 */
export const exposure = tgpu.fn([d.vec4f, d.f32], d.vec4f)((color, gain) => {
    'use gpu'
    const rgb = color.xyz.mul(gain)
    return d.vec4f(rgb, color.w)
})

/** Luminance-weighted desaturation (ITU-R BT.709), alpha preserved. */
export const grayscale = tgpu.fn([d.vec4f], d.vec4f)((color) => {
    'use gpu'
    const luminance = std.dot(color.xyz, d.vec3f(0.2126, 0.7152, 0.0722))
    return d.vec4f(luminance, luminance, luminance, color.w)
})

/** Invert RGB directly (1 - rgb), preserve alpha. */
export const invert = tgpu.fn([d.vec4f], d.vec4f)((color) => {
    'use gpu'
    return d.vec4f(1.0 - color.x, 1.0 - color.y, 1.0 - color.z, color.w)
})

/**
 * Invert tones above a Rec.601 luminance threshold, blended by strength.
 * std.select(f, t, cond) returns t when cond is true: select(rgb, inverted, lum > threshold) →
 * true=inverted, false=rgb.
 */
export const solarize = tgpu.fn([d.vec4f, d.f32, d.f32], d.vec4f)((color, threshold, strength) => {
    'use gpu'
    const rgb = d.vec3f(color.x, color.y, color.z)
    const luminance = std.dot(rgb, d.vec3f(0.299, 0.587, 0.114))
    const inverted = d.vec3f(1.0 - color.x, 1.0 - color.y, 1.0 - color.z)
    // Where luminance exceeds the threshold apply inversion; below threshold keep original.
    const solarized = std.select(rgb, inverted, luminance > threshold)
    // Blend between original and solarized by strength.
    const result = std.mix(rgb, solarized, d.vec3f(strength))
    return d.vec4f(result.x, result.y, result.z, color.w)
})

/** Quantise each channel to `steps` levels: floor(c * steps) / steps. */
export const posterize = tgpu.fn([d.vec4f, d.f32], d.vec4f)((color, steps) => {
    'use gpu'
    // A mapped/animated steps value can arrive outside the UI's [2, 20] range, and steps → 0
    // makes floor(c * steps) / steps a 0/0 NaN that poisons the whole composited pixel.
    const s = std.clamp(steps, d.f32(2), d.f32(20))
    const r = std.floor(color.x * s) / s
    const g = std.floor(color.y * s) / s
    const b = std.floor(color.z * s) / s
    return d.vec4f(r, g, b, color.w)
})

/** Plain tint: mix child rgb toward the tint rgb by amount. */
export const tintPlain = tgpu.fn([d.vec4f, d.vec4f, d.f32], d.vec4f)((color, tintColor, amount) => {
    'use gpu'
    const rgb = d.vec3f(color.x, color.y, color.z)
    const tinted = std.mix(rgb, d.vec3f(tintColor.x, tintColor.y, tintColor.z), d.vec3f(amount))
    return d.vec4f(tinted.x, tinted.y, tinted.z, color.w)
})

/**
 * Luminosity-preserving tint: scale the tinted output back to the original brightness (Rec.601
 * weights) so the tint shifts hue without darkening. `max(tintedLum, 0.0001)` guards
 * divide-by-zero.
 */
export const tintPreserveLuma = tgpu.fn([d.vec4f, d.vec4f, d.f32], d.vec4f)((color, tintColor, amount) => {
    'use gpu'
    const rgb = d.vec3f(color.x, color.y, color.z)
    const tinted = std.mix(rgb, d.vec3f(tintColor.x, tintColor.y, tintColor.z), d.vec3f(amount))
    const luminanceWeights = d.vec3f(0.299, 0.587, 0.114)
    const originalLum = std.dot(rgb, luminanceWeights)
    const tintedLum = std.dot(tinted, luminanceWeights)
    const result = tinted.mul(originalLum / std.max(tintedLum, 0.0001))
    return d.vec4f(result.x, result.y, result.z, color.w)
})

/**
 * Duotone blend factor from the child's Rec.601 luminance — lower favours the dark color,
 * higher the bright one. The two-color mix happens at builder level (compile-time color space).
 */
export const duotoneT = tgpu.fn([d.vec4f, d.f32], d.f32)((color, blend) => {
    'use gpu'
    const luminance = std.dot(color.xyz, d.vec3f(0.299, 0.587, 0.114))
    // Lower blend favours the dark color, higher favours the bright one.
    return std.smoothstep(blend - 0.5, blend + 0.5, luminance)
})

/**
 * Tritone blend factors from the child's Rec.601 luminance: (shadow→mid, mid→highlight,
 * lower↔upper). The three color mixes happen at builder level (compile-time color space).
 */
export const tritoneFactors = tgpu.fn([d.vec4f, d.f32], d.vec3f)((color, blendMid) => {
    'use gpu'
    const luminance = std.dot(color.xyz, d.vec3f(0.299, 0.587, 0.114))
    const shadowToMid = std.smoothstep(blendMid - 0.25, blendMid, luminance)
    const midToHighlight = std.smoothstep(blendMid, blendMid + 0.25, luminance)
    const finalT = std.smoothstep(blendMid - 0.1, blendMid + 0.1, luminance)
    return d.vec3f(shadowToMid, midToHighlight, finalT)
})

/**
 * Rec.709 luminance → levels remap (black/white points) + contrast around the midpoint. Pure
 * scalar. Shared by the gradient map's cosine-palette and custom-color paths.
 */
export const gradientMapT = tgpu.fn([d.vec4f, d.f32, d.f32, d.f32], d.f32)((color, black, white, contrast) => {
    'use gpu'
    const luma = std.dot(color.xyz, d.vec3f(0.2126, 0.7152, 0.0722))
    const range = std.max(white - black, 0.0001)
    let t = std.clamp((luma - black) / range, 0.0, 1.0)
    t = std.clamp((t - 0.5) * contrast + 0.5, 0.0, 1.0)
    return t
})

/**
 * Cosine palette: color(t) = clamp(a + b*cos(2π*(c*t + d + phase)), 0, 1). phase is a scalar
 * broadcast into the vec3 argument (seamless loop — cos is 2π-periodic).
 */
export const gradientMapCosine = tgpu.fn([d.f32, d.f32, d.vec3f, d.vec3f, d.vec3f, d.vec3f], d.vec3f)(
    (t, phase, pa, pb, pc, pd) => {
        'use gpu'
        const arg = pc.mul(t).add(pd).add(d.vec3f(phase, phase, phase)).mul(TWO_PI)
        const mapped = pa.add(pb.mul(std.cos(arg)))
        return std.clamp(mapped, d.vec3f(0.0, 0.0, 0.0), d.vec3f(1.0, 1.0, 1.0))
    },
)

/**
 * Custom cyclic ramp phase: t → (segmentFraction, segmentIndex) for the low→mid→high→low cycle,
 * scrolled by phase. The per-segment color blends happen at builder level.
 */
export const gradientMapCustomPhase = tgpu.fn([d.f32, d.f32], d.vec2f)((t, phase) => {
    'use gpu'
    const t01 = std.fract(t + phase)
    const t3 = t01 * 3.0
    return d.vec2f(std.fract(t3), std.floor(t3))
})

/**
 * Pick the active segment color: i<1 → seg0, i<2 → seg1, else seg2. std.select is (ifFalse,
 * ifTrue, cond); nested to express `i<1 ? seg0 : (i<2 ? seg1 : seg2)`.
 */
export const gradientMapSelect = tgpu.fn([d.vec4f, d.vec4f, d.vec4f, d.f32], d.vec4f)((seg0, seg1, seg2, i) => {
    'use gpu'
    const upper = std.select(seg2, seg1, i < 2.0)
    return std.select(upper, seg0, i < 1.0)
})

/** Final gradient-map compose: blend original child rgb ↔ mapped by strength, alpha preserved. */
export const gradientMapCompose = tgpu.fn([d.vec4f, d.vec3f, d.f32], d.vec4f)((color, mapped, strength) => {
    'use gpu'
    const outRgb = std.mix(color.xyz, mapped, d.vec3f(strength, strength, strength))
    return d.vec4f(outRgb, color.w)
})

/**
 * Film grain weighted toward darker areas. `pixelCoord = uv * viewport` is device-pixel space; a
 * full-screen hash, so any Y-orientation difference only shifts the speckle — statistically
 * identical. `animTime` is the CPU-accumulated frame drift (0 when not animated), folded into the
 * hash input. BT.709 luminance, clamp, pow with the 1e-6 guard, strength×0.1 scale. Alpha
 * preserved.
 */
export const filmGrain = tgpu.fn([d.vec4f, d.vec2f, d.vec2f, d.f32, d.f32, d.f32], d.vec4f)(
    (color, uv, viewport, strength, bias, animTime) => {
        'use gpu'
        // Work in viewport pixel space. Integer bitcast hash (not the classic sin-fract one-liner):
        // device-pixel coords make the sin argument huge, and iOS Metal's low-precision large-arg
        // range reduction turns the sin hash into directional streaks. hash12 is integer-exact on
        // every platform. animTime drifts the pattern along two incommensurate axes.
        const pixelCoord = uv.mul(viewport)
        const noiseVal = hash12(pixelCoord.add(d.vec2f(animTime, animTime * 1.6180339)))
        // Center noise in [-1, 1] for signed grain.
        const grain = noiseVal * 2.0 - 1.0

        // BT.709 luminance, clamped so HDR highlights don't drive darkness negative (pow NaN).
        const brightness = std.clamp(std.dot(color.xyz, d.vec3f(0.2126, 0.7152, 0.0722)), 0.0, 1.0)
        const darkness = 1.0 - brightness
        // 1e-6 guards pow(0, bias) → NaN.
        const darkFactor = std.pow(darkness + 1e-6, bias)

        const grainIntensity = grain * darkFactor * (strength * 0.1)
        const grainedColor = color.xyz.add(grainIntensity)
        return d.vec4f(grainedColor, color.w)
    })

/**
 * Anti-aliased contour-line mask from a source value: invert → gamma → banded fract → fwidth AA.
 * Bakes in the isolines' own softness/lineWidth semantics (pixel-width lines, an inner-edge
 * ramp). `invert` is the runtime boolean uniform (1 true / -1 false). fwidth is fragment-only,
 * so it lives in this body.
 */
export const contourLineMask = tgpu.fn([d.f32, d.f32, d.f32, d.f32, d.f32, d.f32], d.f32)(
    (sourceValue, levels, lineWidth, softness, gamma, invert) => {
        'use gpu'
        const invertedValue = std.select(sourceValue, 1.0 - sourceValue, invert > 0.5)
        const sv = std.pow(invertedValue, gamma)
        // Offset by 0.5 so 0/1 source values don't land on band boundaries (no solid lines at extremes).
        const scaledValue = sv * levels + 0.5
        const fw = std.max(std.fwidth(scaledValue), 0.0001)
        const distFromBoundary = std.abs(std.fract(scaledValue + 0.5) - 0.5)
        const normalizedDist = distFromBoundary / fw
        const transitionFactor = softness * 0.99 + 0.01
        const innerEdge = lineWidth * (1.0 - transitionFactor)
        return 1.0 - std.smoothstep(innerEdge, lineWidth, normalizedDist)
    })

/** Isoline mask over the child's Rec.709 luminance (compile-time source variant). */
export const isolinesFromLuma = tgpu.fn([d.vec4f, d.f32, d.f32, d.f32, d.f32, d.f32], d.f32)(
    (color, levels, lineWidth, softness, gamma, invert) => {
        'use gpu'
        return contourLineMask(luma709Dot(color.xyz), levels, lineWidth, softness, gamma, invert)
    })

/** Isoline mask over the child's alpha channel (compile-time source variant). */
export const isolinesFromAlpha = tgpu.fn([d.vec4f, d.f32, d.f32, d.f32, d.f32, d.f32], d.f32)(
    (color, levels, lineWidth, softness, gamma, invert) => {
        'use gpu'
        return contourLineMask(color.w, levels, lineWidth, softness, gamma, invert)
    })

/** Mix background → line by the line mask (rgb + alpha). */
export const contourCompose = tgpu.fn([d.vec4f, d.vec4f, d.f32], d.vec4f)((bg, line, mask) => {
    'use gpu'
    const rgb = std.mix(d.vec3f(bg.x, bg.y, bg.z), d.vec3f(line.x, line.y, line.z), d.vec3f(mask))
    const alpha = std.mix(bg.w, line.w, mask)
    return d.vec4f(rgb.x, rgb.y, rgb.z, alpha)
})

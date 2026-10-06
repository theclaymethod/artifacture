/**
 * Light-field primitives — the falloffs, lobes and bands the light generators are built from
 * (SunBurst, Godrays, LensFlare, LightLeak, StudioBackground, Beam).
 *
 * These are all PURE FLOAT fns with no hash and no texture, so they are CPU-executable as DualFns
 * under vitest and carry golden-value tests on top of the resolve gate (C8).
 *
 * WHAT IS NOT HERE, on purpose: the light RIGS. LensFlare's seven baked ghost configs and
 * StudioBackground's key/fill/back/bounce stack are JS-level unrolls of per-shader art direction —
 * a config table, not shared math. Only the per-lobe math they call into lives here. Two of these
 * fns have a single consumer today ({@link seamlessAngularField}, {@link beamLocalFrame}); they are
 * promoted anyway because each solves a problem the next light generator will hit and would
 * otherwise re-derive badly (the atan2 seam, and "point the beam at the canvas centre").
 */
import {tgpu, d, std} from './index'
import {TAU} from './constants'
// Namespace-style so the shared helpers keep their module-prefixed WGSL names
// (geom_aspectOf, tone_luma601Dot) in every composition that nests these parts.
import * as geom from './geom'
import * as tone from './tone'

// ─── Radial and anisotropic falloffs ──────────────────────────────────────────────────────────

/**
 * Gaussian radial falloff: `exp(-(dist² · sharpness))`. 1 at the centre, decaying smoothly with no
 * hard cutoff — the shape of a glare, a bloom core, or a soft light pool.
 *
 * `sharpness` is an inverse squared radius, not a radius: larger is TIGHTER. A light whose size is
 * authored as a radius should pass `1 / (r² + ε)`, which is why the callers that expose a size
 * slider compute their sharpness rather than passing the slider through.
 */
export const radialGaussianFalloff = tgpu.fn([d.f32, d.f32], d.f32)((dist, sharpness) => {
    'use gpu'
    return std.exp(-(dist * dist * sharpness))
})

/**
 * Gaussian falloff over an already-normalized 2D offset: `exp((du² + dv²) · -sharpness)`.
 *
 * "Normalized" means each axis has been divided by its own radius before the call, which is what
 * makes the spot ELLIPTICAL — pass `u/su, v/sv` with different radii and the falloff stretches along
 * the wider axis. Callers layering several spots at different sharpnesses over the same `du, dv`
 * (a core plus a wide shoulder) get the anisotropy for free.
 */
export const anisotropicGaussianSpot = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((du, dv, sharpness) => {
    'use gpu'
    return std.exp((du * du + dv * dv) * -sharpness)
})

/**
 * A round glow at a point in aspect-corrected UV space: `exp(-0.5 · dist² / sizeSq)`.
 *
 * Takes the light position as loose scalars and `sizeSq` as a SQUARED radius because the callers
 * that place several of these per frame compute the positions and radii on the CPU (they are
 * pixel-invariant) and pass them in packed vec4 extraFields — squaring on the GPU would be per-pixel
 * work for a per-frame value.
 */
export const radialGaussianGlow = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32, d.f32], d.f32)(
    (uv, aspect, lx, ly, sizeSq) => {
        'use gpu'
        const dx = (uv.x - lx) * aspect
        const dy = uv.y - ly
        const dd2 = dx * dx + dy * dy
        return std.exp(-0.5 * dd2 / sizeSq)
    })

// ─── Angular lobes ────────────────────────────────────────────────────────────────────────────

/**
 * Rotating sine lobes around an angle: `pow(sin(angle · count + phase) · 0.5 + 0.5, sharpness)`.
 *
 * The `·0.5 + 0.5` before the `pow` is what makes this read as rays rather than alternating bands:
 * the sine's negative half becomes the gap between lobes, and raising the whole [0,1] wave to a
 * power narrows the bright part without moving the lobe centres. `sharpness` below 1 widens.
 *
 * `phase` is signed time in practice — NEGATE the accumulated time to rotate clockwise.
 */
export const angularSineLobes = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)(
    (angle, count, phase, sharpness) => {
        'use gpu'
        const t = std.sin(angle * count + phase) * 0.5 + 0.5
        return std.pow(t, sharpness)
    })

/**
 * Diffraction-style spikes around an angle: `pow(abs(cos(angle · halfCount)), power)`.
 *
 * `abs` (rather than the `·0.5 + 0.5` of {@link angularSineLobes}) is why this gives 2·halfCount
 * spikes with hard nulls between them, the signature of an aperture's blade count — pass
 * `blades / 2`. High `power` (3–8) is what makes them thin. Layering two calls at different powers
 * and a small angular offset is the standard way to get a primary/secondary spike pattern.
 */
export const angularCosineSpikes = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((angle, halfCount, power) => {
    'use gpu'
    return std.pow(std.abs(std.cos(angle * halfCount)), power)
})

/**
 * Seam-free angular coordinates for a radial field, returned as
 * `vec3(angle, angleWrapped, blend)`.
 *
 * THE PROBLEM THIS SOLVES: `atan2` returns [−π, π], so any pattern periodic in the angle has a
 * discontinuity along the −x axis where the value jumps by 2π. Wrapping the angle into [0, 2π)
 * moves the seam but does not remove it. The fix is to evaluate the pattern TWICE — once on each
 * branch — and cross-fade between them across the seam, using a blend that is 0/1 well away from it.
 * A conditional branch instead of a blend puts the seam back.
 *
 * Callers evaluate their pattern at `.x` and `.y` and `mix(atWrapped, atAngle, .z)`. Both
 * evaluations must stay unconditional.
 */
export const seamlessAngularField = tgpu.fn([d.vec2f], d.vec3f)((delta) => {
    'use gpu'
    const angle = std.atan2(delta.y, delta.x)
    // Floored mod (atan2 can be negative) — GLSL `mod`, not WGSL `%`.
    const angleWrapped = angle - TAU * std.floor(angle / TAU)
    const blend = std.smoothstep(-0.15, 0.15, delta.x)
    return d.vec3f(angle, angleWrapped, blend)
})

// ─── Chromatic ring bands ─────────────────────────────────────────────────────────────────────

/**
 * Three concentric ring bands at radii `center + spread`, `center`, `center − spread`, returned as
 * an RGB triple — the prismatic edge of a lens element or a dispersed halo.
 *
 * Each channel is `1 − smoothstep(0, width, abs(dist − r))`, i.e. a band peaking ON its radius. The
 * red channel takes the OUTER radius by convention (longer wavelength refracts less), so a positive
 * `spread` gives the physically-expected red-outside/blue-inside fringe; pass a negative spread to
 * invert it.
 *
 * `width` is floored at 1e-4 because callers derive it from a size slider (LensFlare's ring width is
 * `size · 0.10`), and a zero width makes `smoothstep(0, 0, ·)` undefined.
 */
export const chromaticRingBand = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.vec3f)(
    (dist, center, spread, width) => {
        'use gpu'
        const w = std.max(width, 0.0001)
        const r = 1.0 - std.smoothstep(0.0, w, std.abs(dist - (center + spread)))
        const g = 1.0 - std.smoothstep(0.0, w, std.abs(dist - center))
        const b = 1.0 - std.smoothstep(0.0, w, std.abs(dist - (center - spread)))
        return d.vec3f(r, g, b)
    })

// ─── Segment (beam) fields ────────────────────────────────────────────────────────────────────

/**
 * Project a point onto a segment: returns `vec2(t, distance)` where `t` ∈ [0,1] is the clamped
 * parameter of the closest point along `a → b`.
 *
 * Returning BOTH values is the point — a tapered beam needs the parameter to interpolate its
 * thickness and the distance to shade its cross-section, and recomputing either costs the same as
 * the whole projection. The `max(lengthSq, 1e-4)` guard keeps a degenerate (zero-length) segment
 * finite rather than NaN, which matters because a UI lets both endpoints sit on the same pixel.
 */
export const pointToSegment = tgpu.fn([d.vec2f, d.vec2f, d.vec2f], d.vec2f)((p, a, b) => {
    'use gpu'
    const lineVec = d.vec2f(b.x - a.x, b.y - a.y)
    const toPoint = d.vec2f(p.x - a.x, p.y - a.y)
    const dotProduct = toPoint.x * lineVec.x + toPoint.y * lineVec.y
    const lineLengthSq = lineVec.x * lineVec.x + lineVec.y * lineVec.y
    const t = std.clamp(dotProduct / std.max(lineLengthSq, 0.0001), 0.0, 1.0)
    const closestPoint = d.vec2f(a.x + lineVec.x * t, a.y + lineVec.y * t)
    const distVec = d.vec2f(p.x - closestPoint.x, p.y - closestPoint.y)
    return d.vec2f(t, std.sqrt(distVec.x * distVec.x + distVec.y * distVec.y))
})

/**
 * The glow cross-section of a tapered beam: given the perpendicular `dist` and the along-beam
 * parameter `t` from {@link pointToSegment}, interpolate thickness and softness end-to-end and
 * return `vec2(colorT, alpha)`.
 *
 * `alpha` is a smoothstep shoulder from the beam edge outward, raised to `1 + softness · 1.5` so a
 * soft beam does not merely get wider but also fades non-linearly — a linear ramp reads as a flat
 * band with a visible outer edge. `colorT` is the inside→outside color parameter over the same
 * transition zone, so a caller can shade the core and the falloff differently.
 *
 * The interpolated softness is floored at 1e-4 for the same reason `thickness` is: the softness props
 * bottom out at 0 (Beam's do), and a zero softness collapses both transition zones to
 * `smoothstep(1, 1, ·)`, which is undefined.
 */
export const taperedSegmentGlow = tgpu.fn([d.f32, d.f32, d.f32, d.f32, d.f32, d.f32], d.vec2f)(
    (dist, t, startThickness, endThickness, startSoftness, endSoftness) => {
        'use gpu'
        const thickness = std.mix(startThickness, endThickness, t)
        const softness = std.max(std.mix(startSoftness, endSoftness, t), 0.0001)
        const normalizedDist = dist / std.max(thickness, 0.0001)

        // Outward glow with exponential transparency falloff.
        const edgeEnd = 1.0 + softness
        const alphaBase = 1.0 - std.smoothstep(1.0, edgeEnd, normalizedDist)
        const softnessFactor = 1.0 + softness * 1.5
        const alpha = std.pow(alphaBase, softnessFactor)

        // color transition zone around the beam edge.
        const colorGradientStart = 1.0 - softness
        const colorGradientEnd = 1.0 + softness
        const colorT = std.smoothstep(colorGradientStart, colorGradientEnd, normalizedDist)

        return d.vec2f(colorT, alpha)
    })

/**
 * A single soft streak band across a 1D coordinate: `exp(-(u - center)² / width²)` — a Gaussian
 * band peaking at `center`, the shape of light bouncing between film and backing plate, an
 * anamorphic bar, or any parallel-band artifact. Multiply several at different centers/widths for
 * a band stack.
 */
export const streakBand = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((u, center, width) => {
    'use gpu'
    return std.exp((u - center) * (u - center) * -1.0 / (width * width))
})

/**
 * Overexposure color ramp: fringe → mid → hot as `heat` rises, with the energy scaling by heat
 * (clamped at 1.6) so the fringe stays dim and the core blooms — the dye response of overexposed
 * film. Sample per-channel at offset heats for chromatic fringing ({@link chromaticHeatTaps}).
 */
export const heatRamp3 = tgpu.fn([d.f32, d.vec3f, d.vec3f, d.vec3f], d.vec3f)((heat, hot, mid, fringe) => {
    'use gpu'
    const toMid = std.smoothstep(0.0, 0.5, heat)
    const toHot = std.smoothstep(0.55, 1.15, heat)
    const rgb = std.mix(std.mix(fringe, mid, d.vec3f(toMid)), hot, d.vec3f(toHot))
    // Energy scales with heat so the fringe stays dim and the core blooms.
    return rgb.mul(std.clamp(heat, 0.0, 1.6))
})

/**
 * Three {@link heatRamp3} taps at offset heats (×1.08 / ×1 / ×0.88 for R/G/B) assembled into one
 * RGB — the chromatic fringing of an overexposed boundary, where the channels bloom at slightly
 * different rates.
 */
export const chromaticHeatTaps = tgpu.fn([d.f32, d.vec3f, d.vec3f, d.vec3f], d.vec3f)((heat, hot, mid, fringe) => {
    'use gpu'
    const rampR = heatRamp3(heat * 1.08, hot, mid, fringe)
    const rampG = heatRamp3(heat, hot, mid, fringe)
    const rampB = heatRamp3(heat * 0.88, hot, mid, fringe)
    return d.vec3f(rampR.x, rampG.y, rampB.z)
})

/**
 * The outer fade of a bounded radial light: 1 inside, smoothstepping to 0 between
 * `radius · (1 − feather)` and `radius`. `feather` is the fraction of the radius spent fading.
 */
export const radialFeatherMask = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((dist, radius, feather) => {
    'use gpu'
    const falloffStart = radius * (1.0 - feather)
    return 1.0 - std.smoothstep(falloffStart, radius, dist)
})

/**
 * {@link angularSineLobes} driven by a designer-facing `softness` slider: softness inverts into
 * the lobe exponent (`1 / (softness + 0.05) · 0.3`), so a soft ray is a low power, which widens
 * the bright part of each lobe without moving its centre.
 */
export const softRayLobes = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)((angle, count, phase, softness) => {
    'use gpu'
    const sharpness = 1.0 / (softness + 0.05) * 0.3
    return angularSineLobes(angle, count, phase, sharpness)
})

/**
 * Distance + angle around an unflipped centre prop, in aspect-corrected space: returns
 * `vec2(dist, angle)`. `center` is a TRANSFORMED position prop (stores `1 − y`), so this recovers
 * the authored y. The aspect is applied per-term (`uv.x·aspect − cx·aspect`) — the spelling the
 * radial light generators shipped with, kept verbatim.
 */
export const radialBurstFrame = tgpu.fn([d.vec2f, d.vec2f, d.vec2f], d.vec2f)((uv, viewport, center) => {
    'use gpu'
    const aspect = geom.aspectOf(viewport)
    const cx = center.x
    const cy = 1.0 - center.y
    const dx = uv.x * aspect - cx * aspect
    const dy = uv.y - cy
    const dist = std.sqrt(dx * dx + dy * dy)
    const angle = std.atan2(dy, dx)
    return d.vec2f(dist, angle)
})

/**
 * Quadratic corner-darkening mask about the frame centre: `clamp(1 − dist² · strength, 0, 1)` in
 * aspect-corrected space (aspect from the effective viewport, so a resize-fit box keeps the mask
 * round). 1 = untouched centre; strength 0 disables it.
 */
export const vignetteMask = tgpu.fn([d.vec2f, d.vec2f, d.f32], d.f32)((uv, viewport, strength) => {
    'use gpu'
    const aspect = geom.aspectOf(viewport)
    const vigX = (uv.x - 0.5) * aspect
    const vigY = uv.y - 0.5
    const vigD2 = vigX * vigX + vigY * vigY
    return std.clamp(1.0 - vigD2 * strength, 0.0, 1.0)
})

/**
 * Exposure composite of emitted light over a base color: screen blend + an additive overexposure
 * push (×0.16) + the alpha raised by the light's Rec.601 luminance (×0.85) — emitted light shows
 * even over transparent areas. The film-exposure tail of a light leak or glow overlay.
 */
export const screenGlowComposite = tgpu.fn([d.vec4f, d.vec3f], d.vec4f)((color, leakRgb) => {
    'use gpu'
    const base = color.xyz
    const screened = d.vec3f(1.0, 1.0, 1.0).sub(
        (d.vec3f(1.0, 1.0, 1.0).sub(std.clamp(base, d.vec3f(0.0), d.vec3f(1.0))))
            .mul(d.vec3f(1.0, 1.0, 1.0).sub(std.clamp(leakRgb, d.vec3f(0.0), d.vec3f(1.0)))),
    )
    const lifted = screened.add(leakRgb.mul(0.16))
    const outRgb = std.clamp(lifted, d.vec3f(0.0), d.vec3f(1.0))
    const leakLuma = std.clamp(tone.luma601Dot(leakRgb), 0.0, 1.0)
    const outA = std.clamp(color.w + leakLuma * 0.85, 0.0, 1.0)
    return d.vec4f(outRgb, outA)
})

/**
 * The local frame of a beam anchored at a point and aimed at the canvas centre: returns
 * `vec2(u, v)` — distance ALONG the beam and LATERAL offset from it, in aspect-corrected space.
 *
 * `anchorRaw` is a TRANSFORMED position prop (`transformPosition` stores `1 − y`), so this recovers
 * the authored y itself. The direction degenerates when the anchor sits at the centre; below a 0.02
 * length it falls back to +x rather than normalizing near-zero, which would make the frame spin
 * wildly as the anchor crosses the middle.
 *
 * Everything downstream (bloom, streak bands, falloff) is authored in this frame, which is what lets
 * a light leak be dragged anywhere on the canvas and still point inward.
 */
export const beamLocalFrame = tgpu.fn([d.vec2f, d.f32, d.vec2f], d.vec2f)((uv, aspect, anchorRaw) => {
    'use gpu'
    const pA = d.vec2f(uv.x * aspect, uv.y)
    const anchor = d.vec2f(anchorRaw.x * aspect, 1.0 - anchorRaw.y)
    const toCenter = d.vec2f(aspect * 0.5, 0.5).sub(anchor)
    const cLen = std.length(toCenter)
    const dirX = std.select(toCenter.x / std.max(cLen, 0.001), d.f32(1), cLen < 0.02)
    const dirY = std.select(toCenter.y / std.max(cLen, 0.001), d.f32(0), cLen < 0.02)
    const relX = pA.x - anchor.x
    const relY = pA.y - anchor.y
    return d.vec2f(relX * dirX + relY * dirY, relY * dirX - relX * dirY)
})

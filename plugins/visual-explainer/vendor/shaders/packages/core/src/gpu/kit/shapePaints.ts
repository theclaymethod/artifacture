/**
 * Figure/stroke paint bodies behind std/paint/figures — the coverage masks for the
 * drawn-figure generators (stroked segment, sine stroke).
 *
 * Each body here is pure math over a composed UV + viewport: the paint nouns in
 * `std/paint/figures.ts` wire uniforms/time into them and own the color tail
 * (`vec4(color.rgb, color.a * mask)`). Blob's former bodies were dissolved into
 * `shaders/Blob/index.ts` as std Expr algebra (2026-09-01) — looks don't live in the kit.
 */
import {d, std, tgpu} from './index'
import {DEG_TO_RAD, TAU} from './constants'

// Guard for divisions by segment length / pattern period when endpoints coincide or lengths hit 0.
const EPS = 1e-5

// ── Stroked segment ───────────────────────────────────────────────────────────

/**
 * Arc-length/perpendicular decomposition of a point against segment A→B, all in the same
 * (aspect-corrected) space: returns `vec3(t, perp, len)` — the UNCLAMPED arc length from A, the
 * degenerate-safe perpendicular distance (recovered from the clamped-projection distance as
 * `sqrt(dSeg² − overshoot²)`, which stays correct when A≈B where the cross-product form
 * degenerates to 0 everywhere), and the EPS-guarded segment length.
 */
export const segmentArcPerp = tgpu.fn([d.vec2f, d.vec2f, d.vec2f], d.vec3f)((p, a, b) => {
    'use gpu'
    const pax = p.x - a.x
    const pay = p.y - a.y
    const bax = b.x - a.x
    const bay = b.y - a.y
    const len = std.max(std.length(d.vec2f(bax, bay)), d.f32(EPS))
    const t = (pax * bax + pay * bay) / len
    const overshoot = std.max(std.max(-t, t - len), d.f32(0))
    const h = std.clamp(t / len, d.f32(0), d.f32(1))
    const dSeg = std.length(d.vec2f(pax - bax * h, pay - bay * h))
    const perp = std.sqrt(std.max(dSeg * dSeg - overshoot * overshoot, d.f32(0)))
    return d.vec3f(t, perp, len)
})

/**
 * Line segment coverage mask with per-end square/rounded caps and endpoint-aligned dash/dot
 * patterns.
 *
 * Aspect-correct the UV (distances are then in units of canvas height), recover the authored
 * endpoint y's (transformPosition stores (x, 1-y) — the Twirl double-flip), then decompose the
 * pixel against the segment into arc length `t` from A and perpendicular distance `perp`. `perp`
 * is reconstructed from the clamped-projection segment distance (sqrt(dSeg² − overshoot²)) so it
 * stays correct when A≈B, where the cross-product form degenerates to 0 everywhere.
 *
 * All three styles reduce to one "element" formulation: a signed along-axis offset `c` from the
 * nearest element's center (solid = the whole segment; dashed/dotted = the nearest cell, with the
 * cell INDEX clamped to [first, last] so the repeating pattern needs no separate trim pass) plus a
 * core half-length per cap shape. Rounded caps are capsules (solid caps center on the endpoints,
 * dash caps are inscribed so a dash stays exactly dashLength long); square caps are boxes ending
 * flat at the element bounds. `capStart` shapes the A-facing side of every element and `capEnd`
 * the B-facing side — so square caps also square off dashes and dots. Dash/dot periods are
 * rescaled so the pattern lands exactly on both endpoints (design-tool endpoint alignment, which
 * plain SVG dashing doesn't give you). `style` and the caps arrive as runtime mode numbers
 * (solid 0 / dashed 1 / dotted 2; square 0 / rounded 1). Pure math — CPU-executable for tests.
 */
export const lineMask = tgpu.fn(
    [d.vec2f, d.vec2f, d.vec2f, d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32], d.f32,
)((uv, viewport, pointA, pointB, thickness, style, dashLength, gapLength, capStart, capEnd) => {
    'use gpu'
    // Frame via the D-1 words (guarded aspect — the old inline copy divided raw); the segment
    // decomposition is the shared segmentArcPerp part.
    const aspect = geom.aspectOf(viewport)
    const p = geom.aspectCorrectedUV(uv, viewport)
    const a = geom.aspectCentrePosition(pointA, aspect)
    const b = geom.aspectCentrePosition(pointB, aspect)
    const seg = segmentArcPerp(p, a, b)
    const t = seg.x
    const perp = seg.y
    const len = seg.z

    const halfT = thickness * 0.5

    // Solid: one element spanning the segment. Rounded caps center on the endpoints (core = the
    // full segment, capsule extends halfT beyond); square ends flat exactly at A and B.
    const cSolid = t - len * 0.5
    const axSolid = len * 0.5

    // Dashed: n dashes spanning A→B exactly (n·dash + (n−1)·gap rescaled to len). Rounded dash
    // caps are inscribed so each dash reads as exactly dashL long with either cap shape.
    const rawDash = std.max(dashLength, d.f32(EPS))
    const rawPeriod = rawDash + gapLength
    const nDash = std.max(std.floor((len + gapLength) / rawPeriod + 0.5), d.f32(1))
    const scale = len / std.max(nDash * rawDash + (nDash - 1.0) * gapLength, d.f32(EPS))
    const dashL = rawDash * scale
    const period = rawPeriod * scale
    const kDash = std.clamp(std.floor(t / period), d.f32(0), nDash - 1.0)
    const cDash = t - (kDash * period + dashL * 0.5)
    const axDashRound = std.max(dashL * 0.5 - halfT, d.f32(0))
    const axDashSquare = dashL * 0.5

    // Dotted: thickness-sized dots, period rescaled so dots land exactly on A and B. A dot's core
    // is a point for rounded caps (disk) and halfT for square caps (thickness×thickness square).
    const rawDotPeriod = std.max(thickness + gapLength, d.f32(EPS))
    const nDot = std.max(std.floor(len / rawDotPeriod + 0.5), d.f32(1))
    const dotPeriod = len / nDot
    const kDot = std.clamp(std.floor(t / dotPeriod + 0.5), d.f32(0), nDot)
    const cDot = t - kDot * dotPeriod

    const isPattern = style >= 0.5
    const isDotted = style >= 1.5
    const c = std.select(cSolid, std.select(cDash, cDot, isDotted), isPattern)
    const axRound = std.select(axSolid, std.select(axDashRound, d.f32(0), isDotted), isPattern)
    const axSquare = std.select(axSolid, std.select(axDashSquare, halfT, isDotted), isPattern)

    // Per-side cap: the A-facing side of the element uses capStart, the B-facing side capEnd.
    // The capsule/box SDFs stay inline: they live in element space (axial offset c, perp) with a
    // per-side core half-length, which is not the centered (dx, dy) formulation of sdf.ts's
    // roundedRectSdf. [B] Gate-C candidate: converge onto shared axial SDF words.
    const capHere = std.select(capStart, capEnd, c > 0.0)
    const sdRound = std.length(d.vec2f(std.max(std.abs(c) - axRound, d.f32(0)), perp)) - halfT
    const qx = std.abs(c) - axSquare
    const qy = perp - halfT
    const sdSquare = std.length(d.vec2f(std.max(qx, d.f32(0)), std.max(qy, d.f32(0)))) + std.min(std.max(qx, qy), d.f32(0))
    const sd = std.select(sdSquare, sdRound, capHere >= 0.5)

    // ~1px device-space feather keeps edges antialiased at any thickness.
    const feather = 1.0 / viewport.y
    return 1.0 - std.smoothstep(-feather, feather, sd)
})

// ── Sine stroke ───────────────────────────────────────────────────────────────

/**
 * Animated sine-wave coverage mask.
 *
 * Aspect-correct the UV, centre on `position` (transformPosition stores (x, 1-y) so
 * `1 - position.y` recovers the authored y — the Twirl double-flip), rotate by `angle`, then
 * measure the perpendicular distance to the traveling sine and soft-band it by
 * thickness/softness. `animTime` is the per-node accumulated time. Pure trig — CPU-executable
 * for tests.
 */
export const sineWaveMask = tgpu.fn(
    [d.vec2f, d.vec2f, d.f32, d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32], d.f32,
)((uv, viewport, angle, position, frequency, amplitude, thickness, softness, animTime) => {
    'use gpu'
    // Frame + rotation via the D-1 words (guarded aspect — the old inline copy divided raw).
    const centered = geom.aspectCenteredDelta(uv, position, viewport)

    const angleRad = angle * DEG_TO_RAD
    const cosAngle = std.cos(angleRad)
    const sinAngle = std.sin(angleRad)
    const rotated = geom.rotate2(centered, cosAngle, sinAngle)

    const waveInput = rotated.x * frequency * TAU + animTime
    const sineWave = std.sin(waveInput) * amplitude

    const distanceFromWave = std.abs(rotated.y - sineWave)
    const halfThickness = thickness * 0.5
    const halfSoftness = softness * 0.5
    return 1.0 - std.smoothstep(halfThickness - halfSoftness, halfThickness + halfSoftness, distanceFromWave)
})

// ── Lens flare ────────────────────────────────────────────────────────────────
//
// The additive camera-flare light stack, decomposed into parts behind std/paint/figures'
// `lensFlare` noun: a shared frame (light position, flare axis, master fade), the ghost disc,
// and one part per artifact (halo, starburst, streak, glare, core) — the noun sums them.
// Namespace-style calls (geom.aspectOf, lightfields.*, tone.*) keep the emitted WGSL names of
// the shared primitives unchanged.
import * as geom from './geom'
import * as lightfields from './lightfields'
import * as tone from './tone'
import {TAU as TAU_FULL} from './constants'

// Full-precision TAU (this body once shipped a truncated 6.2831853; deliberately corrected).
// Re-bound to a section-local name so the transpiler folds it to a literal without colliding
// with this module's other constant imports.

// Smooth spectral rainbow from t∈[0,1] — phase-offset cosines cycling R→G→B.
const lensFlareSpectral = tgpu.fn([d.f32], d.vec3f)((t) => {
    'use gpu'
    return d.vec3f(
        std.cos(TAU_FULL * t) * 0.5 + 0.5,
        std.cos(TAU_FULL * (t - 0.333)) * 0.5 + 0.5,
        std.cos(TAU_FULL * (t - 0.666)) * 0.5 + 0.5,
    )
})

/** The shared per-pixel frame every flare artifact reads. */
export const FlareFrame = d.struct({
    aspect: d.f32,
    lightPos: d.vec2f,
    flareAxis: d.vec2f,
    masterFade: d.f32,
    lightDist: d.f32,
    lightAngle: d.f32,
}).$name('FlareFrame')

/**
 * The flare's shared frame: unflip the light position (a transformPosition prop), aim the flare
 * axis at the frame centre, and fold the shimmer (three detuned sines) and the edge fade into one
 * master fade. `lightDist`/`lightAngle` are the aspect-corrected polar coordinates of the pixel
 * about the light.
 */
export const flareFrame = tgpu.fn([d.vec2f, d.vec2f, d.f32, d.vec2f, d.f32, d.f32], FlareFrame)(
    (uv, viewport, t, lightPosRaw, intensity, edgeFade) => {
        'use gpu'
        const aspect = geom.aspectOf(viewport)
        // lightPosition is TRANSFORMED (stores 1-y); 1 - y recovers the authored y.
        const lightPos = d.vec2f(lightPosRaw.x, 1.0 - lightPosRaw.y)
        const flareAxis = d.vec2f(0.5 - lightPos.x, 0.5 - lightPos.y)

        const shimmer = std.sin(t * 3.7) * 0.04 + std.sin(t * 7.3) * 0.03 + std.sin(t * 13.1) * 0.02 + 0.97
        const edgeDist = std.max(std.abs(lightPos.x - 0.5) * 2.0, std.abs(lightPos.y - 0.5) * 2.0)
        const fadeStart = 1.0 - edgeFade * 0.5
        const edgeFadeV = std.mix(1.0, 1.0 - std.smoothstep(fadeStart, 1.0, edgeDist), edgeFade)
        const masterFade = intensity * edgeFadeV * shimmer

        const toLightAR = d.vec2f((uv.x - lightPos.x) * aspect, uv.y - lightPos.y)
        const lightDist = std.length(toLightAR)
        const lightAngle = std.atan2(toLightAR.y, toLightAR.x)
        return FlareFrame({aspect, lightPos, flareAxis, masterFade, lightDist, lightAngle})
    })

/**
 * One internal-reflection ghost disc + prismatic edge ring. Config (offset/size/bright/hollow +
 * tint r/g/b/gPhase) is baked per-call so the ghost table unrolls at the call site (a JS array
 * can't index inside a body). `disc`/`tint` ride vec4 bundles; the shared spread/chroma/intensity
 * arrive as scalars.
 */
export const lensFlareGhost = tgpu.fn(
    [d.vec2f, d.f32, d.vec2f, d.vec2f, d.f32, d.f32, d.f32, d.f32, d.vec4f, d.vec4f],
    d.vec3f,
)((uv, aspect, lightPos, flareAxis, t, ghostSpread, ghostChroma, ghostInt, disc, tint) => {
    'use gpu'
    const offset = disc.x
    const size = disc.y
    const bright = disc.z
    const hollow = disc.w
    const r = tint.x
    const g = tint.y
    const b = tint.z
    const gPhase = tint.w
    const ghostPos = lightPos.add(flareAxis.mul(offset * ghostSpread * 2.0))
    const toGhost = d.vec2f((uv.x - ghostPos.x) * aspect, uv.y - ghostPos.y)
    const dist = std.length(toGhost)
    const sz = size
    const discShape = 1.0 - std.smoothstep(sz * 0.12, sz, dist)
    const innerFade = 1.0 - std.smoothstep(sz * 0.05, sz * 0.45, dist)
    const shape = discShape * (1.0 - innerFade * hollow)
    const gShimmer = std.sin(t * 4.3 + gPhase) * 0.08 + std.sin(t * 9.1 + gPhase * 1.7) * 0.05 + 0.95
    const ringCenter = sz * 0.78
    const chromaSpread = sz * ghostChroma * 0.14
    const ringWidth = sz * 0.10
    const ring = lightfields.chromaticRingBand(dist, ringCenter, chromaSpread, ringWidth)
    const rRing = ring.x
    const gRing = ring.y
    const bRing = ring.z
    const brightness = bright * ghostInt * gShimmer
    return d.vec3f(
        (shape * r + rRing * ghostChroma) * brightness,
        (shape * g + gRing * ghostChroma) * brightness,
        (shape * b + bRing * ghostChroma) * brightness,
    )
})

/**
 * The halo ring: chromatic dispersion about the anti-light point (the light position mirrored
 * through the frame centre), with a slow angular brightness variation so the ring reads as glass
 * rather than a drawn circle.
 */
export const flareHalo = tgpu.fn(
    [d.vec2f, d.f32, d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32], d.vec3f,
)((uv, aspect, lightPos, t, haloInt, haloRad, haloChroma, haloSoft) => {
    'use gpu'
    const antiLight = d.vec2f(1.0 - lightPos.x, 1.0 - lightPos.y)
    const toAntiLight = d.vec2f((uv.x - antiLight.x) * aspect, uv.y - antiLight.y)
    const antiLightDist = std.length(toAntiLight)
    const haloChromaSpread = haloRad * haloChroma * 0.06
    const haloWidth = haloSoft * 0.12 + 0.005
    const halo = lightfields.chromaticRingBand(antiLightDist, haloRad, haloChromaSpread, haloWidth)
    const haloAngle = std.atan2(toAntiLight.y, toAntiLight.x)
    const haloAngVar = std.sin(haloAngle * 3.0 + t * 0.5) * 0.12 + 0.88
    return halo.mul(haloInt).mul(haloAngVar)
})

/**
 * The diffraction starburst about the light: two spike sets at different powers, the secondary
 * offset a little in angle — that pairing is what makes diffraction spikes read as glass rather
 * than as a star primitive. Spikes rotate slowly with the flare axis + time and tint faintly
 * through the spectral rainbow.
 */
export const flareStarburst = tgpu.fn(
    [d.f32, d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32], d.vec3f,
)((lightAngle, flareAxis, aspect, t, lightDist, starburstPts, starburstInt) => {
    'use gpu'
    const axisAng = std.atan2(flareAxis.y, flareAxis.x * aspect)
    const rotation = axisAng * 0.5 + t * 0.06
    const spikeAngle = lightAngle + rotation
    const primarySpikes = lightfields.angularCosineSpikes(spikeAngle, starburstPts / 2.0, 3.5)
    const secondarySpikes = lightfields.angularCosineSpikes(spikeAngle + 0.25, starburstPts / 2.0, 7.0) * 0.4
    const radialFall = 1.0 / (1.0 + lightDist * lightDist * 60.0)
    const starSpectral = lensFlareSpectral(spikeAngle / TAU_FULL + 0.5)
    const starTint = std.mix(d.vec3f(1.0, 0.97, 0.92), starSpectral, 0.12)
    return starTint.mul((primarySpikes + secondarySpikes) * radialFall * starburstInt)
})

/**
 * The anamorphic streak: a horizontal bar through the light with per-channel extents (blue
 * spreads furthest — the cyan-edged widescreen streak), fading fast vertically.
 */
export const flareStreak = tgpu.fn([d.vec2f, d.vec2f, d.f32, d.f32], d.vec3f)(
    (uv, lightPos, streakLen, streakInt) => {
        'use gpu'
        const dy = std.abs(uv.y - lightPos.y)
        const dx = std.abs(uv.x - lightPos.x)
        const vertFall = std.exp(-800.0 * dy * dy)
        const lenSq = streakLen * streakLen * 0.25 + 0.001
        const rStreak = std.exp(-1.0 * dx * dx / (lenSq * 0.7))
        const gStreak = std.exp(-1.0 * dx * dx / lenSq)
        const bStreak = std.exp(-1.0 * dx * dx / (lenSq * 1.4))
        return d.vec3f(vertFall * rStreak * 0.5, vertFall * gStreak * 0.65, vertFall * bStreak * 0.9).mul(streakInt)
    })

/** Veiling glare: a warm-white Gaussian wash about the light that lifts contrast around it. */
export const flareGlare = tgpu.fn([d.f32, d.f32, d.f32], d.vec3f)((lightDist, glareSz, glareInt) => {
    'use gpu'
    const glareSharpness = 1.0 / (glareSz * glareSz + 0.01)
    const glareFalloff = lightfields.radialGaussianFalloff(lightDist, glareSharpness)
    return d.vec3f(1.0, 0.98, 0.95).mul(glareFalloff * glareInt)
})

/**
 * The bright core: a soft exponential glow plus a hard pinpoint.
 * NOT lightfields.radialGaussianFalloff: this is spelled `-500·d·d`, which groups its multiplies
 * differently from the primitive's `-(d·d·k)`. Same value in exact arithmetic, but the rounding
 * order differs, so swapping it would be a sub-ULP pixel change rather than a provable no-op.
 */
export const flareCore = tgpu.fn([d.f32, d.f32], d.vec3f)((lightDist, intensity) => {
    'use gpu'
    const coreSoft = std.exp(-500.0 * lightDist * lightDist)
    const coreSharp = 1.0 - std.smoothstep(0.0, 0.025, lightDist)
    return d.vec3f(1.0, 0.98, 0.96).mul((coreSoft + coreSharp * 1.5) * intensity)
})

/** Scale the summed flare light by the master fade and derive alpha from its luminance. */
export const flareComposite = tgpu.fn([d.vec3f, d.f32], d.vec4f)((flareTotal, masterFade) => {
    'use gpu'
    const finalColor = flareTotal.mul(masterFade)
    const flareAlpha = std.clamp(tone.luma601Dot(finalColor) * 2.0, 0.0, 1.0)
    return d.vec4f(finalColor, flareAlpha)
})

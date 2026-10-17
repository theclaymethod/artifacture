/**
 * Coordinate-map bodies for the warp producers behind std/warps.
 *
 * Every function here is a PURE coordinate map: given a screen UV (plus the warp's
 * parameters) it returns the source coordinate to sample — never a color, never a texture
 * read. The warp role's scaffold turns each map into both engine paths (the RTT fragment
 * and the analytic UV fold), so these bodies are the single source of truth for what each
 * distortion does to space.
 *
 * Position props arrive as the ALREADY-transformed values (`transformPosition` stores
 * `(x, 1 - y)`), so the recurring `1.0 - center.y` recovers the authored y. Maps that need
 * circular behaviour in visual space aspect-correct X before measuring, and divide it back
 * out before returning. Vector ops use the fluent form; scalar ops use plain infix.
 */
import {tgpu, d, std} from './index'
import {DEG_TO_RAD, HALF_PI, PI, TAU, TWO_PI} from './constants'
import {mxNoiseFloat3} from './noise'
import {edgeTransparentMask, edgeMirrorUV, edgeWrapUV, edgeClampUV} from './edges'
import {legacySinHash11} from '../scaffolds/shared'
import {call, vec4} from '../composer'
import type {Expr} from '../contract'

// ─── Mirror ─────────────────────────────────────────────────────────────────────────────

/**
 * Reflect a screen UV across the mirror line through `center` at `angle`.
 *
 * Returns `vec3(finalMirroredUV.xy, shouldMirror)`. `shouldMirror` is
 * `step(0, signedDistance)`, a hard 0/1 pick used to select between the near side
 * (original UV) and the reflected side.
 */
export const mirrorReflect = tgpu.fn([d.vec2f, d.f32, d.vec2f, d.f32], d.vec3f)(
    (center, angle, uv, aspect) => {
        'use gpu'
        const aspectCorrectedUV = d.vec2f(uv.x * aspect, uv.y)
        const centerPos = d.vec2f(center.x * aspect, 1.0 - center.y)
        const delta = aspectCorrectedUV.sub(centerPos)

        // Mirror line direction, and its perpendicular normal.
        const angleRad = angle * DEG_TO_RAD
        const lineDirection = d.vec2f(std.cos(angleRad), std.sin(angleRad))
        const lineNormal = d.vec2f(lineDirection.y * -1.0, lineDirection.x)

        // Signed distance from the line; reflect via P' = P - 2 (P·N) N.
        const signedDistance = std.dot(delta, lineNormal)
        const reflectedDelta = delta.sub(lineNormal.mul(signedDistance * 2.0))
        const mirroredUV = centerPos.add(reflectedDelta)
        const finalMirroredUV = d.vec2f(mirroredUV.x / aspect, mirroredUV.y)

        // 1 on the far side of the mirror line (reflect), 0 on the near side (keep original).
        const shouldMirror = std.step(0.0, signedDistance)
        return d.vec3f(finalMirroredUV.x, finalMirroredUV.y, shouldMirror)
    })

// ─── Flip ───────────────────────────────────────────────────────────────────────────────

/**
 * Mirror the UV across the canvas axes. `flipX`/`flipY` arrive as ±1 f32 uniforms
 * (transformBoolean maps false → −1, NOT 0 — so they must be COMPARED, never used as a
 * mix factor). The flip maps [0,1] onto [0,1], so no edge handling is ever needed.
 */
export const flipUV = tgpu.fn([d.vec2f, d.f32, d.f32], d.vec2f)((uv, flipX, flipY) => {
    'use gpu'
    const x = std.select(uv.x, 1.0 - uv.x, flipX > 0.0)
    const y = std.select(uv.y, 1.0 - uv.y, flipY > 0.0)
    return d.vec2f(x, y)
})

// ─── Bend ───────────────────────────────────────────────────────────────────────────────

// The bend model: the frame is a flexible sheet curved into a parabola z = b·s² along the bend
// axis (s normalized to ±1 at the frame edges), viewed by a camera at distance D on the axis.
// Positive strength curls the ends TOWARD the viewer (edges magnify, like a curved display);
// negative curls them away (edges recede and the sheet's silhouette pulls inside the frame).
// D sets how aggressive the perspective is; B_MAX is the curvature at |strength| = 1 — together
// they give ~2.5× edge magnification at full positive strength, and a bend-away sheet whose
// visible edge lands at ~64% of the half-frame.
const CAMERA_D = 2.0
const B_MAX = 1.2

/**
 * Invert the bent-sheet projection for one screen UV.
 *
 * The sheet is FLAT inside |s| ≤ f (the falloff threshold) and parabolic beyond it:
 * z = b·u² with u = (|s| − f)/(1 − f) — falloff 0 curves the whole frame (u = |s|), higher
 * keeps the middle untouched and concentrates the bend at the ends. A sheet point at
 * (s, t, z) projects to screen (s·k, t·k) with k = D/(D − z), so we must INVERT: given the
 * screen coordinate find the sheet coordinate. Inside the flat region that's the identity;
 * beyond it a quadratic in u — b·m'·u² + D(1−f)·u + D(f − m') = 0 (m' = |s'| screen) →
 * u = (√(D²(1−f)² + 4·b·m'·D·(m'−f)) − D(1−f))/(2·b·m') — picked so the root collapses to
 * u = (m'−f)/(1−f) as b → 0 (guarded by the linear fallback there). Across the axis the
 * inverse is direct: t = t'·(D − z)/D, which is what makes edges swell in BOTH dimensions.
 * When the discriminant goes negative (bend-away, past the sheet's visible silhouette) there
 * is no sheet under that pixel — the coordinate is pushed far out of [0,1] so the edge mode
 * decides (transparent by default). All math in aspect-corrected space so the axis is a true
 * direction on any canvas.
 */
export const bendRemap = tgpu.fn([d.f32, d.f32, d.f32, d.vec2f, d.f32], d.vec2f)(
    (strength, falloff, angle, uv, aspect) => {
        'use gpu'
        const angleRad = angle * DEG_TO_RAD
        const dir = d.vec2f(std.cos(angleRad), std.sin(angleRad))
        const perp = d.vec2f(dir.y * -1.0, dir.x)
        const p = d.vec2f((uv.x - 0.5) * aspect, uv.y - 0.5)
        const sScreen = std.dot(p, dir)
        const tScreen = std.dot(p, perp)

        // Frame half-extent along the bend axis (exact for axis-aligned angles) → s normalized
        // to ±1 at the frame edges, so the curvature is aspect- and angle-independent.
        const sHalf = std.max((std.abs(dir.x) * aspect + std.abs(dir.y)) * 0.5, 1e-3)
        const snScreen = sScreen / sHalf
        const b = strength * B_MAX
        const f = std.clamp(falloff, 0.0, 1.0) * 0.9 // keep a real bend band (1 − f ≥ 0.1)
        const fSpan = 1.0 - f
        const m = std.abs(snScreen)
        const sig = std.select(d.f32(-1), d.f32(1), snScreen >= 0.0)

        // Quadratic inverse in the bend band, with a linear fallback where b·m ~ 0 (flat sheet
        // or the axis midline) — the closed form divides by it.
        const a2 = b * m
        const disc = CAMERA_D * CAMERA_D * fSpan * fSpan + 4.0 * a2 * CAMERA_D * (m - f)
        const nearZero = std.abs(a2) < 1e-5
        const denom = std.select(a2 * 2.0, d.f32(1), nearZero)
        const uQuad = (std.sqrt(std.max(disc, 0.0)) - CAMERA_D * fSpan) / denom
        const uOn = std.select(uQuad, (m - f) / fSpan, nearZero)
        // Past the bend-away silhouette (no sheet here): push far outside so edge handling wins.
        const u = std.select(d.f32(6), std.max(uOn, 0.0), disc >= 0.0)

        // Flat region (|s'| ≤ f): identity. Bend band: back from u to the sheet coordinate.
        const snBend = sig * (f + u * fSpan)
        const inFlat = m <= f
        const sn = std.select(snBend, snScreen, inFlat)
        const z = std.select(b * u * u, d.f32(0), inFlat)

        // Perpendicular inverse uses the sheet height at the SOLVED s (z depends only on s).
        const tSrc = tScreen * (CAMERA_D - z) / CAMERA_D

        const srcP = dir.mul(sn * sHalf).add(perp.mul(tSrc))
        return d.vec2f(srcP.x / aspect + 0.5, srcP.y + 0.5)
    })

// ─── Bulge ──────────────────────────────────────────────────────────────────────────────

/**
 * The bulge/pinch UV displacement around `center`. Negative displacement (positive
 * `strength`, then negated) scales the delta down → magnification; positive → pinch.
 */
export const bulgeUV = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32, d.vec2f, d.f32], d.vec2f)(
    (center, strength, radius, falloff, uv, aspect) => {
        'use gpu'
        const aspectCorrectedUV = d.vec2f(uv.x * aspect, uv.y)
        // Flip Y back and aspect-correct X (circular effect in visual space).
        const centerPos = d.vec2f(center.x * aspect, 1.0 - center.y)

        const delta = aspectCorrectedUV.sub(centerPos)
        const distance = std.length(delta)

        // Smooth falloff based on radius (scaled). innerRadius stays below effectRadius to avoid the
        // smoothstep edge case: falloff 0 → near-hard edge, falloff 1 → maximum smoothness.
        const effectRadius = radius * 0.5
        const innerRadius = effectRadius * std.max(1.0 - falloff - 0.001, 0.0)
        const smoothFalloff = 1.0 - std.smoothstep(innerRadius, effectRadius, distance)

        // Quadratic falloff for a natural bulge shape.
        const normalizedDist = distance / effectRadius
        const distSq = normalizedDist * normalizedDist
        const quadraticFalloff = std.max(0.0, 1.0 - distSq)

        const falloffTotal = smoothFalloff * quadraticFalloff

        // Negative strength magnifies (bulge), positive pinches — matches the simple example.
        const negStrength = strength * -1.0
        const displacementAmount = negStrength * falloffTotal
        // Scale the delta by (1 + displacement): scales the distance from center, not a fixed offset.
        const scaleFactor = 1.0 + displacementAmount
        const bulgedDelta = delta.mul(scaleFactor)
        const bulgedUV = centerPos.add(bulgedDelta)

        // Back from aspect-corrected space.
        return d.vec2f(bulgedUV.x / aspect, bulgedUV.y)
    })

// ─── Twirl ──────────────────────────────────────────────────────────────────────────────

/** Rotate the delta-from-center by an angle proportional to its distance — the twist map. */
export const twirlUV = tgpu.fn([d.vec2f, d.f32, d.vec2f, d.f32], d.vec2f)((center, intensity, uv, aspect) => {
    'use gpu'
    const centerPos = d.vec2f(center.x, 1.0 - center.y)
    const delta = uv.sub(centerPos)
    // Aspect-correct X before measuring distance (circular twist in visual space).
    const acd = d.vec2f(delta.x * aspect, delta.y)
    const angle = intensity * std.length(acd)
    const cosA = std.cos(angle)
    const sinA = std.sin(angle)
    const rotatedX = cosA * acd.x - sinA * acd.y
    const rotatedY = sinA * acd.x + cosA * acd.y
    // Back to UV space (undo aspect on X) and re-add the centre.
    return d.vec2f(rotatedX / aspect + centerPos.x, rotatedY + centerPos.y)
})

// ─── Kaleidoscope ───────────────────────────────────────────────────────────────────────

/**
 * Radial mirrored-segment fold. The angle is measured with `atan2` (range [-π, π]) and the
 * rotation offset can push it negative, so the segment wrap MUST use FLOORED mod
 * (`x - m*floor(x/m)`) — `std.mod` is TRUNCATED (%), which differs from a floored `mod`
 * for negative operands and would tear the fold near angle 0.
 */
export const kaleidoscopeUV = tgpu.fn([d.vec2f, d.f32, d.f32, d.vec2f, d.f32], d.vec2f)(
    (center, segments, angle, uv, aspect) => {
        'use gpu'
        const aspectCorrectedUV = d.vec2f(uv.x * aspect, uv.y)
        const centerPos = d.vec2f(center.x * aspect, 1.0 - center.y)
        const delta = aspectCorrectedUV.sub(centerPos)

        // Cartesian → polar.
        const radius = std.length(delta)
        const currentAngle = std.atan2(delta.y, delta.x)

        // Rotate, then wrap into one mirrored segment pair.
        const rotatedAngle = currentAngle + angle * DEG_TO_RAD
        const segmentAngle = TAU / segments
        const segTwo = segmentAngle * 2.0
        // FLOORED mod (rotatedAngle can be negative).
        const wrappedAngle = rotatedAngle - segTwo * std.floor(rotatedAngle / segTwo)
        // Mirror every other segment: past the halfway line, fold back.
        const finalAngle = std.select(wrappedAngle, segTwo - wrappedAngle, wrappedAngle > segmentAngle)

        // Polar → Cartesian, back into UV space.
        const kaleidoscopeX = std.cos(finalAngle) * radius
        const kaleidoscopeY = std.sin(finalAngle) * radius
        const kaleidoscopePos = centerPos.add(d.vec2f(kaleidoscopeX, kaleidoscopeY))
        return d.vec2f(kaleidoscopePos.x / aspect, kaleidoscopePos.y)
    })

// ─── Stretch ────────────────────────────────────────────────────────────────────────────

/**
 * Directional stretch: decompose the delta-from-center into a component parallel to the
 * stretch axis and a perpendicular one; the parallel component is compressed by a
 * strength-scaled factor that ramps in past the center along the axis (falloff controls
 * the ramp width). strength/falloff carry internal scale factors (×100, ×75).
 */
export const stretchUV = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32, d.vec2f, d.f32], d.vec2f)(
    (center, strength, angle, falloff, uv, aspect) => {
        'use gpu'
        const aspectCorrectedUV = d.vec2f(uv.x * aspect, uv.y)
        const centerPos = d.vec2f(center.x * aspect, 1.0 - center.y)
        const delta = aspectCorrectedUV.sub(centerPos)

        const angleRad = angle * DEG_TO_RAD
        const directionVector = d.vec2f(std.cos(angleRad), std.sin(angleRad))

        // Project delta onto the stretch axis; split into parallel + perpendicular.
        const projection = std.dot(delta, directionVector)
        const parallel = directionVector.mul(projection)
        const perpendicular = delta.sub(parallel)

        // Falloff → transition width (0 = near-hard edge, 1 = gradual over 75 units).
        const transitionWidth = std.mix(0.001, 75.0, falloff)
        const effectMask = std.clamp(projection / transitionWidth, 0.0, 1.0)

        // Compress along the axis by dividing by a strength-scaled factor (avoids quadratic artifacts).
        const scaledStrength = strength * 100.0
        const stretchFactor = 1.0 + scaledStrength * effectMask
        const finalProjection = projection / stretchFactor

        const finalParallel = directionVector.mul(finalProjection)
        const stretchedDelta = finalParallel.add(perpendicular)
        const stretchedUV = centerPos.add(stretchedDelta)
        return d.vec2f(stretchedUV.x / aspect, stretchedUV.y)
    })

// ─── Wave ───────────────────────────────────────────────────────────────────────────────

/**
 * Compute the wave phase for a screen UV: aspect-correct the centered UV, take the rotated-Y
 * projection by `angle`, scale into [0, 2π) cycles by `frequency`, and offset by the
 * accumulated animation time `t`.
 */
export const wavePhase = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32, d.f32], d.f32)(
    (uv, aspect, angle, frequency, t) => {
        'use gpu'
        const centeredUV = uv.sub(d.vec2f(0.5, 0.5))
        const aspectCorrectedUV = d.vec2f(centeredUV.x * aspect, centeredUV.y)
        const angleRad = angle * DEG_TO_RAD
        const cosA = std.cos(angleRad)
        const sinA = std.sin(angleRad)
        const rotatedY = aspectCorrectedUV.x * sinA + aspectCorrectedUV.y * cosA
        return (rotatedY + 0.5) * frequency * TAU + t
    })

/**
 * Displace the base UV along the rotated axis by the wave value (×strength×0.5, X
 * aspect-divided back to UV space).
 */
export const waveApply = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32, d.f32], d.vec2f)(
    (uv, aspect, angle, strength, wave) => {
        'use gpu'
        const angleRad = angle * DEG_TO_RAD
        const cosA = std.cos(angleRad)
        const sinA = std.sin(angleRad)
        const displacement = wave * strength * 0.5
        const displacementX = displacement * cosA / aspect
        const displacementY = displacement * sinA
        return d.vec2f(uv.x + displacementX, uv.y + displacementY)
    })

// One waveform shaping part per shape: phase → wave value in [−1, 1] (bounce in [0, 1]).
// Reusable anywhere a periodic profile is needed, not just the UV displacement below.
export const waveformSine = tgpu.fn([d.f32], d.f32)((phase) => {
    'use gpu'
    return std.sin(phase)
})

export const waveformTriangle = tgpu.fn([d.f32], d.f32)((phase) => {
    'use gpu'
    const normalizedPhase = std.fract(phase / TAU)
    return std.abs(normalizedPhase * 2.0 - 1.0) * 2.0 - 1.0
})

export const waveformSquare = tgpu.fn([d.f32], d.f32)((phase) => {
    'use gpu'
    const normalizedPhase = std.fract(phase / TAU)
    return std.step(0.5, normalizedPhase) * 2.0 - 1.0
})

export const waveformSawtooth = tgpu.fn([d.f32], d.f32)((phase) => {
    'use gpu'
    const normalizedPhase = std.fract(phase / TAU)
    return normalizedPhase * 2.0 - 1.0
})

export const waveformBounce = tgpu.fn([d.f32], d.f32)((phase) => {
    'use gpu'
    return std.abs(std.sin(phase))
})

// One full-distortion body per waveform — phase → waveform part → displacement. The
// waveform is a compile-time choice, so the producer JS-branches and only the active body
// is emitted — no runtime branch.
export const waveDistortSine = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32], d.vec2f)(
    (uv, aspect, angle, frequency, strength, t) => {
        'use gpu'
        const wave = waveformSine(wavePhase(uv, aspect, angle, frequency, t))
        return waveApply(uv, aspect, angle, strength, wave)
    })

export const waveDistortTriangle = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32], d.vec2f)(
    (uv, aspect, angle, frequency, strength, t) => {
        'use gpu'
        const wave = waveformTriangle(wavePhase(uv, aspect, angle, frequency, t))
        return waveApply(uv, aspect, angle, strength, wave)
    })

export const waveDistortSquare = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32], d.vec2f)(
    (uv, aspect, angle, frequency, strength, t) => {
        'use gpu'
        const wave = waveformSquare(wavePhase(uv, aspect, angle, frequency, t))
        return waveApply(uv, aspect, angle, strength, wave)
    })

export const waveDistortSawtooth = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32], d.vec2f)(
    (uv, aspect, angle, frequency, strength, t) => {
        'use gpu'
        const wave = waveformSawtooth(wavePhase(uv, aspect, angle, frequency, t))
        return waveApply(uv, aspect, angle, strength, wave)
    })

export const waveDistortBounce = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32], d.vec2f)(
    (uv, aspect, angle, frequency, strength, t) => {
        'use gpu'
        const wave = waveformBounce(wavePhase(uv, aspect, angle, frequency, t))
        return waveApply(uv, aspect, angle, strength, wave)
    })

// ─── Polar ⇄ rectangular ────────────────────────────────────────────────────────────────

/**
 * Rectangular → polar mapping (pre-blend). The angle (`atan2`, [-π, π]) is normalised to
 * [0, 1] and scaled by `wrap`; the radius is scaled by `radius`.
 */
export const polarCoordsUV = tgpu.fn([d.vec2f, d.f32, d.f32, d.vec2f, d.f32], d.vec2f)(
    (center, wrap, radius, uv, aspect) => {
        'use gpu'
        const aspectCorrectedUV = d.vec2f(uv.x * aspect, uv.y)
        const centerPos = d.vec2f(center.x * aspect, 1.0 - center.y)
        const delta = aspectCorrectedUV.sub(centerPos)

        const theta = std.atan2(delta.y, delta.x)
        const normalizedAngle = (theta + PI) / TAU
        const r = std.length(delta)

        const u = normalizedAngle * wrap
        const v = r * radius
        return d.vec2f(u, v)
    })

/**
 * Polar → rectangular mapping (pre-blend): treats the base UV as polar (`u`=angle,
 * `v`=radius) and converts to rectangular space. NOTE: unlike the other distortions,
 * `center.x` is NOT aspect-corrected here (the rectangular X is aspect-divided and added
 * to the raw center.x).
 */
export const rectCoordsUV = tgpu.fn([d.vec2f, d.f32, d.vec2f, d.f32], d.vec2f)(
    (center, scale, uv, aspect) => {
        'use gpu'
        const theta = uv.x * TAU - PI
        const r = uv.y * scale
        const rectX = r * std.cos(theta)
        const rectY = r * std.sin(theta)
        const centerPos = d.vec2f(center.x, 1.0 - center.y)
        return d.vec2f(rectX / aspect + centerPos.x, rectY + centerPos.y)
    })

// ─── Corner pin (homography) ────────────────────────────────────────────────────────────

// Guard epsilon for the projective divides; module const so the transpiler folds it to a literal.
const EPS = 1e-8

// n / d, guarding against a near-zero denominator.
export const cornerPinSafeDiv = tgpu.fn([d.f32, d.f32], d.f32)((n, dv) => {
    'use gpu'
    return n / std.select(dv, EPS, std.abs(dv) < EPS)
})

// Signed area term: which side of line A→B point P lies on — cross2(b-a, p-a).
export const cornerSideOf = tgpu.fn([d.vec2f, d.vec2f, d.vec2f], d.f32)((p, a, b) => {
    'use gpu'
    const bax = b.x - a.x
    const bay = b.y - a.y
    const pax = p.x - a.x
    const pay = p.y - a.y
    return bax * pay - bay * pax
})

// >0 when P lies inside triangle (A,B,C): all three edge cross-products share a sign.
export const cornerInsideTri = tgpu.fn([d.vec2f, d.vec2f, d.vec2f, d.vec2f], d.f32)((p, a, b, c) => {
    'use gpu'
    const d1 = cornerSideOf(p, a, b)
    const d2 = cornerSideOf(p, b, c)
    const d3 = cornerSideOf(p, c, a)
    const allPos = std.step(d.f32(0.0), d1) * std.step(d.f32(0.0), d2) * std.step(d.f32(0.0), d3)
    const allNeg = std.step(d1, d.f32(0.0)) * std.step(d2, d.f32(0.0)) * std.step(d3, d.f32(0.0))
    return allPos + allNeg
})

// Project P onto segment A–B, nudged a hair off `refSide` so the quad lands just-convex.
export const cornerProjectToDiagonal = tgpu.fn([d.vec2f, d.vec2f, d.vec2f, d.f32], d.vec2f)((p, a, b, refSide) => {
    'use gpu'
    const ab = b.sub(a)
    const t = std.clamp(std.dot(p.sub(a), ab) / std.max(std.dot(ab, ab), EPS), 0.0, 1.0)
    const foot = a.add(ab.mul(t))
    const perp = d.vec2f(ab.y * -1.0, ab.x).div(std.max(std.length(ab), EPS))
    const nudge = std.sign(refSide) * -1.0 * 0.004
    return foot.add(perp.mul(nudge))
})

// If corner P (neighbours A, B; opposite O) crossed inside to make the quad concave, clamp it onto
// the A–B diagonal — turning the quad into a clean triangle rather than a fold.
export const cornerConvexify = tgpu.fn([d.vec2f, d.vec2f, d.vec2f, d.vec2f], d.vec2f)((p, a, b, o) => {
    'use gpu'
    const inside = cornerInsideTri(p, a, b, o) > 0.5
    const proj = cornerProjectToDiagonal(p, a, b, cornerSideOf(o, a, b))
    return std.select(p, proj, inside)
})

/**
 * Square→quad homography (Heckbert), inverted analytically.
 *
 * Maps `coord` to the source coordinate to sample, treating the four pinned corners as a
 * projective quad (a true corner-pin homography). Returns vec3(su, sv, front) — front (0/1)
 * gates coverage on the visible side of the quad (den·det ≥ 0). `amount` blends each corner
 * toward its neutral rectangle position. Corners arrive as the transformed props
 * (transformPosition stores `(x, 1-y)`), so `1 - c.y` recovers the authored y. Corner order
 * = [topLeft, topRight, bottomRight, bottomLeft].
 */
export const cornerPinSample = tgpu.fn([d.vec2f, d.f32, d.vec2f, d.vec2f, d.vec2f, d.vec2f], d.vec3f)(
    (coord, amount, c0, c1, c2, c3) => {
        'use gpu'
        const amt = d.vec2f(amount, amount)
        const r0 = std.mix(d.vec2f(0.0, 0.0), d.vec2f(c0.x, 1.0 - c0.y), amt)
        const r1 = std.mix(d.vec2f(1.0, 0.0), d.vec2f(c1.x, 1.0 - c1.y), amt)
        const r2 = std.mix(d.vec2f(1.0, 1.0), d.vec2f(c2.x, 1.0 - c2.y), amt)
        const r3 = std.mix(d.vec2f(0.0, 1.0), d.vec2f(c3.x, 1.0 - c3.y), amt)

        // Keep the quad convex: any reflex corner clamps onto its neighbours' diagonal.
        const q0 = cornerConvexify(r0, r1, r3, r2)
        const q1 = cornerConvexify(r1, r0, r2, r3)
        const q2 = cornerConvexify(r2, r1, r3, r0)
        const q3 = cornerConvexify(r3, r0, r2, r1)

        const dx1 = q1.x - q2.x
        const dx2 = q3.x - q2.x
        const dx3 = q0.x - q1.x + q2.x - q3.x
        const dy1 = q1.y - q2.y
        const dy2 = q3.y - q2.y
        const dy3 = q0.y - q1.y + q2.y - q3.y

        const denA = dx1 * dy2 - dx2 * dy1
        const a13 = cornerPinSafeDiv(dx3 * dy2 - dx2 * dy3, denA)
        const a23 = cornerPinSafeDiv(dx1 * dy3 - dx3 * dy1, denA)

        // Forward homography H (square → quad).
        const a11 = q1.x - q0.x + a13 * q1.x
        const a21 = q3.x - q0.x + a23 * q3.x
        const a31 = q0.x
        const a12 = q1.y - q0.y + a13 * q1.y
        const a22 = q3.y - q0.y + a23 * q3.y
        const a32 = q0.y

        // Cofactors of H — the inverse maps screen → (u,v) (the det cancels in the divide).
        const c00 = a22 - a32 * a23
        const c10 = (a21 - a31 * a23) * -1.0
        const c20 = a21 * a32 - a31 * a22
        const c01 = (a12 - a32 * a13) * -1.0
        const c11 = a11 - a31 * a13
        const c21 = (a11 * a32 - a31 * a12) * -1.0
        const c02 = a12 * a23 - a22 * a13
        const c12 = (a11 * a23 - a21 * a13) * -1.0
        const c22 = a11 * a22 - a21 * a12

        const px = coord.x
        const py = coord.y
        const den = c02 * px + c12 * py + c22
        const su = cornerPinSafeDiv(c00 * px + c10 * py + c20, den)
        const sv = cornerPinSafeDiv(c01 * px + c11 * py + c21, den)

        // Testing den·det (= det²·w) tracks sign(w) and stays correct as det flips sign when the
        // quad goes concave — so the visible image is kept and only the folded-back region clips.
        const det = a11 * c00 + a21 * c01 + a31 * c02
        const front = std.step(d.f32(0.0), den * det)
        return d.vec3f(su, sv, front)
    })

// ─── Perspective ────────────────────────────────────────────────────────────────────────

/**
 * Inverse perspective projection (ray–plane intersection): rotate the plane in 3D
 * (pan/tilt), with `fov` controlling perspective intensity and `zoom` scaling the sampled
 * area. No aspect correction (samples in raw UV space). `max(divisor, 0.001)` guards the
 * projective divides.
 */
export const perspectiveUV = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32, d.f32, d.vec2f, d.vec2f], d.vec2f)(
    (center, pan, tilt, fov, zoom, offset, uv) => {
        'use gpu'
        const centerPos = d.vec2f(center.x, 1.0 - center.y)
        const x = (uv.x - centerPos.x) / zoom
        const y = (uv.y - centerPos.y) / zoom

        const panRad = pan * DEG_TO_RAD
        const tiltRad = tilt * DEG_TO_RAD
        const fovRad = fov * DEG_TO_RAD
        const cosPan = std.cos(panRad)
        const sinPan = std.sin(panRad)
        const cosTilt = std.cos(tiltRad)
        const sinTilt = std.sin(tiltRad)

        // perspectiveFactor = 2·tan(fov/2) — FOV=53°≈1.0 (baseline), 90°=2.0, 30°≈0.54.
        const perspectiveFactor = std.tan(fovRad * 0.5) * 2.0

        const panDivisor = cosPan + sinPan * x * perspectiveFactor
        const safePanDivisor = std.max(panDivisor, 0.001)
        const afterPanX = x / safePanDivisor
        const afterPanY = y * cosPan / safePanDivisor

        const tiltDivisor = cosTilt + sinTilt * afterPanY * perspectiveFactor
        const safeTiltDivisor = std.max(tiltDivisor, 0.001)
        const finalX = afterPanX * cosTilt / safeTiltDivisor
        const finalY = afterPanY / safeTiltDivisor

        const offsetPos = d.vec2f(offset.x, 1.0 - offset.y)
        // Subtract offset from baseline so moving offset right shifts the image right.
        return d.vec2f(finalX, finalY).add(centerPos).sub(offsetPos).add(d.vec2f(0.5, 0.5))
    })

// ─── Concentric spin ────────────────────────────────────────────────────────────────────

/** Rotate a UV around the (transformed) center by `angle`, aspect-corrected. */
export const csRotateUV = tgpu.fn([d.vec2f, d.f32, d.vec2f, d.f32], d.vec2f)(
    (uv, aspect, center, angle) => {
        'use gpu'
        const centerPos = d.vec2f(center.x, 1.0 - center.y)
        const dx = (uv.x - centerPos.x) * aspect
        const dy = uv.y - centerPos.y
        const cosA = std.cos(angle)
        const sinA = std.sin(angle)
        const rotX = dx * cosA - dy * sinA
        const rotY = dx * sinA + dy * cosA
        return d.vec2f(rotX / aspect + centerPos.x, rotY + centerPos.y)
    })

/**
 * Per-ring blended rotation: hash each ring's static + animated rotation (`legacySinHash11`,
 * the shared sin-fract hash), blend adjacent rings along the SHORTEST angular path (wrap the
 * difference to [-π, π] with a FLOORED mod so the blend never spirals through extra
 * rotations), smoothstep across the ring boundary, then apply {@link csRotateUV}.
 */
export const concentricSpinUV = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.vec2f, d.f32], d.vec2f)(
    (center, intensity, rings, smoothness, seed, speedRandomness, animTime, uv, aspect) => {
        'use gpu'
        const centerPos = d.vec2f(center.x, 1.0 - center.y)
        const dx = (uv.x - centerPos.x) * aspect
        const dy = uv.y - centerPos.y
        const dist = std.length(d.vec2f(dx, dy))

        // Ring this pixel falls in, and its fractional position within the ring.
        const ringCoord = dist * rings
        const ringIndex = std.floor(ringCoord)
        const ringFrac = std.fract(ringCoord)

        const maxAngle = intensity * DEG_TO_RAD
        const seedOffset = seed * 0.137

        // Static (from intensity) + animated (per-ring speed variation) rotation for this ring & next.
        const staticA = legacySinHash11(ringIndex + seedOffset) * maxAngle
        const staticB = legacySinHash11(ringIndex + 1.0 + seedOffset) * maxAngle
        const ringSpeedA = std.mix(1.0, legacySinHash11(ringIndex + 42.7), speedRandomness)
        const ringSpeedB = std.mix(1.0, legacySinHash11(ringIndex + 1.0 + 42.7), speedRandomness)
        const animA = animTime * 0.25 * ringSpeedA
        const animB = animTime * 0.25 * ringSpeedB
        const totalA = staticA + animA
        const totalB = staticB + animB

        // Shortest angular path: wrap the difference to [-π, π] so the blend never spirals through
        // extra rotations. FLOORED mod — the wrapped value can be negative.
        const wrapArg = totalB - totalA + PI
        const diff = (wrapArg - TAU * std.floor(wrapArg / TAU)) - PI
        const halfEdge = smoothness * 0.5 + 0.001
        const blend = std.smoothstep(0.5 - halfEdge, 0.5 + halfEdge, ringFrac)
        const angle = totalA + diff * blend

        return csRotateUV(uv, aspect, center, angle)
    })

// ─── Flow field ─────────────────────────────────────────────────────────────────────────

/**
 * Constant-speed flow through drifting 3D noise: three noise layers each drift through a 3D
 * `mxNoiseFloat3` field at different rates; the noise value is used as a flow ANGLE (not a
 * magnitude), so the combined + normalised flow has constant speed and displaces the base
 * UV by `strength` (X aspect-divided back to UV space). `time` (flow drift) and
 * `evolutionTime` (z-axis pattern reshape) are two independent animated clocks.
 */
export const flowFieldUV = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32], d.vec2f)(
    (uv, aspect, scale, strength, time, evolutionTime) => {
        'use gpu'
        const aspectCorrectedUV = d.vec2f(uv.x * aspect, uv.y)

        // Layer 1: primary large-scale flow.
        const drift1 = time * 0.7
        const evolve1 = evolutionTime * 0.2
        const angle1 = mxNoiseFloat3(d.vec3f(
            aspectCorrectedUV.x * scale + drift1 * 0.3,
            aspectCorrectedUV.y * scale + drift1 * 0.5,
            evolve1,
        )) * TWO_PI
        const flow1 = d.vec2f(std.cos(angle1), std.sin(angle1))

        // Layer 2: medium detail, different drift direction.
        const drift2 = time * 0.5
        const evolve2 = evolutionTime * 0.15
        const angle2 = mxNoiseFloat3(d.vec3f(
            aspectCorrectedUV.x * (scale * 2.3) + drift2 * -0.4 + 173.5,
            aspectCorrectedUV.y * (scale * 2.3) + drift2 * 0.3 + 291.7,
            evolve2 + 50.0,
        )) * TWO_PI
        const flow2 = d.vec2f(std.cos(angle2), std.sin(angle2))

        // Layer 3: fine detail, another drift direction.
        const drift3 = time * 0.3
        const evolve3 = evolutionTime * 0.1
        const angle3 = mxNoiseFloat3(d.vec3f(
            aspectCorrectedUV.x * (scale * 4.7) + drift3 * 0.2 + 527.3,
            aspectCorrectedUV.y * (scale * 4.7) + drift3 * -0.6 + 839.1,
            evolve3 + 100.0,
        )) * TWO_PI
        const flow3 = d.vec2f(std.cos(angle3), std.sin(angle3))

        // Combine with decreasing influence, then normalise for a constant flow speed.
        const combinedFlow = flow1.add(flow2.mul(0.5)).add(flow3.mul(0.25))
        const flowLength = std.max(std.length(combinedFlow), 0.001)
        const normalizedFlow = combinedFlow.div(flowLength)

        // strength is the only magnitude control; X divided by aspect back to UV space.
        const finalFlow = d.vec2f(normalizedFlow.x * strength / aspect, normalizedFlow.y * strength)
        return d.vec2f(uv.x + finalFlow.x, uv.y + finalFlow.y)
    })

// ─── Slice wipe ─────────────────────────────────────────────────────────────────────────

/**
 * Slide alternating strips out of the frame — the "shredder" transition. A directional
 * coordinate dices the frame into `sliceCount` strips; each strip's lookup slides ALONG
 * the strip (perpendicular to the dicing direction), alternating ±, by up to just over the
 * frame's full extent — at progress 1 every lookup is out of bounds, and transparent edge
 * handling clips the vacated space.
 */
export const sliceWipeUV = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32, d.f32], d.vec2f)(
    (uv, aspect, angleDeg, sliceCount, progress) => {
        'use gpu'
        const a = angleDeg * DEG_TO_RAD
        const dir = d.vec2f(std.cos(a), std.sin(a))
        const p = d.vec2f((uv.x - 0.5) * aspect, uv.y - 0.5)
        const grad = std.dot(p, dir)
        // Half-extent of `grad` over the aspect-corrected unit square → normalize into [0,1].
        const ext = 0.5 * (aspect * std.abs(dir.x) + std.abs(dir.y))
        const t = grad / (2.0 * ext) + 0.5
        const idx = std.floor(t * std.max(sliceCount, 1.0))
        // Alternating slide sign per strip: even index → −1, odd → +1.
        const sign = std.fract(idx * 0.5) * 4.0 - 1.0
        // Slide along the strip; extPerp bounds dot(·, perp) over the frame, so sliding a hair
        // past 2·extPerp guarantees every lookup exits the frame at progress 1.
        const perp = d.vec2f(-dir.y, dir.x)
        const extPerp = 0.5 * (aspect * std.abs(dir.y) + std.abs(dir.x))
        const slide = progress * (2.02 * extPerp) * sign
        const q = p.add(perp.mul(slide))
        return d.vec2f((q.x / aspect) + 0.5, q.y + 0.5)
    })

// ─── Bar shift ──────────────────────────────────────────────────────────────────────────

/**
 * Deterministic bar geometry: rotate the UV into bar-space, shift the perpendicular axis by
 * `offset`, un-rotate, un-center back to UV space.
 */
export const barSampleUV = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32], d.vec2f)(
    (uv, aspect, angle, offset) => {
        'use gpu'
        const angleRad = angle * DEG_TO_RAD
        const cosA = std.cos(angleRad)
        const sinA = std.sin(angleRad)
        const au = uv.x * aspect
        const av = uv.y
        // Center around the viewport midpoint so rotation pivots at the center.
        const cu = au - aspect * 0.5
        const cv = av - 0.5
        const projectedU = cu * cosA + cv * sinA
        const projectedV = cu * sinA * -1.0 + cv * cosA
        // Offset along the bar's perpendicular axis, then unrotate + un-center.
        const distPV = projectedV + offset
        const dcu = projectedU * cosA - distPV * sinA
        const dcv = projectedU * sinA + distPV * cosA
        return d.vec2f(dcu / aspect + 0.5, dcv + 0.5)
    })

/**
 * Full per-bar displacement: which bar this pixel belongs to (hard-edged), its static +
 * animated hash offset (`legacySinHash11`, the shared sin-fract hash), then the
 * deterministic {@link barSampleUV}.
 */
export const barShiftUV = tgpu.fn([d.f32, d.f32, d.f32, d.f32, d.f32, d.vec2f, d.f32], d.vec2f)(
    (count, angle, intensity, seed, animTime, uv, aspect) => {
        'use gpu'
        const angleRad = angle * DEG_TO_RAD
        const cosA = std.cos(angleRad)
        const sinA = std.sin(angleRad)
        // Longest aspect-corrected axis → count refers to bars across the longest viewport dimension.
        const longestAxis = std.max(aspect, 1.0)
        const au = uv.x * aspect
        const av = uv.y
        const cu = au - aspect * 0.5
        const cv = av - 0.5
        const projectedU = cu * cosA + cv * sinA
        const barCoord = projectedU * count / longestAxis
        const barIndex = std.floor(barCoord)

        const seedOffset = seed * 0.137
        const staticOffset = legacySinHash11(barIndex + seedOffset)
        const barSpeed = legacySinHash11(barIndex + seedOffset + 42.7)
        const animOffset = animTime * barSpeed * 0.2
        const offset = (staticOffset + animOffset) * intensity
        return barSampleUV(uv, aspect, angle, offset)
    })

// ─── Compute-driven displacement lookups ────────────────────────────────────────────────

/** Snap a UV to the centre of its distortion-grid cell (aspect-corrected cell counts). */
export const gridCellSnap = tgpu.fn([d.vec2f, d.f32, d.f32], d.vec2f)((uv, gridSize, aspect) => {
    'use gpu'
    const isWide = aspect > 1.0
    const cellsX = std.max(std.select(gridSize * aspect, gridSize, isWide), 1.0)
    const cellsY = std.max(std.select(gridSize, gridSize / aspect, isWide), 1.0)
    const cellIndexX = std.floor(uv.x * cellsX)
    const cellIndexY = std.floor(uv.y * cellsY)
    return d.vec2f((cellIndexX + 0.5) / cellsX, (cellIndexY + 0.5) / cellsY)
})

/** Offset a UV by the clamped displacement (±0.1 clamp). */
export const gridDistortOffsetUV = tgpu.fn([d.vec2f, d.vec2f], d.vec2f)((uv, disp) => {
    'use gpu'
    const maxDisp = 0.1
    const clamped = std.clamp(disp, d.vec2f(-maxDisp, -maxDisp), d.vec2f(maxDisp, maxDisp))
    return uv.sub(clamped)
})

/** The intensity-scaled, clamped displaced UV (±0.15 clamp) for a liquid displacement field. */
export const liquifyOffsetUV = tgpu.fn([d.vec2f, d.vec2f, d.f32], d.vec2f)((uv, disp, intensity) => {
    'use gpu'
    const scaled = disp.mul(intensity * 0.1)
    const maxDisp = 0.15
    const clamped = std.clamp(scaled, d.vec2f(-maxDisp, -maxDisp), d.vec2f(maxDisp, maxDisp))
    return uv.sub(clamped)
})

// ─── Displacement map (layer-driven) ────────────────────────────────────────────────────

// The displacement is driven by ANOTHER LAYER's pixels — the classic Photoshop/AE
// displacement map, not a built-in procedural field. Both appliers treat channel value 0.5
// as neutral (no push) and weight by the source's alpha so transparent source areas
// displace nothing. The source RTT is premultiplied, so channels are unpremultiplied before
// centering. X displacement is aspect-divided back into UV space so the warp is isotropic
// on screen.

/** twoAxis — source RED drives horizontal, GREEN drives vertical (0.5 = neutral). */
export const dmDisplaceRG = tgpu.fn([d.vec2f, d.vec4f, d.f32, d.f32], d.vec2f)((uv, src, aspect, amount) => {
    'use gpu'
    const a = std.max(src.w, 0.0001)
    const dx = (src.x / a - 0.5) * 2.0 * src.w * amount / aspect
    const dy = (src.y / a - 0.5) * 2.0 * src.w * amount
    return d.vec2f(uv.x + dx, uv.y + dy)
})

/** directional — source LUMINANCE pushes along a fixed angle (0.5 = neutral). */
export const dmDisplaceLuminance = tgpu.fn([d.vec2f, d.vec4f, d.f32, d.f32, d.f32], d.vec2f)((uv, src, aspect, amount, angleDeg) => {
    'use gpu'
    const a = std.max(src.w, 0.0001)
    const lum = std.dot(d.vec3f(src.x / a, src.y / a, src.z / a), d.vec3f(0.2126, 0.7152, 0.0722))
    const scalar = (lum - 0.5) * 2.0 * src.w * amount
    const angleRad = angleDeg * DEG_TO_RAD
    const dx = scalar * std.cos(angleRad) / aspect
    const dy = scalar * std.sin(angleRad)
    return d.vec2f(uv.x + dx, uv.y + dy)
})

// ─── Fluted glass ───────────────────────────────────────────────────────────────────────

// Refraction geometry for one flute cell, returned as a struct. `expHi`/`expLo`/`wavesFlag`
// are baked per shape at composition (compile-time `shape`), so no runtime shape branch.
// `slope` is the flute cross-section slope at this pixel — the surface input the specular
// part ({@link blinnHighlight}) shades from.
export const FlutedGeom = d.struct({
    refractedUV: d.vec2f,
    chrOff: d.vec2f,
    slope: d.f32,
})

// shapeParams packs (expHi, expLo, wavesFlag) — baked per shape — to stay within tgpu.fn's
// 15-argument cap.
export const flutedGlassGeom = tgpu.fn(
    [d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.vec3f],
    FlutedGeom,
)((uv, aspect, t, angleDeg, frequency, softness, waveAmp, waveFreq, refraction, aberration, shapeParams) => {
    'use gpu'
    const expHi = shapeParams.x
    const expLo = shapeParams.y
    const wavesFlag = shapeParams.z
    const r = angleDeg * PI / 180.0
    const cosA = std.cos(r)
    const sinA = std.sin(r)
    // Aspect-correct, centered, square frame; rotate into flute frame (u ⊥ flutes, v ∥ flutes).
    const aspCorr = d.vec2f((uv.x - 0.5) * aspect, uv.y - 0.5)
    const u = aspCorr.x * cosA + aspCorr.y * sinA
    const v = -aspCorr.x * sinA + aspCorr.y * cosA
    // Waves shape sways the flute axis (wavesFlag = 1 only for shape 'waves', baked 0/1).
    const waveTerm = std.sin(v * waveFreq * (PI * 2.0) + t * 2.0) * waveAmp
    const fluteU = u + wavesFlag * waveTerm
    const flutePos = fluteU * frequency + t
    const cellPos = (std.fract(flutePos) - 0.5) * 2.0
    const absCell = std.max(std.abs(cellPos), 0.0001)
    const exponent = std.mix(expHi, expLo, softness)
    const slope = std.sign(cellPos) * std.pow(absCell, exponent)
    // Refraction offset: sample shift = -slope · refraction · halfCell.
    const halfCell = 0.5 / std.max(frequency, 0.001)
    const refrU = -(slope * refraction * halfCell)
    const refractedUV = d.vec2f(uv.x + refrU * cosA / aspect, uv.y + refrU * sinA)
    const chrU = refrU * aberration * 0.5
    const chrOff = d.vec2f(chrU * cosA / aspect, chrU * sinA)
    return FlutedGeom({refractedUV, chrOff, slope})
})

/**
 * Blinn-Phong specular with Schlick-Fresnel weighting over a 1D surface slope —
 * N = (slope, sqrt(1-slope²)), light half-vector from `lightAngleDeg` (0 = head-on,
 * 90 = grazing). `softness` spreads the peak (shininess = exp2(8 − softness·7)).
 */
export const blinnHighlight = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)(
    (slope, lightAngleDeg, intensity, softness) => {
        'use gpu'
        const slopeSq = std.min(slope * slope, 1.0)
        const nz = std.sqrt(1.0 - slopeSq)
        const half = lightAngleDeg * PI / 360.0
        const hx = std.sin(half)
        const hy = std.cos(half)
        const nDotH = std.max(slope * hx + nz * hy, 0.0)
        const shininess = std.exp2(8.0 - softness * 7.0)
        const fresnel = std.pow(1.0 - nz, 5.0)
        const fresnelMix = 0.04 + 0.96 * fresnel
        return std.pow(nDotH, shininess) * fresnelMix * intensity
    })

// ─── Page peel ──────────────────────────────────────────────────────────────────────────

// The GEOMETRY of the peel, before any shading: the curl sample UV, the fold angle, the
// signed distances either side of the crease, the two shadow reach extents (from the lip
// height), the fold blend, and the curl coverage mask. The shading (crook shade, sheen,
// contact shadows) is built from these by the parts below. The corner/opposite coords
// arrive as compile-time literal args; aspect is the runtime uniform.
export const PagePeelGeom = d.struct({
    curlUV: d.vec2f,
    theta: d.f32,
    distPastCrease: d.f32,
    distIntoPeel: d.f32,
    flatReach: d.f32,
    peelReach: d.f32,
    foldBlend: d.f32,
    showCurl: d.f32,
})

export const pagePeelGeom = tgpu.fn(
    [d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32], PagePeelGeom)(
    (uv, aspect, cornerX, cornerY, oppX, oppY, amount, radius) => {
        'use gpu'
        // Aspect-corrected space so the diagonal is a true 45° fold on any canvas.
        const pA = d.vec2f(uv.x * aspect, uv.y)
        const cornerA = d.vec2f(cornerX * aspect, cornerY)
        const oppA = d.vec2f(oppX * aspect, oppY)
        const axisVec = oppA.sub(cornerA)
        const L = std.length(axisVec)
        const axis = axisVec.mul(1.0 / L)
        const t = std.dot(pA.sub(cornerA), axis)

        const peel = amount * L
        const cFold = peel
        const R = std.max(radius * L, 1e-4)
        const thetaMax = peel / R

        // Front-face curl wrap. X = distance past the fold in radii; sin θ = X, θ ∈ [0, π/2].
        const X = (t - cFold) / R
        const Xc = std.clamp(X, 0.0, 1.0)
        const theta = std.asin(Xc)
        const inBand = std.step(0.0, X) * std.step(X, 1.0)
        const paper = std.step(theta, thetaMax)

        // Content coordinate the curl pixel pulls from (arc length unrolled from the fold).
        const cCurl = peel - R * theta
        const sourceA = pA.add(axis.mul(cCurl - t))
        const curlUV = d.vec2f(sourceA.x / aspect, sourceA.y)
        const curlInBounds = std.step(0.0, curlUV.x) * std.step(curlUV.x, 1.0) * std.step(0.0, curlUV.y) * std.step(curlUV.y, 1.0)

        // Lip lift height → how far each contact shadow reaches on either side of the crease.
        const liftFrac = 1.0 - std.cos(std.clamp(thetaMax, 0.0, HALF_PI))
        const lipHeight = R * liftFrac
        const flatReach = std.max(R + lipHeight * 0.5, 1e-4)
        const distPastCrease = t - cFold
        const peelReach = std.max(lipHeight * 2.5, 1e-4)
        const distIntoPeel = cFold - t

        const foldBlend = std.smoothstep(cFold - 0.0015, cFold + 0.0015, t)
        const showCurl = inBand * paper * curlInBounds

        return PagePeelGeom({curlUV, theta, distPastCrease, distIntoPeel, flatReach, peelReach, foldBlend, showCurl})
    })

/** Shade the crook of a curl near its crease, easing to full brightness at the lip. */
export const curlShade = tgpu.fn([d.f32, d.f32], d.f32)((theta, shading) => {
    'use gpu'
    const facing = std.cos(theta)
    return 1.0 - shading * facing
})

/**
 * Soft specular sheen band up the curl: a Gaussian in normalized fold angle, centred toward
 * the lip (0.65 of the quarter turn), with `softness` widening the band.
 */
export const curlSheen = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((theta, intensity, softness) => {
    'use gpu'
    const thetaN = theta / HALF_PI
    const specSigma = std.mix(0.05, 0.4, softness)
    const specDelta = (thetaN - 0.65) / specSigma
    return std.exp(specDelta * specDelta * -0.5) * intensity
})

/**
 * Contact-shadow strength over a lift `amount`: sharp+dark when the lip first lifts
 * (smoothstep in over the first 4%), softening + fading to 0 by amount 1.
 */
export const liftShadowStrength = tgpu.fn([d.f32], d.f32)((amount) => {
    'use gpu'
    return std.smoothstep(0.0, 0.04, amount) * std.pow(1.0 - amount, 0.7)
})

/**
 * One-sided contact-shadow falloff: full at `dist` 0, easing to nothing by `reach`
 * (`exponent` shapes the ease), zero on the negative side.
 */
export const shadowFalloff = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((dist, reach, exponent) => {
    'use gpu'
    return std.pow(1.0 - std.smoothstep(0.0, reach, dist), exponent) * std.step(0.0, dist)
})

/** Shade multiplier on the flat page a lifted lip overhangs (1 = unshadowed). */
export const overhangShade = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)((dist, reach, amount, shadow) => {
    'use gpu'
    const fall = shadowFalloff(dist, reach, 2.0) * liftShadowStrength(amount)
    return 1.0 - shadow * fall * 0.5
})

/** Shadow alpha cast onto the surface a peel reveals. */
export const revealShadow = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)((dist, reach, amount, shadow) => {
    'use gpu'
    const fall = shadowFalloff(dist, reach, 1.5) * liftShadowStrength(amount) * shadow
    return fall * 0.6
})

/**
 * Composite (back to front): revealed-surface cast shadow, flat page (shaded under the
 * overhang), then the peeling lip (crook-shaded + sheened) on top. Result is premultiplied
 * — the caller unpremultiplies.
 */
export const pagePeelCompose = tgpu.fn(
    [d.vec4f, d.vec4f, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32], d.vec4f)(
    (curlSample, flatSample, curlBright, spec, flatShade, peelAlpha, foldBlend, showCurl) => {
        'use gpu'
        const litRgb = curlSample.xyz.mul(curlBright).add(spec * curlSample.w)
        const curlColor = d.vec4f(litRgb, curlSample.w)
        const flatColor = d.vec4f(flatSample.xyz.mul(flatShade), flatSample.w)
        const peeledColor = d.vec4f(0.0, 0.0, 0.0, peelAlpha)
        const base = std.mix(peeledColor, flatColor, d.vec4f(foldBlend))
        return std.select(base, curlColor, showCurl > 0.5)
    })

// ─── Sphere bulge + rim light ───────────────────────────────────────────────────────────

/**
 * Sphere-surface geometry: the bulged sample UV, the sphere boundary coverage, and the
 * surface normal — the inputs the shading parts work from. The center double-flip recovers
 * the authored y; z = sqrt(1 − r²) sphere surface; `depth` scales the bulge. Pure — no
 * texture. `center` is the transformed (x, 1−y) prop value.
 */
export const SphereBulge = d.struct({
    uv: d.vec2f,
    coverage: d.f32,
    normal: d.vec3f,
})

export const sphereBulge = tgpu.fn(
    [d.vec2f, d.vec2f, d.vec2f, d.f32, d.f32], SphereBulge)(
    (uv, viewport, center, radius, depth) => {
        'use gpu'
        const aspect = viewport.x / viewport.y
        const centerX = center.x
        const centerY = 1.0 - center.y
        const cuX = (uv.x - centerX) * aspect
        const cuY = uv.y - centerY
        const sphereX = cuX * 2.0 / radius
        const sphereY = cuY * 2.0 / radius
        const radiusSq = sphereX * sphereX + sphereY * sphereY
        const sphereAlpha = 1.0 - std.smoothstep(0.98, 1.0, radiusSq)
        const z = std.sqrt(std.max(d.f32(0), 1.0 - radiusSq))

        const depthFactor = 1.0 + z * depth
        const finalX = sphereX / depthFactor * radius / 2.0
        const finalY = sphereY / depthFactor * radius / 2.0
        const transformedX = finalX / aspect + centerX
        const transformedY = finalY + centerY

        const normal = std.normalize(d.vec3f(sphereX, sphereY, z))
        return SphereBulge({uv: d.vec2f(transformedX, transformedY), coverage: sphereAlpha, normal})
    })

/**
 * Directional fresnel rim light over a surface normal: strongest at grazing edges
 * (fresnel power hardening as `softness` drops), biased toward the light direction.
 * `lightPos` is the transformed (x, 1−y) position prop.
 */
export const rimLight = tgpu.fn([d.vec3f, d.vec2f, d.f32, d.f32], d.f32)(
    (normal, lightPos, intensity, softness) => {
        'use gpu'
        const viewDir = d.vec3f(0.0, 0.0, 1.0)
        const fresnelPower = 1.0 + 4.0 * (1.0 - softness)
        const fresnel = std.pow(1.0 - std.max(std.dot(normal, viewDir), d.f32(0)), fresnelPower)
        const lightDir2Dx = (lightPos.x - 0.5) * 2.0
        const lightDir2Dy = (1.0 - lightPos.y - 0.5) * 2.0
        const normalDir = std.normalize(d.vec2f(normal.x + 0.0001, normal.y + 0.0001))
        const lightDirNorm = std.normalize(d.vec2f(lightDir2Dx + 0.0001, lightDir2Dy + 0.0001))
        const directionality = std.max(d.f32(0), std.dot(normalDir, lightDirNorm))
        const directionalBias = std.pow(directionality, d.f32(2))
        return fresnel * directionalBias * intensity * 2.0
    })

/** Add a tinted rim to a straight-alpha sample and gate its alpha by a coverage mask. Pure. */
export const rimComposite = tgpu.fn([d.vec4f, d.vec3f, d.f32, d.f32], d.vec4f)(
    (straight, lightColor, rim, coverage) => {
        'use gpu'
        const r = straight.x + lightColor.x * rim
        const g = straight.y + lightColor.y * rim
        const b = straight.z + lightColor.z * rim
        const a = straight.w * coverage
        return d.vec4f(r, g, b, a)
    })

// ─── Expr-level composition parts ───────────────────────────────────────────────────────

/**
 * Chromatic three-tap split: sample at `uv ± offset` for red/blue and at `uv` for green,
 * recombining per channel (alpha from the centre tap).
 */
export function rgbSplitTaps(sample: (uv: Expr) => Expr, uv: Expr, offset: Expr): Expr {
    const rS = sample(uv.add(offset))
    const gS = sample(uv)
    const bS = sample(uv.add(offset.mul(-1)))
    return vec4(rS.member('r'), gS.member('g'), bS.member('b'), gS.member('a'))
}

/**
 * Compile-time edge-mode sampler that CLIPS on the transparent mode: out-of-bounds zeroes
 * the WHOLE premultiplied vec4 (coverage), so edge-clamped RGB can't leak through a
 * multi-tap recombination. The other modes enforce the UV contract (stretch = clamp).
 */
export function edgeClipSample(sample: (uv: Expr) => Expr, uv: Expr, edgeMode: number): Expr {
    if (edgeMode === 1) return sample(uv).mul(call(edgeTransparentMask, 'edgeTransparentMask', [uv]))
    if (edgeMode === 2) return sample(call(edgeMirrorUV, 'edgeMirrorUV', [uv]))
    if (edgeMode === 3) return sample(call(edgeWrapUV, 'edgeWrapUV', [uv]))
    return sample(call(edgeClampUV, 'edgeClampUV', [uv]))
}

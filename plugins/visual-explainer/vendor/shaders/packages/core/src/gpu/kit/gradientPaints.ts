/**
 * Gradient and light paint bodies behind std/paint/gradients — the pure GPU math for the
 * gradient generators (linear/radial/conic/diamond parameter `t`, scalar edge modes, the
 * color-wheel cycle, sunburst rays, spiral stripes, the multi-point weighted mean, beam,
 * plasma, swirl, godrays) and the light-leak filter composite. color lookup (two-color
 * vs multi-stop dispatch) stays in `noiseColor` / `colorStops`; these bodies produce the
 * coordinates and coverage scalars the paints feed into it.
 */
import {tgpu, d, std} from './index'
import {DEG_TO_RAD, TAU, TWO_PI} from './constants'
// Shared helpers referenced NAMESPACE-STYLE below (geom.aspectOf, lightfields.*, noise.*,
// tone.luma601Dot) keep their module-prefixed WGSL names — this module is loaded everywhere
// via the kit facade, and a direct identifier reference would rename those fns in EVERY
// composition (other shaders' snapshots included). Helpers imported by name here are the
// ones whose emitted name has always been the bare identifier.
import * as geom from './geom'
import * as lightfields from './lightfields'
import * as noise from './noise'
import {
    aspectCenteredDelta,
    aspectCentrePosition,
    canvasCentredDelta,
    directionalProjection,
    unflipPosition,
} from './geom'
import {toneRemap} from './tone'
import {footprint1} from './aa'

const INV_360 = 1.0 / 360.0

// ── Linear gradient ─────────────────────────────────────────────────────────────────────
//
// The raw projection of `uv` onto the start→end axis, normalised to [0,1] between the
// endpoints (BEFORE edge handling). `start`/`end` are the ALREADY-transformed prop values
// (transformPosition stores `(x, 1 - y)`), so `unflipPosition` recovers the authored y —
// the gradient wants intuitive top=0/bottom=1. `uv` is the composer's UV
// (uvContext ?? ctx.uv). Aspect is derived from the effective viewport (box resize-fit) or
// the canvas — NOT `_sys.aspect`, which can differ under a resize-fit box.
// Vector ops fluent; scalar ops infix.
export const gradientRawT = tgpu.fn([d.vec2f, d.vec2f, d.f32, d.vec2f, d.vec2f], d.f32)(
    (start, end, angle, uv, viewport) => {
        'use gpu'
        const startPos = unflipPosition(start)
        const endPos = unflipPosition(end)

        const gradientVector = endPos.sub(startPos)
        const gradientLength = std.length(gradientVector)
        const gradientDir = std.normalize(gradientVector)

        // Aspect correction for proper rotation (guard against zero-height viewport at init/resize).
        const safeViewportY = std.max(viewport.y, 1e-6)
        const aspect = viewport.x / safeViewportY

        // Rotate the UV by -angle so the gradient appears rotated by +angle.
        const angleRad = (angle * DEG_TO_RAD) * -1.0
        const cosAngle = std.cos(angleRad)
        const sinAngle = std.sin(angleRad)

        const midpoint = startPos.add(endPos).mul(0.5)
        const centeredUV = uv.sub(midpoint)

        // Aspect-correct X before rotating (rotate in visual space), then undo it: X is divided
        // BACK by aspect afterwards, because the gradient's endpoints are authored in raw [0,1]
        // UV space and the projection below has to happen there.
        const rotated = geom.rotate2(d.vec2f(centeredUV.x * aspect, centeredUV.y), cosAngle, sinAngle)
        const rotatedUV = d.vec2f(rotated.x / aspect, rotated.y).add(midpoint)

        const relativePos = rotatedUV.sub(startPos)
        const projection = std.dot(relativePos, gradientDir)
        return projection / std.max(gradientLength, 1e-6)
    })

// ── Edge handling for the scalar gradient parameter (compile-time branch selects one) ────
/** Mirror: reflect at boundaries — `m = mod(abs(t), 2); m > 1 ? 2 - m : m`. */
export const gradientEdgeMirror = tgpu.fn([d.f32], d.f32)((t) => {
    'use gpu'
    const m = std.mod(std.abs(t), 2.0)
    return std.select(m, 2.0 - m, m > 1.0)
})
/** Wrap: tile via fract. */
export const gradientEdgeWrap = tgpu.fn([d.f32], d.f32)((t) => {
    'use gpu'
    return std.fract(t)
})
/** Clamp `t` to [0,1] — the color-lookup parameter (and the stretch edge mode). */
export const gradientClamp01 = tgpu.fn([d.f32], d.f32)((t) => {
    'use gpu'
    return std.clamp(t, 0.0, 1.0)
})
/** Transparent-edge coverage: 1 when the raw `t` is inside [0,1], else 0. */
export const gradientTransparentAlpha = tgpu.fn([d.f32], d.f32)((t) => {
    'use gpu'
    // d.f32-wrapped literals: bare integer-valued float literals feeding std.select transpile to
    // i32, which would type the product i32.
    const inLow = std.select(d.f32(0), d.f32(1), t >= 0.0)
    const inHigh = std.select(d.f32(0), d.f32(1), t <= 1.0)
    return inLow * inHigh
})

// ── Metric-distance fields ──────────────────────────────────────────────────────────────
//
// Each returns the RAW gradient parameter (unbounded) for a screen UV; the repeat parts
// below turn it into rings/segments. `center` is the ALREADY-transformed prop value
// (transformPosition stores `(x, 1 - y)`). `uv` is the composer's UV (uvContext ?? ctx.uv).
// Aspect uses the effective viewport (resize-fit box) or the canvas — the guarded
// `max(viewport.y, 1e-6)` divide (identical at any valid viewport; only avoids a
// divide-by-zero NaN at a degenerate zero-height init/resize).

// Elliptical radial distance: centred delta → inverse skew rotation (transpose of rotate2,
// hence the negated sine) → aspect stretch on one axis → length, normalized by `radius`.
export const radialDist = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32, d.vec2f, d.vec2f], d.f32)(
    (center, skewAngle, ellipseAspect, radius, uv, viewport) => {
        'use gpu'
        // Centred delta: the CENTRE is aspect-scaled, and the divide is guarded.
        const delta = aspectCenteredDelta(uv, center, viewport)

        const skewRad = skewAngle * DEG_TO_RAD
        const cosS = std.cos(skewRad)
        const sinS = std.sin(skewRad)
        const rotated = geom.rotate2(delta, cosS, -sinS)

        const stretched = d.vec2f(rotated.x * ellipseAspect, rotated.y)
        const dist = std.length(stretched)

        const safeRadius = std.max(radius, 1e-6)
        return dist / safeRadius
    })

// Angular sweep around `center`: `atan2(dy, dx)` → [-π, π], normalized to [0, 1] CCW from
// the 3-o'clock position (`0.5 - angle / 2π`), plus the rotation offset in turns. (Not
// `geom.toPolar`: only the angle is wanted here, and toPolar would compute a radius nothing
// reads.)
export const conicSweep = tgpu.fn([d.vec2f, d.f32, d.vec2f, d.vec2f], d.f32)(
    (center, rotation, uv, viewport) => {
        'use gpu'
        // Centred delta: the CENTRE is aspect-scaled, and the divide is guarded.
        const delta = aspectCenteredDelta(uv, center, viewport)

        const angle = std.atan2(delta.y, delta.x)
        const normalized = 0.5 - angle / TAU

        const rotationFraction = rotation * INV_360
        return normalized + rotationFraction
    })

// Diamond distance from `center`: Manhattan (L1), morphing to Chebyshev (L∞ / square) via
// `roundness`; `rotation` tilts the shape into a rhombus (inverse rotation — transpose of
// rotate2, hence the negated sine); normalized by `size`.
export const diamondDist = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32, d.vec2f, d.vec2f], d.f32)(
    (center, size, rotation, roundness, uv, viewport) => {
        'use gpu'
        // Centred delta: the CENTRE is aspect-scaled, and the divide is guarded.
        const delta = aspectCenteredDelta(uv, center, viewport)

        const rotRad = rotation * DEG_TO_RAD
        const cosR = std.cos(rotRad)
        const sinR = std.sin(rotRad)
        const rotated = geom.rotate2(delta, cosR, -sinR)

        const absDx = std.abs(rotated.x)
        const absDy = std.abs(rotated.y)

        // Blend L1 (diamond) ↔ L∞ (square) by roundness.
        const l1 = absDx + absDy
        const linf = std.max(absDx, absDy)
        const dist = std.mix(l1, linf, roundness)

        return dist / size
    })

// ── Repeat parts ────────────────────────────────────────────────────────────────────────

// Concentric rings: scale the parameter by `repeat`, then a RUNTIME select (repeat is not a
// compileTime prop) between clamped (repeat ≤ 1) and fract-tiled (repeat > 1) modes.
export const repeatRings = tgpu.fn([d.f32, d.f32], d.f32)((t, repeat) => {
    'use gpu'
    const s = t * repeat
    return std.select(std.clamp(s, 0.0, 1.0), std.fract(s), repeat > 1.0001)
})

// Wrapped tiling: scale by `repeat` and fract — every cycle wraps (angular sweeps).
export const repeatWrap = tgpu.fn([d.f32, d.f32], d.f32)((t, repeat) => {
    'use gpu'
    return std.fract(t * repeat)
})

// ── Color wheel ─────────────────────────────────────────────────────────────────────────

// The directional, animated cycle coordinate `t` ∈ [0,1). `animTime` is the per-node
// accumulated time.
export const colorWheelT = tgpu.fn([d.vec2f, d.vec2f, d.f32, d.f32, d.f32], d.f32)((uv, viewport, angle, scale, animTime) => {
    'use gpu'
    const angleRad = angle * DEG_TO_RAD
    // No Y flip. The projection is taken from the CANVAS CENTRE, not from the
    // aspect-corrected origin, so `angle` spins the gradient in place instead of sliding it across
    // the canvas. The trailing `+ aspect * 0.5` restores the phase the uncentred projection had at
    // angle 0; it is angle-independent, so it cannot move the pivot — it only keeps angle 0
    // (the default) pixel-identical.
    const aspect = geom.aspectOf(viewport)
    const projectedCoord = directionalProjection(
        canvasCentredDelta(uv, aspect), std.cos(angleRad), std.sin(angleRad),
    ) + aspect * 0.5
    // Scale by 0.2 so default scale=1 gives a gentle, wide cycle.
    return std.fract(projectedCoord * scale * 0.2 + animTime)
})

// Rainbow path: procedural HSV hue cycle (colorSpace does not apply — colors are generated,
// not blended between endpoints).
export const colorWheelRainbow = tgpu.fn([d.f32], d.vec4f)((t) => {
    'use gpu'
    const h6 = t * 6.0
    const r = std.clamp(std.abs(h6 - 3.0) - 1.0, 0.0, 1.0)
    const g = std.clamp(2.0 - std.abs(h6 - 2.0), 0.0, 1.0)
    const b = std.clamp(2.0 - std.abs(h6 - 4.0), 0.0, 1.0)
    return d.vec4f(r, g, b, 1.0)
})

// Custom path: cycle phase → (segmentMix, segmentIndex). The three per-segment color blends
// happen at builder level (compile-time colorSpace variant); this returns the phase they use.
export const colorWheelPhase = tgpu.fn([d.f32], d.vec2f)((t) => {
    'use gpu'
    const t3 = t * 3.0
    return d.vec2f(std.fract(t3), std.floor(t3))
})

// Custom path: pick the active segment color via the priority ladder (start at segment 2→0,
// override for 1 then 0). Takes the three pre-blended segment colors + the floored segment index.
export const colorWheelSelect = tgpu.fn([d.vec4f, d.vec4f, d.vec4f, d.f32], d.vec4f)((c01, c12, c20, floorT3) => {
    'use gpu'
    const seg1 = std.mix(c20, c12, std.step(floorT3, 1.5))
    return std.mix(seg1, c01, std.step(floorT3, 0.5))
})

// ── Sunburst ────────────────────────────────────────────────────────────────────────────
//
// Fully decomposed into lightfields parts: the sunBurst noun composes
// `radialBurstFrame` → `softRayLobes` × `radialFeatherMask` at builder level (positive
// speed = clockwise rotation, hence the noun negates the animated time).

// ── Spiral stripes ──────────────────────────────────────────────────────────────────────
//
// `center` is the ALREADY-transformed prop value (transformPosition stores `(x, 1 - y)`),
// so `1.0 - center.y` recovers the authored y. Aspect from the effective viewport
// (resize-fit box) or canvas — divided raw, no guard. `uv` is `uvContext ?? ctx.uv`.

// The spiral parameter `offset` = radial distance × scale + normalized angle − animTime. Pure (no
// derivatives). The angle wrap uses `fract` downstream (std.fract is floored), not `std.mod`, so
// the floored-mod trap does not apply.
export const spiralOffset = tgpu.fn([d.vec2f, d.f32, d.f32, d.vec2f, d.vec2f], d.f32)(
    (center, scale, animTime, uv, viewport) => {
        'use gpu'
        const aspect = viewport.x / viewport.y
        const dx = uv.x * aspect - center.x * aspect
        const dy = uv.y - (1.0 - center.y)
        const l = std.length(d.vec2f(dx, dy))
        const angle = std.atan2(dy, dx) - animTime
        return l * scale + angle / TWO_PI
    })

// The spiral stripe mask (0 = background, 1 = stroke). Uses `fwidth` (fragment-only) for the Quilez
// anti-aliasing footprint. The radial/angle math is `spiralOffset` — CALLED, not mirrored, so the
// CPU-golden test on `spiralOffset` covers the production path (a fn call is uniform control flow;
// `fwidth` of its result reads the same footprint as the old inline copy). Only `l` is re-derived
// locally, because `spiralOffset` returns the combined parameter and the falloff needs the radius
// alone — the duplicated delta is compiler-CSE'd.
export const spiralMask = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32, d.vec2f, d.vec2f], d.f32)(
    (center, scale, strokeWidth, strokeFalloff, softness, animTime, uv, viewport) => {
        'use gpu'
        const aspect = viewport.x / viewport.y
        const dx = uv.x * aspect - center.x * aspect
        const dy = uv.y - (1.0 - center.y)
        const l = std.length(d.vec2f(dx, dy))
        const offset = spiralOffset(center, scale, animTime, uv, viewport)
        const stripe = std.fract(offset)
        const shape = std.abs(stripe - 0.5) * 2.0

        const baseWidth = std.clamp(strokeWidth, strokeFalloff * 0.005, 1.0)
        const falloffAmount = 1.0 - std.clamp(strokeFalloff, 0.0, 1.0) * l
        const width = baseWidth * falloffAmount

        const fw = std.fwidth(offset)
        const fwMult = 4.0 - (std.smoothstep(0.05, 0.4, strokeWidth * 2.0) * std.smoothstep(0.05, 0.4, (1.0 - strokeWidth) * 2.0) * 3.0)
        const pixelSize = std.mix(fwMult * fw, std.fwidth(shape), std.clamp(fw, 0.0, 1.0))

        return std.smoothstep(width - pixelSize - softness, width + pixelSize + softness, shape)
    })

// ── Point-cloud (multi-point) gradient ──────────────────────────────────────────────────
//
// The inverse-distance weights fold five control points into a running weighted mean. This body
// returns the FOUR incremental mix factors `t_i = w_i / (accW + w_i)` (the running-weighted-average
// step); the paint chains them through `mixColorsVariants[mode]` so the blend happens in the
// compile-time color space. Positions recover the authored y via the transformPosition
// double-flip (`1 - pos.y`), via `aspectCentrePosition`. Aspect from the effective (resize-fit)
// viewport, guarded. Pure sqrt/pow.
const mpgWeight = tgpu.fn([d.vec2f, d.vec2f, d.f32], d.f32)((uvAspect, pos, effPower) => {
    'use gpu'
    const dx = uvAspect.x - pos.x
    const dy = uvAspect.y - pos.y
    const dist = std.sqrt(dx * dx + dy * dy) + 0.001
    return 1.0 / std.pow(dist, effPower)
})

export const mpgFactors = tgpu.fn(
    [d.vec2f, d.vec2f, d.vec2f, d.vec2f, d.vec2f, d.vec2f, d.vec2f, d.f32], d.vec4f)(
    (uv, vp, posA, posB, posC, posD, posE, smoothness) => {
        'use gpu'
        // `aspect` is taken once and threaded into the five centres rather than re-derived per
        // point, which is why aspectCentrePosition takes it as an argument.
        const aspect = geom.aspectOf(vp)
        const uvAspect = d.vec2f(uv.x * aspect, uv.y)
        const pA = aspectCentrePosition(posA, aspect)
        const pB = aspectCentrePosition(posB, aspect)
        const pC = aspectCentrePosition(posC, aspect)
        const pD = aspectCentrePosition(posD, aspect)
        const pE = aspectCentrePosition(posE, aspect)
        // Invert smoothness: higher value = lower power = blobs spread further.
        const effPower = std.min(8.0 / (smoothness + 0.5), 8.0)
        const wA = mpgWeight(uvAspect, pA, effPower)
        const wB = mpgWeight(uvAspect, pB, effPower)
        const wC = mpgWeight(uvAspect, pC, effPower)
        const wD = mpgWeight(uvAspect, pD, effPower)
        const wE = mpgWeight(uvAspect, pE, effPower)
        const accW1 = wA
        const t1 = wB / (accW1 + wB)
        const accW2 = accW1 + wB
        const t2 = wC / (accW2 + wC)
        const accW3 = accW2 + wC
        const t3 = wD / (accW3 + wD)
        const accW4 = accW3 + wD
        const t4 = wE / (accW4 + wE)
        return d.vec4f(t1, t2, t3, t4)
    })

// ── Beam ────────────────────────────────────────────────────────────────────────────────
//
// Returns `vec2(colorT, alpha)` for the beam. Endpoints recover the authored y via the
// transformPosition double-flip (`1 - pos.y`); aspect from the effective (resize-fit) viewport
// (no guard). Projects the pixel onto the start→end segment, measures perpendicular
// distance, mixes thickness/softness along the beam, then derives the glow alpha (pow falloff) and
// the inside→outside color factor.
export const beamField = tgpu.fn(
    [d.vec2f, d.vec2f, d.vec2f, d.vec2f, d.f32, d.f32, d.f32, d.f32], d.vec2f)(
    (uv, vp, start, end, startThickness, endThickness, startSoftness, endSoftness) => {
        'use gpu'
        const aspect = geom.aspectOf(vp)
        const startPos = d.vec2f(start.x, 1.0 - start.y)
        const endPos = d.vec2f(end.x, 1.0 - end.y)
        const acStart = d.vec2f(startPos.x * aspect, startPos.y)
        const acEnd = d.vec2f(endPos.x * aspect, endPos.y)
        const acUV = d.vec2f(uv.x * aspect, uv.y)

        // Project onto the segment, then shade the cross-section. `t` doubles as the taper parameter.
        const proj = lightfields.pointToSegment(acUV, acStart, acEnd)
        // Thickness props are halved-ish (×0.25) so the 0–2 slider covers a useful range.
        const field = lightfields.taperedSegmentGlow(
            proj.y, proj.x, startThickness * 0.25, endThickness * 0.25, startSoftness, endSoftness,
        )
        const colorT = field.x
        const alpha = field.y

        return d.vec2f(colorT, alpha)
    })

// ── Noise-field parts ───────────────────────────────────────────────────────────────────

// The tone tail: glow spread (pow) → contrast → percent-centred balance → invert. The inversion
// makes the multi-stop primitive's stop0…stopN line up with t=0…1.
export const plasmaTone = toneRemap({
    domain: 'unit',
    contrastMode: 'multiplicative',
    invert: true,
    glowGamma: true,
    balance: 'percentCentred',
})

// Aspect-corrected 3D slab domain: the screen UV on the z=0 plane, zoomed exponentially by
// `scale` (a 0–4 slider maps to a smooth e^(scale−1) magnification).
export const volumeDomain = tgpu.fn([d.vec2f, d.vec2f, d.f32], d.vec3f)((uv, viewport, scale) => {
    'use gpu'
    const aspect = geom.aspectOf(viewport)
    const base = d.vec3f(uv.x * aspect, uv.y, 0.0)
    return base.mul(std.exp(scale - 1.0))
})

// Unit-range MaterialX 3D noise sample: [-1,1] → [0,1]. Hash-based (bit-cast) → GPU-only.
export const unitNoise3 = tgpu.fn([d.vec3f], d.f32)((pos) => {
    'use gpu'
    return noise.mxNoiseFloat3(pos) * 0.5 + 0.5
})

// ── Flow-pattern parts ──────────────────────────────────────────────────────────────────

// Three nested sin/cos flow layers (each domain-warping the previous) → a combined signed
// pattern in [-1, 1]. In a `'use gpu'` body the `const d1 = …` locals ARE real WGSL
// bindings — each reference is a binding read rather than the upstream subtree re-inlined.
// `uv` is the raw canvas UV (no aspect); `animTime` the per-node accumulated time. Pure
// trig; the constants ARE the look.
//
// STAYS FUSED (deliberately, considered and rejected 2026-09-01): a shared
// `flowLayer(coord, freqs, rates)` part called 3× was evaluated — the layers are NOT the
// same shape. Layer 2 swaps the sin/cos assignment per axis with a different sign pattern;
// layer 3 adds a third `(x + y)` cross-term per axis and flips the time sign in its pattern
// read. Parameterizing that byte-identically needs trig-selection + sign arguments on every
// term, which is less readable than the explicit schedule. [B] Gate-C candidate: converge
// onto a standard warp schedule (pixels change).
export const flowLayers = tgpu.fn([d.vec2f, d.f32, d.f32], d.f32)((uv, detail, animTime) => {
    'use gpu'
    const t = animTime

    // Layer 1: base swirl with multi-directional flow.
    const freq1 = detail
    const d1 = d.vec2f(
        uv.x + (std.sin(uv.y * (freq1 * 1.7) + t * 0.8) * 0.12 + std.cos(uv.x * (freq1 * 0.9) - t * 0.5) * 0.05),
        uv.y + (std.cos(uv.x * (freq1 * 1.3) - t * 0.6) * 0.12 + std.sin(uv.y * (freq1 * 1.1) + t * 0.7) * 0.05),
    )
    const pattern1 = std.sin(d1.x * (freq1 * 2.1) + d1.y * (freq1 * 1.8) + t * 0.4)

    // Layer 2: medium detail, built from d1.
    const freq2 = detail * 2.1
    const d2 = d.vec2f(
        d1.x + (std.cos(d1.y * (freq2 * 2.7) - t * 0.45) * 0.07 + std.sin(d1.x * (freq2 * 1.9) + t * 0.6) * 0.04),
        d1.y + (std.sin(d1.x * (freq2 * 2.3) + t * 0.65) * 0.07 + std.cos(d1.y * (freq2 * 1.6) - t * 0.4) * 0.04),
    )
    const pattern2 = std.cos(d2.x * (freq2 * 1.4) - d2.y * (freq2 * 1.9) + t * 0.35)

    // Layer 3: fine detail, built from d2.
    const freq3 = detail * 3.7
    const d3 = d.vec2f(
        d2.x + (std.sin(d2.y * (freq3 * 1.8) + t * 0.85) * 0.04 + std.cos(d2.x * (freq3 * 1.3) - t * 0.55) * 0.025 + std.sin((d2.x + d2.y) * (freq3 * 0.7) + t * 0.9) * 0.02),
        d2.y + (std.cos(d2.x * (freq3 * 1.6) - t * 0.75) * 0.04 + std.sin(d2.y * (freq3 * 1.1) + t * 0.5) * 0.025 + std.cos((d2.x + d2.y) * (freq3 * 0.8) - t * 0.95) * 0.02),
    )
    const pattern3 = std.sin(d3.x * (freq3 * 1.1) + d3.y * (freq3 * 1.5) - t * 0.55)

    return pattern1 * 0.45 + pattern2 * 0.35 + pattern3 * 0.2
})

// Soft threshold over a signed pattern: normalize [-1,1] → [0,1], add `bias`, smoothstep
// between `low` and `high`.
export const unitThreshold = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)((pattern, bias, low, high) => {
    'use gpu'
    const normalized = pattern * 0.5 + 0.5 + bias
    return std.smoothstep(low, high, normalized)
})

// Subtle brightness pulse driven by a pattern: sin(t·speed + pattern·span)·depth + 1.
export const shimmerPulse = tgpu.fn([d.f32, d.f32, d.f32, d.f32, d.f32], d.f32)((pattern, animTime, speed, span, depth) => {
    'use gpu'
    return std.sin(animTime * speed + pattern * span) * depth + 1.0
})

// ── Godrays ─────────────────────────────────────────────────────────────────────────────

// Value-noise hash. Integer bitcast hash: the radial lattice slides with the unbounded clock
// (`r − animTime·k`), where the classic sin-fract hash degrades on iOS Metal (low-precision
// large-argument sin range reduction). GPU-only.
const godraysHash = tgpu.fn([d.vec2f], d.f32)((p) => {
    'use gpu'
    return noise.hash12(p)
})

const godraysValueNoise = tgpu.fn([d.vec2f], d.f32)((st) => {
    'use gpu'
    const i = std.floor(st)
    const f = std.fract(st)
    const a = godraysHash(i)
    const b = godraysHash(d.vec2f(i.x + 1.0, i.y))
    const c = godraysHash(d.vec2f(i.x, i.y + 1.0))
    const e = godraysHash(d.vec2f(i.x + 1.0, i.y + 1.0))
    // smoothstep interpolation: f*f*(3 - 2f), component-wise
    const u = f.mul(f).mul(f.mul(-2.0).add(3.0))
    const x1 = std.mix(a, b, u.x)
    const x2 = std.mix(c, e, u.x)
    return std.mix(x1, x2, u.y)
})

// Ray shape: two noise evaluations (angle + wrapped-angle) blended across the atan2 seam.
// Both evaluations stay unconditional (a branch-out would produce a visible seam).
const godraysRaysShape = tgpu.fn([d.f32, d.f32, d.f32, d.f32, d.f32, d.f32], d.f32)(
    (a, aWrapped, blend, r, freq, intensity) => {
        'use gpu'
        const nLeft = std.pow(godraysValueNoise(d.vec2f(a * freq, r)), intensity)
        const nRight = std.pow(godraysValueNoise(d.vec2f(aWrapped * freq, r)), intensity)
        return std.mix(nRight, nLeft, blend)
    },
)

// The seam-free radial frame the ray layers evaluate in: `vec4(angle, angleWrapped, blend,
// radius)` about the unflipped `center` (a transformPosition prop — `1 - center.y` recovers the
// authored y), delta aspect-corrected per-axis. The angle pair + blend come from
// lightfields.seamlessAngularField (the ray pattern must evaluate on BOTH atan2 branches and
// cross-fade — a branch across the seam would be visible along -x).
export const godraysFrame = tgpu.fn([d.vec2f, d.vec2f, d.vec2f], d.vec4f)((uv, viewport, center) => {
    'use gpu'
    const aspect = geom.aspectOf(viewport)
    const centerPos = d.vec2f(center.x, 1.0 - center.y)
    const delta = uv.sub(centerPos)
    const shapeUV = d.vec2f(delta.x * aspect, delta.y)
    const ang = lightfields.seamlessAngularField(shapeUV)
    return d.vec4f(ang.x, ang.y, ang.z, std.length(shapeUV))
})

// One ray layer over a godrays frame: the PRODUCT of two seam-blended noise shapes at different
// radial rates. The schedule rides in two packed literals (the tgpu.fn arg-cap convention):
// `sched = vec4(rMulA, tRateA, rMulB, tRateB)` — radius multiplier + time scroll rate per shape
// (the B shape's radius additionally stretches by `1 + spots`) — and `freqs = vec2(fMul, fBMul)`
// — the density→frequency multiplier and the B shape's frequency ratio.
const godraysRayLayer = tgpu.fn(
    [d.vec4f, d.f32, d.f32, d.f32, d.f32, d.vec4f, d.vec2f], d.f32,
)((frame, animTime, spots, intensityCalc, dens, sched, freqs) => {
    'use gpu'
    const rA = frame.w * sched.x - animTime * sched.y
    const rB = frame.w * sched.z * (1.0 + spots) - animTime * sched.w
    const f = dens * freqs.x
    const shapeA = godraysRaysShape(frame.x, frame.y, frame.z, rA, f, intensityCalc)
    const shapeB = godraysRaysShape(frame.x, frame.y, frame.z, rB, f * freqs.y, intensityCalc)
    return shapeA * shapeB
})

// The two-layer ray accumulation over a godrays frame — `godraysRayLayer` called with the two
// tuned schedules. The schedule constants (1.0/0.5/1.4/0.7 radii × 3.0/2.0/2.5/1.8 scroll rates ×
// 5.0/4.5 frequencies × the 0.7 second-layer weight) ARE the look: they set how the sectors
// shimmer past each other. Returns the clamped coverage.
export const godraysRayStack = tgpu.fn(
    [d.vec4f, d.f32, d.f32, d.f32, d.f32], d.f32,
)((frame, animTimeRaw, density, intensity, spotty) => {
    'use gpu'
    const animTime = animTimeRaw * 0.2
    const spots = 6.5 * std.abs(spotty)
    const intensityCalc = 4.0 - 3.0 * std.clamp(intensity, 0.0, 1.0)
    const dens = 6.0 * density

    const layer1 = godraysRayLayer(frame, animTime, spots, intensityCalc, dens, d.vec4f(1.0, 3.0, 0.5, 2.0), d.vec2f(5.0, 4.0))
    const layer2 = godraysRayLayer(frame, animTime, spots, intensityCalc, dens, d.vec4f(1.4, 2.5, 0.7, 1.8), d.vec2f(4.5, 3.5))
    return std.clamp(layer1 + layer2 * 0.7, 0.0, 1.0)
})

// Straight-alpha composite of a coverage-masked color over a background (linear RGB): the light
// over its backdrop, un-premultiplied with a floor so a fully-transparent result stays finite.
export const coverageOverComposite = tgpu.fn([d.vec4f, d.vec4f, d.f32], d.vec4f)((rayColor, bgColor, coverage) => {
    'use gpu'
    const rayA = coverage * rayColor.w
    const finalAlpha = rayA + bgColor.w * (1.0 - rayA)
    const safeAlpha = std.clamp(finalAlpha, 0.001, 1.0)
    const rayContribution = rayColor.xyz.mul(rayA)
    const bgContribution = bgColor.xyz.mul(bgColor.w).mul(1.0 - rayA)
    const finalColor = rayContribution.add(bgContribution).div(safeAlpha)
    return d.vec4f(finalColor, finalAlpha)
})

// ── Light leak ──────────────────────────────────────────────────────────────────────────
//
// Decomposed into parts: the leak-local frame is lightfields.beamLocalFrame, the bloom and
// streak fields are below (built on lightfields.anisotropicGaussianSpot / streakBand), the
// color ramp + chromatic taps + exposure composite live in lightfields (heatRamp3 /
// chromaticHeatTaps / screenGlowComposite). The lightLeak noun composes them.

// Slow evolution + breathing signals (layered value noise — cellular enough to read as
// flicker): returns `vec4(flickerMod, streakDrift, elongationDrift, widthDrift)`. `flicker` sets
// the breathing depth; `seed` re-rolls every drift.
export const leakDrift = tgpu.fn([d.f32, d.f32, d.f32], d.vec4f)((t, seed, flicker) => {
    'use gpu'
    const nA = noise.value12(d.vec2f(t * 0.9, seed * 0.53 + 11.7))
    const nB = noise.value12(d.vec2f(t * 2.7 + 41.3, seed * 0.29 + 5.1))
    const breathe = nA * 0.65 + nB * 0.35
    const flickerMod = std.mix(1.0, 0.25 + 1.5 * breathe, flicker)
    const evo1 = noise.value12(d.vec2f(t * 0.13 + 3.1, seed * 0.41 + 27.0)) // streak drift
    const evo2 = noise.value12(d.vec2f(t * 0.09 + 17.7, seed * 0.61 + 8.4)) // elongation drift
    const evo3 = noise.value12(d.vec2f(t * 0.17 + 51.2, seed * 0.23 + 2.9)) // width drift
    return d.vec4f(flickerMod, evo1, evo2, evo3)
})

// The leak's diffuse bloom in the beam-local frame (u along the beam, v lateral): an anisotropic
// gaussian at the anchor, elongated laterally and slowly reshaping (the drift's elongation
// channel), with a wide soft shoulder (×0.22 — layered diffusion, never one clean gaussian).
// `drift` is the leakDrift vec4. Returns `vec2(main, shoulder)`.
export const leakBloom = tgpu.fn([d.f32, d.f32, d.f32, d.vec4f], d.vec2f)((u, v, spread, drift) => {
    'use gpu'
    const evo2 = drift.z
    const sp = std.max(spread, 0.05)
    const elong = sp * (1.5 + 0.7 * evo2)
    const du = u / sp
    const dv = v / elong
    const main = lightfields.anisotropicGaussianSpot(du, dv, 1.9)
    const shoulder = lightfields.anisotropicGaussianSpot(du, dv, 0.45) * 0.22
    return d.vec2f(main, shoulder)
})

// The leak's parallel streak bands across the beam (the double-band leak — light bouncing
// between film and backing plate), drifting along it over time: two lightfields.streakBand calls
// at drifting centres/widths, faded along the lateral axis, summed and scaled by `streaks`.
// `drift` is the leakDrift vec4 (y = streak drift, z = elongation, w = width drift).
export const leakStreaks = tgpu.fn([d.f32, d.f32, d.f32, d.f32, d.vec4f], d.f32)((u, v, spread, streaks, drift) => {
    'use gpu'
    const evo1 = drift.y
    const evo2 = drift.z
    const evo3 = drift.w
    const sp = std.max(spread, 0.05)
    const elong = sp * (1.5 + 0.7 * evo2)
    const dv = v / elong
    const alongFade = std.exp(dv * dv * -0.55)
    const s1c = sp * (0.42 + 0.22 * evo1)
    const s1w = std.max(sp * (0.07 + 0.07 * evo3), 0.008)
    const streak1 = lightfields.streakBand(u, s1c, s1w) * alongFade
    const s2c = sp * (0.8 + 0.3 * evo1)
    const s2w = std.max(sp * (0.16 + 0.12 * evo3), 0.015)
    const streak2 = lightfields.streakBand(u, s2c, s2w) * alongFade * 0.45
    return (streak1 + streak2) * streaks
})

// Hash dither + floor on an accumulated heat field — breaks banding on the long soft ramps.
export const heatDither = tgpu.fn([d.f32, d.vec2f, d.f32], d.f32)((heat, uv, t) => {
    'use gpu'
    const dithered = heat + (noise.hash12(uv.mul(1024.0).add(d.vec2f(t, t * 1.7))) - 0.5) * 0.012
    return std.max(dithered, 0.0)
})

// ─── Ramp wrapping ──────────────────────────────────────────────────────────────────────────────

/**
 * Palette wrapping: traverse a ramp coordinate through `cycles` half-cycles as `t` rises, folding
 * back at the ends (triangle wave, so any palette stays seam-free). Band density is |∇t| × the
 * cycle count — automatically dense where the field bends/pinches and smooth elsewhere. Identity
 * at cycles = 1. Where the band frequency exceeds what a pixel can resolve, fade to the palette
 * mid instead of shimmering (the quilezCheckerFilter limit idea) — derivatives are legal, `t` is
 * a fn parameter computed in uniform control flow. Fragment-only (fwidth).
 */
export const rampWrap = tgpu.fn([d.f32, d.f32], d.f32)((t, cycles) => {
    'use gpu'
    const s = t * cycles
    const m = std.fract(s * 0.5) * 2.0
    const band = 1.0 - std.abs(m - 1.0)
    // Half-band cycles crossed per pixel; >= ~1 means the ping-pong is sub-pixel.
    const fp = footprint1(t, 0.0) * cycles
    return std.mix(band, 0.5, std.smoothstep(0.5, 1.5, fp))
})

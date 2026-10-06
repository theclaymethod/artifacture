/**
 * Geometry primitives — leaf math plus the aspect-corrected UV framings, canvas-centre rotation,
 * and polar conversions the generator fleet shares (Phase 6).
 *
 * CONVENTION (D-1), binding on everything in this file:
 *
 * - **Center-scaled is canonical.** A centre position in UV space is aspect-corrected as
 *   `center.x * aspect` (see {@link aspectCentrePosition}), matching `sdf.shapeLocalCoords`.
 *   Scaling the UV and leaving the centre alone produces a different, subtly wrong offset at
 *   non-square aspects. Some migrated shaders keep a legacy delta-scaled variant inline — those
 *   carry a deviation comment at the site rather than being silently converted.
 * - **The aspect divide is ALWAYS guarded** — `viewport.x / max(viewport.y, 1e-6)`. See
 *   {@link aspectOf}. `coords.aspectOf` is the older unguarded version this supersedes (it divides
 *   by `viewportSize.y` raw, which is NaN on the single frame where a canvas reports zero height).
 * - **`flipY` is explicit with no default.** TGSL cannot branch on a JS option inside a body, so
 *   the choice is spelled in the fn NAME: {@link aspectCorrectedUV} does not flip,
 *   {@link aspectCorrectedUVFlipY} does. A migration must pick one by name, which is exactly the
 *   forcing function D-1 asked for.
 */
import {tgpu, d, std} from './index'

/**
 * Aspect ratio (width / height) from a viewport size, guarded: `x / max(y, 1e-6)`.
 *
 * The guard exists because a canvas can report a zero height for one frame during init/resize;
 * unguarded, that frame renders NaN. 1e-6 is far below any real pixel height, so the guard is
 * unreachable for every valid viewport — it only replaces division by exactly-or-near zero.
 */
export const aspectOf = tgpu.fn([d.vec2f], d.f32)((viewport) => {
    'use gpu'
    return viewport.x / std.max(viewport.y, 1e-6)
})

/**
 * Floored modulo of a scalar: `x - m * floor(x / m)`. Unlike WGSL's `%` (truncated, keeps the
 * sign of the dividend) this always returns a value in [0, m) for positive `m`, which is what
 * tiling wants for negative coordinates.
 */
export const flooredMod1 = tgpu.fn([d.f32, d.f32], d.f32)((x, m) => {
    'use gpu'
    return x - m * std.floor(x / m)
})

/**
 * Per-component floored modulo of a vec2 — the tiling primitive. Body is the exact math from
 * `shaders/HexGrid/index.ts`'s local copy (component-wise, not vector ops) so adopting it emits
 * an identical body.
 */
export const flooredMod2 = tgpu.fn([d.vec2f, d.vec2f], d.vec2f)((p, m) => {
    'use gpu'
    return d.vec2f(p.x - m.x * std.floor(p.x / m.x), p.y - m.y * std.floor(p.y / m.y))
})

/**
 * Sign-preserving guarded divide: `n / den`, with `den` pushed out to at least 1e-5 in magnitude
 * on whichever side of zero it already sits.
 *
 * Preserving the sign matters — clamping to `max(den, eps)` would flip the quotient's sign for
 * small negative denominators, which reads as a discontinuity through zero rather than a large
 * value. 1e-5 is the epsilon the fleet's hand-rolled copies use: small enough that any
 * geometrically meaningful denominator passes through untouched, large enough that the quotient
 * stays inside f32 range for UV-scale numerators.
 *
 * The parameter is named `den`, not `d` — `d` is the data-schema namespace in kit scope.
 */
export const safeDiv = tgpu.fn([d.f32, d.f32], d.f32)((n, den) => {
    'use gpu'
    // std.select arg order is (ifFalse, ifTrue, cond).
    const guarded = std.select(std.max(den, 1e-5), std.min(den, -1e-5), den < 0.0)
    return n / guarded
})

/**
 * Rotate a 2D point about the origin by a precomputed cos/sin pair. Takes the pair rather than an
 * angle so callers that rotate many points (or that already resolved the angle on the CPU) compute
 * the trig once; for a constant angle it folds to two literals.
 */
export const rotate2 = tgpu.fn([d.vec2f, d.f32, d.f32], d.vec2f)((p, cosA, sinA) => {
    'use gpu'
    return d.vec2f(p.x * cosA - p.y * sinA, p.x * sinA + p.y * cosA)
})

// ── Aspect-corrected UV framings (D-1) ────────────────────────────────────────────────────────

/**
 * Aspect-corrected screen UV, **no Y flip**: `(uv.x * aspect, uv.y)`, with the guarded aspect.
 *
 * This is the framing that makes a pattern's cells square: X is stretched into the same units as Y,
 * so the domain runs `[0, aspect] × [0, 1]` and the canvas centre sits at `(aspect * 0.5, 0.5)`.
 *
 * The flip choice is in the name, not an argument — see {@link aspectCorrectedUVFlipY} and the
 * D-1 note in this file's header.
 */
export const aspectCorrectedUV = tgpu.fn([d.vec2f, d.vec2f], d.vec2f)((uv, viewport) => {
    'use gpu'
    const aspect = viewport.x / std.max(viewport.y, 1e-6)
    return d.vec2f(uv.x * aspect, uv.y)
})

/**
 * Aspect-corrected screen UV **with the Y flip**: `(uv.x * aspect, 1 - uv.y)`, guarded aspect.
 *
 * Y-flipping puts the pattern's origin at the bottom-left rather than the top-left, so a row index
 * of 0 is the bottom row. Sibling generators genuinely disagree about this (Grid and DotGrid flip,
 * HexGrid and Truchet do not) and both looks are shipped, which is why neither is the default.
 */
export const aspectCorrectedUVFlipY = tgpu.fn([d.vec2f, d.vec2f], d.vec2f)((uv, viewport) => {
    'use gpu'
    const aspect = viewport.x / std.max(viewport.y, 1e-6)
    return d.vec2f(uv.x * aspect, 1.0 - uv.y)
})

/**
 * Recover the authored Y of a position prop: `(p.x, 1 - p.y)`.
 *
 * `transformPosition` stores a position as `(x, 1 - y)` so the design editor's top-left origin
 * round-trips, which means every shader reading a position prop has to undo the flip. This is that
 * undo, named — the bare `1.0 - center.y` is the single most-copied line in the gradient fleet.
 */
export const unflipPosition = tgpu.fn([d.vec2f], d.vec2f)((p) => {
    'use gpu'
    return d.vec2f(p.x, 1.0 - p.y)
})

/**
 * A `transformPosition`-stored centre, moved into aspect-corrected space: `(pos.x * aspect, 1 - pos.y)`.
 *
 * Combines {@link unflipPosition} with the D-1 center-scaled rule in one step, because that pair is
 * what a centred generator actually needs. `aspect` is passed in rather than derived so a caller
 * that scales several centres (MultiPointGradient's five control points) divides once.
 */
export const aspectCentrePosition = tgpu.fn([d.vec2f, d.f32], d.vec2f)((pos, aspect) => {
    'use gpu'
    return d.vec2f(pos.x * aspect, 1.0 - pos.y)
})

/**
 * Vector from a `transformPosition`-stored centre to a screen UV, both in aspect-corrected space:
 * `(uv.x * aspect - center.x * aspect, uv.y - (1 - center.y))`. Guarded aspect.
 *
 * This is the canonical D-1 delta — the centre is scaled, NOT the UV alone. It is the opening of
 * every centred field (radial/conic/diamond gradients, spirals): everything downstream is a
 * function of this delta.
 */
export const aspectCenteredDelta = tgpu.fn([d.vec2f, d.vec2f, d.vec2f], d.vec2f)((uv, center, viewport) => {
    'use gpu'
    const aspect = viewport.x / std.max(viewport.y, 1e-6)
    return d.vec2f(uv.x * aspect - center.x * aspect, uv.y - (1.0 - center.y))
})

/**
 * Vector from the canvas centre to a screen UV in aspect-corrected space:
 * `(uv.x * aspect - aspect * 0.5, uv.y - 0.5)`.
 *
 * The fixed-centre case of {@link aspectCenteredDelta} (equivalent to passing a centre of
 * `(0.5, 0.5)`), for the patterns that pivot on the canvas centre and have no centre prop. It takes
 * `aspect` rather than the viewport because these callers need `aspect` again afterwards — to
 * un-correct the rotated result, or to size the lattice.
 */
export const canvasCentredDelta = tgpu.fn([d.vec2f, d.f32], d.vec2f)((uv, aspect) => {
    'use gpu'
    return d.vec2f(uv.x * aspect - aspect * 0.5, uv.y - 0.5)
})

/**
 * Rotate an ALREADY aspect-corrected UV about the canvas centre `(aspect * 0.5, 0.5)`, by a
 * precomputed cos/sin pair.
 *
 * Rotating about the centre rather than the origin is what makes a `rotation` prop read as "spin
 * the pattern in place" instead of "swing it off screen". Callers own the sign: negate the angle
 * before taking cos/sin if positive rotation should read clockwise.
 *
 * The centre is derived from `aspect`, so this must be handed a UV in the
 * {@link aspectCorrectedUV} / {@link aspectCorrectedUVFlipY} framing — not a raw `[0,1]²` UV.
 */
export const rotateAboutCanvasCentre = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32], d.vec2f)((p, aspect, cosA, sinA) => {
    'use gpu'
    const centerX = aspect * 0.5
    const centerY = 0.5
    const cx = p.x - centerX
    const cy = p.y - centerY
    return d.vec2f(cx * cosA - cy * sinA + centerX, cx * sinA + cy * cosA + centerY)
})

/**
 * Signed projection of a point onto a direction given as a cos/sin pair: `p.x * cosA + p.y * sinA`.
 *
 * The scalar coordinate every directional pattern is a function of — stripe phase, linear-gradient
 * parameter, chevron axis. One number instead of a rotated vector, so the perpendicular component
 * is never computed for patterns that do not use it.
 */
export const directionalProjection = tgpu.fn([d.vec2f, d.f32, d.f32], d.f32)((p, cosA, sinA) => {
    'use gpu'
    return p.x * cosA + p.y * sinA
})

// ── Polar conversions ─────────────────────────────────────────────────────────────────────────

/**
 * Cartesian → polar: `(length(p), atan2(p.y, p.x))`. The angle is in radians on `[-π, π]`, zero at
 * the 3-o'clock position, increasing counter-clockwise in a Y-up frame.
 *
 * Returns both components because the callers that want one usually want the other one step later
 * (a spiral is radius plus angle; a conic band is angle alone). Divide the angle by
 * `constants.TAU` to get a `[-0.5, 0.5]` turn fraction.
 */
export const toPolar = tgpu.fn([d.vec2f], d.vec2f)((p) => {
    'use gpu'
    return d.vec2f(std.length(p), std.atan2(p.y, p.x))
})

/**
 * Polar → cartesian: `(r * cos(theta), r * sin(theta))`. The inverse of {@link toPolar}, exact for
 * any `r >= 0` and `theta` in `[-π, π]`.
 */
export const fromPolar = tgpu.fn([d.f32, d.f32], d.vec2f)((r, theta) => {
    'use gpu'
    return d.vec2f(r * std.cos(theta), r * std.sin(theta))
})

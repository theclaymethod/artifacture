/**
 * Anti-aliasing primitives for procedural patterns — pixel footprints, the Quilez analytical
 * filters, and the mask tails the grid/pattern fleet shares.
 *
 * THE TWO STRATEGIES, and when each applies:
 *
 * - **Analytical filtering** ({@link quilezStepFilter}, {@link quilezLineFilterAxis},
 *   {@link quilezCheckerFilter}). For a periodic pattern with a closed-form antiderivative, the
 *   exact average over the pixel footprint is cheaper AND better than any amount of supersampling:
 *   crisp when the footprint is small, correctly converging to the pattern's mean grey when a cell
 *   shrinks below a pixel, with no shimmer at any zoom. Reference:
 *   https://iquilezles.org/articles/filterableprocedurals/
 * - **Footprint-widened smoothstep** ({@link lineMaskFromField}, {@link bandMask},
 *   {@link discCoverage}). For a distance field with no tractable integral, smoothstep across one
 *   pixel of footprint. Cheap, and correct to first order.
 *
 * FOOTPRINTS COME FROM DERIVATIVES OF A CONTINUOUS COORDINATE. `dpdx`/`dpdy` are fragment-only
 * intrinsics and they must be taken on the pre-`fract`, pre-`abs` coordinate. A derivative of a
 * folded value spikes at every seam, which draws a bright line down each cell boundary — the
 * classic symptom of measuring the footprint one step too late.
 *
 * These fns take the footprint as an ARGUMENT wherever the math allows, which keeps them pure and
 * CPU-testable; only {@link footprint1} and {@link footprint2} touch derivatives.
 */
import {tgpu, d, std} from './index'

// ── Pixel footprints ──────────────────────────────────────────────────────────────────────────

/**
 * Screen-space footprint of a scalar pattern coordinate, widened by `softness` and floored:
 * `max(max(|dpdx(x)|, |dpdy(x)|) + softness, 1e-5)`.
 *
 * `max` of the two derivatives (rather than a length) is the conservative choice: it covers the
 * wider axis of an anisotropically-stretched pixel, so a pattern viewed at a grazing angle blurs
 * rather than aliases. The `1e-5` floor keeps the footprint out of the denominators downstream —
 * an exactly-zero derivative happens on a degenerate or fully-collapsed pass, and it would produce
 * NaN across the whole surface rather than a hard edge.
 *
 * `softness` is added BEFORE the floor. Adding it after (as Grid does inline) differs by at most
 * the floor itself, but the two are not interchangeable — pick one and keep it.
 */
export const footprint1 = tgpu.fn([d.f32, d.f32], d.f32)((x, softness) => {
    'use gpu'
    const baseW = std.max(std.abs(std.dpdx(x)), std.abs(std.dpdy(x)))
    return std.max(baseW + softness, 0.00001)
})

/**
 * {@link footprint1} per axis of a 2D pattern coordinate — each component's footprint is the max of
 * that component's two derivatives, so X and Y are measured independently.
 *
 * Independence matters: a grid stretched hard in X should soften its vertical lines only, and a
 * single shared footprint would smear the horizontal ones to match.
 */
export const footprint2 = tgpu.fn([d.vec2f, d.f32], d.vec2f)((p, softness) => {
    'use gpu'
    const dpx = std.dpdx(p)
    const dpy = std.dpdy(p)
    const baseW = d.vec2f(std.max(std.abs(dpx.x), std.abs(dpy.x)), std.max(std.abs(dpx.y), std.abs(dpy.y)))
    return d.vec2f(std.max(baseW.x + softness, 0.00001), std.max(baseW.y + softness, 0.00001))
})

// ── Quilez analytical filters ─────────────────────────────────────────────────────────────────

/**
 * Analytical average of `step(threshold, fract(p))` over a footprint `w` — the filtered two-tone
 * stripe.
 *
 * The pattern's antiderivative is `F(x) = floor(x)·(1 - threshold) + max(fract(x) - threshold, 0)`,
 * so the exact mean over `[p - w/2, p + w/2]` is `(F(a) - F(b)) / w`. `threshold` is the duty point:
 * the pattern is 0 below it and 1 above, so the ON fraction is `1 - threshold`.
 *
 * Note the convention. This is the DUTY-CYCLE parameterisation, for a pattern split into two bands
 * of color. {@link quilezLineFilterAxis} is the same integral in the LINE-WIDTH parameterisation,
 * for thin lines on a background. They are not interchangeable and neither should be rewritten in
 * terms of the other — the argument that reads naturally ("balance" vs "how many line widths fit in
 * a cell") is what makes each one's prop mapping legible.
 */
export const quilezStepFilter = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((p, w, threshold) => {
    'use gpu'
    const a = p + w * 0.5
    const b = p - w * 0.5
    const oneMinusThreshold = 1.0 - threshold
    const Fa = std.floor(a) * oneMinusThreshold + std.max(std.fract(a) - threshold, 0.0)
    const Fb = std.floor(b) * oneMinusThreshold + std.max(std.fract(b) - threshold, 0.0)
    return std.clamp((Fa - Fb) / w, 0.0, 1.0)
})

/**
 * Analytical average of `step(1/N, fract(p))` over a footprint `w`, ONE AXIS of a line grid — the
 * line-width parameterisation of the same integral as {@link quilezStepFilter}.
 *
 * `N` is the reciprocal line fraction: `N = 1 / lineFraction`, so larger `N` means thinner lines.
 *
 * Returns this axis's LINE coverage — 1 inside a line, 0 in the gap. That is the exact complement of
 * {@link quilezStepFilter} at `threshold = 1/N`, which is the whole difference between the two
 * parameterisations. Combine two axes by inclusion-exclusion: `1 - (1 - iX)(1 - iY)` is "on a line if
 * either axis is", and the product form is what avoids double-counting the intersections where the
 * two line families cross.
 *
 * Unlike {@link quilezStepFilter} this result is NOT clamped; the caller's inclusion-exclusion
 * combine is what bounds it.
 */
export const quilezLineFilterAxis = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((p, w, N) => {
    'use gpu'
    const a = p + w * 0.5
    const b = p - w * 0.5
    return (std.floor(a) + std.min(std.fract(a) * N, 1.0) - std.floor(b) - std.min(std.fract(b) * N, 1.0)) / (N * w)
})

/**
 * Analytical average of the 2D checkerboard `(floor(p.x) + floor(p.y)) mod 2` over a footprint `w`:
 *
 *     i = 2·(|fract((p - w/2)/2) - 0.5| - |fract((p + w/2)/2) - 0.5|) / w
 *     value = clamp(0.5 - 0.5·i.x·i.y, 0, 1)
 *
 * The half-period triangle wave is the checkerboard's antiderivative in each axis, and the parity
 * pattern separates into their product — which is why a checkerboard can be filtered exactly while
 * most 2D patterns cannot.
 *
 * Crisp 0/1 at small footprints, converging to a uniform 0.5 as cells shrink below a pixel. That
 * mid-grey is the correct answer, not a failure: it is what a checkerboard actually averages to,
 * and it is why a receding checkerboard plane fades to flat grey instead of into moiré.
 */
export const quilezCheckerFilter = tgpu.fn([d.vec2f, d.vec2f], d.f32)((p, w) => {
    'use gpu'
    const aHalf = d.vec2f(w.x * 0.5, w.y * 0.5)
    const minusSideX = std.abs(std.fract((p.x - aHalf.x) * 0.5) - 0.5)
    const minusSideY = std.abs(std.fract((p.y - aHalf.y) * 0.5) - 0.5)
    const plusSideX = std.abs(std.fract((p.x + aHalf.x) * 0.5) - 0.5)
    const plusSideY = std.abs(std.fract((p.y + aHalf.y) * 0.5) - 0.5)
    const iX = (minusSideX - plusSideX) * 2.0 / w.x
    const iY = (minusSideY - plusSideY) * 2.0 / w.y
    return std.clamp(0.5 - iX * iY * 0.5, 0.0, 1.0)
})

// ── Smoothstep mask tails ─────────────────────────────────────────────────────────────────────

/**
 * Line coverage from a distance field: `(1 - smoothstep(lo, hi, field)) · step(1e-4, lineWidth)`.
 *
 * The mask tail every SDF-based grid ends with. Two details it exists to carry:
 *
 * - **The smoothstep is INVERTED rather than reversed.** `smoothstep(hi, lo, x)` with `hi > lo` is
 *   undefined behaviour in WGSL (it requires `edge0 < edge1`), so the falling ramp has to be written
 *   as `1 - smoothstep(lo, hi, x)` — provably the same curve, and portable.
 * - **The `step(1e-4, lineWidth)` factor is a kill switch, not a rounding guard.** At
 *   `lineWidth = 0` the band `[lo, hi]` collapses onto the field's zero set but does not vanish, so
 *   without this factor a "thickness 0" pattern still draws hairlines everywhere its field is
 *   exactly zero. Multiplying by zero is what actually makes thickness 0 mean "no lines".
 *
 * `lo`/`hi` are the caller's band. The two conventions in the fleet are a symmetric
 * `(lineWidth - aa, lineWidth + aa)` and a floored, footprint-asymmetric
 * `(max(lineWidth - soft, 0), lineWidth + pixel + soft)`; both pass straight through here.
 */
export const lineMaskFromField = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)((field, lineWidth, lo, hi) => {
    'use gpu'
    return (1.0 - std.smoothstep(lo, hi, field)) * std.step(0.0001, lineWidth)
})

/**
 * Symmetric band mask inside a unit cell: `smoothstep(lo, hi, x) · smoothstep(lo, hi, 1 - x)`.
 *
 * 1 in the middle of the cell, falling to 0 within `[lo, hi]` of BOTH edges. The product of the two
 * ramps is what makes it symmetric without a branch or an `abs`, and it composes: multiplying an X
 * band by a Y band gives an inset rectangle (a brick face, a woven thread's crossing).
 *
 * `x` is expected in `[0, 1]` — the `fract` of a scaled coordinate. `lo`/`hi` are absolute
 * positions in that unit space, so a gap of `g` with a footprint of `f` is `lo = g, hi = g + f`, and
 * a centre line at `m` with symmetric anti-aliasing is `lo = m - aa, hi = m + aa`.
 */
export const bandMask = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((x, lo, hi) => {
    'use gpu'
    return std.smoothstep(lo, hi, x) * std.smoothstep(lo, hi, 1.0 - x)
})

/**
 * Anti-aliased disc coverage: `1 - smoothstep(radius - footprint/2, radius, dist)`.
 *
 * The ramp is one footprint wide and sits INSIDE the radius (from `radius - footprint/2` up to
 * `radius`, not straddling it), which keeps the disc from visually inflating as it softens — the
 * silhouette stays put and only the edge feathers. Half a footprint rather than a full one because
 * a disc's edge is curved: the extra sharpness reads better on small dots, where a full-footprint
 * ramp turns a 3px dot into a blur.
 */
export const discCoverage = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((dist, radius, footprint) => {
    'use gpu'
    return 1.0 - std.smoothstep(radius - footprint * 0.5, radius, dist)
})

/**
 * REVEAL / WIPE PRIMITIVES — the shared machinery of the Transitions category.
 *
 * Every pointwise wipe in the library is the same shader with an interchangeable *coverage
 * coordinate*: a per-pixel scalar in [0,1] saying "when does this pixel go away". The tail that
 * turns that scalar into an alpha multiplier was copy-pasted verbatim across 11 shaders and lives
 * here once as {@link revealMask} + {@link applyReveal}.
 *
 * The shape of a wipe body is therefore:
 *
 *     const coord = <a coverage coord, optionally run through a modifier>
 *     return applyReveal(color, revealMask(coord, progress, feather, invert))
 *
 * The coverage coords below are the four families the fleet uses (directional projection, radial
 * distance, angular sweep, cell grid), plus the fbm coverage field. Per-shader flavour — a hash
 * per cell, a band quantization, a parity term — lives here too, as named modifier coords over
 * those families (see the modifiers section); the shader files compose them by name.
 *
 * COMPILE-TIME vs RUNTIME (C5): every parameter here is a **runtime** value (uniform or derived).
 * Nothing in this module branches at composition time. RadialWipe's `direction` is the one
 * compile-time input in the category, and it is baked to the `mode` literal by the *shader*, then
 * passed in as a plain f32 — see {@link angularCoord}.
 *
 * CONVENTION NOTE (D-1): the coords here reproduce the aspect handling of the shaders they were
 * extracted from, which is not uniform. {@link radialCornerNormCoord} is center-scaled (canonical);
 * {@link angularCoord} scales the UV delta instead (RadialWipe's original). Unifying them is a
 * pixel-changing decision at non-square aspects and is deliberately NOT bundled with the
 * extraction.
 */
import {d, std, tgpu} from './index'
import {DEG_TO_RAD, TWO_PI} from './constants'
import {hash11, hash12, mxNoiseFloat2} from './noise'

// ── The reveal tail ───────────────────────────────────────────────────────────

/**
 * The wipe tail: a coverage coordinate → an alpha multiplier in [0,1].
 *
 * `coord` is the per-pixel threshold (0 = goes first, 1 = goes last). The front is remapped by
 * ±feather so that progress 0 leaves the frame fully visible and progress 1 clears it completely,
 * feather included — without the remap a feathered wipe never finishes at either end. `invert`
 * (>0 = on, the `transformBoolean` convention) flips the coordinate, not the progress, so the
 * feather stays on the same side of the front.
 */
export const revealMask = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)((coord, progress, feather, invert) => {
    'use gpu'
    const c = std.select(coord, 1.0 - coord, invert > 0.0)
    const f = std.max(feather, 0.0001)
    const front = progress * (1.0 + 2.0 * f) - f
    return std.smoothstep(front - f, front + f, c)
})

/**
 * Scale a STRAIGHT-alpha color's alpha by a reveal factor, RGB preserved — the pointwise
 * alpha-mask convention (no unpremultiply, no RTT). Pair with {@link revealMask}.
 */
export const applyReveal = tgpu.fn([d.vec4f, d.f32], d.vec4f)((color, reveal) => {
    'use gpu'
    return d.vec4f(color.x, color.y, color.z, color.w * reveal)
})

// ── Coverage coordinates ──────────────────────────────────────────────────────

/**
 * Directional coverage: 0→1 along `angleDeg`, aspect corrected so a diagonal reads as a true
 * angle and both extremes of the frame are reached exactly (the projection is normalized by its
 * own half-extent over the aspect-corrected unit square). Consumers: LinearWipe, BarnDoors,
 * RandomBars, VenetianBlinds.
 */
export const directionalCoord = tgpu.fn([d.vec2f, d.f32, d.f32], d.f32)((uv, aspect, angleDeg) => {
    'use gpu'
    const a = angleDeg * DEG_TO_RAD
    const dir = d.vec2f(std.cos(a), std.sin(a))
    const p = d.vec2f((uv.x - 0.5) * aspect, uv.y - 0.5)
    const grad = std.dot(p, dir)
    // Half-extent of `grad` over the aspect-corrected unit square → normalize into [0,1].
    const ext = 0.5 * (aspect * std.abs(dir.x) + std.abs(dir.y))
    return grad / (2.0 * ext) + 0.5
})

/**
 * Radial coverage: distance from `center`, normalized by the distance to the FARTHEST corner so
 * coverage 1 is reached at every pixel however off-center the origin is. `center` is
 * center-scaled (`center.x * aspect`, the canonical D-1 convention) and y-flipped (the
 * `transformPosition` convention shared with Vignette). Consumers: IrisWipe, RippleWipe.
 */
export const radialCornerNormCoord = tgpu.fn([d.vec2f, d.f32, d.vec2f], d.f32)((uv, aspect, center) => {
    'use gpu'
    const cx = center.x * aspect
    const cy = 1.0 - center.y
    const rel = d.vec2f(uv.x * aspect - cx, uv.y - cy)
    const dist = std.length(rel)
    // Farthest corner from the (aspect-space) center → normalize distance into [0,1].
    const dx = std.max(cx, aspect - cx)
    const dy = std.max(cy, 1.0 - cy)
    const maxDist = std.length(d.vec2f(dx, dy))
    return dist / std.max(maxDist, 0.0001)
})

/**
 * Angular (clock-sweep) coverage around `center`, measured from `startDeg`.
 *
 * `mode` is a runtime f32 carrying a compile-time choice the caller bakes as a literal:
 * 0 = clockwise, 1 = counter-clockwise, 2 = both (two wedges meeting on the far side, so the
 * folded distance is doubled back into [0,1]). Passing it as an f32 rather than branching in JS
 * keeps this a single fn; the caller owns the string→literal mapping (the PagePeel-`corner` trap:
 * a string prop must never be given a transform).
 *
 * Aspect handling here is UV-scaled (`(uv.x - center.x) * aspect`), matching RadialWipe as
 * written — see the convention note at the top of this file. Consumer: RadialWipe.
 */
export const angularCoord = tgpu.fn([d.vec2f, d.f32, d.vec2f, d.f32, d.f32], d.f32)(
    (uv, aspect, center, startDeg, mode) => {
        'use gpu'
        const rel = d.vec2f((uv.x - center.x) * aspect, uv.y - (1.0 - center.y))
        const ang = std.atan2(rel.y, rel.x)
        const start = startDeg * DEG_TO_RAD
        let frac = (ang - start) / TWO_PI
        frac = frac - std.floor(frac)
        // cw = frac; ccw = reversed; both = folded angular distance from start (doubled to [0,1]).
        const ccwCoord = 1.0 - frac
        const bothCoord = std.min(frac, 1.0 - frac) * 2.0
        let coord = std.select(frac, ccwCoord, mode > 0.5)
        coord = std.select(coord, bothCoord, mode > 1.5)
        return coord
    })

/** Result of {@link cellGrid}: integer cell index, in-cell position, and the grid resolution. */
export const CellGrid = d.struct({cell: d.vec2f, local: d.vec2f, grid: d.vec2f})

/**
 * Dice the frame into SQUARE-ISH cells `size` wide (as a fraction of frame width), returning the
 * integer `cell` index, the `local` position inside the cell (`fract`, so [0,1)), and the `grid`
 * resolution itself (callers that need a cell's normalized position divide by it).
 *
 * Cell height is corrected by aspect and floored at one row (`max(gridX / aspect, 1)`) so a wide
 * frame gets square cells and a tall one never degenerates to zero rows. Consumers: DiamondWipe,
 * CheckerWipe, BlockDissolve.
 */
export const cellGrid = tgpu.fn([d.vec2f, d.f32, d.f32], CellGrid)((uv, aspect, size) => {
    'use gpu'
    const gridX = 1.0 / std.max(size, 0.001)
    const gridY = std.max(gridX / aspect, 1.0)
    const sx = uv.x * gridX
    const sy = uv.y * gridY
    return CellGrid({
        cell: d.vec2f(std.floor(sx), std.floor(sy)),
        local: d.vec2f(std.fract(sx), std.fract(sy)),
        grid: d.vec2f(gridX, gridY),
    })
})

// ── Coverage modifiers ────────────────────────────────────────────────────────

/**
 * Fold a [0,1] coverage coordinate about its midpoint: 0 on the center line, 1 at both ends. Turns
 * a single sweeping front into two fronts opening outward (barn doors). Consumer: BarnDoors.
 */
export const foldAboutCenter = tgpu.fn([d.f32], d.f32)((t) => {
    'use gpu'
    return std.abs(t - 0.5) * 2.0
})

/**
 * Tile a [0,1] coverage coordinate into `count` repeats, returning the per-tile phase in [0,1) —
 * every tile then crosses the same front in lockstep (venetian blinds). Consumer: VenetianBlinds.
 */
export const tilePhase = tgpu.fn([d.f32, d.f32], d.f32)((t, count) => {
    'use gpu'
    return std.fract(t * count)
})

/**
 * Quantize a [0,1] coverage coordinate into `count` bands, each band's coverage being its own
 * midpoint — whole bands then vanish one after another in coordinate order (concentric ring pops
 * over a radial coord). `count` is floored at one band. Consumer: RippleWipe.
 */
export const bandMidpointCoord = tgpu.fn([d.f32, d.f32], d.f32)((t, count) => {
    'use gpu'
    const n = std.max(count, 1.0)
    return std.clamp((std.floor(t * n) + 0.5) / n, 0.0, 1.0)
})

/**
 * Quantize a [0,1] coverage coordinate into `count` bands and give each band a STABLE random
 * coverage from `hash11` of its index — no time dependence, so the shuffle is frozen
 * frame-to-frame and only progress moves it (the PowerPoint "Random Bars" ordering).
 * Consumer: RandomBars.
 */
export const bandShuffleCoord = tgpu.fn([d.f32, d.f32], d.f32)((t, count) => {
    'use gpu'
    const idx = std.floor(t * std.max(count, 1.0))
    return hash11(idx + 0.5)
})

/**
 * Diamond-lattice coverage over the {@link cellGrid}: each pixel's coverage is its L1 (diamond)
 * distance from the cell center — 0 at the center, 1 at the corners, where neighboring cells'
 * diamonds meet and tile the plane exactly, so coverage 1 is reached everywhere.
 * Consumer: DiamondWipe.
 */
export const cellDiamondCoord = tgpu.fn([d.vec2f, d.f32, d.f32], d.f32)((uv, aspect, size) => {
    'use gpu'
    const g = cellGrid(uv, aspect, size)
    return std.abs(g.local.x - 0.5) + std.abs(g.local.y - 0.5)
})

/**
 * Staggered checkerboard coverage over the {@link cellGrid}: each cell's coverage combines its
 * checkerboard parity with its normalized corner-to-corner position, so the even-parity cells
 * sweep away diagonally over the first half of coverage and the odd-parity cells over the second.
 * Consumer: CheckerWipe.
 */
export const cellCheckerCoord = tgpu.fn([d.vec2f, d.f32, d.f32], d.f32)((uv, aspect, size) => {
    'use gpu'
    const g = cellGrid(uv, aspect, size)
    // Checkerboard parity (0 or 1) — fract of half the cell-index sum.
    const parity = std.fract((g.cell.x + g.cell.y) * 0.5) * 2.0
    // Normalized corner-to-corner position of the cell in [0,1).
    const diag = (g.cell.x / g.grid.x + g.cell.y / g.grid.y) * 0.5
    return std.clamp(0.5 * parity + 0.5 * diag, 0.0, 1.0)
})

/**
 * Shuffled-cell coverage over the {@link cellGrid}: each cell gets a STABLE random coverage from
 * `hash12` of its integer index — no time dependence, so the dissolve order is frozen
 * frame-to-frame and only progress moves it. Consumer: BlockDissolve.
 */
export const cellShuffleCoord = tgpu.fn([d.vec2f, d.f32, d.f32], d.f32)((uv, aspect, size) => {
    'use gpu'
    return hash12(cellGrid(uv, aspect, size).cell)
})

/**
 * Organic noise coverage — the classic film-dissolve field: a STABLE 3-octave Perlin fbm (no time
 * dependence) recentred onto [0,1]; `seed` shifts the noise domain with different per-octave
 * offsets so the octaves decorrelate. The fbm sum (~[-1,1], extremes rare) maps to coverage via
 * `0.5 + n * 0.9`, clamped. Consumer: NoiseDissolve.
 */
export const fbmCoverageCoord = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32], d.f32)((uv, aspect, scale, seed) => {
    'use gpu'
    const p = d.vec2f(uv.x * aspect * scale + seed * 13.7, uv.y * scale + seed * 7.9)
    const n1 = mxNoiseFloat2(p)
    const n2 = mxNoiseFloat2(d.vec2f(p.x * 2.0 + 17.3 + seed * 3.1, p.y * 2.0 + 9.1)) * 0.5
    const n3 = mxNoiseFloat2(d.vec2f(p.x * 4.0 + 41.7, p.y * 4.0 + 27.9 + seed * 5.3)) * 0.25
    const n = (n1 + n2 + n3) / 1.75
    return std.clamp(0.5 + n * 0.9, 0.0, 1.0)
})

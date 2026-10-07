/**
 * Cell / tiling primitives — the domain layer that turns a continuous aspect-corrected UV into a
 * discrete lattice of cells, plus the per-cell randomness the pattern fleet shares.
 *
 * The framing that feeds these lives in {@link module:kit/geom}: aspect-correct the UV, optionally
 * rotate it about the canvas centre, scale by the cell count, and hand the result here.
 *
 * TWO HASH FAMILIES, DELIBERATELY NOT UNIFIED (D-6). {@link cellHash} and {@link rowSpeedHash} are
 * the legacy sin-fract hashes, preserved byte-identical so every shipped pattern keeps its exact
 * look. New shaders should use the bit-exact `noise.hash*` family instead. Do not "improve" the
 * ones here — a one-character change reshuffles every preset built on them.
 */
import {tgpu, d, std} from './index'
import {SQRT3} from './constants'
import {flooredMod2} from './geom'

// Module-scope const, folded to a WGSL literal by the transpiler. (`SQRT3` above is a NAMED import,
// which folds the same way; a member expression on an imported namespace would not.)
const TWO_OVER_SQRT3 = 2 / Math.sqrt(3)

// ── Square tiling ─────────────────────────────────────────────────────────────────────────────

/** One square cell: its integer index and the `[0,1)²` coordinate within it. */
export const CellTile = d.struct({
    /** Integer cell index — `floor(p)`. Stable per cell, so it is what you hash. */
    cell: d.vec2f,
    /** Position within the cell, `[0,1)²` — `fract(p)`. What you draw against. */
    local: d.vec2f,
}).$name('CellTile')

/**
 * Split a scaled UV into its square cell index and in-cell coordinate.
 *
 * Both halves come back because a pattern needs both: `local` draws the cell's content, `cell`
 * seeds its randomness. Splitting them at the call site is where sign bugs creep in — `fract` is
 * floored in WGSL and `floor` matches it, so this pair is consistent for negative coordinates
 * (which a rotation or an upstream distortion's `uvContext` will produce).
 */
export const squareTiling = tgpu.fn([d.vec2f], CellTile)((p) => {
    'use gpu'
    return CellTile({cell: std.floor(p), local: std.fract(p)})
})

// ── Hexagonal tiling ──────────────────────────────────────────────────────────────────────────

/** One hexagonal cell: the local vector from its centre, and the centre's own coordinate. */
export const HexCell = d.struct({
    /** Vector from the nearest hex centre to the sample point. Drives edge distance and face cuts. */
    gv: d.vec2f,
    /** The hex centre in lattice space (`p - gv`). Snap and round this to get a hashable index. */
    id: d.vec2f,
}).$name('HexCell')

/**
 * Hexagonal lattice lookup: find the nearest hex centre to `p` and return the local offset.
 *
 * The standard two-offset-grids trick — a hex lattice is two interleaved rectangular grids, so
 * folding `p` into both and keeping whichever candidate centre is nearer lands on the correct hex
 * without any branching. The fold uses {@link geom.flooredMod2} (not WGSL `%`, which is truncated)
 * so it stays periodic for negative coordinates.
 *
 * `s` is the lattice period and picks the ORIENTATION:
 *
 * - `vec2f(SQRT3, 1)` — pointy-top hexagons (flat sides left/right). HexGrid's honeycomb.
 * - `vec2f(1, SQRT3)` — the transpose, flat-top hexagons. What a rhombille / isometric-cube cut
 *   needs, because the three rhombus faces have to meet at a vertical vertex.
 *
 * Those two really are the same code with `s` transposed, which is why the orientation is a
 * parameter and not two functions.
 */
export const hexTiling = tgpu.fn([d.vec2f, d.vec2f], HexCell)((p, s) => {
    'use gpu'
    const sh = s.mul(0.5)
    const a = flooredMod2(p, s).sub(sh)
    const b = flooredMod2(p.sub(sh), s).sub(sh)
    const gv = std.select(b, a, std.dot(a, a) < std.dot(b, b))
    return HexCell({gv: gv, id: p.sub(gv)})
})

// ── Triangular tiling ─────────────────────────────────────────────────────────────────────────

/**
 * Skew an equilateral-triangle lattice onto a unit-square integer grid:
 * `M · p` where `M = [[1, -1/√3], [0, 2/√3]]`.
 *
 * Equilateral triangles are awkward to index directly; after this skew each unit square holds
 * exactly two triangles, split by the anti-diagonal, so `floor`/`fract` indexing works and the
 * anti-diagonal test (`fract.x + fract.y > 1`) picks which of the pair you are in.
 *
 * The result is a sheared space: distances in it are NOT the distances in the original lattice, so
 * take anti-aliasing footprints from this coordinate (which is what the derivative sees) and read
 * edge distances in it too, consistently.
 *
 * The X term divides by `SQRT3` rather than multiplying by a folded `1/√3`: the two differ in the
 * last bit, and the division is what the shipped lattice was authored against.
 */
export const triLattice = tgpu.fn([d.vec2f], d.vec2f)((p) => {
    'use gpu'
    return d.vec2f(p.x - p.y / SQRT3, p.y * TWO_OVER_SQRT3)
})

// ── Cell-centre sampling UVs (for `mapSampleUVs`) ──────────────────────────────────────────────

/**
 * Screen UV of the CENTRE of the cell containing `uv`, for a `cells`-per-shortest-edge lattice
 * (aspect-corrected, Y-flipped, guarded aspect).
 *
 * This is what a pattern generator returns from `mapSampleUVs` so that mapped props are sampled
 * once per cell rather than once per fragment. Without it, a mapped `thickness` or `dotSize` varies
 * *within* a cell, which clips the cell's content against the map source's boundaries instead of
 * transitioning whole cells — the difference between dots that grow and dots that get shaved.
 *
 * The round trip is deliberate: correct → snap → un-correct, so the returned value is a screen UV
 * the composer can sample a map texture with directly.
 *
 * See {@link cellCentreUVRotated} for the lattice-with-rotation form. There are two functions
 * rather than one with a rotation argument because a rotation of zero still costs a `cos`, a `sin`,
 * and a second un-rotate in the unrotated case.
 */
export const cellCentreUV = tgpu.fn([d.vec2f, d.vec2f, d.f32], d.vec2f)((uv, viewport, cells) => {
    'use gpu'
    const aspect = viewport.x / std.max(viewport.y, 1e-6)
    const correctedX = uv.x * aspect
    const correctedY = 1.0 - uv.y
    const cellCenterCorrectedX = (std.floor(correctedX * cells) + 0.5) / cells
    const cellCenterCorrectedY = (std.floor(correctedY * cells) + 0.5) / cells
    return d.vec2f(cellCenterCorrectedX / aspect, 1.0 - cellCenterCorrectedY)
})

/**
 * {@link cellCentreUV} for a lattice rotated by `rotationRad` about the canvas centre: correct +
 * flip, rotate, snap to the cell centre in rotated space, un-rotate, un-correct.
 *
 * The angle arrives in RADIANS — the caller converts, so the degrees-to-radians constant stays at
 * the shader's own module scope where the rest of its rotation math reads it.
 */
export const cellCentreUVRotated = tgpu.fn([d.vec2f, d.vec2f, d.f32, d.f32], d.vec2f)((uv, viewport, cells, rotationRad) => {
    'use gpu'
    const aspect = viewport.x / std.max(viewport.y, 1e-6)
    const correctedX = uv.x * aspect
    const correctedY = 1.0 - uv.y
    const cosR = std.cos(rotationRad)
    const sinR = std.sin(rotationRad)
    const centerX = aspect * 0.5
    const centerY = 0.5
    const cx = correctedX - centerX
    const cy = correctedY - centerY
    const rotX = cx * cosR - cy * sinR + centerX
    const rotY = cx * sinR + cy * cosR + centerY
    const cellRX = (std.floor(rotX * cells) + 0.5) / cells
    const cellRY = (std.floor(rotY * cells) + 0.5) / cells
    // Un-rotate the cell centre back to screen-corrected space.
    const ccx = cellRX - centerX
    const ccy = cellRY - centerY
    const unrotX = ccx * cosR + ccy * sinR + centerX
    const unrotY = ccx * -sinR + ccy * cosR + centerY
    return d.vec2f(unrotX / aspect, 1.0 - unrotY)
})

// ── Per-cell randomness (legacy hash family — D-6, do not change) ──────────────────────────────

/**
 * Per-cell pseudo-random scalar in `[0, 1)` from an integer cell index.
 *
 * The legacy fract-only chain (NO `sin` — unlike {@link rowSpeedHash} below), byte-identical across
 * the pattern fleet: scale the index by `(123.34, 345.45)` and take the fractional part, cross-couple
 * the two components through `q + dot(q, q + 34.345)`, then fract their product. It is not a good
 * hash — it has visible structure at large indices and is sensitive to float precision — but it is
 * the hash every shipped preset's cell randomness was authored against, so it is frozen (D-6).
 *
 * Hash INTEGER indices. Feeding a continuous coordinate produces sub-pixel jitter within a cell
 * instead of one value per cell; lattices whose centres fall on non-integers (hex, rhombille) must
 * `round` them onto integers first.
 *
 * New shaders: use `noise.hash*` instead.
 */
export const cellHash = tgpu.fn([d.vec2f], d.f32)((id) => {
    'use gpu'
    const q0 = std.fract(id.mul(d.vec2f(123.34, 345.45)))
    const q1 = q0.add(std.dot(q0, q0.add(34.345)))
    return std.fract(q1.x * q1.y)
})

/**
 * Per-ROW pseudo-random scalar in `[0, 1)` from a row index — the 1D member of the same legacy
 * family, and the one that genuinely is a sin-fract chain
 * (`fract(sin(row * 127.1) * 43758.5453)`), frozen for the same reason (D-6).
 *
 * Used to give each row of a pattern its own drift speed. Pass a floored row index.
 */
export const rowSpeedHash = tgpu.fn([d.f32], d.f32)((row) => {
    'use gpu'
    return std.fract(std.sin(row * 127.1) * 43758.5453)
})

/**
 * Turn a `[0,1)` row hash into a speed multiplier centred on 1: `1 + (hash - 0.5) * 4 * variance`.
 *
 * Centred on 1 so `variance = 0` leaves every row at the base speed, and scaled by 4 so a variance
 * of 1 spans `[-1, 3]` — wide enough that some rows reverse, which is what makes the motion read as
 * irregular rather than as a single sheared drift.
 */
export const rowSpeedMultiplier = tgpu.fn([d.f32, d.f32], d.f32)((rowHash, variance) => {
    'use gpu'
    return 1.0 + (rowHash - 0.5) * 4.0 * variance
})

/**
 * Turn a `[0,1)` cell hash into a brightness multiplier: `max(1 + (rand - 0.5) * 2 * variation, 0)`.
 *
 * Centred on 1 so `variation = 0` is exactly the unmodified color, spanning `[0, 2]` at full
 * variation (some cells doubled, some black). The `max(_, 0)` floor matters because the multiplier
 * is applied to a color: a negative factor would flip the sign of the RGB and, once blended,
 * produce colors that are not in the authored palette at all.
 */
export const variationFactor = tgpu.fn([d.f32, d.f32], d.f32)((rand, variation) => {
    'use gpu'
    return std.max(1.0 + (rand - 0.5) * 2.0 * variation, 0.0)
})

/**
 * Cellular (Worley / Voronoi) primitives — the 3×3 nearest-two-features fold and the reductions
 * built on top of it.
 *
 * WHAT IS SHARED AND WHAT IS NOT. Every cellular field in the library is the same three steps:
 * hash each of the 9 neighbouring cells to a feature point, keep the two smallest distances, then
 * reduce that pair to a scalar. Step 1 is byte-identical across consumers ({@link cellHash2}) and
 * step 2 is the same fold ({@link nearest2Cells}); step 3 is where the shaders genuinely diverge —
 * a mode-selected F1/F2 combination versus a normalized ratio plus an edge mask — so the
 * reductions ship as separate named fns rather than one over-parameterized switch.
 *
 * The per-tap distance and the jitter treatment stay OPTIONS on the fold rather than being unified,
 * because they are not pixel-equivalent between consumers: `length(delta)` and `sqrt(dxdx + dydy)`
 * are not guaranteed bit-identical, and `mix(0.5, p, jitter)` at `jitter = 1` is not guaranteed to
 * reproduce `p` exactly. Two options each covering two real behaviours is the honest cost of keeping
 * both consumers' looks. The drift PHASE constant was unified (one consumer's truncated `6.28` → the
 * full-precision TAU, a Gate C pixel change taken deliberately) because that one removed an option.
 *
 * HASH POLICY (D-6): {@link cellHash2} is the LEGACY sin-fract hash, kept byte-identical so the
 * existing cellular shaders keep their exact look. New shaders should prefer the bit-exact
 * `noise.hash*` family. Do not "improve" this one.
 */
import {tgpu, d, std} from './index'
import {TAU} from './constants'

/**
 * Cell coordinate → feature point in [0,1]², via the classic sin-fract hash
 * (`fract(sin(vec2(dot(p, k1), dot(p, k2))) · 43758.5453)`).
 *
 * GPU-only: `sin` at these argument magnitudes is driver-approximate and diverges from JS `Math.sin`,
 * so this cannot be golden-tested on the CPU.
 */
export const cellHash2 = tgpu.fn([d.vec2f], d.vec2f)((p) => {
    'use gpu'
    const h = d.vec2f(std.dot(p, d.vec2f(127.1, 311.7)), std.dot(p, d.vec2f(269.5, 183.3)))
    return std.fract(std.sin(h).mul(43758.5453))
})

// ─── nearest2Cells (builder) ──────────────────────────────────────────────────────────────────

/**
 * {@link nearest2Cells}'s options, as a discriminated union: only the two pairings the builder
 * actually implements are expressible. `distance` and `jitter` are NOT independent — pairing
 * `length` with `mix` (or `selectableSquared` with `none`) has no branch and would silently fall
 * through to the other form's emitted signature, so the type forbids it.
 *
 * - `{distance: 'length', jitter: 'none'}` — `length(delta)`, a true Euclidean distance per tap, and
 *   the drifted feature point clamped into the cell interior and used directly. The fold carries real
 *   distances, which is what a ratio reduction needs.
 * - `{distance: 'selectableSquared', jitter: 'mix'}` — computes Euclidean-SQUARED, Manhattan and
 *   Chebyshev and selects between them on a runtime `metric` argument (Euclidean stays squared
 *   through the fold; the sqrt is deferred to {@link cellReduceSelectable}), and lerps from the cell
 *   centre (0.5, 0.5) toward the clamped point by a runtime `jitter` argument, so 0 gives a rigid
 *   lattice and 1 full randomness. All three metric branches are always computed — see the note on
 *   branchlessness below.
 */
export type Nearest2Options =
    | {
        distance: 'length'
        jitter: 'none'
        /** Emitted WGSL identifier base. The option key is appended, so configs cannot collide. */
        name?: string
    }
    | {
        distance: 'selectableSquared'
        jitter: 'mix'
        /** Emitted WGSL identifier base. The option key is appended, so configs cannot collide. */
        name?: string
    }

/**
 * The 3×3 nearest-two-features fold, as a builder. Emits a `tgpu.fn` taking the SCALED cell-space
 * position and returning `vec2(d1, d2)` — the nearest and second-nearest feature distances (squared,
 * for `distance: 'selectableSquared'`).
 *
 * Emitted signature, by options:
 * - `{distance: 'length', jitter: 'none'}` → `(scaledUV: vec2f, animT: f32, seed: f32) → vec2f`
 * - `{distance: 'selectableSquared', jitter: 'mix'}` →
 *   `(scaledUV: vec2f, animT: f32, seed: f32, jitter: f32, metric: f32) → vec2f`
 *   (`metric`: 0 Euclidean-squared, 1 Manhattan, 2 Chebyshev)
 *
 * The feature points DRIFT: each is displaced by `sin/cos` of its own hash plus `animT` (the y axis
 * at 0.7× the rate, so the motion is not diagonal), then clamped away from the cell walls so a point
 * cannot cross into a neighbour and pop the topology. The phase constant is the full-precision TAU;
 * one consumer shipped a truncated `6.28` here and was corrected on adoption (Gate C).
 *
 * THE FOLD IS BRANCHLESS AND THAT IS DELIBERATE. `d2 = min(d2, max(dd, d1))` followed by
 * `d1 = min(d1, dd)` maintains the sorted pair without a conditional, because the d2 update reads
 * the PRE-update d1. It is exactly equivalent to the nested-select spelling — case `dd < d1` gives
 * `(d1, dd)`, case `dd ≥ d1` gives `(min(d2, dd), d1)` — and both spellings only ever SELECT
 * existing values, never arithmetic on them, so the choice is bit-neutral. The unified spelling is
 * why a consumer that only wants F1 can still use this fold: the extra d2 work leaves d1 untouched.
 *
 * Likewise `selectableSquared` computes all three metrics and selects, rather than JS-branching per
 * compile-time metric. That looks like waste but is not: the metric is a compile-time prop, so a
 * branch would recompile the pipeline on every change, and the dead arithmetic is a handful of ALU
 * ops the driver's dead-code pass largely removes. It is the FractalNoise "harmless waste" pattern.
 */
export function nearest2Cells(options: Nearest2Options): Nearest2Fn {
    const {distance, jitter, name = 'nearest2Cells'} = options
    const key = `${name}|${distance}|${jitter}`
    const cached = nearest2Cache.get(key)
    if (cached) return cached
    const suffix = `${distance === 'length' ? 'Len' : 'Sel'}${jitter === 'mix' ? 'Jit' : ''}`

    let built: Nearest2Fn
    if (distance === 'length' && jitter === 'none') {
        built = tgpu.fn([d.vec2f, d.f32, d.f32], d.vec2f)((scaledUV, animT, seed) => {
            'use gpu'
            const cell = std.floor(scaledUV)
            const localUV = std.fract(scaledUV)
            let d1 = d.f32(10.0)
            let d2 = d.f32(10.0)
            for (let ny = -1; ny <= 1; ny++) {
                for (let nx = -1; nx <= 1; nx++) {
                    const offset = d.vec2f(d.f32(nx), d.f32(ny))
                    const h = cellHash2(d.vec2f(cell.x + offset.x + seed, cell.y + offset.y + seed))
                    const pointX = std.clamp(h.x + std.sin(animT + h.x * TAU) * 0.15, 0.05, 0.95)
                    const pointY = std.clamp(h.y + std.cos(animT * 0.7 + h.y * TAU) * 0.15, 0.05, 0.95)
                    const dd = std.length(d.vec2f(localUV.x - (offset.x + pointX), localUV.y - (offset.y + pointY)))
                    // Branchless 2-nearest update — d2 reads the pre-update d1.
                    d2 = std.min(d2, std.max(dd, d1))
                    d1 = std.min(d1, dd)
                }
            }
            return d.vec2f(d1, d2)
        }).$name(`${name}${suffix}`) as unknown as Nearest2Fn
    } else {
        built = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32, d.f32], d.vec2f)(
            (scaledUV, animT, seed, jitterAmount, metric) => {
                'use gpu'
                const animTSlow = animT * 0.7
                const cell = std.floor(scaledUV)
                const localUV = std.fract(scaledUV)
                let d1 = d.f32(10.0)
                let d2 = d.f32(10.0)
                for (let ny = -1; ny <= 1; ny++) {
                    for (let nx = -1; nx <= 1; nx++) {
                        const offset = d.vec2f(d.f32(nx), d.f32(ny))
                        const h = cellHash2(d.vec2f(cell.x + offset.x + seed, cell.y + offset.y + seed))
                        const px = h.x + std.sin(animT + h.x * TAU) * 0.15
                        const py = h.y + std.cos(animTSlow + h.y * TAU) * 0.15
                        const jx = std.mix(0.5, std.clamp(px, 0.05, 0.95), jitterAmount)
                        const jy = std.mix(0.5, std.clamp(py, 0.05, 0.95), jitterAmount)
                        const deltaX = localUV.x - (offset.x + jx)
                        const deltaY = localUV.y - (offset.y + jy)

                        const dEuclid = deltaX * deltaX + deltaY * deltaY
                        const dManhattan = std.abs(deltaX) + std.abs(deltaY)
                        const dChebyshev = std.max(std.abs(deltaX), std.abs(deltaY))
                        let dd = dEuclid
                        dd = std.select(dd, dManhattan, metric === 1.0)
                        dd = std.select(dd, dChebyshev, metric === 2.0)

                        // Branchless 2-nearest update — d2 reads the pre-update d1.
                        d2 = std.min(d2, std.max(dd, d1))
                        d1 = std.min(d1, dd)
                    }
                }
                return d.vec2f(d1, d2)
            }).$name(`${name}${suffix}`) as unknown as Nearest2Fn
    }

    nearest2Cache.set(key, built)
    return built
}

/** {@link nearest2Cells}'s output. Trailing arguments exist only for the `selectableSquared` form. */
export type Nearest2Fn = (
    scaledUV: d.v2f, animT: number, seed: number, jitterAmount?: number, metric?: number,
) => d.v2f

const nearest2Cache = new Map<string, Nearest2Fn>()

// ─── Reductions ───────────────────────────────────────────────────────────────────────────────

/** Feature-combination modes for {@link cellReduceSelectable}, and the enum a `mode` prop maps to. */
export const CELL_MODES: Record<string, number> = {
    f1: 0,
    f2: 1,
    f2MinusF1: 2,
    f1PlusF2: 3,
    f1TimesF2: 4,
}

/** Distance metrics for `nearest2Cells({distance: 'selectableSquared'})`, and the prop enum. */
export const CELL_METRICS: Record<string, number> = {
    euclidean: 0,
    manhattan: 1,
    chebyshev: 2,
}

/**
 * Reduce a `(d1, d2)` pair to a scalar by {@link CELL_MODES} mode, taking the deferred Euclidean
 * square root when `metric` is 0.
 *
 * The sqrt lives HERE rather than in the fold so the fold can keep squared distances (one multiply
 * per tap instead of a sqrt), and taking it after the min-fold is exact: `sqrt` is monotonic and
 * correctly rounded, so `sqrt(min(a, b)) == min(sqrt a, sqrt b)`.
 *
 * `sd1`/`sd2` unify the squared and linear cases so every mode is one expression for both — e.g.
 * F1×F2 is `sd1·sd2`, which is `sqrt(d1·d2)`-equivalent for Euclidean and `d1·d2` otherwise.
 */
export const cellReduceSelectable = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)(
    (d1, d2, metric, mode) => {
        'use gpu'
        const isEuclid = metric === 0.0
        const sd1 = std.select(d1, std.sqrt(d1), isEuclid)
        const sd2 = std.select(d2, std.sqrt(d2), isEuclid)

        let raw = sd1                                    // f1
        raw = std.select(raw, sd2, mode === 1.0)         // f2
        raw = std.select(raw, sd2 - sd1, mode === 2.0)   // f2 − f1
        raw = std.select(raw, sd1 + sd2, mode === 3.0)   // f1 + f2
        raw = std.select(raw, sd1 * sd2, mode === 4.0)   // f1 × f2
        return raw
    })

/**
 * The scale-invariant cell gradient: `pow(clamp(2·d1 / (d1 + d2)), power)`.
 *
 * The `2·d1/(d1+d2)` ratio is the reason to compute d2 at all for a fill gradient — it maps 0 at a
 * feature point to 1 at a cell boundary REGARDLESS of cell size, where a raw F1 would make large
 * cells read darker than small ones. `power` shapes how much of the interior the far color claims.
 */
export const cellRatio = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((d1, d2, power) => {
    'use gpu'
    const safeSum = std.max(d1 + d2, 0.0001)
    const normalizedDist = std.clamp(d1 * 2.0 / safeSum, 0.0, 1.0)
    return std.clamp(std.pow(normalizedDist, power), 0.0, 1.0)
})

/**
 * The cell-boundary line mask: `smoothstep(0, softness, (d2 − d1) / (d1 + d2))`, 0 ON the boundary
 * and 1 in the interior.
 *
 * `(d2 − d1)` alone would give boundary lines whose apparent width scales with cell size; dividing
 * by the sum normalizes it, so `softness` reads as a constant line width across the field. Callers
 * that expose softness in cell units should pre-scale it by the cell count.
 */
export const cellEdgeMask = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((d1, d2, softness) => {
    'use gpu'
    const safeSum = std.max(d1 + d2, 0.0001)
    const edgeMetric = (d2 - d1) / safeSum
    return std.smoothstep(0.0, softness + 0.001, edgeMetric)
})

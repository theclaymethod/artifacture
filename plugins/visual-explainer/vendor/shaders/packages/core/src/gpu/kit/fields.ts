/**
 * Field primitives — the domain framings and the higher-order field combinators that the noise
 * generators share.
 *
 * TWO TIERS, deliberately separated (C2/C3):
 *
 *  - **Domain framings** ({@link aspectScaledDomain}, {@link pixelGridDomain},
 *    {@link timeAxisDomain}) are plain `tgpu.fn`s. They are the 3-line preamble that eight noise
 *    textures open with, and they are called from inside a `'use gpu'` body.
 *  - **Combinators** ({@link fbmGated}, {@link domainWarp2}) are JS-level BUILDERS. TGSL cannot
 *    take a function as an argument, so anything parameterized by a field function must emit a
 *    specialized `tgpu.fn` at composition time (C3). Both memoize per option-key and `$name` their
 *    output so two differently-configured instances in one tree cannot collide.
 *
 * The aspect divide here is GUARDED (`geom.aspectOf`, D-1). The eight shaders that adopted
 * {@link aspectScaledDomain} each divided raw before the migration, so each gained the NaN fix for
 * the single frame where a canvas reports zero height
 */
import {tgpu, d, std} from './index'
import {aspectOf} from './geom'
import {hash11, hash22, mxNoiseFloat3} from './noise'
import {GOLDEN, TAU} from './constants'

// ─── Domain framings ──────────────────────────────────────────────────────────────────────────

/**
 * The exponential-scale noise framing: aspect-correct the UV (x scaled, y left alone), scale by
 * `exp(scale)`, and offset by `seed`. Returns the sampling position for a 2D/3D noise field.
 *
 * `exp(scale)` rather than `scale` is what makes the UI slider feel linear — each +1 doubles-ish
 * the frequency — and it is why every noise texture's `scale` prop runs over a small signed range
 * (−2…5) rather than a cell count.
 *
 * `seed` is added to BOTH axes after scaling (not before), which is why changing the seed slides
 * the pattern rather than rescaling it.
 */
export const aspectScaledDomain = tgpu.fn([d.vec2f, d.vec2f, d.f32, d.f32], d.vec2f)(
    (uv, viewport, scale, seed) => {
        'use gpu'
        const aspect = aspectOf(viewport)
        const aspectUV = d.vec2f(uv.x * aspect, uv.y)
        return aspectUV.mul(std.exp(scale)).add(seed)
    })

/**
 * The per-pixel framing: floor the device-pixel position into `grain`-sized cells, offset by
 * `seed`. For patterns that are defined on the pixel grid rather than in UV space (blue noise,
 * ordered dither) — the `floor` is load-bearing, it is what makes the result piecewise-constant per
 * cell instead of resampling the hash continuously.
 *
 * `viewport` must be the EFFECTIVE viewport (`effectiveViewportSize ?? ctx.viewportSize`) so a
 * resize-fit box grains at its own pixel scale rather than the canvas's.
 */
export const pixelGridDomain = tgpu.fn([d.vec2f, d.vec2f, d.f32, d.f32], d.vec2f)(
    (uv, viewport, grain, seed) => {
        'use gpu'
        return std.floor(uv.mul(viewport).div(grain)).add(seed)
    })

/**
 * Lift a 2D position into 3D by walking the third axis with time: `vec3(pos.xy, t * rate)`.
 *
 * This is the difference between noise that MORPHS in place and noise that slides. Offsetting the
 * 2D position by time translates the pattern across the screen; walking a third axis of a 3D noise
 * evolves it without moving it, which is what every "…that morphs over time" generator wants.
 * `rate` scales the evolution independently of the node's `speed` prop.
 */
export const timeAxisDomain = tgpu.fn([d.vec2f, d.f32, d.f32], d.vec3f)((pos, t, rate) => {
    'use gpu'
    return d.vec3f(pos.x, pos.y, t * rate)
})

// ─── Builder cache identity ───────────────────────────────────────────────────────────────────

/**
 * A stable per-function id for the CAPTURED field function, so the builder caches below key on
 * WHICH field is being wrapped as well as on the options. Without it, two shaders passing different
 * field fns with identical options would collide and the second would silently get the first's
 * emitted fn. Identity, not name: `$name` is not unique and a field fn may be anonymous.
 */
const fieldFnIds = new WeakMap<object, number>()
let nextFieldFnId = 0

function fieldFnId(fieldFn: unknown): number {
    const keyable = fieldFn as object
    const existing = fieldFnIds.get(keyable)
    if (existing !== undefined) return existing
    const assigned = nextFieldFnId++
    fieldFnIds.set(keyable, assigned)
    return assigned
}

// ─── fbmGated (builder) ───────────────────────────────────────────────────────────────────────

/** Per-octave drift shape — see {@link fbmGated}. */
export type FbmDrift = 'goldenAngle' | 'timeSeed'

export interface FbmGatedOptions {
    /**
     * The fixed loop count. STRUCTURAL: it is baked into the emitted WGSL, so the octave slider's
     * MAXIMUM belongs here and its current value is a runtime gate (see the `octaveCount` argument).
     * Unrolling exactly the active count instead would recompile on every slider step.
     */
    maxOctaves: number
    /**
     * How successive octaves are decorrelated:
     * - `goldenAngle` — each octave's domain is offset by `animTime · (cos(i·GOLDEN), sin(i·GOLDEN))`.
     *   Incommensurate directions, so octaves interfere rather than translating together.
     * - `timeSeed` — each octave gets its own time and seed offset (`animTime + i·stride.x`,
     *   `seed + i·stride.y`), for field functions that animate internally.
     */
    drift: FbmDrift
    /** Per-octave (time, seed) stride for `drift: 'timeSeed'`. Folded to literals. */
    stride?: [number, number]
    /** Emitted WGSL identifier base. The option key is appended, so configs cannot collide. */
    name?: string
}

/**
 * The gated fractal-sum loop, as a builder: sum `maxOctaves` evaluations of `fieldFn` at
 * geometrically increasing frequency and decreasing amplitude, with octaves at or beyond a RUNTIME
 * `octaveCount` contributing exactly zero.
 *
 * Returns a `tgpu.fn` yielding `vec2(accumulated, totalWeight)` — NOT a normalized value. The
 * normalization tail is deliberately left to the caller because the consumers disagree about it
 * (one divides raw and remaps to [0,1]; the other guards the divide and applies a per-mode scale),
 * and folding those into an option record would have been four more flags for no shared code.
 *
 * The emitted signature depends on `drift`:
 *
 * - `goldenAngle`: `(base: vec2f, baseFreq, lacunarity, persistence, animTime, seedOffset: vec2f,
 *   octaveCount) → vec2f`, calling `fieldFn(coord: vec2f) → f32`.
 * - `timeSeed`: `(base: vec2f, baseFreq, lacunarity, persistence, animTime, seed, extra: vec3f,
 *   octaveCount) → vec2f`, calling `fieldFn(oUV, animT, seedOff, extra.x, extra.y, extra.z) → f32`.
 *   The `extra` vec3 is the C1 struct-over-scalars rule applied cheaply: field functions with their
 *   own parameters (jitter, metric, reduction) pass them through one bundle.
 *
 * NAMING CONSEQUENCE: the captured field function is emitted into WGSL under the BUILDER's local
 * identifier (`octaveField`), not its own name — a transpiled body registers its externals by the
 * identifier the source text uses. So a shader that passes `noise.mxNoiseFloat2` will see
 * `fn octaveField(p: vec2f)` in its WGSL. Harmless (the resolver uniquifies collisions), but it means
 * a snapshot diff over an fbm migration shows the field fn renamed as well as the loop moved.
 *
 * The active-octave gate is spelled per drift mode (`i32` compare for `goldenAngle`, `f32` compare
 * for `timeSeed`), matching what each consumer emitted before migration. The two spellings are
 * equivalent for integral counts.
 *
 * TRAP: the accumulator/weight/frequency locals are initialized from `d.f32(…)`, not bare literals
 * — an integer-valued literal initializer transpiles to i32 and truncates the whole sum.
 */
export function fbmGated(fieldFn: FbmField2, options: FbmGatedOptions & {drift: 'goldenAngle'}): FbmGoldenSumFn
export function fbmGated(fieldFn: FbmFieldParametric, options: FbmGatedOptions & {drift: 'timeSeed'}): FbmTimeSeedSumFn
export function fbmGated(
    fieldFn: FbmField2 | FbmFieldParametric, options: FbmGatedOptions,
): FbmGoldenSumFn | FbmTimeSeedSumFn {
    const {maxOctaves, drift, stride = [17, 31], name = 'fbmGated'} = options
    const key = `${fieldFnId(fieldFn)}|${name}|${maxOctaves}|${drift}|${stride[0]},${stride[1]}`
    const cached = fbmCache.get(key)
    if (cached) return cached

    const N = maxOctaves
    const TIME_STRIDE = stride[0]
    const SEED_STRIDE = stride[1]
    const suffix = `${drift === 'goldenAngle' ? 'Golden' : 'TimeSeed'}${N}`

    let built: FbmSumFn
    if (drift === 'goldenAngle') {
        const octaveField = fieldFn as FbmField2
        built = tgpu.fn(
            [d.vec2f, d.f32, d.f32, d.f32, d.f32, d.vec2f, d.f32], d.vec2f,
        )((base, baseFreq, lacunarity, persistence, animTime, seedOffset, octaveCount) => {
            'use gpu'
            const n = d.i32(octaveCount)
            let freq = baseFreq
            let weight = d.f32(1)
            let accumulated = d.f32(0)
            let totalWeight = d.f32(0)
            for (let i = 0; i < N; i++) {
                const fi = d.f32(i)
                // Incommensurate drift direction per octave → interference, not translation.
                const dirX = std.cos(fi * GOLDEN)
                const dirY = std.sin(fi * GOLDEN)
                const coord = d.vec2f(
                    base.x * freq + animTime * dirX + seedOffset.x,
                    base.y * freq + animTime * dirY + seedOffset.y,
                )
                const active = std.select(d.f32(0), d.f32(1), i < n)
                accumulated = accumulated + octaveField(coord) * weight * active
                totalWeight = totalWeight + weight * active
                freq = freq * lacunarity
                weight = weight * persistence
            }
            return d.vec2f(accumulated, totalWeight)
        }).$name(`${name}${suffix}`) as unknown as FbmSumFn
    } else {
        const octaveField = fieldFn as FbmFieldParametric
        built = tgpu.fn(
            [d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32, d.vec3f, d.f32], d.vec2f,
        )((base, baseFreq, lacunarity, persistence, animTime, seed, extra, octaveCount) => {
            'use gpu'
            let freq = baseFreq
            let amp = d.f32(1)
            let accumulated = d.f32(0)
            let totalWeight = d.f32(0)
            for (let o = 0; o < N; o++) {
                const fo = d.f32(o)
                const active = std.select(d.f32(0), d.f32(1), fo < octaveCount)
                const oUV = d.vec2f(base.x * freq, base.y * freq)
                // Per-octave time/seed offsets prevent identical animation across octaves.
                const animT = animTime + fo * TIME_STRIDE
                const seedOff = seed + fo * SEED_STRIDE
                const raw = octaveField(oUV, animT, seedOff, extra.x, extra.y, extra.z)
                accumulated = accumulated + raw * amp * active
                totalWeight = totalWeight + amp * active
                amp = amp * persistence
                freq = freq * lacunarity
            }
            return d.vec2f(accumulated, totalWeight)
        }).$name(`${name}${suffix}`) as unknown as FbmSumFn
    }

    fbmCache.set(key, built)
    return built
}

/** A field function of one 2D position, for `drift: 'goldenAngle'`. */
export type FbmField2 = (coord: d.v2f) => number
/** A field function with its own time/seed/parameter arguments, for `drift: 'timeSeed'`. */
export type FbmFieldParametric = (
    oUV: d.v2f, animT: number, seedOff: number, a: number, b: number, c: number,
) => number
/** `drift: 'goldenAngle'` output — callable from a body, returning `vec2(accumulated, totalWeight)`. */
export type FbmGoldenSumFn = (
    base: d.v2f, baseFreq: number, lacunarity: number, persistence: number,
    animTime: number, seedOffset: d.v2f, octaveCount: number,
) => d.v2f
/** `drift: 'timeSeed'` output — callable from a body, returning `vec2(accumulated, totalWeight)`. */
export type FbmTimeSeedSumFn = (
    base: d.v2f, baseFreq: number, lacunarity: number, persistence: number,
    animTime: number, seed: number, extra: d.v3f, octaveCount: number,
) => d.v2f

type FbmSumFn = FbmGoldenSumFn | FbmTimeSeedSumFn

const fbmCache = new Map<string, FbmSumFn>()

// ─── domainWarp2 (builder) ────────────────────────────────────────────────────────────────────

export interface DomainWarp2Options {
    /**
     * The four 3D offsets that decorrelate the warp samples — two per level, one per displacement
     * component — applied as `pos + offset`. Defaults to the canonical Inigo-Quilez set (as used by
     * Plasma).
     *
     * WHICH COMPONENTS TIME-SCALE IS FIXED PER SLOT, not inferred from the values. `q[0]` is the only
     * entry whose x and y are time RATES (emitted as `vec3f(t·x, t·y, z)`, so its third component is
     * a plain spatial z); `q[1]`, `r[0]` and `r[1]` all take x/y as plain spatial offsets and their
     * third component as a time rate (`vec3f(x, y, t·z)`). Changing a slot's layout means editing the
     * builder body, not the table.
     */
    offsets?: {
        /** Level 1: `q[0]` is `[xTimeRate, yTimeRate, z]`; `q[1]` is `[x, y, zTimeRate]`. */
        q: [[number, number, number], [number, number, number]]
        /** Level 2: both entries are `[x, y, zTimeRate]`. */
        r: [[number, number, number], [number, number, number]]
    }
    /** Emitted WGSL identifier base. */
    name?: string
}

const IQ_WARP_OFFSETS: NonNullable<DomainWarp2Options['offsets']> = {
    // Level 1: the first sample drifts in x/y over time, the second is a fixed spatial offset with
    // a drifting z. (Plasma's original literals: (t·0.3, −t·0.2, 0) and (5.2, 1.3, t·0.25).)
    q: [[0.3, -0.2, 0], [5.2, 1.3, 0.25]],
    r: [[1.7, 9.2, 0.15], [8.3, 2.8, 0.13]],
}

/**
 * Two-level Inigo-Quilez domain warping over a 3D field function: sample the field twice to build a
 * 2D displacement, displace the sampling position, do it again from the displaced position, then
 * return the position to sample the field at for the final value.
 *
 * Both levels displace the ORIGINAL position (`pos + d`), not the previous level's — level 2 only
 * uses the level-1 result to decide WHERE to take its displacement samples. That is what keeps the
 * warp from compounding into mush at high `warpAmount`.
 *
 * The emitted signature is `(pos: vec3f, t: f32, warpAmount: f32) → vec3f`: the final sampling
 * position, so the caller owns the last field evaluation and any remap of it.
 *
 * Which offset components are multiplied by `t` is fixed per slot rather than inferred from the
 * values — see {@link DomainWarp2Options.offsets} and {@link IQ_WARP_OFFSETS}.
 */
export function domainWarp2(fieldFn: Warp3Field, options: DomainWarp2Options = {}): Warp3Fn {
    const {offsets = IQ_WARP_OFFSETS, name = 'domainWarp2'} = options
    const key = `${fieldFnId(fieldFn)}|${name}|${JSON.stringify(offsets)}`
    const cached = warpCache.get(key)
    if (cached) return cached

    const warpField = fieldFn
    const [QX, QY, QZ] = offsets.q[0]
    const [Q2X, Q2Y, Q2Z] = offsets.q[1]
    const [RX, RY, RZ] = offsets.r[0]
    const [R2X, R2Y, R2Z] = offsets.r[1]

    const built = tgpu.fn([d.vec3f, d.f32, d.f32], d.vec3f)((pos, t, warpAmount) => {
        'use gpu'
        // Level 1: two decorrelated samples → a 2D displacement.
        const qx = warpField(pos.add(d.vec3f(t * QX, t * QY, QZ)))
        const qy = warpField(pos.add(d.vec3f(Q2X, Q2Y, t * Q2Z)))
        const warped1 = pos.add(d.vec3f(qx, qy, 0.0).mul(warpAmount))

        // Level 2: sample from the warped position, but displace the ORIGINAL position.
        const rx = warpField(warped1.add(d.vec3f(RX, RY, t * RZ)))
        const ry = warpField(warped1.add(d.vec3f(R2X, R2Y, t * R2Z)))
        return pos.add(d.vec3f(rx, ry, 0.0).mul(warpAmount))
    }).$name(name) as unknown as Warp3Fn

    warpCache.set(key, built)
    return built
}

/**
 * Single-level Inigo-Quilez domain warp — the first level of {@link domainWarp2} on its own (two
 * field reads instead of four). The mobile tier for warped recipes: half the noise cost, the same
 * organic displacement family with shallower folds. Same slot layout and default offsets as level 1
 * of the two-level warp, so a recipe can switch levels at build time without touching its look data.
 */
export function domainWarp1(fieldFn: Warp3Field, options: DomainWarp2Options = {}): Warp3Fn {
    const {offsets = IQ_WARP_OFFSETS, name = 'domainWarp1'} = options
    const key = `1|${fieldFnId(fieldFn)}|${name}|${JSON.stringify(offsets)}`
    const cached = warpCache.get(key)
    if (cached) return cached

    const warpField = fieldFn
    const [QX, QY, QZ] = offsets.q[0]
    const [Q2X, Q2Y, Q2Z] = offsets.q[1]

    const built = tgpu.fn([d.vec3f, d.f32, d.f32], d.vec3f)((pos, t, warpAmount) => {
        'use gpu'
        const qx = warpField(pos.add(d.vec3f(t * QX, t * QY, QZ)))
        const qy = warpField(pos.add(d.vec3f(Q2X, Q2Y, t * Q2Z)))
        return pos.add(d.vec3f(qx, qy, 0.0).mul(warpAmount))
    }).$name(name) as unknown as Warp3Fn

    warpCache.set(key, built)
    return built
}

/** A 3D scalar field function (`mxNoiseFloat3`, `perlin13`, …). */
export type Warp3Field = (p: d.v3f) => number
/** {@link domainWarp2}'s output: `(pos, t, warpAmount) → final sampling position`. */
export type Warp3Fn = (pos: d.v3f, t: number, warpAmount: number) => d.v3f

const warpCache = new Map<string, Warp3Fn>()

// ─── Coverage masks (std vocabulary bodies) ───────────────────────────────────────────────────

/**
 * Radial falloff coverage mask — the GPU body behind std's `radialMask` noun (Vignette's
 * lattice-free radial field). Aspect-corrected so the falloff is circular, not oval. `center`
 * takes the transformPosition STORED value `(x, 1 - y)`; the `1.0 - center.y` here recovers the
 * authored y (the standard center double-flip). Returns 0 inside `radius` (clear) rising to 1 at
 * `radius + falloff` (full coverage). Pure — CPU-executable as a DualFn for golden tests.
 */
export const radialFalloffMask = tgpu.fn([d.vec2f, d.f32, d.vec2f, d.f32, d.f32], d.f32)(
    (uv, aspect, center, radius, falloff) => {
        'use gpu'
        const aspectUV = d.vec2f(uv.x * aspect, uv.y)
        const centerPos = d.vec2f(center.x * aspect, 1.0 - center.y)
        const dist = std.length(aspectUV.sub(centerPos))
        return std.smoothstep(radius, radius + falloff, dist)
    })

// ─── Organic scatter + scatter field (std vocabulary bodies) ───────────────────────────────────

// The scatter's feel constants — evenly-spread golden-angle spiral, gentle Lissajous drift.
// These ARE the word's behavior (an "organic constellation"), not a look's: a consumer wanting a
// different feel grows knobs here, under pressure, never by forking the body.
const SCATTER_DRIFT_RATE = 0.11
// Golden-ratio conjugate — the low-discrepancy shuffle step for per-point unit values.
const GOLDEN_CONJ = 0.6180339887
// Fixed loop bound — `count` gates iterations at runtime (identical WGSL for every count).
const SCATTER_MAX = 8

/**
 * One point of an organically scattered, gently drifting constellation, in aspect-corrected UV
 * space ([0, aspect] × [0, 1]). Golden-angle spiral scatter (even coverage, no clumping) + hashed
 * jitter + a slow per-point Lissajous drift. Every hash input carries an irrational additive
 * offset so seed=0 / fi=0 never feeds hash(0).
 */
export const spiralScatter = tgpu.fn([d.f32, d.f32, d.f32, d.f32, d.f32, d.f32], d.vec2f)(
    (fi, count, seed, drift, aspect, animTime) => {
        'use gpu'
        // Spiral scatter: golden-angle steps, seed rotates the whole constellation.
        const theta = fi * GOLDEN + hash11(seed * 0.7311 + 1.618) * TAU
        const r = std.sqrt((fi + 0.5) / count)
        // Per-point position jitter (±0.13) breaks the spiral's regularity.
        const j = hash22(d.vec2f(fi * 3.77 + 0.917, seed * 1.093 + 2.236)).sub(0.5).mul(0.26)
        // Lissajous drift: hashed phases + per-point rate in [0.5, 1.2]; the 1.37 detune keeps the
        // orbit from closing.
        const ph = hash22(d.vec2f(fi * 7.13 + 1.618, seed * 0.531 + 3.71)).mul(TAU)
        const w1 = 0.5 + hash11(fi * 5.417 + seed * 0.291 + 0.917) * 0.7
        const dx = std.sin(animTime * SCATTER_DRIFT_RATE * w1 + ph.x)
        const dy = std.cos(animTime * SCATTER_DRIFT_RATE * w1 * 1.37 + ph.y)
        // Spread radius 0.62 about the frame centre; drift amplitude 0.16 max keeps points near it.
        const nx = std.cos(theta) * r * 0.62 + j.x + dx * drift * 0.16
        const ny = std.sin(theta) * r * 0.62 + j.y + dy * drift * 0.16
        return d.vec2f((0.5 + nx) * aspect, 0.5 + ny)
    })

/**
 * A smooth scalar field from a scattered constellation: each {@link spiralScatter} point carries a
 * golden-ratio low-discrepancy unit value (evenly spread over [0,1], spatially decorrelated from
 * the spiral — some neighbours sit close in value, some far), and the query blends them by
 * inverse distance raised to `power`. The mesh-gradient genre primitive. Fixed-8 loop,
 * runtime-gated by `count` — a disabled point contributes exactly 0; accumulators init from
 * d.f32 (integer-valued literal → i32 trap).
 */
/**
 * {@link scatterField} with the constellation supplied instead of recomputed: `anchors` holds the
 * 8 {@link spiralScatter} positions packed 4-per-vec4 (`[i >> 1].xy` for even i, `.zw` for odd —
 * a uniform array needs a 16-byte stride, so array<vec2f> is not an option). The anchors depend only
 * on count/seed/drift/aspect/time — none of which vary per pixel — so a consumer computes them ONCE
 * per frame on the CPU (`utilities/scatterAnchors.ts`, the bit-for-bit mirror of spiralScatter)
 * and writes them through an extraFields array. Per pixel this removes 8 × (4 hashes + 4 trig +
 * sqrt) of pixel-invariant work; the blend itself is unchanged, and the per-point unit value
 * `ti` is the same golden-ratio sequence as before (its seed hash is hoisted out of the loop —
 * it never depended on i).
 */
export const scatterFieldAnchored = tgpu.fn(
    [d.vec2f, d.f32, d.f32, d.arrayOf(d.vec4f, SCATTER_MAX / 2), d.f32], d.f32)(
    (q, count, seed, anchors, power) => {
        'use gpu'
        let num = d.f32(0)
        let den = d.f32(0)
        const seedShuffle = hash11(seed * 0.531 + 0.77)
        for (let i = 0; i < SCATTER_MAX; i++) {
            const fi = d.f32(i)
            const active = std.select(d.f32(0), d.f32(1), fi < count - 0.5)
            const pair = anchors[i / 2]
            const anchor = std.select(pair.xy, pair.zw, (i & 1) === 1)
            const dist = std.max(std.length(q.sub(anchor)), 0.01)
            const w = active / std.pow(dist, power)
            const ti = std.fract(fi * GOLDEN_CONJ + seedShuffle)
            num = num + w * ti
            den = den + w
        }
        return num / std.max(den, 0.000001)
    })

export const scatterField = tgpu.fn(
    [d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32], d.f32)(
    (q, count, seed, drift, aspect, animTime, power) => {
        'use gpu'
        let num = d.f32(0)
        let den = d.f32(0)
        for (let i = 0; i < SCATTER_MAX; i++) {
            const fi = d.f32(i)
            const active = std.select(d.f32(0), d.f32(1), fi < count - 0.5)
            const anchor = spiralScatter(fi, count, seed, drift, aspect, animTime)
            // Floor (not epsilon-add) keeps the far field exact while bounding the near-point
            // weight: pow(0.01, 16) = 1e-32 stays f32-normal, so w tops out at 1e32 — no Inf/NaN
            // at point centers even at the max exponent.
            const dist = std.max(std.length(q.sub(anchor)), 0.01)
            const w = active / std.pow(dist, power)
            const ti = std.fract(fi * GOLDEN_CONJ + hash11(seed * 0.531 + 0.77))
            num = num + w * ti
            den = den + w
        }
        return num / std.max(den, 0.000001)
    })

/**
 * One Inigo-Quilez domain-warp level over a CHAINED position (2 noise reads): displaces `pos` by
 * two decorrelated MaterialX noise samples and returns `vec4(warpedX, warpedY, nx, ny)` — the
 * samples ride along for tail stages (edge hardness, blend factors, surface light). `k` and
 * `strength` stay separate args so the displacement keeps the left-assoc `n · k · strength`
 * rounding.
 *
 * [B] Gate-C candidate vs {@link domainWarp2}: the offset literals overlap the canonical set,
 * but this level displaces the CHAINED position (level 2 reads level 1's output) where
 * domainWarp2 offsets the original — a drop-in swap is pixel-breaking. Gate C decides whether
 * chained consumers adopt domainWarp2 or domainWarp2 grows a `chained` mode.
 */
export const chainedWarpStep = tgpu.fn(
    [d.vec2f, d.f32, d.f32, d.vec2f, d.vec2f, d.f32, d.f32], d.vec4f,
)((pos, scale, z, offA, offB, k, strength) => {
    'use gpu'
    const wp = d.vec3f(pos.x * scale, pos.y * scale, z)
    const nx = mxNoiseFloat3(wp.add(d.vec3f(offA.x, offA.y, 0.0)))
    const ny = mxNoiseFloat3(wp.add(d.vec3f(offB.x, offB.y, 0.0)))
    return d.vec4f(pos.x + nx * k * strength, pos.y + ny * k * strength, nx, ny)
})

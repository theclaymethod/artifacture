/**
 * Brush / stamp primitives shared by the simulation shaders (fluids, particle fields, flow grids).
 *
 * Every sim that lets the cursor push a field does it the same way: a Gaussian weight around the
 * stamp centre, evaluated per cell, used to blend or add into the field. The maths was copy-pasted
 * across ten-odd shaders, which is how PixelThrow ended up with the only edge-corrected version.
 *
 * Lives in `scaffolds/` rather than `kit/` for file-ownership reasons during the primitives refactor
 * (see `scaffolds/shared.ts` for the same note). It is pure TGSL and belongs in the kit long-term.
 */
import {tgpu, d, std} from '../kit'

/**
 * `exp(-1)` and its edge-normalizing reciprocal. A raw Gaussian truncated at the brush radius still
 * carries 1/e (~37%) of its peak at the cut, and a cell lattice renders that step as a visible
 * staircase ring around the brush. Subtracting the edge value and renormalizing makes the falloff
 * reach exactly zero at `dist == radius`.
 *
 * This pair is the 1σ case — the brush is truncated at the radius it is scaled by. A consumer that
 * truncates further out (CursorRipples and CursorTrail cut at 3σ) needs the edge value at ITS cutoff,
 * which is what {@link gaussianBrushShiftedSqFn}'s `cutoffSigmas` supplies.
 */
const EDGE = Math.exp(-1)
const INV_EDGE = 1 / (1 - EDGE)

/**
 * Plain Gaussian brush weight from a PRE-SQUARED distance and radius: `exp(-distSq / radiusSq)`.
 *
 * Peaks at 1 in the centre and never reaches zero — cells outside the nominal radius still receive
 * ~37% and below. This is what the fluid splats shipped with before the edge-shifted form existed;
 * it stays available because a few consumers deliberately want the long tail.
 *
 * `radiusSq` must already be guarded (`max(r*r, eps)`) by the caller — the grid-space consumers
 * clamp to one cell (`max(r*r, 1.0)`), which is a different floor than a UV-space consumer wants.
 */
export const gaussianBrushSq = tgpu.fn([d.f32, d.f32], d.f32)((distSq, radiusSq) => {
    'use gpu'
    return std.exp((distSq / radiusSq) * -1.0)
})

/**
 * Edge-shifted Gaussian brush weight: `(exp(-distSq/radiusSq) - e⁻¹) / (1 - e⁻¹)`, clamped to
 * [0, 1].
 *
 * Still exactly 1 at the centre, but falls to exactly 0 at `distSq == radiusSq` and is clamped flat
 * beyond it — no truncation step, no staircase. PixelThrow's CPU sim has had this since it shipped;
 * D-8 propagates it to the GPU brush sites.
 */
export const gaussianBrushShiftedSq = tgpu.fn([d.f32, d.f32], d.f32)((distSq, radiusSq) => {
    'use gpu'
    return std.clamp((std.exp((distSq / radiusSq) * -1.0) - EDGE) * INV_EDGE, d.f32(0), d.f32(1))
})

/** Vector form of {@link gaussianBrushSq} — takes the cell and brush centres. */
export const gaussianBrushRaw = tgpu.fn([d.vec2f, d.vec2f, d.f32], d.f32)((cellPos, center, radiusSq) => {
    'use gpu'
    const off = std.sub(cellPos, center)
    return gaussianBrushSq(std.dot(off, off), radiusSq)
})

/** Vector form of {@link gaussianBrushShiftedSq} — takes the cell and brush centres. */
export const gaussianBrushShifted = tgpu.fn([d.vec2f, d.vec2f, d.f32], d.f32)((cellPos, center, radiusSq) => {
    'use gpu'
    const off = std.sub(cellPos, center)
    return gaussianBrushShiftedSq(std.dot(off, off), radiusSq)
})

const shiftedSqCache = new Map<number, typeof gaussianBrushShiftedSq>()
const shiftedCache = new Map<number, typeof gaussianBrushShifted>()

/** A cutoff of `1` is the module-scope pair, so an unqualified consumer keeps byte-identical WGSL. */
const DEFAULT_CUTOFF_SIGMAS = 1

/** `gaussianBrushShiftedSq*`'s WGSL name for a cutoff — part of the emitted ABI, so memoised (C3). */
function shiftedName(base: string, cutoffSigmas: number): string {
    return `${base}${String(cutoffSigmas).replace(/[^0-9A-Za-z]/g, '_')}`
}

/**
 * The edge-shifted brush at a given TRUNCATION RADIUS, expressed in sigmas.
 *
 * `radiusSq` is always σ² — the Gaussian's own scale. `cutoffSigmas` is how far out the CALLER stops
 * evaluating, and it sets the edge constant to `exp(-cutoffSigmas²)` so the falloff reaches exactly
 * zero there and nowhere else. Get it wrong and the brush changes width, not just its edge: passing
 * a 3σ consumer the 1σ constant rescales the whole profile.
 *
 * Memoised per cutoff, and `$name`d per cutoff so two differently-truncated brushes in one tree do
 * not collide on a WGSL identifier.
 */
export function gaussianBrushShiftedSqFn(cutoffSigmas: number = DEFAULT_CUTOFF_SIGMAS) {
    if (cutoffSigmas === DEFAULT_CUTOFF_SIGMAS) return gaussianBrushShiftedSq
    const hit = shiftedSqCache.get(cutoffSigmas)
    if (hit) return hit
    const edge = Math.exp(-(cutoffSigmas * cutoffSigmas))
    const invEdge = 1 / (1 - edge)
    const built = tgpu.fn([d.f32, d.f32], d.f32)((distSq, radiusSq) => {
        'use gpu'
        return std.clamp((std.exp((distSq / radiusSq) * -1.0) - edge) * invEdge, d.f32(0), d.f32(1))
    }).$name(shiftedName('gaussianBrushShiftedSq', cutoffSigmas))
    shiftedSqCache.set(cutoffSigmas, built)
    return built
}

/** Vector form of {@link gaussianBrushShiftedSqFn} — takes the cell and brush centres. */
export function gaussianBrushShiftedFn(cutoffSigmas: number = DEFAULT_CUTOFF_SIGMAS) {
    if (cutoffSigmas === DEFAULT_CUTOFF_SIGMAS) return gaussianBrushShifted
    const hit = shiftedCache.get(cutoffSigmas)
    if (hit) return hit
    const inner = gaussianBrushShiftedSqFn(cutoffSigmas)
    const built = tgpu.fn([d.vec2f, d.vec2f, d.f32], d.f32)((cellPos, center, radiusSq) => {
        'use gpu'
        const off = std.sub(cellPos, center)
        return inner(std.dot(off, off), radiusSq)
    }).$name(shiftedName('gaussianBrushShifted', cutoffSigmas))
    shiftedCache.set(cutoffSigmas, built)
    return built
}

/** Which falloff a consumer wants. `edgeShift` is the corrected form and the recommended default. */
export interface GaussianBrushOptions {
    edgeShift: boolean
    /**
     * Truncation radius in sigmas — where the caller stops evaluating the brush. Default 1 (the
     * fluid/PixelThrow case: cut at the radius the Gaussian is scaled by). Ignored when
     * `edgeShift` is false, since an unshifted brush has no edge constant.
     */
    cutoffSigmas?: number
}

/**
 * Pick the squared-distance brush fn for an option record — the form the fluid splat kernels use,
 * since they have already computed `dx`/`dy` for the spread/perpendicular maths and would otherwise
 * subtract twice.
 *
 * Structural (C5): `edgeShift` is read at composition time, so it costs nothing on the GPU.
 */
export function gaussianBrushFnSq(opts: GaussianBrushOptions) {
    return opts.edgeShift ? gaussianBrushShiftedSqFn(opts.cutoffSigmas) : gaussianBrushSq
}

/** Pick the vector-form brush fn for an option record. See {@link gaussianBrushFnSq}. */
export function gaussianBrushFn(opts: GaussianBrushOptions) {
    return opts.edgeShift ? gaussianBrushShiftedFn(opts.cutoffSigmas) : gaussianBrushRaw
}

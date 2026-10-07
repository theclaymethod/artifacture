/**
 * `uvRemapShader` — the definition-level scaffold for RTT distortions with an analytic fast path.
 *
 * ## The problem it solves
 *
 * A distortion is, mathematically, ONE function: screen UV → source UV. But the renderer asks for
 * it twice, through two different hooks:
 *
 * - `fragment` — the RTT filter path, taken whenever the node is not fold-eligible (it carries a
 *   mask, a non-normal blend, opacity < 1, a transform, or a composite child). Rasterize the child
 *   to a texture, sample it at the mapped coordinate, unpremultiply.
 * - `uvRemap` — the analytic fast path. Return the mapped COORDINATE (plus a coverage mask) and the
 *   composer folds it into a combined UV, sampling the content beneath exactly once. No RTT pass.
 *
 * Sixteen shaders hand-wrote both hooks, which means sixteen chances for the two to drift apart —
 * the single biggest structural liability the primitives review found. This scaffold takes the map
 * once and emits both hooks from it, so agreement is structural rather than maintained.
 *
 * ## What it emits
 *
 * Byte-for-byte the shape every distortion writes today (Gate A):
 *
 *     fragment: guard → convertToTexture → map → edges.sampleRemappedExpr → unpremultiplyAlpha
 *     uvRemap:  map → edges.composeEdgeRemapExpr
 *
 * ## Where the design departs from the plan sketch
 *
 * The plan proposed a separate `coverage: (uv, aspect) => Expr` alongside `map`. Reality vetoed it:
 * CornerPin's coverage (`front`) and its mapped coordinate come out of ONE `cornerPinSample` call
 * as members of a packed `vec3f`. Two independent closures would emit that call twice and double
 * the homography cost. So `map` may return `{uv, coverage}` instead of a bare `Expr` — one call,
 * both outputs. See `UvMapResult`.
 *
 * `intensityBlend` likewise became a map COMBINATOR (`lerpToIdentity`) rather than an option, which
 * keeps the option bag small and makes the composition visible at the call site.
 */
import type {Expr, GpuFragmentParams, GpuShaderDefinition, KitTexture, GpuStorageBuffer} from '../contract'
import {call, mixExpr, vec4, ZERO} from '../composer'
import {edges, blend} from '../kit'

// ═══════════════════════════════════════════════════════════════════════════════════════
// The UvMap contract
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * A map that also produces coverage. `coverage` is a 0..1 scalar Expr: it multiplies sampled ALPHA
 * on the fragment path and the coverage MASK on the uvRemap path — the two spellings of the same
 * thing. Return this form (rather than a bare `Expr`) when the coordinate and the coverage come out
 * of one shared computation, which is the only reason the form exists.
 */
export interface UvMapResult {
    uv: Expr
    coverage?: Expr
}

/** What a `map` may return: just the coordinate, or the coordinate plus coverage. */
export type UvMapped = Expr | UvMapResult

/**
 * The parameters both hooks share. Deliberately the INTERSECTION of `GpuFragmentParams` and the
 * `uvRemap` ctx, so a map factory written against it cannot accidentally reach for something only
 * one hook has (`ctx.uv` differs between them — that is why the coordinate arrives as an argument
 * to `map` rather than being read off the params).
 *
 * `props` + `uniforms` are exactly what `animatedTime(params)` needs, so an animated distortion
 * calls it inside its factory and the accumulated-time Expr lands in both hooks.
 */
export interface UvRemapHookParams {
    props: Expr
    uniforms: Record<string, Expr>
    propValues: Record<string, unknown>
    computeOutputs?: Record<string, KitTexture | GpuStorageBuffer>
}

/**
 * The one definition that drives both hooks.
 *
 * `map` is a PURE coordinate function: given the incoming UV Expr and the aspect Expr, return the
 * coordinate to look up. It must not sample the child (that is the scaffold's job) and must not
 * depend on which hook is calling it — that independence is the whole point.
 */
export interface UvMap {
    map: (uv: Expr, aspect: Expr) => UvMapped
}

/**
 * A `UvMap`, or a factory that builds one from the hook params. Nearly every shader wants the
 * factory form, because the map closes over `uniforms` / `propValues` / `computeOutputs`.
 */
export type UvMapSource = UvMap | ((params: UvRemapHookParams) => UvMap)

// ═══════════════════════════════════════════════════════════════════════════════════════
// Options
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * How the compile-time edge mode is chosen:
 * - `'prop'` (default) — `(propValues.edges as number) ?? 0`, i.e. the shader declares an `edges`
 *   prop via `edgesPropConfig`. What 15 of the 17 distortions do.
 * - a number — a FIXED mode baked at composition. SliceWipe hard-codes transparent (1) because
 *   the vacated strips must clip, not stretch; there is no user-facing choice.
 * - `'none'` — no edge handling at all. Only legitimate when the map provably stays inside [0,1],
 *   which is true for exactly one shader: Flip maps [0,1] onto [0,1]. The fragment samples straight
 *   and `uvRemap` passes the mask through untouched.
 */
export type UvRemapEdgeSource = 'prop' | 'none' | number

export interface UvRemapShaderOptions {
    /** See {@link UvRemapEdgeSource}. Default `'prop'`. */
    edges?: UvRemapEdgeSource
    /**
     * Reconstruction filter for the fragment path.
     * - `'catmullRom'` (default) — `edges.sampleRemappedExpr`, which picks the right 9-tap filter
     *   per edge mode. Correct for anything that can magnify content.
     * - `'bilinear'` — a single tap through `edges.applyEdgeHandlingExpr`. For distortions that are
     *   deliberately blocky, already low-pass, or take many taps per pixel.
     */
    resample?: 'catmullRom' | 'bilinear'
    /**
     * Message logged (once, on `console.error`) when the shader is composed with no child. Omit for
     * the silent-`ZERO` behaviour — Perspective, CornerPin, GridDistortion and Liquify are silent
     * today and this scaffold preserves that rather than normalising it, because the guard text is
     * user-visible and normalising it is a separate decision.
     */
    requireChildMessage?: string
    /**
     * `uvRemap`-ONLY bail-out to the identity remap. Exists for the two compute-driven distortions
     * (GridDistortion, Liquify): their displacement comes from their own compute texture, and when
     * that texture is absent (GPU-free composition, or before the compute hook has run) `uvRemap`
     * must return the incoming `{uv, mask}` verbatim.
     *
     * It is uvRemap-only because the fragment path handles the same condition differently and
     * deliberately: it substitutes a zero-displacement `vec2f(0.0, 0.0)` INSIDE the map and still
     * goes through the sample + edge path, so the RTT pass stays structurally identical whether or
     * not the compute output exists. Do not "fix" the asymmetry — it is two correct answers to two
     * different questions.
     */
    uvRemapIdentityWhen?: (params: UvRemapHookParams) => boolean
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Map combinators
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * Lerp a map toward the identity by a runtime scalar: `mix(uv, map(uv), amount)`.
 *
 * PolarCoordinates and RectangularCoordinates both expose this as an `intensity` prop — 0 leaves
 * the content alone, 1 is the full coordinate-system change. Note this blends COORDINATES, not
 * colors, so intermediate values are a genuine partial warp rather than a cross-fade.
 */
export function lerpToIdentity(inner: UvMap, amount: (uv: Expr, aspect: Expr) => Expr): UvMap {
    return {
        map: (uv, aspect) => {
            const mapped = normalizeMapped(inner.map(uv, aspect))
            const blended = mixExpr(uv, mapped.uv, amount(uv, aspect))
            return mapped.coverage ? {uv: blended, coverage: mapped.coverage} : blended
        },
    }
}

/**
 * Pick between two maps by a HARD 0/1 selector: `mix(a(uv), b(uv), pick)`.
 *
 * This is the combinator that closes Mirror's fragment-vs-uvRemap divergence. Mirror's fragment
 * used to sample the child TWICE — once at the original UV, once at the reflected UV — and mix the
 * two colorS by `shouldMirror`; its `uvRemap` mixed the two COORDINATES. Both are correct, but
 * only because `shouldMirror` is `step(0, signedDistance)`, an exact 0 or 1: at 0 the color mix
 * returns the first sample and the coordinate mix returns the first coordinate, and likewise at 1.
 * For a hard selector the two forms are identical, and the coordinate form costs one sample instead
 * of two.
 *
 * `pick` MUST be exactly 0 or 1. Hand it a smooth selector and the forms diverge for real: mixing
 * coordinates half-way samples a point between the two lookups, which is not the average of the two
 * colors.
 */
export function selectMap(
    a: (uv: Expr, aspect: Expr) => Expr,
    b: (uv: Expr, aspect: Expr) => Expr,
    pick: (uv: Expr, aspect: Expr) => Expr,
): UvMap {
    return {map: (uv, aspect) => mixExpr(a(uv, aspect), b(uv, aspect), pick(uv, aspect))}
}

/** Normalize either `map` return form to the struct form. */
function normalizeMapped(m: UvMapped): UvMapResult {
    return 'uv' in m ? m : {uv: m}
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// The scaffold
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * Build the `fragment` + `uvRemap` pair for an RTT distortion from a single `UvMap`.
 *
 * Spread the result into the definition:
 *
 *     export const componentDefinition: GpuShaderDefinition<ComponentProps> = {
 *         name: "Twirl",
 *         requiresRTT: true,
 *         requiresChild: true,
 *         props: {…, edges: edgesPropConfig('stretch', '…')},
 *         ...uvRemapShader(
 *             ({uniforms}) => ({
 *                 map: (uv, aspect) => call(twirlUV, 'twirlUV', [uniforms.center, uniforms.intensity, uv, aspect]),
 *             }),
 *             {requireChildMessage: 'You must pass a child component into the Twirl shader.'},
 *         ),
 *     }
 *
 * The shader keeps its own `'use gpu'` mapping fn — that is the durable, resolve-tested artifact and
 * the scaffold never touches it. What the scaffold owns is the plumbing around it.
 */
export function uvRemapShader(
    source: UvMapSource,
    opts: UvRemapShaderOptions = {},
): Pick<GpuShaderDefinition, 'fragment' | 'uvRemap'> {
    const resolveMap = typeof source === 'function' ? source : () => source
    const edgeSource = opts.edges ?? 'prop'
    const edgeModeFor = (propValues: Record<string, unknown>): number | null => {
        if (edgeSource === 'none') return null
        if (typeof edgeSource === 'number') return edgeSource
        return (propValues.edges as number) ?? 0
    }

    return {
        // RTT filter path: rasterize the child, sample it at the mapped coordinate with compile-time
        // edge handling, apply coverage to alpha, then unpremultiply (the RTT stores premultiplied
        // alpha). `convertToTexture` runs BEFORE the map factory, matching the hand-written order.
        fragment: (params: GpuFragmentParams): Expr => {
            const {childNode, ctx, convertToTexture, propValues} = params
            if (!childNode) {
                if (opts.requireChildMessage) console.error(opts.requireChildMessage)
                return ZERO
            }
            const texture = convertToTexture(childNode)
            const edgeMode = edgeModeFor(propValues)
            const mapped = normalizeMapped(resolveMap(params).map(ctx.uv, ctx.aspect))
            const sampled =
                edgeMode === null
                    ? texture.sample(mapped.uv)
                    : opts.resample === 'bilinear'
                        ? edges.applyEdgeHandlingExpr(mapped.uv, (uv) => texture.sample(uv), edgeMode)
                        : edges.sampleRemappedExpr(texture, mapped.uv, edgeMode)
            const covered = mapped.coverage
                ? vec4(sampled.member('rgb'), sampled.member('a').mul(mapped.coverage))
                : sampled
            return call(blend.unpremultiplyAlpha, 'unpremultiplyAlpha', [covered])
        },

        // Analytic fast path: return the mapped COORDINATE plus the updated coverage mask. The
        // composer folds this into a combined UV and samples the content beneath once, so the whole
        // distortion costs no extra pass.
        uvRemap: (ctx) => {
            if (opts.uvRemapIdentityWhen?.(ctx)) return {uv: ctx.uv, mask: ctx.mask}
            const edgeMode = edgeModeFor(ctx.propValues)
            const mapped = normalizeMapped(resolveMap(ctx).map(ctx.uv, ctx.aspect))
            const composed =
                edgeMode === null
                    ? {uv: mapped.uv, mask: ctx.mask}
                    : edges.composeEdgeRemapExpr(mapped.uv, ctx.mask, edgeMode)
            if (!mapped.coverage) return composed
            return {uv: composed.uv, mask: composed.mask.mul(mapped.coverage)}
        },
    }
}

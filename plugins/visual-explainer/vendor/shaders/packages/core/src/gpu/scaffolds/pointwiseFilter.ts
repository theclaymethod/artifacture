/**
 * `definePointwiseFilter` — the POINTWISE color-FILTER scaffold.
 *
 * This encodes the recipe that used to live as a prose comment in `shaders/Invert/index.ts`:
 *
 * A pointwise adjustment filter is `requiresChild` but NOT `requiresRTT`. It operates on the
 * composed child color INLINE (`childNode.rgb` math) and never samples a texture — the composer
 * hands such a filter its child as a composed color `Expr` (`composer.ts` composeSiblings /
 * composeNode: `childNode = composed` for a non-RTT filter). So the whole fragment is:
 *
 *     fragment = call(<body 'use gpu' fn>, hint, [childNode, ...uniformArgs])
 *
 * where the body takes the child color as a `d.vec4f` and returns the transformed `d.vec4f`.
 * There is NO `convertToTexture` and NO `unpremultiplyAlpha` — those belong to RTT filters (see
 * {@link defineRttFilter}), which sample premultiplied RTT data. A pointwise filter sees the child
 * in whatever alpha the composition hands it (straight, from sibling composition) and preserves
 * alpha by carrying `color.w` through untouched.
 *
 * WHAT THE SCAFFOLD OWNS (per PRIMITIVES.md C5 — scaffolds own the identity-bypass pattern):
 *   1. `requiresChild: true`.
 *   2. The missing-child guard. Whether it LOGS is per-shader (`missingChildMessage`): a filter
 *      that is useless without a child logs an actionable integration error; the tone filters
 *      (Duotone/Tritone/FilmGrain) are deliberately silent. Both return `ZERO` (transparent).
 *   3. The compile-time identity bypass — see {@link FilterIdentity}. A pointwise filter returns
 *      `childNode` RAW (legal precisely because there is no premultiply boundary; the RTT scaffold
 *      must NOT do this).
 *   4. The `call(body, hint, [childNode, ...args])` wiring.
 *
 * WHAT STAYS PER-SHADER: the `'use gpu'` body (still exported from the shader file — the resolve
 * gates assert on its name and CPU-golden it), the props, and any builder-level color work after
 * the body call (`compose` — Duotone/Tritone/GradientMap mix colors in the compile-time
 * `colorSpace` at builder level, which a body fn cannot do).
 */
import type {ComponentProps} from '../../types'
import {call, ZERO} from '../composer'
import type {Expr, GpuFragmentParams, GpuShaderDefinition} from '../contract'

/**
 * A `'use gpu'` body fn plus the name hint it resolves under. The hint LANDS IN THE EMITTED WGSL,
 * so it is part of every shader's snapshot — keep it equal to the exported fn's variable name.
 */
export interface FilterBody {
    /** The `tgpu.fn`. Typed `unknown` to match `call`'s signature (no TgpuFn import needed here). */
    fn: unknown
    hint: string
}

/**
 * A filter's identity (no-op) condition, driving both the `compileTimeWhen` recompose and the
 * bypass. Declare the identity here rather than hand-rolling the `if` in a fragment: the scaffold
 * applies the right bypass for its alpha convention and adds the map-driver guard below.
 *
 * MAP-DRIVER GUARD (why `props` is required): `propValues` carries a prop's BASE CPU value and is
 * deliberately driver-unaware (`composer.ts propValuesFor` reads the handle mirror). A prop with a
 * MAP driver varies per pixel around that base, so bypassing on the base value would make the map
 * dead. The scaffold therefore refuses the bypass when any listed prop is map-driven
 * (`getMapInfo(prop) !== null`).
 *
 * KNOWN GAP: mouse/auto
 * drivers are NOT detectable from a fragment builder. A prop whose base value is the identity but
 * which is mouse/auto-driven still gets bypassed, so the driver appears dead until the base value
 * changes. This predates the scaffold (Saturation/HueShift/Sharpness shipped with it); the fix is
 * to expose driver presence on `GpuFragmentParams`, at which point this one method covers all
 * consumers at once.
 */
export interface FilterIdentity {
    /** Every prop `when` reads. A map driver on any of them disables the bypass. */
    props: string[]
    /** True when the filter is a provable no-op at these CPU values. */
    when: (propValues: Record<string, unknown>) => boolean
}

/** `GpuFragmentParams` narrowed to the post-guard state: the child is present. */
export interface FilterParams extends GpuFragmentParams {
    childNode: Expr
}

export interface PointwiseFilterConfig<T extends ComponentProps = ComponentProps>
    extends Omit<GpuShaderDefinition<T>, 'fragment' | 'requiresRTT' | 'requiresChild' | 'uvRemap'> {
    /**
     * The body fn, or a picker reading compile-time `propValues` when the shader has a body PAIR
     * (Tint's plain/preserve-luminosity variants). Only the picked body emits into the WGSL, so the
     * selecting prop MUST be `compileTime: true`.
     */
    body?: FilterBody | ((propValues: Record<string, unknown>) => FilterBody)
    /** Pure-Expr alternative to `body`: build the filtered color from `params.childNode`. */
    build?: (params: FilterParams) => Expr
    /**
     * The body's arguments AFTER the child color (which is always first). Gets the whole builder
     * params so a filter can read `ctx` (Vignette's `ctx.uv`/`ctx.aspect`, FilmGrain's viewport)
     * alongside `uniforms`.
     */
    args?: (params: FilterParams) => Expr[]
    /** Builder-level work on the body's RESULT — color-space mixes, a palette branch, a tail call. */
    compose?: (result: Expr, params: FilterParams) => Expr
    /** The no-op condition. Omit for a filter with no identity (Invert, Grayscale, Posterize). */
    identity?: FilterIdentity
    /**
     * Message for the missing-child `console.error`. Omit to fail SILENTLY (still returns `ZERO`) —
     * preserve whichever each shader does today; these strings are user-facing.
     */
    missingChildMessage?: string
    /**
     * Per-composition side effects that are not part of the returned Expr — registering an
     * `onBeforeRender` to drive an `extraFields` value (FilmGrain's grain clock). Runs after the
     * guard and only on the non-identity path (nothing to drive when the filter is bypassed).
     */
    setup?: (params: FilterParams) => void
}

/** Build a complete pointwise color-filter definition. See the module header for the recipe. */
export function definePointwiseFilter<T extends ComponentProps = ComponentProps>(
    config: PointwiseFilterConfig<T>,
): GpuShaderDefinition<T> {
    const {body, build, args, compose, identity, missingChildMessage, setup, ...meta} = config
    if (!body && !build) throw new Error(`definePointwiseFilter(${config.name}): needs a body or a build`)

    const fragment = (rawParams: GpuFragmentParams): Expr => {
        if (!rawParams.childNode) {
            if (missingChildMessage) console.error(missingChildMessage)
            return ZERO
        }
        const params = rawParams as FilterParams
        // Compile-time bypass: a pointwise filter's child is straight-alpha, so it passes through raw.
        if (isFilterIdentity(identity, params)) return params.childNode
        setup?.(params)
        let result: Expr
        if (build) {
            result = build(params)
        } else {
            const {fn, hint} = typeof body === 'function' ? body!(params.propValues) : body!
            result = call(fn, hint, [params.childNode, ...(args?.(params) ?? [])])
        }
        return compose ? compose(result, params) : result
    }

    return {...meta, requiresChild: true, fragment}
}

/**
 * Shared identity test for both filter scaffolds: the declared condition AND no map driver on any
 * prop it reads (see {@link FilterIdentity}).
 */
export function isFilterIdentity(identity: FilterIdentity | undefined, params: GpuFragmentParams): boolean {
    if (!identity) return false
    for (const prop of identity.props) {
        if (params.getMapInfo?.(prop)) return false
    }
    return identity.when(params.propValues)
}

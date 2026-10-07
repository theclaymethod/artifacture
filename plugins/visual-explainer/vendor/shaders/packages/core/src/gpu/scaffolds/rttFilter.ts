/**
 * `defineRttFilter` — the RTT (render-to-texture) FILTER scaffold.
 *
 * The sibling of {@link definePointwiseFilter}, for a filter that cannot work pointwise because it
 * needs NEIGHBOUR samples (a convolution kernel, a dither tile, a halftone screen) or a
 * non-local read of the composed child. It renders the child to a texture and samples it.
 *
 * THE ALPHA CONVENTION IS THE WHOLE POINT. The composer wraps a `requiresRTT` filter's child in
 * `applyBlend(ZERO, composed, …)`, so the child RTT holds PREMULTIPLIED color. Consequences:
 *
 *   - The kernel runs in premultiplied space and the builder finishes with
 *     `blend.unpremultiplyAlpha` — the scaffold appends that tail (see `resultAlpha`).
 *   - The identity bypass CANNOT `return childNode` the way a pointwise filter does: `childNode`
 *     here is the pre-RTT composed Expr, and returning it would double-composite the subtree
 *     (and it is the wrong alpha for this node's output slot). Identity instead samples the centre
 *     texel and unpremultiplies — Sharpness at `sharpness === 0` and Glow at `size === 0` set this
 *     precedent. The scaffold owns it so a migration cannot get it wrong.
 *
 * WHAT STAYS PER-SHADER: the `build` hook. Unlike the pointwise case there is no single
 * "body + uniform args" shape — a tap chain, a per-tap UV fn, and a compose fn are all normal — so
 * `build` gets the RTT texture plus a straight-alpha sampler and returns the (premultiplied) result.
 */
import type {ComponentProps} from '../../types'
import {call, ZERO} from '../composer'
import type {Expr, GpuFragmentParams, GpuShaderDefinition, KitTexture} from '../contract'
import {blend} from '../kit'
import {isFilterIdentity, type FilterIdentity} from './pointwiseFilter'

/** `GpuFragmentParams` plus the child's RTT — what an RTT filter's `build` hook works with. */
export interface RttFilterParams extends GpuFragmentParams {
    childNode: Expr
    /** The composed child as a texture. PREMULTIPLIED — see the module header. */
    texture: KitTexture
    /**
     * Sample the child RTT and unpremultiply → STRAIGHT alpha. For a filter whose math must run on
     * straight color (a luminance threshold, a color quantiser). A filter doing linear-in-RGB
     * work (a convolution) should sample `texture` directly and stay premultiplied throughout.
     */
    sampleStraight: (uv: Expr) => Expr
}

export interface RttFilterConfig<T extends ComponentProps = ComponentProps>
    extends Omit<GpuShaderDefinition<T>, 'fragment' | 'requiresRTT' | 'requiresChild'> {
    /** Build the filtered color from the child RTT. Returns premultiplied unless `resultAlpha`. */
    build: (params: RttFilterParams) => Expr
    /**
     * The alpha convention of `build`'s return value. `'premultiplied'` (default) → the scaffold
     * appends `blend.unpremultiplyAlpha`. `'straight'` → returned as-is, for a filter that already
     * unpremultiplied its taps via `sampleStraight`.
     */
    resultAlpha?: 'premultiplied' | 'straight'
    /** The no-op condition. Bypasses to a centre sample, NOT to `childNode` — see the header. */
    identity?: FilterIdentity
    /** Message for the missing-child `console.error`. Omit to fail silently (still returns `ZERO`). */
    missingChildMessage?: string
    /** Per-composition side effects (an `onBeforeRender` driving an `extraFields` value). */
    setup?: (params: RttFilterParams) => void
}

/** Build a complete RTT filter definition. See the module header for the alpha contract. */
export function defineRttFilter<T extends ComponentProps = ComponentProps>(
    config: RttFilterConfig<T>,
): GpuShaderDefinition<T> {
    const {build, resultAlpha, identity, missingChildMessage, setup, ...meta} = config

    const fragment = (rawParams: GpuFragmentParams): Expr => {
        if (!rawParams.childNode) {
            if (missingChildMessage) console.error(missingChildMessage)
            return ZERO
        }
        const texture = rawParams.convertToTexture(rawParams.childNode)
        const sampleStraight = (uv: Expr): Expr =>
            call(blend.unpremultiplyAlpha, 'unpremultiplyAlpha', [texture.sample(uv)])
        const params: RttFilterParams = {...rawParams, childNode: rawParams.childNode, texture, sampleStraight}
        // Identity still costs the RTT pass (the boundary is registered above, and this node's
        // output slot expects straight alpha) — so it samples the centre texel rather than
        // returning the child.
        if (isFilterIdentity(identity, rawParams)) return sampleStraight(rawParams.ctx.uv)
        setup?.(params)
        const result = build(params)
        return resultAlpha === 'straight' ? result : call(blend.unpremultiplyAlpha, 'unpremultiplyAlpha', [result])
    }

    return {...meta, requiresRTT: true, requiresChild: true, fragment}
}

/**
 * The 4 mask functions. Each is a `tgpu.fn([d.vec4f, d.vec4f], d.vec4f)` `(target, mask)` that
 * scales the target's alpha by the mask's alpha or luminance (optionally inverted).
 *
 * `MaskType` is redeclared locally (identical to types.ts) so the kit never imports the
 * types module — facade discipline.
 */
import {d, std, tgpu} from './index'

export type MaskType = 'alpha' | 'alphaInverted' | 'luminance' | 'luminanceInverted'

/** ITU-R BT.709 luminance weights, shared by the luminance masks. */
const LUMINANCE_WEIGHTS = d.vec3f(0.2126, 0.7152, 0.0722)

/** Alpha mask: target alpha × mask alpha. */
export const alpha = tgpu.fn([d.vec4f, d.vec4f], d.vec4f)((target, mask) => {
    'use gpu'
    return d.vec4f(target.xyz, target.w * mask.w)
})

/** Inverted alpha mask: target alpha × (1 - mask alpha). */
export const alphaInverted = tgpu.fn([d.vec4f, d.vec4f], d.vec4f)((target, mask) => {
    'use gpu'
    return d.vec4f(target.xyz, target.w * (1.0 - mask.w))
})

/** Luminance mask: target alpha × mask luminance. */
export const luminance = tgpu.fn([d.vec4f, d.vec4f], d.vec4f)((target, mask) => {
    'use gpu'
    const lum = std.dot(mask.xyz, LUMINANCE_WEIGHTS)
    return d.vec4f(target.xyz, target.w * lum)
})

/** Inverted luminance mask: target alpha × (1 - mask luminance). */
export const luminanceInverted = tgpu.fn([d.vec4f, d.vec4f], d.vec4f)((target, mask) => {
    'use gpu'
    const lum = std.dot(mask.xyz, LUMINANCE_WEIGHTS)
    return d.vec4f(target.xyz, target.w * (1.0 - lum))
})

/** Mask functions keyed by MaskType. Composer references these as externals. */
export const maskFunctions = {
    alpha,
    alphaInverted,
    luminance,
    luminanceInverted,
} as const

/**
 * Apply a mask to a target — CPU/builder-level dispatcher. `maskType` is compile-time; inside a
 * `'use gpu'` body reference `maskFunctions[type]` instead.
 */
export const applyMask = (target: d.v4f, mask: d.v4f, maskType: MaskType = 'alpha'): d.v4f => {
    const fn = maskFunctions[maskType] ?? maskFunctions.alpha
    return fn(target, mask)
}

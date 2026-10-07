/**
 * Relief-style noise stylizations (Stone, Wool). Each is an RTT FILTER: it samples its child layer
 * through a small Perlin-gradient surface distortion, then modulates the child's brightness by a
 * grayscale height field. Only the height field (`stone12` / `wool12`) and the per-shader defaults
 * differ — the sampling + distortion + brightness math is shared here.
 *
 * Layering mirrors kit/edges.ts + kit/noiseColor.ts: the pure GPU math is in `tgpu.fn`s (the
 * durable, resolve/golden-tested artifacts) and the Expr-level builder (`applyNoiseReliefExpr`)
 * runs at COMPOSITION time, assembling KitExprs via the composer factories. The prop-config helper
 * (`reliefStylizeProps`) lives in utilities/noiseStylize.ts and is imported by the shaders.
 *
 * RTT premultiply: `convertToTexture(...).sample(...)` returns PREMULTIPLIED alpha, so the builder
 * unpremultiplies BEFORE modulating rgb by brightness and returns straight rgba (the final pass
 * re-premultiplies globally). Opaque content would mask this, so half-transparent content exercises
 * the straight-alpha path.
 */
import {tgpu, d, std} from './index'
import {perlin12d} from './noise'
import {unpremultiplyAlpha} from './blend'
import {call, vec4, ZERO} from '../composer'
import type {Expr, GpuFragmentParams} from '../contract'

/**
 * Aspect-correct + scale the screen UV to the pattern's sample position. `freq = scale * 4`
 * (the default `freqMul`, which both Stone and Wool use). Pure float — CPU-golden-testable.
 */
export const reliefPos = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32], d.vec2f)((uv, aspect, scale, seed) => {
    'use gpu'
    const aspectUV = d.vec2f(uv.x * aspect, uv.y)
    const freq = scale * 4.0
    return aspectUV.mul(freq).add(seed)
})

/**
 * Warp the child sample UV along the Perlin surface gradient — carved-relief distortion. `perlin12d`
 * returns `vec3(value, dx, dy)`; the `.yz` gradient (scaled by `distortion * 0.012`) shifts the
 * lookup. Hash-based (perlin12d) → GPU-only, no CPU golden.
 */
export const reliefDisplacedUV = tgpu.fn([d.vec2f, d.vec2f, d.f32], d.vec2f)((uv, pos, distortion) => {
    'use gpu'
    const grad = perlin12d(pos)
    const disp = d.vec2f(grad.y, grad.z).mul(distortion).mul(0.012)
    return uv.add(disp)
})

/**
 * Contrast-remap the [0,1] height around mid-grey, then turn it into a brightness multiplier
 * (`intensity` strength, clamped to [0, 1.6]). Pure float — CPU-golden-testable.
 */
export const reliefBrightness = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((h, contrast, intensity) => {
    'use gpu'
    const hAdj = (h - 0.5) * (contrast + 1.0) + 0.5
    return std.clamp(1.0 + (hAdj - 0.5) * (intensity * 1.1), 0.0, 1.6)
})

/**
 * The full relief filter. `heightFn` is a `tgpu.fn([d.vec2f], d.f32)` height field (stone12/wool12);
 * `heightHint` seeds its WGSL name. The RTT-filter path:
 *   convertToTexture(child) → sample at the Perlin-distorted UV → unpremultiplyAlpha →
 *   modulate straight rgb by the contrast-remapped height brightness → vec4(rgb*brightness, a).
 * `pos` is emitted into both the distortion and the height call (double-emit — the accepted pattern,
 * numerically identical; `reliefPos` is a cheap deterministic fn).
 */
export function applyNoiseReliefExpr(params: GpuFragmentParams, heightFn: unknown, heightHint: string): Expr {
    const {childNode, uniforms, ctx, convertToTexture} = params
    if (!childNode) return ZERO
    const texture = convertToTexture(childNode)
    const pos = call(reliefPos, 'reliefPos', [ctx.uv, ctx.aspect, uniforms.scale, uniforms.seed])
    const displacedUV = call(reliefDisplacedUV, 'reliefDisplacedUV', [ctx.uv, pos, uniforms.distortion])
    const sampled = texture.sample(displacedUV)
    const straight = call(unpremultiplyAlpha, 'unpremultiplyAlpha', [sampled])
    const h = call(heightFn, heightHint, [pos])
    const brightness = call(reliefBrightness, 'reliefBrightness', [h, uniforms.contrast, uniforms.intensity])
    return vec4(straight.member('rgb').mul(brightness), straight.member('a'))
}

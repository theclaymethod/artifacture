/**
 * Shared object-fit UV math for the texture shaders (ImageTexture / WebcamTexture / VideoTexture).
 *
 * The five fit modes (cover / contain / fill / scale-down / none) each return the per-mode `uvScale`
 * a shader applies to its centred UV; `sampleUV` does the centre → divide-by-scale → re-centre; and
 * `alphaCutLinear` decodes the sampled sRGB color to linear (kit `srgbToLinear`) and cuts alpha to
 * 0 outside [0,1]² (the contain / scale-down letterbox). Shared here so ImageTexture + WebcamTexture
 * + VideoTexture use ONE copy rather than each transcribing the switch. `dims` is the media's pixel
 * size (image/video/webcam frame — read on the GPU via `KitTexture.dimensions()`, so no CPU aspect
 * uniforms are needed) and `vp` is the effective viewport size. Vector ops fluent, scalar ops infix.
 * All are DualFns (run as plain JS on CPU under vitest) so a consumer can golden-test them.
 *
 * NOTE: NO Y-flip. Both `importExternalTexture` (video/webcam) and `copyExternalImageToTexture`
 * (media textures written from an ImageBitmap/canvas) are top-left origin, so with the composer's
 * screenUV-matching `ctx.uv` the natural orientation is reached with no explicit `1 - y`.
 */
import {tgpu, d, std} from './index'
import {srgbToLinear} from './tonemap'
// KitExpr factory for the COMPOSITION-time `mediaSurface` builder below. `call` is a hoisted
// `function` declaration, so this kit↔composer import resolves safely at module-init (the same
// arrangement `kit/edges.ts` documents).
import {call} from '../composer'
import type {Expr, KitTexture} from '../contract'

/** cover — scale to cover the viewport (never smaller than the viewport). */
export const scaleCover = tgpu.fn([d.vec2f, d.vec2f], d.vec2f)((dims, vp) => {
    'use gpu'
    const aspect = dims.x / dims.y
    const viewportAspect = vp.x / vp.y
    const coverScale = std.max(viewportAspect / aspect, 1.0)
    return d.vec2f((aspect / viewportAspect) * coverScale, coverScale)
})

/** contain — scale to fit within the viewport (never larger than the viewport). */
export const scaleContain = tgpu.fn([d.vec2f, d.vec2f], d.vec2f)((dims, vp) => {
    'use gpu'
    const aspect = dims.x / dims.y
    const viewportAspect = vp.x / vp.y
    const containScale = std.min(viewportAspect / aspect, 1.0)
    return d.vec2f((aspect / viewportAspect) * containScale, containScale)
})

/** fill — stretch to fill the viewport (uvScale = 1,1). */
export const scaleFill = tgpu.fn([], d.vec2f)(() => {
    'use gpu'
    return d.vec2f(1.0, 1.0)
})

/** scale-down — contain, but never scale up past the media's natural pixel size. */
export const scaleScaleDown = tgpu.fn([d.vec2f, d.vec2f], d.vec2f)((dims, vp) => {
    'use gpu'
    const aspect = dims.x / dims.y
    const viewportAspect = vp.x / vp.y
    const containScale = std.min(viewportAspect / aspect, 1.0)
    const naturalScale = std.min(vp.x / dims.x, vp.y / dims.y)
    const scaleDownScale = std.min(containScale, naturalScale)
    return d.vec2f((aspect / viewportAspect) * scaleDownScale, scaleDownScale)
})

/** none — display at natural pixel size (1:1). WebcamTexture's 5th mode (Image/Video retire it). */
export const scaleNone = tgpu.fn([d.vec2f, d.vec2f], d.vec2f)((dims, vp) => {
    'use gpu'
    const aspect = dims.x / dims.y
    const viewportAspect = vp.x / vp.y
    const noneScale = std.min(vp.x / dims.x, vp.y / dims.y)
    return d.vec2f((aspect / viewportAspect) * noneScale, noneScale)
})

/** Centre the UV, divide by the fit scale, re-centre. No Y-flip (see the module note). */
export const sampleUV = tgpu.fn([d.vec2f, d.vec2f], d.vec2f)((uv, uvScale) => {
    'use gpu'
    const centeredUV = uv.sub(d.vec2f(0.5, 0.5))
    const scaledUV = d.vec2f(centeredUV.x / uvScale.x, centeredUV.y / uvScale.y)
    return scaledUV.add(d.vec2f(0.5, 0.5))
})

/**
 * Selfie-mode horizontal flip: mirror the sampling U when `mirror > 0`. Runtime (not compile-time) —
 * `mirror` is an ordinary boolean uniform, so toggling it must not recompose. `1 - u` stays within
 * [0,1] so the letterbox alpha-cut on the mirrored UV is unchanged (WebcamTexture's
 * `uvPostProcess`, the one consumer of that hook).
 */
export const applyMirror = tgpu.fn([d.vec2f, d.f32], d.vec2f)((uv, mirror) => {
    'use gpu'
    const mirroredX = std.select(uv.x, 1.0 - uv.x, mirror > 0.0)
    return d.vec2f(mirroredX, uv.y)
})

/** Decode the sampled sRGB color to linear, and cut alpha to 0 outside [0,1]² (letterbox). */
export const alphaCutLinear = tgpu.fn([d.vec4f, d.vec2f], d.vec4f)((color, uv) => {
    'use gpu'
    const linear = srgbToLinear(d.vec3f(color.x, color.y, color.z))
    const outOfBounds = (uv.x < 0.0) || (uv.x > 1.0) || (uv.y < 0.0) || (uv.y > 1.0)
    const alpha = std.select(color.w, 0.0, outOfBounds)
    return d.vec4f(linear.x, linear.y, linear.z, alpha)
})

// ─── object-fit mode tables ──────────────────────────────────────────────────
//
// The string → mode mapping the `objectFit` prop transform applies (`utilities/propConfigs.ts`'s
// `objectFitProp`), mirrored here for the COMPOSITION-time read: `propValues.objectFit` is the
// transformed number when the bridge ran the transform, and the raw string otherwise, so a builder
// has to be able to map both. The two tables differ ONLY in `none`, and that divergence is
// deliberate rather than an oversight — see each table.

/**
 * Image / Video. `none` is RETIRED (Figma-style: the bounding box defines the extent) and coalesces
 * to `fill`, so an old preset keeps filling its box rather than silently re-cropping.
 */
export const OBJECT_FIT_MODES: Record<string, number> = {cover: 0, contain: 1, fill: 2, 'scale-down': 3, none: 2}

/** Webcam. `none` is a real mode (mode 4 — natural pixel size), so the feed can display 1:1. */
export const OBJECT_FIT_MODES_ALLOW_NONE: Record<string, number> = {cover: 0, contain: 1, fill: 2, 'scale-down': 3, none: 4}

export interface MediaSurfaceOptions {
    /** The media / external texture to sample. */
    texture: KitTexture
    /** Base UV — `uvContext ?? ctx.uv` (resize-fit aware). */
    uv: Expr
    /** Effective viewport — `effectiveViewportSize ?? ctx.viewportSize`. */
    viewport: Expr
    /**
     * The COMPOSITION-time `objectFit` value: `propValues.objectFit`. A number (post-transform) or a
     * raw string. Structural — the prop is `compileTime`, so only the selected mode's math is
     * emitted, and changing it recompiles.
     */
    fit: unknown
    /** Use the `none`-preserving table, with `cover` (0) rather than `fill` (2) as the fallback. */
    allowNone?: boolean
    /**
     * Transform the fitted UV before it is sampled AND before the letterbox alpha cut — the cut has
     * to see the same UV that was sampled. WebcamTexture's selfie mirror is the one consumer.
     */
    uvPostProcess?: (uv: Expr) => Expr
    /**
     * How the sample is decoded. `'srgb-linear-alpha-cut'` decodes sRGB → linear and cuts alpha to 0
     * outside [0,1]² (the contain / scale-down letterbox). Required rather than defaulted so each
     * consumer states its choice, the way `flipY` does elsewhere (D-1).
     */
    decode: 'srgb-linear-alpha-cut'
}

/**
 * Assemble a full media surface: object-fit UV scale → fitted UV → sample → decode.
 *
 * This is the ~13 lines Image / Video / Webcam each transcribed verbatim. The fit branch is JS
 * (compile-time), so the emitted WGSL carries exactly one mode's math; `dims` comes from
 * `KitTexture.dimensions()` (GPU `textureDimensions`), which is why no CPU aspect uniforms exist for
 * any of the three.
 */
export function mediaSurface(opts: MediaSurfaceOptions): Expr {
    const table = opts.allowNone ? OBJECT_FIT_MODES_ALLOW_NONE : OBJECT_FIT_MODES
    const fallback = opts.allowNone ? 0 : 2
    const mode = typeof opts.fit === 'number' ? opts.fit : (table[opts.fit as string] ?? fallback)
    const dims = opts.texture.dimensions()

    let uvScale: Expr
    if (mode === 1) uvScale = call(scaleContain, 'scaleContain', [dims, opts.viewport])
    else if (mode === 2) uvScale = call(scaleFill, 'scaleFill', [])
    else if (mode === 3) uvScale = call(scaleScaleDown, 'scaleScaleDown', [dims, opts.viewport])
    else if (mode === 4 && opts.allowNone) uvScale = call(scaleNone, 'scaleNone', [dims, opts.viewport])
    else uvScale = call(scaleCover, 'scaleCover', [dims, opts.viewport])

    const fitUV = call(sampleUV, 'mediaSampleUV', [opts.uv, uvScale])
    const finalUV = opts.uvPostProcess ? opts.uvPostProcess(fitUV) : fitUV
    const sampled = opts.texture.sample(finalUV)
    return call(alphaCutLinear, 'mediaAlphaCut', [sampled, finalUV])
}

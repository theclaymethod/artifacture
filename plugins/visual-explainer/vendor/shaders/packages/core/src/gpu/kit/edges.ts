/**
 * Edge handling for UV remaps.
 *
 * `edgeMode` is a CPU-side `compileTime` value (a JS number read at composition), so the
 * three public entry points below are BUILDER functions: they run at graph-build time and
 * JS-branch on the mode, emitting different GPU code per mode. The per-mode GPU MATH lives in
 * the `tgpu.fn`s (`edgeClampUV` / `edgeMirrorUV` / `edgeWrapUV` / `edgeTransparentMask`), which
 * are the durable, resolve-tested artifacts.
 *
 * `applyEdgeHandling` takes a `sample: (uv) => vec4f` callback (bind `kitTexture.sample`) rather
 * than a texture, since sampling is a KitTexture concern. `null` is accepted and falls back to
 * stretch for mirror/wrap (the non-RTT path).
 *
 * Threading note: these builders return GPU expressions by applying the per-mode `tgpu.fn`s
 * to their inputs. They are meant to be called from within a shader's `'use gpu'`
 * fragment/uvRemap body, where the fn application transpiles to a WGSL call and the
 * literal `edgeMode` selects the branch before transpilation.
 */
import {tgpu, d, std} from './index'
import type {v2f, v4f} from 'typegpu/data'
// KitExpr factories for the COMPOSITION-time (Expr-level) builders below. `call` / `vec4` are
// hoisted `function` declarations, so this composer↔edges import cycle (composer imports
// `edgeClampUV` from here) resolves safely — neither side touches the other at module-init.
import {call, vec4} from '../composer'
import {sampleCatmullRomExpr} from './sampling'
import type {Expr, KitTexture} from '../contract'

// ─── Per-mode GPU math (durable, resolve-tested) ─────────────────────────────

/** Stretch (mode 0): clamp UV into [0,1] (`clamp(uv, vec2(0), vec2(1))`). */
export const edgeClampUV = tgpu.fn([d.vec2f], d.vec2f)((uv) => {
    'use gpu'
    return std.clamp(uv, d.vec2f(0.0, 0.0), d.vec2f(1.0, 1.0))
})

/**
 * Mirror (mode 2): reflect UV back into [0,1]. Per-component: `m = mod(abs(x), 2); m > 1 ?
 * 2 - m : m`. The `m >= 1.0` reflection predicate is equivalent to `step(1, m)`.
 */
export const edgeMirrorUV = tgpu.fn([d.vec2f], d.vec2f)((uv) => {
    'use gpu'
    const mirrorX = std.mod(std.abs(uv.x), 2.0)
    const mirrorY = std.mod(std.abs(uv.y), 2.0)
    return d.vec2f(
        std.select(mirrorX, 2.0 - mirrorX, mirrorX >= 1.0),
        std.select(mirrorY, 2.0 - mirrorY, mirrorY >= 1.0),
    )
})

/** Wrap (mode 3): tile UV via `fract(uv)`. */
export const edgeWrapUV = tgpu.fn([d.vec2f], d.vec2f)((uv) => {
    'use gpu'
    return std.fract(uv)
})

/**
 * Transparent (mode 1) coverage: 1 where the looked-up UV is inside [0,1] on both axes,
 * else 0 (`step(0,x)*step(x,1)*step(0,y)*step(y,1)`).
 */
export const edgeTransparentMask = tgpu.fn([d.vec2f], d.f32)((uv) => {
    'use gpu'
    const inX = std.step(0.0, uv.x) * std.step(uv.x, 1.0)
    const inY = std.step(0.0, uv.y) * std.step(uv.y, 1.0)
    return inX * inY
})

// ─── Edge mode constants (mirror transformEdges: 0=stretch,1=transparent,2=mirror,3=wrap) ─
// Stretch (0) is the `default` branch, so it needs no named constant.
const TRANSPARENT = 1
const MIRROR = 2
const WRAP = 3

// ─── Builder entry points (JS-branch on the compileTime mode) ────────────────

/**
 * Applies edge handling as a UV transformation (no color sampling). Used during UV
 * composition so each distortion in a chain applies its own edge handling before the next
 * transforms those UVs further.
 *
 * - transparent (1): pass-through (coverage is dropped later, at the color stage).
 * - mirror (2) / wrap (3) / stretch (0): the matching per-mode `tgpu.fn`.
 */
export const applyEdgeToUV = (uv: v2f, edgeMode: number): v2f => {
    switch (edgeMode) {
        case TRANSPARENT:
            return uv
        case MIRROR:
            return edgeMirrorUV(uv)
        case WRAP:
            return edgeWrapUV(uv)
        default:
            return edgeClampUV(uv)
    }
}

/**
 * Bakes edge handling into a UV-remap step for the analytic fast path. Returns the
 * coordinate to look up one layer down plus an updated coverage mask:
 * - transparent (1): leaves the UV alone and drops coverage where the looked-up coordinate
 *   falls outside [0,1] (matches applyEdgeHandling's alpha cut).
 * - stretch/mirror/wrap (0/2/3): transforms the UV via applyEdgeToUV, mask unchanged.
 */
export const composeEdgeRemap = (
    distortedUV: v2f,
    mask: number,
    edgeMode: number,
): {uv: v2f; mask: number} => {
    if (edgeMode === TRANSPARENT) {
        return {uv: distortedUV, mask: mask * edgeTransparentMask(distortedUV)}
    }
    return {uv: applyEdgeToUV(distortedUV, edgeMode), mask}
}

/**
 * Applies edge handling to sampled colors based on UV bounds. Supports the four modes for
 * distorted UVs that fall outside [0,1].
 *
 * @param distortedUV  the distorted UV (pre-clamp)
 * @param sampledColor the color sampled with clamped UVs
 * @param sample       re-sample callback (bind `kitTexture.sample`), or null for the
 *                     non-RTT path — mirror/wrap then fall back to stretch, as before
 * @param edgeMode     0=stretch, 1=transparent, 2=mirror, 3=wrap
 */
export const applyEdgeHandling = (
    distortedUV: v2f,
    sampledColor: v4f,
    sample: ((uv: v2f) => v4f) | null,
    edgeMode: number,
): v4f => {
    switch (edgeMode) {
        case TRANSPARENT:
            // Fade to alpha outside bounds; RGB unchanged.
            return maskAlpha(sampledColor, edgeTransparentMask(distortedUV))
        case MIRROR:
            if (!sample) return sampledColor
            return sample(edgeMirrorUV(distortedUV))
        case WRAP:
            if (!sample) return sampledColor
            return sample(edgeWrapUV(distortedUV))
        default:
            return sampledColor
    }
}

/** `vec4(color.rgb, color.a * m)` — the transparent-mode alpha cut. */
const maskAlpha = tgpu.fn([d.vec4f, d.f32], d.vec4f)((color, m) => {
    'use gpu'
    return d.vec4f(color.x, color.y, color.z, color.w * m)
})

// ─── Expr-level builders (COMPOSITION time — JS-branch, emit via composer `call()`) ──────────
//
// The builders above operate on concrete vec VALUES (a `'use gpu'` body world). A shader's
// `fragment` / `uvRemap` builders instead compose KitExpr `Expr`s at composition time, so they
// cannot call the value-level fns. These three mirror the value-level trio exactly, one Expr per
// mode, emitting `call(<perModeFn>, hint, [uvExpr])` so the 16 uvRemap distortions share one path.
// Hints match the value-level fn names so the emitted WGSL (and snapshots) are identical.

/**
 * Expr-level `applyEdgeToUV`: transform a distorted-UV Expr per the compile-time edge mode.
 * transparent (1) passes the UV through (coverage is dropped at the color/mask stage); mirror
 * (2) / wrap (3) / stretch (0) emit the matching per-mode fn call.
 */
export const applyEdgeToUVExpr = (uv: Expr, edgeMode: number): Expr => {
    switch (edgeMode) {
        case TRANSPARENT:
            return uv
        case MIRROR:
            return call(edgeMirrorUV, 'edgeMirrorUV', [uv])
        case WRAP:
            return call(edgeWrapUV, 'edgeWrapUV', [uv])
        default:
            return call(edgeClampUV, 'edgeClampUV', [uv])
    }
}

/**
 * Expr-level `composeEdgeRemap` for the analytic UV-fold fast path. Returns the coordinate to
 * look up one layer down plus an updated coverage mask:
 * - transparent (1): UV unchanged; multiply the mask by the in-bounds coverage of the looked-up
 *   coordinate (`edgeTransparentMask`).
 * - stretch/mirror/wrap (0/2/3): transform the UV via `applyEdgeToUVExpr`, mask unchanged.
 */
export const composeEdgeRemapExpr = (distortedUV: Expr, mask: Expr, edgeMode: number): {uv: Expr; mask: Expr} => {
    if (edgeMode === TRANSPARENT) {
        const coverage = call(edgeTransparentMask, 'edgeTransparentMask', [distortedUV])
        return {uv: distortedUV, mask: mask.mul(coverage)}
    }
    return {uv: applyEdgeToUVExpr(distortedUV, edgeMode), mask}
}

/**
 * Expr-level `applyEdgeHandling` for the RTT-filter path — edge handling on a SAMPLED color.
 * Supply a `sample` callback (bind `kitTexture.sample`) that samples the composed content at a
 * UV Expr.
 * - transparent (1): sample straight, then fade alpha to 0 outside [0,1] (`edgeTransparentMask`).
 * - mirror (2) / wrap (3): re-sample at the reflected / tiled UV.
 * - stretch (0): sample straight (the linearClamp sampler clamps out-of-range UVs to the edge).
 */
export const applyEdgeHandlingExpr = (distortedUV: Expr, sample: (uv: Expr) => Expr, edgeMode: number): Expr => {
    if (edgeMode === TRANSPARENT) {
        const s = sample(distortedUV)
        const coverage = call(edgeTransparentMask, 'edgeTransparentMask', [distortedUV])
        return vec4(s.member('rgb'), s.member('a').mul(coverage))
    }
    if (edgeMode === MIRROR) return sample(call(edgeMirrorUV, 'edgeMirrorUV', [distortedUV]))
    if (edgeMode === WRAP) return sample(call(edgeWrapUV, 'edgeWrapUV', [distortedUV]))
    return sample(distortedUV)
}

/**
 * `applyEdgeHandlingExpr` with the best RECONSTRUCTION FILTER for the mode — the one-liner a
 * geometric distortion's RTT path should use instead of hand-rolling `(uv) => tex.sample(uv)`.
 *
 * A distortion that scales content up is resampling a texture at less than one texel per pixel,
 * and a single bilinear tap reconstructs hard edges (text, logos, clip boundaries) as visible
 * facets. Catmull-Rom (kit/sampling) fixes that for 9 taps. Per mode:
 * - stretch (0) / transparent (1): Catmull-Rom through `linearClamp` — the footprint clamps at
 *   the border, which is exactly what both modes want.
 * - wrap (3): Catmull-Rom through `linearRepeat`, so taps that reach past the edge tile instead
 *   of clamping (no seam).
 * - mirror (2): plain bilinear. There is no mirror-repeat sampler in the shared kit set, so a
 *   wide footprint would clamp across the reflection seam; not worth a sampler for the one mode.
 *
 * Distortions that are deliberately blocky (Pixelate), already low-pass (DiffuseBlur), or take
 * many taps per pixel (chromatic splits) should keep the plain bilinear path.
 */
export const sampleRemappedExpr = (tex: KitTexture, distortedUV: Expr, edgeMode: number): Expr => {
    const sample =
        edgeMode === MIRROR
            ? (uv: Expr) => tex.sample(uv)
            : (uv: Expr) => sampleCatmullRomExpr(tex, uv, edgeMode === WRAP ? 'linearRepeat' : 'linearClamp')
    return applyEdgeHandlingExpr(distortedUV, sample, edgeMode)
}

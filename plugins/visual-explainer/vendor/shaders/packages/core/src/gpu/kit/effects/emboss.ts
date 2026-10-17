/**
 * Emboss / deboss relief effect.
 *
 * `applyEmbossEffect(params, sdfSampler, childTexture, options?): Expr` is an Expr-level BUILDER:
 * it computes the SDF UV, samples the field at the centre + 4 cardinal neighbours + 2 shadow-trace
 * points, samples the child through a parallax-warped UV, and feeds the SDF scalars + the STRAIGHT
 * child sample into the pure `embossComposite` `'use gpu'` fn (normal-from-height edge lighting +
 * cast shadow + composite). Returns STRAIGHT rgba.
 *
 * NOTES:
 *   1. NO PER-PIXEL EARLY-OUT: all taps run unconditionally (no builder control flow). Outside the
 *      shape `inside = 0` (warpedUV = screenUV), the height field is flat (normal = +z,
 *      edgeLighting = 0), and both trace diffs are 0 → totalShadow = 0 → `clamp(childRgb, 0, 1)`,
 *      the child passthrough. The effect path unpremultiplies the child in every case (see #2), so
 *      there is no double-premultiply.
 *   2. RTT PREMULTIPLY: the child sample comes back PREMULTIPLIED; the color math treats it as
 *      STRAIGHT. The builder `unpremultiplyAlpha`s the warped child sample before the composite and
 *      returns STRAIGHT rgba (the final pass re-premultiplies globally).
 *   3. `volumetric` is a RUNTIME f32 flag (`0`/`1`) selected inside the bodies via `std.select`,
 *      not build-time-pruned WGSL — for body reuse + golden-testability.
 */
import {tgpu, d, std} from '../index'
import {unpremultiplyAlpha} from '../blend'
import {call, floatE} from '../../composer'
import type {Expr, GpuFragmentParams, KitTexture} from '../../contract'
import {sdfSpaceUV, offsetUV} from './glass'

const DEG_TO_RAD = 0.017453292519943295 // Math.PI / 180

// lz=0.7 → lightLen=sqrt(1.49) invariant. Precomputed at module scope (plain JS, not in a body).
const _INV_LIGHT_LEN = 1 / Math.sqrt(1 + 0.7 * 0.7) // ≈ 0.8192
const _LZN = 0.7 * _INV_LIGHT_LEN // ≈ 0.5735

/** Uniform keys the emboss builder reads via `params.uniforms.<key>`. */
export interface EmbossEffectUniforms {
    center: unknown; scale: unknown; rotation: unknown; depth: unknown
    lightAngle: unknown; lightIntensity: unknown; shadowIntensity: unknown
}

export interface EmbossEffectOptions {
    /** Treat the field as a 3D thickness map — the relief follows the actual surface height. */
    volumetric?: boolean
    /** Cheap bilinear sampler for the neighbour + shadow-trace taps (compute path). Falls back to sdfSampler. */
    gradSampler?: (uv: Expr) => Expr
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Pure-math body fns
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * Height field from an SDF value. 2D: a binary plateau with a tight transition of half-width
 * `transitionW` (edge-only lighting). Volumetric: −field used directly as a continuous height
 * (saturating at 0.18 field units). Feeding the wider shadow transition as `transitionW` gives the
 * cast-shadow trace its smooth falloff. `depth` is signed (raised/sunken). Pure — golden-testable.
 */
export const embossHeight = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)((s, depth, transitionW, volumetric) => {
    'use gpu'
    const vol = depth * std.clamp(s * -1.0 / 0.18, 0.0, 1.0)
    const flat = depth * std.smoothstep(transitionW, transitionW * -1.0, s)
    return std.select(flat, vol, volumetric > 0.5)
})

/** A shadow-trace sample UV: `sdfUV + (cos,sin)(lightAngle) * spread * frac`, spread = |depth|*0.06. Pure. */
export const embossTraceUV = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32], d.vec2f)((sdfUV, lightAngle, depth, frac) => {
    'use gpu'
    const lx = std.cos(lightAngle * DEG_TO_RAD)
    const ly = std.sin(lightAngle * DEG_TO_RAD)
    const absDepth = std.max(std.abs(depth), 0.0001)
    const spread = absDepth * 0.06
    return d.vec2f(sdfUV.x + lx * spread * frac, sdfUV.y + ly * spread * frac)
})

/** Parallax UV displacement — scale the child around the shape centre inside the boundary. Pure. */
export const embossWarpUV = tgpu.fn([d.vec2f, d.vec2f, d.f32, d.f32], d.vec2f)((uv, center, sdfC, depth) => {
    'use gpu'
    const tw = 0.003
    const inside = std.smoothstep(tw, tw * -1.0, sdfC)
    const dispScale = 1.0 - depth * 0.05 * inside
    const centerX = center.x
    const centerY = 1.0 - center.y
    return d.vec2f(centerX + (uv.x - centerX) * dispScale, centerY + (uv.y - centerY) * dispScale)
})

/**
 * Surface normal from the height gradient (central differences over the 4 cardinal SDF taps) +
 * directional edge lighting. Returns `vec2(highlight, edgeShadow)` — both ≥ 0. Pure —
 * CPU-golden-testable.
 */
export const embossEdgeLighting = tgpu.fn([d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32], d.vec2f)(
    (sdfR, sdfL, sdfU, sdfD, depth, lightAngle, lightIntensity, volumetric) => {
        'use gpu'
        const eps = 0.003
        const tw = 0.003
        const hR = embossHeight(sdfR, depth, tw, volumetric)
        const hL = embossHeight(sdfL, depth, tw, volumetric)
        const hU = embossHeight(sdfU, depth, tw, volumetric)
        const hD = embossHeight(sdfD, depth, tw, volumetric)
        const dhx = (hR - hL) / (eps * 2.0)
        const dhy = (hU - hD) / (eps * 2.0)
        const nLen = std.sqrt(dhx * dhx + dhy * dhy + 1.0)
        const nx = dhx * -1.0 / nLen
        const ny = dhy * -1.0 / nLen
        const nz = 1.0 / nLen
        const lx = std.cos(lightAngle * DEG_TO_RAD)
        const ly = std.sin(lightAngle * DEG_TO_RAD)
        const lxn = lx * _INV_LIGHT_LEN
        const lyn = ly * _INV_LIGHT_LEN
        const lzn = _LZN
        const NdotL = nx * lxn + ny * lyn + nz * lzn
        const edgeLighting = (NdotL - lzn) * lightIntensity
        const highlight = std.max(edgeLighting, 0.0)
        const edgeShadow = std.max(edgeLighting * -1.0, 0.0)
        return d.vec2f(highlight, edgeShadow)
    })

/**
 * The full emboss composite. `childColor` = STRAIGHT child sample at the warped UV; the 5 SDF taps
 * (centre + R/L/U/D) drive edge lighting; the 2 trace taps (`h1raw`/`h2raw`) drive the cast shadow.
 * Returns STRAIGHT rgba. Resolve-goldenable.
 */
export const embossComposite = tgpu.fn(
    [d.vec4f, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32], d.vec4f)(
    (childColor, sdfC, sdfR, sdfL, sdfU, sdfD, h1raw, h2raw, depth, lightAngle, lightIntensity, shadowIntensity, volumetric) => {
        'use gpu'
        const tw = 0.003
        const light = embossEdgeLighting(sdfR, sdfL, sdfU, sdfD, depth, lightAngle, lightIntensity, volumetric)
        const highlight = light.x
        const edgeShadow = light.y

        // Cast shadow: heights at the 2 trace points vs the centre, laundered through the wide
        // shadow transition (2D) or the continuous height (volumetric).
        const hC = embossHeight(sdfC, depth, tw, volumetric)
        const absDepth = std.max(std.abs(depth), 0.0001)
        const shadowTw = absDepth * 0.06
        const h1 = embossHeight(h1raw, depth, shadowTw, volumetric)
        const h2 = embossHeight(h2raw, depth, shadowTw, volumetric)
        const diff1 = (h1 - hC) / absDepth
        const diff2 = (h2 - hC) / absDepth
        const castShadow = std.smoothstep(0.0, 0.5, diff1) * 0.55 + std.smoothstep(0.0, 0.5, diff2) * 0.45

        const totalShadow = std.clamp(edgeShadow + castShadow, 0.0, 1.0) * shadowIntensity
        const childRgb = d.vec3f(childColor.x, childColor.y, childColor.z)
        const highlightRgb = d.vec3f(highlight, highlight, highlight)
        const finalRgb = std.clamp(childRgb.mul(1.0 - totalShadow).add(highlightRgb), d.vec3f(0.0), d.vec3f(1.0))
        return d.vec4f(finalRgb.x, finalRgb.y, finalRgb.z, childColor.w)
    })

// ═══════════════════════════════════════════════════════════════════════════════════════
// The Expr-level builder
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * Apply the emboss / deboss relief effect over child content. Composition-time Expr builder — see
 * the file header for deviations.
 *
 * @param params        the fragment builder params (reads `uniforms`/`ctx`)
 * @param sdfSampler    `(uvExpr) → vec4 Expr`: `.r` = signed distance / −chord
 * @param childTexture  the child RTT (from the shader's `convertToTexture(childNode)`)
 * @param options       `volumetric` + an optional cheap `gradSampler` for the neighbour/trace taps
 */
export function applyEmbossEffect(
    params: GpuFragmentParams,
    sdfSampler: (uv: Expr) => Expr,
    childTexture: KitTexture,
    options?: EmbossEffectOptions,
): Expr {
    const {uniforms, ctx} = params
    const gradSampler = options?.gradSampler ?? sdfSampler
    const volFlag = floatE(options?.volumetric ? 1 : 0)
    const eps = 0.003

    const sdfUV = call(sdfSpaceUV, 'sdfSpaceUV', [uniforms.center, uniforms.scale, uniforms.rotation, ctx.uv, ctx.aspect])
    const sdfC = sdfSampler(sdfUV).member('r')
    const sdfR = gradSampler(call(offsetUV, 'offsetUV', [sdfUV, floatE(eps), floatE(0)])).member('r')
    const sdfL = gradSampler(call(offsetUV, 'offsetUV', [sdfUV, floatE(-eps), floatE(0)])).member('r')
    const sdfU = gradSampler(call(offsetUV, 'offsetUV', [sdfUV, floatE(0), floatE(eps)])).member('r')
    const sdfD = gradSampler(call(offsetUV, 'offsetUV', [sdfUV, floatE(0), floatE(-eps)])).member('r')

    // Cast-shadow trace taps at 50% + 100% of the light-direction spread.
    const h1raw = gradSampler(call(embossTraceUV, 'embossTraceUV', [sdfUV, uniforms.lightAngle, uniforms.depth, floatE(0.5)])).member('r')
    const h2raw = gradSampler(call(embossTraceUV, 'embossTraceUV', [sdfUV, uniforms.lightAngle, uniforms.depth, floatE(1.0)])).member('r')

    // Parallax-warped child sample (unpremultiplied to straight color — RTT samples are premultiplied).
    const warpedUV = call(embossWarpUV, 'embossWarpUV', [ctx.uv, uniforms.center, sdfC, uniforms.depth])
    const childColor = call(unpremultiplyAlpha, 'unpremultiplyAlpha', [childTexture.sample(warpedUV)])

    return call(embossComposite, 'embossComposite', [
        childColor, sdfC, sdfR, sdfL, sdfU, sdfD, h1raw, h2raw,
        uniforms.depth, uniforms.lightAngle, uniforms.lightIntensity, uniforms.shadowIntensity, volFlag,
    ])
}

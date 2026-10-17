/**
 * Iridescent thin-film rim effect.
 *
 * `applyThinFilmEffect(params, sdfSampler, options?): Expr` is an Expr-level BUILDER that runs at
 * COMPOSITION time and assembles KitExprs via the composer factories, like kit/effects/neon (both
 * are transparent-interior GENERATORS — no child texture). The heavy branchless normal / rim /
 * directional-phase / spectrum math lives in pure `'use gpu'` `tgpu.fn`s (the durable
 * resolve/golden-tested artifacts); the builder computes the SDF UV, samples the field (+ 2
 * finite-difference gradient taps), then feeds the scalars into the bodies and assembles the final
 * vec4.
 *
 * NOTES:
 *   1. NO PER-PIXEL EARLY-OUT: all taps run unconditionally (builders have no control flow).
 *      Outside the shape `rb1 = clamp(-sdf/sharp·32,0,1) = 0`, so `rim = 0` → rgb = 0 and
 *      alpha = clamp(0) = 0 = vec4(0). In the 2D interior past the rim (`sdf ≤ -rimWidth`),
 *      `depth = 1` → `rim = (1-1)²·rb1 = 0` = vec4(0). Both cases already yield vec4(0), so there
 *      is nothing to skip.
 *   2. lightAngle cos/sin computed IN-SHADER (per fragment) rather than as precomputed `lx`/`ly`
 *      uniforms — a kit builder can't add ad-hoc uniforms; 2 trig per fragment is negligible.
 *   3. ANIMATED TIME via the synthetic `_animTime` field (`params.props.member('_animTime')`). The
 *      shader declares `animatedTime: {speed: 'speed'}`; the renderer accumulates the field CPU-side.
 *   4. `volumetric` is a RUNTIME f32 flag (`0`/`1`) selected inside the bodies via `std.select`,
 *      not build-time-pruned WGSL — for body reuse + golden-testability. `mode` (rainbow/custom)
 *      and `colorSpace` ARE build-time JS branches.
 *   5. CUSTOM mode uses the round-trip `mixColorsVariants[mode]` chain; there is no in-space
 *      preconverted-color optimization (byte-identical for linear, sub-perceptual for non-linear).
 */
import {tgpu, d, std, colorMixing} from '../index'
import {call, floatE, mixExpr} from '../../composer'
import type {Expr, GpuFragmentParams} from '../../contract'
import {sdfSpaceUV, offsetUV, glassGradient} from './glass'
import {cosinePalette} from '../lighting'

// Math constants as plain number literals — the pattern for values referenced INSIDE a
// `'use gpu'` body (NEVER `Math.*` in a body).
const DEG_TO_RAD = 0.017453292519943295 // Math.PI / 180
const TWO_PI = 6.283185307179586 // Math.PI * 2

/**
 * Uniform keys the thin-film builder reads via `params.uniforms.<key>`. `mode`/`colorSpace` are
 * ALSO read via `params.propValues` for compile-time branching.
 */
export interface ThinFilmEffectUniforms {
    center: unknown; scale: unknown; rotation: unknown; intensity: unknown
    rimWidth: unknown; edgeSoftness: unknown; thickness: unknown; dispersion: unknown
    saturation: unknown; hueShift: unknown; lightAngle: unknown; speed: unknown
    mode: unknown; colorA: unknown; colorB: unknown; colorC: unknown; colorSpace: unknown
}

export interface ThinFilmEffectOptions {
    /** Treat the field as a real 3D film thickness (−chord/2): interference phase follows the
     *  actual optical path (contour fringes across the whole surface) and the rim intensity follows
     *  the view angle so every edge shows iridescence. */
    volumetric?: boolean
    /** Cheap bilinear sampler for the finite-difference gradient taps (compute path). Falls back to
     *  sdfSampler when absent (inline-march / WebGL paths), preserving prior behaviour. */
    gradSampler?: (uv: Expr) => Expr
    /** Sampler carries an analytic gradient in `.g/.b` of the centre tap (the volumetric grad
     *  sampler) — skip the two finite-difference taps entirely. Wins over `gradSampler`. */
    bakedGradients?: boolean
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Pure-math body fns
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * Boundary-normal rim + interference phase from the SDF field. Returns `vec2(phase, rim)`. `sdfRaw`
 * is the raw field value (÷scale → the depth-space sdf); `gradX`/`gradY` are the raw forward
 * differences. 2D rim: quadratic distance falloff `(1-depth)²`. Volumetric rim: grazing-incidence
 * `pow(1-cosView, exponent)` from the field-gradient slope. The phase adds a directional warm/cool
 * term (nDotL rotated by animTime) and a thickness term (2D depth vs continuous −chord). Pure —
 * CPU-golden-testable (all scalar ops).
 */
export const thinFilmShade = tgpu.fn(
    [d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32], d.vec2f)(
    (sdfRaw, scale, gradX, gradY, edgeSoftness, rimWidthUniform, thickness, dispersion, hueShift, lightAngle, animTime, volumetric) => {
        'use gpu'
        const sdf = sdfRaw / scale
        const sharp = std.max(edgeSoftness * 0.5, 0.001)
        const gLen = std.max(std.sqrt(gradX * gradX + gradY * gradY), 0.0001)
        const nx = gradX / gLen
        const ny = gradY / gLen

        // Inside mask (0 outside → 1 inside), softened by edgeSoftness.
        const rb1 = std.clamp(sdf * -1.0 / sharp * 32.0, 0.0, 1.0)

        // Rim band.
        const rimWidth = std.max(rimWidthUniform * 0.1, 0.001)
        const depth = std.clamp(sdf * -1.0 / rimWidth, 0.0, 1.0)
        const cosView = 1.0 / std.sqrt(gLen * gLen + 1.0)
        const exponent = std.mix(7.0, 1.5, std.clamp(rimWidthUniform, 0.0, 1.0))
        const volRim = std.pow(1.0 - cosView, exponent) * rb1
        const flatRim = (1.0 - depth) * (1.0 - depth) * rb1
        const rim = std.select(flatRim, volRim, volumetric > 0.5)

        // Directional warm/cool term, rotated over time. cos(α−θ) = cosα·cosθ + sinα·sinθ.
        const lx = std.cos(lightAngle * DEG_TO_RAD)
        const ly = std.sin(lightAngle * DEG_TO_RAD)
        const baseCos = nx * lx + ny * ly
        const baseSin = ny * lx - nx * ly
        const theta = animTime * TWO_PI
        const rotatedDot = baseCos * std.cos(theta) + baseSin * std.sin(theta)

        // Thin-film phase: directional + thickness term (2D depth vs volumetric −chord).
        const thickVol = thickness * std.max(sdf * -1.0, 0.0) * 10.0
        const thickFlat = thickness * depth * 2.0
        const thicknessTerm = std.select(thickFlat, thickVol, volumetric > 0.5)
        const phase = hueShift + dispersion * rotatedDot + thicknessTerm

        return d.vec2f(phase, rim)
    })

/**
 * IQ cosine palette → smooth iridescent spectrum (oil-slick / anodised metal). `t = phase`.
 * `cos((phase + k)·2π)·0.5 + 0.5` per channel with the TRUNCATED thirds this effect has always
 * used (0.3333 / 0.6667) — passed as arguments to the shared `lighting.cosinePalette`, which
 * Holographic calls with exact thirds. Unifying them would move pixels in one of the two. Pure.
 */
export const thinFilmRainbow = tgpu.fn([d.f32], d.vec3f)((phase) => {
    'use gpu'
    return cosinePalette(phase, 0.0, 0.3333, 0.6667)
})

/**
 * Custom 3-color cycle parameters from the phase: returns `vec3(si, gate12, gate01)` where `si` is
 * the in-segment blend factor and `gate12`/`gate01` are WGSL `step` gates selecting the active
 * segment (A→B→C→A). Pure — CPU-golden-testable. The colors themselves are mixed in the builder
 * with the compile-time-selected `mixColorsVariants[mode]`.
 */
export const thinFilmCustomParams = tgpu.fn([d.f32], d.vec3f)((phase) => {
    'use gpu'
    const t = std.fract(phase)
    const t3 = t * 3.0
    const si = std.fract(t3)
    const floorT3 = std.floor(t3)
    // step(edge, x) = 1 where x ≥ edge ⟺ edge ≤ x. gate12 = step(floorT3, 1.5), gate01 = step(floorT3, 0.5).
    const gate12 = std.select(d.f32(0), d.f32(1), floorT3 <= 1.5)
    const gate01 = std.select(d.f32(0), d.f32(1), floorT3 <= 0.5)
    return d.vec3f(si, gate12, gate01)
})

/**
 * Final composite: blend a plain white rim ↔ the spectral color by `saturation`, scale by the rim
 * mask + intensity, and set alpha to the (clamped) rim. Intensity is unclamped so the rim can blow
 * out via tone mapping. Returns STRAIGHT rgba. Pure — CPU-golden-testable.
 */
export const thinFilmCompose = tgpu.fn([d.vec3f, d.f32, d.f32, d.f32], d.vec4f)((baseColor, rim, intensity, saturation) => {
    'use gpu'
    const white = d.vec3f(1.0, 1.0, 1.0)
    const col = std.mix(white, baseColor, saturation)
    const rgb = col.mul(rim).mul(intensity)
    const alpha = std.clamp(rim, 0.0, 1.0)
    return d.vec4f(rgb.x, rgb.y, rgb.z, alpha)
})

// ═══════════════════════════════════════════════════════════════════════════════════════
// The Expr-level builder
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * Apply the iridescent thin-film rim effect. Composition-time Expr builder — see the file header
 * for the notes. A transparent-interior generator (no child): RGB is the rim color, alpha is the
 * band mask; composite over a shape with `screen` / `linearDodge`.
 *
 * @param params      the fragment builder params (reads `uniforms`/`propValues`/`props`/`ctx`)
 * @param sdfSampler  `(uvExpr) → vec4 Expr`: `.r` = signed distance (negative inside)
 * @param options     `volumetric` build-time flag + an optional cheap `gradSampler` for the taps
 */
export function applyThinFilmEffect(
    params: GpuFragmentParams,
    sdfSampler: (uv: Expr) => Expr,
    options?: ThinFilmEffectOptions,
): Expr {
    const {uniforms, propValues, ctx} = params
    const volumetric = options?.volumetric ?? false
    const gradSampler = options?.gradSampler ?? sdfSampler
    const volFlag = floatE(volumetric ? 1 : 0)
    // Animated time: the CPU-accumulated `_animTime` field (shader declares animatedTime:{speed:'speed'}).
    const animTime = params.props.member('_animTime')

    // ── SDF UV + centre tap (+ neighbour taps for the FD gradient when not baked) ────
    const sdfUV = call(sdfSpaceUV, 'sdfSpaceUV', [uniforms.center, uniforms.scale, uniforms.rotation, ctx.uv, ctx.aspect])
    const surf0 = sdfSampler(sdfUV)
    const sdfRaw = surf0.member('r')
    let gradX: Expr
    let gradY: Expr
    if (options?.bakedGradients) {
        gradX = surf0.member('g')
        gradY = surf0.member('b')
    } else {
        const surfX = gradSampler(call(offsetUV, 'offsetUV', [sdfUV, floatE(0.01), floatE(0)]))
        const surfY = gradSampler(call(offsetUV, 'offsetUV', [sdfUV, floatE(0), floatE(0.01)]))
        const grad = call(glassGradient, 'glassGradient', [sdfRaw, surfX.member('r'), surfY.member('r')])
        gradX = grad.member('x')
        gradY = grad.member('y')
    }

    // ── Rim + interference phase ─────────────────────────────────────────────────────
    const shade = call(thinFilmShade, 'thinFilmShade', [
        sdfRaw, uniforms.scale, gradX, gradY, uniforms.edgeSoftness, uniforms.rimWidth,
        uniforms.thickness, uniforms.dispersion, uniforms.hueShift, uniforms.lightAngle, animTime, volFlag,
    ])
    const phase = shade.member('x')
    const rim = shade.member('y')

    // ── Spectrum: rainbow (procedural) or custom (3-color cycle) — compile-time branch ──
    let baseColor: Expr
    if (propValues.mode === 'custom') {
        const cs = typeof propValues.colorSpace === 'number' ? propValues.colorSpace : 0
        const mixFn = colorMixing.mixColorsVariants[cs as keyof typeof colorMixing.mixColorsVariants] ?? colorMixing.mixColorsLinear
        const cp = call(thinFilmCustomParams, 'thinFilmCustomParams', [phase])
        const si = cp.member('x')
        const gate12 = cp.member('y')
        const gate01 = cp.member('z')
        const c01 = call(mixFn, 'mixColors', [uniforms.colorA, uniforms.colorB, si])
        const c12 = call(mixFn, 'mixColors', [uniforms.colorB, uniforms.colorC, si])
        const c20 = call(mixFn, 'mixColors', [uniforms.colorC, uniforms.colorA, si])
        // res = c20; res = mix(res, c12, gate12); res = mix(res, c01, gate01).
        const res = mixExpr(mixExpr(c20, c12, gate12), c01, gate01)
        baseColor = res.member('rgb')
    } else {
        baseColor = call(thinFilmRainbow, 'thinFilmRainbow', [phase])
    }

    return call(thinFilmCompose, 'thinFilmCompose', [baseColor, rim, uniforms.intensity, uniforms.saturation])
}

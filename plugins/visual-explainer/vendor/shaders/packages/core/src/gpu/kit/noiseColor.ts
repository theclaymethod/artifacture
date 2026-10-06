/**
 * Colorization shared by the noise-texture GENERATORS (PerlinNoise, BlockNoise, BlueNoise,
 * FractalNoise, Simplex/Worley/Gabor/…). It maps a grayscale [0,1] noise scalar through the
 * contrast/balance tone controls and the two-color OR multi-stop gradient.
 *
 * Layering mirrors kit/edges.ts: the pure GPU math (`noiseToneKColor`) is a `tgpu.fn`; the
 * Expr-level builders (`mixStopsOrColorsExpr` / `toneAndColorExpr`) run at COMPOSITION time and
 * assemble KitExprs via the composer factories, delegating the multi-stop path to the kit's shared
 * `mixColorStopsRuntime` and the two-color path to `mixColorsVariants`. One color path for every
 * noise texture — no per-shader duplication.
 */
import {mixColorStopsRuntime} from './colorStops'
import {mixColorsVariants, mixColorsLinear} from './colorMixing'
import {toneUnitPivotInverted} from './tone'
import {call, floatE} from '../composer'
import type {Expr} from '../contract'

/** The prop accessors a noise-texture color builder reads (a subset of GpuFragmentParams). */
export interface NoiseColorParams {
    /** Per-prop KitExpr accessors (colorA/colorB, the packed stop arrays, contrast/balance). */
    uniforms: Record<string, Expr>
    /** Per-prop CPU values (post-transform) for compile-time branching (colorSpace, stopCount). */
    propValues: Record<string, unknown>
}

/**
 * Which uniforms hold the two gradient endpoints. Defaults to `colorA` / `colorB`, the fleet-wide
 * naming — override for shaders that name theirs differently (`insideColor`/`outsideColor`,
 * `colorLow`/`colorHigh`), which was the one thing stopping them from adopting this color path and
 * hand-inlining the same dispatch instead.
 *
 * The multi-stop uniform names are fixed by `colorStopsPropConfig`, so they are not options.
 */
export interface EndpointAccessors {
    colorA?: string
    colorB?: string
}

/**
 * Tone-map a [0,1] noise scalar with contrast (around mid-grey) + balance, then INVERT it
 * (`kColor = 1 - k`) so the gradient runs colorA→colorB as the noise rises
 * (`clamp((n-0.5)*(contrast+1)+0.5+balance, 0, 1).oneMinus()`). Pure float (CPU golden-testable).
 *
 * This is an ALIAS of `tone.toneUnitPivotInverted` — the same fn object, so the emitted WGSL is
 * unchanged. The body lives in `kit/tone.ts` with its three sibling tone shapes (see `toneRemap`);
 * the name stays here because ten noise textures and their snapshots reference it.
 */
export const noiseToneKColor = toneUnitPivotInverted

/**
 * Multi-stop-or-two-color dispatch at the gradient parameter `t` (an Expr in [0,1]): the runtime
 * working-space accumulation when >1 stops are active, else the `mixColors` variant for `mode`.
 * `stopCount` / `colorSpace` are read from `propValues` (compile-time).
 */
export function mixStopsOrColorsExpr(params: NoiseColorParams, t: Expr, endpoints: EndpointAccessors = {}): Expr {
    const {uniforms, propValues} = params
    const colorSpaceMode = (propValues.colorSpace as number) ?? 0
    const stopCount = (propValues.stopCount as number) ?? 0
    if (stopCount > 1) {
        return mixColorStopsRuntime(
            t,
            {
                colorsArray: uniforms.colorsArray,
                positionsArray: uniforms.positionsArray,
                convertedColorsArray: uniforms.convertedColorsArray,
                stopCount: uniforms.stopCount,
            },
            colorSpaceMode,
        )
    }
    const variant = mixColorsVariants[colorSpaceMode as keyof typeof mixColorsVariants] ?? mixColorsLinear
    return call(variant, 'mixColors', [uniforms[endpoints.colorA ?? 'colorA'], uniforms[endpoints.colorB ?? 'colorB'], t])
}

/**
 * The full noise-texture color path: contrast/balance tone-map + invert → kColor, then the
 * two-color / multi-stop gradient. `contrast` / `balance` are optional — A/B-only textures
 * (Scratches) omit the tone controls, treated as 0.
 */
export function toneAndColorExpr(params: NoiseColorParams, noise01: Expr, endpoints: EndpointAccessors = {}): Expr {
    const {uniforms} = params
    const contrast = uniforms.contrast ?? floatE(0)
    const balance = uniforms.balance ?? floatE(0)
    const kColor = call(noiseToneKColor, 'noiseToneKColor', [noise01, contrast, balance])
    return mixStopsOrColorsExpr(params, kColor, endpoints)
}

/**
 * Tone mapping curves + the final sRGB OETF:
 *  - reinhard / cineon / aces / agx / neutral — standard HDR→LDR curves;
 *  - hable / unreal;
 *  - linear = passthrough (the renderer maps 'linear' → NoToneMapping, i.e. no clamp);
 *  - linearToSrgb = the sRGB transfer OETF.
 *
 * Each curve is `(color: d.v3f) => d.v3f`. Alpha passthrough is the composer's job.
 *
 * Exposure: baked at 1.0 — the renderer never sets a non-default exposure, so the `color *
 * exposure` terms are identity and omitted (not a math change).
 *
 * Matrices: ACES/AgX are `d.mat3x3f` in COLUMN-major order (matching the ground-truth GLSL
 * `mat3(vec3 col0, vec3 col1, vec3 col2)`; verified d.mat3x3f(9) is column-major + M.mul(v)=M·v).
 */
import {d, std, tgpu} from './index'

export type ToneMappingMode =
    | 'linear' | 'reinhard' | 'cineon' | 'aces' | 'agx' | 'neutral' | 'hable' | 'unreal'

// ─── linear (NoToneMapping — passthrough) ─────────────────────────────────────
export const linear = tgpu.fn([d.vec3f], d.vec3f)((color) => {
    'use gpu'
    // Copy — TGSL forbids returning a reference to an argument (passthrough semantics preserved).
    return d.vec3f(color.x, color.y, color.z)
})

// ─── Reinhard ─────────────────────────────────────────────────────────────────
export const reinhard = tgpu.fn([d.vec3f], d.vec3f)((color) => {
    'use gpu'
    return std.clamp(color.div(color.add(1.0)), d.vec3f(0.0), d.vec3f(1.0))
})

// ─── Cineon (Hejl–Burgess-Dawson optimized) ───────────────────────────────────
export const cineon = tgpu.fn([d.vec3f], d.vec3f)((color) => {
    'use gpu'
    const c = std.max(color.sub(0.004), d.vec3f(0.0))
    const a = c.mul(c.mul(6.2).add(0.5))
    const b = c.mul(c.mul(6.2).add(1.7)).add(0.06)
    return std.pow(a.div(b), d.vec3f(2.2))
})

// ─── ACES Filmic ───────────────────────────────────────────────────────────────
// sRGB => XYZ => D65_2_D60 => AP1 => RRT_SAT  (column-major)
const ACES_INPUT = d.mat3x3f(
    0.59719, 0.07600, 0.02840,
    0.35458, 0.90834, 0.13383,
    0.04823, 0.01566, 0.83777,
)
// ODT_SAT => XYZ => D60_2_D65 => sRGB  (column-major)
const ACES_OUTPUT = d.mat3x3f(
    1.60475, -0.10208, -0.00327,
    -0.53108, 1.10813, -0.07276,
    -0.07367, -0.00605, 1.07602,
)

const rrtAndODTFit = tgpu.fn([d.vec3f], d.vec3f)((v) => {
    'use gpu'
    const a = v.mul(v.add(0.0245786)).sub(0.000090537)
    const b = v.mul(v.add(0.4329510).mul(0.983729)).add(0.238081)
    return a.div(b)
})

export const aces = tgpu.fn([d.vec3f], d.vec3f)((color) => {
    'use gpu'
    let c = color.div(0.6)
    c = ACES_INPUT.mul(c)
    c = rrtAndODTFit(c)
    c = ACES_OUTPUT.mul(c)
    return std.clamp(c, d.vec3f(0.0), d.vec3f(1.0))
})

// ─── AgX (Filament / Blender, rec2020 primaries) ───────────────────────────────
const LINEAR_SRGB_TO_LINEAR_REC2020 = d.mat3x3f(
    0.6274, 0.0691, 0.0164,
    0.3293, 0.9195, 0.0880,
    0.0433, 0.0113, 0.8956,
)
const LINEAR_REC2020_TO_LINEAR_SRGB = d.mat3x3f(
    1.6605, -0.1246, -0.0182,
    -0.5876, 1.1329, -0.1006,
    -0.0728, -0.0083, 1.1187,
)
const AGX_INSET = d.mat3x3f(
    0.856627153315983, 0.137318972929847, 0.11189821299995,
    0.0951212405381588, 0.761241990602591, 0.0767994186031903,
    0.0482516061458583, 0.101439036467562, 0.811302368396859,
)
const AGX_OUTSET = d.mat3x3f(
    1.1271005818144368, -0.1413297634984383, -0.14132976349843826,
    -0.11060664309660323, 1.157823702216272, -0.11060664309660294,
    -0.016493938717834573, -0.016493938717834257, 1.2519364065950405,
)
const AGX_MIN_EV = -12.47393
const AGX_MAX_EV = 4.026069

const agxContrastApprox = tgpu.fn([d.vec3f], d.vec3f)((x) => {
    'use gpu'
    const x2 = x.mul(x)
    const x4 = x2.mul(x2)
    return x4.mul(x2).mul(15.5)
        .sub(x4.mul(x).mul(40.14))
        .add(
            x4.mul(31.96)
                .sub(x2.mul(x).mul(6.868))
                .add(
                    x2.mul(0.4298)
                        .add(x.mul(0.1191).sub(0.00232)),
                ),
        )
})

export const agx = tgpu.fn([d.vec3f], d.vec3f)((color) => {
    'use gpu'
    let c = LINEAR_SRGB_TO_LINEAR_REC2020.mul(color)
    c = AGX_INSET.mul(c)
    c = std.max(c, d.vec3f(1e-10)) // avoid 0 / negatives before log2
    c = std.log2(c)
    c = c.sub(AGX_MIN_EV).div(AGX_MAX_EV - AGX_MIN_EV)
    c = std.clamp(c, d.vec3f(0.0), d.vec3f(1.0))
    c = agxContrastApprox(c)
    c = AGX_OUTSET.mul(c)
    c = std.pow(std.max(c, d.vec3f(0.0)), d.vec3f(2.2)) // linearize
    c = LINEAR_REC2020_TO_LINEAR_SRGB.mul(c)
    return std.clamp(c, d.vec3f(0.0), d.vec3f(1.0))
})

// ─── Neutral (Khronos PBR / modelviewer) ───────────────────────────────────────
const NEUTRAL_START_COMPRESSION = 0.8 - 0.04
const NEUTRAL_DESATURATION = 0.15

export const neutral = tgpu.fn([d.vec3f], d.vec3f)((color) => {
    'use gpu'
    const x = std.min(color.x, std.min(color.y, color.z))
    const offset = std.select(0.04, x - 6.25 * x * x, x < 0.08)
    let c = color.sub(offset)

    const peak = std.max(c.x, std.max(c.y, c.z))
    if (peak < NEUTRAL_START_COMPRESSION) {
        return c
    }

    const dd = 1.0 - NEUTRAL_START_COMPRESSION
    const newPeak = 1.0 - dd * dd / (peak + dd - NEUTRAL_START_COMPRESSION)
    c = c.mul(newPeak / peak)
    const g = 1.0 - 1.0 / (NEUTRAL_DESATURATION * (peak - newPeak) + 1.0)
    return std.mix(c, d.vec3f(newPeak), g)
})

// ─── Hable / Uncharted 2 (renderer.ts applyHableTonemap) ───────────────────────
export const hable = tgpu.fn([d.vec3f], d.vec3f)((color) => {
    'use gpu'
    // Pre-exposure ×16, then Uncharted 2 curve (A=0.15 B=0.50 C=0.10 D=0.20 E=0.02 F=0.30)
    const x = color.mul(16.0)
    const num = x.mul(x.mul(0.15).add(0.05)).add(0.004) // x*(A*x+C*B)+D*E
    const den = x.mul(x.mul(0.15).add(0.50)).add(0.06) // x*(A*x+B)+D*F
    return num.div(den).sub(0.02 / 0.30)
})

// ─── Unreal (renderer.ts applyUnrealTonemap) ───────────────────────────────────
export const unreal = tgpu.fn([d.vec3f], d.vec3f)((color) => {
    'use gpu'
    return color.div(color.add(0.155)).mul(1.019)
})

/** Tone mapping curves keyed by ToneMappingMode. Selected at composition (part of pipeline hash). */
export const tonemapFns = {
    linear,
    reinhard,
    cineon,
    aces,
    agx,
    neutral,
    hable,
    unreal,
} as const

/**
 * Linear-sRGB → sRGB OETF. Applied at the very tail of the final pass, after tone mapping.
 * `mix(a, b, factor)` with a boolean factor is a per-channel select.
 */
export const linearToSrgb = tgpu.fn([d.vec3f], d.vec3f)((color) => {
    'use gpu'
    const a = std.pow(color, d.vec3f(0.41666)).mul(1.055).sub(0.055)
    const b = color.mul(12.92)
    const factor = std.le(color, d.vec3f(0.0031308))
    return std.select(a, b, factor)
})

/**
 * sRGB → linear-sRGB EOTF — the inverse of `linearToSrgb`. A texture sampled without a hardware
 * sRGB view (media textures written from an ImageBitmap/canvas, external video/webcam frames) comes
 * back gamma-encoded; the composition works in linear light and the final pass re-encodes with
 * `linearToSrgb`, so a media/external sample MUST be decoded here first or it renders washed-out.
 * Shared so ImageTexture/WebcamTexture/HTMLInCanvas use one decode. `select(hi, lo, isLow)` is the
 * per-channel branch on the 0.04045 threshold.
 */
export const srgbToLinear = tgpu.fn([d.vec3f], d.vec3f)((color) => {
    'use gpu'
    const hi = std.pow(color.add(d.vec3f(0.055)).div(d.vec3f(1.055)), d.vec3f(2.4))
    const lo = color.div(d.vec3f(12.92))
    const isLow = std.le(color, d.vec3f(0.04045))
    return std.select(hi, lo, isLow)
})

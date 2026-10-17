/**
 * Scalar tone primitives — luminance standards and the small remaps that 30+ shaders inline.
 *
 * LUMA STANDARDS (D-2): the fleet uses BOTH ITU-R BT.709 and BT.601 weights, deliberately in some
 * files and by copy-paste accident in others. Unifying them is a pixel change we are NOT making
 * here: each migrating shader adopts the helper matching the weights it uses TODAY. If you are
 * writing a NEW shader, use {@link luma709} — it is the modern standard and matches the sRGB
 * primaries the rest of the pipeline assumes.
 *
 * `blend.luminance` is the historical alias of {@link luma709} (same weights, same expression
 * form, so the emitted WGSL body is identical); it predates this module and keeps its name for the
 * blend modes that reference it.
 */
import {tgpu, d, std} from './index'
import {hash12} from './noise'

/**
 * Relative luminance, ITU-R BT.709 (0.2126, 0.7152, 0.0722).
 *
 * Written as component multiply-add rather than `std.dot` so the emitted body is character-identical
 * to `blend.luminance`'s (see the module header).
 */
export const luma709 = tgpu.fn([d.vec3f], d.f32)((rgb) => {
    'use gpu'
    return rgb.x * 0.2126 + rgb.y * 0.7152 + rgb.z * 0.0722
})

/**
 * Perceived brightness, ITU-R BT.601 (0.299, 0.587, 0.114) — the "video luma" weights. Kept
 * distinct from {@link luma709} on purpose; see the module header on D-2.
 */
export const luma601 = tgpu.fn([d.vec3f], d.f32)((rgb) => {
    'use gpu'
    return rgb.x * 0.299 + rgb.y * 0.587 + rgb.z * 0.114
})

/*
 * DOT-SPELLED TWINS. {@link luma709} and {@link luma601} are written as component multiply-add to
 * stay character-identical to `blend.luminance`, but most inline luma sites in the fleet spell it
 * `dot(rgb, vec3f(w))`, which resolves to different WGSL. Rather than force every adopter into a
 * snapshot change, both spellings ship. The dot form is the one to reach for in NEW code (it is what
 * the fleet already writes, and it maps to one instruction); the mad form exists for byte-identical
 * migration of the files that spell it out.
 *
 * The values are identical — only the emitted expression differs.
 */

/** {@link luma709} spelled as a dot product. Same weights, same result, different WGSL. */
export const luma709Dot = tgpu.fn([d.vec3f], d.f32)((rgb) => {
    'use gpu'
    return std.dot(rgb, d.vec3f(0.2126, 0.7152, 0.0722))
})

/** {@link luma601} spelled as a dot product. Same weights, same result, different WGSL. */
export const luma601Dot = tgpu.fn([d.vec3f], d.f32)((rgb) => {
    'use gpu'
    return std.dot(rgb, d.vec3f(0.299, 0.587, 0.114))
})

/**
 * Contrast about a pivot, clamped to [0, 1]: `clamp((x - pivot) * contrast + pivot, 0, 1)`.
 * `contrast` of 1 is identity; `pivot` is the value held fixed (0.5 for mid-grey).
 */
export const pivotContrast = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((x, contrast, pivot) => {
    'use gpu'
    return std.clamp((x - pivot) * contrast + pivot, 0.0, 1.0)
})

/** Signed [-1, 1] → unit [0, 1]: `v * 0.5 + 0.5`. The standard noise-to-mask remap. */
export const signedToUnit = tgpu.fn([d.f32], d.f32)((v) => {
    'use gpu'
    return v * 0.5 + 0.5
})

/**
 * Ridge fold of a signed field: `1 - abs(v)`. Turns the zero crossings of a signed noise into
 * creases (peaks at 1), the basis of ridged-multifractal terrain and marble veining.
 */
export const ridged = tgpu.fn([d.f32], d.f32)((v) => {
    'use gpu'
    return 1.0 - std.abs(v)
})

// ─── toneRemap: the noise-texture contrast/balance tail ───────────────────────────────────────
//
// Every procedural texture ends with the same JOB — take a raw field value and turn it into the
// [0,1] parameter a gradient is sampled at, under a `contrast` and a `balance` control — and the
// fleet does that job four incompatible ways. They differ in three real axes (what range the input
// is in, whether contrast is applied additively or multiplicatively, and whether the result is
// inverted so a rising field runs colorA→colorB) plus one shader-specific glow pre-gamma.
//
// The four ARE NOT collapsible into one body: they apply the ops in different orders around
// different pivots, so a single parameterized fn would either change every consumer's pixels or
// compute all four and select. So this ships as a memoized variant table — the `mixColorsVariants`
// shape (C3) — with {@link toneRemap} as the CPU-side resolver over the option record. Each variant
// body is the verbatim op sequence of the consumer it came from, which is what made migrating them
// a rename rather than a pixel change.
//
// D-5: the user-facing `contrast` RANGES stay per-shader (one runs −2…5, another 0.25…4). Unifying
// them is a UX decision, deliberately not bundled with this extraction.

/**
 * Unit-domain, additive contrast, inverted: `1 − clamp((v − 0.5)·(contrast + 1) + 0.5 + balance)`.
 *
 * Contrast pivots about mid-grey and is additive, so 0 is the identity — which is why the shaders on
 * this variant default `contrast` to 0 rather than 1. Balance shifts AFTER the pivot, so it slides
 * the whole tonal range rather than rotating it.
 *
 * The parameter is named `noise01` (not `v`) deliberately: this fn IS `noiseColor.noiseToneKColor`,
 * which every noise texture already emits, and body parameter names appear in the resolved WGSL. The
 * name keeps the alias byte-identical so ten shaders' snapshots did not move.
 */
export const toneUnitPivotInverted = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((noise01, contrast, balance) => {
    'use gpu'
    const k = std.clamp((noise01 - 0.5) * (contrast + 1.0) + 0.5 + balance, 0.0, 1.0)
    return 1.0 - k
})

/**
 * Signed-domain, additive contrast, inverted: scale the raw [−1,1] field, offset it, THEN squash to
 * [0,1] and invert.
 *
 * Working on the signed value before the squash is not cosmetic: contrast about zero on a signed
 * field is contrast about mid-grey on the unit one, but the clamp lands only at the end, so
 * high-contrast values ride further before they clip.
 */
export const toneSignedInverted = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((v, contrast, balance) => {
    'use gpu'
    const adjusted = v * (contrast + 1.0) + balance
    const k = std.clamp(adjusted * 0.5 + 0.5, 0.0, 1.0)
    return 1.0 - k
})

/**
 * Unit-domain, multiplicative contrast, not inverted: expand [0,1] to signed, scale by contrast,
 * offset by balance, squash back.
 *
 * Multiplicative contrast makes 1 the identity, so this variant's `contrast` prop is a gain (0.25…4)
 * rather than an offset. Otherwise the same shape as {@link toneSignedInverted}.
 */
export const toneUnitMultiplicative = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((v, contrast, balance) => {
    'use gpu'
    const signed = v * 2.0 - 1.0
    const adjusted = signed * contrast + balance
    return std.clamp(adjusted * 0.5 + 0.5, 0.0, 1.0)
})

/**
 * Glow pre-gamma, multiplicative contrast, inverted, percent-centred balance:
 * `pow(v, 5/glow)` → pivot contrast → `+ (balance/100 − 0.5)` → invert.
 *
 * The `5/glow` exponent is a SPREAD control, not a brightness one — a small `glow` raises the
 * exponent and pulls the bright region into a tight core, a large one flattens it out toward a wash.
 * Balance arrives as a 0–100 percentage here and is re-centred, so 50 is neutral.
 */
export const toneGlowInverted = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)(
    (v, glow, contrast, balance) => {
        'use gpu'
        const spread = std.pow(v, 5.0 / glow)
        const contrasted = std.clamp((spread - 0.5) * contrast + 0.5, 0.0, 1.0)
        const balanceShift = balance / 100.0 - 0.5
        const balanced = std.clamp(contrasted + balanceShift, 0.0, 1.0)
        return 1.0 - balanced
    })

export interface ToneRemapOptions {
    /** Input range: `unit` for a [0,1] field, `signed` for a raw [−1,1] one. */
    domain: 'unit' | 'signed'
    /** `additive` makes contrast 0 the identity; `multiplicative` makes 1 the identity. */
    contrastMode: 'additive' | 'multiplicative'
    /**
     * Whether to invert the result. Inverted is the convention for gradient parameters: it makes
     * colorA the LOW end of the field, matching how a stop list reads top-to-bottom.
     */
    invert: boolean
    /** Adds the `pow(v, 5/glow)` pre-step and a fourth `glow` argument. */
    glowGamma?: boolean
    /** Balance convention: `plain` adds it directly, `percentCentred` treats it as 0–100 about 50. */
    balance?: 'plain' | 'percentCentred'
}

/** A three-argument tone variant: `(value, contrast, balance) → f32`. */
export type ToneRemapFn = (v: number, contrast: number, balance: number) => number
/** The `glowGamma` variant: `(value, glow, contrast, balance) → f32`. */
export type ToneRemapGlowFn = (v: number, glow: number, contrast: number, balance: number) => number

/**
 * Resolve an option record to the matching tone variant — a CPU/builder-level dispatcher, exactly
 * like `colorMixing.mixColors`. Do NOT call this inside a `'use gpu'` body; call the returned fn.
 *
 * Only the four combinations that exist in the library resolve. An unsupported combination THROWS
 * rather than falling back, because a silent fallback here would be a wrong-looking texture with no
 * error: adding a fifth tone shape means writing its body above, not composing more flags.
 */
export function toneRemap(options: ToneRemapOptions & {glowGamma: true}): ToneRemapGlowFn
export function toneRemap(options: ToneRemapOptions): ToneRemapFn
export function toneRemap(options: ToneRemapOptions): ToneRemapFn | ToneRemapGlowFn {
    const {domain, contrastMode, invert, glowGamma = false, balance = 'plain'} = options
    if (glowGamma) {
        if (domain === 'unit' && contrastMode === 'multiplicative' && invert && balance === 'percentCentred') {
            return toneGlowInverted as unknown as ToneRemapGlowFn
        }
    } else if (balance === 'plain') {
        if (domain === 'unit' && contrastMode === 'additive' && invert) return toneUnitPivotInverted as unknown as ToneRemapFn
        if (domain === 'signed' && contrastMode === 'additive' && invert) return toneSignedInverted as unknown as ToneRemapFn
        if (domain === 'unit' && contrastMode === 'multiplicative' && !invert) return toneUnitMultiplicative as unknown as ToneRemapFn
    }
    throw new Error(
        `toneRemap: no variant for {domain: '${domain}', contrastMode: '${contrastMode}', invert: ${invert}, `
        + `glowGamma: ${glowGamma}, balance: '${balance}'} — add its body to kit/tone.ts rather than approximating.`,
    )
}

/**
 * Always-on ±0.002 hash dither on a FINAL rgb (the LightLeak idiom) — kills banding on long soft
 * ramps. Never apply to a ramp coordinate: wrapped palette bands would jitter. Alpha untouched.
 */
export const rgbDither = tgpu.fn([d.vec4f, d.vec2f, d.vec2f, d.f32], d.vec4f)(
    (base, uv, viewport, animTime) => {
        'use gpu'
        const n = hash12(uv.mul(viewport).add(d.vec2f(animTime, animTime * 1.618)))
        const rgb = std.clamp(base.xyz.add((n - 0.5) * 0.004), d.vec3f(0.0), d.vec3f(1.0))
        return d.vec4f(rgb, base.w)
    })

/**
 * Displacement-sampling helpers — the GPU bodies behind std's `displaceBy(field, {strength,
 * chromatic})` effect (CursorRipples is the first consumer).
 */
import {tgpu, d, std} from './index'

/** The three per-channel sample UVs of a chromatic-split displacement. Explicit $name (WGSL ABI). */
const ChromaticSplitUVs = d.struct({rUV: d.vec2f, gUV: d.vec2f, bUV: d.vec2f}).$name('ChromaticSplitUVs')

/**
 * Per-channel sample UVs from a displacement vector with chromatic split. `strength` is the UI
 * 0–20 range (×0.1 into UV space); displacement is clamped to ±0.15 UV so a driver-fed spike can't
 * fling samples across the frame; `chromaticSplit` spreads the R/B taps ±10% around G. Pure —
 * CPU-executable as a DualFn for golden tests.
 */
export const chromaticDisplaceUVs = tgpu.fn([d.vec2f, d.vec2f, d.f32, d.f32], ChromaticSplitUVs)(
    (uv, disp, strength, chromaticSplit) => {
        'use gpu'
        const scaled = disp.mul(strength * 0.1)
        const maxDisp = 0.15
        const clamped = std.clamp(scaled, d.vec2f(-maxDisp, -maxDisp), d.vec2f(maxDisp, maxDisp))
        const chromaticScale = chromaticSplit * 0.1
        const rUV = uv.sub(clamped.mul(1.0 + chromaticScale))
        const gUV = uv.sub(clamped)
        const bUV = uv.sub(clamped.mul(1.0 - chromaticScale))
        return ChromaticSplitUVs({rUV, gUV, bUV})
    },
)

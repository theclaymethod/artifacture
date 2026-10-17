/**
 * Small GPU helpers shared by the scaffolded shader families.
 *
 * These live here rather than in `gpu/kit/` only because of file ownership during the primitives
 * refactor; anything that earns a second family of consumers should graduate to a namespaced kit
 * module (`cells.cellHash` is the intended long-term home for the hash below).
 */
import {tgpu, d, std} from '../kit'

/**
 * The legacy sin-fract hash, mapping a float to [-1, 1].
 *
 * `fract(sin(x · 12.9898) · 43758.5453)` is the classic GLSL one-liner; the `(· − 0.5) · 2` tail
 * re-centres it. BarShift (`barHash`) and ConcentricSpin (`csHash`) declared this byte-identically,
 * which is what makes deduping it safe.
 *
 * TRAP: this is NOT `noise.hash11` and must not be swapped for it. The bit-exact integer hashes in
 * `kit/noise.ts` produce a different sequence, so substituting one changes every consumer's look.
 * Hash policy (PRIMITIVES.md, D-6) is that existing shaders keep this one and NEW shaders use
 * `noise.hash*`.
 */
export const legacySinHash11 = tgpu.fn([d.f32], d.f32)((x) => {
    'use gpu'
    return (std.fract(std.sin(x * 12.9898) * 43758.5453) - 0.5) * 2.0
})

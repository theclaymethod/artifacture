/**
 * CPU-side texel encoders for uploading raw data into GPU textures.
 *
 * `createDataTexture({format: 'r16float' | 'rgba16float', …})` takes half-float texel bytes
 * (`Uint16Array`), not `Float32Array` — filtering samplers reject `r32float`/`rgba32float`
 * (they need the optional `float32-filterable` feature), so any sampled data texture must be
 * 16-bit. A shader that re-uploads a per-frame field (Shatter's shard data, and future sims)
 * half-encodes each texel in `onBeforeRender` before `tex.write(...)`.
 */

// Float32 → IEEE-754 half-float (Uint16). Standard round-to-nearest-even reference algorithm.
// The scratch views are module-scoped to avoid a per-texel allocation.
const _f32Scratch = new Float32Array(1)
const _i32Scratch = new Int32Array(_f32Scratch.buffer)

export function toHalfFloat(val: number): number {
    // Clamp to the representable half range (±65504) so overflow saturates to the max, not to Inf.
    const v = Math.max(-65504, Math.min(65504, val))
    _f32Scratch[0] = v
    const x = _i32Scratch[0]
    let bits = (x >> 16) & 0x8000
    let m = (x >> 12) & 0x07ff
    const e = (x >> 23) & 0xff
    if (e < 103) return bits
    if (e > 142) {
        bits |= 0x7c00
        bits |= (e === 255 ? 0 : 1) && x & 0x007fffff
        return bits
    }
    if (e < 113) {
        m |= 0x0800
        bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1)
        return bits
    }
    bits |= ((e - 112) << 10) | (m >> 1)
    bits += m & 1
    return bits
}

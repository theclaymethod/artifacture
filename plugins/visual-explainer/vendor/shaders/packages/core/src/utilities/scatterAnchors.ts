/**
 * CPU mirror of `gpu/kit/fields.ts` `spiralScatter` — the organically scattered, gently drifting
 * constellation the mesh-gradient field blends. The anchor positions depend only on
 * count/seed/drift/aspect/time (never on the pixel), so a shader computes them ONCE per frame
 * here and hands the GPU the result through an extraFields array (`scatterFieldAnchored`) instead
 * of every fragment re-deriving 8 × (4 hashes + 4 trig + sqrt).
 *
 * Faithfulness: the GPU hashes bit-cast f32 → u32 (raw WGSL, no CPU DualFn), so this file
 * re-implements them with `Math.fround` + a DataView bitcast and 32-bit wrapping multiplies —
 * bit-exact for the hash/lattice arithmetic. `sin`/`cos`/`sqrt` are the one place the two differ:
 * JS evaluates them in f64 against the GPU's f32 approximations (≈1e-7 UV, far below a texel).
 *
 * Any edit to `spiralScatter` MUST be mirrored here (and vice versa) — the goldens in
 * `__tests__/gpu/scatterAnchors.test.ts` pin the CPU side.
 */
import {GOLDEN, TAU} from '../gpu/kit/constants'

const f = Math.fround
const F_GOLDEN = f(GOLDEN)
const F_TAU = f(TAU)
/** `fields.ts` SCATTER_DRIFT_RATE / SCATTER_MAX — keep in sync. */
export const SCATTER_DRIFT_RATE = 0.11
export const SCATTER_MAX = 8
/** `noise.ts` U32 — `d.f32(4294967295)` rounds to 2^32 in f32. */
const U32 = f(4294967295)

const bitView = new DataView(new ArrayBuffer(4))
/** WGSL `bitcast<u32>(x)` for an f32 value. */
function floatBitsToUint(x: number): number {
    bitView.setFloat32(0, f(x), true)
    return bitView.getUint32(0, true)
}
/** WGSL u32 multiply (wraps mod 2^32). */
function umul(a: number, b: number): number {
    return Math.imul(a >>> 0, b >>> 0) >>> 0
}

/** `noise.ts` hash11 — f32 → [0, 1]. */
export function hash11Cpu(p: number): number {
    const u = floatBitsToUint(f(f(p) * f(3141592653)))
    return f(f(umul(umul(u, u), 3141592653)) / U32)
}

/** `noise.ts` hash22 — vec2f → [0, 1]². */
export function hash22Cpu(x: number, y: number): [number, number] {
    const ux = floatBitsToUint(f(f(x) * f(141421356)))
    const uy = floatBitsToUint(f(f(y) * f(2718281828)))
    const h = (ux ^ uy) >>> 0
    return [f(f(umul(h, 3141592653)) / U32), f(f(umul(h, 1618033988)) / U32)]
}

/**
 * `fields.ts` spiralScatter — one anchor of the constellation in aspect-corrected UV space
 * ([0, aspect] × [0, 1]). Operation order mirrors the GPU body exactly (left-assoc f32 arithmetic).
 */
export function spiralScatterCpu(fi: number, count: number, seed: number, drift: number, aspect: number, animTime: number): [number, number] {
    const theta = f(f(fi * F_GOLDEN) + f(hash11Cpu(f(f(seed * f(0.7311)) + f(1.618))) * F_TAU))
    const r = f(Math.sqrt(f(f(fi + 0.5) / f(count))))
    const jh = hash22Cpu(f(f(fi * f(3.77)) + f(0.917)), f(f(seed * f(1.093)) + f(2.236)))
    const jx = f(f(jh[0] - 0.5) * f(0.26))
    const jy = f(f(jh[1] - 0.5) * f(0.26))
    const ph = hash22Cpu(f(f(fi * f(7.13)) + f(1.618)), f(f(seed * f(0.531)) + f(3.71)))
    const phx = f(ph[0] * F_TAU)
    const phy = f(ph[1] * F_TAU)
    const w1 = f(0.5 + f(hash11Cpu(f(f(f(fi * f(5.417)) + f(seed * f(0.291))) + f(0.917))) * f(0.7)))
    const tw = f(f(animTime * f(SCATTER_DRIFT_RATE)) * w1)
    const dx = f(Math.sin(f(tw + phx)))
    const dy = f(Math.cos(f(f(tw * f(1.37)) + phy)))
    const nx = f(f(f(f(Math.cos(theta)) * r) * f(0.62)) + jx) + f(f(dx * f(drift)) * f(0.16))
    const ny = f(f(f(f(Math.sin(theta)) * r) * f(0.62)) + jy) + f(f(dy * f(drift)) * f(0.16))
    return [f(f(0.5 + f(nx)) * f(aspect)), f(0.5 + f(ny))]
}

/**
 * All 8 anchors packed for the `array<vec4f, 4>` extraField `scatterFieldAnchored` reads:
 * anchor i lives at element `i >> 1`, `.xy` for even i and `.zw` for odd i. 16 floats.
 */
export function packScatterAnchors(count: number, seed: number, drift: number, aspect: number, animTime: number): number[] {
    const out = new Array<number>(SCATTER_MAX * 2)
    for (let i = 0; i < SCATTER_MAX; i++) {
        const [x, y] = spiralScatterCpu(i, count, seed, drift, aspect, animTime)
        out[i * 2] = x
        out[i * 2 + 1] = y
    }
    return out
}

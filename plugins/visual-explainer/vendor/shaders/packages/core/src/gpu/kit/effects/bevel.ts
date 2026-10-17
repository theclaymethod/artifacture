/**
 * Shared bevel-profile math for the metal shape-effect shaders (Chrome, LiquidMetal,
 * BrushedMetal, CarbonFiber).
 *
 * A flat 2D shape gets its dimensional edge from a profile of the surface tilt across the rim:
 * `t` is the bevel progress (0 at the silhouette, 1 where the bevel meets the face) taken from
 * the SDF (`t = clamp(-sdf / bevelWidth, 0, 1)`), and the profile returns **sinθ** of the surface
 * tilt angle — the in-plane magnitude of the normal. `nz = -sqrt(1 - sinθ²)`.
 *
 * Parameterising by sinθ keeps the two profile families cheap and exactly blendable:
 *  - ROUND (`shape = 0`): `sinθ = 1 − t` — an exact quarter-round fillet in distance space.
 *  - MACHINED (`shape = 1`): a steep outer fillet dropping onto a ~46° chamfer plateau, then an
 *    inner knee into the face. The two tangent breaks each catch their own line of light — the
 *    multi-facet edge detail of studio-lit product renders.
 */
import {tgpu, d, std} from '../index'

/** sinθ of the bevel surface tilt at progress `t` ∈ [0,1], blending round → machined. */
export const bevelSin = tgpu.fn([d.f32, d.f32], d.f32)((t, shape) => {
    'use gpu'
    const sRound = 1.0 - t
    const k1 = std.smoothstep(0.0, 0.14, t)
    const k2 = std.smoothstep(0.68, 0.92, t)
    const sMach = std.mix(d.f32(1), 0.72 * (1.0 - k2), k1)
    return std.mix(sRound, sMach, shape)
})

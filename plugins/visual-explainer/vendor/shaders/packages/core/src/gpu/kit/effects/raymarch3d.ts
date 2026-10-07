/**
 * The orthographic 3D-solid march used by the surface-wrap shaders (Form3D).
 *
 * Three pieces, all reusable independently:
 *   - `buildParamThreadedTrace(sdf, opts)` — an Expr-level BUILDER that compiles a self-contained
 *     orthographic sphere-march into a `tgpu.fn` CLOSING OVER the shape's `sdf` (following sdf3d's
 *     `buildRaymarchedFieldFn` pattern — `Loop`→`for`, `If/Break`→`if/break`, `.toVar()`→`let`),
 *     returning hit position / normal / view ray / hit flag as `Distortion3DTrace`.
 *   - `applyUVMode3d` — the surface-UV boundary mode.
 *   - `distortion3dLighting` — the Blinn-Phong + Fresnel shading tail.
 *
 * The SDF is PARAM-THREADED: the shape's rotation/size params ride in as packed `vec4` fn-args
 * (`rp0`/`rp1`/`rp2` + `t`) that the trace passes to `sdf` at every march step and at each
 * tetrahedron-normal tap. Fragment `tgpu.fn`s can't read node uniforms, so this threading is how an
 * animated, per-frame-CPU-driven shape reaches the march body. (An earlier zero-arg variant, which
 * required baking the size params into the fn at build time, has been deleted — it had no
 * consumers.)
 *
 * NOTES:
 *   1. `uvMode` (transformEdges: stretch=0 / transparent=1 / mirror=2 / wrap=3) is a RUNTIME select
 *      chain inside `applyUVMode3d` (a `std.select` ladder over the `uvMode` uniform), NOT
 *      build-time-branched on `propValues.uvMode`. This avoids a 4-way builder branch and keeps the
 *      body a single resolvable artifact.
 *   2. RTT PREMULTIPLY: a child RTT sample comes back PREMULTIPLIED; `distortion3dLighting` treats
 *      its `surfaceColor` as STRAIGHT (`rgb·lit`, alpha = `hit·a·visible`), so the consumer must
 *      `unpremultiplyAlpha` the surface sample first and return STRAIGHT rgba (the final pass
 *      re-premultiplies globally).
 *   3. camDist / cx / cy are computed INSIDE the trace fn (`8 - zoom·0.06`, `1 - center.y`) since the
 *      builder-level `Expr` has no subtract; `glossAmt`/`lightAmt` are simple `.mul` at builder level.
 */
import {tgpu, d, std} from '../index'

/**
 * A raw shape SDF `tgpu.fn`: `(p, rp0, rp1, rp2, t) => f32` — called DIRECTLY inside the trace body
 * (a `'use gpu'` body invokes tgpu.fns directly, never the builder-level `call`). Give each shape's
 * fn a distinct `$name`: the trace calls it through a closure alias, so typegpu can't derive a name
 * from the const and would emit a generic `fn sdf` that collides across two differently-shaped nodes
 * in one composition.
 */
export type ParamThreadedSdf = (p: unknown, rp0: unknown, rp1: unknown, rp2: unknown, t: unknown) => unknown

/** The march budget. `maxDistance` defaults to 20 (the ray gives up past it). */
export interface MarchOptions {
    steps: number
    stepCap: number
    hitEps: number
    maxDistance?: number
}

/** The march result: shape-local hit position, surface normal, view ray direction, hit flag (0/1). */
export const Distortion3DTrace = d.struct({
    hitPos: d.vec3f,
    normal: d.vec3f,
    rd: d.vec3f,
    hit: d.f32,
})

// ═══════════════════════════════════════════════════════════════════════════════════════
// Pure-math body fns
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * UV boundary mode — returns `vec3(finalU, finalV, visible)`. `visible = 0` marks an out-of-bounds
 * sample in TRANSPARENT mode (1). stretch(0) clamps; transparent(1) passes the raw UV (flagged
 * invisible outside 0–1); mirror(2) ping-pongs; wrap(3) repeats. The four out-of-bounds tests are
 * a nested-select AND of the in-bounds tests. Runtime `uvMode` select (see note #1). Resolve-only
 * (structure verified by snapshot).
 */
export const applyUVMode3d = tgpu.fn([d.vec2f, d.f32], d.vec3f)((uv, uvMode) => {
    'use gpu'
    const stretched = std.clamp(uv, d.vec2f(0.0), d.vec2f(1.0))
    const mirrored = std.abs(std.fract(uv.mul(0.5)).mul(2.0).sub(1.0))
    const wrapped = std.fract(uv)

    // transparentVisible = (uv in [0,1]²) ? 1 : 0 — nested AND via chained selects.
    const tv1 = std.select(d.f32(0), d.f32(1), uv.y <= 1.0)
    const tv2 = std.select(d.f32(0), tv1, uv.y >= 0.0)
    const tv3 = std.select(d.f32(0), tv2, uv.x <= 1.0)
    const transparentVisible = std.select(d.f32(0), tv3, uv.x >= 0.0)

    // finalUV = uvMode<0.5 ? stretched : uvMode<1.5 ? uv : uvMode<2.5 ? mirrored : wrapped.
    const fuv2 = std.select(wrapped, mirrored, uvMode < 2.5)
    const fuv1 = std.select(fuv2, uv, uvMode < 1.5)
    const finalUV = std.select(fuv1, stretched, uvMode < 0.5)

    // visible = uvMode<0.5 ? 1 : uvMode<1.5 ? transparentVisible : 1.
    const vis1 = std.select(d.f32(1), transparentVisible, uvMode < 1.5)
    const visible = std.select(vis1, d.f32(1), uvMode < 0.5)

    return d.vec3f(finalUV.x, finalUV.y, visible)
})

/**
 * Blinn-Phong + Fresnel lighting on the marched surface. `surfaceColor` = STRAIGHT child sample;
 * `normal` the tetrahedron normal; `rd` the view ray (viewDir = −rd). `glossAmt`/`lightAmt` are the
 * pre-scaled glossiness/lighting (`·0.005`). Returns STRAIGHT rgba: `rgb = clamp(color·clamp(lit,0,3),0,1)`,
 * `alpha = hit·color.a·uvVisible`. Pure — CPU-golden-testable.
 */
export const distortion3dLighting = tgpu.fn(
    [d.vec4f, d.vec3f, d.vec3f, d.f32, d.f32, d.f32, d.f32], d.vec4f)(
    (surfaceColor, normal, rd, hit, uvVisible, glossAmt, lightAmt) => {
        'use gpu'
        const lightDir = std.normalize(d.vec3f(0.4, 0.7, -0.6))
        const viewDir = rd.mul(-1.0)

        const diffuse = std.clamp(std.dot(normal, lightDir), 0.0, 1.0)
        const halfVec = std.normalize(lightDir.add(viewDir))
        const specPow = glossAmt * 256.0 + 4.0
        const specular = std.pow(std.clamp(std.dot(normal, halfVec), 0.0, 1.0), specPow) * glossAmt * 1.5
        const nDotV = std.clamp(std.dot(normal, viewDir), 0.0, 1.0)
        const fresnel = std.pow(1.0 - nDotV, 3.0) * 0.5 * glossAmt

        const ambient = 0.35
        const lit = std.mix(1.0, ambient + diffuse * 0.65 + specular + fresnel, lightAmt)
        const litClamped = std.clamp(lit, 0.0, 3.0)
        const col = surfaceColor.xyz.mul(litClamped)
        const colClamped = std.clamp(col, d.vec3f(0.0), d.vec3f(1.0))
        const alpha = hit * surfaceColor.w * uvVisible
        return d.vec4f(colClamped.x, colClamped.y, colClamped.z, alpha)
    })

// ═══════════════════════════════════════════════════════════════════════════════════════
// The orthographic march — a tgpu.fn closing over the shape SDF (sdf3d buildRaymarchedFieldFn pattern)
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * Build the orthographic sphere-march + tetrahedron normal into a resolvable
 * `tgpu.fn([d.vec2f, d.f32, d.vec2f, d.f32, d.vec4f, d.vec4f, d.vec4f, d.f32], Distortion3DTrace)` —
 * `(uv, aspect, center, zoom, rp0, rp1, rp2, t)`. The shape's `sdf` is closed over and receives the
 * packed params (`rp0`/`rp1`/`rp2`/`t`) at every march step and every tetrahedron-normal tap; the
 * march budget (`steps`/`stepCap`/`hitEps`/`maxDistance`) is baked build-time. The march loop uses
 * `for`/`if`/`break`/`let`. Left unnamed — the consumer's `call(trace, 'name', …)` pins a WGSL name
 * distinct per shape.
 */
export function buildParamThreadedTrace(sdf: ParamThreadedSdf, opts: MarchOptions) {
    const STEPS = opts.steps, STEP_CAP = opts.stepCap, HIT_EPS = opts.hitEps, MAX_DIST = opts.maxDistance ?? 20
    return tgpu.fn([d.vec2f, d.f32, d.vec2f, d.f32, d.vec4f, d.vec4f, d.vec4f, d.f32], Distortion3DTrace)(
        (uv, aspect, center, zoom, rp0, rp1, rp2, t) => {
            'use gpu'
            const cx = center.x
            const cy = 1.0 - center.y
            const camDist = 8.0 - zoom * 0.06
            const ro = d.vec3f(0.0, 0.0, camDist * -1.0)
            const rd = std.normalize(d.vec3f((uv.x - cx) * aspect, uv.y - cy, 1.5))
            let rayT = d.f32(0)
            let hit = d.f32(0)
            const maxDistF = d.f32(MAX_DIST)
            for (let i = 0; i < STEPS; i++) {
                const p = ro.add(rd.mul(rayT))
                const dd = sdf(p, rp0, rp1, rp2, t) as unknown as number
                if (dd < HIT_EPS) { hit = d.f32(1); break }
                if (rayT > maxDistF) { break }
                rayT = rayT + std.min(dd, STEP_CAP)
            }
            const hitPos = ro.add(rd.mul(rayT))
            const hh = 0.001
            const hn = hh * -1.0
            const k0 = sdf(hitPos.add(d.vec3f(hh, hn, hn)), rp0, rp1, rp2, t) as unknown as number
            const k1 = sdf(hitPos.add(d.vec3f(hn, hn, hh)), rp0, rp1, rp2, t) as unknown as number
            const k2 = sdf(hitPos.add(d.vec3f(hn, hh, hn)), rp0, rp1, rp2, t) as unknown as number
            const k3 = sdf(hitPos.add(d.vec3f(hh, hh, hh)), rp0, rp1, rp2, t) as unknown as number
            const normal = std.normalize(
                d.vec3f(1.0, -1.0, -1.0).mul(k0)
                    .add(d.vec3f(-1.0, -1.0, 1.0).mul(k1))
                    .add(d.vec3f(-1.0, 1.0, -1.0).mul(k2))
                    .add(d.vec3f(1.0, 1.0, 1.0).mul(k3)),
            )
            return Distortion3DTrace({hitPos, normal, rd, hit})
        },
    )
}

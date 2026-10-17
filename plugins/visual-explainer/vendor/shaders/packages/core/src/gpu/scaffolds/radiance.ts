/**
 * scaffolds/radiance — the 2D light-transport COMPUTE kernels: irradiance gathered into a texture.
 *
 * The fragment-side cone gather (`std/paint/radiance.gatherIrradiance`) re-integrates the whole
 * light field per device pixel every frame. But irradiance from an emitting boundary is a SMOOTH
 * field: it can be gathered once, at a modest fixed resolution, and sampled bilinearly — and only
 * re-gathered when something that feeds it moves. This module is that kernel: per texel of an
 * irradiance texture covering the canvas, cast a stratified fan of rays against the shape field and
 * average the lit boundary's radiance over the rays that reach it — an unbiased Monte-Carlo estimate
 * whose texel-scale variance a denoise blur (at field resolution) integrates away.
 *
 * The shape field arrives through one of the three standard sources (the `makeShapeMaskSet`
 * precedent): the analytic SDF fn for the shape type, the uploaded SVG SDF texture (hardware
 * bilinear through a filtering sampler — `textureSampleLevel` is stage-agnostic), or the
 * pre-marched volumetric field texture (through the fn-arg fast sampler, bilinear + far-field
 * extension). A kernel references exactly one layout.
 */
import {tgpu, d, std, effects} from '../kit/index'
import {buildAnalyticSdfFn} from '../kit/sdf'
import {buildFieldSampleGraphArgs} from '../kit/sdf3d'
import {TAU} from '../kit/constants'
import type {TgpuRoot} from 'typegpu'
import {createGuardedCompute, type KitComputePipeline} from '../compute'

const {sdfSpaceUV} = effects.glass

/** The irradiance texture format — filterable, so the fragment samples it bilinearly. */
export const IRRADIANCE_FORMAT = 'rgba16float' as const

/** The fixed capacity of the light list in the params ABI (a list prop's `maxItems` must not exceed it). */
export const MAX_LIGHTS = 8

/** The per-frame params ABI the gather kernels read. */
export const IrradianceParams = d.struct({
    /** Shape placement (transformPosition-stored center). */
    center: d.vec2f,
    /** The lights: position lanes in PLACEMENT (sdfUV) space, color lanes (linear rgb, intensity in .w), live count. */
    lightPos: d.arrayOf(d.vec4f, MAX_LIGHTS),
    lightColor: d.arrayOf(d.vec4f, MAX_LIGHTS),
    lightCount: d.f32,
    scale: d.f32,
    rotation: d.f32,
    aspect: d.f32,
    /** Gather controls. */
    reach: d.f32,
    wrap: d.f32,
    lightRange: d.f32,
    shadowSoftness: d.f32,
    /** One device pixel in field units (hit threshold, minimum step). */
    eps: d.f32,
    /** Texels per side of the (square) irradiance texture. */
    res: d.f32,
    /** Progressive sample index (0 on a fresh scene, +1 per accumulated frame). */
    frame: d.f32,
    /** Rays cast per texel THIS frame (a per-frame budget: burst on a change, fewer while refining). */
    rays: d.f32,
    /** Analytic SDF sub-props (the `_sa*` bundle). */
    saRadius: d.f32, saSides: d.f32, saRounding: d.f32, saInnerRatio: d.f32,
    saRotation: d.f32, saHeight: d.f32, saOffset: d.f32, saAperture: d.f32,
    /** Volumetric field domain (the `_vf*` bundle). */
    vfOriginX: d.f32, vfOriginY: d.f32, vfSpanX: d.f32, vfSpanY: d.f32, vfActiveRes: d.f32, vfRBound: d.f32,
})

const outEntry = {storageTexture: d.textureStorage2d(IRRADIANCE_FORMAT, 'write-only')} as const

export const irradianceAnalyticLayout = tgpu.bindGroupLayout({
    params: {uniform: IrradianceParams},
    outTex: outEntry,
})
export const irradianceSvgLayout = tgpu.bindGroupLayout({
    params: {uniform: IrradianceParams},
    outTex: outEntry,
    sdfSource: {texture: d.texture2d(d.f32)},
    samp: {sampler: 'filtering'},
})
export const irradianceFieldLayout = tgpu.bindGroupLayout({
    params: {uniform: IrradianceParams},
    outTex: outEntry,
    // The volumetric shape's SILHOUETTE distance field (see the jump-flood section) over the
    // marched domain — not the raw marched field, whose outside values are 3D distances (an
    // upper bound on the silhouette distance a 2D march needs).
    silhouetteTex: {texture: d.texture2d(d.f32)},
    samp: {sampler: 'filtering'},
})

type Layout = typeof irradianceAnalyticLayout | typeof irradianceSvgLayout | typeof irradianceFieldLayout

/** A signed-distance source in placement (sdfUV) space. */
type FieldFn = (uv: d.v2f) => number

/**
 * NaN-proof a field read. Texture-backed fields can hold undefined texels (a marched block's edge,
 * a degenerate march) — harmless to a fragment that reads its own pixel, fatal to a gather whose
 * rays sample everywhere: one NaN poisons the texel, the denoise spreads it into a hard box. WGSL
 * min/max return the non-NaN operand (IEEE minNum/maxNum), so this maps NaN → FAR without a
 * foldable `x != x` test. FAR is "no surface here" for a sphere trace.
 */
const FAR = 1000.0
const sane = tgpu.fn([d.f32], d.f32)((v) => {
    'use gpu'
    return std.max(std.min(v, FAR), FAR * -1.0)
}).$name('irradianceSane')

/** Distance from a point to the unit square (0 inside) — continues a texture-backed field beyond it. */
const beyondSquare = tgpu.fn([d.vec2f], d.f32)((uv) => {
    'use gpu'
    const c = std.clamp(uv, d.vec2f(0.0, 0.0), d.vec2f(1.0, 1.0))
    return std.length(uv.sub(c))
}).$name('irradianceBeyondSquare')

/** Analytic source: the baked SDF fn for `shapeType`, sub-props from params. */
export function analyticField(shapeType: string): FieldFn {
    const sdfFn = buildAnalyticSdfFn(shapeType)
    return tgpu.fn([d.vec2f], d.f32)((uv) => {
        'use gpu'
        const p = irradianceAnalyticLayout.$.params
        return sdfFn(uv, p.saRadius, p.saSides, p.saRounding, p.saInnerRatio, p.saRotation, p.saHeight, p.saOffset, p.saAperture).x
    }).$name('irradianceAnalyticField') as unknown as FieldFn
}

/**
 * SVG source: hardware-bilinear sample of the SDF data texture (exact inside its unit square),
 * continued beyond it with a sphere-trace-safe LOWER bound. `border + beyond` — the obvious
 * continuation — is an UPPER bound (triangle inequality), and a march through an upper bound
 * overshoots and skips the shape, differently on each side of the square's edge lines. The shape
 * lives inside the square, so `beyond` (distance to the square) is a lower bound, and so is
 * `border − beyond` (reverse triangle inequality); their max is tight where the border is far from
 * the outline and safe where it touches it.
 */
export const svgField: FieldFn = tgpu.fn([d.vec2f], d.f32)((uv) => {
    'use gpu'
    const border = std.textureSampleLevel(irradianceSvgLayout.$.sdfSource, irradianceSvgLayout.$.samp, uv, d.f32(0)).x
    const beyond = beyondSquare(uv)
    return sane(std.select(border, std.max(beyond, border - beyond), beyond > 0.0))
}).$name('irradianceSvgField') as unknown as FieldFn

/**
 * Volumetric source: the shape's SILHOUETTE distance field — the exact 2D signed distance to the
 * marched outline, jump-flooded over the marched domain (see below) — sampled bilinearly, and
 * outside the domain the largest of three sphere-trace-safe lower bounds (distance to the domain,
 * distance to the bounding circle, the border's silhouette distance less the distance to it).
 *
 * Why not the marched field's own `.r`: outside the silhouette it holds the minimum 3D distance
 * met along the view ray, which is ≥ the projected 2D distance — an UPPER bound that a 2D march
 * overshoots through (accurate beside the shape where the ray samples densely at its depth, badly
 * inflated toward the domain edges where the ray misses the bounding sphere).
 */
export const volumetricField: FieldFn = tgpu.fn([d.vec2f], d.f32)((uv) => {
    'use gpu'
    const p = irradianceFieldLayout.$.params
    const cx = std.clamp(uv.x, p.vfOriginX, p.vfOriginX + p.vfSpanX)
    const cy = std.clamp(uv.y, p.vfOriginY, p.vfOriginY + p.vfSpanY)
    const outside = std.length(d.vec2f(uv.x - cx, uv.y - cy))
    const circle = std.length(d.vec2f(uv.x - 0.5, uv.y - 0.5)) - p.vfRBound
    // Domain-local texture coords of the (clamped) point.
    const tuv = d.vec2f((cx - p.vfOriginX) / p.vfSpanX, (cy - p.vfOriginY) / p.vfSpanY)
    // (…, distance in field units, sign): the bilinear read of both composes to a signed distance
    // that crosses zero at the outline (distance → 0 there, so the sign blend is harmless).
    const sil = std.textureSampleLevel(irradianceFieldLayout.$.silhouetteTex, irradianceFieldLayout.$.samp, tuv, d.f32(0))
    const inDomain = sil.z * sil.w
    // Outside the domain: three lower bounds, the largest wins. The bounding circle alone is NOT
    // enough on a rectangular (SVG-extrude) domain — it pokes past the short sides, where it goes
    // negative and the bound would collapse to the tiny distance-to-domain: a false wall along the
    // long edges. The silhouette field at the clamped border point is exact, so (reverse triangle
    // inequality) `border − outside` bounds it too.
    const beyond = std.max(std.max(outside, circle), inDomain - outside)
    return sane(std.select(inDomain, beyond, outside > 0.0))
}).$name('irradianceVolumetricField') as unknown as FieldFn

// ─── Silhouette distance field: jump-flood over the marched domain ────────────────────────────
//
// Exact 2D signed distance to a volumetric shape's outline, at texel resolution, from the marched
// field's sign alone. Seed pass: every boundary texel (inside with an outside neighbour, or vice
// versa) seeds itself; jump-flood passes with halving steps propagate the nearest seed; every texel
// ends with (seedX, seedY, distance, sign ±1), all in placement (field) units — so the aspect-fit
// RECTANGULAR domain of an SVG extrusion measures isotropically. The texture is sized to the
// irradiance resolution over the marched domain. Runs only when the field re-marches.

export const SilhouetteParams = d.struct({
    vfOriginX: d.f32, vfOriginY: d.f32, vfSpanX: d.f32, vfSpanY: d.f32, vfActiveRes: d.f32, vfRBound: d.f32,
    /** Texels per side of the silhouette texture. */
    res: d.f32,
    /** Jump-flood step for this pass, in texels. */
    step: d.f32,
})

export const silhouetteSeedLayout = tgpu.bindGroupLayout({
    params: {uniform: SilhouetteParams},
    fieldTex: {texture: d.texture2d(d.f32), sampleType: 'unfilterable-float'},
    out: outEntry,
})

export const silhouetteStepLayout = tgpu.bindGroupLayout({
    params: {uniform: SilhouetteParams},
    src: {texture: d.texture2d(d.f32)},
    out: outEntry,
})

const {fieldSampleFastArg} = buildFieldSampleGraphArgs()

/** Inside test of the marched field at a domain-local texel coordinate. */
const silhouetteInside = tgpu.fn([d.f32, d.f32], d.f32)((tx, ty) => {
    'use gpu'
    const p = silhouetteSeedLayout.$.params
    const uv = d.vec2f(p.vfOriginX + (tx + 0.5) / p.res * p.vfSpanX, p.vfOriginY + (ty + 0.5) / p.res * p.vfSpanY)
    const v = fieldSampleFastArg(uv, silhouetteSeedLayout.$.fieldTex, p.vfOriginX, p.vfOriginY, p.vfSpanX, p.vfSpanY, p.vfActiveRes, p.vfRBound).x
    return std.select(d.f32(1), d.f32(-1), v < 0.0)
}).$name('silhouetteInside')

/** Seed: boundary texels seed themselves (distance 0); others start "no seed" (x < 0, far). */
export const silhouetteSeedKernel = tgpu.fn([d.u32, d.u32])((cx, cy) => {
    'use gpu'
    const p = silhouetteSeedLayout.$.params
    const fx = d.f32(cx)
    const fy = d.f32(cy)
    const s0 = silhouetteInside(fx, fy)
    const maxT = p.res - 1.0
    const sL = silhouetteInside(std.max(fx - 1.0, 0.0), fy)
    const sR = silhouetteInside(std.min(fx + 1.0, maxT), fy)
    const sD = silhouetteInside(fx, std.max(fy - 1.0, 0.0))
    const sU = silhouetteInside(fx, std.min(fy + 1.0, maxT))
    const boundary = sL !== s0 || sR !== s0 || sD !== s0 || sU !== s0
    // (seedX, seedY, distance, sign ±1) — all in PLACEMENT (field) units, so a non-square domain
    // (the SVG-extrude aspect-fit rectangle) measures isotropically. Non-boundary texels start
    // with no seed (x = −1), far.
    const sx = p.vfOriginX + (fx + 0.5) / p.res * p.vfSpanX
    const sy = p.vfOriginY + (fy + 0.5) / p.res * p.vfSpanY
    const seed = std.select(d.vec4f(-1.0, -1.0, 60000.0, s0), d.vec4f(sx, sy, 0.0, s0), boundary)
    std.textureStore(silhouetteSeedLayout.$.out, d.vec2u(cx, cy), seed)
}).$name('silhouetteSeed')

/** One jump-flood pass: adopt the nearest seed among the 3×3 neighbours at `step` texels. */
export const silhouetteStepKernel = tgpu.fn([d.u32, d.u32])((cx, cy) => {
    'use gpu'
    const p = silhouetteStepLayout.$.params
    const tx = d.f32(cx)
    const ty = d.f32(cy)
    // This texel's placement-space position (distances are measured in field units).
    const here = d.vec2f(p.vfOriginX + (tx + 0.5) / p.res * p.vfSpanX, p.vfOriginY + (ty + 0.5) / p.res * p.vfSpanY)
    const self = std.textureLoad(silhouetteStepLayout.$.src, d.vec2u(cx, cy), 0)
    let best = d.vec4f(self)
    const maxT = p.res - 1.0
    for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
            const nx = std.clamp(tx + d.f32(i) * p.step, 0.0, maxT)
            const ny = std.clamp(ty + d.f32(j) * p.step, 0.0, maxT)
            const n = std.textureLoad(silhouetteStepLayout.$.src, d.vec2u(d.u32(nx), d.u32(ny)), 0)
            if (n.x >= 0.0) {
                const dist = std.length(n.xy.sub(here))
                if (dist < best.z) { best = d.vec4f(n.x, n.y, dist, best.w) }
            }
        }
    }
    // The sign (.w) is this texel's own, kept from the seed pass.
    std.textureStore(silhouetteStepLayout.$.out, d.vec2u(cx, cy), d.vec4f(best.x, best.y, best.z, self.w))
}).$name('silhouetteStep')

export interface IrradianceKernelOptions {
    /** Sphere-trace step cap per ray. */
    steps: number
    /** Shadow-ray step cap (0 = no shadow rays). */
    shadowSteps: number
    namePrefix: string
}

/**
 * The gather kernel over `layout`, reading the field through `fieldAt`. Per texel: map to screen
 * UV → placement UV; texels inside the shape are pushed to just outside the boundary so bilinear
 * upsampling across the silhouette has valid neighbours; then the stratified ray fan (see the module
 * header) with the point light's Lambert × inverse-square × shadow-ray visibility at each hit; the
 * mean (rgb — every light's color lands where it falls), faded toward `reach`, is stored
 * premultiplied by the outside mask (`.rgb` = E·m, `.a` = m). The estimate is noisy per texel by
 * design — read the result through the denoise blur, never raw, and divide `.rgb` by `.a`.
 */
export function buildIrradianceKernel(layout: Layout, fieldAt: FieldFn, opts: IrradianceKernelOptions) {
    const {steps, shadowSteps, namePrefix} = opts
    // How far a ray travels before it has certainly crossed the shape's extent (field units; the
    // shape lives inside its unit placement square, volumetric domains a little beyond).
    const RAY_SPAN = 3
    const shadows = shadowSteps > 0
    const shadowLoop = Math.max(shadowSteps, 1)
    const lay = layout as typeof irradianceAnalyticLayout

    /** Shadow-ray visibility from a boundary point toward the light (1 = clear). */
    const visibility = tgpu.fn([d.vec2f, d.vec2f, d.f32, d.f32], d.f32)((from, toward, eps, soft) => {
        'use gpu'
        const seg = toward.sub(from)
        const len = std.length(seg)
        const dir = seg.div(std.max(len, 0.0001))
        let vis = d.f32(1)
        let t = eps * 2.0
        for (let k = 0; k < shadowLoop; k++) {
            if (t >= len) { break }
            const dd = fieldAt(from.add(dir.mul(t)))
            vis = std.min(vis, std.clamp(dd / std.max(t * soft, eps), 0.0, 1.0))
            if (vis <= 0.0) { break }
            t += std.max(dd, eps)
        }
        return vis
    }).$name(`${namePrefix}Visibility`)

    return tgpu.fn([d.u32, d.u32])((cx, cy) => {
        'use gpu'
        const p = lay.$.params
        const eps = p.eps
        const uv = d.vec2f((d.f32(cx) + 0.5) / p.res, (d.f32(cy) + 0.5) / p.res)
        const sdfUV = sdfSpaceUV(p.center, p.scale, p.rotation, uv, p.aspect)

        // Texels at or inside the boundary gather from just outside it.
        const d0 = fieldAt(sdfUV)
        // Deep inside the shape the outside mask is exactly 0 (see the store below), so the gather
        // would be multiplied away — skip it. Only the texels that straddle the edge (kept for the
        // bilinear read's neighbours) are pushed outside and gathered.
        if (d0 < eps * -1.0) {
            std.textureStore(lay.$.outTex, d.vec2u(cx, cy), d.vec4f(0.0, 0.0, 0.0, 0.0))
            return
        }
        let o = d.vec2f(sdfUV)
        if (d0 < eps * 2.0) {
            const gx = fieldAt(sdfUV.add(d.vec2f(eps, 0.0))) - d0
            const gy = fieldAt(sdfUV.add(d.vec2f(0.0, eps))) - d0
            const g = std.normalize(d.vec2f(gx, gy + 0.000001))
            o = sdfUV.add(g.mul(eps * 2.0 - d0))
        }
        const start = std.max(fieldAt(o), eps)
        const tMax = start + RAY_SPAN

        // Stratified Monte Carlo: ray i owns the i-th slice of the circle; every ray in this texel
        // lands at the SAME offset within its slice (a Cranley–Patterson rotation), and that offset
        // is the texel's interleaved-gradient value — so the denoise neighbourhood holds evenly
        // spread offsets and reconstructs a near-uniform integration rather than a random one.
        // Across accumulated frames the offset advances by the golden ratio (the R1 sequence).
        const ign = std.fract(52.9829189 * std.fract(d.f32(cx) * 0.06711056 + d.f32(cy) * 0.00583715))
        const u = std.fract(ign + p.frame * 0.6180339887)

        // The ray budget is a per-frame uniform: one stratified sample per equal slice of the circle.
        const rays = d.i32(p.rays)
        const rayStep = TAU / p.rays
        const lightCount = d.i32(p.lightCount)
        let acc = d.vec3f(0.0, 0.0, 0.0)
        for (let i = 0; i < rays; i++) {
            const ang = (d.f32(i) + u) * rayStep
            const dir = d.vec2f(std.cos(ang), std.sin(ang))
            let t = start
            let hitD = d.f32(1)
            for (let s = 0; s < steps; s++) {
                const dd = fieldAt(o.add(dir.mul(t)))
                if (dd < eps) { hitD = dd; break }
                t += std.max(dd, eps)
                if (t > tMax) { break }
            }
            if (hitD < eps) {
                const pos = o.add(dir.mul(t))
                const nx = fieldAt(pos.add(d.vec2f(eps, 0.0))) - hitD
                const ny = fieldAt(pos.add(d.vec2f(0.0, eps))) - hitD
                const n = std.normalize(d.vec2f(nx, ny + 0.000001))
                const hitP = pos.sub(n.mul(std.max(hitD, 0.0)))
                const shadowFrom = hitP.add(n.mul(eps * 2.0))
                // Every light strikes this boundary point: the trace is shared, only the lighting
                // (and its shadow ray) multiplies per light. Each light's color lands where it falls.
                for (let l = 0; l < lightCount; l++) {
                    const lp = p.lightPos[l]
                    const lc = p.lightColor[l]
                    // Light positions arrive ALREADY in placement space (the CPU maps them once per frame;
                    // doing it here would be a cos/sin per light per hit).
                    const lightUV = lp.xy
                    const toL = lightUV.sub(hitP)
                    const dist = std.length(toL)
                    const dirL = toL.div(std.max(dist, 0.0001))
                    const facing = std.clamp((std.dot(n, dirL) + p.wrap) / (1.0 + p.wrap), 0.0, 1.0)
                    // An edge facing away from this light receives nothing — no shadow ray to cast.
                    if (facing > 0.0) {
                        const r = dist / p.lightRange
                        let struck = facing / (1.0 + r * r)
                        if (shadows) {
                            struck = struck * visibility(shadowFrom, lightUV, eps, p.shadowSoftness)
                        }
                        acc = acc.add(lc.xyz.mul(struck * lc.w))
                    }
                }
            }
        }
        // Fade toward `reach` (the visual extent of the spill). Stored PREMULTIPLIED by the outside
        // mask `m` — (E·m, m) — so the denoise and the bilinear read never carry light across the
        // body (interior texels weigh nothing) and the consumer recovers E as r / g.
        const fade = 1.0 - std.smoothstep(p.reach * 0.25, p.reach, std.max(d0, 0.0))
        const m = std.clamp(d0 / eps + 1.0, 0.0, 1.0)
        const irr = std.min(std.max(acc.div(p.rays), d.vec3f(0.0, 0.0, 0.0)), d.vec3f(FAR, FAR, FAR)) // NaN → 0 (see `sane`)
        std.textureStore(lay.$.outTex, d.vec2u(cx, cy), d.vec4f(irr.mul(fade * m), m))
    }).$name(`${namePrefix}Gather`)
}

/** The gather kernel as a guarded 2D compute pass over the res×res irradiance texture. */
export function createIrradiancePass(
    root: TgpuRoot,
    kernel: (cx: number, cy: number) => void,
    opts: {res: number; bindGroup: unknown},
): KitComputePipeline {
    return createGuardedCompute(root, (cx: number, cy: number) => {'use gpu'; kernel(cx, cy)}, {size: [opts.res, opts.res], bindGroup: opts.bindGroup as never})
}

// ─── Progressive accumulation ──────────────────────────────────────────────────────────────────

export const AccumulateParams = d.struct({
    /** Blend weight of the new sample: 1 replaces, 1/(n+1) is the running mean. */
    weight: d.f32,
})

export const accumulateLayout = tgpu.bindGroupLayout({
    sample: {texture: d.texture2d(d.f32)},
    prev: {texture: d.texture2d(d.f32)},
    out: outEntry,
    params: {uniform: AccumulateParams},
})

/** `out = prev + (sample − prev) · weight` — the running mean of a progressive estimate. */
export const accumulateKernel = tgpu.fn([d.u32, d.u32])((cx, cy) => {
    'use gpu'
    const at = d.vec2u(cx, cy)
    const s = std.textureLoad(accumulateLayout.$.sample, at, 0)
    const prev = std.textureLoad(accumulateLayout.$.prev, at, 0)
    const w = accumulateLayout.$.params.weight
    // A fresh estimate (weight 1) REPLACES — never blends with history that may be undefined.
    std.textureStore(accumulateLayout.$.out, at, std.select(prev.add(s.sub(prev).mul(w)), s, w >= 1.0))
}).$name('irradianceAccumulate')

export const copyLayout = tgpu.bindGroupLayout({
    src: {texture: d.texture2d(d.f32)},
    out: outEntry,
})

/** Texture copy (the accumulation's write target back to its read source for the next frame). */
export const copyKernel = tgpu.fn([d.u32, d.u32])((cx, cy) => {
    'use gpu'
    const at = d.vec2u(cx, cy)
    std.textureStore(copyLayout.$.out, at, std.textureLoad(copyLayout.$.src, at, 0))
}).$name('irradianceCopy')

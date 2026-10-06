/**
 * AGENTS — shared utilities for the particle/agent simulation shaders (Particles, Boids,
 * ParticleField). These three run the same render architecture: per-agent state buffers →
 * per-agent additive splat into fixed-point atomic accumulators → full-target resolve. What
 * this module centralizes is the pieces that are genuinely identical across them:
 *
 *   - The AGENT SHAPE menu: how a single agent is rasterized. Every shape is a signed
 *     distance in "heading space" (t along the agent's travel direction, n perpendicular —
 *     for un-oriented consumers pass plain x/y offsets) with either a hard single-texel
 *     anti-aliased edge or a soft Gaussian glow falloff. `makeAgentWeightFn` bakes one shape
 *     into a reusable tgpu.fn a splat kernel calls per texel.
 *   - The CURSOR MAGNET: the Gaussian radial force field the Particles shape effect uses —
 *     the gold-standard "physical" cursor (a force on velocity, so agents get shoved and
 *     take time to spring home, rather than a displaced render target).
 *
 * The integrators are deliberately NOT shared — flocking (Boids), SDF containment
 * (Particles) and image-relief springs (ParticleField) are different simulations that only
 * meet at the render + interaction layer.
 */
import {tgpu, d, std} from './index'
import * as noise from './noise'

// ─── Shape SDFs (heading space: t along travel, n perpendicular) ─────────────

/** Signed distance to an isosceles triangle: tip at t = +hl pointing along the heading, base
 *  (half-width hw) at t = −hl. iq's sdTriangleIsosceles with the apex mapped to the origin. */
export const arrowSdf = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)((t, n, hl, hw) => {
    'use gpu'
    const px = std.abs(n)
    const py = hl - t // 0 at the tip, 2·hl at the base
    const qx = hw
    const qy = hl * 2.0
    const k = std.clamp((px * qx + py * qy) / std.max(qx * qx + qy * qy, 1e-9), 0.0, 1.0)
    const ax = px - qx * k
    const ay = py - qy * k
    const bx = px - qx * std.clamp(px / std.max(qx, 1e-9), 0.0, 1.0)
    const by = py - qy
    const dSq = std.min(ax * ax + ay * ay, bx * bx + by * by)
    const sA = py * qx - px * qy // > 0 inside the slanted edge
    const sB = qy - py // > 0 inside the base
    const inside = std.min(sA, sB) > 0.0
    return std.select(std.sqrt(dSq), -std.sqrt(dSq), inside)
}).$name('agentArrowSdf')

/** Signed distance to a capsule along the heading (segment half-length hl, radius r).
 *  hl = 0 degenerates to a plain disc. */
export const capsuleSdf = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)((t, n, hl, r) => {
    'use gpu'
    const tc = t - std.clamp(t, -hl, hl)
    return std.sqrt(tc * tc + n * n) - r
}).$name('agentCapsuleSdf')

/** Signed distance to a box with half-extents (hl along the heading, hw across it). */
export const boxSdf = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)((t, n, hl, hw) => {
    'use gpu'
    const qx = std.abs(t) - hl
    const qy = std.abs(n) - hw
    const ox = std.max(qx, 0.0)
    const oy = std.max(qy, 0.0)
    return std.sqrt(ox * ox + oy * oy) + std.min(std.max(qx, qy), 0.0)
}).$name('agentBoxSdf')

// ─── Shape registry ──────────────────────────────────────────────────────────
// All dimensions are multiples of the consumer's body half-width `bodyR` (whatever unit its
// splat works in — world or texels). `kind` picks the SDF (0 capsule, 1 arrow, 2 box);
// `soft` = 1 swaps the hard AA edge for the Gaussian glow falloff; `ext` is the radial
// bounding factor (× bodyR) for a cheap reject before evaluating the SDF.
export const AGENT_SHAPES = {
    arrow: {kind: 1, hl: 2.3, hw: 1.0, soft: 0, ext: 2.65},
    streak: {kind: 0, hl: 1.7, hw: 0.8, soft: 0, ext: 2.6},
    dot: {kind: 0, hl: 0.0, hw: 1.0, soft: 0, ext: 1.2},
    square: {kind: 2, hl: 0.9, hw: 0.9, soft: 0, ext: 1.5},
    // Round Gaussian point — oriented consumers stretch it themselves (Boids' comet). 2.1 rather
    // than the geometric tail: the skirt is exp(−(√q/0.75)²), which every consumer's fixed-point
    // gain (≤ 637) truncates to nothing well before √q = 2.1, so a wider reject only buys texels
    // that deposit zero.
    glow: {kind: 0, hl: 0.0, hw: 0.0, soft: 1, ext: 2.1},
} as const
export type AgentShapeName = keyof typeof AGENT_SHAPES

export function resolveAgentShape(name: unknown, fallback: AgentShapeName): AgentShapeName {
    return typeof name === 'string' && name in AGENT_SHAPES ? (name as AgentShapeName) : fallback
}

/** Full menu for oriented consumers (agents with a travel direction — Boids). */
export const orientedShapeOptions = [
    {label: 'Arrow', value: 'arrow'},
    {label: 'Streak', value: 'streak'},
    {label: 'Dot', value: 'dot'},
    {label: 'Square', value: 'square'},
    {label: 'Glow', value: 'glow'},
]
/** Un-oriented subset (point particles — Particles, ParticleField). */
export const pointShapeOptions = [
    {label: 'Dot', value: 'dot'},
    {label: 'Square', value: 'square'},
    {label: 'Glow', value: 'glow'},
]

/**
 * Bake one shape into a per-texel weight fn: (t, n, bodyR, aaW, soft) → coverage in [0, 1].
 * `aaW` is the hard edge's anti-alias half-width in the caller's units (~¾ of a render
 * texel); `soft` mixes toward the Gaussian glow profile — pass the registry's baked 0/1, or
 * a runtime softness uniform (the Particles slider). Hard interiors return exactly 1, so
 * consumers whose alpha curve tops out below opaque should over-drive their fixed-point gain
 * for hard shapes (see Boids).
 */
export function makeAgentWeightFn(shape: string) {
    const s = AGENT_SHAPES[resolveAgentShape(shape, 'dot')]
    const sdFn = s.kind === 1 ? arrowSdf : s.kind === 2 ? boxSdf : capsuleSdf
    const HL = s.hl
    const HW = s.hw
    return tgpu.fn([d.f32, d.f32, d.f32, d.f32, d.f32], d.f32)((t, n, bodyR, aaW, soft) => {
        'use gpu'
        const sd = sdFn(t, n, bodyR * HL, bodyR * HW)
        const wHard = 1.0 - std.smoothstep(-aaW, aaW, sd)
        const gq = std.max(sd, 0.0) / std.max(bodyR * 0.75, 1e-6)
        const wSoft = std.exp(gq * gq * -1.0)
        return std.mix(wHard, wSoft, soft)
    }).$name('agentWeight')
}

/**
 * The FAST sibling of `makeAgentWeightFn`, for splat kernels whose softness is a compile-time
 * constant (the shape registry's own 0/1) and which already computed the radial reject quotient
 * `q = (t² + n²) / bodyR²` to cull the texel. Two things get baked away versus the general fn:
 *
 *   - Only ONE half of the profile is emitted — the hard AA smoothstep, or the Gaussian skirt's
 *     divide + exp. The general fn always evaluates both and mixes, which is the right call only
 *     when `soft` is a live uniform (the Particles / FloatingParticles softness slider).
 *   - For a zero-half-length shape the capsule SDF degenerates to `dist − r`, and `dist` is
 *     already implied by `q` — so the signed distance comes from `sqrt(q)` instead of re-summing
 *     and re-sqrting the offsets inside a general SDF call.
 *
 * Signature is `(q, t, n, bodyR, aaW)`; whichever of `q` / `t,n` the baked shape doesn't need is
 * ignored. Consumers with a runtime softness uniform must keep using `makeAgentWeightFn`.
 */
export function makeAgentTexelWeightFn(shape: string) {
    const s = AGENT_SHAPES[resolveAgentShape(shape, 'dot')]
    const sdFn = s.kind === 1 ? arrowSdf : s.kind === 2 ? boxSdf : capsuleSdf
    const HL = s.hl
    const HW = s.hw
    const isDisc = s.kind === 0 && s.hl === 0
    const soft = s.soft === 1
    if (isDisc) {
        return soft
            ? tgpu.fn([d.f32, d.f32, d.f32, d.f32, d.f32], d.f32)((q, _t, _n, bodyR, _aaW) => {
                'use gpu'
                const sd = bodyR * (std.sqrt(q) - HW)
                const gq = std.max(sd, 0.0) / std.max(bodyR * 0.75, 1e-6)
                return std.exp(gq * gq * -1.0)
            }).$name('agentTexelWeight')
            : tgpu.fn([d.f32, d.f32, d.f32, d.f32, d.f32], d.f32)((q, _t, _n, bodyR, aaW) => {
                'use gpu'
                const sd = bodyR * (std.sqrt(q) - HW)
                return 1.0 - std.smoothstep(-aaW, aaW, sd)
            }).$name('agentTexelWeight')
    }
    return soft
        ? tgpu.fn([d.f32, d.f32, d.f32, d.f32, d.f32], d.f32)((_q, t, n, bodyR, _aaW) => {
            'use gpu'
            const sd = sdFn(t, n, bodyR * HL, bodyR * HW)
            const gq = std.max(sd, 0.0) / std.max(bodyR * 0.75, 1e-6)
            return std.exp(gq * gq * -1.0)
        }).$name('agentTexelWeight')
        : tgpu.fn([d.f32, d.f32, d.f32, d.f32, d.f32], d.f32)((_q, t, n, bodyR, aaW) => {
            'use gpu'
            const sd = sdFn(t, n, bodyR * HL, bodyR * HW)
            return 1.0 - std.smoothstep(-aaW, aaW, sd)
        }).$name('agentTexelWeight')
}

// ─── Oriented comet profile (Boids / ParticleFlow's shared glow stretch) ─────

/** Shape metadata the oriented splat consumers bake: the comet consumers stretch the round
 *  registry glow into a ±1·bodyR segment and widen its reject by one bodyR. */
export function orientedShapeProfile(shape: string, opts?: {comet?: boolean}) {
    const name = resolveAgentShape(shape, 'streak')
    const s = AGENT_SHAPES[name]
    const comet = opts?.comet !== false
    return {
        name,
        soft: s.soft,
        hl: comet && name === 'glow' ? 1.0 : s.hl,
        ext: comet && name === 'glow' ? s.ext + 1.0 : s.ext,
        /** A zero-half-length round shape needs no heading-space rotation (and no comet). */
        symmetric: s.kind === 0 && s.hl === 0 && !(comet && name === 'glow'),
    }
}

/**
 * Bake one oriented shape into the per-texel weight the velocity-heading splat consumers share
 * (Boids, ParticleFlow): the fast baked weight fn wrapped with the glow comet treatment — the
 * along-heading coordinate collapsed over a ±hl segment and a head-bright tail fade. For hard
 * shapes (SOFT = 0) both fold to the identity. Signature `(t, n, bodyR, aaW) → w`.
 */
export function makeOrientedCometWeightFn(shape: string) {
    const p = orientedShapeProfile(shape)
    const weightFn = makeAgentTexelWeightFn(p.name)
    const HL = p.hl
    const SOFT = p.soft
    return tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)((t, n, bodyR, aaW) => {
        'use gpu'
        const hl = bodyR * HL
        // Comet stretch + head-bright tail fade, glow only (SOFT is baked 0/1).
        const tGlow = t - std.clamp(t, -hl, hl)
        const tEval = std.select(t, tGlow, d.f32(SOFT) > 0.5)
        const tk = std.clamp((hl - t) / std.max(hl * 2.0, 1e-6), 0.0, 1.0)
        const bright = 1.0 - 0.55 * tk * d.f32(SOFT)
        // The disc fast path reads its distance straight out of the quotient, so it must be built
        // from the COLLAPSED coordinate — otherwise the comet reverts to a dot.
        const qEval = (tEval * tEval + n * n) / (bodyR * bodyR)
        return weightFn(qEval, tEval, n, bodyR, aaW) * bright
    }).$name('agentCometWeight')
}

// ─── Steering / torque parts (pure math — layouts stay in the consumers) ─────

/** Reynolds steering: desired = normalize(dir)·maxSpeed, steer = desired − vel, clamped to maxForce.
 *  Zero-length `dir` yields zero steer (the caller only passes it when a neighbour was found). */
export const reynoldsSteer = tgpu.fn([d.vec2f, d.vec2f, d.f32, d.f32], d.vec2f)((dir, vel, maxSpeed, maxForce) => {
    'use gpu'
    const len = std.length(dir)
    const desired = std.select(d.vec2f(0.0, 0.0), dir.div(std.max(len, 1e-5)).mul(maxSpeed), len > 1e-5)
    const steer = desired.sub(vel)
    const sl = std.length(steer)
    return std.select(steer, steer.div(std.max(sl, 1e-5)).mul(maxForce), sl > maxForce)
}).$name('agentReynoldsSteer')

/** Per-agent cruise-speed variation (hash of index) so a flock isn't robotic. */
export const cruiseVariation = tgpu.fn([d.f32], d.f32)((fi) => {
    'use gpu'
    return 0.82 + noise.hash11(fi * 0.61803 + 0.13) * 0.4
}).$name('agentCruiseVariation')

/** Per-agent "presence" factor in [0.55, 1.25] (hash of index) — one shared depth-ish cascade
 *  that consumers scale both size and brightness by, so near-reading agents are bigger AND
 *  brighter together (the multi-layer parallax read from a single hash). */
export const presenceVariation = tgpu.fn([d.f32], d.f32)((fi) => {
    'use gpu'
    return 0.55 + noise.hash11(fi * 1.91 + 2.53) * 0.7
}).$name('agentPresenceVariation')

/** Straight-alpha OVER composite of a resolved agent field onto a backdrop color — the plain
 *  un-premultiplied Porter-Duff over, for consumers that layer their field without an RTT. */
export const straightAlphaOver = tgpu.fn([d.vec4f, d.vec4f], d.vec4f)((p, c) => {
    'use gpu'
    const pa = std.clamp(p.w, 0.0, 1.0)
    const outA = pa + c.w * (1.0 - pa)
    const rgb = p.xyz.mul(pa).add(c.xyz.mul(c.w * (1.0 - pa))).div(std.max(outA, 1e-4))
    return d.vec4f(rgb.x, rgb.y, rgb.z, outA)
}).$name('agentStraightAlphaOver')

/** Field-line direction at r̂ from the source: 2D magnetic dipole B ∝ 2(m·r̂)r̂ − m (fieldType 0)
 *  or radial monopole spokes B ∝ r̂ (fieldType 1). */
export const dipoleOrRadialField = tgpu.fn([d.vec2f, d.vec2f, d.f32], d.vec2f)((rhat, axis, fieldType) => {
    'use gpu'
    const mdotr = std.dot(axis, rhat)
    const dipoleB = rhat.mul(2.0 * mdotr).sub(axis)
    return std.select(dipoleB, rhat, fieldType > 0.5)
}).$name('agentDipoleOrRadialField')

/**
 * Nematic restoring torque: `k · sin(2·(target − θ))`. π-periodic, so a director (θ ≡ θ+π) always
 * takes the SHORT way onto the target line — its stable equilibria sit exactly at the two
 * line-aligned angles, no wrap, no wrong-way spins.
 */
export const nematicTorque = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((k, target, theta) => {
    'use gpu'
    return k * std.sin(2.0 * (target - theta))
}).$name('agentNematicTorque')

/**
 * The trail canvas composite the trail-bearing consumers share: a max-with-decay — the crisp new
 * head wins where the agent is now, a fading copy persists where it was. Never saturates, and
 * collapses to the plain splat at `trails` = 0.
 */
export const trailMaxDecay = tgpu.fn([d.vec4f, d.f32, d.vec4f, d.f32], d.vec4f)((col, curA, prev, trails) => {
    'use gpu'
    const prevA = prev.w * trails
    const win = curA >= prevA
    const outA = std.max(curA, prevA)
    const outRGB = std.select(d.vec3f(prev.x, prev.y, prev.z), d.vec3f(col.x, col.y, col.z), win)
    return d.vec4f(outRGB.x, outRGB.y, outRGB.z, outA)
}).$name('agentTrailMaxDecay')

// ─── Camera rows (the projected-3D consumers) ─────────────────────────────────

/** Rotate a world position by the camera matrix rows (built on the CPU, w unused). */
export const applyCameraRows = tgpu.fn([d.vec3f, d.vec4f, d.vec4f, d.vec4f], d.vec3f)((pw, rowX, rowY, rowZ) => {
    'use gpu'
    return d.vec3f(
        rowX.x * pw.x + rowX.y * pw.y + rowX.z * pw.z,
        rowY.x * pw.x + rowY.y * pw.y + rowY.z * pw.z,
        rowZ.x * pw.x + rowZ.y * pw.y + rowZ.z * pw.z,
    )
}).$name('agentApplyCameraRows')

/** Rotate a view-space vector back into world space by Rᵀ (rows are orthonormal). */
export const applyCameraRowsTransposed = tgpu.fn([d.vec3f, d.vec4f, d.vec4f, d.vec4f], d.vec3f)((v, rowX, rowY, rowZ) => {
    'use gpu'
    return d.vec3f(
        rowX.x * v.x + rowY.x * v.y + rowZ.x * v.z,
        rowX.y * v.x + rowY.y * v.y + rowZ.y * v.z,
        rowX.z * v.x + rowY.z * v.y + rowZ.z * v.z,
    )
}).$name('agentApplyCameraRowsT')

// ─── Bilinear texel frame ─────────────────────────────────────────────────────

/** Clamped bilinear tap geometry over a texel grid: corner indices + fractional weights. */
export const BilinearFrame = d.struct({
    x0: d.u32, x1: d.u32, y0: d.u32, y1: d.u32, fx: d.f32, fy: d.f32,
}).$name('AgentBilinearFrame')

/** The clamped index/frac setup every per-agent bilinear textureLoad shares (`uv01` in [0,1] per
 *  axis, `dims` the texture size). The caller owns the four loads (layout access) and the mixes. */
export const bilinearTexelFrame = tgpu.fn([d.vec2f, d.vec2f], BilinearFrame)((uv01, dims) => {
    'use gpu'
    const cu = uv01.x * dims.x - 0.5
    const cv = uv01.y * dims.y - 0.5
    const cx0 = std.floor(cu)
    const cy0 = std.floor(cv)
    return BilinearFrame({
        x0: d.u32(std.clamp(cx0, d.f32(0), dims.x - 1.0)),
        x1: d.u32(std.clamp(cx0 + 1.0, d.f32(0), dims.x - 1.0)),
        y0: d.u32(std.clamp(cy0, d.f32(0), dims.y - 1.0)),
        y1: d.u32(std.clamp(cy0 + 1.0, d.f32(0), dims.y - 1.0)),
        fx: cu - cx0,
        fy: cv - cy0,
    })
}).$name('agentBilinearTexelFrame')

// ─── Cursor physics (the Particles shape effect's gold standard) ─────────────

/** Gaussian falloff of a cursor field at offset `delta` (any 2D space), radius² `radSq`. */
export const cursorFalloff = tgpu.fn([d.vec2f, d.f32], d.f32)((delta, radSq) => {
    'use gpu'
    const dl = std.dot(delta, delta)
    return std.exp(dl / std.max(radSq, 1e-5) * -1.0)
}).$name('agentCursorFalloff')

/**
 * The cursor magnet force: a Gaussian radial push (positive `force`) or pull (negative) on an
 * agent at offset `delta` from the pointer. Apply to VELOCITY (F·dt) — that is what makes the
 * interaction feel physical: agents get shoved, coast, and spring back over time instead of
 * rendering a displaced fisheye.
 */
export const cursorMagnet = tgpu.fn([d.vec2f, d.f32, d.f32], d.vec2f)((delta, radSq, force) => {
    'use gpu'
    const dl = std.max(std.length(delta), 1e-4)
    return delta.div(dl).mul(cursorFalloff(delta, radSq) * force)
}).$name('agentCursorMagnet')

// ─── Spawn parts ──────────────────────────────────────────────────────────────

/**
 * Uniform-scatter spawn: agents distributed evenly across the aspect-corrected screen
 * domain at rest (hash-decorrelated with irrational per-axis strides). Layout ABI:
 * `agents` (vec4f state, xy = position) and `params.aspect`.
 */
export function makeUniformScatterInit(
    layout: {readonly $: {agents: d.v4f[]; params: {readonly aspect: number}}},
    name: string,
) {
    return tgpu.fn([d.u32])((i) => {
        'use gpu'
        const prm = layout.$.params
        const fi = d.f32(i)
        const r = noise.hash33(d.vec3f(fi * 1.6180339 + 0.71, fi * 2.7182818 + 4.17, fi * 3.1415926 + 9.03))
        layout.$.agents[i] = d.vec4f(r.x * prm.aspect, r.y, 0.0, 0.0)
    }).$name(name)
}

/**
 * Ball-cloud spawn for a 3D swarm: agents on hash directions at cube-root-distributed radii
 * (volume-uniform inside the ball), at rest, each carrying a hash seed in pos.w. Irrational
 * per-axis strides decorrelate consecutive indices (linear strides through the fract-based
 * hash leave visible filament alignments). Layout ABI: `pos`/`vel` vec4f state arrays;
 * state written as pos = (xyz, seed), vel = 0.
 */
export function makeBallCloudInit(
    layout: {readonly $: {pos: d.v4f[]; vel: d.v4f[]}},
    name: string,
    cfg?: {radius?: number; zSquash?: number},
) {
    const RAD = cfg?.radius ?? 0.55
    const ZS = cfg?.zSquash ?? 0.8
    return tgpu.fn([d.u32])((i) => {
        'use gpu'
        const fi = d.f32(i)
        const h3 = noise.hash33(d.vec3f(fi * 1.6180339 + 0.71, fi * 2.7182818 + 4.17, fi * 3.1415926 + 9.03))
        const dir = std.normalize(h3.sub(d.vec3f(0.5, 0.5, 0.5)).add(d.vec3f(1e-4, 2e-4, 3e-4)))
        const rad = std.pow(noise.hash11(fi * 2.2360679 + 1.7), d.f32(0.3333)) * RAD
        const seed = noise.hash11(fi * 1.7320508 + 0.37)
        layout.$.pos[i] = d.vec4f(dir.x * rad, dir.y * rad, dir.z * rad * ZS, seed)
        layout.$.vel[i] = d.vec4f(0.0, 0.0, 0.0, 0.0)
    }).$name(name)
}

/**
 * Clustered-formation spawn for a steering swarm: K elongated clusters (one per
 * `agentsPerCluster` agents, at least `minClusters`), each with a shared heading and cruise
 * velocity, jittered per agent — frame one reads as an already-organised flock instead of a
 * uniform scatter that takes seconds to self-organise (pre-running the sim would cost O(N²)
 * per warm-up step). `params.seed` re-rolls the layout at runtime. Layout ABI: `agents`
 * (vec4f = posX, posY, velX, velY), `agit` (f32, zeroed), `params.{count, seed, domainX,
 * maxSpeed}`.
 */
export function makeClusterFormationInit(
    layout: {
        readonly $: {
            agents: d.v4f[]
            agit: number[]
            readonly params: {
                readonly count: number
                readonly seed: number
                readonly domainX: number
                readonly maxSpeed: number
            }
        }
    },
    name: string,
    cfg?: {agentsPerCluster?: number; minClusters?: number},
) {
    const PER = cfg?.agentsPerCluster ?? 250
    const MIN = cfg?.minClusters ?? 3
    const TAU = 6.283185307179586
    return tgpu.fn([d.u32])((i) => {
        'use gpu'
        const prm = layout.$.params
        const fi = d.f32(i)
        const sd = prm.seed * 13.137
        // Cluster assignment: i mod K.
        const flocks = std.max(std.floor(prm.count / d.f32(PER)), d.f32(MIN))
        const c = fi - std.floor(fi / flocks) * flocks
        const rc = noise.hash33(d.vec3f(c * 7.1315 + sd + 0.71, c * 3.7719 + sd + 4.17, c * 9.4103 + sd + 9.03))
        const ang = rc.z * TAU
        const hd = d.vec2f(std.cos(ang), std.sin(ang))
        const center = d.vec2f((0.12 + rc.x * 0.76) * prm.domainX, 0.12 + rc.y * 0.76)
        // Per-agent scatter, elongated along the shared heading (a ribbon, not a blob).
        const ra = noise.hash33(d.vec3f(fi * 1.6180339 + sd + 0.71, fi * 2.7182818 + sd + 4.17, fi * 3.1415926 + sd + 9.03))
        const t = (ra.x - 0.5) * 0.6
        const n = (ra.y - 0.5) * 0.16
        const px = std.clamp(center.x + hd.x * t - hd.y * n, 0.0, prm.domainX)
        const py = std.clamp(center.y + hd.y * t + hd.x * n, 0.0, 1.0)
        const jAng = ang + (ra.z - 0.5) * 0.5
        const sp = prm.maxSpeed * (0.75 + ra.y * 0.25)
        layout.$.agents[i] = d.vec4f(px, py, std.cos(jAng) * sp, std.sin(jAng) * sp)
        layout.$.agit[i] = d.f32(0)
    }).$name(name)
}

/**
 * Resting-director spawn for an orientation swarm: every agent parked at its home (zero
 * offset), a hash-scattered starting angle over the [0, π) director line, zero spin, calm.
 * Layout ABI: `agents` (vec4f = offX, offY, θ, ω), `agit` (f32, zeroed).
 */
export function makeRestingDirectorInit(
    layout: {readonly $: {agents: d.v4f[]; agit: number[]}},
    name: string,
) {
    const PI = 3.141592653589793
    return tgpu.fn([d.u32])((i) => {
        'use gpu'
        const fi = d.f32(i)
        const theta0 = noise.hash11(fi * 1.618034 + 0.31) * PI
        layout.$.agents[i] = d.vec4f(d.f32(0), d.f32(0), theta0, d.f32(0))
        layout.$.agit[i] = d.f32(0)
    }).$name(name)
}

// ─── Stroke-polyline scan (the analytic trail render) ─────────────────────────

/**
 * Bake a per-pixel scan of a recorded stroke polyline as a SMOOTH capsule chain:
 * `(pointsTex, uv, aspect, radius, shrink, softness, viewportH) → vec2(age, coverage)`.
 *
 * The polyline arrives as a `maxPoints`×1 data texture, texel i = (x, y, age∈[0,1),
 * signedWidth); age ≥ 1 marks a dead slot. |w| is the per-point width scale (the pen-pressure
 * analogue) and its SIGN is the link flag — positive = linked to texel i−1, negative = stroke
 * start; the recorder appends a duplicate of the live head so the curve reaches the tip.
 *
 * The spine is the classic midpoint quadratic-Bézier chain: each linked point P_i draws the
 * quadratic around joint P_{i−1} — from mid(P_{i−2},P_{i−1}) to mid(P_{i−1},P_i) with P_{i−1}
 * as control (falling back to the raw endpoint at a stroke start). C1-continuous through the
 * whole path, so a drawn arc reads as a curve, not a chain of chords. Each quadratic is
 * evaluated as `subdivisions` sub-capsules (round-cones with age-shrunk radii); an unlinked
 * survivor is a plain dot.
 *
 * Two accumulators, both chosen for CONTINUITY:
 *   - `minSdf` — plain min-union (adjacent pieces share endpoints/radii, so the union is
 *                already smooth; smooth-min would bulge every overlap into a scallop).
 *   - `age`    — exponentially depth-weighted blend of each joint's age at its closest point:
 *                the stroke a pixel is deepest inside dominates (newest-on-top in spirit at
 *                crossings) but the handoff is a smooth band ~r/4 wide, never a seam.
 * `softness` widens the edge band in radius units on top of the ~1.5px AA floor; a late-life
 * fade (age 0.8→1) removes the pop when a piece is culled.
 */
export function makeStrokePolylineScan(cfg: {maxPoints: number; subdivisions: number; name: string}) {
    const MAX_POINTS = cfg.maxPoints
    const SUBDIVISIONS = cfg.subdivisions
    return tgpu.fn(
        [d.texture2d(d.f32), d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32],
        d.vec2f,
    )((pointsTex, uv, aspect, radius, shrink, softness, viewportH) => {
        'use gpu'
        const px = uv.x * aspect
        const py = uv.y
        const baseRadius = radius * 0.1
        const edgeW = 1.5 / std.max(viewportH, 1.0) + softness * baseRadius
        const sharp = 4.0 / std.max(baseRadius, 0.005) // age-blend falloff: band ~r/4, exponent ≤ 4 (no overflow)
        let minSdf = d.f32(100)
        let ageSum = d.f32(0)
        let wSum = d.f32(0)
        let prev = d.vec4f(0.0, 0.0, 1.0, 0.0)
        let prev2 = d.vec4f(0.0, 0.0, 1.0, 0.0)
        for (let i = 0; i < MAX_POINTS; i++) {
            const cur = std.textureLoad(pointsTex, d.vec2u(d.u32(i), 0), 0)
            if (cur.z < 1.0) {
                const cx = cur.x * aspect
                const cy = cur.y
                // segOK = linked AND previous slot alive (no `&&` in TGSL — multiply the flags).
                const linked = std.select(d.f32(0), d.f32(1), cur.w > 0.0)
                const prevAlive = std.select(d.f32(0), d.f32(1), prev.z < 1.0)
                if (linked * prevAlive > 0.5) {
                    // Quadratic around joint `prev`: S → (control `prev`) → E.
                    const usePrev2 = std.select(d.f32(0), d.f32(1), prev.w > 0.0) * std.select(d.f32(0), d.f32(1), prev2.z < 1.0) > 0.5
                    const jx = prev.x * aspect
                    const jy = prev.y
                    const sx0 = std.select(jx, (prev2.x * aspect + jx) * 0.5, usePrev2)
                    const sy0 = std.select(jy, (prev2.y + jy) * 0.5, usePrev2)
                    const ageS = std.select(prev.z, (prev2.z + prev.z) * 0.5, usePrev2)
                    const widPrev = std.abs(prev.w)
                    const widS = std.select(widPrev, (std.abs(prev2.w) + widPrev) * 0.5, usePrev2)
                    const ex = (jx + cx) * 0.5
                    const ey = (jy + cy) * 0.5
                    const ageE = (prev.z + cur.z) * 0.5
                    const widE = (widPrev + std.abs(cur.w)) * 0.5
                    // Walk the quadratic, testing each sub-chord as a round-cone capsule. One
                    // weighted age contribution per JOINT (at its closest sub-piece) keeps this
                    // at one exp() per texel rather than one per sub-capsule.
                    let sx = sx0
                    let sy = sy0
                    let sAge = ageS
                    let sWid = widS
                    let jMin = d.f32(100)
                    let jAge = d.f32(1)
                    for (let k = 0; k < SUBDIVISIONS; k++) {
                        const t = (d.f32(k) + 1.0) / SUBDIVISIONS
                        const omt = 1.0 - t
                        const bx = omt * omt * sx0 + 2.0 * omt * t * jx + t * t * ex
                        const by = omt * omt * sy0 + 2.0 * omt * t * jy + t * t * ey
                        const bAge = std.mix(ageS, ageE, t)
                        const bWid = std.mix(widS, widE, t)
                        const ra = baseRadius * sWid * (1.0 - sAge * shrink)
                        const rb = baseRadius * bWid * (1.0 - bAge * shrink)
                        const bax = bx - sx
                        const bay = by - sy
                        const tt = std.clamp(((px - sx) * bax + (py - sy) * bay) / std.max(bax * bax + bay * bay, 1e-8), 0.0, 1.0)
                        const dist = std.length(d.vec2f(px - (sx + bax * tt), py - (sy + bay * tt))) - std.mix(ra, rb, tt)
                        if (dist < jMin) {
                            jMin = dist
                            jAge = std.mix(sAge, bAge, tt)
                        }
                        sx = bx
                        sy = by
                        sAge = bAge
                        sWid = bWid
                    }
                    minSdf = std.min(minSdf, jMin)
                    const w = std.exp(jMin * -1.0 * sharp)
                    ageSum = ageSum + jAge * w
                    wSum = wSum + w
                } else {
                    // Lone survivor (stroke start before any link, or its predecessor was culled): a dot.
                    const dist = std.length(d.vec2f(px - cx, py - cy)) - baseRadius * std.abs(cur.w) * (1.0 - cur.z * shrink)
                    minSdf = std.min(minSdf, dist)
                    const w = std.exp(dist * -1.0 * sharp)
                    ageSum = ageSum + cur.z * w
                    wSum = wSum + w
                }
            }
            prev2 = d.vec4f(prev) // copies, not aliases — TGSL forbids reassigning references
            prev = d.vec4f(cur)
        }
        const age = ageSum / std.max(wSum, 1e-20)
        const coverage = (1.0 - std.smoothstep(edgeW * -1.0, edgeW, minSdf)) * (1.0 - std.smoothstep(0.8, 1.0, age))
        return d.vec2f(age, coverage)
    }).$name(cfg.name)
}

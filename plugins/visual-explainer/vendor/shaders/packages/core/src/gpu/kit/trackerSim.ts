/**
 * Tracker-pursuit simulation — the compute machinery behind motion-tracker overlays: a
 * feature-grid scoring pass (the whole frame scored into a coarse grid each frame, so an
 * unlocked tracker always has a concrete target) and a per-tracker pursuit kernel (mean-shift
 * lock-on, band preference via `variance`, global reacquire, crowd-hop, lifespan turnover),
 * over the feedback-trail sim scaffold (ping-pong state rows + a `present` copy the fragment
 * samples + a late-bound child RTT).
 *
 * State-row layout: [0]=head, [1]=meta, [2..2+TRAIL_LEN)=trail ring, [last]=trail AABB
 * (minX,minY,maxX,maxY) — the fragment's per-pixel early-out reads the AABB column.
 */
import type {GpuFragmentParams, GpuComputeNode} from '../contract'
import {createGuardedCompute, type ComputeStep} from '../compute'
import {createFeedbackTrailSim} from '../scaffolds/feedbackSim'
import tgpu from 'typegpu'
import * as d from 'typegpu/data'
import * as std from 'typegpu/std'
import * as constants from './constants'

export const TRACKER_MAX = 64
export const TRACKER_TRAIL_LEN = 12
export const TRACKER_TRAIL_EVERY = 8 // frames between keyframe drops (~7.5/s at 60fps)
export const TRACKER_AABB_COL = 2 + TRACKER_TRAIL_LEN
const MAX_TRACKERS = TRACKER_MAX
const TRAIL_LEN = TRACKER_TRAIL_LEN
const TRAIL_EVERY = TRACKER_TRAIL_EVERY
const AABB_COL = TRACKER_AABB_COL
const STATE_W = AABB_COL + 1
const STATE_FORMAT = 'rgba32float' as const
const FEAT_GRID = 96
const TWO_PI = constants.TWO_PI

// ── Compute bind-group layouts (module scope — kernels close over them) ───────────────────────
// NOTE: the kernels take the child's size from std.textureDimensions(src) — never from CPU-side
// dimensions, which can disagree with the actual RTT allocation (editor zoom, DPR, resize timing)
// and silently shift/scale everything the trackers see.
const TrackParams = d.struct({
    dt: d.f32, trackersF: d.f32,
    agility: d.f32, threshold: d.f32, variance: d.f32, lifespan: d.f32,
})
const featureLayout = tgpu.bindGroupLayout({
    src: {texture: d.texture2d(d.f32)},
    grid: {storageTexture: d.textureStorage2d(STATE_FORMAT, 'write-only')},
    params: {uniform: TrackParams},
})
const trackLayout = tgpu.bindGroupLayout({
    src: {texture: d.texture2d(d.f32)},
    // rgba32float is 'unfilterable-float'; declare it so devices without float32-filterable validate.
    featGrid: {texture: d.texture2d(d.f32), sampleType: 'unfilterable-float'},
    prev: {texture: d.texture2d(d.f32), sampleType: 'unfilterable-float'},
    next: {storageTexture: d.textureStorage2d(STATE_FORMAT, 'write-only')},
    present: {storageTexture: d.textureStorage2d(STATE_FORMAT, 'write-only')},
    params: {uniform: TrackParams},
})

export const trackHash = tgpu.fn([d.f32], d.f32)((x) => {
    'use gpu'
    return std.fract(std.sin(x) * 43758.5453123)
})

/** Per-detect-mode feature score of one child sample (premultiplied RTT texel). */
export function featureScoreFn(mode: string) {
    return tgpu.fn([d.vec4f], d.f32)((c) => {
        'use gpu'
        const a = std.max(c.w, 0.0001)
        const lumaU = std.clamp((c.x * 0.299 + c.y * 0.587 + c.z * 0.114) / a, 0.0, 1.0)
        let score = d.f32(0)
        if (mode === 'alpha') score = c.w
        else if (mode === 'dark') score = (1.0 - lumaU) * std.select(d.f32(0), d.f32(1), c.w > 0.5)
        else if (mode === 'red') score = std.clamp(c.x / a, 0.0, 1.0) * std.select(d.f32(0), d.f32(1), c.x >= c.y) * std.select(d.f32(0), d.f32(1), c.x >= c.z) * std.select(d.f32(0), d.f32(1), c.w > 0.02)
        else if (mode === 'green') score = std.clamp(c.y / a, 0.0, 1.0) * std.select(d.f32(0), d.f32(1), c.y >= c.x) * std.select(d.f32(0), d.f32(1), c.y >= c.z) * std.select(d.f32(0), d.f32(1), c.w > 0.02)
        else if (mode === 'blue') score = std.clamp(c.z / a, 0.0, 1.0) * std.select(d.f32(0), d.f32(1), c.z >= c.x) * std.select(d.f32(0), d.f32(1), c.z >= c.y) * std.select(d.f32(0), d.f32(1), c.w > 0.02)
        else score = lumaU * std.select(d.f32(0), d.f32(1), c.w > 0.02) // 'bright'
        return score
    }).$name(`featureScore_${mode}`)
}

/**
 * Feature-grid kernel: one thread per grid cell, scoring the child at 4 sub-cell taps. The sim
 * kernel scans this grid so every unlocked tracker always has a concrete target.
 */
export function buildFeatureGridKernel(scoreFn: ReturnType<typeof featureScoreFn>) {
    return tgpu.fn([d.u32, d.u32])((gx, gy) => {
        'use gpu'
        const srcDims = std.textureDimensions(featureLayout.$.src)
        const srcW = d.f32(srcDims.x)
        const srcH = d.f32(srcDims.y)
        const g = d.f32(FEAT_GRID)
        const cu = (d.f32(gx) + 0.5) / g
        const cv = (d.f32(gy) + 0.5) / g
        const q = 0.25 / g
        // MAX of the sub-cell taps (not the average): a single small highlight inside an
        // otherwise-dark cell must still register, or trackers never find isolated speckles.
        let score = d.f32(0)
        for (let sy = 0; sy < 2; sy++) {
            for (let sx = 0; sx < 2; sx++) {
                const u = cu + (d.f32(sx) - 0.5) * 2.0 * q
                const v = cv + (d.f32(sy) - 0.5) * 2.0 * q
                const tx = d.u32(std.clamp(u * srcW, d.f32(0), srcW - 1.0))
                const ty = d.u32(std.clamp(v * srcH, d.f32(0), srcH - 1.0))
                score = std.max(score, scoreFn(std.textureLoad(featureLayout.$.src, d.vec2u(tx, ty), 0)))
            }
        }
        std.textureStore(featureLayout.$.grid, d.vec2u(gx, gy), d.vec4f(score, 0.0, 0.0, 1.0))
    }).$name('featureGridScan')
}

/**
 * Per-tracker pursuit kernel. One thread per tracker.
 *
 * TRACKING is mean-shift: the 7×7 window computes the affinity-weighted CENTROID of the content
 * around the tracker and steps toward it — the tracker converges smoothly onto a feature, sticks
 * to it, and rides it as it moves (argmax hopping jittered along edges and off them).
 *
 * VARIANCE: each tracker owns a preferred brightness BAND (re-rolled per generation). Affinity is
 * closeness of the feature's score to that preference, not raw magnitude — so the population
 * spreads across mid-tones and edges instead of dog-piling the absolute brightest highlight.
 * `threshold` is the floor below which content doesn't count as a feature at all.
 *
 * LIFESPAN: a tracker retires after its (jittered) lifespan and reacquires elsewhere via the
 * feature grid — constant, visible turnover. When unlocked it targets the grid cell that best
 * matches its band (distance-discounted), or roams when the frame is empty.
 *
 * ATOMIC (irreducible): this kernel is a serial per-tracker STATE MACHINE — seed → mean-shift
 * pursuit → global reacquire → crowd-hop → retire — whose stages all read and mutate the same
 * row-state registers in order, then commit them in one trail-ring write pass. There is no
 * shared-intermediate seam to split on without duplicating the state loads/stores; the composed
 * slot is the per-mode `scoreFn` part it shares with the feature-grid kernel.
 */
export function buildPursuitKernel(mode: string, scoreFn?: ReturnType<typeof featureScoreFn>) {
    const score = scoreFn ?? featureScoreFn(mode)
    return tgpu.fn([d.u32])((ti) => {
        'use gpu'
        const P = trackLayout.$.params
        const iF = d.f32(ti)

        // Row state from the previous frame. head.w packs hasState + the generation's start
        // frame (genStart + 1; 0 = uninitialized).
        const head = std.textureLoad(trackLayout.$.prev, d.vec2u(d.u32(0), ti), 0)
        const meta = std.textureLoad(trackLayout.$.prev, d.vec2u(d.u32(1), ti), 0)

        let posX = head.x
        let posY = head.y
        let frame = head.z
        let genStart = head.w - 1.0
        let missStreak = meta.x
        let gen = meta.z
        let crowdStreak = meta.w

        // First frame (zero-init state): seed a spread-out starting position.
        if (head.w < 0.5) {
            posX = 0.15 + 0.7 * trackHash(iF * 7.31 + 1.3)
            posY = 0.15 + 0.7 * trackHash(iF * 11.93 + 4.7)
            frame = d.f32(0)
            genStart = d.f32(0)
            missStreak = d.f32(0)
            gen = d.f32(1)
        }
        frame = frame + 1.0

        // Per-generation brightness preference: variance 0 → everyone prefers the peaks;
        // variance 1 → preferences spread across [threshold … 1].
        const minFeat = std.max(P.threshold, 0.02)
        const Lpref = std.max(1.0 - P.variance * trackHash(iF * 6.13 + gen * 0.37 + 2.9), minFeat)

        // ── Local mean-shift: affinity-weighted centroid of the 7×7 window ──
        const srcDims = std.textureDimensions(trackLayout.$.src)
        const srcW = d.f32(srcDims.x)
        const srcH = d.f32(srcDims.y)
        const radius = 0.035 + 0.11 * P.agility
        let sumW = d.f32(0)
        let sumX = d.f32(0)
        let sumY = d.f32(0)
        for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
                const ox = (d.f32(dx) / 3.0) * radius
                const oy = (d.f32(dy) / 3.0) * radius
                const cx01 = std.clamp(posX + ox, 0.02, 0.98)
                const cy01 = std.clamp(posY + oy, 0.02, 0.98)
                const tx = d.u32(std.clamp(cx01 * srcW, d.f32(0), srcW - 1.0))
                const ty = d.u32(std.clamp(cy01 * srcH, d.f32(0), srcH - 1.0))
                const s = score(std.textureLoad(trackLayout.$.src, d.vec2u(tx, ty), 0))
                const gate = std.select(d.f32(0), d.f32(1), s > minFeat)
                const dBand = s - Lpref
                const aff = std.exp(dBand * dBand * -24.0) * gate
                const off = std.sqrt(ox * ox + oy * oy) / std.max(radius, 0.001)
                const w = aff * (1.0 - 0.3 * off)
                sumW = sumW + w
                sumX = sumX + cx01 * w
                sumY = sumY + cy01 * w
            }
        }
        const locked = sumW > 0.8
        let bestX = posX
        let bestY = posY
        if (locked) {
            bestX = sumX / sumW
            bestY = sumY / sumW
        }
        missStreak = std.select(missStreak + 1.0, d.f32(0), locked)

        // ── Global targeting: unlocked trackers pick the grid cell best matching their band
        // (distance-discounted), so every tracker always has somewhere real to go. ──
        if (!locked) {
            const g = d.f32(FEAT_GRID)
            let bestW = d.f32(0)
            let tgtX = posX
            let tgtY = posY
            for (let gy = 0; gy < FEAT_GRID; gy++) {
                for (let gx = 0; gx < FEAT_GRID; gx++) {
                    const cs = std.textureLoad(trackLayout.$.featGrid, d.vec2u(d.u32(gx), d.u32(gy)), 0).x
                    const cGate = std.select(d.f32(0), d.f32(1), cs > minFeat)
                    const dB = cs - Lpref
                    const aff = std.exp(dB * dB * -14.0) * cGate
                    const cx = (d.f32(gx) + 0.5) / g
                    const cy = (d.f32(gy) + 0.5) / g
                    const ddx = cx - posX
                    const ddy = cy - posY
                    const pref = 0.6 + 0.8 * trackHash(iF * 3.17 + d.f32(gx) * 13.71 + d.f32(gy) * 29.37)
                    const wgt = aff * pref / (1.0 + 5.0 * (ddx * ddx + ddy * ddy))
                    if (wgt > bestW) {
                        bestW = wgt
                        tgtX = cx
                        tgtY = cy
                    }
                }
            }
            if (bestW > 0.02) {
                // Jitter the destination inside the cell so arrivals don't stack on centres.
                bestX = std.clamp(tgtX + (trackHash(iF * 5.77 + gen * 2.13) - 0.5) / g, 0.02, 0.98)
                bestY = std.clamp(tgtY + (trackHash(iF * 8.31 + gen * 4.97) - 0.5) / g, 0.02, 0.98)
            } else {
                // Nothing anywhere (blank content): roam on a curving per-tracker heading.
                const ang = trackHash(iF * 13.77 + gen * 3.19) * TWO_PI + std.sin(frame * 0.02 + iF) * 1.4
                bestX = std.clamp(posX + std.cos(ang) * 0.08, 0.03, 0.97)
                bestY = std.clamp(posY + std.sin(ang) * 0.08, 0.03, 0.97)
            }
        }

        // ── Pursuit: agility-limited step toward the centroid/destination ──
        const maxStep = P.dt * (0.15 + 1.4 * P.agility)
        const dX = bestX - posX
        const dY = bestY - posY
        const dist = std.sqrt(dX * dX + dY * dY)
        const stepK = std.min(d.f32(1), maxStep / std.max(dist, 0.00001))
        posX = posX + dX * stepK
        posY = posY + dY * stepK

        // ── Crowding: if a LOWER-index tracker sits on the same spot for a sustained streak,
        // hop a short distance and re-spread along the feature (never across the canvas). ──
        let crowded = d.f32(0)
        const iN = d.i32(ti)
        for (let k = 0; k < iN; k++) {
            const kF = d.f32(k)
            const other = std.textureLoad(trackLayout.$.prev, d.vec2u(d.u32(0), d.u32(k)), 0)
            const odx = other.x - posX
            const ody = other.y - posY
            const near = std.select(d.f32(0), d.f32(1), std.sqrt(odx * odx + ody * ody) < 0.022)
            crowded = std.max(crowded, near * other.w * std.select(d.f32(0), d.f32(1), kF < P.trackersF))
        }
        crowdStreak = std.select(d.f32(0), crowdStreak + 1.0, crowded > 0.5)

        if (crowdStreak > 30.0) {
            const hopAng = trackHash(iF * 9.13 + gen * 5.77 + 2.3) * TWO_PI
            const hopDist = 0.05 + 0.08 * trackHash(iF * 4.71 + gen * 8.11)
            posX = std.clamp(posX + std.cos(hopAng) * hopDist, 0.03, 0.97)
            posY = std.clamp(posY + std.sin(hopAng) * hopDist, 0.03, 0.97)
            gen = gen + 1.0
            genStart = frame
            missStreak = d.f32(0)
            crowdStreak = d.f32(0)
        }

        // ── Lifespan: retire after the (per-generation jittered) lifespan and reacquire —
        // constant turnover, like a compositor cycling through track points. 0 = forever. ──
        const lifeFrames = P.lifespan * 60.0 * (0.7 + 0.6 * trackHash(iF * 4.77 + gen * 1.31))
        const expired = std.select(d.f32(0), d.f32(1), frame - genStart > lifeFrames)
            * std.select(d.f32(0), d.f32(1), P.lifespan > 0.01)
        // Expired, or lost for ~1.5s (roaming found nothing) → full random respawn.
        const lost = std.select(d.f32(0), d.f32(1), missStreak > 90.0)
        if (expired + lost > 0.5) {
            posX = 0.1 + 0.8 * trackHash(iF * 7.31 + gen * 13.7 + frame * 0.013)
            posY = 0.1 + 0.8 * trackHash(iF * 11.93 + gen * 17.3 + frame * 0.019)
            gen = gen + 1.0
            genStart = frame
            missStreak = d.f32(0)
            crowdStreak = d.f32(0)
        }

        // ── Trail ring: copy forward, drop a keyframe every TRAIL_EVERY frames. While copying,
        // accumulate the AABB of the live (same-gen) entries + the current position — the
        // fragment's per-pixel early-out reads it. ──
        const writeIdx = std.floor(frame / d.f32(TRAIL_EVERY)) % d.f32(TRAIL_LEN)
        const shouldWrite = std.select(d.f32(0), d.f32(1), frame % d.f32(TRAIL_EVERY) < 0.5)
        let bbMinX = posX
        let bbMinY = posY
        let bbMaxX = posX
        let bbMaxY = posY
        for (let j = 0; j < TRAIL_LEN; j++) {
            const jF = d.f32(j)
            let e = std.textureLoad(trackLayout.$.prev, d.vec2u(d.u32(2 + j), ti), 0)
            const isSlot = std.select(d.f32(0), d.f32(1), std.abs(jF - writeIdx) < 0.5)
            const doWrite = isSlot * shouldWrite
            e = std.mix(e, d.vec4f(posX, posY, frame, gen), doWrite)
            std.textureStore(trackLayout.$.next, d.vec2u(d.u32(2 + j), ti), e)
            std.textureStore(trackLayout.$.present, d.vec2u(d.u32(2 + j), ti), e)
            const live = std.select(d.f32(0), d.f32(1), std.abs(e.w - gen) < 0.5) * std.select(d.f32(0), d.f32(1), e.z > 0.5)
            bbMinX = std.min(bbMinX, std.mix(posX, e.x, live))
            bbMinY = std.min(bbMinY, std.mix(posY, e.y, live))
            bbMaxX = std.max(bbMaxX, std.mix(posX, e.x, live))
            bbMaxY = std.max(bbMaxY, std.mix(posY, e.y, live))
        }
        const bbOut = d.vec4f(bbMinX, bbMinY, bbMaxX, bbMaxY)
        std.textureStore(trackLayout.$.next, d.vec2u(d.u32(AABB_COL), ti), bbOut)
        std.textureStore(trackLayout.$.present, d.vec2u(d.u32(AABB_COL), ti), bbOut)

        const headOut = d.vec4f(posX, posY, frame, genStart + 1.0)
        const metaOut = d.vec4f(missStreak, sumW, gen, crowdStreak)
        std.textureStore(trackLayout.$.next, d.vec2u(d.u32(0), ti), headOut)
        std.textureStore(trackLayout.$.present, d.vec2u(d.u32(0), ti), headOut)
        std.textureStore(trackLayout.$.next, d.vec2u(d.u32(1), ti), metaOut)
        std.textureStore(trackLayout.$.present, d.vec2u(d.u32(1), ti), metaOut)
    }).$name('trackerPursuit')
}





/**
 * The whole compute half as one part: feature-grid scoring pass → tracker pursuit sim.
 * Both consume the child RTT, which binds LATE (bindInputs — it only exists after boundary
 * allocation). `mode` is the compile-time detect prop value; the scalar slots are per-frame
 * CPU prop names.
 */
export function createTrackerPursuitSim(slots: {
    mode: string
    trackers: string
    agility: string
    threshold: string
    variance: string
    lifespan: string
}): GpuComputeNode {
    return (params: GpuFragmentParams) => {
        const {childNode, gpu, getCpuValue} = params
        if (!childNode) return null
        const root = gpu?.root
        if (!root) return null // GPU-free resolve/tests: fragment falls back to passthrough.

        const scoreFn = featureScoreFn(slots.mode)
        const featureKernel = buildFeatureGridKernel(scoreFn)
        const trackKernel = buildPursuitKernel(slots.mode, scoreFn)

        const paramsBuf = root.createUniform(TrackParams)
        // The tracker rows are a state-texture feedback sim: ping-pong state + a `present` copy
        // the fragment samples + a late-bound child — the scaffold owns that plumbing. Specific
        // here: the state texture is a ROW per tracker (not a pixel grid), and the feature grid
        // is an orientation-independent texture written by a second pass, so it's declared as a
        // plain texture + a static bind group.
        const sim = createFeedbackTrailSim(params, {
            size: [STATE_W, MAX_TRACKERS],
            format: STATE_FORMAT,
            textures: {grid: FEAT_GRID},
            bindGroups: ({childTexture, display, textures}, read, write) => root.createBindGroup(trackLayout, {
                src: childTexture, featGrid: textures.grid,
                prev: read.state, next: write.state, present: display, params: paramsBuf.buffer,
            } as never),
            staticGroups: ({childTexture, textures}) => root.createBindGroup(featureLayout, {
                src: childTexture, grid: textures.grid, params: paramsBuf.buffer,
            } as never),
        })
        if (!sim) return null

        const featurePipeline = createGuardedCompute(root, (gx: number, gy: number) => {'use gpu'; featureKernel(gx, gy)}, {size: [FEAT_GRID, FEAT_GRID]})
        const simPipeline = createGuardedCompute(root, (ti: number) => {'use gpu'; trackKernel(ti)}, {size: [MAX_TRACKERS]})

        return {
            outputs: {childTexture: sim.childTexture, trackState: sim.display},
            bindInputs: sim.bindInputs,
            getComputeNodes: (frameParams: unknown): ComputeStep[] | null =>
                sim.tick(frameParams, ({groups, shared, dt}) => {
                    paramsBuf.write({
                        dt,
                        trackersF: (getCpuValue(slots.trackers) as number) ?? 4,
                        agility: (getCpuValue(slots.agility) as number) ?? 0.5,
                        threshold: (getCpuValue(slots.threshold) as number) ?? 0.15,
                        variance: (getCpuValue(slots.variance) as number) ?? 0.5,
                        lifespan: (getCpuValue(slots.lifespan) as number) ?? 6,
                    })
                    return [featurePipeline.with(shared as never), simPipeline.with(groups as never)]
                }),
        }
    }
}

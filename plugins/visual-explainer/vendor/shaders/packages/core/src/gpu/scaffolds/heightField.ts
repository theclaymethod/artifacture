/**
 * Height-field surface machine: a z = h(x, y) surface raymarched in perspective into screen-space
 * UV/mask + lighting maps, with an optional interactive wave-equation ripple layer riding on top.
 *
 * Three generalized pieces, each a factory over compile-time config:
 *
 *   - `buildSpectralHeightField(waveType, octaves, cursorEnabled)` — the global heightfield
 *     h(u, v): an octave spectrum in one of three families (0 = warped fractal, 1 = sine banks,
 *     2 = ridge), edge-pinned, plus (when enabled) a bilinear tap of the wave-equation snapshot.
 *   - `makeWaveEquationKernel()` — the damped 2D wave-equation propagation step over a fixed
 *     WAVE_GRID² field with a Gaussian cursor injection (CursorRipples-style, speed-scaled).
 *   - `makeHeightFieldMarchKernel(...)` — the slab-clamped fixed-step march + bisection
 *     refinement + 3-tap lighting normal + kit/edges boundary routing, writing a uvMask map
 *     (hitU, hitV, coverage) and a lit map.
 *
 * The march CORE is ATOMIC (irreducible): the slab-clamped fixed-step march, the bisection
 * refinement, and the 3-tap lighting normal all serially re-evaluate ONE shared intermediate —
 * the baked height fn — against loop-carried state (`prevDiff`, `tLow/tHigh`); splitting those
 * stages into parts would either duplicate the heightfield taps or thread the whole loop state
 * through every part boundary. The SEPARABLE stages are data/config: the spectral families bake
 * through `buildSpectralHeightField`, edge handling routes through kit/edges, and the camera
 * basis arrives CPU-resolved in the params uniform (no per-thread camera trig).
 *
 * The consumer owns: state-buffer allocation (`createWaveStateBuffers`), ping-pong orchestration,
 * output-texture allocation, per-frame CPU parameter derivation (camera, cursor projection,
 * settle detection), and dispatch policy. Bind groups are created against the exported layouts.
 */
import {tgpu, d, std, edges, noise, constants} from '../kit'
import {createGuardedCompute, createStateBuffer, type KitComputePipeline, type GuardedComputeOptions} from '../compute'
import type {TgpuRoot} from 'typegpu'

const TWO_PI = constants.TWO_PI

// ── Grid + propagation constants ────────────────────────────────────────────────────────────────

export const WAVE_GRID = 256
export const WAVE_CELLS = WAVE_GRID * WAVE_GRID
const WAVE_MAX = WAVE_GRID - 1
/** World half-extent the wave grid spans: world uv ±WAVE_HALFEXTENT maps onto the grid 0..1. */
export const WAVE_HALFEXTENT = 3
/** Working bound on |wave snapshot| — the slab widening budget while a ripple is live. */
export const CURSOR_WAVE_BOUND = 6
// Single source of truth for the propagation decay: the params-struct `decay` value, the kernel's
// per-step dampFactor, and the settle time below all derive from these two, so tuning the decay
// can't desync a consumer's settle estimate from the actual damping.
export const WAVE_DECAY = 10
export const WAVE_DECAY_PER_STEP = 0.004
const WAVE_DAMP = 1 - WAVE_DECAY * WAVE_DECAY_PER_STEP
/** Wave-field settle time implied by the decay: ms after the last injection at which the
 *  propagation has damped below 1e-6 and can no longer move the surface. */
export const WAVE_SETTLE_MS = WAVE_DAMP >= 1 ? Infinity : Math.min(30000, (Math.log(1e-6) / Math.log(Math.max(WAVE_DAMP, 0.001))) * 16.67)

// ── March constants ─────────────────────────────────────────────────────────────────────────────

/** Far cap on the ray parameter — also the range near/far cutoff props map onto. */
export const MARCH_FAR = 15
/** Slack added to the height slab so a zero-amplitude (perfectly flat) surface still has a
 *  crossable slab, and bilinear wave taps at the slab boundary can't fall outside it. */
export const HEIGHT_SLAB_PAD = 0.02
export const HEIGHT_FIELD_STATE_FORMAT = 'rgba16float' as const

// ── Per-frame params (CPU-resolved camera + lighting + cursor projection) ───────────────────────

export const HeightFieldParams = d.struct({
    amp: d.f32, freq: d.f32, seed: d.f32, edgePin: d.f32, cursorIntensity: d.f32, t: d.f32,
    aspect: d.f32, focal: d.f32,
    camPos: d.vec3f, camForward: d.vec3f, camRight: d.vec3f, camUp: d.vec3f,
    lighting: d.f32, glossiness: d.f32, highlights: d.f32, lightX: d.f32, lightY: d.f32, lightZ: d.f32, lightColor: d.vec3f,
    nearCutoff: d.f32, farCutoff: d.f32,
    cursorWaveX: d.f32, cursorWaveY: d.f32, mouseSpeed: d.f32, dt: d.f32, decay: d.f32, radius: d.f32, waveSpeed: d.f32,
    // |z| bound on the surface — the raymarch clamps its span to this slab. `cursorActive` is 1 only
    // while the ripple field is still above the settle threshold; at 0 the wave taps are skipped and
    // the slab narrows back to the base amplitude.
    heightEnvelope: d.f32, cursorActive: d.f32,
})

/** Everything in {@link HeightFieldParams}, as plain numbers / number-triples. */
export interface HeightFieldParamsInput {
    amp: number; freq: number; seed: number; edgePin: number; cursorIntensity: number; t: number
    aspect: number; focal: number
    camPos: [number, number, number]; camForward: [number, number, number]
    camRight: [number, number, number]; camUp: [number, number, number]
    lighting: number; glossiness: number; highlights: number
    lightX: number; lightY: number; lightZ: number; lightColor: [number, number, number]
    nearCutoff: number; farCutoff: number
    cursorWaveX: number; cursorWaveY: number; mouseSpeed: number; dt: number
    decay: number; radius: number; waveSpeed: number
    heightEnvelope: number; cursorActive: number
}

export interface HeightFieldParamsUniform {
    /** The GPU buffer — pass as the `params` entry of the exported layouts' bind groups. */
    buffer: unknown
    write(p: HeightFieldParamsInput): void
}

/** Create the params uniform + a plain-number write helper (the d.vec3f packing lives here). */
export function createHeightFieldParamsUniform(root: TgpuRoot): HeightFieldParamsUniform {
    const u = root.createUniform(HeightFieldParams)
    return {
        buffer: u.buffer,
        write: (p: HeightFieldParamsInput) => u.write({
            ...p,
            camPos: d.vec3f(...p.camPos),
            camForward: d.vec3f(...p.camForward),
            camRight: d.vec3f(...p.camRight),
            camUp: d.vec3f(...p.camUp),
            lightColor: d.vec3f(...p.lightColor),
        }),
    }
}

// ── Bind-group layouts ──────────────────────────────────────────────────────────────────────────

// Wave-equation propagation: reads current (readSrc) + writes the ping-pong target AND readBuf
// (a stable snapshot the raymarch samples).
export const waveEquationLayout = tgpu.bindGroupLayout({
    readSrc: {storage: d.arrayOf(d.f32, WAVE_CELLS), access: 'readonly'},
    writeBuf: {storage: d.arrayOf(d.f32, WAVE_CELLS), access: 'mutable'},
    readBuf: {storage: d.arrayOf(d.f32, WAVE_CELLS), access: 'mutable'},
    params: {uniform: HeightFieldParams},
})
// Raymarch: reads the wave snapshot + params, writes the two output maps.
export const heightFieldMarchLayout = tgpu.bindGroupLayout({
    readBuf: {storage: d.arrayOf(d.f32, WAVE_CELLS), access: 'readonly'},
    params: {uniform: HeightFieldParams},
    uvMaskTex: {storageTexture: d.textureStorage2d(HEIGHT_FIELD_STATE_FORMAT, 'write-only')},
    litTex: {storageTexture: d.textureStorage2d(HEIGHT_FIELD_STATE_FORMAT, 'write-only')},
})

/** Allocate the three f32 wave-field state buffers (ping A, pong B, stable snapshot). */
export function createWaveStateBuffers(root: TgpuRoot) {
    return {
        bufferA: createStateBuffer(root, d.f32, WAVE_CELLS),
        bufferB: createStateBuffer(root, d.f32, WAVE_CELLS),
        readBuf: createStateBuffer(root, d.f32, WAVE_CELLS),
    }
}

// ── Spectral heightfield ────────────────────────────────────────────────────────────────────────

/** Global heightfield (any u,v). waveType (0 fractal / 1 sine / 2 ridge) + octaveCount +
 *  cursorEnabled baked. Reads params + (when cursorEnabled) the wave snapshot via manual bilinear. */
export function buildSpectralHeightField(waveType: number, octaveCount: number, cursorEnabled: boolean) {
    // Octave weights are 0.5^i → the normalization total is a geometric series, computed HERE as
    // a folded JS constant. (An in-body `let totalWeight = 0` accumulator types as i32 and
    // TRUNCATES the f32 weights on +=, so octaves > 1 divided by 1 instead of 1.5+ — overdriving
    // the surface — while also spamming implicit-conversion warnings.)
    const invTotalWeight = 1 / (2 - Math.pow(0.5, Math.max(octaveCount, 1) - 1))
    return tgpu.fn([d.vec2f], d.f32)((uv) => {
        'use gpu'
        const p = heightFieldMarchLayout.$.params
        const u = uv.x
        const v = uv.y
        const amp = p.amp
        const freq = p.freq
        const seedU = p.seed
        let waveVal = d.f32(0.0)
        if (waveType === 1) {
            let accSin = d.f32(0.0)
            for (let i = 0; i < octaveCount; i++) {
                const iF = d.f32(i)
                const scale = std.exp2(iF)
                const weight = std.exp2(iF * -1.0)
                const cu = std.cos(iF * 1.111)
                const su = std.sin(iF * 1.111)
                const ru = u * cu - v * su
                const phase = ru * freq * scale * TWO_PI + p.t * (1.0 + iF * 0.2) + seedU * (1.0 + iF * 0.5)
                accSin = accSin + std.sin(phase) * weight
            }
            waveVal = accSin * invTotalWeight
        } else if (waveType === 2) {
            let accR = d.f32(0.0)
            for (let i = 0; i < octaveCount; i++) {
                const iF = d.f32(i)
                const scale = std.exp2(iF)
                const weight = std.exp2(iF * -1.0)
                const driftX = std.cos(iF * 2.39996)
                const driftY = std.sin(iF * 2.39996)
                const coord = d.vec2f(u * freq * scale + p.t * (driftX * 0.3) + seedU, v * freq * scale + p.t * (driftY * 0.3) + seedU * 0.7)
                accR = accR + noise.mxNoiseFloat2(coord) * weight
            }
            const n = accR * invTotalWeight
            waveVal = (1.0 - std.abs(n)) * 2.0 - 1.0
        } else {
            const warpFreq = freq * 0.5
            const wx = noise.mxNoiseFloat2(d.vec2f(u * warpFreq + p.t * 0.1 + seedU, v * warpFreq + seedU * 1.3))
            const wy = noise.mxNoiseFloat2(d.vec2f(u * warpFreq + seedU + 17.3, v * warpFreq + p.t * 0.07 + seedU + 31.1))
            const wu = u + wx * 0.4
            const wv = v + wy * 0.4
            let accW = d.f32(0.0)
            for (let i = 0; i < octaveCount; i++) {
                const iF = d.f32(i)
                const scale = std.exp2(iF)
                const weight = std.exp2(iF * -1.0)
                const driftX = std.cos(iF * 2.39996)
                const driftY = std.sin(iF * 2.39996)
                const coord = d.vec2f(wu * freq * scale + p.t * (driftX * 0.3) + seedU, wv * freq * scale + p.t * (driftY * 0.3) + seedU * 0.7)
                accW = accW + noise.mxNoiseFloat2(coord) * weight
            }
            waveVal = accW * invTotalWeight
        }
        const cu = (u - 0.5) * 2.0
        const cv = (v - 0.5) * 2.0
        const inner = std.max(std.abs(cu), std.abs(cv))
        const pinFalloff = std.smoothstep(0.6, 1.0, inner)
        const pinMask = std.mix(d.f32(1.0), 1.0 - pinFalloff, p.edgePin)
        const baseHeight = waveVal * amp * pinMask
        if (cursorEnabled) {
            // The 4 storage loads are the per-call cost driver (a march thread calls this ~40× and a
            // whole grid of threads does so), and they contribute nothing once the ripple field has
            // damped below the settle threshold. `cursorActive` is uniform across the dispatch, so
            // this branch is fully coherent.
            let ripple = d.f32(0.0)
            if (p.cursorActive > 0.5) {
                const H = d.f32(WAVE_HALFEXTENT)
                const waveU = (uv.x - 0.5) / H + 0.5
                const waveV = (uv.y - 0.5) / H + 0.5
                const Nm1 = d.f32(WAVE_MAX)
                const gx = std.clamp(waveU, 0.0, 1.0) * Nm1
                const gy = std.clamp(waveV, 0.0, 1.0) * Nm1
                const ix = d.u32(std.clamp(gx, 0.0, Nm1))
                const iy = d.u32(std.clamp(gy, 0.0, Nm1))
                const ix1 = std.min(ix + d.u32(1), d.u32(WAVE_MAX))
                const iy1 = std.min(iy + d.u32(1), d.u32(WAVE_MAX))
                const fx = gx - std.floor(gx)
                const fy = gy - std.floor(gy)
                const W = d.u32(WAVE_GRID)
                const v00 = heightFieldMarchLayout.$.readBuf[iy * W + ix]
                const v10 = heightFieldMarchLayout.$.readBuf[iy * W + ix1]
                const v01 = heightFieldMarchLayout.$.readBuf[iy1 * W + ix]
                const v11 = heightFieldMarchLayout.$.readBuf[iy1 * W + ix1]
                const waveSample = std.mix(std.mix(v00, v10, fx), std.mix(v01, v11, fx), fy)
                ripple = waveSample * (p.cursorIntensity * 0.05)
            }
            return baseHeight + ripple
        } else {
            // The else keeps exactly ONE reachable return when cursorEnabled is baked true —
            // a bare tail return would emit as dead code after the branch's return (the
            // "code is unreachable" WGSL warning; see the sdf3d sdfFn chain note).
            return baseHeight
        }
    }).$name('spectralHeightField')
}

// ── Wave-equation propagation kernel ────────────────────────────────────────────────────────────

/** Damped wave-equation propagation kernel factory (per ping-pong direction): a stencil step +
 *  Gaussian injection at the CPU-projected cursor grid position.
 *
 *  ATOMIC (irreducible): a serial stencil algorithm — each texel's next value is one coupled
 *  expression over its 4-neighbour Laplacian, the previous ping-pong state, the damping and the
 *  injection, with the CFL-bound clamp applied to the SAME intermediate; there is no separable
 *  stage that two consumers could share without re-deriving the recurrence. */
export function makeWaveEquationKernel() {
    return tgpu.fn([d.u32, d.u32])((cx, cy) => {
        'use gpu'
        if (cx > d.u32(0) && cx < d.u32(WAVE_MAX) && cy > d.u32(0) && cy < d.u32(WAVE_MAX)) {
            const p = waveEquationLayout.$.params
            const gs = d.u32(WAVE_GRID)
            const idx = cy * gs + cx
            const left = waveEquationLayout.$.readSrc[idx - d.u32(1)]
            const right = waveEquationLayout.$.readSrc[idx + d.u32(1)]
            const up = waveEquationLayout.$.readSrc[idx - gs]
            const down = waveEquationLayout.$.readSrc[idx + gs]
            const center = waveEquationLayout.$.readSrc[idx]
            const sum = left + right + up + down
            const prev = waveEquationLayout.$.writeBuf[idx]
            const dampFactor = 1.0 - p.decay * WAVE_DECAY_PER_STEP
            const k2 = 0.5 * (p.waveSpeed * p.waveSpeed)
            const lap = sum - center * 4.0
            let next = (center * 2.0 + lap * k2 - prev) * dampFactor
            const cellU = (d.f32(cx) + 0.5) / d.f32(WAVE_GRID)
            const cellV = (d.f32(cy) + 0.5) / d.f32(WAVE_GRID)
            const ddx = cellU - p.cursorWaveX
            const ddy = cellV - p.cursorWaveY
            const distSq = ddx * ddx + ddy * ddy
            const influenceRadius = p.radius * 3.0
            if (distSq < influenceRadius * influenceRadius && p.mouseSpeed > 0.01) {
                const influence = std.exp((distSq / std.max(p.radius * p.radius, d.f32(0.0001))) * -1.0)
                next = next - influence * p.mouseSpeed * p.dt * 3.0
            }
            // heightEnvelope (the raymarch slab clamp) budgets for |field| ≤ CURSOR_WAVE_BOUND. Forcing
            // analysis says it settles far below that, but k2 sits exactly on the 2D CFL limit at
            // waveSpeed = 1, so enforce the bound rather than assume it — otherwise a marginal blow-up
            // would push crests outside the slab and get silently clipped.
            const bound = d.f32(CURSOR_WAVE_BOUND)
            next = std.clamp(next, bound * -1.0, bound)
            waveEquationLayout.$.writeBuf[idx] = next
            waveEquationLayout.$.readBuf[idx] = next
        }
    }).$name('waveEquationStep')
}

// ── Height-field raymarch kernel ────────────────────────────────────────────────────────────────

export interface HeightFieldMarchOptions {
    /** Spectral family: 0 warped fractal, 1 sine banks, 2 ridge. */
    waveType: number
    octaveCount: number
    /** kit/edges routing on the hit UV: 0 clamp, 1 transparent, 2 mirror, 3 wrap. */
    edgeMode: number
    lightingEnabled: boolean
    cursorEnabled: boolean
    /** Fixed march steps across the height slab + bisection refinements. */
    marchSteps: number
    marchRefine: number
    /** Compute-grid dimensions (baked — the grid is sized once at composition). */
    computeW: number
    computeH: number
}

/** Raymarch kernel factory. All options are baked compile-time config. */
export function makeHeightFieldMarchKernel(opts: HeightFieldMarchOptions) {
    const {waveType, octaveCount, edgeMode, lightingEnabled, cursorEnabled, marchSteps, marchRefine, computeW, computeH} = opts
    const heightFn = buildSpectralHeightField(waveType, octaveCount, cursorEnabled)
    return tgpu.fn([d.u32, d.u32])((cx, cy) => {
        'use gpu'
        const p = heightFieldMarchLayout.$.params
        // Standalone: use the compute pixel coord as the input screen UV (no upstream-UV chaining).
        const screenU = (d.f32(cx) + 0.5) / d.f32(computeW)
        const screenV = (d.f32(cy) + 0.5) / d.f32(computeH)
        const ndcX = (screenU - 0.5) * 2.0 * p.aspect
        const ndcY = (screenV - 0.5) * 2.0 * -1.0
        const rayDir = std.normalize(p.camForward.mul(p.focal).add(p.camRight.mul(ndcX)).add(p.camUp.mul(ndcY)))

        // The surface provably lives inside z ∈ [-heightEnvelope, +heightEnvelope], so solve the
        // ray/slab entry+exit and march ONLY that span instead of [0, camDistance+slack]. Two wins:
        // no steps are spent in guaranteed-empty air, and the per-step distance shrinks even at half
        // the old step count — which is what removes the grazing-ray tunnelling (steps larger than
        // the wave amplitude stepping clean over crests near the horizon).
        const envelope = p.heightEnvelope
        const dzSign = std.select(d.f32(-1.0), d.f32(1.0), rayDir.z >= 0.0)
        const dzSafe = dzSign * std.max(std.abs(rayDir.z), d.f32(1e-6))
        const tTop = (envelope - p.camPos.z) / dzSafe
        const tBot = (envelope * -1.0 - p.camPos.z) / dzSafe
        const tEnter = std.max(std.min(tTop, tBot), d.f32(0.0))
        const tExit = std.min(std.max(tTop, tBot), d.f32(MARCH_FAR))

        // Miss defaults. The UV falls back to the far-plane projection so it stays continuous with the
        // marched-but-missed neighbours across the horizon (both regions carry mask 0, but the map is
        // bilinearly sampled, so a discontinuity there would bleed a wrong UV into the silhouette).
        const farPos = p.camPos.add(rayDir.mul(d.f32(MARCH_FAR)))
        let hit = d.f32(0.0)
        let finalT = d.f32(MARCH_FAR)
        let hitU = farPos.x * 0.5 + 0.5
        let hitV = farPos.y * 0.5 + 0.5
        let lit = d.vec3f(1.0, 1.0, 1.0)

        if (tExit > tEnter) {
            const stepSize = (tExit - tEnter) / d.f32(marchSteps)
            let tMarch = tEnter
            const pStart = p.camPos.add(rayDir.mul(tEnter))
            let prevDiff = pStart.z - heightFn(d.vec2f(pStart.x * 0.5 + 0.5, pStart.y * 0.5 + 0.5))
            for (let s = 0; s < marchSteps; s++) {
                tMarch = tMarch + stepSize
                const pos = p.camPos.add(rayDir.mul(tMarch))
                const h = heightFn(d.vec2f(pos.x * 0.5 + 0.5, pos.y * 0.5 + 0.5))
                const diff = pos.z - h
                if (diff < 0.0 && prevDiff > 0.0) {
                    hit = 1.0
                    break
                }
                prevDiff = diff
            }
            // Bisection + the 3-tap lighting normal are only meaningful on a crossing; on a miss the
            // ray keeps the far-plane defaults above, matching the slab-miss branch — the two miss
            // regions are adjacent across the horizon and the map is bilinearly sampled, so they
            // must agree.
            if (hit > 0.5) {
                let tLow = tMarch - stepSize
                let tHigh = tMarch
                for (let r = 0; r < marchRefine; r++) {
                    const tMid = (tLow + tHigh) * 0.5
                    const pMid = p.camPos.add(rayDir.mul(tMid))
                    const dMid = pMid.z - heightFn(d.vec2f(pMid.x * 0.5 + 0.5, pMid.y * 0.5 + 0.5))
                    if (dMid > 0.0) {
                        tLow = tMid
                    } else {
                        tHigh = tMid
                    }
                }
                finalT = (tLow + tHigh) * 0.5
                const hitPos = p.camPos.add(rayDir.mul(finalT))
                hitU = hitPos.x * 0.5 + 0.5
                hitV = hitPos.y * 0.5 + 0.5
                if (lightingEnabled) {
                    const normalEps = 0.01
                    const hC = heightFn(d.vec2f(hitU, hitV))
                    const hR = heightFn(d.vec2f(hitU + normalEps, hitV))
                    const hUp = heightFn(d.vec2f(hitU, hitV + normalEps))
                    const dhdu = (hR - hC) / normalEps
                    const dhdv = (hUp - hC) / normalEps
                    const nrm = std.normalize(d.vec3f(dhdu * -0.5, dhdv * -0.5, 1.0))
                    const lightDir = std.normalize(d.vec3f(p.lightX, p.lightY, p.lightZ))
                    const viewDir = rayDir.mul(-1.0)
                    const diffuse = std.clamp(std.dot(nrm, lightDir), 0.0, 1.0)
                    const halfVec = std.normalize(lightDir.add(viewDir))
                    const specPow = p.glossiness * 128.0 + 4.0
                    const specular = std.pow(std.clamp(std.dot(nrm, halfVec), 0.0, 1.0), specPow) * p.highlights
                    const ambient = d.vec3f(0.4, 0.4, 0.4)
                    const tintedDiffuse = p.lightColor.mul(diffuse * 0.6)
                    const tintedSpec = p.lightColor.mul(specular)
                    const totalLight = ambient.add(tintedDiffuse).add(tintedSpec)
                    lit = std.clamp(std.mix(d.vec3f(1.0, 1.0, 1.0), totalLight, p.lighting), d.vec3f(0.0, 0.0, 0.0), d.vec3f(3.0, 3.0, 3.0))
                }
            }
        }

        // Edge handling on the hit UV (RTT samplers Y-flip → flip V first). edgeMode baked.
        const rawSampleUV = d.vec2f(hitU, 1.0 - hitV)
        let finalUV = d.vec2f(rawSampleUV.x, rawSampleUV.y)
        let outOfBoundsMask = d.f32(1.0)
        if (edgeMode === 2) {
            finalUV = edges.edgeMirrorUV(rawSampleUV)
        } else if (edgeMode === 3) {
            finalUV = edges.edgeWrapUV(rawSampleUV)
        } else if (edgeMode === 1) {
            const inside = rawSampleUV.x >= 0.0 && rawSampleUV.x <= 1.0 && rawSampleUV.y >= 0.0 && rawSampleUV.y <= 1.0
            outOfBoundsMask = std.select(d.f32(0.0), d.f32(1.0), inside)
        } else {
            finalUV = std.clamp(rawSampleUV, d.vec2f(0.0, 0.0), d.vec2f(1.0, 1.0))
        }

        const CUTOFF_RANGE = d.f32(MARCH_FAR)
        const edgeAA = 0.05
        const nearT = p.nearCutoff * CUTOFF_RANGE
        const farT = p.farCutoff * CUTOFF_RANGE
        const nearMask = std.smoothstep(nearT - edgeAA, nearT + edgeAA, finalT)
        const farMask = std.smoothstep(farT + edgeAA, farT - edgeAA, finalT)
        const finalMask = hit * outOfBoundsMask * (nearMask * farMask)

        std.textureStore(heightFieldMarchLayout.$.uvMaskTex, d.vec2u(cx, cy), d.vec4f(finalUV.x, finalUV.y, finalMask, 0.0))
        std.textureStore(heightFieldMarchLayout.$.litTex, d.vec2u(cx, cy), d.vec4f(lit, 0.0))
    }).$name('heightFieldMarch')
}

// ── Pass builder ────────────────────────────────────────────────────────────────────────────────

/** Wrap a `(cx, cy)` kernel into a guarded compute pass (the `'use gpu'` dispatch wrapper). */
export function createKernelPass(root: TgpuRoot, kernel: unknown, opts: GuardedComputeOptions = {}): KitComputePipeline {
    const k = kernel as (cx: number, cy: number) => void
    return createGuardedCompute(root, (cx: number, cy: number) => {'use gpu'; k(cx, cy)}, opts)
}

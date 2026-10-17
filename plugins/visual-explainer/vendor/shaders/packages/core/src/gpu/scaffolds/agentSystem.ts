/**
 * `createAgentSystem` — the particle/agent SIMULATION HARNESS.
 *
 * Five shaders (Boids, MagneticFilings, FloatingParticles, Particles, ParticleField) run the same
 * render architecture: per-agent state in storage buffers → a per-agent additive splat into
 * fixed-point atomic accumulators → one full-target resolve that reads-and-zeroes them and writes
 * an rgba16f texture the fragment bilinear-upsamples. What was ~85% identical between them is not
 * the physics — it is the *plumbing*: allocating one buffer per layout entry, the output texture +
 * `registerComputeTexture` + cleanup, the uniform, the bind group, four `createGuardedCompute`
 * wrappers, the `initialized` latch, and the per-frame nodes array.
 *
 * WHAT THIS HARNESS DOES NOT OWN, DELIBERATELY:
 *
 *   - **The kernels.** Every kernel stays a module-scope `tgpu.fn` in its shader file, written
 *     against the shader's own `tgpu.bindGroupLayout`. That is not a compromise, it is the reason
 *     the migrations are byte-identical: WGSL identifiers come from the layout's KEY NAMES and from
 *     each kernel's `$name`, so leaving both in the shader means the emitted WGSL cannot move. (It
 *     also means this harness needs no `namePrefix` — there is nothing here to prefix.)
 *   - **The physics.** Flocking, nematic torque, gas pressure and image-relief springs are
 *     different simulations that meet only at the render + interaction layer (`kit/agents.ts` has
 *     the pieces they genuinely share: the shape menu and the cursor magnet). Unifying integrators
 *     is an explicit non-goal.
 *   - **The resolve body.** See the note on {@link energyCoverageAlpha} for why the read-then-zero
 *     step cannot be a shared `tgpu.fn` at all.
 *
 * The harness learns the buffer set by INTROSPECTING the layout (`layout.entries`) rather than
 * taking a parallel description of it: every `storage` entry holding a `d.arrayOf(...)` becomes a
 * `createStateBuffer` of that element type and count. So the layout literal in the shader stays the
 * single source of truth for both the WGSL and the allocations, and the two cannot drift.
 *
 * @example
 * const sys = createAgentSystem(params, {
 *     layout: simLayout, params: SimParams, maxAgents: MAX_MOTES,
 *     output: {key: 'outTex', name: 'particleTexture', size: [RES, RES], format: STATE_FORMAT},
 *     countCap: {desktop: MAX_MOTES, mobile: 3000},
 *     pipelines: {
 *         init: {kernel: initKernel, threads: 'max'},
 *         update: {kernel: updateKernel, threads: 'agents'},
 *         splat: {kernel: splatKernel, threads: 'agents'},
 *         resolve: {kernel: resolveKernel, threads: 'fixed', size: [RES, RES]},
 *     },
 *     initStep: 'init', program: ['update', 'splat', 'resolve'],
 * })
 */
import type {TgpuBindGroup, TgpuBindGroupLayout} from 'typegpu'
import type {AnyWgslStruct, Infer, WgslArray} from 'typegpu/data'
import {createGuardedCompute, createStateBuffer, type ComputeStep, type KitComputePipeline} from '../compute'
import type {GpuFragmentParams, KitTexture} from '../contract'
import {tgpu, d, std} from '../kit'
import {isMobileGpuViewport} from '../../utilities/device'

// ─── Device tiering ──────────────────────────────────────────────────────────

/** A value with a lower setting for coarse-pointer (phone/tablet) GPUs. */
export interface DeviceTier {
    desktop: number
    mobile: number
}

/**
 * Pick the coarse-pointer or the desktop value.
 *
 * BUILD-TIME CONSTANT BY DESIGN for a resolution: the accumulator length lives in a module-scope
 * `tgpu.bindGroupLayout`, so it must be decided at import time, not per composition. SSR and the
 * GPU-free tests resolve to `desktop`.
 */
export function resolveDeviceTier(tier: DeviceTier): number {
    return isMobileGpuViewport() ? tier.mobile : tier.desktop
}

/**
 * The square render/accumulator resolution for this device tier.
 *
 * PAIR THIS WITH A FIXED `SIZE_REF_RES`. Agent body sizes are authored in texels, so deriving them
 * from the live (tiered) resolution makes the same preset render a *larger* flock on a phone —
 * fewer texels across the same canvas means each texel covers more screen. Size math must divide by
 * {@link SIZE_REF_RES}; only the buffer/texture extents use the tiered value.
 */
export function resolveRenderRes(tier: DeviceTier): number {
    return resolveDeviceTier(tier)
}

/** The fixed resolution agent sizes are authored against, decoupling them from {@link resolveRenderRes}. */
export const SIZE_REF_RES = 1024

/**
 * Fixed-point gains for the atomic energy accumulators.
 *
 * The resolve's alpha curve is `1 − e^(−1.6·E)` with `E = raw/255`, which reaches 1.0 only
 * asymptotically. A HARD shape's interior returns coverage exactly 1, so at a gain of 255 its
 * centre would resolve to `1 − e^(−1.6)` ≈ 0.80 — a solid dot rendering 80% grey. `HARD`
 * over-drives the scale by 2.5× so those interiors saturate; `SOFT` keeps the true scale because a
 * Gaussian skirt is *supposed* to top out below opaque.
 */
export const FIXED_POINT_GAINS = {HARD: 637, SOFT: 255} as const

// ─── Low-discrepancy sequences (CPU side) ────────────────────────────────────

/**
 * The R2 sequence's irrational strides (the 2D "plastic constant" generalization of the golden
 * ratio): `frac(0.5 + i·α)` gives quasi-uniform coverage for ANY prefix of `i`, so a count slider
 * can grow or shrink the population without re-seeding and without leaving holes. Positions derived
 * from the index alone need no storage.
 */
export const R2_ALPHA = [0.7548776662466927, 0.5698402909980532] as const

/**
 * The R3 sequence's strides — the same construction one dimension up. Used per FRAME rather than
 * per agent: stepping a sub-cell offset along R3 dithers a voxel lattice evenly over time, which is
 * what keeps a density grid from standing in coherent moiré with a shape boundary.
 */
export const R3_ALPHA = [0.8191725133961645, 0.6710436067037893, 0.5497004779019703] as const

// ─── Frame helpers ───────────────────────────────────────────────────────────

/** Per-frame values every agent shader derives from the renderer's frame params. */
export interface AgentFrame {
    /** Frame delta clamped to [1ms, 33ms] — one stalled frame must not teleport the simulation. */
    dt: number
    /** Viewport aspect (guarded against a zero-height canvas). */
    aspect: number
    pointerX: number
    pointerY: number
}

/** The subset of the renderer's frame params an agent simulation reads. */
export interface AgentFrameParams {
    pointer?: {x: number; y: number}
    deltaTime?: number
    dimensions?: {width: number; height: number}
}

/**
 * Normalize the renderer's frame params: dt clamp, aspect, pointer defaults.
 *
 * The dt clamp is load-bearing in both directions. The floor stops a division blowing up on a
 * 0ms frame; the 33ms ceiling means a tab-switch or a long GC pause advances the sim by one slow
 * frame instead of integrating a one-second step and throwing every agent off-screen.
 *
 * `fallbackAspect` is what a shader wants when the canvas has no height yet — 16/9 for a
 * generator that fills the viewport, 1 for one whose grid is refit to the aspect each frame.
 */
export function readAgentFrame(frameParams: unknown, fallbackAspect = 16 / 9): AgentFrame {
    // Nullable: the renderer may not have frame params yet on the first tick, and every field below
    // already has a defined fallback.
    const fp = frameParams as AgentFrameParams | null | undefined
    const h = fp?.dimensions?.height ?? 0
    return {
        dt: Math.min(Math.max(fp?.deltaTime ?? 0.016, 0.001), 0.033),
        aspect: h > 0 ? (fp?.dimensions?.width ?? 0) / h : fallbackAspect,
        pointerX: fp?.pointer?.x ?? 0.5,
        pointerY: fp?.pointer?.y ?? 0.5,
    }
}

/**
 * The numeric prop reader every one of these shaders declared inline (10 copies).
 *
 * Why a fallback per call rather than reading the prop's declared default: a dynamic prop (a range
 * map, a mouse binding) can resolve to a non-number for a frame, and a kernel uniform must never
 * receive `undefined`.
 */
export function makeCpuValueGetter(getCpuValue: (prop: string) => unknown) {
    return (key: string, fallback: number): number => {
        const v = getCpuValue(key)
        return typeof v === 'number' ? v : fallback
    }
}

/** Clamp a raw count prop into `[min, cap]` — the runtime cap, never the prop's declared range. */
export function clampAgentCount(raw: number, min: number, cap: number): number {
    return Math.min(Math.max(Math.round(raw), min), cap)
}

// ─── Splat windows ───────────────────────────────────────────────────────────

/** Inclusive texel bounds of a splat window, already clipped to the accumulator. */
export const SplatWindow = d.struct({x0: d.i32, x1: d.i32, y0: d.i32, y1: d.i32}).$name('SplatWindow')

/**
 * The splat window for an agent living in WORLD space — x ∈ [0, aspect], y ∈ [0, 1], 1 unit == the
 * canvas height — splatting into a SQUARE `res × res` accumulator.
 *
 * Two things make this worth having in one place. First, the window is sized to the agent's ACTUAL
 * reach rather than a fixed box, which is a correctness fix and not just an optimization: a fixed
 * ±16-texel window hard-clipped large `arrow` / `streak` / `glow` shapes into squares. Second, the
 * radius is PER AXIS. The accumulator is square but the world domain is `aspect` wide, so one
 * x-texel covers `aspect` times as much world as a y-texel — hence the divide. Getting that wrong
 * is invisible at 1:1 and stretches every agent on a wide canvas.
 *
 * `reach` is the world-space accept radius (shape extent + AA margin). Clipping happens once here,
 * so the caller's inner loop carries no bounds test, and an off-screen agent clips to an empty
 * range — which is also the off-target early-out.
 */
export const worldSplatWindow = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32], SplatWindow)((pos, reach, aspect, res) => {
    'use gpu'
    const asp = std.max(aspect, 1e-5)
    const cxi = d.i32(std.floor((pos.x / asp) * res))
    const cyi = d.i32(std.floor(pos.y * res))
    const radX = d.i32(std.ceil(reach * res / asp))
    const radY = d.i32(std.ceil(reach * res))
    const last = d.i32(res) - 1
    return SplatWindow({
        x0: std.max(cxi - radX, 0),
        x1: std.min(cxi + radX, last),
        y0: std.max(cyi - radY, 0),
        y1: std.min(cyi + radY, last),
    })
}).$name('worldSplatWindow')

/**
 * The splat window for an agent already projected to TEXEL coordinates, with an isotropic radius
 * (the projected-3D consumers, whose render target has square texels so no aspect term survives).
 *
 * `last` is the inclusive maximum texel per axis, passed rather than derived because the target
 * extent can be a per-frame uniform (a target fitted to the frame aspect).
 */
export const texelSplatWindow = tgpu.fn([d.vec2f, d.i32, d.vec2i], SplatWindow)((center, rad, last) => {
    'use gpu'
    const cxi = d.i32(std.floor(center.x))
    const cyi = d.i32(std.floor(center.y))
    return SplatWindow({
        x0: std.max(cxi - rad, 0),
        x1: std.min(cxi + rad, last.x),
        y0: std.max(cyi - rad, 0),
        y1: std.min(cyi + rad, last.y),
    })
}).$name('texelSplatWindow')

// ─── Resolve + integrate helpers ─────────────────────────────────────────────

/**
 * Accumulated energy → coverage alpha: `1 − e^(−k·energy)`. Saturating, so overlapping agents
 * deepen toward opaque without ever clipping, and empty texels resolve to exactly 0 (fully
 * transparent gaps, so the field composites over anything).
 *
 * WHY THE READ-THEN-ZERO ISN'T HERE. Every consumer's resolve reads its accumulator with
 * `atomicLoad` and immediately `atomicStore`s 0 — one thread owns each cell and nothing else is in
 * flight, so that needs no exchange and replaces a separate full-target clear pass. It cannot be
 * shared as a `tgpu.fn` because WGSL cannot take a storage array as a function parameter, so the
 * two-line load/store stays in each shader, next to the layout entry it names.
 */
export const energyCoverageAlpha = tgpu.fn([d.f32, d.f32], d.f32)((energy, k) => {
    'use gpu'
    return 1.0 - std.exp(energy * k * -1.0)
}).$name('energyCoverageAlpha')

/**
 * Semi-implicit Euler with exponential drag and a speed clamp — the integrator the force-based
 * consumers share.
 *
 * Semi-implicit (velocity updated first, then position from the NEW velocity) is what keeps an
 * underdamped spring stable at the frame rates a browser actually delivers; explicit Euler gains
 * energy and eventually explodes. `dragMul` is `exp(−drag·dt)` computed on the CPU, so the decay is
 * frame-rate independent rather than a per-frame multiply. The clamp is a safety net, not a feel
 * knob: without it one bad frame's force can launch an agent out of the domain entirely.
 */
export const integrateSemiImplicitEuler = tgpu.fn([d.vec3f, d.vec3f, d.f32, d.f32, d.f32], d.vec3f)(
    (vel, force, dt, dragMul, maxSpeed) => {
        'use gpu'
        const v = vel.add(force.mul(dt)).mul(dragMul)
        const spd = std.length(v)
        return v.mul(std.min(spd, maxSpeed) / std.max(spd, 1e-5))
    },
).$name('integrateSemiImplicitEuler')

// ─── The harness ─────────────────────────────────────────────────────────────

/** How many threads a step dispatches. */
export type AgentThreads =
    /** The runtime agent count, passed to `frame({count})`. */
    | 'agents'
    /** `maxAgents` — the static bound, for a one-shot init/re-seed over every slot. */
    | 'max'
    /** A per-frame 2D grid, passed to `frame({grid})`. */
    | 'grid'
    /** A fixed size given by `size` (a full render target, a voxel grid). */
    | 'fixed'

export interface AgentPipelineSpec {
    /** A module-scope `tgpu.fn` kernel: `(i)` for 1D dispatch, `(x, y)` for `'grid'` / 2D `'fixed'`. */
    kernel: ((i: number) => void) | ((x: number, y: number) => void)
    threads: AgentThreads
    /** Required for `threads: 'fixed'`; its length picks the 1D or 2D dispatch. */
    size?: [number] | [number, number]
    /** Chain `extraBindGroup` onto this pipeline (a shape family's own SDF resources). */
    extra?: boolean
}

export interface AgentSystemConfig<TParams extends AnyWgslStruct> {
    /**
     * The shader's module-scope bind group layout. Buffers are allocated by introspecting it, and
     * the kernels reference it directly — so its key names are the WGSL identifiers.
     */
    layout: TgpuBindGroupLayout
    /** Schema of the layout's `uniform` entry — the per-frame CPU-derived inputs. */
    params: TParams
    /** The output storage texture the resolve writes and the fragment samples. */
    output: {
        /** Layout key of the `storageTexture` entry. */
        key: string
        /** Key in the returned `outputs` record (what the fragment reads off `computeOutputs`). */
        name: string
        size: [number, number]
        format: 'rgba16float'
    }
    /** The static dispatch/loop bound — how many slots the state buffers hold. */
    maxAgents: number
    /** Effective count ceiling per device tier. The prop's declared range is unchanged. */
    countCap?: DeviceTier
    /** Layout keys bound late, from another node's output (a child RTT). See `bindExternal`. */
    externalKeys?: readonly string[]
    /** A second bind group chained onto every pipeline marked `extra: true`. */
    extraBindGroup?: unknown
    pipelines: Record<string, AgentPipelineSpec>
    /** Per-frame execution order (keys of `pipelines`). */
    program: readonly string[]
    /** Key of the one-shot step run before the first frame's program, and again on a reseed. */
    initStep?: string
}

export interface AgentSystem<TParams extends AnyWgslStruct> {
    /** Spread into the compute hook's `outputs`. */
    outputs: Record<string, KitTexture>
    /** Write the whole per-frame uniform struct (strict layout — a plain struct has no partial patch). */
    writeParams: (values: Infer<TParams>) => void
    /** The effective agent-count ceiling for this device. */
    readonly countCap: number
    /** Clamp a raw count prop into `[min, countCap]`. */
    resolveCount: (raw: number, min?: number) => number
    /** The created pipelines, by config key — for a shader that needs to dispatch one itself. */
    pipelines: Record<string, KitComputePipeline>
    /** Bind the late-arriving external resources (call from `bindInputs`). */
    bindExternal: (entries: Record<string, unknown>) => void
    /**
     * The frame's compute steps, with the one-shot init prepended on the first call (and whenever
     * `reseed` changes). `null` until every external key is bound.
     */
    frame: (opts?: {count?: number; grid?: [number, number]; reseed?: number}) => ComputeStep[] | null
}

/** A `storage` layout entry holding a fixed-length array — what becomes a state buffer. */
interface ArrayStorageEntry {
    storage: WgslArray
}
function isArrayStorage(entry: unknown): entry is ArrayStorageEntry {
    const storage = (entry as {storage?: {type?: string}} | null)?.storage
    return !!storage && storage.type === 'array'
}
function isUniform(entry: unknown): boolean {
    return !!entry && typeof entry === 'object' && 'uniform' in entry
}

/**
 * Build the runtime side of an agent simulation: state buffers, the output texture, the uniform,
 * the bind group, the guarded pipelines, and the per-frame step list.
 *
 * Returns `null` when there is no GPU device (SSR, the GPU-free resolve tests) — the caller returns
 * `null` from its `compute` hook and the fragment falls back.
 */
export function createAgentSystem<TParams extends AnyWgslStruct>(
    params: GpuFragmentParams,
    config: AgentSystemConfig<TParams>,
): AgentSystem<TParams> | null {
    const {gpu, registerComputeTexture, onCleanup} = params
    const root = gpu?.root
    if (!root) return null

    const {layout, output, maxAgents, externalKeys = [], extraBindGroup} = config

    const outTex = root.createTexture({size: output.size, format: output.format}).$usage('storage', 'sampled')
    onCleanup(() => outTex.destroy())
    // `ValidateUniformSchema` is a conditional type that can't resolve for a generic struct, so the
    // schema is cast through; the runtime call is a plain `createUniform(SimParams)`.
    const paramsU = root.createUniform(config.params as never)

    // One state buffer per array-storage entry, element type and count read off the layout itself.
    const bindings: Record<string, unknown> = {[output.key]: outTex}
    for (const [key, entry] of Object.entries(layout.entries as Record<string, unknown>)) {
        if (isArrayStorage(entry)) {
            bindings[key] = createStateBuffer(root, entry.storage.elementType as never, entry.storage.elementCount)
        } else if (isUniform(entry)) {
            bindings[key] = paramsU.buffer
        }
    }

    let bindGroup: TgpuBindGroup | null = null
    const pipelines: Record<string, KitComputePipeline> = {}

    const createPipelines = () => {
        for (const [key, spec] of Object.entries(config.pipelines)) {
            const kernel = spec.kernel
            const size = spec.threads === 'fixed' ? spec.size : undefined
            const opts = {size: size as never, bindGroup: bindGroup as never}
            const is2d = spec.threads === 'grid' || (spec.threads === 'fixed' && (spec.size?.length ?? 1) === 2)
            let pipe: KitComputePipeline
            if (is2d) {
                const k2 = kernel as (x: number, y: number) => void
                pipe = createGuardedCompute(root, (x: number, y: number) => {'use gpu'; k2(x, y)}, opts)
            } else {
                const k1 = kernel as (i: number) => void
                pipe = createGuardedCompute(root, (i: number) => {'use gpu'; k1(i)}, opts)
            }
            if (spec.extra && extraBindGroup) pipe = pipe.with(extraBindGroup as TgpuBindGroup)
            pipelines[key] = pipe
        }
    }

    if (externalKeys.length === 0) {
        bindGroup = root.createBindGroup(layout, bindings as never) as TgpuBindGroup
        createPipelines()
    }

    const countCap = config.countCap ? resolveDeviceTier(config.countCap) : maxAgents
    let initialized = false
    let lastSeed = 0

    /** One step's entry in the frame program: a pre-sized pipeline dispatches itself. */
    const step = (key: string, count: number, grid?: [number, number]): ComputeStep => {
        const pipe = pipelines[key]
        const spec = config.pipelines[key]
        if (spec.threads === 'fixed') return pipe
        if (spec.threads === 'grid') {
            const [gw, gh] = grid ?? [1, 1]
            return () => pipe.dispatchThreads(gw, gh)
        }
        const n = spec.threads === 'max' ? maxAgents : count
        return () => pipe.dispatchThreads(n)
    }

    return {
        outputs: {[output.name]: registerComputeTexture(outTex)},
        writeParams: (values: Infer<TParams>) => paramsU.write(values as never),
        countCap,
        resolveCount: (raw: number, min = 16) => clampAgentCount(raw, min, countCap),
        pipelines,
        bindExternal: (entries: Record<string, unknown>) => {
            for (const key of externalKeys) {
                if (entries[key] === undefined) return
                bindings[key] = entries[key]
            }
            bindGroup = root.createBindGroup(layout, bindings as never) as TgpuBindGroup
            createPipelines()
        },
        frame: (opts) => {
            if (!bindGroup) return null
            const count = opts?.count ?? countCap
            const nodes: ComputeStep[] = []
            if (config.initStep) {
                const reseeded = opts?.reseed !== undefined && opts.reseed !== lastSeed
                if (!initialized || reseeded) {
                    initialized = true
                    if (opts?.reseed !== undefined) lastSeed = opts.reseed
                    nodes.push(step(config.initStep, count, opts?.grid))
                }
            }
            for (const key of config.program) nodes.push(step(key, count, opts?.grid))
            return nodes
        },
    }
}

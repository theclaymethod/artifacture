/**
 * Scaffold for the state-texture FEEDBACK SIMULATION family.
 *
 * A feedback sim is not a filter. It keeps a fixed-resolution state texture that carries forward
 * across frames: each frame reads last frame's state, advances it by one step of some rule, and
 * writes the new state. Because a WebGPU storage texture cannot be read and written in the same
 * dispatch, the state is a ping-pong PAIR — and because a fragment shader cannot sample a
 * write-only storage texture, the kernel also writes a third DISPLAY copy that the fragment reads.
 *
 * TimeTrail (temporal echo), DataMosh (codec smear) and KeyFrames (motion trackers) all sit on
 * exactly that skeleton, and each had hand-written:
 *
 * - two state textures + a display copy, with an `onCleanup` that destroys all three,
 * - `registerComputeTexture` for the display copy,
 * - `convertToTexture(childNode)` + a `bindInputs` closure building both orientations of the
 *   bind group with an `as never` cast (see `lateBoundChild.ts`),
 * - a `direction` flag flipped at the end of `getComputeNodes`,
 * - `getComputeNodes` returning `null` until the child RTT is bound,
 * - a clamped, speed-scaled `dt` and (DataMosh) a `localTime` accumulator.
 *
 * The KERNELS stay per-shader — the whole point of each of these shaders is its own rule, and
 * nothing about "advance a state texture" wants to own that. What the scaffold owns is the
 * plumbing that was identical.
 *
 * ## Compile-time vs runtime (C5)
 * Everything the scaffold takes is STRUCTURAL: resolutions, formats, the number of extra slots.
 * Changing any of them means reallocating textures, which only happens on a recompose. Per-frame
 * values (the params struct) stay entirely in the shader's own `frame` callback.
 */
import {createPingPongPair, type ComputeStep, type PingPongPair} from '../compute'
import type {GpuFragmentParams, KitTexture} from '../contract'
import {createLateBoundChildInput} from './lateBoundChild'

export {createPingPongPair, type PingPongPair} from '../compute'

/** Texture size as `[width, height]`, or one number for a square. */
export type SimSize = number | readonly [number, number]

const asSize = (s: SimSize): [number, number] => (typeof s === 'number' ? [s, s] : [s[0], s[1]])

/** One side of the ping-pong: the state texture plus any extra lockstep-swapping slots. */
export interface SimSlot {
    /** The state texture for this side. */
    state: unknown
    /** Extra per-side textures declared via `extraSlots`, keyed by their declared name. */
    extra: Record<string, unknown>
}

/** What `bindGroups` / `staticGroups` get to build bind groups from. */
export interface SimBindContext {
    /** The child RTT, already typed for `root.createBindGroup`. */
    childTexture: never
    /** The display copy the fragment samples (a write-only storage target for the kernel). */
    display: unknown
    /** Orientation-independent textures declared via `textures`, keyed by name. */
    textures: Record<string, unknown>
}

/** What the per-frame callback gets. */
export interface SimTick<TGroups, TStatic> {
    /** Bind groups for the CURRENT orientation. */
    groups: TGroups
    /** Orientation-independent bind groups (from `staticGroups`), or `undefined` if none declared. */
    shared: TStatic
    /** Frame delta, clamped to `maxDeltaTime` and multiplied by the `speedProp` value. */
    dt: number
    /** Sum of every `dt` so far — the sim's own clock, unaffected by the global time uniform. */
    localTime: number
    /** The raw frame delta before clamping and speed scaling. */
    rawDeltaTime: number
}

export interface FeedbackTrailSimOptions<TGroups, TStatic> {
    /** State + display resolution. */
    size: SimSize
    /** Storage format for state, display and extra textures. Must be a core storage format. */
    format: 'rgba16float' | 'rgba32float'
    /**
     * Extra texture pairs that swap in LOCKSTEP with the state (TimeTrail's previous-live-frame
     * copy). Value is that slot's size — pass `[1, 1]` for a stub a compile-time-disabled kernel
     * variant never touches but the bind group still has to fill.
     */
    extraSlots?: Record<string, SimSize>
    /** Orientation-independent extra textures (KeyFrames' feature grid). */
    textures?: Record<string, SimSize>
    /** Prop whose value scales `dt`. Omit for an unscaled (real-time) sim. */
    speedProp?: string
    /** Upper bound on the frame delta before speed scaling. Defaults to 0.05 s. */
    maxDeltaTime?: number
    /** Build the bind groups for one orientation. Called twice (once per orientation), late. */
    bindGroups: (ctx: SimBindContext, read: SimSlot, write: SimSlot) => TGroups
    /** Build orientation-independent bind groups. Called once, late. */
    staticGroups?: (ctx: SimBindContext) => TStatic
}

export interface FeedbackTrailSim<TGroups, TStatic> {
    /** The child's RTT handle — put it in `outputs` so the fragment samples it rather than re-RTTing. */
    readonly childTexture: KitTexture
    /** The registered display copy — put it in `outputs`; the fragment samples this. */
    readonly display: KitTexture
    /** The raw state pair, for a shader that needs the textures directly. */
    readonly pair: PingPongPair<SimSlot>
    /** Hand straight to the compute node's `bindInputs`. */
    bindInputs: (resolve: (key: string) => {texture: unknown} | undefined) => void
    /**
     * The body of `getComputeNodes`. Returns `null` before the child RTT is bound. Otherwise
     * advances the clock, invokes `frame`, and swaps the ping-pong — but only if `frame` returned
     * steps, so an idle-skip frame leaves the orientation untouched.
     */
    tick: (
        frameParams: unknown,
        frame: (t: SimTick<TGroups, TStatic>) => ComputeStep[] | null,
    ) => ComputeStep[] | null
}

/**
 * Allocate and wire a state-texture feedback simulation. Returns `null` when there is no child or
 * no GPU device, which is the "fragment falls back to a passthrough" branch every consumer has.
 *
 * @example
 * const sim = createFeedbackTrailSim(params, {
 *     size: STATE_RES,
 *     format: 'rgba16float',
 *     speedProp: 'speed',
 *     bindGroups: ({childTexture, display}, read, write) =>
 *         root.createBindGroup(moshLayout, {
 *             src: childTexture, prev: read.state, next: write.state, display,
 *             params: paramsBuf.buffer,
 *         } as never),
 * })
 * if (!sim) return null
 * return {
 *     outputs: {childTexture: sim.childTexture, display: sim.display},
 *     bindInputs: sim.bindInputs,
 *     getComputeNodes: (fp) => sim.tick(fp, ({groups, dt, localTime}) => {
 *         paramsBuf.write({time: localTime, dt, ...})
 *         return [pipeline.with(groups)]
 *     }),
 * }
 */
export function createFeedbackTrailSim<TGroups, TStatic = undefined>(
    params: GpuFragmentParams,
    opts: FeedbackTrailSimOptions<TGroups, TStatic>,
): FeedbackTrailSim<TGroups, TStatic> | null {
    const {gpu, registerComputeTexture, onCleanup, getCpuValue} = params
    const root = gpu?.root
    if (!root) return null // GPU-free resolve / no device: the fragment falls back to a passthrough.

    const {format} = opts
    const make = (size: SimSize): {texture: unknown; destroy: () => void} => {
        const tex = root.createTexture({size: asSize(size), format}).$usage('storage', 'sampled')
        return {texture: tex, destroy: () => tex.destroy()}
    }

    const allocated: Array<{destroy: () => void}> = []
    const track = <T extends {destroy: () => void}>(t: T): T => {
        allocated.push(t)
        return t
    }

    const stateA = track(make(opts.size))
    const stateB = track(make(opts.size))
    const displayTex = track(make(opts.size))
    const extraNames = Object.keys(opts.extraSlots ?? {})
    const extraA: Record<string, unknown> = {}
    const extraB: Record<string, unknown> = {}
    for (const name of extraNames) {
        extraA[name] = track(make(opts.extraSlots![name])).texture
        extraB[name] = track(make(opts.extraSlots![name])).texture
    }
    const textures: Record<string, unknown> = {}
    for (const [name, size] of Object.entries(opts.textures ?? {})) {
        textures[name] = track(make(size)).texture
    }
    onCleanup(() => {
        for (const t of allocated) t.destroy()
    })

    const display = registerComputeTexture(displayTex.texture)
    const pair = createPingPongPair<SimSlot>(
        {state: stateA.texture, extra: extraA},
        {state: stateB.texture, extra: extraB},
    )

    let currentGroups: (() => TGroups) | null = null
    let shared: TStatic = undefined as TStatic

    const child = createLateBoundChildInput(params, (childTexture) => {
        const ctx: SimBindContext = {childTexture, display: displayTex.texture, textures}
        shared = opts.staticGroups ? opts.staticGroups(ctx) : (undefined as TStatic)
        currentGroups = pair.groups((read, write) => opts.bindGroups(ctx, read, write))
        return true
    })
    if (!child) return null

    const maxDt = opts.maxDeltaTime ?? 0.05
    let localTime = 0

    return {
        childTexture: child.childTexture,
        display,
        pair,
        bindInputs: child.bindInputs,
        tick: (frameParams, frame) => {
            if (!child.ready() || !currentGroups) return null
            const fp = frameParams as {deltaTime?: number} | undefined
            const rawDeltaTime = fp?.deltaTime ?? 0.016
            const rawSpeed = opts.speedProp ? getCpuValue(opts.speedProp) : undefined
            const speed = typeof rawSpeed === 'number' && Number.isFinite(rawSpeed) ? rawSpeed : 1
            const dt = Math.min(rawDeltaTime, maxDt) * speed
            localTime += dt
            const steps = frame({groups: currentGroups(), shared, dt, localTime, rawDeltaTime})
            if (steps) pair.swap()
            return steps
        },
    }
}

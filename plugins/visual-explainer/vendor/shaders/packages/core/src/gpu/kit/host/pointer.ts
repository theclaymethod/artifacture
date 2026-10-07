/**
 * CPU-side pointer / idle / stamp-ribbon helpers for the interactive simulation shaders.
 *
 * None of this is GPU code — it is the per-frame bookkeeping a `compute` hook does before it writes
 * its uniforms. It lives under `gpu/kit/host/` because shader definitions are its only consumers
 * (PRIMITIVES.md C9).
 *
 * The three pieces here were each hand-rolled in five to ten shaders, and the copies had drifted:
 * only ParticleFlow and InkFlow guarded against pointer teleports, only ParticleFlow tracked a
 * warm-up before it was allowed to idle-freeze, and the stamp-ribbon interleave was re-derived every
 * time it was needed.
 */
import type {ComputeStep} from '../../compute'

// ── Pointer velocity tracking ──────────────────────────────────────────────────────────────────

/** What a pointer looks like in the per-frame params the renderer hands a compute hook. */
export interface PointerLike {
    x?: number
    y?: number
    /**
     * `false` while NO real pointer event has ever reached the canvas (the renderer parks the
     * pointer off-screen / at a fallback until then). While false the tracker treats the sample as
     * absent — it will NOT adopt the parked position as its "previous" — and when the first real
     * sample lands it SNAPS to it with zero delta, so no sim receives a giant impulse/streak from
     * the park position to wherever the mouse actually is. Hosts that don't provide the flag get
     * the legacy behaviour (every defined sample is real).
     */
    seen?: boolean
}

/** One frame of resolved pointer motion. All positions are in [0, 1] viewport UV. */
export interface PointerFrame {
    /** Current position (the previous position when the renderer reports no pointer). */
    x: number
    y: number
    /** Position at the previous update. */
    prevX: number
    prevY: number
    /** Per-frame delta, ZEROED on a teleport frame so downstream forces see no impulse. */
    dx: number
    dy: number
    /** `|delta|` — the RAW distance, reported even on a teleport frame. */
    dragDist: number
    /** Delta per second (`dx / dt`), zeroed on a teleport frame. */
    velX: number
    velY: number
    /** Exponentially smoothed `velX`/`velY`. A teleport frame decays it rather than spiking it. */
    smoothVelX: number
    smoothVelY: number
    /** `|smoothVel|`. */
    smoothSpeed: number
    /** The drag jumped further than `teleportGuard` in one frame — treat it as a discontinuity. */
    teleport: boolean
    /** A real stroke this frame: moved more than `minDrag` and did not teleport. */
    moving: boolean
}

export interface PointerVelocityTrackerOptions {
    /** Blend factor for the smoothed velocity, per frame. Default 0.2 (SmokeFlow's value). */
    smoothing?: number
    /**
     * A one-frame jump beyond this UV distance is a pointer teleport — the cursor entering the
     * canvas, a tab switch, a window focus change — not a stroke. Without the guard the sim receives
     * a single enormous impulse and lays a splat ribbon or a force wake clean across the field.
     * Default 0.25 (a quarter of the viewport), ParticleFlow's original value.
     */
    teleportGuard?: number
    /** Below this per-frame UV distance, `moving` stays false. Default 0.0006 (InkFlow's value). */
    minDrag?: number
    /** Initial pointer position, used until the renderer reports one. Default centre. */
    initialX?: number
    initialY?: number
}

export interface PointerVelocityTracker {
    /** Advance the tracker one frame. `dt` is in seconds and is floored at 1 ms for the divide. */
    update(pointer: PointerLike | undefined, dt: number): PointerFrame
}

/**
 * Track pointer position, per-frame delta, per-second velocity and a smoothed velocity, with the
 * teleport guard applied.
 *
 * Structural vs runtime does not apply here (this is all CPU), but note the guard's semantics: on a
 * teleport frame the tracker still ADVANCES its previous position — the jump is absorbed, not
 * deferred — and reports zero motion. The next frame therefore measures from where the pointer
 * actually is.
 */
export function createPointerVelocityTracker(opts: PointerVelocityTrackerOptions = {}): PointerVelocityTracker {
    const smoothing = opts.smoothing ?? 0.2
    const teleportGuard = opts.teleportGuard ?? 0.25
    const minDrag = opts.minDrag ?? 0.0006
    let prevX = opts.initialX ?? 0.5
    let prevY = opts.initialY ?? 0.5
    let smoothVelX = 0
    let smoothVelY = 0
    let sawUnseen = false
    let snappedToFirstReal = false

    return {
        update(pointer, dt) {
            // `seen: false` = the renderer has never received a real pointer event — the sample is
            // a park/fallback position, not the mouse. Hold in place, and when the FIRST real
            // sample arrives snap the previous position onto it so the transition has zero delta.
            const parked = pointer?.seen === false
            if (parked) sawUnseen = true
            else if (pointer?.x !== undefined && sawUnseen && !snappedToFirstReal) {
                snappedToFirstReal = true
                prevX = pointer.x
                prevY = pointer.y ?? prevY
            }
            const oldX = prevX
            const oldY = prevY
            const x = parked ? prevX : (pointer?.x ?? prevX)
            const y = parked ? prevY : (pointer?.y ?? prevY)
            const rawDx = x - oldX
            const rawDy = y - oldY
            const dragDist = Math.sqrt(rawDx * rawDx + rawDy * rawDy)
            const teleport = dragDist >= teleportGuard
            prevX = x
            prevY = y

            const dx = teleport ? 0 : rawDx
            const dy = teleport ? 0 : rawDy
            const invDt = 1 / Math.max(dt, 0.001)
            const velX = dx * invDt
            const velY = dy * invDt
            smoothVelX = smoothVelX * (1 - smoothing) + velX * smoothing
            smoothVelY = smoothVelY * (1 - smoothing) + velY * smoothing

            return {
                x, y, prevX: oldX, prevY: oldY,
                dx, dy, dragDist, velX, velY,
                smoothVelX, smoothVelY,
                smoothSpeed: Math.sqrt(smoothVelX * smoothVelX + smoothVelY * smoothVelY),
                teleport,
                moving: !teleport && dragDist > minDrag,
            }
        },
    }
}

// ── Idle gating ────────────────────────────────────────────────────────────────────────────────

export interface IdleGateOptions {
    /**
     * How many frames must have been dispatched (counted via `tickFrame`) before the gate is allowed
     * to report a skip. A sim whose first frames initialize state and let it settle must not freeze
     * mid-warm-up, or it freezes on garbage. Default 0 — no warm-up requirement.
     */
    warmupFrames?: number
}

export interface IdleGate {
    /**
     * Record that something is driving the sim right now. Resets the simulated-time-since-input
     * clock to zero.
     */
    markActive(): void
    /**
     * Count one DISPATCHED frame toward the warm-up and advance the simulated clock by `dt` seconds
     * (the same clamped delta the solve was stepped with). Call it once the frame is committed.
     *
     * The clock is simulated time, not wall-clock, on purpose: a hidden tab stops
     * `requestAnimationFrame` cold, so no frames run while the user is away. If the gate measured
     * wall-clock seconds since the last input it would freeze the sim the instant the tab came back
     * — with the field still fully visible, since it never actually decayed — and the ink would
     * sit "paused" until the next pointer move. Counting only the seconds the field was actually
     * stepped keeps the decay budget honest across tab switches, throttling, and device loss.
     */
    tickFrame(dt: number): void
    /** Nothing has ever driven the sim — there is no state worth advancing. */
    readonly neverActive: boolean
    /** The warm-up has elapsed (always true when `warmupFrames` is 0). */
    readonly warmedUp: boolean
    /**
     * Whether this frame can be skipped entirely: nothing is driving the sim AND either it has never
     * been driven or more than `fadeSeconds` of SIMULATED time has been stepped since the last input.
     *
     * `driving` is the caller's own "something wants this frame" signal (a stroke in progress, an
     * ambient force, a pending init). Pass `false` when the only driver is the pointer.
     */
    shouldSkip(fadeSeconds: number, driving?: boolean): boolean
}

/**
 * The "settle then freeze" gate: once the field has been stepped far enough past the last input
 * that it has decayed to invisibility, stop dispatching. The previously rendered texture persists
 * on screen, so a settled sim costs zero GPU time.
 *
 * TimeTrail's reasoning is worth restating because it is the trap here: pointer *speed* being zero is
 * NOT a valid skip condition. A stationary cursor over a field that is still evolving must keep
 * dispatching — the gate is about simulated time since the last input, never about instantaneous
 * speed.
 */
export function createIdleGate(opts: IdleGateOptions = {}): IdleGate {
    const warmupFrames = opts.warmupFrames ?? 0
    let everActive = false
    /** Simulated seconds stepped since the last `markActive`. */
    let simSinceActive = 0
    let frames = 0

    const warmedUp = () => frames >= warmupFrames

    return {
        markActive() {
            everActive = true
            simSinceActive = 0
        },
        tickFrame(dt) {
            frames++
            simSinceActive += dt
        },
        get neverActive() { return !everActive },
        get warmedUp() { return warmedUp() },
        shouldSkip(fadeSeconds, driving = false) {
            if (driving) return false
            if (!warmedUp()) return false
            if (!everActive) return true
            return simSinceActive > fadeSeconds
        },
    }
}

/**
 * Seconds for an exponentially decaying field to fall by a factor of `ratio` at `rate` per second —
 * `ln(ratio) / max(rate, minRate)`. The floor keeps a near-zero dissipation rate from producing an
 * infinite (or negative) fade window.
 *
 * `ratio` is the visibility budget: 255 means "wait until the field is 1/255 of its peak" (below one
 * 8-bit level), 64 is a coarser, cheaper choice.
 */
export function decayFadeSeconds(ratio: number, rate: number, minRate = 0.05): number {
    return Math.log(ratio) / Math.max(rate, minRate)
}

// ── Stamp ribbons ──────────────────────────────────────────────────────────────────────────────

export interface PathStampRibbonOptions<T> {
    /** Stroke start, in the same units as `dx`/`dy` (viewport UV for every current consumer). */
    fromX: number
    fromY: number
    /** Stroke delta for this frame. */
    dx: number
    dy: number
    /** `|delta|`, in the same units as `stepSize`. */
    dragDist: number
    /** Spacing between stamps. Typically a fraction of the brush radius. */
    stepSize: number
    /** Hard cap on stamps per frame, so a huge flick cannot blow out the dispatch count. */
    maxSteps: number
    /** Multiplier applied to the interpolated position before it reaches `write`. Default 1. */
    scale?: number
    /**
     * Optional per-stamp state resolved at BUILD time, in stamp order. Use this for anything that
     * must advance once per stamp regardless of dispatch (InkFlow's color cycle).
     */
    prepare?: (t: number) => T
    /**
     * Write the stamp's uniform. Runs inside a thunk at DISPATCH time — the pass manager runs the
     * thunk then the dispatch in `device.queue` order, which is what lets a single uniform buffer
     * carry a different value per stamp.
     */
    write: (posX: number, posY: number, t: number, prepared: T) => void
    /** The splat/force pass dispatched after each write. */
    pass: ComputeStep
}

/**
 * Append an interpolated ribbon of stamps along this frame's drag path to `nodes`, as alternating
 * write-thunk / dispatch pairs.
 *
 * A fast flick covers a lot of ground in one frame; stamping only at the current pointer position
 * leaves dotted gaps. Interpolating along the path at `stepSize` spacing lays a continuous ribbon.
 * Stamps are placed at cell centres (`t = (s + 0.5) / n`) so a one-stamp frame lands mid-stroke
 * rather than at either end.
 *
 * Returns the number of stamps appended.
 */
export function pathStampRibbon<T = undefined>(nodes: ComputeStep[], opts: PathStampRibbonOptions<T>): number {
    const scale = opts.scale ?? 1
    const numSteps = Math.min(opts.maxSteps, Math.max(1, Math.ceil(opts.dragDist / opts.stepSize)))
    for (let s = 0; s < numSteps; s++) {
        const t = (s + 0.5) / numSteps
        const posX = (opts.fromX + opts.dx * t) * scale
        const posY = (opts.fromY + opts.dy * t) * scale
        const prepared = opts.prepare ? opts.prepare(t) : (undefined as T)
        nodes.push(() => opts.write(posX, posY, t, prepared))
        nodes.push(opts.pass)
    }
    return numSteps
}

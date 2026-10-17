/**
 * CPU-accumulated animated time. The engine owns the clock (there is no built-in `time` node).
 *
 * Animated time has three parts: (1) a per-speed accumulator, (2) advanced every frame by
 * `deltaTime * speed` (so speed=0 PAUSES rather than rewinds), and (3) an optional seed offset
 * added on the GPU. Those responsibilities split:
 *
 *   - Accumulation is plain CPU state — `AnimatedTimeState` below. It has no dependency on
 *     the uniform store.
 *   - Writing the accumulated value into a GPU field, and adding the seed offset on the
 *     GPU (`animTime + seed`), is the COMPOSER's job. See "Wiring" below.
 *
 * WeakMap caching: `getAnimatedTimeState(key)` reuses one accumulator per stable key, so a node
 * composed twice (visible layer AND mask source) animates in lockstep, and the accumulator is
 * GC'd when the key is.
 *
 * Wiring (gpu/index.ts + porters.ts, see `GpuShaderDefinition.animatedTime`):
 *   1. A shader declares `animatedTime: {speed: '<speedProp>'}`. At registration the renderer
 *      adds a synthetic `_animTime` f32 field to that node's struct (buildFieldInits), seeded
 *      from this accumulator so a recompose resumes at the accumulated value (no reset flash).
 *   2. In the frame driver step (before the uniform flush), `updateAnimatedTime` calls
 *      `getAnimatedTimeState(key).advance(deltaTime, speed.value)` per node — keyed on the
 *      node's stable speed GpuUniformInput (survives recompose, mirroring the old WeakMap key)
 *      — then writes `_animTime = state.value`.
 *   3. Shader `fragment` / `uvRemap` bodies read `_animTime` via the porters facade's
 *      `animatedTime(params[, seedName])`; the seed offset is added on the GPU exactly as the
 *      old `accumulatedTime.add(seedUniform.uniform)` did.
 */

/** Plain-CPU animated-time accumulator. `value` is read by the composer to patch the field. */
export interface AnimatedTimeState {
    /** Accumulated time in seconds. Advanced by `advance`; read by the composer each frame. */
    value: number
    /**
     * Advance by `deltaTime * speed`. speed=0 pauses (no accumulation, no rewind); a speed
     * change smoothly adjusts the rate (`value += deltaTime * speed`).
     */
    advance(deltaTime: number, speed: number): void
}

/**
 * Fresh accumulator starting at 0. Prefer `getAnimatedTimeState` when a stable key exists
 * so the WeakMap-reuse semantics hold; use this directly only for one-off / test state.
 */
export function createAnimatedTimeState(): AnimatedTimeState {
    const state: AnimatedTimeState = {
        value: 0,
        advance(deltaTime: number, speed: number): void {
            state.value += deltaTime * speed
        },
    }
    return state
}

/**
 * WeakMap ensures the same accumulator is reused when a node is composed multiple times
 * (e.g. as both a visible layer AND a mask source). Keyed on any stable per-node object
 * (the composer keys on the node's speed FieldHandle). Automatic cleanup when the key is
 * garbage collected.
 */
const accumulatedTimeCache = new WeakMap<object, AnimatedTimeState>()

/** Get-or-create the cached accumulator for `key`. */
export function getAnimatedTimeState(key: object): AnimatedTimeState {
    let state = accumulatedTimeCache.get(key)
    if (!state) {
        state = createAnimatedTimeState()
        accumulatedTimeCache.set(key, state)
    }
    return state
}

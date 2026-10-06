/**
 * Coordinate + viewport helpers and the system-uniform schema.
 *
 * On a fullscreen pass, `uv` arrives as a vertex→fragment varying rather than a uniform, so it
 * is NOT part of the struct below. Engine-provided globals (`viewportSize`, `time`, pointer
 * state, …) are fields of `SystemUniforms` — the `_sys` block the composer nests into the
 * packed uniform struct. The composer owns writing these each frame; kit/shader code reads them.
 *
 * The Y-orientation of the screen UV, if a flip is needed, is applied ONCE globally in the
 * composer's varying — it is deliberately NOT baked into these helpers.
 */
import {tgpu, d, std} from './index'

/**
 * The `_sys` uniform block. Minimal by design — one field per engine-provided global. `time` is
 * CPU-accumulated (see kit/time.ts); `viewportSize` is the device-pixel backing-buffer size,
 * `logicalViewportSize` the CSS-pixel size (the two differ under DPR / resolution scaling).
 * `pointer` is in UV space; `pointerActive` is 0/1 (float, matching the ±1/0/1 float encoding
 * transforms already use for booleans).
 */
export const SystemUniforms = d.struct({
    time: d.f32,
    viewportSize: d.vec2f,
    logicalViewportSize: d.vec2f,
    aspect: d.f32,
    pointer: d.vec2f,
    pointerActive: d.f32,
})

/**
 * `viewportCoordinate` — pixel-space coordinate from a UV and the viewport size
 * (`uv * viewportSize`). GPU-callable and CPU-evaluable (dual fn), so it is unit-testable
 * on the CPU.
 */
export const viewportCoordinate = tgpu.fn([d.vec2f, d.vec2f], d.vec2f)((uv, viewportSize) => {
    'use gpu'
    return std.mul(uv, viewportSize)
})

/**
 * Aspect ratio (width / height) from a viewport size.
 */
export const aspectOf = tgpu.fn([d.vec2f], d.f32)((viewportSize) => {
    'use gpu'
    return viewportSize.x / viewportSize.y
})

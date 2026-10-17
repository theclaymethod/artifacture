import { debugWarn } from 'shaders-core'

/**
 * Create a GPU device + adapter you own, to pass to `createShader` via the `gpu`
 * option.
 *
 * **You almost certainly don't need this.** Device sharing is automatic: every
 * shader on a page already adopts one lazily-created device, so pipelines compile
 * once for the page and survive component unmounts (which is what keeps SPA route
 * changes fast). Calling this changes *who owns* the device, not whether sharing
 * happens.
 *
 * Reach for it only when you need explicit control — interoperating with another
 * WebGPU renderer that must share the same device, requesting a specific
 * `powerPreference`, or managing the device's lifetime yourself.
 *
 * Returns `null` if WebGPU is unavailable on this device — in that case
 * callers should pass no `gpu` option and let each shader fall back to its
 * own WebGL renderer.
 *
 * @example
 * ```js
 * import { createShader, createSharedDevice } from 'shaders/js'
 *
 * const gpu = await createSharedDevice()
 *
 * const a = await createShader(canvasA, presetA, { gpu })
 * const b = await createShader(canvasB, presetB, { gpu })
 * const c = await createShader(canvasC, presetC, { gpu })
 * // ...all three share the same WebGPU device
 * ```
 */
export async function createSharedDevice(
  options?: {
    /** Power preference for the requested adapter. Default `'high-performance'`. */
    powerPreference?: GPUPowerPreference
  }
): Promise<{ device: GPUDevice; adapter: GPUAdapter } | null> {
  if (typeof navigator === 'undefined' || !(navigator as any).gpu) {
    return null
  }
  try {
    const gpu = (navigator as any).gpu as GPU
    const adapter = await gpu.requestAdapter({
      powerPreference: options?.powerPreference ?? 'high-performance'
    })
    if (!adapter) return null
    // Request every feature the adapter supports — this mirrors exactly what
    // three's WebGPUBackend does when it creates its own device. Without it a
    // shared device is LESS capable than a per-instance one: notably it lacks
    // `float32-filterable`, so shaders that sample RGBA32Float textures (RTT /
    // data textures) with a filtering sampler fail WebGPU validation
    // ("None of the supported sample types (UnfilterableFloat) ... match the
    // expected sample types (Float)"), cascading into invalid bind groups,
    // render bundles and command buffers. Spreading `adapter.features` is
    // equivalent to three's iterate-GPUFeatureName-and-filter loop, and is
    // always safe because the set only contains features the adapter has.
    const device = await adapter.requestDevice({
      requiredFeatures: [...adapter.features] as GPUFeatureName[]
    })
    return { device, adapter }
  } catch (err) {
    // Silent by design: "this browser can't give us a device" is an expected outcome on a
    // meaningful share of traffic, and it is fully communicated by the `null` return. Flip
    // `localStorage['shaders:debug'] = '1'` (or `setShadersDebug(true)`) to see it.
    debugWarn('[shaders] createSharedDevice failed; callers should fall back to per-instance device:', err)
    return null
  }
}

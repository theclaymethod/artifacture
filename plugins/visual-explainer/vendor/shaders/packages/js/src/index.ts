export { createShader } from './createShader'
export { createPreview } from './createPreview'
export { createSharedDevice } from './createSharedDevice'
export type { ShaderInstance, ShaderOptions, PreviewOptions } from './types'
export type { PresetConfig, ComponentConfig } from 'shaders-core'

// WebGPU availability helpers. Shaders is WebGPU-only, so check before you mount if you
// want to render your own fallback rather than a transparent canvas.
export { isWebGPUSupported, getWebGPUSupport, setShadersDebug, isShadersDebug } from 'shaders-core'
export type { GpuFailureReason, WebGPUSupportInfo } from 'shaders-core'

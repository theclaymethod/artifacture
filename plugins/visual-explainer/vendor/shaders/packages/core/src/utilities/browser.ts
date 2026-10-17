// Firefox WebGPU doesn't support HTMLVideoElement in copyExternalImageToTexture.
// Lazy check avoids accessing navigator at module evaluation time (SSR-safe).
let _needsCanvasWorkaround: boolean | null = null

export function needsVideoCanvasWorkaround(): boolean {
  if (_needsCanvasWorkaround === null) {
    _needsCanvasWorkaround = typeof navigator !== 'undefined' && /Firefox/.test(navigator.userAgent)
  }
  return _needsCanvasWorkaround
}

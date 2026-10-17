import { TELEMETRY_CONFIG } from './config'
import { TelemetryCollector } from './collector'

declare const __SHADERS_VERSION__: string

export function shouldCollectTelemetry(disableTelemetry: boolean = false, isPreview: boolean = false): boolean {
  // Respect explicit opt-out via prop
  if (disableTelemetry) {
    return false
  }

  // Respect Do Not Track browser setting
  if (typeof navigator !== 'undefined' && navigator.doNotTrack === '1') {
    return false
  }

  // Skip sampling for Preview components (always collect)
  if (isPreview) {
    return true
  }

  // Apply 5% random sampling for regular Shader components
  return Math.random() < TELEMETRY_CONFIG.samplingRate
}

export function startTelemetry(
  renderer: any,
  version: string,
  disableTelemetry: boolean = false,
  isPreview: boolean = false
): TelemetryCollector | null {
  if (!shouldCollectTelemetry(disableTelemetry, isPreview)) {
    return null
  }

  const sourceType = isPreview ? 'preview' : 'shader'
  return new TelemetryCollector(renderer, version, sourceType)
}

export function isExternalUser(): boolean {
  // SSR safety - return false if not in browser
  if (typeof window === 'undefined' || !window.location) {
    return false
  }

  const hostname = window.location.hostname
  return !hostname.includes('shaders.com') &&
         hostname !== 'localhost' &&
         hostname !== '127.0.0.1'
}

export { TelemetryCollector } from './collector'
export type { TelemetryPayload, PerformanceMetrics, ComponentInfo, RendererInfo, EnvironmentData } from './types'

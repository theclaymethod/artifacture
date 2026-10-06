export interface TelemetryPayload {
  sessionId: string
  timestamp: number
  collectionDuration: number
  version: string
  sourceType?: 'preview' | 'shader'
  performance: PerformanceMetrics
  renderer: RendererInfo
  components: ComponentInfo[]
  environment: EnvironmentData
}

export interface PerformanceMetrics {
  fps: number
  frameTime: {
    avg: number
    min: number
    max: number
    p99: number
  }
  jankPercent: number
  budgetUsed: number
}

export interface ComponentInfo {
  name: string
  requiresRTT: boolean
  renderOrder: number
}

export interface RendererInfo {
  type: 'webgpu' | 'webgl'
  drawCalls: number | null
  textureCount: number | null
}

export interface EnvironmentData {
  domain: string
  browserFamily: string  // Chrome, Firefox, Safari, Edge, etc.
  deviceType: string     // mobile, tablet, desktop
}

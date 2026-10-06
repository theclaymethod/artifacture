import type { TelemetryPayload, PerformanceMetrics, ComponentInfo, RendererInfo } from './types'
import { TELEMETRY_CONFIG } from './config'
import { collectEnvironment } from './environmentCollector'
import { debugError, debugWarn } from '../gpu/support'
import type { PerformanceStats } from '../performanceTracker'

export class TelemetryCollector {
  private renderer: any
  private version: string
  private sourceType?: 'preview' | 'shader'
  private sessionId: string
  private frameSamples: PerformanceStats[] = []
  private sampleInterval: number | null = null
  private stopped: boolean = false

  constructor(renderer: any, version: string, sourceType?: 'preview' | 'shader') {
    this.renderer = renderer
    this.version = version
    this.sourceType = sourceType
    this.sessionId = `tel_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }

  public stop(): void {
    this.stopped = true
    if (this.sampleInterval) {
      clearInterval(this.sampleInterval)
      this.sampleInterval = null
    }
  }

  async start(): Promise<void> {
    try {
      // Wait for warmup period
      await this.sleep(TELEMETRY_CONFIG.warmupDuration)

      // Check if stopped during warmup
      if (this.stopped) return

      // Start sampling (use global setInterval for SSR compatibility)
      this.sampleInterval = setInterval(() => {
        // Check if stopped before sampling
        if (this.stopped) return

        try {
          const stats = this.renderer.getPerformanceStats()
          this.frameSamples.push(stats)
        } catch (error) {
          debugError('Telemetry sampling error:', error)
        }
      }, TELEMETRY_CONFIG.sampleInterval) as unknown as number

      // Wait for collection duration minus warmup
      await this.sleep(TELEMETRY_CONFIG.collectionDuration - TELEMETRY_CONFIG.warmupDuration)

      // Check if stopped during collection
      if (this.stopped) return

      // Stop sampling
      if (this.sampleInterval) {
        clearInterval(this.sampleInterval)
        this.sampleInterval = null
      }

      // Aggregate and send only if we have enough samples
      if (!this.stopped && this.frameSamples.length >= 5) {
        const payload = this.aggregateData()
        await this.sendTelemetry(payload)
      }

    } catch (error) {
      debugError('Telemetry collection error:', error)
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private aggregateData(): TelemetryPayload {
    const performance = this.aggregatePerformance()
    const renderer = this.detectRendererType()
    const components = this.extractComponents()
    const environment = collectEnvironment()

    return {
      sessionId: this.sessionId,
      timestamp: Date.now(),
      collectionDuration: TELEMETRY_CONFIG.collectionDuration,
      version: this.version,
      sourceType: this.sourceType,
      performance,
      renderer,
      components,
      environment
    }
  }

  private aggregatePerformance(): PerformanceMetrics {
    if (this.frameSamples.length === 0) {
      return {
        fps: 0,
        frameTime: { avg: 0, min: 0, max: 0, p99: 0 },
        jankPercent: 0,
        budgetUsed: 0
      }
    }

    // Extract frame time arrays
    const frameTimes = this.frameSamples.map(s => s.avgFrameTime)
    const jankPercents = this.frameSamples.map(s => s.jankPercent)
    const budgetUseds = this.frameSamples.map(s => s.budgetUsed)

    // Calculate median FPS
    const fpsValues = this.frameSamples.map(s => s.fps)
    const fps = this.calculateMedian(fpsValues)

    // Calculate frame time statistics
    const avgFrameTime = this.calculateMean(frameTimes)
    const minFrameTime = Math.min(...frameTimes)
    const maxFrameTime = Math.max(...frameTimes)
    const p99FrameTime = this.calculatePercentile(frameTimes, 99)

    // Calculate jank and budget
    const jankPercent = this.calculateMean(jankPercents)
    const budgetUsed = this.calculateMean(budgetUseds)

    return {
      fps: Math.round(fps * 10) / 10,
      frameTime: {
        avg: Math.round(avgFrameTime * 10) / 10,
        min: Math.round(minFrameTime * 10) / 10,
        max: Math.round(maxFrameTime * 10) / 10,
        p99: Math.round(p99FrameTime * 10) / 10
      },
      jankPercent: Math.round(jankPercent * 10) / 10,
      budgetUsed: Math.round(budgetUsed * 10) / 10
    }
  }

  private detectRendererType(): RendererInfo {
    const latestSample = this.frameSamples[this.frameSamples.length - 1]

    // Use the renderer's built-in type detection
    const rendererType = this.renderer.getRendererType?.() || 'webgl'

    return {
      type: rendererType,
      drawCalls: latestSample?.drawCalls ?? null,
      textureCount: latestSample?.textureCount ?? null
    }
  }

  private extractComponents(): ComponentInfo[] {
    try {
      const nodeRegistry = this.renderer.getNodeRegistry()
      const components: ComponentInfo[] = []

      for (const [_, nodeInfo] of nodeRegistry.nodes) {
        // Skip root node
        if (nodeInfo.parentId === null) continue

        components.push({
          name: nodeInfo.componentName,
          requiresRTT: nodeInfo.requiresRTT,
          renderOrder: nodeInfo.metadata.renderOrder
        })
      }

      // Sort by render order
      return components.sort((a, b) => a.renderOrder - b.renderOrder)
    } catch (error) {
      debugError('Failed to extract components:', error)
      return []
    }
  }

  private async sendTelemetry(payload: TelemetryPayload): Promise<void> {
    try {
      const response = await fetch(TELEMETRY_CONFIG.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        debugWarn('Telemetry send failed:', response.status, response.statusText)
      }
    } catch (error) {
      // Silently fail - don't impact user experience
      debugError('Telemetry send error:', error)
    }
  }

  // Statistical helper methods

  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0
    return values.reduce((a, b) => a + b, 0) / values.length
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0

    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)

    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2
    } else {
      return sorted[mid]
    }
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0

    const sorted = [...values].sort((a, b) => a - b)
    const index = Math.ceil((percentile / 100) * sorted.length) - 1

    return sorted[Math.max(0, index)]
  }
}

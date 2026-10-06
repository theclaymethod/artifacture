import type { EnvironmentData } from './types'

/**
 * Detects browser family from user agent string
 * Returns generic browser name without version or detailed info
 */
function detectBrowserFamily(userAgent: string): string {
  // Check for common browsers (order matters - check iOS variants before Safari)
  // iOS apps use specific tokens: CriOS (Chrome), EdgiOS (Edge), FxiOS (Firefox)
  if (userAgent.includes('Edg/') || userAgent.includes('EdgiOS')) return 'Edge'
  if (userAgent.includes('OPR/') || userAgent.includes('Opera/')) return 'Opera'
  if (userAgent.includes('Chrome/') || userAgent.includes('CriOS')) return 'Chrome'
  if (userAgent.includes('Firefox/') || userAgent.includes('FxiOS')) return 'Firefox'
  if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) return 'Safari'

  return 'Other'
}

/**
 * Detects device type based on user agent and touch capabilities
 * Returns: mobile, tablet, or desktop
 */
function detectDeviceType(userAgent: string): string {
  // Check for tablet indicators first (before mobile check, since Android appears in both)
  if (/iPad|Tablet|PlayBook/i.test(userAgent)) {
    return 'tablet'
  }

  // Check for Android tablets (they don't always have "Tablet" in UA)
  if (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent)) {
    return 'tablet'
  }

  // Check for mobile indicators
  if (/Mobile|Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
    return 'mobile'
  }

  return 'desktop'
}

export function collectEnvironment(): EnvironmentData {
  // Graceful fallback for non-browser environments (SSR)
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      domain: 'unknown',
      browserFamily: 'unknown',
      deviceType: 'unknown'
    }
  }

  const userAgent = navigator.userAgent

  return {
    domain: window.location.hostname,
    browserFamily: detectBrowserFamily(userAgent),
    deviceType: detectDeviceType(userAgent)
  }
}

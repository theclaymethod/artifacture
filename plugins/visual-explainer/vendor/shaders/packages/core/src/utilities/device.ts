/**
 * Device-class helpers shared by the renderer and the shaders, so the
 * coarse-pointer / mobile-GPU gating that drives several performance trade-offs
 * (pixel-ratio cap, MSAA, RTT precision, power preference, lighter shader
 * variants, adaptive resolution) is defined in exactly ONE place.
 */

/**
 * True for a coarse-pointer (touch) device with a phone/tablet-sized viewport —
 * i.e. a mobile/tablet GPU that can't afford the full desktop per-pixel budget.
 *
 * This is the one device signal available synchronously at shader-build time (the
 * renderer never recompiles on resize), so shaders read it once to compile a
 * lighter variant for mobile (fewer texture taps, no chromatic split, …). A touch
 * screen above ~1366 CSS px (2-in-1s, large tablets driving displays) is treated
 * as a desktop GPU. SSR → false (desktop default).
 */
export function isMobileGpuViewport(): boolean {
    if (typeof window === 'undefined') return false
    const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
    const cssLong = Math.max(window.innerWidth || 0, window.innerHeight || 0)
    return coarse && cssLong > 0 && cssLong <= 1366
}

/**
 * Max device-pixel ratio to back the canvas at. Fragment cost scales with DPR²,
 * and phones report a native DPR around 3 (some up to 4), so we cap it. Desktop /
 * retina stays at 2 (the long-standing cap); a coarse-pointer phone/tablet
 * viewport drops to 1.5 — a further ~44% fewer fragment invocations vs 2.0, the
 * single biggest lever for fragment-bound shaders on a phone, at the cost of
 * slightly softer silhouettes and specular highlights. SSR → 2 (desktop default).
 */
export function maxPixelRatioForDevice(): number {
    return isMobileGpuViewport() ? 1.5 : 2
}

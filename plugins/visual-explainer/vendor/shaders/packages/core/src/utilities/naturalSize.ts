/**
 * Media natural-size registry.
 *
 * Media layers (ImageTexture, VideoTexture, WebcamTexture) are resize-fit generators: without an
 * explicit bounding box they fill the frame and expose no intrinsic size — which makes them
 * unmeasurable for layout (a stack can't slot an element whose height it can't know). This registry
 * is the browser's `<img naturalWidth>` equivalent: media shaders publish their source's pixel
 * dimensions here as soon as they're known (image decode, video metadata, webcam stream), keyed by
 * URL (webcam uses its device-scoped key).
 *
 * Consumers: `measureNode` (layout measurement) and the Design Editor (natural-size boxes).
 * Listeners fire when a size lands so a layout that measured a still-loading image can re-run.
 */

export interface NaturalSize {
    width: number
    height: number
}

const registry = new Map<string, NaturalSize>()
const listeners = new Set<() => void>()

/** Publish a media source's intrinsic pixel dimensions (no-op for degenerate sizes). */
export function registerNaturalSize(key: string, width: number, height: number): void {
    if (!key || !(width > 0) || !(height > 0)) return
    const prev = registry.get(key)
    if (prev && prev.width === width && prev.height === height) return
    registry.set(key, {width, height})
    for (const fn of listeners) {
        try { fn() } catch { /* listener errors must not break media loading */ }
    }
}

/** Intrinsic pixel dimensions for a media source, if its shader has published them. */
export function getNaturalSize(key: string): NaturalSize | null {
    return registry.get(key) ?? null
}

/** Subscribe to natural-size arrivals (layout re-measure). Returns an unsubscribe. */
export function onNaturalSizeChange(fn: () => void): () => void {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
}

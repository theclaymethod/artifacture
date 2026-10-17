/**
 * CPU-side 2D-canvas rasterization helpers — the glyph half of Text, Ascii and ObjectTracker.
 *
 * These three shaders all draw with `CanvasRenderingContext2D` into an offscreen canvas, upload it to
 * a media texture, and re-draw when a prop or a font changes. The drawing itself is per-shader (a
 * wrapped text block, a character atlas, a digit strip); what repeated verbatim was the scaffolding
 * around it, and that is what lives here:
 *
 *   - **`createCanvasRasterTarget`** — the lazily-created canvas + 2D context, the supersample/clamp
 *     scale invariant, and the cleanup that releases the backing store.
 *   - **`createRasterInvalidator`** — the "re-raster when this key changes, but not more often than
 *     every N ms" per-frame throttle (Text and Ascii at 16 ms, ObjectTracker at 100 ms).
 *   - **`createFontDependentRaster`** — the load-a-webfont-then-re-raster ordering, including the
 *     measure-cache bump that Text needs and Ascii does not.
 *
 * Lives under `gpu/kit/host/` because shader definitions are its only consumers (PRIMITIVES.md C9).
 */
import type {GpuFragmentParams} from '../../contract'

// ── Raster target ──────────────────────────────────────────────────────────────────────────────

export interface CanvasRasterTargetOptions {
    /** Hard cap per axis, in texels. WebGPU's floor is 8192; the fleet's convention is 4096. */
    maxAxis?: number
    /**
     * Supersample factor applied ON TOP of the device pixel ratio. The headroom is what survives
     * MAGNIFICATION: a distortion that scales rastered content past the atlas's density resamples
     * texels, and past ~2× that reads as soft edges. Default 1 (no supersampling).
     */
    supersample?: number
    /** Passed through to `getContext('2d')` — Ascii and ObjectTracker want `willReadFrequently`. */
    contextAttributes?: CanvasRenderingContext2DSettings
}

export interface RasterSize {
    /** Device-pixels per CSS pixel actually used, after the max-axis clamp. */
    scale: number
    /** Texture width, `max(2, round(cssWidth · scale))`. */
    texW: number
    /** Texture height, `max(2, round(cssHeight · scale))`. */
    texH: number
}

export interface CanvasRasterTarget {
    /**
     * The 2D context, creating the canvas on first call. Null when the host has no 2D context (or
     * after cleanup) — every caller must handle that, as a rasterizing shader with no context can
     * only render transparent.
     */
    context(): CanvasRenderingContext2D | null
    /** The backing canvas — pass it to `mediaTexture.write`. Null before the first `context()`. */
    canvas(): HTMLCanvasElement | null
    /**
     * Resolve the raster resolution for a CSS-pixel box: device pixel ratio × supersample, clamped so
     * NEITHER axis exceeds `maxAxis`, then rounded with a 2-texel floor. Degrading the density is the
     * correct failure mode for a long text run — an over-cap texture allocation would throw.
     */
    rasterSize(cssWidth: number, cssHeight: number): RasterSize
    /** Resize the canvas to `w`×`h` and clear it. Returns the context, or null when unavailable. */
    resize(w: number, h: number): CanvasRenderingContext2D | null
    /** The host's real device-pixel ratio, derived from the canvas vs the logical dimensions. */
    devicePixelRatio(): number
    /** True once the shader has been cleaned up. */
    readonly disposed: boolean
}

/**
 * An offscreen 2D canvas sized in device pixels, with the scale invariant and the teardown wired up.
 *
 * The canvas is created LAZILY: an atlas shader that never rasters (empty `characters`, labels off)
 * must not allocate a multi-megabyte backing store at composition time. Cleanup sets both axes to 0,
 * which is what actually releases that store — dropping the reference alone leaves it to the GC.
 */
export function createCanvasRasterTarget(
    params: GpuFragmentParams,
    opts: CanvasRasterTargetOptions = {},
): CanvasRasterTarget {
    const {canvas: hostCanvas, dimensions, onCleanup} = params
    const maxAxis = opts.maxAxis ?? 4096
    const supersample = opts.supersample ?? 1

    let el: HTMLCanvasElement | null = null
    let ctx: CanvasRenderingContext2D | null = null
    let isDisposed = false

    const context = (): CanvasRenderingContext2D | null => {
        if (isDisposed) return null
        if (!el) {
            el = document.createElement('canvas')
            el.width = 2
            el.height = 2
            ctx = el.getContext('2d', opts.contextAttributes) as CanvasRenderingContext2D | null
        }
        return ctx
    }

    onCleanup(() => {
        isDisposed = true
        if (el) {
            el.width = 0
            el.height = 0
        }
        el = null
        ctx = null
    })

    return {
        context,
        canvas: () => el,
        devicePixelRatio() {
            // `dimensions` may be CSS or device px depending on the host — derive the real ratio.
            const dimW = dimensions.width || 1
            return Math.max(0.1, (hostCanvas.width || dimW) / dimW)
        },
        rasterSize(cssWidth, cssHeight) {
            const dimW = dimensions.width || 1
            const dpr = Math.max(0.1, (hostCanvas.width || dimW) / dimW)
            let scale = dpr * supersample
            scale = Math.min(scale, maxAxis / cssWidth, maxAxis / cssHeight)
            return {
                scale,
                texW: Math.max(2, Math.round(cssWidth * scale)),
                texH: Math.max(2, Math.round(cssHeight * scale)),
            }
        },
        resize(w, h) {
            const c = context()
            if (!c || !el) return null
            el.width = w
            el.height = h
            c.clearRect(0, 0, w, h)
            return c
        },
        get disposed() { return isDisposed },
    }
}

// ── Raster invalidation ────────────────────────────────────────────────────────────────────────

export interface RasterInvalidatorOptions {
    /**
     * Everything the raster depends on, as one string. Include the canvas size for anything measured
     * in device pixels — a resize changes the raster even when no prop did.
     */
    key(): string
    /**
     * Minimum ms between key CHECKS, not between rasters. The check reads live prop handles, so it is
     * not free; 16 ms (one frame at 60fps) is the fleet default, and an atlas whose props change
     * rarely can afford 100 ms.
     */
    minIntervalMs?: number
    /** Re-raster. Called only when the key actually changed. */
    run(): void
    /**
     * Key value to treat as already-rendered. Pass the key matching a raster the shader performed
     * eagerly at composition, so the first frame does not immediately redo it. Default `''` — no key
     * matches, so the first check after the interval triggers a run.
     */
    initialKey?: string
}

/** A throttled key-diff over `onBeforeRender`. */
export function createRasterInvalidator(params: GpuFragmentParams, opts: RasterInvalidatorOptions): void {
    const minIntervalMs = opts.minIntervalMs ?? 16
    let lastKey = opts.initialKey ?? ''
    let lastCheck = 0

    params.onBeforeRender(() => {
        const now = Date.now()
        if (now - lastCheck < minIntervalMs) return
        lastCheck = now
        const key = opts.key()
        if (key === lastKey) return
        lastKey = key
        opts.run()
    })
}

// ── Font-dependent rasters ─────────────────────────────────────────────────────────────────────

export interface FontDependentRasterOptions {
    /** Font identity (family | weight | italic). A change re-triggers the load. */
    key(): string
    /** Load the font for the CURRENT key. Rejection is expected and means "keep the fallback". */
    load(): Promise<unknown>
    /**
     * Re-raster now that the real font is available. Anything that must invalidate a MEASURE cache
     * belongs at the top of this callback — `measureText` keys on font availability, so a cache
     * populated with the fallback's metrics has to be dropped before re-measuring.
     */
    onLoaded(): void
}

export interface FontDependentRaster {
    /**
     * Load the current font if it changed, then re-raster. Cheap and idempotent per key — call it
     * next to every raster, including the invalidator's.
     */
    ensure(): void
}

/**
 * The two-pass webfont raster: draw immediately with whatever font is resolvable (so text appears on
 * the first frame), then re-draw once the real font has loaded.
 *
 * Skipping the first pass and waiting for the font is the tempting simplification and it is wrong —
 * a font load is a network round trip, and a text layer that renders nothing until it completes
 * flashes empty on every cold load.
 */
export function createFontDependentRaster(opts: FontDependentRasterOptions): FontDependentRaster {
    let loadedKey = ''
    return {
        ensure() {
            const key = opts.key()
            if (key === loadedKey) return
            loadedKey = key
            opts.load().then(() => opts.onLoaded()).catch(() => { /* fallback font already drawn */ })
        },
    }
}

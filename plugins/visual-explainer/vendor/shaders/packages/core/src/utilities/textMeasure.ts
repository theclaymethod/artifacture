/**
 * Cached single-line text measurement, shared by the Text shader's rasterizer and its
 * bounding-box computeBounds in the Design Editor.
 *
 * Everything is measured at a fixed 100px reference size: width scales linearly with font
 * size (letter-spacing is em-based), so resizing text is pure math — no re-measure, and the
 * cache key excludes font size entirely.
 *
 * Cache entries are keyed on the font's live availability (document.fonts.check), so when a
 * webfont finishes loading the next measure misses the stale fallback-font entry and re-measures
 * with the real font — even across separate bundle instances of this module (the editor and the
 * renderer each carry their own cache, but document.fonts is page-global).
 */

import { isFontAvailable } from './fonts'

export type TextTransformMode = 'none' | 'uppercase' | 'lowercase' | 'capitalize'

export interface TextMeasureSpec {
    text: string
    fontFamily: string
    fontWeight: number
    italic: boolean
    letterSpacingEm: number
    textTransform: TextTransformMode
}

export interface TextMeasureResult {
    /** Advance width of the run at 100px font size. */
    widthPer100: number
    /** Font ascent above the alphabetic baseline at 100px font size. */
    ascentPer100: number
    /** Font descent below the alphabetic baseline at 100px font size. */
    descentPer100: number
    /**
     * INK extents — the actual glyph bounding box of THIS run (actualBoundingBox*), not the
     * font box. This is what "the box hugs the text" means: a caps-only run has near-zero ink
     * descent while its font descent stays fixed. Falls back to the font box when unavailable.
     * Consumers: Text's computeBounds (tight layout stacking / overlay box).
     */
    inkAscentPer100: number
    inkDescentPer100: number
}

/** Applies the text-transform mode. Used before both measuring and rasterizing. */
export function applyTextTransform(text: string, mode: TextTransformMode | string | undefined): string {
    switch (mode) {
        case 'uppercase': return text.toUpperCase()
        case 'lowercase': return text.toLowerCase()
        case 'capitalize': return text.replace(/(^|\s)(\S)/g, (_, ws, ch) => ws + ch.toUpperCase())
        default: return text
    }
}

// Explicit invalidation epoch — bump when an external event (font load) should force re-measure.
let generation = 0
export function bumpMeasureGeneration(): void {
    generation++
}

// Shared lazy 2D context for measurement only
let measureCtx: CanvasRenderingContext2D | null = null
let letterSpacingSupported = false
function getMeasureContext(): CanvasRenderingContext2D | null {
    if (measureCtx) return measureCtx
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    measureCtx = canvas.getContext('2d', { willReadFrequently: false })
    if (measureCtx) letterSpacingSupported = 'letterSpacing' in measureCtx
    return measureCtx
}

/** Whether canvas letter-spacing is supported (Chrome 99+/Safari 17.4+/FF 97+). */
export function supportsCanvasLetterSpacing(): boolean {
    getMeasureContext()
    return letterSpacingSupported
}

const MAX_CACHE_ENTRIES = 500
const cache = new Map<string, TextMeasureResult>()

/**
 * Measures a single-line run at the 100px reference size. Cached; safe to call per-frame.
 * Falls back to a rough estimate when no 2D context is available (SSR).
 */
export function measureText(spec: TextMeasureSpec): TextMeasureResult {
    const text = applyTextTransform(spec.text, spec.textTransform)
    const ctx = getMeasureContext()
    if (!ctx) {
        return { widthPer100: text.length * 55, ascentPer100: 80, descentPer100: 20, inkAscentPer100: 80, inkDescentPer100: 20 }
    }

    const fontLoaded = isFontAvailable(spec.fontFamily, spec.fontWeight, spec.italic)
    const key = `${generation}|${fontLoaded ? 1 : 0}|${spec.fontFamily}|${spec.fontWeight}|${spec.italic ? 1 : 0}|${spec.letterSpacingEm}|${text}`
    const cached = cache.get(key)
    if (cached) return cached

    ctx.font = `${spec.italic ? 'italic ' : ''}${spec.fontWeight} 100px "${spec.fontFamily}", sans-serif`
    if (letterSpacingSupported) {
        ;(ctx as any).letterSpacing = `${spec.letterSpacingEm * 100}px`
    }

    const metrics = ctx.measureText(text)
    let widthPer100 = metrics.width
    // Chrome includes the trailing letter-spacing unit in measureText — subtract it so the
    // box hugs the last glyph instead of trailing whitespace.
    if (letterSpacingSupported && text.length > 0) {
        widthPer100 = Math.max(0, widthPer100 - spec.letterSpacingEm * 100)
    }

    const ascentPer100 = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent ?? 80
    const descentPer100 = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent ?? 20
    // Ink (per-run glyph) extents; a whitespace-only run measures 0/0 — fall back to the font box.
    const rawInkAsc = metrics.actualBoundingBoxAscent
    const rawInkDesc = metrics.actualBoundingBoxDescent
    const hasInk = rawInkAsc !== undefined && rawInkDesc !== undefined && (rawInkAsc + rawInkDesc) > 1
    const inkAscentPer100 = hasInk ? rawInkAsc : ascentPer100
    const inkDescentPer100 = hasInk ? rawInkDesc : descentPer100

    const result: TextMeasureResult = { widthPer100, ascentPer100, descentPer100, inkAscentPer100, inkDescentPer100 }
    if (cache.size >= MAX_CACHE_ENTRIES) cache.clear()
    cache.set(key, result)
    return result
}

// ── Multi-line block measurement ─────────────────────────────────────────────

/**
 * Greedy word wrap — pure, measurer-injected (unit-testable without a canvas).
 * Explicit lines are wrapped independently; a word longer than the max overflows on its own
 * line (Figma behaviour — no mid-word breaking). maxWidthPer100 <= 0 disables wrapping.
 */
export function wrapLines(
    text: string,
    maxWidthPer100: number,
    measureLine: (line: string) => number
): string[] {
    const explicit = text.split(/\r\n|\r|\n/)
    if (!(maxWidthPer100 > 0)) return explicit
    const out: string[] = []
    for (const line of explicit) {
        const words = line.split(' ')
        let current = ''
        for (const word of words) {
            const candidate = current ? `${current} ${word}` : word
            if (current && measureLine(candidate) > maxWidthPer100) {
                out.push(current)
                current = word
            } else {
                current = candidate
            }
        }
        out.push(current)
    }
    return out
}

export interface TextBlockMeasure {
    /** Final lines (explicit breaks + wrapping), post-textTransform. */
    lines: string[]
    /** Advance width of each line at the 100px reference. */
    lineWidthsPer100: number[]
    /** Widest line advance. */
    widthPer100: number
    /** Font-box ascent/descent (shared by all lines). */
    ascentPer100: number
    descentPer100: number
    /** Ink extents of the FIRST line's top and the LAST line's bottom. */
    inkAscentFirstPer100: number
    inkDescentLastPer100: number
    /** Baseline-to-baseline distance: lineHeightEm × 100. */
    pitchPer100: number
    /** Font-box block: ascent + (n−1)·pitch + descent. */
    blockHeightPer100: number
    /** Ink block: inkAscentFirst + (n−1)·pitch + inkDescentLast. */
    inkHeightPer100: number
}

/**
 * Measures a multi-line block at the 100px reference. Wrap points depend only on the
 * width÷fontSize ratio, so a caller passes `maxWidthPer100 = maxWidthPx × 100 / fontSizePx`
 * and the whole block stays linear in fontSize — the same scaling trick single-line
 * measurement has always used. Per-line measurement goes through the cached measureText.
 */
export function measureTextBlock(
    spec: TextMeasureSpec,
    lineHeightEm: number,
    maxWidthPer100?: number
): TextBlockMeasure {
    // Wrap against post-transform text (UPPERCASE measures wider than the source string), so
    // per-line measures below use textTransform 'none' on the already-transformed lines.
    const transformed = applyTextTransform(spec.text, spec.textTransform)
    const lines = wrapLines(transformed, maxWidthPer100 ?? 0, (l) =>
        measureText({ ...spec, text: l, textTransform: 'none' }).widthPer100)

    const per = lines.map((l) => measureText({ ...spec, text: l, textTransform: 'none' }))
    const n = Math.max(1, lines.length)
    const first = per[0] ?? measureText(spec)
    const last = per[per.length - 1] ?? first
    const pitchPer100 = Math.max(1, lineHeightEm * 100)
    return {
        lines,
        lineWidthsPer100: per.map((m) => m.widthPer100),
        widthPer100: per.reduce((w, m) => Math.max(w, m.widthPer100), 0),
        ascentPer100: first.ascentPer100,
        descentPer100: first.descentPer100,
        inkAscentFirstPer100: first.inkAscentPer100,
        inkDescentLastPer100: last.inkDescentPer100,
        pitchPer100,
        blockHeightPer100: first.ascentPer100 + (n - 1) * pitchPer100 + first.descentPer100,
        inkHeightPer100: first.inkAscentPer100 + (n - 1) * pitchPer100 + last.inkDescentPer100,
    }
}

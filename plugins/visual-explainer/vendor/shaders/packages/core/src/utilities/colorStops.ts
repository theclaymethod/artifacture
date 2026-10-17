import type { PropConfig } from '../types'

/**
 * Multi-stop color gradient primitive — the declarative half.
 *
 * A single prop (`stops`) holds an arbitrary, user-editable list of `{ color, position }` pairs.
 * This module owns the declarative, CPU-side pieces shared across the library: the `ColorStop` shape, the
 * `colorStopsTransform` identity marker, stop sorting/resolution, and the standard `stops`
 * PropConfig. The GPU-side packing + unroll live in `gpu/kit/colorStops.ts`; the uniform bridge
 * expands a `stops` prop (identified by the `colorStopsTransform` marker) into the packed struct
 * array fields.
 */

export const MAX_COLOR_STOPS = 8

export interface ColorStop {
    /** CSS color string (hex, rgb, named, etc.) */
    color: string
    /** Position along the gradient axis, 0–1 */
    position: number
}

/**
 * Sentinel marker used as the `stops` prop's `transform`. It is never invoked to produce a
 * value — the uniform bridge intercepts the prop by this identity and expands it into the
 * packed color-stops array fields.
 */
export const colorStopsTransform = (value: any): any => value

/**
 * Stable sort stops by position (CPU-side). Keeps `{ color, position }` pairs together —
 * sorting positions independently of colors would silently scramble the gradient.
 */
export function sortStops(stops: ColorStop[]): ColorStop[] {
    return stops
        .map((stop, index) => ({ stop, index }))
        .sort((a, b) => (a.stop.position - b.stop.position) || (a.index - b.index))
        .map(({ stop }) => stop)
}

/**
 * The effective sorted stop list for a LinearGradient's props: explicit `stops` (sorted)
 * when present and non-empty, otherwise the legacy two-color [colorA@0, colorB@1] pair.
 * Shared by core and the editor so they always agree.
 */
export function resolveStops(props: { stops?: ColorStop[] | null; colorA?: string; colorB?: string }): ColorStop[] {
    if (Array.isArray(props.stops) && props.stops.length > 0) {
        return sortStops(props.stops)
    }
    return [
        { color: props.colorA ?? '#1aff00', position: 0 },
        { color: props.colorB ?? '#0000ff', position: 1 }
    ]
}

/**
 * The standard `stops` PropConfig shared by every multi-stop gradient. Default `null` → the shader
 * runs its literal original two-color (colorA/colorB) path, so legacy presets and npm consumers
 * stay byte-identical. Recompiles only when the unrolled structure changes: presence toggling
 * (null ↔ multi) or the active stop count changing; same-count color/position edits update the
 * uniform arrays in place. `effective` collapses the legacy regime (≤1 stop) to 0.
 */
export function colorStopsPropConfig(): PropConfig<ColorStop[] | null> {
    return {
        default: null,
        transform: colorStopsTransform,
        compileTimeWhen: (previousValue: ColorStop[] | null, newValue: ColorStop[] | null) => {
            const effective = (v: ColorStop[] | null) => {
                const n = Array.isArray(v) ? v.length : 0
                return n > 1 ? n : 0
            }
            return effective(previousValue) !== effective(newValue)
        },
        description: "Multi-stop gradient colors (overrides Color A / Color B when set)",
        ui: { type: 'gradient-stops', label: 'Colors', group: 'Colors' }
    }
}

/**
 * List props — the generic ARRAY-valued prop mechanism.
 *
 * A list prop's value is `Item[]`, where every item has the same small record of typed fields
 * (`position` / `color` / `number` / `boolean`). Declared once with {@link listPropConfig}, it
 * flows everywhere:
 *
 *  - UNIFORMS: the bridge expands it into one fixed-size `array<vec4f, maxItems>` per field
 *    (`<prop>_<field>`) plus a `<prop>Count` f32 — the vec4-lane packing the uniform address
 *    space requires (a flat `array<f32>` is invalid there). The item count is a RUNTIME uniform:
 *    adding or removing an item never recompiles. The prop itself is kept as a cpu-only mirror
 *    whose handle value is the RESOLVED list (see {@link resolveListItems}) — what `getCpuValue`
 *    hands a compute hook.
 *  - DRIVERS: a `position` field may hold a mouse-position driver in place of `{x, y}`. The
 *    renderer keys that driver's state by the field PATH (`lights.0.position`) and re-packs the
 *    element every frame, so any light in a list follows the pointer exactly like a top-level
 *    position prop.
 *  - EDITOR: `ui.type: 'list'` renders as an add/remove row list; the item spec travels inside
 *    `ui` so the editor and the canvas overlay (which plots every `position` field of every
 *    item as a draggable handle keyed by path) read the same source of truth as the bridge.
 *  - PERSISTENCE / EXPORT: the value is plain JSON — nothing to register.
 *
 * Reading a list in a recipe: `listOf(params, 'lights')` (`@coreroot/std`) gives the count and
 * per-field element accessors, and `accumulate(...)` loops over them.
 */
import type {ListItemFieldConfig, ListItemFieldKind, MousePositionConfig, PropConfig, PropUIConfig} from '../types'
import {transformPosition} from './transformations'

/** Identity marker transform — how the bridge/renderer recognise a list prop (the colorStops precedent). */
export const listPropTransform = (value: unknown): unknown => value

export interface ListPropSpec {
    item: Record<string, ListItemFieldConfig>
    maxItems: number
    minItems?: number
    itemLabel?: string
}

/** Declare a list prop. `default` is the initial items; the spec rides inside `ui`. */
export function listPropConfig<Item extends Record<string, unknown>>(
    spec: ListPropSpec,
    cfg: {default: Item[]; description: string; label: string; group: string},
): PropConfig<Item[]> {
    const ui: PropUIConfig = {
        type: 'list',
        label: cfg.label,
        group: cfg.group,
        item: spec.item,
        maxItems: spec.maxItems,
        minItems: spec.minItems ?? 0,
        itemLabel: spec.itemLabel,
    }
    return {default: cfg.default, transform: listPropTransform as (value: Item[]) => unknown, description: cfg.description, ui}
}

/** The list spec of a prop config (or metadata entry), else null. */
export function listSpecOf(config: {transform?: unknown; ui?: PropUIConfig} | undefined): ListPropSpec | null {
    const ui = config?.ui
    if (!ui || ui.type !== 'list' || !ui.item || typeof ui.maxItems !== 'number') return null
    return {item: ui.item, maxItems: ui.maxItems, minItems: ui.minItems, itemLabel: ui.itemLabel}
}

export const listFieldName = (prop: string, field: string): string => `${prop}_${field}`
export const listCountName = (prop: string): string => `${prop}Count`

/** Is this field value a mouse-position driver standing in for a position? */
export function isPositionDriver(value: unknown): value is MousePositionConfig {
    return !!value && typeof value === 'object' && (value as {type?: string}).type === 'mouse-position'
}

/** The path key a list element's driver state is filed under: `lights.0.position`. */
export const listDriverPath = (prop: string, index: number, field: string): string => `${prop}.${index}.${field}`

/** Parse a list driver path back into its parts (null for a plain prop name). */
export function parseListDriverPath(key: string): {prop: string; index: number; field: string} | null {
    const m = /^([^.]+)\.(\d+)\.([^.]+)$/.exec(key)
    return m ? {prop: m[1], index: Number(m[2]), field: m[3]} : null
}

/** Resolved (transformed, driver-substituted) field values — what CPU consumers read. */
export type ResolvedListItem = Record<string, {x: number; y: number} | [number, number, number, number] | number>

export interface ResolveListOptions {
    /** color string → linear rgba (the bridge's `colorToRGBA`). */
    color: (value: string) => [number, number, number, number]
    /** Live value for a driven position field (already in the stored `(x, 1−y)` convention), else undefined. */
    drivenPosition?: (index: number, field: string, driver: MousePositionConfig) => {x: number; y: number} | undefined
}

/**
 * Resolve raw items into transformed values: positions in the stored `(x, 1−y)` convention
 * (drivers substituted by their live value, or parked at their origin before the first tick),
 * colors as linear rgba, numbers/booleans as numbers. Items beyond `maxItems` are dropped;
 * missing fields take the item spec's default.
 */
export function resolveListItems(items: unknown, spec: ListPropSpec, opts: ResolveListOptions): ResolvedListItem[] {
    const list = Array.isArray(items) ? items.slice(0, spec.maxItems) : []
    return list.map((raw, index) => {
        const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
        const out: ResolvedListItem = {}
        for (const [field, cfg] of Object.entries(spec.item)) {
            const value = item[field] === undefined || item[field] === null ? cfg.default : item[field]
            out[field] = resolveField(cfg.kind, value, index, field, opts)
        }
        return out
    })
}

function resolveField(kind: ListItemFieldKind, value: unknown, index: number, field: string, opts: ResolveListOptions): ResolvedListItem[string] {
    switch (kind) {
        case 'position': {
            if (isPositionDriver(value)) {
                const live = opts.drivenPosition?.(index, field, value)
                if (live) return live
                // Parked at the driver's origin (or its pinned axes) until the first pointer tick.
                const px = typeof value.x === 'number' ? value.x : value.originX ?? 0.5
                const py = typeof value.y === 'number' ? value.y : value.originY ?? 0.5
                return {x: px, y: 1 - py}
            }
            const p = transformPosition(value as Parameters<typeof transformPosition>[0]) as {x: number; y: number}
            return {x: p.x, y: p.y}
        }
        case 'color':
            return opts.color(typeof value === 'string' ? value : '#ffffff')
        case 'boolean':
            return value ? 1 : -1
        default:
            return typeof value === 'number' ? value : 0
    }
}

/** A resolved field as its vec4 uniform lane. */
export function listFieldLane(value: ResolvedListItem[string]): [number, number, number, number] {
    if (typeof value === 'number') return [value, 0, 0, 0]
    if (Array.isArray(value)) return value
    return [value.x, value.y, 0, 0]
}

/**
 * Pack resolved items into the fixed-size per-field lane arrays (FLAT `maxItems × 4` floats — the
 * uniform store's array-handle mirror format) + the count.
 */
export function packList(items: ResolvedListItem[], spec: ListPropSpec): {count: number; fields: Record<string, number[]>} {
    const fields: Record<string, number[]> = {}
    for (const field of Object.keys(spec.item)) {
        const lanes = new Array<number>(spec.maxItems * 4).fill(0)
        for (let i = 0; i < Math.min(items.length, spec.maxItems); i++) {
            const lane = listFieldLane(items[i][field])
            lanes[i * 4] = lane[0]
            lanes[i * 4 + 1] = lane[1]
            lanes[i * 4 + 2] = lane[2]
            lanes[i * 4 + 3] = lane[3]
        }
        fields[field] = lanes
    }
    return {count: items.length, fields}
}

/** Does any item carry a position driver? (The renderer re-packs such lists per frame.) */
export function listHasDrivers(items: unknown, spec: ListPropSpec): boolean {
    if (!Array.isArray(items)) return false
    return items.some((item) => item && typeof item === 'object' && Object.entries(spec.item).some(([f, c]) => c.kind === 'position' && isPositionDriver((item as Record<string, unknown>)[f])))
}

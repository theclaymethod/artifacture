import type { BoundingBoxDeclaration, BoundingBoxOrigin, ComponentDefinition, DimensionalValue } from '../types'

/**
 * Shape position/size unit resolution.
 *
 * Shape position props (`center`) and size props (`radius`/`width`/`height`/…) may be expressed
 * in absolute pixels via a DimensionalValue `{ value, unit: 'px' | 'uv' }`, and positions may be
 * measured from a reference edge via the shape's `origin` prop. Neither the prop `transform`
 * functions nor GPU code can see the live canvas size, so px → UV conversion and origin resolution
 * happen here, in plain JS, against the current canvas dimensions — and re-run on resize.
 *
 * Which props are dimensional, and how each converts, is derived entirely from the shader's
 * `boundingBoxDeclaration.propBindings` (the same source the Design Editor overlay uses), so this
 * stays in lockstep with `bboxPropBindings.ts` in dotcom:
 *   - position-x / position-y  → position prop ({x,y}); px divides by canvasWidth / canvasHeight
 *   - canvas-height            → size prop; px = value / canvasHeight
 *   - half-canvas-height       → size prop; px = value / (2 * canvasHeight)
 */

// Module-global canvas dimensions, mirroring setColorSpaceMode. The root <Shader> component
// (and the design-editor preset renderer) set these before building uniforms; the renderer
// re-resolves against its own live dimensions on every resize.
let curWidth = 0
let curHeight = 0
export function setShaderCanvasDimensions(width: number, height: number): void {
    if (width > 0) curWidth = width
    if (height > 0) curHeight = height
}
export function getShaderCanvasDimensions(): { width: number; height: number } {
    return { width: curWidth, height: curHeight }
}

export function isDimensionalValue(v: any): v is DimensionalValue {
    return v != null && typeof v === 'object' &&
        typeof v.value === 'number' && (v.unit === 'px' || v.unit === 'uv')
}

export type SizeConversion = 'canvas-height' | 'half-canvas-height' | 'canvas-width' | 'count-canvas-height'

export interface DimensionalPlan {
    /** Props that are {x,y} positions (resolved with origin). */
    positionProps: Set<string>
    /** Size props (scalar) keyed to their px→UV conversion. */
    sizeProps: Map<string, SizeConversion>
}

/**
 * Derives the extra (non-bbox) dimensional size props from a component's prop configs.
 * Any prop whose `ui.dimensional` marker is set becomes a scalar size prop keyed to that
 * conversion — this is what lets an ordinary scalar prop (e.g. softness, rounding) opt into
 * resize-stable px with a single declaration, with no per-prop renderer plumbing.
 */
export function buildExtraSizeProps(
    props: Record<string, { ui?: { dimensional?: SizeConversion } }> | undefined
): Map<string, SizeConversion> | undefined {
    if (!props) return undefined
    let out: Map<string, SizeConversion> | undefined
    for (const [name, cfg] of Object.entries(props)) {
        const d = cfg?.ui?.dimensional
        if (d === 'canvas-height' || d === 'half-canvas-height' || d === 'canvas-width' || d === 'count-canvas-height') {
            (out ??= new Map()).set(name, d)
        }
    }
    return out
}

/**
 * Builds the dimensional resolution plan from a shader's bbox prop bindings, optionally merging
 * in `extraSizeProps` (marker-declared scalar props from buildExtraSizeProps).
 * Returns null only when there are no prop bindings AND no extra size props (filters/generators
 * position via the `boundingBox` object instead, resolved separately in uvTransform).
 */
export function buildDimensionalPlan(
    decl: BoundingBoxDeclaration | undefined,
    extraSizeProps?: Map<string, SizeConversion>
): DimensionalPlan | null {
    const pb = decl?.propBindings
    const positionProps = new Set<string>()
    const sizeProps = new Map<string, SizeConversion>()
    if (pb) {
        for (const axis of ['x', 'y', 'width', 'height'] as const) {
            const b = pb[axis]
            if (!b) continue
            if (b.as === 'position-x' || b.as === 'position-y') positionProps.add(b.prop)
            else if (b.as === 'canvas-height' || b.as === 'half-canvas-height') sizeProps.set(b.prop, b.as)
        }
    }
    if (extraSizeProps) {
        for (const [prop, conv] of extraSizeProps) sizeProps.set(prop, conv)
    }
    return positionProps.size > 0 || sizeProps.size > 0 ? { positionProps, sizeProps } : null
}

type Edge = 'start' | 'end' | 'center'

// Per-axis decomposition: each axis is independent. left/top → start, right/bottom → end,
// neither (an axis named 'center', e.g. 'center-left' or 'top-center') → center.
// NB: named `resolveOriginEdges` (not `originEdges`) to avoid a top-level identifier clash with
// dotcom's own `originEdges` (utils/bboxOrigin) when a dev bundler hoists both into one scope.
const resolveOriginEdges = (origin: BoundingBoxOrigin): { ox: Edge; oy: Edge } => ({
    ox: origin.includes('left') ? 'start' : origin.includes('right') ? 'end' : 'center',
    oy: origin.includes('top') ? 'start' : origin.includes('bottom') ? 'end' : 'center'
})

// Size-aware origin resolution, Y-down. The stored position is the absolute canvas-UV position of
// the box's anchor point (the corner/edge named by `origin`); the true render centre is recovered by
// offsetting with the box half-extent `he` (per-axis, UV). For the default 'center' origin he is
// zero and resolveOriginCenter is the identity, so centred shapes resolve unchanged. The editor's
// bboxOrigin.ts holds the mirror copy (resolveCenter/storeCenter). Named `resolveOriginCenter` (NOT
// dotcom's `resolveCenter`) to avoid a top-level identifier clash when a dev bundler hoists both
// modules into one scope — the same reason resolveOriginPoint/resolveOriginEdges were renamed.
const resolveOriginCenter = (anchorUV: number, edge: Edge, he: number): number =>
    edge === 'start' ? anchorUV + he : edge === 'end' ? anchorUV - he : anchorUV

// Pixel size of a width/height axis binding, mirroring dotcom's `bindingToPx` size cases. A value
// may be a plain UV number or a px DimensionalValue. Used by boxHalfExtentsUV when a shape's box is
// derived from its width/height propBindings (Circle/Star/RoundedRect) rather than computeBounds.
export function bindingSizePx(binding: { as: string }, v: any, width: number, height: number): number {
    const toPx = (val: any, dim: number): number =>
        isDimensionalValue(val) ? (val.unit === 'px' ? val.value : val.value * dim)
            : (typeof val === 'number' ? val * dim : 0)
    if (binding.as === 'canvas-height') return toPx(v, height)
    if (binding.as === 'half-canvas-height') return toPx(v, 2 * height)
    if (binding.as === 'canvas-width') return toPx(v, width)
    return 0
}

/**
 * Per-axis half-extent of a shape's bounding box, in canvas-UV. Used to recover the true render
 * centre from the stored anchor (resolveOriginCenter) and re-store it (storeCenter). Returns zero when no
 * size information is available. `props` may carry raw (px / DimensionalValue) size values — both
 * computeBounds and bindingSizePx handle that.
 */
export function boxHalfExtentsUV(
    decl: BoundingBoxDeclaration | undefined,
    props: Record<string, any>,
    width: number,
    height: number
): { hwx: number; hhy: number } {
    if (decl?.computeBounds) {
        const b = decl.computeBounds(props, width, height)
        return {
            hwx: width > 0 ? (b.widthPx / width) / 2 : 0,
            hhy: height > 0 ? (b.heightPx / height) / 2 : 0
        }
    }
    const pb = decl?.propBindings
    let hwx = 0, hhy = 0
    if (pb?.width && width > 0) hwx = bindingSizePx(pb.width, props[pb.width.prop], width, height) / (2 * width)
    if (pb?.height && height > 0) hhy = bindingSizePx(pb.height, props[pb.height.prop], width, height) / (2 * height)
    return { hwx, hhy }
}

/**
 * Resolves one position axis (number | DimensionalValue | string) into a UV number, applying the
 * size-aware origin offset `he`. Strings (e.g. 'center') and anything non-numeric are returned
 * untouched for the transform to parse.
 */
function resolvePositionAxis(v: any, dim: number, edge: Edge, he: number): any {
    let anchorUV: number
    if (isDimensionalValue(v)) {
        if (v.unit === 'px') {
            // px is a gap INSET from the named edge (resize-stable), NOT an absolute-from-top-left
            // position — a far-edge anchor stored as absolute px would drift on resize. Convert the
            // gap to the absolute anchor UV: end → 1-gap, centre → 0.5+gap, start → gap. (uv values
            // already ARE the absolute anchor fraction, so they stay resize-stable directly.)
            const gap = dim > 0 ? v.value / dim : 0
            anchorUV = edge === 'end' ? 1 - gap : edge === 'center' ? 0.5 + gap : gap
        } else {
            anchorUV = v.value
        }
    } else if (typeof v === 'number') {
        anchorUV = v
    } else {
        return v
    }
    return resolveOriginCenter(anchorUV, edge, he)
}

function resolveSize(v: DimensionalValue, conversion: SizeConversion, width: number, height: number): number {
    if (v.unit !== 'px') return v.value
    if (conversion === 'canvas-width') return width > 0 ? v.value / width : v.value
    if (height <= 0) return v.value
    // Inverse (count) conversion: a px value sets the size of one unit, so the resolved count is
    // canvasHeight / px. Guard a zero px so we never divide by zero.
    if (conversion === 'count-canvas-height') return v.value > 0 ? height / v.value : v.value
    return conversion === 'canvas-height' ? v.value / height : v.value / (2 * height)
}

/**
 * Returns a props object where dimensional shape props are resolved to plain UV values
 * (numbers / {x,y} numbers) ready for the existing prop transforms, applying the `origin` prop.
 *
 * The default origin ('center') resolves the stored centre as-is (zero half-extent), so a centred
 * shape with plain-number props is returned unchanged (zero overhead) — identical to the legacy
 * default. Non-centre origins recover the render centre from the stored anchor via the box extent.
 */
export function resolveDimensionalProps(
    decl: BoundingBoxDeclaration | undefined,
    rawProps: Record<string, any>,
    width: number,
    height: number,
    extraSizeProps?: Map<string, SizeConversion>
): Record<string, any> {
    const plan = buildDimensionalPlan(decl, extraSizeProps)
    if (!plan) return rawProps

    const origin: BoundingBoxOrigin = (rawProps.origin as BoundingBoxOrigin) ?? 'center'
    const { ox, oy } = resolveOriginEdges(origin)
    const isDefaultOrigin = origin === 'center'
    // Half-extent only matters for non-centre origins; skip the computeBounds/binding work otherwise.
    const he = isDefaultOrigin ? { hwx: 0, hhy: 0 } : boxHalfExtentsUV(decl, rawProps, width, height)

    let out: Record<string, any> | null = null
    const ensure = () => (out ??= { ...rawProps })

    for (const prop of plan.positionProps) {
        const val = rawProps[prop]
        if (!val || typeof val !== 'object') continue
        const hasDim = isDimensionalValue(val.x) || isDimensionalValue(val.y)
        // Identity fast-path: default (centre) origin + no px → leave untouched (legacy behaviour)
        if (isDefaultOrigin && !hasDim) continue
        ensure()[prop] = {
            ...val,
            x: resolvePositionAxis(val.x, width, ox, he.hwx),
            y: resolvePositionAxis(val.y, height, oy, he.hhy)
        }
    }

    for (const [prop, conversion] of plan.sizeProps) {
        const val = rawProps[prop]
        if (!isDimensionalValue(val)) continue
        ensure()[prop] = resolveSize(val, conversion, width, height)
    }

    return out ?? rawProps
}

/**
 * Resolves a single dimensional prop value to its plain UV equivalent, given the shader
 * declaration, the prop name, the current origin, and live canvas dimensions. Used by the
 * renderer's update + resize paths to re-resolve from stashed raw values.
 */
export function resolveDimensionalProp(
    decl: BoundingBoxDeclaration | undefined,
    propName: string,
    rawValue: any,
    origin: BoundingBoxOrigin,
    width: number,
    height: number,
    extraSizeProps?: Map<string, SizeConversion>,
    he?: { hwx: number; hhy: number }
): any {
    const plan = buildDimensionalPlan(decl, extraSizeProps)
    if (!plan) return rawValue
    const { ox, oy } = resolveOriginEdges(origin)
    if (plan.positionProps.has(propName)) {
        if (!rawValue || typeof rawValue !== 'object') return rawValue
        return {
            ...rawValue,
            x: resolvePositionAxis(rawValue.x, width, ox, he?.hwx ?? 0),
            y: resolvePositionAxis(rawValue.y, height, oy, he?.hhy ?? 0)
        }
    }
    const conversion = plan.sizeProps.get(propName)
    if (conversion && isDimensionalValue(rawValue)) return resolveSize(rawValue, conversion, width, height)
    return rawValue
}

/** Whether a prop is a dimensional (position/size) prop for the given declaration. */
export function isDimensionalProp(
    decl: BoundingBoxDeclaration | undefined,
    propName: string,
    extraSizeProps?: Map<string, SizeConversion>
): boolean {
    const plan = buildDimensionalPlan(decl, extraSizeProps)
    if (!plan) return false
    return plan.positionProps.has(propName) || plan.sizeProps.has(propName)
}

/** Convenience: the set of all dimensional prop names for a declaration. */
export function dimensionalPropNames(
    decl: BoundingBoxDeclaration | undefined,
    extraSizeProps?: Map<string, SizeConversion>
): string[] {
    const plan = buildDimensionalPlan(decl, extraSizeProps)
    if (!plan) return []
    return [...plan.positionProps, ...plan.sizeProps.keys()]
}

// Mark a component (for tooling) — no-op placeholder kept for symmetry with potential future
// per-component caching. Exported types re-export for downstream use.
export type { ComponentDefinition }

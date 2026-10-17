import type { BoundingBoxConfig, BoundingBoxDimension } from '../types'

/**
 * Full-frame identity bounding box. A box with these values covers the whole viewport,
 * which renders the same as having no box at all.
 */
export const DEFAULT_BOUNDING_BOX: BoundingBoxConfig = {
    x: { value: 0, unit: 'uv' },
    y: { value: 0, unit: 'uv' },
    width: { value: 1, unit: 'uv' },
    height: { value: 1, unit: 'uv' },
    origin: 'top-left',
    rotation: 0
}

/**
 * Merges a user-supplied (possibly partial) bounding box with the full-frame defaults so the
 * renderer always receives a complete BoundingBoxConfig — the GPU path dereferences every
 * dimension (`bbox.x.unit`, …) and would crash on a partial object. Returns undefined when no
 * box is given: absence keeps the bounding-box render path disabled entirely, so a merged
 * default is never forced onto layers that don't use one.
 */
export function resolveBoundingBox(bbox?: Partial<BoundingBoxConfig> | null): BoundingBoxConfig | undefined {
    if (!bbox || typeof bbox !== 'object') return undefined
    const dim = (d: BoundingBoxDimension | undefined, fallback: BoundingBoxDimension): BoundingBoxDimension =>
        d && typeof d === 'object'
            ? { value: d.value ?? fallback.value, unit: d.unit ?? fallback.unit }
            : { ...fallback }
    return {
        x: dim(bbox.x, DEFAULT_BOUNDING_BOX.x),
        y: dim(bbox.y, DEFAULT_BOUNDING_BOX.y),
        width: dim(bbox.width, DEFAULT_BOUNDING_BOX.width),
        height: dim(bbox.height, DEFAULT_BOUNDING_BOX.height),
        origin: bbox.origin ?? 'top-left',
        rotation: bbox.rotation ?? 0,
        ...(bbox.cornerRadius ? { cornerRadius: bbox.cornerRadius } : {}),
        ...(bbox.lockAspect !== undefined ? { lockAspect: bbox.lockAspect } : {})
    }
}

/**
 * True when a box covers the whole frame with no rotation or corner rounding — i.e. it renders
 * identically to having no box at all. Such a box is a real cost: the clip mask, the resize-fit
 * UV mapping and (for a Group) a full RTT round-trip + resample are all emitted for an identity
 * transform. `boundingBox={{ origin: 'center' }}` merges to exactly this, so it is a common
 * shape to hit; both the composer and the renderer treat it as "no box".
 *
 * Only `uv` units count as identity. A px box that happens to equal the frame right now would
 * flip in and out of identity on every resize, and crossing that boundary is a recompile.
 *
 * Origin is irrelevant here: with x=0, y=0 and a 1x1 size every origin resolves the box's
 * top-left to (0,0) (`resolveTopLeft` in kit/uvTransform).
 */
export function isIdentityBoundingBox(bbox?: Partial<BoundingBoxConfig> | null): boolean {
    if (!bbox || typeof bbox !== 'object') return false
    const isUV = (d: BoundingBoxDimension | undefined, value: number): boolean =>
        !!d && d.unit === 'uv' && d.value === value
    return (
        isUV(bbox.x, 0) &&
        isUV(bbox.y, 0) &&
        isUV(bbox.width, 1) &&
        isUV(bbox.height, 1) &&
        (bbox.rotation ?? 0) === 0 &&
        (bbox.cornerRadius?.value ?? 0) === 0
    )
}

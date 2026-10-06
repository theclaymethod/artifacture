/**
 * CPU screen↔box-local coordinate mapping.
 *
 * The GPU-side UV transforms (layer transform, bounding-box clip, resize-fit generator UV) live
 * in `gpu/kit/uvTransform.ts`. This module keeps only the plain-number screen↔box-local mapping
 * used by the renderer's mouse-position driver and the Design Editor's position handles, so GPU
 * content, mouse tracking, and drag handles all place a point at exactly the same screen location.
 */

/**
 * Box geometry for the CPU screen↔box-local mapping below. UV fractions, renderer Y-down
 * convention; rotation in degrees; aspectRatio = canvas width / height.
 */
export interface BoxLocalGeometry {
    centerX: number
    centerY: number
    halfWidthUV: number
    halfHeightUV: number
    rotationDeg: number
    aspectRatio: number
}

/**
 * CPU/JS mirror of the resize-fit generator UV mapping the GPU applies, in plain numbers. Used by
 * the renderer's mouse-position driver and the Design Editor's position handles so all three
 * (GPU content, mouse tracking, drag handles) agree.
 *
 * Rotation is aspect-corrected (rotate in AR-scaled space, never raw UV) so rotated non-square
 * boxes don't shear. Reduces to identity at a full-canvas box. screenUVToBoxLocal and
 * boxLocalToScreenUV are exact inverses.
 *
 * Screen-UV point (Y-down) → box-local fraction [0,1] (Y-down).
 */
export const screenUVToBoxLocal = (sx: number, sy: number, g: BoxLocalGeometry): { x: number; y: number } => {
    const th = g.rotationDeg * Math.PI / 180
    const c = Math.cos(th)
    const s = Math.sin(th)
    const sqx = (sx - g.centerX) * g.aspectRatio
    const sqy = (sy - g.centerY)
    // Rotate by -theta (matches the GPU's negated rotation): R(-θ) = [cosθ, sinθ; -sinθ, cosθ]
    const rx = sqx * c + sqy * s
    const ry = sqx * (-s) + sqy * c
    const hwSq = Math.max(g.halfWidthUV * g.aspectRatio, 1e-6)
    const hhSq = Math.max(g.halfHeightUV, 1e-6)
    return { x: rx / (2 * hwSq) + 0.5, y: ry / (2 * hhSq) + 0.5 }
}

/** Box-local fraction [0,1] (Y-down) → screen-UV point (Y-down). Inverse of screenUVToBoxLocal. */
export const boxLocalToScreenUV = (bx: number, by: number, g: BoxLocalGeometry): { x: number; y: number } => {
    const th = g.rotationDeg * Math.PI / 180
    const c = Math.cos(th)
    const s = Math.sin(th)
    const lx = (bx - 0.5) * 2 * (g.halfWidthUV * g.aspectRatio)
    const ly = (by - 0.5) * 2 * g.halfHeightUV
    // Un-rotate by +theta: R(+θ) = [cosθ, -sinθ; sinθ, cosθ], then un-aspect-correct
    const sqx = lx * c - ly * s
    const sqy = lx * s + ly * c
    return { x: sqx / g.aspectRatio + g.centerX, y: sqy + g.centerY }
}

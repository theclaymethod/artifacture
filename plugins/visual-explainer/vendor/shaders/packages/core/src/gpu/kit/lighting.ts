/**
 * Surface-normal + lighting primitives for the SDF shape-effect family (Glass, LiquidMetal,
 * Chrome, Plastic, Crystal, Holographic, Frost, Water, BrushedMetal, CarbonFiber, …).
 *
 * These are the pieces every member of that family used to hand-inline: the volumetric field's
 * surface normal, the shape-local pattern coordinates, the inside/edge mask, the perspective view
 * ray, and the Ward anisotropic specular frame. All are pure `'use gpu'` `tgpu.fn`s, so they are
 * CPU-executable under vitest as DualFns and golden-testable (see `kit-lighting.test.ts`).
 *
 * SHAPE-FIELD CONTRACT — what the vec4 taps mean. Every shape-effect fragment samples the field
 * (`sdf3d.resolveShapeFieldSampler`) at a centre UV plus two neighbour UVs offset by `eps`, and
 * passes those three vec4s into its composite body:
 *
 *   `.x` signed distance (2D shapes) or −chord/2 (volumetric shapes) — the silhouette/mask channel
 *   `.y .z` surface pattern coords on the volumetric path (`patternMode: 'raw' | 'triplanar'`);
 *           unused (or baked gradients) otherwise
 *   `.w` marched DEPTH — the height profile the volumetric normal differentiates
 *
 * So there are two normals in play and one runtime flag choosing between them: `volumetricNormal`
 * differentiates `.w` (a real 3D height field), while each shader's flat-path normal tilts along
 * the in-plane `fieldGradient` by its own bevel profile. The `volumetric` argument is a RUNTIME
 * f32 0/1 selected with `std.select`, NOT a build-time branch — the same body serves both paths.
 */
import {tgpu, d, std} from './index'
import {TWO_PI} from './constants'

// ─── Surface normals from the field taps ──────────────────────────────────────────────────────

/**
 * The in-plane SDF gradient from the `.x` channel by forward difference:
 * `((surfX.x − surf0.x)/eps, (surfY.x − surf0.x)/eps)`. Points OUTWARD (distance grows outward),
 * with magnitude ≈ 1 for a true 2D distance field and ≫ 1 across a volumetric chord discontinuity —
 * callers that build a direction from it must normalize with a guarded length. Pure.
 */
export const fieldGradient = tgpu.fn([d.vec4f, d.vec4f, d.vec4f, d.f32], d.vec2f)((surf0, surfX, surfY, eps) => {
    'use gpu'
    return d.vec2f((surfX.x - surf0.x) / eps, (surfY.x - surf0.x) / eps)
})

/**
 * Surface normal of a VOLUMETRIC field: the marched depth in `.w` differentiated by forward
 * difference and clamped, with `z = −1` (the renderer's view direction) before normalizing.
 *
 * `gradClamp` is the per-shader slope bound and is load-bearing, not decorative. A chord field is
 * discontinuous where one lobe occludes another, so an unclamped slope spikes for a texel or two at
 * every overlap and the normal there points nearly sideways — which reads as a bright seam. Tighter
 * bounds give flatter, calmer surfaces; the fleet's current values are ±5 (LiquidMetal, Chrome,
 * Water, BrushedMetal, CarbonFiber), ±4 (Plastic, Frost, Crystal) and ±6 (Goo). Pure.
 */
export const volumetricNormal = tgpu.fn([d.vec4f, d.vec4f, d.vec4f, d.f32, d.f32], d.vec3f)(
    (surf0, surfX, surfY, eps, gradClamp) => {
        'use gpu'
        const ddx = std.clamp((surfX.w - surf0.w) / eps, gradClamp * -1.0, gradClamp)
        const ddy = std.clamp((surfY.w - surf0.w) / eps, gradClamp * -1.0, gradClamp)
        return std.normalize(d.vec3f(ddx, ddy, -1.0))
    })

/**
 * Flat-path normal for a bevelled 2D shape: tilt away from the face along the in-plane field
 * gradient by `sinTilt` (the sine of the tilt angle, from a bevel profile such as
 * `effects.bevel.bevelSin`), then complete the unit vector with `z = −cos`.
 *
 * `sinTilt` is CLAMPED to ≤ 0.9995 here — at exactly 1 the `z` term is 0 and the normal lies in the
 * plane, which makes the reflected ray graze to infinity. Pure.
 */
export const bevelledFlatNormal = tgpu.fn([d.vec2f, d.f32], d.vec3f)((grad, sinTilt) => {
    'use gpu'
    const glen = std.max(std.length(grad), 0.0001)
    const sB = std.min(sinTilt, 0.9995)
    return d.vec3f((grad.x / glen) * sB, (grad.y / glen) * sB, std.sqrt(1.0 - sB * sB) * -1.0)
})

/**
 * Shape-local pattern coordinates: `sdfUV − 0.5` on the flat path, the sampler's surface-locked
 * `.g/.b` coords on the volumetric path. This is what makes a surface pattern (molten relief,
 * brush grain, weave, foil crinkle) STICK to a 3D shape instead of sliding across it in screen
 * space. `volumetric` is the runtime 0/1 flag. Pure.
 */
export const patternCoords = tgpu.fn([d.vec2f, d.vec4f, d.f32], d.vec2f)((sdfUV, surf0, volumetric) => {
    'use gpu'
    return d.vec2f(
        std.select(sdfUV.x - 0.5, surf0.y, volumetric > 0.5),
        std.select(sdfUV.y - 0.5, surf0.z, volumetric > 0.5),
    )
})

// ─── Edge masks ───────────────────────────────────────────────────────────────────────────────

/**
 * `true` when the fragment is outside the shape by more than two device pixels — the early-exit
 * test at the top of a shape-effect composite body (`if (outsideShape(sdf, pxH)) return vec4(0)`).
 * The two-pixel slack keeps the anti-aliased edge inside the shaded region. Pure.
 */
export const outsideShape = tgpu.fn([d.f32, d.f32], d.bool)((sdf, pxH) => {
    'use gpu'
    return sdf > pxH * 2.0
})

/**
 * The inside coverage mask: `clamp(−sdf / w, 0, 1)` over a transition width `w` derived from the
 * shader's `sharpEdge` (`max(edgeSoftness · 0.5, 0.001)`) as `sharpEdge / 32`.
 *
 * The width is CLAMPED to at least `minPixels` device pixels. That clamp is the point of this fn:
 * without it, `edgeSoftness → 0` collapses the transition below a pixel and the silhouette resolves
 * as a raw aliased step. At the house value of 1.5 px the edge is anti-aliased and the extra half
 * pixel also hides sub-pixel contour noise from the field's texel lattice (`glassComposite` set the
 * precedent; D-7 propagated it to the metals). Pure.
 */
export const insideMask = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)((sdf, sharpEdge, pxH, minPixels) => {
    'use gpu'
    const w = std.max(sharpEdge * 0.03125, pxH * minPixels)
    return std.clamp(sdf * -1.0 / w, 0.0, 1.0)
})

// ─── View / reflection geometry ───────────────────────────────────────────────────────────────

/**
 * The perspective view ray through a screen UV, pointing INTO the scene (`+z`), aspect-corrected
 * and normalized. `fov` scales the off-axis spread: the fleet uses 0.6 (LiquidMetal, BrushedMetal,
 * CarbonFiber, Water) and 0.55 (Chrome). A perspective ray is what lets a flat face sweep the
 * environment across the canvas instead of reflecting one constant direction. Pure.
 */
export const perspectiveViewRay = tgpu.fn([d.vec2f, d.f32, d.f32], d.vec3f)((uv, aspect, fov) => {
    'use gpu'
    return std.normalize(d.vec3f((uv.x - 0.5) * aspect * fov, (uv.y - 0.5) * fov, 1.0))
})

// ─── Anisotropic (brushed / woven) specular ───────────────────────────────────────────────────

/** An orthonormal surface frame: `tangent` projected into the plane of `normal`, plus their cross
 *  product. The basis anisotropic shading needs. */
export const TangentFrame = d.struct({tangent: d.vec3f, bitangent: d.vec3f})

/**
 * Gram–Schmidt an arbitrary direction into the surface plane and complete the frame:
 * `T = normalize(dir − n·(n·dir))`, `B = n × T`. `dir` supplies the anisotropy axis — the brush
 * direction, or the per-cell tow direction of a weave. Pure.
 */
export const orthonormalTangentFrame = tgpu.fn([d.vec3f, d.vec3f], TangentFrame)((normal, dir) => {
    'use gpu'
    const T3 = std.normalize(dir.sub(normal.mul(std.dot(normal, dir))))
    const B3 = d.vec3f(
        normal.y * T3.z - normal.z * T3.y,
        normal.z * T3.x - normal.x * T3.z,
        normal.x * T3.y - normal.y * T3.x,
    )
    return TangentFrame({tangent: T3, bitangent: B3})
})

/** Inputs to {@link wardAnisotropicSpecular} — a struct per C1 (six values). `view` points INTO
 *  the scene (the `perspectiveViewRay` convention), `light` points at the light. */
export const WardSpecularInput = d.struct({
    normal: d.vec3f,
    /** The anisotropy axis (brush / tow direction). Need not lie in the surface plane. */
    tangent: d.vec3f,
    light: d.vec3f,
    view: d.vec3f,
    /** Roughness along the tangent. Larger → the highlight smears further along the grain. */
    alphaAlong: d.f32,
    /** Roughness across the tangent. Smaller → a tighter streak. */
    alphaAcross: d.f32,
})

/**
 * Ward anisotropic specular lobe, unit gain: `exp(−((h·T/αT)² + (h·B/αB)²) / ((h·N + 1)/2))` for
 * the half-vector `h = normalize(L − V)`. Multiply by the material's specular gain at the call
 * site. This is the streak that runs ALONG a brushed grain or a carbon tow — an isotropic
 * Blinn–Phong lobe cannot produce it. Pure. */
export const wardAnisotropicSpecular = tgpu.fn([WardSpecularInput], d.f32)((p) => {
    'use gpu'
    const frame = orthonormalTangentFrame(p.normal, p.tangent)
    const H = std.normalize(p.light.sub(p.view))
    const hT = std.dot(H, frame.tangent)
    const hB = std.dot(H, frame.bitangent)
    const hN = std.clamp(std.abs(std.dot(H, p.normal)), 0.0001, 1.0)
    // Roughness divisors are floored: today's consumers derive them from a mix() with a non-zero
    // floor, but a zero-roughness material would divide 0/0 here.
    const aT = std.max(p.alphaAlong, 0.0001)
    const aB = std.max(p.alphaAcross, 0.0001)
    const expo = ((hT / aT) * (hT / aT) + (hB / aB) * (hB / aB)) / ((hN + 1.0) * 0.5)
    return std.exp(expo * -1.0)
})

// ─── Spectral color ──────────────────────────────────────────────────────────────────────────

/**
 * IQ cosine palette: `cos((t + phase)·2π)·0.5 + 0.5` per channel. The smooth spectral cycle behind
 * every diffraction look in the library (holographic foil, thin-film iridescence). `t` wraps every
 * 1.0.
 *
 * The phases are ARGUMENTS rather than baked thirds because the fleet's copies disagree in the 4th
 * decimal (`1/3, 2/3` in Holographic vs `0.3333, 0.6667` in thinFilm). Unifying them would be a
 * pixel change; passing each caller's current values keeps adoption pixel-neutral. Pure.
 */
export const cosinePalette = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.vec3f)((t, phaseR, phaseG, phaseB) => {
    'use gpu'
    return d.vec3f(
        std.cos((t + phaseR) * TWO_PI) * 0.5 + 0.5,
        std.cos((t + phaseG) * TWO_PI) * 0.5 + 0.5,
        std.cos((t + phaseB) * TWO_PI) * 0.5 + 0.5,
    )
})

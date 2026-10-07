/**
 * Material-stage part bodies (silhouette AA, key-light frames, fresnels, speculars, reliefs,
 * environments) behind `std/paint/materials` — the pieces of the SDF shape-effect material
 * composites that are shared VERBATIM (or verbatim modulo an argument) by two or more materials.
 *
 * Extraction rule: a part lands here only when ≥ 2 material bodies carry the identical arithmetic
 * (constants included, or constants promoted to arguments each caller passes its current values
 * for). Anything a single material owns — Chrome's studio, Water's sky, Plastic's window bank,
 * Crystal's kaleidoscope — stays in that shader's file (the pass-4 recipes-in-shader-files rule).
 *
 * Float-identity notes (why some near-shares were NOT extracted):
 *  - Water's wave-normal folds THREE tilt terms `(nGeo.x − a − b)`; re-associating through
 *    {@link nudgeNormal}'s single `+ dx` would change rounding, so Water keeps its inline form.
 *    Same for BrushedMetal's two-term `(nGeo.x + a + b)`.
 *  - Frost's and Holographic's crinkle fields both finite-difference `mxNoiseFloat2`, but with
 *    different eps (0.004 vs 0.02), domain offsets, and gating — genuinely different math, two
 *    parts would just be two names for two bodies. They stay in-file.
 */
import {tgpu, d, std} from './index'
import {insideMask} from './lighting'
import {perlin12d} from './noise'

// ─── Silhouette ───────────────────────────────────────────────────────────────────────────────

/**
 * The standard shape-effect silhouette alpha: the D-7 inside mask (edge width `edgeSoftness·0.5`
 * floored at 0.001, clamped to ≥ 1.5 device pixels) eased with smoothstep. This exact tail —
 * `smoothstep(0, 1, insideMask(sdf, max(edgeSoftness·0.5, 0.001), pxH, 1.5))` — closes Chrome,
 * LiquidMetal, Plastic, Water, Frost, Holographic, CarbonFiber and BrushedMetal. Pure.
 */
export const silhouetteAlpha = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((sdf, edgeSoftness, pxH) => {
    'use gpu'
    const sharpEdge = std.max(edgeSoftness * 0.5, 0.001)
    return std.smoothstep(0.0, 1.0, insideMask(sdf, sharpEdge, pxH, 1.5))
})

// ─── Key light ────────────────────────────────────────────────────────────────────────────────

/** A key-light frame: the light direction and its Blinn half-vector against the renderer's fixed
 *  view direction (0,0,−1). */
export const KeyLight = d.struct({L: d.vec3f, H: d.vec3f})

/**
 * Build the key-light frame from the light's direction components: `L = normalize(lx, ly, lz)`,
 * `H = normalize(L + (0,0,−1))`. Every material picks its own `lz` (the fleet uses −0.6 … −0.9 —
 * an eye-tuned elevation, not a shared constant) and its own lobe exponents at the call site.
 * Pure.
 */
export const keyLight = tgpu.fn([d.f32, d.f32, d.f32], KeyLight)((lx, ly, lz) => {
    'use gpu'
    const L = std.normalize(d.vec3f(lx, ly, lz))
    const H = std.normalize(L.add(d.vec3f(0.0, 0.0, -1.0)))
    return KeyLight({L, H})
})

/** Grazing-view factor for the fixed −z view: `1 − clamp(−n.z, 0, 1)` — the input every fresnel
 *  pow() rides (Plastic, Crystal, Frost, Water, Goo). Pure. */
export const grazingView = tgpu.fn([d.vec3f], d.f32)((n) => {
    'use gpu'
    return 1.0 - std.clamp(n.z * -1.0, 0.0, 1.0)
})

// ─── Specular lobes ───────────────────────────────────────────────────────────────────────────

/**
 * A sharpness-steered Blinn glint: `pow(ndh, mix(cfg.x, cfg.y, sharp)) · mix(cfg.z, cfg.w, sharp)`
 * — exponent and gain both slide with the material's `sharpness`. LiquidMetal passes
 * `(60, 900, 0.4, 1.4)`, Water `(40, 600, 0.3, 1.3)`; the shape is shared, the endpoints are each
 * material's look. Pure.
 */
export const sharpGlint = tgpu.fn([d.f32, d.f32, d.vec4f], d.f32)((ndh, sharp, cfg) => {
    'use gpu'
    return std.pow(ndh, std.mix(cfg.x, cfg.y, sharp)) * std.mix(cfg.z, cfg.w, sharp)
})

// ─── Surface relief ───────────────────────────────────────────────────────────────────────────

/**
 * Clamped analytic Perlin gradient — the shared tail of the metal reliefs: `perlin12d(q).yz`
 * scaled by `gain` and clamped to ±4 (the slope bound that keeps chord-discontinuity spikes from
 * reading as bright seams). Chrome's pressed-metal waviness passes gain 1, LiquidMetal's molten
 * relief 0.62; the domain (`q`) each material warps its own way before the call. Pure.
 */
export const clampedPerlinGrad = tgpu.fn([d.vec2f, d.f32], d.vec2f)((q, gain) => {
    'use gpu'
    const gMax = d.f32(4)
    const nd = perlin12d(q)
    return d.vec2f(
        std.clamp(nd.y * gain, gMax * -1.0, gMax),
        std.clamp(nd.z * gain, gMax * -1.0, gMax),
    )
})

/**
 * Tilt a geometric normal in-plane and renormalize: `normalize(n.x + dx, n.y + dy, n.z)` — how a
 * relief field (waviness, molten folds, crumple, frost, weave crowns) bends the base normal.
 * Callers fold their relief products into ONE dx/dy term each; a material whose tilt is a
 * multi-term sum (Water, BrushedMetal) keeps its inline form — re-associating the sum through
 * this single add would change float rounding. Pure.
 */
export const nudgeNormal = tgpu.fn([d.vec3f, d.f32, d.f32], d.vec3f)((n, dx, dy) => {
    'use gpu'
    return std.normalize(d.vec3f(n.x + dx, n.y + dy, n.z))
})

// ─── Optical body ─────────────────────────────────────────────────────────────────────────────

/**
 * The shared optical-thickness reading of the shape field: volumetric shapes use the chord
 * (`clamp(−sdf·2, 0, 1.2)`), flat shapes a rim-depth proxy (`clamp(−sdf, 0, 0.5)·2`). The
 * Frost/Water "solid body" cue; each material scales the result by its own density prop. Pure.
 */
export const opticalThickness = tgpu.fn([d.f32, d.f32], d.f32)((sdf, volumetric) => {
    'use gpu'
    const thickVol = std.clamp(sdf * -1.0 * 2.0, 0.0, 1.2)
    const thickFlat = std.clamp(sdf * -1.0, 0.0, 0.5) * 2.0
    return std.select(thickFlat, thickVol, volumetric > 0.5)
})

/** Beer–Lambert transmission per channel: `exp(−thickness · absorb)`. Frost drives it with a
 *  fixed ice absorption spectrum, Water derives absorption from the water color. Pure. */
export const beerLambert = tgpu.fn([d.f32, d.vec3f], d.vec3f)((thickness, absorb) => {
    'use gpu'
    return d.vec3f(
        std.exp(thickness * absorb.x * -1.0),
        std.exp(thickness * absorb.y * -1.0),
        std.exp(thickness * absorb.z * -1.0),
    )
})

// ─── Animated flow warp ───────────────────────────────────────────────────────────────────────

/**
 * The incommensurate-frequency domain-warp offset shared verbatim by LiquidMetal's molten folds
 * and Water's wind-driven waves: two sin·cos products over `warpInput` (the pattern coords scaled
 * by 0.6) drifting with `flowT`. The constants ARE the flow character — both materials read the
 * same table. Pure.
 */
export const flowWarpOffset = tgpu.fn([d.vec2f, d.f32], d.vec2f)((warpInput, flowT) => {
    'use gpu'
    const wx = std.sin(warpInput.x * 1.7 + flowT * 0.7 + 1.7) * std.cos(warpInput.y * 1.3 + flowT * 0.5 + 2.3)
    const wy = std.cos(warpInput.x * 1.4 + flowT * 0.9 + 8.7) * std.sin(warpInput.y * 1.6 + flowT * 0.6 + 5.1)
    return d.vec2f(wx, wy)
})

// ─── Studio environments ──────────────────────────────────────────────────────────────────────

/**
 * The shared 5-softbox studio: a floor→sky gradient plus five radial softbox banks — overhead key,
 * upper-left, right, low fill / floor bounce, lower-left — rotated into the env frame. One sample
 * for a reflection direction (rx, ry).
 *
 * BrushedMetal smears it along the brush grain (skyGain 0.38, animated `drift`); CarbonFiber's
 * clearcoat takes one crisp tap (skyGain 0.3, keyRad 0.16, drift 0). The five bank positions,
 * radius multipliers and brightnesses are byte-identical between the two — only the sky gain
 * differs, so it is the one argument. (LiquidMetal's 3-bank studio and Chrome's rounded-rect
 * softbox + flags are different arithmetic and stay in their files.) Pure.
 */
export const studio5Softbox = tgpu.fn([d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32], d.f32)(
    (rx, ry, envC, envS, keyRad, drift, envStr, skyGain) => {
        'use gpu'
        const ex = rx * envC - ry * envS
        const ey = rx * envS + ry * envC
        const p = d.vec2f(ex, ey)
        const sky = std.smoothstep(-0.7, 0.85, ey)
        let lum = sky * sky * skyGain
        // Box 0: overhead key (0.0, 0.55, 1.0, 1.7).
        const r0 = keyRad * 1.0
        lum = lum + std.smoothstep(r0, r0 * 0.2, std.length(p.sub(d.vec2f(0.0 + drift, 0.55)))) * 1.7 * envStr
        // Box 1: upper-left bank (-0.55, 0.18, 1.15, 1.05).
        const r1 = keyRad * 1.15
        lum = lum + std.smoothstep(r1, r1 * 0.2, std.length(p.sub(d.vec2f(-0.55 + drift, 0.18)))) * 1.05 * envStr
        // Box 2: right bank (0.55, 0.1, 1.0, 1.0).
        const r2 = keyRad * 1.0
        lum = lum + std.smoothstep(r2, r2 * 0.2, std.length(p.sub(d.vec2f(0.55 + drift, 0.1)))) * 1.0 * envStr
        // Box 3: low soft fill / floor bounce (0.2, -0.5, 1.3, 0.7).
        const r3 = keyRad * 1.3
        lum = lum + std.smoothstep(r3, r3 * 0.2, std.length(p.sub(d.vec2f(0.2 + drift, -0.5)))) * 0.7 * envStr
        // Box 4: lower-left (-0.35, -0.25, 1.1, 0.85).
        const r4 = keyRad * 1.1
        lum = lum + std.smoothstep(r4, r4 * 0.2, std.length(p.sub(d.vec2f(-0.35 + drift, -0.25)))) * 0.85 * envStr
        return lum
    })

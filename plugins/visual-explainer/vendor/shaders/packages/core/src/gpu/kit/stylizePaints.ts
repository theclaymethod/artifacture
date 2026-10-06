/**
 * Painterly stylize-filter bodies (hand-drawn/painted looks over the child) behind
 * std/effects/stylize — the Kuwahara watercolor kernel, the chalkboard Sobel/hatch/dust
 * compose, and the ASCII glyph-atlas sampling chain. Each body is pure GPU math; the tap
 * placement, unrolled loops and host machinery (glyph rasterisation) live with the callers.
 */
import {tgpu, d, std, noise, blend} from './index'

// ── Watercolor (Kuwahara) ───────────────────────────────────────────────────────────────────────

// The bleed-wobbled base sample UV: low-frequency noise perturbs the sampling UV to break straight
// edges. t = time·0.03 (global clock). Hash-driven → GPU-only.
export const watercolorUvBase = tgpu.fn([d.vec2f, d.vec2f, d.f32, d.f32], d.vec2f)((uv, viewport, bleed, time) => {
    'use gpu'
    const t = time * 0.03
    const wob = d.vec2f(
        noise.value12(uv.mul(5.0).add(d.vec2f(t, t))),
        noise.value12(uv.mul(5.0).add(d.vec2f(31.4, 31.4)).add(d.vec2f(t, t))),
    ).sub(d.vec2f(0.5, 0.5))
    const texel = d.vec2f(1.0 / viewport.x, 1.0 / viewport.y)
    return uv.add(wob.mul(bleed).mul(texel).mul(8.0))
})

// One Kuwahara tap UV: uvBase + pixel steps (ox, oy), in LOGICAL pixels. Pure.
export const watercolorTapUV = tgpu.fn([d.vec2f, d.vec2f, d.f32, d.f32], d.vec2f)((uvBase, viewport, ox, oy) => {
    'use gpu'
    return d.vec2f(uvBase.x + ox / viewport.x, uvBase.y + oy / viewport.y)
})

// Paper grain the pigment settles into (value noise at screenUV·viewport·0.5). Hash → GPU-only.
export const watercolorGrain = tgpu.fn([d.vec2f, d.vec2f], d.f32)((uv, viewport) => {
    'use gpu'
    return noise.value12(uv.mul(viewport).mul(0.5))
})

// Kuwahara pick + paper + blend, from the four quadrants' running sum (PREMULTIPLIED rgb + alpha)
// and sum-of-squares (premultiplied rgb; each computed at the builder level; invN = 1/taps).
// The winning quadrant mean is unpremultiplied ONCE here, so the returned rgb is straight alpha.
// std.select(f, t, cond) picks t when cond is true; we want q.mean on true, so select(result, mean, take).
export const watercolorCompose = tgpu.fn(
    [d.vec4f, d.vec4f, d.vec4f, d.vec4f, d.vec3f, d.vec3f, d.vec3f, d.vec3f, d.f32, d.vec4f, d.vec4f, d.f32, d.f32, d.f32],
    d.vec3f)(
    (sum0, sum1, sum2, sum3, sq0, sq1, sq2, sq3, invN, originalBleed, paperColor, paper, strength, grain) => {
        'use gpu'
        const mean0 = sum0.mul(invN)
        const mean1 = sum1.mul(invN)
        const mean2 = sum2.mul(invN)
        const mean3 = sum3.mul(invN)
        const rgb0 = d.vec3f(mean0.x, mean0.y, mean0.z)
        const rgb1 = d.vec3f(mean1.x, mean1.y, mean1.z)
        const rgb2 = d.vec3f(mean2.x, mean2.y, mean2.z)
        const rgb3 = d.vec3f(mean3.x, mean3.y, mean3.z)
        const var0 = sq0.mul(invN).sub(rgb0.mul(rgb0))
        const var1 = sq1.mul(invN).sub(rgb1.mul(rgb1))
        const var2 = sq2.mul(invN).sub(rgb2.mul(rgb2))
        const var3 = sq3.mul(invN).sub(rgb3.mul(rgb3))
        const sigma0 = var0.x + var0.y + var0.z
        const sigma1 = var1.x + var1.y + var1.z
        const sigma2 = var2.x + var2.y + var2.z
        const sigma3 = var3.x + var3.y + var3.z

        // Lowest-variance mean wins (iterating q1,q2,q3 against the running best). Copy mean0 into
        // a fresh vec (TGSL rejects `let x = <reference>`; reassigned below via std.select).
        let picked = d.vec4f(mean0.x, mean0.y, mean0.z, mean0.w)
        let best = sigma0
        picked = std.select(picked, mean1, sigma1 < best)
        best = std.min(best, sigma1)
        picked = std.select(picked, mean2, sigma2 < best)
        best = std.min(best, sigma2)
        picked = std.select(picked, mean3, sigma3 < best)
        best = std.min(best, sigma3)

        const straight = blend.unpremultiplyAlpha(picked)
        let result = d.vec3f(straight.x, straight.y, straight.z)

        // Paper grain the pigment settles into.
        const paperMul = std.mix(1.0, grain, paper)
        const paperTint = d.vec3f(paperColor.x, paperColor.y, paperColor.z)
        result = std.mix(result.mul(paperMul), result.mul(paperTint), d.vec3f(paper * 0.4))

        // Blend back toward the (bleed-wobbled) original by strength.
        const origRgb = d.vec3f(originalBleed.x, originalBleed.y, originalBleed.z)
        const finalRGB = std.mix(origRgb, result, d.vec3f(strength))
        return finalRGB
    })

// ── Chalkboard ──────────────────────────────────────────────────────────────────────────────────

// Hatch-line angles → precomputed sin/cos (Math.* inside a GPU body is unproven).
const SIN_045 = Math.sin(0.785)
const COS_045 = Math.cos(0.785)
const SIN_N45 = Math.sin(-0.785)
const COS_N45 = Math.cos(-0.785)

// Value hash + smooth value noise (screen-space grain). Integer bitcast hash: the lattice is
// device-pixel scale, where the classic sin-fract hash streaks on iOS Metal (low-precision
// large-argument sin range reduction). GPU-only.
const chalkHash21 = tgpu.fn([d.vec2f], d.f32)((p) => {
    'use gpu'
    return noise.hash12(p)
})
const chalkVnoise = tgpu.fn([d.vec2f], d.f32)((p) => {
    'use gpu'
    const i = std.floor(p)
    const f = std.fract(p)
    const u = f.mul(f).mul(f.mul(-2.0).add(3.0))
    const a = chalkHash21(i)
    const b = chalkHash21(d.vec2f(i.x + 1.0, i.y))
    const c = chalkHash21(d.vec2f(i.x, i.y + 1.0))
    const dd = chalkHash21(d.vec2f(i.x + 1.0, i.y + 1.0))
    return std.mix(std.mix(a, b, u.x), std.mix(c, dd, u.x), u.y)
})

// Rec.601 luminance of an (unpremultiplied) sample.
export const chalkLuma = tgpu.fn([d.vec4f], d.f32)((color) => {
    'use gpu'
    return std.dot(d.vec3f(color.x, color.y, color.z), d.vec3f(0.299, 0.587, 0.114))
})

// The Sobel tap UV: screen UV + (1/viewport) * edgeThickness * (ox, oy).
export const chalkOffsetUV = tgpu.fn([d.vec2f, d.vec2f, d.f32, d.f32, d.f32], d.vec2f)(
    (uv, viewport, edgeThickness, ox, oy) => {
        'use gpu'
        const texelX = 1.0 / viewport.x
        const texelY = 1.0 / viewport.y
        return d.vec2f(uv.x + texelX * edgeThickness * ox, uv.y + texelY * edgeThickness * oy)
    })

// One cross-hatch line family: projected coordinate → triangle-wave line, gated by `shade`.
const chalkHatchLine = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32], d.f32)(
    (P, hatchScale, shade, sa, ca, thr) => {
        'use gpu'
        const ry = P.x * sa + P.y * ca
        const hl = std.abs(std.fract(ry / hatchScale) - 0.5) * 2.0
        const line = 1.0 - std.smoothstep(0.0, 0.35, hl)
        return line * std.step(thr, shade)
    })

// Sobel edge magnitude (from 8 pre-sampled tap luminances) + cross-hatch shading + chalk-dust
// grain over the board color. Scalars packed into vec4 params. GPU-only (hash noise).
export const chalkboardCompose = tgpu.fn(
    [d.vec4f, d.vec4f, d.vec2f, d.vec2f, d.vec4f, d.vec4f, d.vec4f, d.vec4f], d.vec4f,
)((sobelA, sobelB, uv, viewport, misc, params, boardColor, chalkColor) => {
    'use gpu'
    const tl = sobelA.x
    const t = sobelA.y
    const tr = sobelA.z
    const l = sobelA.w
    const r = sobelB.x
    const bl = sobelB.y
    const bo = sobelB.z
    const br = sobelB.w
    const centerLum = misc.x
    const centerAlpha = misc.y
    const edgeSensitivity = params.x
    const hatchScale = params.y
    const shading = params.z
    const grain = params.w

    // Sobel edge magnitude.
    const gx = -tl - l * 2.0 - bl + tr + r * 2.0 + br
    const gy = -tl - t * 2.0 - tr + bl + bo * 2.0 + br
    const edgeMag = std.sqrt(gx * gx + gy * gy)
    const edgeHigh = std.mix(d.f32(1.0), 0.08, edgeSensitivity)
    const edge = std.smoothstep(edgeHigh * 0.4, edgeHigh, edgeMag)

    // Cross-hatch shading from darkness.
    const shade = 1.0 - centerLum
    const P = uv.mul(viewport)
    const hatch = std.max(
        std.max(
            chalkHatchLine(P, hatchScale, shade, SIN_045, COS_045, 0.22),
            chalkHatchLine(P, hatchScale, shade, SIN_N45, COS_N45, 0.5),
        ),
        chalkHatchLine(P, hatchScale, shade, 0.0, 1.0, 0.78),
    ) * shading

    // Grain + composite.
    const dust = std.mix(1.0 - grain, d.f32(1.0), chalkVnoise(P.mul(0.5)))
    const chalkMask = std.clamp(std.max(edge, hatch) * dust, 0.0, 1.0)
    const boardGrain = (chalkVnoise(P.mul(0.9)) - 0.5) * 0.04
    const boardRGB = boardColor.xyz.add(boardGrain)
    const col = std.mix(boardRGB, chalkColor.xyz, d.vec3f(chalkMask))
    return d.vec4f(col, centerAlpha)
})

// ── ASCII ───────────────────────────────────────────────────────────────────────────────────────

// Cell sizes are normalized to a 1080p reference so the character grid scales proportionally.
const REFERENCE_HEIGHT = 1080.0

/** Cell geometry from screen UV: which cell + the character-local UV + an out-of-bounds mask. */
const AsciiGrid = d.struct({cellCenter: d.vec2f, cellUV: d.vec2f, isOutside: d.f32})

export const asciiGrid = tgpu.fn([d.vec2f, d.vec2f, d.f32, d.f32], AsciiGrid)((uv, viewport, cellSize, spacing) => {
    'use gpu'
    const scaleFactor = viewport.y / REFERENCE_HEIGHT
    const effectiveCellSize = cellSize * scaleFactor
    const mainGridSize = d.vec2f(viewport.x / effectiveCellSize, viewport.y / effectiveCellSize)
    const gridCoords = d.vec2f(uv.x * mainGridSize.x, uv.y * mainGridSize.y)
    const cellCoords = std.floor(gridCoords)
    const rawCellUV = std.fract(gridCoords)
    const centeredU = rawCellUV.x - 0.5
    const centeredV = rawCellUV.y - 0.5
    const cellUV = d.vec2f(centeredU / spacing + 0.5, centeredV / spacing + 0.5)
    const half = spacing * 0.5
    const isOutside = std.select(d.f32(0), d.f32(1), std.abs(centeredU) > half || std.abs(centeredV) > half)
    const cellCenter = d.vec2f((cellCoords.x + 0.5) / mainGridSize.x, (cellCoords.y + 0.5) / mainGridSize.y)
    return AsciiGrid({cellCenter, cellUV, isOutside})
}).$name('asciiGrid')

/** Map cell brightness → atlas glyph UV (gamma curve + inverted brightness → char index → atlas cell). */
export const asciiAtlasUV = tgpu.fn([d.vec3f, d.f32, d.f32, d.f32, d.f32, d.vec2f], d.vec2f)(
    (cellRgb, gamma, charCount, atlasSize, atlasScale, cellUV) => {
        'use gpu'
        const rawBrightness = std.dot(cellRgb, d.vec3f(0.299, 0.587, 0.114))
        const adjustedBrightness = std.pow(rawBrightness, gamma)
        const invertedBrightness = 1.0 - adjustedBrightness
        const scaledBrightness = invertedBrightness * charCount
        const charIndex = std.clamp(std.floor(scaledBrightness), 0.0, charCount - 1.0)
        const atlasCol = charIndex - atlasSize * std.floor(charIndex / atlasSize)
        const atlasRow = std.floor(charIndex / atlasSize)
        const atlasCellSize = 1.0 / atlasSize * atlasScale
        const baseU = atlasCol * atlasCellSize
        const baseV = atlasRow * atlasCellSize
        return d.vec2f(baseU + cellUV.x * atlasCellSize, baseV + cellUV.y * atlasCellSize)
    }).$name('asciiAtlasUV')

/** Final compose: tint the glyph by the cell color; transparent on background / out-of-bounds / below-threshold. */
export const asciiCompose = tgpu.fn([d.vec3f, d.vec4f, d.f32, d.f32, d.f32], d.vec4f)(
    (asciiRgb, cellColor, isOutside, alphaThreshold, preserveAlpha) => {
        'use gpu'
        const charBrightness = std.dot(asciiRgb, d.vec3f(0.299, 0.587, 0.114))
        const isBackground = charBrightness < 0.1
        const sourceAlpha = cellColor.w
        const isBelowThreshold = sourceAlpha < alphaThreshold
        const outputAlpha = std.select(d.f32(1), sourceAlpha, preserveAlpha > 0.5)
        const hide = isBackground || isOutside > 0.5 || isBelowThreshold
        const finalAlpha = std.select(outputAlpha, d.f32(0), hide)
        return d.vec4f(asciiRgb.x * cellColor.x, asciiRgb.y * cellColor.y, asciiRgb.z * cellColor.z, finalAlpha)
    }).$name('asciiCompose')

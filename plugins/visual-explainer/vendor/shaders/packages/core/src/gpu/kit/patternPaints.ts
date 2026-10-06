/**
 * Pattern paint bodies behind std/paint/patterns — the lattice frames, per-cell parts, and
 * mask/field functions for the two-color pattern generators (checker, stripes, chevron, rings,
 * falling lines), the tiling generators (grid, dot grid, hex grid, triangular grid, brick,
 * truchet, weave, isometric cubes), and the stylize screens (halftone, dither).
 *
 * Structure: FRAME parts map a screen UV into lattice space (aspect correction + canvas-centre
 * rotation + cell scale); CELL parts draw what lives inside a cell (per-cell variation, stroke
 * bands); FIELD bodies per lattice combine them where the tiling's intermediates feed several
 * outputs at once. Anti-aliased bodies take screen-space derivatives (dpdx/dpdy/fwidth) and are
 * therefore fragment-only; the pure-arithmetic ones stay CPU-testable.
 */
import {tgpu, d, std} from './index'
import {DEG_TO_RAD, TAU, SQRT3} from './constants'
// Shared helpers whose emitted WGSL name has always been the bare identifier are imported by
// name; `geom.*` / `noise.*` referenced namespace-style inside bodies stay namespace imports.
import * as geom from './geom'
import * as noise from './noise'
import {aspectCorrectedUVFlipY, aspectOf, canvasCentredDelta, directionalProjection, flooredMod1, rotate2, rotateAboutCanvasCentre} from './geom'
import {footprint1, footprint2, quilezCheckerFilter, quilezLineFilterAxis, quilezStepFilter, lineMaskFromField, bandMask, discCoverage} from './aa'
import {cellCentreUVRotated, cellHash, variationFactor, squareTiling, rowSpeedHash, rowSpeedMultiplier, hexTiling, triLattice} from './cells'

// Full-precision constants (Math.* inside a GPU body is unproven → pre-fold to module literals).
const INV_SQRT3_2 = 2 / Math.sqrt(3)
const SQRT3_2 = Math.sqrt(3) / 2

// ═══ Lattice frames ═══════════════════════════════════════════════════════════════════════════
//
// A frame maps the screen UV into lattice space: aspect-correct X, optionally Y-flip, rotate
// about the canvas centre, scale to `cells` lattice units. Three conventions exist among the
// tiling generators and each is preserved exactly — the flip and the rotation sign are part of
// each pattern's look, not a normalisable difference.

// Y-flipped, positive (counter-clockwise) rotation — the square lattices (grid, triangular grid).
export const latticeFrameFlipY = tgpu.fn([d.vec2f, d.vec2f, d.f32, d.f32], d.vec2f)((uv, viewport, cells, rotationDeg) => {
    'use gpu'
    const aspect = aspectOf(viewport)
    const correctedUV = d.vec2f(uv.x * aspect, 1.0 - uv.y)
    const rotRad = rotationDeg * DEG_TO_RAD
    const cosR = std.cos(rotRad)
    const sinR = std.sin(rotRad)
    return rotateAboutCanvasCentre(correctedUV, aspect, cosR, sinR).mul(cells)
})

// No flip, negated rotation (positive = clockwise) — hex grid, truchet, isometric cubes.
export const latticeFrameCW = tgpu.fn([d.vec2f, d.vec2f, d.f32, d.f32], d.vec2f)((uv, viewport, cells, rotationDeg) => {
    'use gpu'
    const aspect = aspectOf(viewport)
    const correctedUV = d.vec2f(uv.x * aspect, uv.y)
    const ang = -(rotationDeg * DEG_TO_RAD)
    const cosR = std.cos(ang)
    const sinR = std.sin(ang)
    return rotateAboutCanvasCentre(correctedUV, aspect, cosR, sinR).mul(cells)
})

// No flip, positive rotation — weave.
export const latticeFrame = tgpu.fn([d.vec2f, d.vec2f, d.f32, d.f32], d.vec2f)((uv, viewport, cells, rotationDeg) => {
    'use gpu'
    const aspect = aspectOf(viewport)
    const correctedUV = d.vec2f(uv.x * aspect, uv.y)
    const rotRad = rotationDeg * DEG_TO_RAD
    const cosR = std.cos(rotRad)
    const sinR = std.sin(rotRad)
    return rotateAboutCanvasCentre(correctedUV, aspect, cosR, sinR).mul(cells)
})

// ═══ Cell parts ═══════════════════════════════════════════════════════════════════════════════

// Per-cell brightness jitter: hash the (integer) cell id, spread by `variation` into the shared
// lighten/darken factor. Every lattice fill that "varies" multiplies its RGB by this.
export const cellVariation = tgpu.fn([d.vec2f, d.f32], d.f32)((cellId, variation) => {
    'use gpu'
    return variationFactor(cellHash(cellId), variation)
})

// Stroke band with a FLOORED lower edge: the lower edge cannot go negative, and the pixel
// footprint widens only the upper one (hex grid + truchet arcs share this exact tail).
export const strokeBandFloored = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)((field, lineWidth, pixel, softness) => {
    'use gpu'
    const soft = softness * 0.5
    const lo = std.max(lineWidth - soft, 0.0)
    const hi = lineWidth + pixel + soft
    return lineMaskFromField(field, lineWidth, lo, hi)
})

// Symmetric stroke band around lineWidth, `aaWidth` on each side (triangular grid + isometric
// cubes share this exact tail; each lattice computes its own aaWidth from a CONTINUOUS coord).
export const strokeBandSymmetric = tgpu.fn([d.f32, d.f32, d.f32], d.f32)((field, lineWidth, aaWidth) => {
    'use gpu'
    return lineMaskFromField(field, lineWidth, lineWidth - aaWidth, lineWidth + aaWidth)
})

// ── Checker ─────────────────────────────────────────────────────────────────────────────────────
//
// Full checker blend factor for a screen UV: Y-FLIPPED aspect-corrected cell coordinate → per-axis
// screen-space footprint (dpdx/dpdy, the local Jacobian through any distortion) widened by softness
// → the Quilez analytical 2D filter. dpdx/dpdy are fragment-only intrinsics, so this body is
// GPU-only; the filter itself (`aa.quilezCheckerFilter`) takes the footprint as an argument and so
// stays pure and CPU-testable.
export const checkerBlend = tgpu.fn([d.vec2f, d.vec2f, d.f32, d.f32], d.f32)((uv, viewport, cells, softness) => {
    'use gpu'
    const p = aspectCorrectedUVFlipY(uv, viewport).mul(cells)
    return quilezCheckerFilter(p, footprint2(p, softness))
})

// ── Stripes ─────────────────────────────────────────────────────────────────────────────────────
//
// The stripe coordinate `p` for a screen UV: aspect-correct X, project onto the perpendicular axis
// by `angle`, scale by `density`, then offset by the accumulated animation time + phase. NO Y-flip
// (`uv.y` used directly). `animTime` is the CPU-accumulated `_animTime` passed in by the builder;
// `aspect` guarded like LinearGradient. Pure arithmetic — CPU-testable.
//
// The projection is taken from the CANVAS CENTRE (Chevron's frame), not from the aspect-corrected
// origin, so `angle` spins the stripes in place instead of sliding them across the canvas. The
// trailing `+ aspect * 0.5` restores the phase the uncentred projection had at angle 0; it is
// angle-independent, so it cannot move the pivot — it only keeps angle 0 pixel-identical.
export const stripeCoordP = tgpu.fn([d.vec2f, d.vec2f, d.f32, d.f32, d.f32, d.f32], d.f32)(
    (uv, viewport, angle, density, animTime, offset) => {
        'use gpu'
        const angleRad = angle * DEG_TO_RAD
        const aspect = aspectOf(viewport)
        const rotatedCoord = directionalProjection(
            canvasCentredDelta(uv, aspect), std.cos(angleRad), std.sin(angleRad),
        ) + aspect * 0.5
        return rotatedCoord * density + animTime + offset
    })

// Full stripe mask for a screen UV: stripe coordinate → screen-space footprint (dpdx/dpdy, the
// local Jacobian through any distortion) widened by softness → the Quilez analytical 1D filter
// (`aa.quilezStepFilter`, where the `balance` slot IS the duty threshold). dpdx/dpdy are
// fragment-only intrinsics, so this body is GPU-only; `stripeCoordP` and the kit filter carry the
// CPU-testable math.
export const stripesMask = tgpu.fn([d.vec2f, d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32], d.f32)(
    (uv, viewport, angle, density, animTime, offset, balance, softness) => {
        'use gpu'
        const p = stripeCoordP(uv, viewport, angle, density, animTime, offset)
        return quilezStepFilter(p, footprint1(p, softness), balance)
    })

// ── Chevron ─────────────────────────────────────────────────────────────────────────────────────
//
// Chevron / zigzag stripe mask for a screen UV. `animTime` is the per-node accumulated time. Uses
// fwidth (fragment-only). Part-grain already: one triangle-wave stripe family in a projected frame.
export const chevronMask = tgpu.fn(
    [d.vec2f, d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32], d.f32,
)((uv, viewport, count, angle, balance, softness, offset, animTime) => {
    'use gpu'
    const angleRad = angle * DEG_TO_RAD
    const cosA = std.cos(angleRad)
    const sinA = std.sin(angleRad)

    // Centre so rotation pivots at the viewport centre, then apply the INVERSE rotation (transpose
    // of rotate2, hence the negated sine) so a positive `angle` tilts the chevrons rather than the
    // sampling frame. `.x` is the stripe axis, `.y` the perpendicular one.
    const rot = rotate2(canvasCentredDelta(uv, aspectOf(viewport)), cosA, -sinA)

    // Triangle wave in the perpendicular direction creates the V shape; scroll along the stripe axis.
    const zigzag = std.abs(std.fract(rot.y * count) - 0.5) * 2.0
    const stripeCoord = rot.x * count + zigzag * 0.5 + animTime + offset
    const pattern = std.fract(stripeCoord)

    const fw = std.fwidth(stripeCoord)
    return std.smoothstep(balance - softness - fw, balance + softness + fw, pattern)
})

// ── Rings (Ripples) ─────────────────────────────────────────────────────────────────────────────
//
// Concentric ripple mask (0 = between rings, 1 = on a ring): aspect-correct the UV, measure the
// aspect-corrected distance to the (double-flipped) center, then a `sin` wave of that distance,
// banded by thickness/softness. `center` is the ALREADY-transformed prop value (transformPosition
// stores `(x, 1 - y)`), so `1.0 - center.y` recovers the authored y. `center.x` IS aspect-corrected
// (unlike Spiral). `animTime` is the per-node accumulated time. Pure trig (use softness > 0 to avoid
// the degenerate `smoothstep(t, t, x)` step at the default softness=0). Part-grain already: one
// radial sine band.
export const ripplesMask = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32, d.vec2f, d.vec2f], d.f32)(
    (center, frequency, softness, thickness, phase, animTime, uv, viewport) => {
        'use gpu'
        const aspect = viewport.x / viewport.y
        const dx = uv.x * aspect - center.x * aspect
        const dy = uv.y - (1.0 - center.y)
        const dist = std.length(d.vec2f(dx, dy))
        const waveInput = dist * frequency - animTime + phase
        const baseWave = std.sin(waveInput)
        // Map thickness [0,1] → threshold [-1,1]; smoothstep bands around it by softness, inverted so
        // the ring (baseWave below threshold) reads as 1.
        const thicknessThreshold = thickness * 2.0 - 1.0
        const banded = std.smoothstep(thicknessThreshold - softness, thicknessThreshold + softness, baseWave)
        return 1.0 - banded
    })

// ── Falling lines ───────────────────────────────────────────────────────────────────────────────

// Per-column random hash: float index → vec2(speedHash, phaseHash). sin-fract → GPU-only.
const colHash = tgpu.fn([d.f32], d.vec2f)((idx) => {
    'use gpu'
    return d.vec2f(
        std.fract(std.sin(idx * 127.1) * 43758.5453123),
        std.fract(std.sin(idx * 311.7) * 38291.3421),
    )
})

// The leading-edge elliptical rounded cap of a falling streak: as the fragment falls up to
// `hw * rounding` past the streak's end, the cap half-width follows the ellipse
// `hw * sqrt(1 - t²)`, banded by the caller's column-space footprint `fwU` (both smoothstep edges
// are floored so a zero-width cap cannot invert the band). The trailing
// `smoothstep(0, fwU, capHW)` fades the cap out entirely as its half-width drops below a pixel.
// Pure — the caller owns `fwU` (fwidth of the CONTINUOUS column coord, fragment-only).
export const fallingCapAlpha = tgpu.fn(
    [d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32], d.f32)(
    (vPeriodic, trailLen, density, hw, rounding, fwU, distFromCenter) => {
        'use gpu'
        const maxDepth = hw * rounding
        const gapDist = std.max(vPeriodic - trailLen, 0.0) * density
        const tcap = std.clamp(gapDist / std.max(maxDepth, 0.0001), 0.0, 1.0)
        const capHW = hw * std.sqrt(std.max(1.0 - tcap * tcap, 0.0))
        return (1.0 - std.smoothstep(std.max(capHW - fwU, 0.0), std.max(capHW + fwU, 0.001), distFromCenter))
            * std.smoothstep(0.0, fwU, capHW)
    })

// The lead→trail balance remap: reshapes the within-streak position into the color-ramp
// parameter. 0.5 = linear, 0 = all trail color, 1 = all lead color (denominator floored at
// 0.001 so balance 1 saturates instead of dividing by zero). Pure.
export const fallingBalanceRemap = tgpu.fn([d.f32, d.f32], d.f32)((withinStreak, balance) => {
    'use gpu'
    const balanceNum = 2.0 * balance - 1.0
    const balanceDen = std.max(2.0 * (1.0 - balance), 0.001)
    return std.clamp((withinStreak + balanceNum) / balanceDen, 0.0, 1.0)
})

// Rasterises directional falling-line streaks and returns `vec2(finalMask, balancedT)`; the paint
// noun does the lead→trail color mix (compile-time colorSpace `mixColorsVariants[mode]`).
// Per-column random speed/phase (`colHash`, sin-fract → GPU-only) + `animTime` drift (wrapped with
// fract to keep f32 precision over long runs) + fwidth AA (fragment-only, screen-space
// derivatives).
//
// What stays fused, and why — every extraction candidate considered:
// - The rotated (u, v) frame: u feeds the column quantisation AND `fwidth(u)`; v feeds the streak
//   position AND `fwidth(v)`. The fwidths must be taken on the CONTINUOUS coords in this fragment
//   scope (fwidth(fract(x)) corrupts at the fract boundary), and both masks, the cap and the
//   color ramp consume them — a frame part would have to return u, v and both fwidths at once,
//   which is the whole preamble.
// - The column quantisation + per-column speed/phase: `colIdx` feeds the hash while `colLocalU`
//   feeds the width mask and the cap; `vPeriodic` (built from the hash) feeds the streak mask,
//   the cap AND `withinStreak`. Splitting any of the four masks out re-derives these shared
//   intermediates per part.
// - The streak/width rect masks: two smoothsteps each over the shared fwidths — all plumbing, no
//   reusable arithmetic.
// - The elliptical leading cap: separable tail (only reads vPeriodic/hw/fwU/distFromCenter) —
//   extracted as `fallingCapAlpha`.
// - The balance remap: separable tail (only reads withinStreak/balance) — extracted as
//   `fallingBalanceRemap`.
export const fallingLinesField = tgpu.fn(
    [d.vec2f, d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32], d.vec2f)(
    (uv, vp, angle, density, speedVariance, trailLength, strokeWidth, rounding, balance, animTime) => {
        'use gpu'
        // Aspect-corrected UV, centered so angle pivots around the canvas center.
        const aspect = geom.aspectOf(vp)
        const corrUV = d.vec2f(uv.x * aspect, uv.y)
        const centeredUV = corrUV.sub(d.vec2f(aspect * 0.5, 0.5))

        // Rotate: u = perpendicular (columns), v = along motion.
        const angleRad = angle * DEG_TO_RAD
        const cosA = std.cos(angleRad)
        const sinA = std.sin(angleRad)
        const u = centeredUV.y * cosA - centeredUV.x * sinA
        const v = centeredUV.x * cosA + centeredUV.y * sinA

        // Quantize u into columns.
        const colF = u * density
        const colIdx = std.floor(colF)
        const colLocalU = std.fract(colF)

        // Per-column random speed + phase.
        const h = colHash(colIdx)
        const speedMod = 1.0 + (h.x - 0.5) * speedVariance * 2.0
        const phase = h.y

        // Streak position — fract the drift BEFORE subtracting to preserve f32 precision.
        const animOffset = std.fract(animTime * speedMod)
        const vPeriodic = std.fract(v - animOffset - phase)

        const trailLen = trailLength
        const withinStreak = std.clamp(vPeriodic / trailLen, 0.0, 1.0)

        // fwidth of the CONTINUOUS coords (fwidth(fract(x)) corrupts at the fract boundary).
        const fwV = std.clamp(std.fwidth(v), 0.001, 0.1)
        const fwU = std.clamp(std.fwidth(u) * density, 0.001, 0.1)

        const streakMask = 1.0 - std.smoothstep(trailLen - fwV, trailLen + fwV, vPeriodic)
        const hw = strokeWidth * 0.5
        const distFromCenter = std.abs(colLocalU - 0.5)
        const widthMask = 1.0 - std.smoothstep(hw - fwU, hw + fwU, distFromCenter)
        const rectMask = streakMask * widthMask

        const capAlpha = fallingCapAlpha(vPeriodic, trailLen, density, hw, rounding, fwU, distFromCenter)
        const finalMask = std.max(rectMask, capAlpha)

        return d.vec2f(finalMask, fallingBalanceRemap(withinStreak, balance))
    })

// ── Grid ────────────────────────────────────────────────────────────────────────────────────────

// Cell-CENTER UV (with rotation) for prop-map sampling: aspect-correct + Y-flip, rotate about the
// canvas centre, snap to the cell centre in rotated space, un-rotate, then invert back to screen
// UV. A mapped thickness/cells/rotation/softness samples its source once per cell here, so lines
// transition as whole lines instead of being clipped at source boundaries. Pure (no derivatives).
// The lattice itself is `cells.cellCentreUVRotated`; this wrapper exists only to convert a
// degrees-valued `rotation`, which is the grid's semantics and not the kit's.
export const gridCellCenterUV = tgpu.fn([d.vec2f, d.vec2f, d.f32, d.f32], d.vec2f)((uv, viewport, cells, rotation) => {
    'use gpu'
    return cellCentreUVRotated(uv, viewport, cells, rotation * DEG_TO_RAD)
})

// Grid cell content for a FRAME coordinate (`latticeFrameFlipY` output): returns
// vec2(gridMask, cellVariationFactor). The mask uses dpdx/dpdy (fragment-only; the Quilez axis
// integral lives in `aa.quilezLineFilterAxis`).
export const gridField = tgpu.fn(
    [d.vec2f, d.f32, d.f32, d.f32], d.vec2f,
)((gridUV, thickness, softness, variation) => {
    'use gpu'
    // Lines straddle each integer boundary symmetrically (lineWidth per side); shift by lineWidth
    // to align with Quilez's line-at-cell-start convention.
    const lineWidth = thickness * 0.01
    const safeLine = std.max(lineWidth, 0.0001)
    const lineFraction = safeLine * 2.0
    const N = 1.0 / lineFraction
    const p = gridUV.add(safeLine)

    // DEVIATION from `aa.footprint2`, which floors AFTER adding softness. Grid floors the raw
    // derivative FIRST and then adds, so a non-zero softness lands ~1e-5 wider here. Identical at
    // softness 0 and imperceptible above it, but it is a real difference, so the inline form stays.
    const dpx = std.dpdx(p)
    const dpy = std.dpdy(p)
    const wx = std.max(std.max(std.abs(dpx.x), std.abs(dpy.x)), 0.00001) + softness
    const wy = std.max(std.max(std.abs(dpx.y), std.abs(dpy.y)), 0.00001) + softness

    const iX = quilezLineFilterAxis(p.x, wx, N)
    const iY = quilezLineFilterAxis(p.y, wy, N)
    // Inclusion-exclusion: on a line when EITHER axis is in a line region.
    const gapBoth = (1.0 - iX) * (1.0 - iY)
    const gridMask = (1.0 - gapBoth) * std.step(0.0001, lineWidth)

    // Per-cell random lighten/darken factor.
    const variedFactor = cellVariation(std.floor(gridUV), variation)

    return d.vec2f(gridMask, variedFactor)
})

// ── Dot grid ────────────────────────────────────────────────────────────────────────────────────
//
// Dot coverage + per-dot twinkle: returns the (twinkled) alpha for a screen UV. `animTime` is the
// per-node accumulated drift time; `time` is the global clock (ctx.time — the twinkle oscillates on
// the un-paused clock). Row stagger + drift use GLSL-style floored mod because a distortion's
// `uvContext` can push `rowIndex` negative. `fwidth` is a fragment-only intrinsic.
// Stays fused: the unrotated Y-flipped frame feeds both the drifting tiling AND the AA footprint
// (which must come from the CONTINUOUS pre-stagger coordinate), and the tile struct feeds coverage
// + twinkle at once — TGSL cannot pass its members out without promoting the struct to a pointer.
export const dotGridAlpha = tgpu.fn(
    [d.vec2f, d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32], d.f32,
)((uv, viewport, density, dotSize, offset, speedVariance, twinkle, animTime, time) => {
    'use gpu'
    const correctedUV = aspectCorrectedUVFlipY(uv, viewport)
    const gridUV = correctedUV.mul(density)

    // Per-row horizontal shift: static brick stagger + optional per-row animated drift. Both parities
    // use a FLOORED mod because a distortion's uvContext can push `rowIndex` negative.
    const rowIndex = std.floor(gridUV.y)
    const speedMod = rowSpeedMultiplier(rowSpeedHash(rowIndex), speedVariance)
    const drift = animTime * speedMod
    const staticStagger = offset * flooredMod1(rowIndex, 2.0)
    const shiftedGrid = d.vec2f(gridUV.x - staticStagger - drift, gridUV.y)

    // Struct members read inline: binding one to a local makes typegpu emit a WGSL pointer.
    const tile = squareTiling(shiftedGrid)
    const centerDistance = std.length(tile.local.sub(0.5))

    // Circular dots with minimal AA for stability (pixel footprint in grid space).
    const pixelSize = std.length(std.fwidth(correctedUV.mul(density)))
    const coverage = discCoverage(centerDistance, dotSize * 0.5, pixelSize)

    // Twinkle: per-dot pseudo-random phase on the global clock (unaffected by speed). A third member
    // of the legacy sin-fract family (12.9898/78.233), not shared with `cells.cellHash`, so local.
    const dotPhase = std.fract(std.sin(tile.cell.x * 12.9898 + tile.cell.y * 78.233) * 43758.5453)
    const twinkleTime = time * 2.0 + dotPhase * TAU
    const twinkleValue = std.sin(twinkleTime) * 0.5 + 0.5
    const twinkleModifier = std.mix(1.0, twinkleValue, twinkle)

    return coverage * twinkleModifier
})

// ── Hex grid ────────────────────────────────────────────────────────────────────────────────────
//
// Hex cell content for a FRAME coordinate (`latticeFrameCW` output): returns
// vec2(lineMask, variationFactor). Uses fwidth, which is fragment-only.
export const hexGridField = tgpu.fn(
    [d.vec2f, d.f32, d.f32, d.f32], d.vec2f,
)((scaledUV, thickness, softness, variation) => {
    'use gpu'
    // POINTY-TOP hex tiling — period vec2(√3, 1). (The transpose is the flat-top orientation
    // IsometricCubes cuts into rhombi.)
    const hex = hexTiling(scaledUV, d.vec2f(SQRT3, 1.0))

    // Per-cell random → lighten/darken factor. Snap to integer cell indices before hashing (hex
    // centres sit on half-integer multiples; sub-pixel jitter would band the fills otherwise).
    const ix = std.round(hex.id.x * INV_SQRT3_2)
    const iy = std.round(hex.id.y * 2.0)
    const variedFactor = cellVariation(d.vec2f(ix, iy), variation)

    // Hex edge distance (pointy-top, circumradius 0.5) → line mask.
    // `hex.gv` read inline: binding a struct member to a local makes typegpu emit a WGSL pointer
    // (`&hex.gv`) and promote the struct to a `var`, which is noise for no gain.
    const pAbs = d.vec2f(std.abs(hex.gv.x), std.abs(hex.gv.y))
    const hexDist = std.max(std.dot(pAbs, d.vec2f(SQRT3_2, 0.5)), pAbs.y)
    const edgeDist = 0.5 - hexDist

    const lineWidth = thickness * 0.01
    const pixel = std.fwidth(scaledUV.x) * 0.5
    const lineMask = strokeBandFloored(edgeDist, lineWidth, pixel, softness)

    return d.vec2f(lineMask, variedFactor)
})

// ── Triangular grid ─────────────────────────────────────────────────────────────────────────────
//
// Triangle cell content for a FRAME coordinate (`latticeFrameFlipY` output): returns
// vec2(lineMask, variationFactor). Uses fwidth (fragment-only). `animTime` is the per-node
// accumulated time (row drift).
export const triangularGridField = tgpu.fn(
    [d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32], d.vec2f,
)((p, thickness, softness, variation, speedVariance, animTime) => {
    'use gpu'
    // Skew the equilateral lattice onto a unit-square integer grid (two triangles per square, split
    // by the anti-diagonal).
    const ps = triLattice(p)

    // Per-row horizontal drift (rows = skewed Y bands), with centered per-row variance.
    const rowIndex = std.floor(ps.y)
    const speedMod = rowSpeedMultiplier(rowSpeedHash(rowIndex), speedVariance)
    const drift = animTime * speedMod
    const psShifted = d.vec2f(ps.x - drift, ps.y)

    // `floor`/`fract` kept inline rather than routed through `cells.squareTiling`: TGSL cannot
    // destructure a struct return and binding a member to a local emits a WGSL pointer, so with the
    // in-cell coordinate read seven times below the struct form is a net loss in legibility.
    const cell = std.floor(psShifted)
    const f = std.fract(psShifted)

    // Two triangles per skewed cell, split by the anti-diagonal — fold which one into the id.
    const upper = std.step(1.0, f.x + f.y)
    const triId = d.vec2f(cell.x * 2.0 + upper, cell.y)
    const variedFactor = cellVariation(triId, variation)

    // Distance to the nearest of the three triangle edge families.
    const dEdge = std.min(
        std.min(std.min(f.x, 1.0 - f.x), std.min(f.y, 1.0 - f.y)),
        std.abs(f.x + f.y - 1.0),
    )

    const lineWidth = thickness * 0.02
    // AA width from the CONTINUOUS skewed coordinate (pre-shift); softness widens the band.
    const aaWidth = std.max(std.fwidth(ps.x), std.fwidth(ps.y)) + softness * 0.5
    const lineMask = strokeBandSymmetric(dEdge, lineWidth, aaWidth)

    return d.vec2f(lineMask, variedFactor)
})

// ── Brick ───────────────────────────────────────────────────────────────────────────────────────

// Brick lattice frame: canvas-centred delta, INVERSE rotation (transpose of rotate2, so a positive
// `rotation` spins the lattice rather than the sampling frame — hence the negated sine), then the
// rotated X is divided BACK by aspect. DEVIATION from the canonical framing: un-correcting X lays
// the brick lattice out in raw [0,1] UV space, so `cellsX` counts bricks across the canvas
// regardless of its shape — and is why the mortar thickness has to be rescaled by aspect by hand
// (see `brickField`). Pure.
//
// GATE-C CANDIDATE: this cannot sit on the shared `cellFrame` slot without a value change. Against
// all three lattice frames it differs by (a) the divide-back-by-aspect (raw-UV lattice — no
// sibling does this), (b) no add-back of the canvas centre (`rotateAboutCanvasCentre` adds it;
// round-tripping it back out is extra float ops), (c) `cos(θ)/-sin(θ)` where `latticeFrameCW`
// takes `cos(-θ)/sin(-θ)` (not guaranteed bit-identical), and (d) non-uniform cellsX/cellsY
// scaling applied AFTER the frame instead of a uniform `.mul(cells)` inside it. Converging brick
// onto `latticeFrameCW` + a uniform cell count is a look-preserving-but-not-byte-identical rewrite.
export const brickFrame = tgpu.fn([d.vec2f, d.vec2f, d.f32], d.vec2f)((uv, viewport, rotation) => {
    'use gpu'
    const aspect = aspectOf(viewport)
    const centred = canvasCentredDelta(uv, aspect)
    const rotRad = rotation * DEG_TO_RAD
    const cosR = std.cos(rotRad)
    const sinR = std.sin(rotRad)
    const rot = rotate2(centred, cosR, -sinR)
    return d.vec2f(rot.x / aspect + 0.5, rot.y + 0.5)
})

// Row stagger + drift multiplier for a brick row: vec2(rowOffset, rowSpeedMult). Row parity uses a
// FLOORED (not truncated) mod — `v` leaves [0,1] under rotation / a distortion's uvContext, so
// `row` goes negative and WGSL's `%` would flip the parity on that half-plane. Even rows drift +1,
// odd rows -1; `speedVariance` mixes toward a per-row random speed in [-1, 1] (a seed-offset
// member of the legacy sin-fract family, but not the same one as `cells.rowSpeedHash` — no 127.1
// scale, and re-centred — so it stays local). Pure.
export const brickRowStagger = tgpu.fn([d.f32, d.f32, d.f32], d.vec2f)((row, seed, speedVariance) => {
    'use gpu'
    const rowMod2 = flooredMod1(row, 2.0)
    const rowOffset = rowMod2 * 0.5
    const rowDir = rowMod2 * 2.0 - 1.0
    const rowHash = (std.fract(std.sin(row + seed * 0.137) * 43758.5453) - 0.5) * 2.0
    return d.vec2f(rowOffset, std.mix(rowDir, rowHash, speedVariance))
})

// Mortar mask for the in-cell fract coordinates: a band above the mortar fraction on each axis,
// widened by the AA footprint, multiplied. Pure — the caller owns the fwidths (they must be taken
// on the CONTINUOUS pre-fract coords).
export const brickMortarMask = tgpu.fn([d.vec2f, d.vec2f, d.vec2f], d.f32)((cellUV, mortarUV, aaUV) => {
    'use gpu'
    const brickU = bandMask(cellUV.x, mortarUV.x - aaUV.x, mortarUV.x + aaUV.x)
    const brickV = bandMask(cellUV.y, mortarUV.y - aaUV.y, mortarUV.y + aaUV.y)
    return brickU * brickV
})

// Brick coverage mask + per-brick variation factor for a screen UV. Returns
// vec2(brickMask, variationFactor). `animTime` is the per-node accumulated time. Composes
// `brickFrame` (its own frame — see the Gate-C note there), `brickRowStagger`, `brickMortarMask`
// and the shared `cellVariation`; the staggered continuous coordinate stays here because its
// fwidth (fragment-only) and its floor feed the mask AND the brick id at once. `aspect` is
// re-derived for the mortar compensation — `aspectOf` is pure, so the value is identical to the
// frame's.
export const brickField = tgpu.fn(
    [d.vec2f, d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32, d.f32], d.vec2f,
)((uv, viewport, cellsX, cellsY, mortar, softness, variation, rotation, offset, speedVariance, seed, animTime) => {
    'use gpu'
    const aspect = aspectOf(viewport)
    const frame = brickFrame(uv, viewport, rotation)
    const u = frame.x
    const v = frame.y

    // Mortar: 0-1 input → 0-0.3 effective fraction of brick width; equal pixel width in both dirs
    // (the aspect rescale compensates for the frame's un-corrected X).
    const mortarU = mortar * 0.3
    const mortarV = mortarU * aspect * cellsY / cellsX

    const row = std.floor(v * cellsY)
    const stagger = brickRowStagger(row, seed, speedVariance)

    const brickArg = u * cellsX + stagger.x + animTime * stagger.y + offset
    const vScaled = v * cellsY
    const cellU = std.fract(brickArg)
    const cellV = std.fract(vScaled)

    // Brick mask with analytic AA (fwidth of the continuous pre-fract coords) + softness widening.
    const soft = softness * 0.5
    const aaU = std.fwidth(brickArg) + soft
    const aaV = std.fwidth(vScaled) + soft
    const brickMask = brickMortarMask(d.vec2f(cellU, cellV), d.vec2f(mortarU, mortarV), d.vec2f(aaU, aaV))

    // Per-brick random lighten/darken (integer brick id).
    const brickId = d.vec2f(std.floor(brickArg), row)
    const variedFactor = cellVariation(brickId, variation)

    return d.vec2f(brickMask, variedFactor)
})

// ── Truchet ─────────────────────────────────────────────────────────────────────────────────────

// Tile coordinate → float in [0, 1]. sin-fract → GPU-only.
//
// NOT `cells.cellHash`: this is the dot-with-(127.1, 311.7) member of the legacy sin-fract family,
// a different sequence from the fract-multiply chain the grid generators use. Neither gets
// "improved" into the other, and the truchet field is this variant's only consumer among the
// pattern generators, so it stays local.
const truchetHash = tgpu.fn([d.vec2f], d.f32)((p) => {
    'use gpu'
    const h = std.dot(p, d.vec2f(127.1, 311.7))
    return std.fract(std.sin(h) * 43758.5453)
})

// Truchet cell content for a FRAME coordinate (`latticeFrameCW` output): quarter-circle arc-tile
// line mask. Uses fwidth (fragment-only) and a sin-fract hash. Returns the arc line mask (0-1).
export const truchetField = tgpu.fn(
    [d.vec2f, d.f32, d.f32, d.f32], d.f32,
)((scaledUV, thickness, softness, seed) => {
    'use gpu'
    const tile = squareTiling(scaledUV)

    // Hash this tile to decide arc orientation — seed offsets the cell coordinate.
    const h = truchetHash(d.vec2f(tile.cell.x + seed, tile.cell.y + seed))
    const flip = h > 0.5

    // Two quarter-circle arcs per tile, centered at opposite corners.
    const c1x = std.select(d.f32(0.0), d.f32(1.0), flip)
    const c2x = std.select(d.f32(1.0), d.f32(0.0), flip)

    // Arc SDF: distance from the circle at radius 0.5. Arc-1 centre y = 0, arc-2 centre y = 1.
    const d1 = std.abs(std.length(d.vec2f(tile.local.x - c1x, tile.local.y)) - 0.5)
    const d2 = std.abs(std.length(d.vec2f(tile.local.x - c2x, tile.local.y - 1.0)) - 0.5)
    const arcDist = std.min(d1, d2)

    const lineWidth = thickness * 0.005
    const pixel = std.fwidth(scaledUV.x) * 0.5
    return strokeBandFloored(arcDist, lineWidth, pixel, softness)
})

// ── Weave ───────────────────────────────────────────────────────────────────────────────────────
//
// Weave cell content for a FRAME coordinate (`latticeFrame` output): the interlaced thread color.
// Uses fwidth (fragment-only). Returns the composited thread color (rgba) directly — the
// alpha-weighted blend of the two thread colors is not a colorSpace mix, so it lives in the body.
// Stays fused below the frame: the two thread bands, the over-under parity and the per-thread
// alpha weights all read the same tile struct and each other's intermediates.
export const weaveColor = tgpu.fn(
    [d.vec2f, d.f32, d.vec4f, d.vec4f], d.vec4f,
)((scaledUV, gap, colorA, colorB) => {
    'use gpu'
    // Struct members read inline: binding one to a local makes typegpu emit a WGSL pointer.
    const tile = squareTiling(scaledUV)

    const pixel = std.fwidth(scaledUV.x) * 0.5

    // Thread bands: 1 inside the thread, 0 in the gap — one symmetric band per axis.
    const hBand = bandMask(tile.local.y, gap, gap + pixel)
    const vBand = bandMask(tile.local.x, gap, gap + pixel)

    // Checkerboard rule: which thread is on top at each intersection. `cell.x + cell.y` can go
    // negative under rotation/uvContext, so this MUST be a GLSL-style FLOORED mod —
    // std.mod is truncated `%` and would flip parity on the negative half-plane.
    const isHTopFloat = flooredMod1(tile.cell.x + tile.cell.y, 2.0)

    const intersection = hBand * vBand
    const hVis = std.clamp(hBand - intersection * isHTopFloat, 0.0, 1.0)
    const vVis = std.clamp(vBand - intersection * (1.0 - isHTopFloat), 0.0, 1.0)

    // Per-thread alpha-weighted average of the thread RGBs.
    const weightA = colorA.w * hVis
    const weightB = colorB.w * vVis
    const totalAlpha = std.clamp(weightA + weightB, 0.0, 1.0)
    const safeWeight = std.max(weightA + weightB, 0.001)
    const r = (colorA.x * weightA + colorB.x * weightB) / safeWeight
    const g = (colorA.y * weightA + colorB.y * weightB) / safeWeight
    const b = (colorA.z * weightA + colorB.z * weightB) / safeWeight
    return d.vec4f(r, g, b, totalAlpha)
})

// ── Isometric cubes ─────────────────────────────────────────────────────────────────────────────

const INV_2_SQRT3 = 2 / Math.sqrt(3)

// Rhombille (isometric-cube) cell content for a FRAME coordinate (`latticeFrameCW` output).
// Returns vec3(cubeRand, faceTone, edgeWire) — the paint noun does the compile-time-colorSpace
// color mixing. Uses fwidth, which is fragment-only.
// Stays fused below the frame: the three sector scores feed the face classification, the tone AND
// the internal edge field at once.
export const isoCubeField = tgpu.fn(
    [d.vec2f, d.f32, d.f32], d.vec3f,
)((scaledUV, thickness, softness) => {
    'use gpu'
    // Hex tiling with period vec2(1, √3) — the transpose of HexGrid's pointy-top orientation, so
    // the three rhombi of the cut meet at a vertical vertex and read as three cube faces.
    // Struct members are read inline throughout: binding one to a local makes typegpu emit a WGSL
    // pointer and promote the struct to a `var`.
    const hex = hexTiling(scaledUV, d.vec2f(1.0, SQRT3))

    // Classify into one of three 120° sectors via inward edge normals at 90°, 210°, 330°.
    const s0 = std.dot(hex.gv, d.vec2f(0.0, 1.0))
    const s1 = std.dot(hex.gv, d.vec2f(-SQRT3_2, -0.5))
    const s2 = std.dot(hex.gv, d.vec2f(SQRT3_2, -0.5))
    // isTop ⇔ s0 ≥ s1 AND s0 ≥ s2 ⇔ s0 ≥ max(s1, s2) (avoids `&&`). isLeft ⇔ s1 ≥ s2.
    const isTop = s0 >= std.max(s1, s2)
    const isLeft = s1 >= s2
    // Top face brightest, lower-left darkest, lower-right mid — this shading IS the 3D illusion.
    const tone = std.select(std.select(0.74, 0.5, isLeft), 1.0, isTop)

    // Per-cube random color (shared across the three faces). Snap to integer cell indices before hashing.
    const ix = std.round(hex.id.x * 2.0)
    const iy = std.round(hex.id.y * INV_2_SQRT3)
    const rand = cellHash(d.vec2f(ix, iy))

    // Edges: internal rhombus boundaries (top two sector scores meet) + the hexagon rim.
    const mx = std.max(s0, std.max(s1, s2))
    const mn = std.min(s0, std.min(s1, s2))
    const midScore = s0 + s1 + s2 - mx - mn
    const internal = mx - midScore
    const pAbs = d.vec2f(std.abs(hex.gv.x), std.abs(hex.gv.y))
    const hexDist = std.max(std.dot(pAbs, d.vec2f(0.5, SQRT3_2)), pAbs.x)
    const rimDist = 0.5 - hexDist
    const edgeField = std.min(internal, rimDist)

    const lineWidth = thickness * 0.02
    // AA from a CONTINUOUS coord (scaledUV) — fwidth of the folded edgeField would spike at seams.
    const aaWidth = std.fwidth(scaledUV.x) * 0.5 + softness * 0.5
    const wire = strokeBandSymmetric(edgeField, lineWidth, aaWidth)

    return d.vec3f(rand, tone, wire)
})

// ── Halftone ────────────────────────────────────────────────────────────────────────────────────

// Fixed dot-edge softness for the halftone screens.
const SMOOTHNESS = 0.1

// Classic style: single-plate dot pattern modulated by the child's brightness (child sampled at
// the current pixel + unpremultiplied by the noun → `childColor` is straight).
export const halftoneClassic = tgpu.fn([d.vec4f, d.vec2f, d.f32, d.f32, d.f32], d.vec4f)(
    (childColor, uv, aspect, angleDeg, frequency) => {
        'use gpu'
        const aspectUV = d.vec2f(uv.x * aspect, uv.y)
        const angleRad = angleDeg * DEG_TO_RAD
        const c = std.cos(angleRad)
        const s = std.sin(angleRad)
        const rotatedUV = d.vec2f(std.dot(aspectUV, d.vec2f(c, s * -1.0)), std.dot(aspectUV, d.vec2f(s, c)))
        const gridUV = std.fract(rotatedUV.mul(frequency)).sub(d.vec2f(0.5, 0.5))
        const brightness = std.dot(d.vec3f(childColor.x, childColor.y, childColor.z), d.vec3f(0.299, 0.587, 0.114))
        const dotSize = brightness * 0.7 + 0.15
        const dist = std.length(gridUV)
        const dotPattern = 1.0 - std.smoothstep(dotSize - SMOOTHNESS, dotSize + SMOOTHNESS, dist)
        return d.vec4f(childColor.x * dotPattern, childColor.y * dotPattern, childColor.z * dotPattern, childColor.w * dotPattern)
    })

// CMYK plate sample UV: the child is sampled at a per-plate offset around `misprintAngle` (+ the
// plate's 0/90/180/270° index) so mis-registration shows as color fringing. Y offset divided by
// aspect so the on-screen magnitude matches `misprint` regardless of viewport shape.
export const halftonePlateUV = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32, d.f32], d.vec2f)(
    (uv, misprintAngleDeg, plateIndexDeg, misprint, aspect) => {
        'use gpu'
        const angleRad = (misprintAngleDeg + plateIndexDeg) * DEG_TO_RAD
        return d.vec2f(uv.x + std.cos(angleRad) * misprint, uv.y + std.sin(angleRad) * misprint / aspect)
    })

// One CMYK component per plate sample (each plate reads only its own channel from its own offset).
export const halftoneChannelK = tgpu.fn([d.vec4f], d.f32)((s) => {
    'use gpu'
    return 1.0 - std.max(std.max(s.x, s.y), s.z)
})
export const halftoneChannelC = tgpu.fn([d.vec4f], d.f32)((s) => {
    'use gpu'
    const k = halftoneChannelK(s)
    const invK = std.max(1.0 - k, 0.0001)
    return (1.0 - s.x - k) / invK
})
export const halftoneChannelM = tgpu.fn([d.vec4f], d.f32)((s) => {
    'use gpu'
    const k = halftoneChannelK(s)
    const invK = std.max(1.0 - k, 0.0001)
    return (1.0 - s.y - k) / invK
})
export const halftoneChannelY = tgpu.fn([d.vec4f], d.f32)((s) => {
    'use gpu'
    const k = halftoneChannelK(s)
    const invK = std.max(1.0 - k, 0.0001)
    return (1.0 - s.z - k) / invK
})

// Plate dot mask: aspect-correct + rotate the UV by the plate's screen angle, then size the dot by
// `intensity` (the plate's CMYK value). Returns 1 inside the dot, 0 outside.
export const halftonePlateGrid = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32, d.f32], d.f32)(
    (uv, aspect, angleDeg, intensity, frequency) => {
        'use gpu'
        const aspectUV = d.vec2f(uv.x * aspect, uv.y)
        const angleRad = angleDeg * DEG_TO_RAD
        const c = std.cos(angleRad)
        const s = std.sin(angleRad)
        const rotatedUV = d.vec2f(std.dot(aspectUV, d.vec2f(c, s * -1.0)), std.dot(aspectUV, d.vec2f(s, c)))
        const grid = std.fract(rotatedUV.mul(frequency)).sub(d.vec2f(0.5, 0.5))
        const dist = std.length(grid)
        // -SMOOTHNESS offset so intensity=0 leaves no coverage at the cell centre.
        const size = intensity * 0.75 - SMOOTHNESS
        return 1.0 - std.smoothstep(size - SMOOTHNESS, size + SMOOTHNESS, dist)
    })

// Subtractive lay-down: fade white toward the ink color where the dot is covered (× ink alpha).
export const halftoneTransmission = tgpu.fn([d.vec4f, d.f32], d.vec3f)((inkColor, inkMask) => {
    'use gpu'
    return std.mix(d.vec3f(1.0, 1.0, 1.0), d.vec3f(inkColor.x, inkColor.y, inkColor.z), d.vec3f(inkMask * inkColor.w))
})

// ── Dither ──────────────────────────────────────────────────────────────────────────────────────

// Pixel-grid cell coordinate (`floor(screenUV * gridRes / pixelSize)`) + its sample UV.
export const ditherCoord = tgpu.fn([d.vec2f, d.vec2f, d.f32], d.vec2f)((uv, gridRes, pixelSize) => {
    'use gpu'
    return std.floor(d.vec2f(uv.x * gridRes.x / pixelSize, uv.y * gridRes.y / pixelSize))
})
export const ditherPixUV = tgpu.fn([d.vec2f, d.f32, d.vec2f], d.vec2f)((coord, pixelSize, gridRes) => {
    'use gpu'
    return d.vec2f((coord.x + 0.5) * pixelSize / gridRes.x, (coord.y + 0.5) * pixelSize / gridRes.y)
})

// Rec.601 luminance × alpha of an (already unpremultiplied) child color.
export const ditherLuma = tgpu.fn([d.vec4f], d.f32)((c) => {
    'use gpu'
    return std.dot(d.vec3f(c.x, c.y, c.z), d.vec3f(0.299, 0.587, 0.114)) * c.w
})

// Bayer quad term bQ(x,y) = y*3 + x*2 - x*y*4, x,y ∈ {0,1}.
export const ditherBayerQuad = tgpu.fn([d.f32, d.f32], d.f32)((a, b) => {
    'use gpu'
    return b * 3.0 + a * 2.0 - a * b * 4.0
})

// The four periodic threshold fields baked at the cell coord: vec4(bayer2, bayer4, bayer8,
// clusteredDot). Computed directly from their closed-form formulas rather than sampled from an 8×8
// lookup-table texture (nearest, repeat) — the two are equivalent, and computing them directly
// avoids a DataTexture entirely. Texel = coord mod 8.
export const ditherPeriodic = tgpu.fn([d.vec2f], d.vec4f)((coord) => {
    'use gpu'
    const tx = coord.x - 8.0 * std.floor(coord.x / 8.0)
    const ty = coord.y - 8.0 * std.floor(coord.y / 8.0)
    const x2 = tx - 2.0 * std.floor(tx / 2.0)
    const y2 = ty - 2.0 * std.floor(ty / 2.0)
    const x4 = tx - 4.0 * std.floor(tx / 4.0)
    const y4 = ty - 4.0 * std.floor(ty / 4.0)
    const x4h = std.floor(x4 / 2.0)
    const y4h = std.floor(y4 / 2.0)
    const x8h = std.floor(tx / 4.0)
    const y8h = std.floor(ty / 4.0)
    const b00 = ditherBayerQuad(x2, y2)
    const b11 = ditherBayerQuad(x4h, y4h)
    const b22 = ditherBayerQuad(x8h, y8h)
    const bayer2 = b00 / 4.0
    const bayer4 = (b00 * 4.0 + b11) / 16.0
    const bayer8 = (b00 * 16.0 + b11 * 4.0 + b22) / 64.0
    // clusteredDot = cM[y4][x4] / 16 (fixed 4×4 matrix), as a select ladder over the flat index.
    const idx = d.i32(y4) * 4 + d.i32(x4)
    let cd = 0.75
    cd = std.select(cd, 0.3125, idx === 1)
    cd = std.select(cd, 0.375, idx === 2)
    cd = std.select(cd, 0.8125, idx === 3)
    cd = std.select(cd, 0.25, idx === 4)
    cd = std.select(cd, d.f32(0.0), idx === 5)
    cd = std.select(cd, 0.0625, idx === 6)
    cd = std.select(cd, 0.4375, idx === 7)
    cd = std.select(cd, 0.6875, idx === 8)
    cd = std.select(cd, 0.1875, idx === 9)
    cd = std.select(cd, 0.125, idx === 10)
    cd = std.select(cd, 0.5, idx === 11)
    cd = std.select(cd, 0.9375, idx === 12)
    cd = std.select(cd, 0.625, idx === 13)
    cd = std.select(cd, 0.5625, idx === 14)
    cd = std.select(cd, 0.875, idx === 15)
    return d.vec4f(bayer2, bayer4, bayer8, cd)
})

// Hash threshold fields (blue-noise interleaved-gradient + white noise).
export const ditherBlueNoise = tgpu.fn([d.vec2f], d.f32)((coord) => {
    'use gpu'
    const c = coord.add(d.vec2f(0.5, 0.5))
    return std.fract(52.9829189 * std.fract(c.x * 0.06711056 + c.y * 0.00583715))
})
export const ditherWhiteNoise = tgpu.fn([d.vec2f], d.f32)((coord) => {
    'use gpu'
    // Integer bitcast hash — `coord` is device-pixel scale, where the classic sin-fract hash
    // streaks on iOS Metal (low-precision large-argument sin range reduction).
    return noise.hash12(coord)
})

// Quantise against an ordered threshold field: contract the field around 0.5 by `spread`, then
// step against the (threshold-biased) luminance.
export const ditherOrderedResult = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)((ditherValue, luminance, threshold, spread) => {
    'use gpu'
    const adjustedDither = 0.5 + (ditherValue - 0.5) * spread
    return std.step(adjustedDither, luminance + (threshold - 0.5))
})

// FS block helpers: origin of this fragment's 8×8 block + its local cell index (lic).
export const ditherBlockOrigin = tgpu.fn([d.vec2f], d.vec2f)((coord) => {
    'use gpu'
    return std.floor(coord.div(d.vec2f(8.0, 8.0))).mul(d.vec2f(8.0, 8.0))
})
export const ditherLocalCellIndex = tgpu.fn([d.vec2f, d.vec2f], d.f32)((coord, blockOrigin) => {
    'use gpu'
    return (coord.y - blockOrigin.y) * 8.0 + (coord.x - blockOrigin.x)
})
// Cell sample UV for FS block cell (lx,ly): cell center (gx+0.5,gy+0.5)*pixelSize/gridRes.
export const ditherCellUV = tgpu.fn([d.vec2f, d.f32, d.f32, d.f32, d.vec2f], d.vec2f)((blockOrigin, lx, ly, pixelSize, gridRes) => {
    'use gpu'
    return d.vec2f((blockOrigin.x + lx + 0.5) * pixelSize / gridRes.x, (blockOrigin.y + ly + 0.5) * pixelSize / gridRes.y)
})

// Floyd-Steinberg: re-run the genuine serpentine FS scan over this fragment's 8×8 tile (64 cell
// lumas shared) and read off the quantised value for the fragment's own cell. Confining diffusion
// to a tile keeps the pattern temporally stable (global FS would crawl frame-to-frame). Local `var`
// arrays + a runtime loop.
//
// Working-set reduction (occupancy): FS diffusion only ever writes into the CURRENT row (the
// 7/16 right-neighbour, always ahead of the scan) and the row DIRECTLY BELOW (3/16,5/16,1/16), so a
// rolling two-row error buffer (16 f32) suffices — the full 8×8 error field (64 f32) is never needed.
// And since a fragment reads back only its OWN cell, we capture that one quantised value as the scan
// passes it (a scalar) instead of retaining all 64 (`q[64]`). This shrinks the local working set from
// 192 f32 (`lum[64]+err[64]+q[64]`) to 80 (`lum[64]+ecur[8]+enext[8]`), lifting occupancy so the 64
// dependent block-luma texture reads latency-hide — where this pattern actually spends its time,
// especially as an intermediate RTT pass under a stacked filter. The scan visits every cell in the
// identical order and accumulates the identical error terms into the identical logical cells, so it
// produces the same result as the full flat-array version.
export const ditherFloydSteinberg = tgpu.fn([d.arrayOf(d.f32, 64), d.f32, d.f32, d.f32], d.f32)((lum, lic, threshold, spread) => {
    'use gpu'
    const thr = 0.5 - (threshold - 0.5)
    // `d.arrayOf(d.f32, 8)()` zero-inits as array<f32,8> — a bare `[0.0, …]` literal infers
    // array<i32> (integer-valued literals), which would TRUNCATE the fractional diffusion errors on
    // the GPU.
    const ecur = d.arrayOf(d.f32, 8)() // error diffused into the row currently being scanned
    const enext = d.arrayOf(d.f32, 8)() // error accumulating for the row directly below
    const licInt = d.i32(lic)
    let result = d.f32(0.0)
    for (let y = 0; y < 8; y++) {
        const ltr = (y & 1) === 0 // serpentine scan direction
        for (let xi = 0; xi < 8; xi++) {
            const x = std.select(7 - xi, xi, ltr)
            const idx = y * 8 + x
            const val = lum[idx] + ecur[x]
            const qv = std.step(thr, val)
            result = std.select(result, qv, idx === licInt) // capture only this fragment's own cell
            const e = (val - qv) * spread
            const dir = std.select(-1, 1, ltr)
            const xr = x + dir
            if (xr >= 0) {
                if (xr < 8) {
                    ecur[xr] = ecur[xr] + e * 0.4375 // 7/16 (same row, ahead of the scan)
                }
            }
            if (y < 7) {
                const xbl = x - dir
                const xbr = x + dir
                if (xbl >= 0) {
                    if (xbl < 8) {
                        enext[xbl] = enext[xbl] + e * 0.1875 // 3/16
                    }
                }
                enext[x] = enext[x] + e * 0.3125 // 5/16
                if (xbr >= 0) {
                    if (xbr < 8) {
                        enext[xbr] = enext[xbr] + e * 0.0625 // 1/16
                    }
                }
            }
        }
        // Advance the rolling buffer: the row below becomes the current row; clear the next buffer.
        for (let k = 0; k < 8; k++) {
            ecur[k] = enext[k]
            enext[k] = d.f32(0.0)
        }
    }
    return result
})

// color compose. Custom: mix the two custom colors; Source: darken→brighten mix.
export const ditherComposeCustom = tgpu.fn([d.vec4f, d.vec4f, d.f32], d.vec4f)((colorA, colorB, ditherResult) => {
    'use gpu'
    const rgb = std.mix(d.vec3f(colorA.x, colorA.y, colorA.z), d.vec3f(colorB.x, colorB.y, colorB.z), d.vec3f(ditherResult))
    const a = std.mix(colorA.w, colorB.w, ditherResult)
    return d.vec4f(rgb.x, rgb.y, rgb.z, a)
})
export const ditherComposeSource = tgpu.fn([d.vec4f, d.f32], d.vec4f)((sourceColor, ditherResult) => {
    'use gpu'
    const rgb = d.vec3f(sourceColor.x, sourceColor.y, sourceColor.z)
    const dark = rgb.mul(0.3)
    const bright = std.min(rgb.mul(1.3), d.vec3f(1.0, 1.0, 1.0))
    const out = std.mix(dark, bright, d.vec3f(ditherResult))
    return d.vec4f(out.x, out.y, out.z, sourceColor.w)
})

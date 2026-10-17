/**
 * Overlay drawing part bodies (boxes, brackets, premultiplied compositing) behind
 * std/effects/overlay. The overlay-role shaders (ObjectTracker, KeyFrames) draw diagnostic
 * chrome inside runtime loops / non-uniform blocks the Expr graph cannot express, so these
 * bodies are STATEMENT-LEVEL — each returns the exact WGSL statement string(s) for one drawing
 * operation, with the consumer supplying its own local names and value expressions as slots.
 * Relocating a call site onto these parts is therefore byte-identical in the emitted WGSL.
 */
import {formatFloat} from '../contract'
import type {GpuFragmentParams, KitTexture} from '../contract'
import {createSwappableMediaTexture} from './host/mediaLifecycle'
import {createCanvasRasterTarget, createFontDependentRaster, createRasterInvalidator} from './host/canvasRaster'
import {loadGoogleFont} from '../../utilities/fonts'

const L = formatFloat

/**
 * Premultiplied Porter-Duff "over": composite one straight-alpha layer (`rgb`, `a`) on top of
 * the premultiplied accumulator `dst`, clamping the layer alpha. One statement, brace-scoped so
 * repeated composites in the same block don't collide on the temp.
 */
export function overPremul(dst: string, rgb: string, a: string): string {
    return `{ let av = clamp(${a}, 0.0, 1.0); ${dst} = vec4f((${rgb}) * av + ${dst}.rgb * (1.0 - av), av + ${dst}.a * (1.0 - av)); }`
}

/**
 * Signed distance to a (rounded) rectangle: emits the classic sdRoundRect `q`/`sd` pair for the
 * centre-relative point `pp` against half-extent `half`. With `radius` omitted the radius terms
 * are not emitted at all (a sharp box, not a zero-radius one).
 */
export function roundRectSD(names: {q: string; sd: string}, opts: {pp: string; half: string; radius?: string}): string[] {
    const {q, sd} = names
    const {pp, half, radius} = opts
    if (radius === undefined) {
        return [
            `let ${q} = abs(${pp}) - ${half};`,
            `let ${sd} = length(max(${q}, vec2f(0.0))) + min(max(${q}.x, ${q}.y), ${L(0)});`,
        ]
    }
    return [
        `let ${q} = abs(${pp}) - ${half} + ${radius};`,
        `let ${sd} = length(max(${q}, vec2f(0.0))) + min(max(${q}.x, ${q}.y), ${L(0)}) - ${radius};`,
    ]
}

/**
 * The corner-bracket mask: keeps a box stroke only near its four corners (the "tracker
 * bracket" look). `blInit` is the bracket-length expression — the constant inside it is the
 * consumer's look and stays at the call site. Multiplies `stroke` in place.
 */
export function cornerBracketMask(
    names: {bl: string; inCorner: string},
    opts: {blInit: string; px: string; py: string; hx: string; hy: string; stroke: string},
): string[] {
    const {bl, inCorner} = names
    const {blInit, px, py, hx, hy, stroke} = opts
    return [
        `let ${bl} = ${blInit};`,
        `let ${inCorner} = abs(${px}) > ${hx} - ${bl} && abs(${py}) > ${hy} - ${bl};`,
        `${stroke} = ${stroke} * select(${L(0)}, ${L(1)}, ${inCorner});`,
    ]
}

/**
 * The overlay output convention: the draw accumulator is premultiplied; the fragment returns
 * straight alpha. Returns the final expression string.
 */
export function straightFromPremul(dst: string): string {
    return `vec4f(${dst}.rgb / max(${dst}.a, ${L(0.0001)}), ${dst}.a)`
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Detection-overlay parts — the spatial-partition analysis (cell scan, partition walk,
// content-tight bbox), the detection box + glyph-pill label drawing, and the glyph-strip
// label atlas host recipe. Statement emitters over a shared DetectionEmitFrame: they run
// against runtime origin/size locals with JS-unrolled taps, so every child read is a
// textureSampleLevel string the Expr graph cannot host.
// ═══════════════════════════════════════════════════════════════════════════════════════

export const GLYPH_ATLAS_GLYPHS = "0123456789x%"
export const GLYPH_ATLAS_SLOTS = 16
export const GLYPH_ATLAS_CELL_W = 64
export const GLYPH_ATLAS_CELL_H = 96
const ATLAS_GLYPHS = GLYPH_ATLAS_GLYPHS
const ATLAS_SLOTS = GLYPH_ATLAS_SLOTS
const ATLAS_CELL_W = GLYPH_ATLAS_CELL_W
const ATLAS_CELL_H = GLYPH_ATLAS_CELL_H
const ATLAS_W = ATLAS_SLOTS * ATLAS_CELL_W
const ATLAS_H = ATLAS_CELL_H
export const DETECTION_WALK_SCAN = 3
export const DETECTION_LEAF_SCAN = 4
const WALK_SCAN = DETECTION_WALK_SCAN
const LEAF_SCAN = DETECTION_LEAF_SCAN

const LUM = 'vec3f(0.299, 0.587, 0.114)'
const num = (v: unknown, f: number): number => (typeof v === 'number' ? v : f)

// ── Glyph-strip label atlas (host recipe part) ───────────────────────────────────────────────────

/**
 * A glyph-strip atlas: a fixed-size media texture rasterised on a CPU canvas, redrawn on
 * font-prop change (prop-keyed invalidation + fallback-then-real-font re-raster). Returns the
 * atlas texture the label part samples by digit slot.
 */
export function createGlyphStripAtlas(params: GpuFragmentParams, opts: {glyphs?: string; label?: string; familyProp?: string; weightProp?: string} = {}): KitTexture {
    const {getCpuValue} = params
    // Fixed-size digit strip: never resized, so the swappable handle is used purely for its
    // placeholder + dispose-guarded write.
    const glyphTex = createSwappableMediaTexture(params, {
        label: opts.label ?? 'GlyphStrip:atlas',
        initial: {width: ATLAS_W, height: ATLAS_H},
    })
    const target = createCanvasRasterTarget(params, {contextAttributes: {willReadFrequently: true}})
    const readFont = () => ({family: String(getCpuValue(opts.familyProp ?? 'fontFamily') ?? 'Inter'), weight: num(getCpuValue(opts.weightProp ?? 'fontWeight'), 500)})
    const build = (family: string, weight: number): void => {
        if (glyphTex.disposed) return
        const c = target.canvas() ? target.context() : target.resize(ATLAS_W, ATLAS_H)
        if (!c) return
        c.clearRect(0, 0, ATLAS_W, ATLAS_H)
        c.fillStyle = '#ffffff'
        c.font = `${weight} ${Math.round(ATLAS_CELL_H * 0.62)}px "${family}", ui-monospace, monospace`
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        const glyphs = opts.glyphs ?? ATLAS_GLYPHS
        for (let i = 0; i < glyphs.length; i++) c.fillText(glyphs[i], i * ATLAS_CELL_W + ATLAS_CELL_W / 2, ATLAS_CELL_H / 2 + 1)
        glyphTex.write(target.canvas())
    }
    // Drawn eagerly (not on a deferred tick like Text/Ascii) — the label font props read fine
    // from their defaults, so there is a legible strip on the very first frame.
    const fp0 = readFont()
    build(fp0.family, fp0.weight)
    const rebuild = () => { const fp = readFont(); build(fp.family, fp.weight) }
    const font = createFontDependentRaster({
        key: () => { const fp = readFont(); return `${fp.family}|${fp.weight}` },
        load: () => { const fp = readFont(); return loadGoogleFont(fp.family, fp.weight) },
        onLoaded: rebuild,
    })
    setTimeout(() => font.ensure(), 0)
    // Primed with the key already drawn above, so the first frame does not redraw it. Labels
    // only change with the two typography props, so a 100ms check is plenty.
    createRasterInvalidator(params, {
        initialKey: `${fp0.family}|${fp0.weight}`,
        minIntervalMs: 100,
        key: () => { const fp = readFont(); return `${fp.family}|${fp.weight}` },
        run: () => {
            rebuild()
            font.ensure()
        },
    })
    return glyphTex.kit
}


// ── Shared emit frame ───────────────────────────────────────────────────────────────────────────

/** The shared frame every detection part writes against: prefix, emitters, statement sink. */
export interface DetectionEmitFrame {
    p: string
    U: (name: string) => string
    L: (n: number) => string
    s: string[]
    /** The child RTT read (textureSampleLevel — samples sit in dynamic-value context). */
    sampleChild: (uvWgsl: string) => string
    /** Resolved kit unpremultiplyAlpha fn name. */
    UN: string
    /** Compile-time detection mode. */
    modeStr: string
}

/** Content-test bool for a bound sample var (compile-time on detectionMode). */
export function contentPredicate(f: DetectionEmitFrame, sVar: string, uVar: string): string {
    const {p, L, modeStr} = f
    if (modeStr === 'alpha') return `${sVar}.a > ${p}_thr`
    if (modeStr === 'bright') return `dot(${uVar}.rgb, ${LUM}) > ${p}_thr && ${sVar}.a > ${L(0.02)}`
    if (modeStr === 'dark') return `dot(${uVar}.rgb, ${LUM}) < ${p}_thr && ${sVar}.a > ${L(0.5)}`
    if (modeStr === 'red') return `${uVar}.r > ${p}_thr && ${uVar}.r >= ${uVar}.g && ${uVar}.r >= ${uVar}.b && ${sVar}.a > ${L(0.02)}`
    if (modeStr === 'green') return `${uVar}.g > ${p}_thr && ${uVar}.g >= ${uVar}.r && ${uVar}.g >= ${uVar}.b && ${sVar}.a > ${L(0.02)}`
    return `${uVar}.b > ${p}_thr && ${uVar}.b >= ${uVar}.r && ${uVar}.b >= ${uVar}.g && ${sVar}.a > ${L(0.02)}`
}

// ── Analysis core (ATOMIC) ──────────────────────────────────────────────────────────────────────
// Irreducibility: the scan/quadtree walk is a JS-unrolled shared-intermediate core — every level's
// N×N scan feeds the next level's origin/size via `select` folds so control flow stays uniform
// (fwidth-based AA must remain valid), and each tap is a textureSampleLevel the Expr graph cannot
// host inside emitted statements. No slot-graph regrouping reproduces this without changing the
// emitted WGSL, so it stays one core with the detection predicate as its only composed slot.

/** JS-unrolled N×N cell scan over runtime origin/size vars; accumulates coverage (+ bbox). */
export function cellScanStmts(f: DetectionEmitFrame, sfx: string, originX: string, originY: string, sizeV: string, N: number, wantBounds: boolean): void {
    const {p, L, s, sampleChild, UN, modeStr} = f
    s.push(`var ${sfx}_cnt = ${L(0)};`)
    if (wantBounds) {
        s.push(`var ${sfx}_minX = ${L(1e9)}; var ${sfx}_maxX = ${L(-1e9)}; var ${sfx}_minY = ${L(1e9)}; var ${sfx}_maxY = ${L(-1e9)};`)
    }
    const inv = 1 / N
    let k = 0
    for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
            const pxX = `${sfx}_px${k}x`
            const pxY = `${sfx}_px${k}y`
            s.push(`let ${pxX} = ${originX} + ${sizeV} * ${L((sx + 0.5) * inv)};`)
            s.push(`let ${pxY} = ${originY} + ${sizeV} * ${L((sy + 0.5) * inv)};`)
            s.push(`let ${sfx}_s${k} = ${sampleChild(`vec2f(${pxX}, ${pxY}) / ${p}_res`)};`)
            if (modeStr !== 'alpha') s.push(`let ${sfx}_u${k} = ${UN}(${sfx}_s${k});`)
            s.push(`let ${sfx}_c${k} = ${contentPredicate(f, `${sfx}_s${k}`, `${sfx}_u${k}`)};`)
            s.push(`${sfx}_cnt = ${sfx}_cnt + select(${L(0)}, ${L(1)}, ${sfx}_c${k});`)
            if (wantBounds) {
                s.push(`${sfx}_minX = select(${sfx}_minX, min(${sfx}_minX, ${pxX}), ${sfx}_c${k});`)
                s.push(`${sfx}_maxX = select(${sfx}_maxX, max(${sfx}_maxX, ${pxX}), ${sfx}_c${k});`)
                s.push(`${sfx}_minY = select(${sfx}_minY, min(${sfx}_minY, ${pxY}), ${sfx}_c${k});`)
                s.push(`${sfx}_maxY = select(${sfx}_maxY, max(${sfx}_maxY, ${pxY}), ${sfx}_c${k});`)
            }
            k++
        }
    }
    s.push(`let ${sfx}_coverage = ${sfx}_cnt / ${L(N * N)};`)
}

/** Walk to the leaf cell (JS-unrolled over compile-time D; grid/quadtree/mosaic split rule). */
export function partitionWalkStmts(f: DetectionEmitFrame, layoutStr: string, D: number): void {
    const {p, L, s} = f
    s.push(`var ${p}_origin = floor(${p}_fragPx / ${p}_cellPx) * ${p}_cellPx;`)
    s.push(`var ${p}_size = ${p}_cellPx;`)
    for (let lvl = 0; lvl < D; lvl++) {
        const sfx = `${p}_w${lvl}`
        if (layoutStr === 'mosaic') {
            s.push(`let ${sfx}_cellIx = ${p}_origin / ${p}_size;`)
            s.push(`let ${sfx}_doSplit = fract(sin(dot(${sfx}_cellIx, vec2f(${L(127.1)}, ${L(311.7)})) + ${L(lvl * 53.13)}) * ${L(43758.5453)}) > ${L(0.5)};`)
        } else {
            cellScanStmts(f, sfx, `${p}_origin.x`, `${p}_origin.y`, `${p}_size`, WALK_SCAN, false)
            s.push(`let ${sfx}_doSplit = ${sfx}_coverage > ${L(0.02)} && ${sfx}_coverage < ${L(0.98)};`)
        }
        s.push(`let ${sfx}_half = ${p}_size * ${L(0.5)};`)
        s.push(`let ${sfx}_qx = step(${p}_origin.x + ${sfx}_half, ${p}_fragPx.x);`)
        s.push(`let ${sfx}_qy = step(${p}_origin.y + ${sfx}_half, ${p}_fragPx.y);`)
        s.push(`let ${sfx}_childOrigin = vec2f(${p}_origin.x + ${sfx}_qx * ${sfx}_half, ${p}_origin.y + ${sfx}_qy * ${sfx}_half);`)
        s.push(`${p}_origin = select(${p}_origin, ${sfx}_childOrigin, ${sfx}_doSplit);`)
        s.push(`${p}_size = select(${p}_size, ${sfx}_half, ${sfx}_doSplit);`)
    }
}

/** Content-tight bbox, expanded by half the sample pitch then inset within the cell → `detected`. */
export function contentBBoxStmts(f: DetectionEmitFrame): void {
    const {p, L, s} = f
    cellScanStmts(f, `${p}_leaf`, `${p}_origin.x`, `${p}_origin.y`, `${p}_size`, LEAF_SCAN, true)
    s.push(`let ${p}_halfStep = ${p}_size / ${L(LEAF_SCAN)} * ${L(0.5)};`)
    s.push(`let ${p}_innerMinX = ${p}_origin.x + ${p}_boxInset;`)
    s.push(`let ${p}_innerMaxX = max(${p}_origin.x + ${p}_size - ${p}_boxInset, ${p}_innerMinX);`)
    s.push(`let ${p}_innerMinY = ${p}_origin.y + ${p}_boxInset;`)
    s.push(`let ${p}_innerMaxY = max(${p}_origin.y + ${p}_size - ${p}_boxInset, ${p}_innerMinY);`)
    s.push(`let ${p}_bMinX = clamp(${p}_leaf_minX - ${p}_halfStep, ${p}_innerMinX, ${p}_innerMaxX);`)
    s.push(`let ${p}_bMaxX = clamp(${p}_leaf_maxX + ${p}_halfStep, ${p}_innerMinX, ${p}_innerMaxX);`)
    s.push(`let ${p}_bMinY = clamp(${p}_leaf_minY - ${p}_halfStep, ${p}_innerMinY, ${p}_innerMaxY);`)
    s.push(`let ${p}_bMaxY = clamp(${p}_leaf_maxY + ${p}_halfStep, ${p}_innerMinY, ${p}_innerMaxY);`)
    s.push(`let ${p}_boxW = ${p}_bMaxX - ${p}_bMinX;`)
    s.push(`let ${p}_boxH = ${p}_bMaxY - ${p}_bMinY;`)
    s.push(`let ${p}_detected = ${p}_leaf_coverage > ${L(0.02)} && ${p}_boxW > ${p}_minSize && ${p}_boxH > ${p}_minSize;`)
    s.push(`let ${p}_detF = select(${L(0)}, ${L(1)}, ${p}_detected);`)
}

// ── Drawing parts ───────────────────────────────────────────────────────────────────────────────

/** Box fill + stroke (uniform width; box is fully inside its cell), corner-bracket style optional. */
export function detectionBoxStmts(f: DetectionEmitFrame, cornerStyle: boolean): void {
    const {p, U, L, s} = f
    s.push(`let ${p}_center = vec2f((${p}_bMinX + ${p}_bMaxX) * ${L(0.5)}, (${p}_bMinY + ${p}_bMaxY) * ${L(0.5)});`)
    s.push(`let ${p}_halfB = vec2f(${p}_boxW * ${L(0.5)}, ${p}_boxH * ${L(0.5)});`)
    const cRExpr = cornerStyle ? L(0) : `${p}_cornerRadiusPx`
    s.push(`let ${p}_cR = max(min(min(${cRExpr}, ${p}_halfB.x), ${p}_halfB.y), ${L(0)});`)
    s.push(`let ${p}_pp = ${p}_fragPx - ${p}_center;`)
    s.push(...roundRectSD({q: `${p}_q`, sd: `${p}_sd`}, {pp: `${p}_pp`, half: `${p}_halfB`, radius: `${p}_cR`}))
    s.push(`let ${p}_fillA = (${L(1)} - smoothstep(${L(0)}, ${p}_aa, ${p}_sd)) * ${U('fillColor')}.a * ${p}_detF;`)
    s.push(`var ${p}_strokeA = ${L(1)} - smoothstep(${L(0)}, ${p}_aa, abs(${p}_sd) - ${p}_lineHalf);`)
    if (cornerStyle) {
        s.push(...cornerBracketMask({bl: `${p}_bl`, inCorner: `${p}_inCorner`}, {
            blInit: `min(${p}_halfB.x, ${p}_halfB.y) * ${L(0.35)}`,
            px: `${p}_pp.x`, py: `${p}_pp.y`, hx: `${p}_halfB.x`, hy: `${p}_halfB.y`,
            stroke: `${p}_strokeA`,
        }))
    }
    s.push(`${p}_strokeA = ${p}_strokeA * ${U('strokeColor')}.a * ${p}_detF;`)
    s.push(overPremul(`${p}_dst`, `${U('fillColor')}.rgb`, `${p}_fillA`))
    s.push(overPremul(`${p}_dst`, `${U('strokeColor')}.rgb`, `${p}_strokeA`))
}

// Digit-drawing part: digit count / digit extraction as inline expressions on a value var.
export const digitsOf = (L: (n: number) => string, v: string): string =>
    `(${L(1)} + step(${L(10)}, ${v}) + step(${L(100)}, ${v}) + step(${L(1000)}, ${v}) + step(${L(10000)}, ${v}))`
export const digitAt = (L: (n: number) => string, v: string, e: string): string => {
    const x = `floor(${v} / pow(${L(10)}, ${e}))`
    return `(${x} - ${L(10)} * floor((${x}) / ${L(10)}))`
}

/** The label: a rounded pill anchored to a box corner + atlas digits ("W x H" or "NN %"). */
export function glyphPillLabelStmts(f: DetectionEmitFrame, opts: {labelStr: string; labelPos: number; atlasKey: string}): void {
    const {p, U, L, s} = f
    const {labelStr, labelPos, atlasKey} = opts
    s.push(`let ${p}_textH = max(${U('fontSize')} * ${p}_res.y, ${L(1)});`)
    s.push(`let ${p}_glyphW = ${p}_textH * ${L(ATLAS_CELL_W / ATLAS_CELL_H)};`)
    s.push(`let ${p}_advance = ${p}_glyphW + ${p}_textH * ${U('letterSpacing')};`)
    s.push(`let ${p}_padX = ${p}_textH * ${L(0.38)};`)
    s.push(`let ${p}_padY = ${p}_textH * ${L(0.24)};`)
    s.push(`let ${p}_gap = ${p}_textH * ${L(0.28)};`)
    if (labelStr === 'dimensions') {
        s.push(`let ${p}_w = clamp(floor(${p}_boxW + ${L(0.5)}), ${L(1)}, ${L(99999)});`)
        s.push(`let ${p}_h = clamp(floor(${p}_boxH + ${L(0.5)}), ${L(1)}, ${L(99999)});`)
        s.push(`let ${p}_dw = ${digitsOf(L, `${p}_w`)};`)
        s.push(`let ${p}_dh = ${digitsOf(L, `${p}_h`)};`)
        s.push(`let ${p}_total = ${p}_dw + ${L(1)} + ${p}_dh;`)
    } else {
        s.push(`let ${p}_pc = clamp(floor(${p}_leaf_coverage * ${L(100)} + ${L(0.5)}), ${L(0)}, ${L(100)});`)
        s.push(`let ${p}_dp = ${digitsOf(L, `${p}_pc`)};`)
        s.push(`let ${p}_total = ${p}_dp + ${L(1)};`)
    }
    s.push(`let ${p}_labelW = ${p}_total * ${p}_advance + ${p}_padX * ${L(2)};`)
    s.push(`let ${p}_labelH = ${p}_textH + ${p}_padY * ${L(2)};`)
    // Anchor to the chosen corner (compile-time labelPosition), inset/outset (runtime), then clamp to cell.
    const isRight = labelPos === 1 || labelPos === 3
    const isTop = labelPos === 2 || labelPos === 3
    s.push(`let ${p}_inset = ${U('labelInset')} > ${L(0.5)};`)
    const leftIn = isRight ? `${p}_bMaxX - ${p}_labelW - ${p}_gap` : `${p}_bMinX + ${p}_gap`
    const leftOut = isRight ? `${p}_bMaxX - ${p}_labelW` : `${p}_bMinX`
    s.push(`var ${p}_labelLeft = select(${leftOut}, ${leftIn}, ${p}_inset);`)
    const topIn = isTop ? `${p}_bMinY + ${p}_gap` : `${p}_bMaxY - ${p}_labelH - ${p}_gap`
    const topOut = isTop ? `${p}_bMinY - ${p}_labelH - ${p}_gap` : `${p}_bMaxY + ${p}_gap`
    s.push(`var ${p}_labelTop = select(${topOut}, ${topIn}, ${p}_inset);`)
    s.push(`let ${p}_cellMaxX = ${p}_origin.x + ${p}_size;`)
    s.push(`let ${p}_cellMaxY = ${p}_origin.y + ${p}_size;`)
    s.push(`${p}_labelLeft = clamp(${p}_labelLeft, ${p}_origin.x, max(${p}_cellMaxX - ${p}_labelW, ${p}_origin.x));`)
    s.push(`${p}_labelTop = clamp(${p}_labelTop, ${p}_origin.y, max(${p}_cellMaxY - ${p}_labelH, ${p}_origin.y));`)
    // Pill background.
    s.push(`let ${p}_labelCenter = vec2f(${p}_labelLeft + ${p}_labelW * ${L(0.5)}, ${p}_labelTop + ${p}_labelH * ${L(0.5)});`)
    s.push(`let ${p}_pillHalf = vec2f(${p}_labelW * ${L(0.5)}, ${p}_labelH * ${L(0.5)});`)
    s.push(`let ${p}_pillR = max(min(min(${U('labelRadius')} * ${p}_scaleFactor, ${p}_pillHalf.x), ${p}_pillHalf.y), ${L(0)});`)
    s.push(`let ${p}_pillP = ${p}_fragPx - ${p}_labelCenter;`)
    s.push(...roundRectSD({q: `${p}_pillQ`, sd: `${p}_pillSD`}, {pp: `${p}_pillP`, half: `${p}_pillHalf`, radius: `${p}_pillR`}))
    s.push(`let ${p}_pillA = (${L(1)} - smoothstep(${L(0)}, ${p}_aa, ${p}_pillSD)) * ${U('labelBackgroundColor')}.a * ${p}_detF;`)
    s.push(overPremul(`${p}_dst`, `${U('labelBackgroundColor')}.rgb`, `${p}_pillA`))
    // Glyph for this pixel's slot.
    s.push(`let ${p}_rel = ${p}_fragPx.x - ${p}_labelLeft - ${p}_padX;`)
    s.push(`let ${p}_slot = floor(${p}_rel / ${p}_advance);`)
    s.push(`let ${p}_within = fract(${p}_rel / ${p}_advance);`)
    s.push(`let ${p}_uInChar = ${p}_within * (${p}_advance / ${p}_glyphW);`)
    s.push(`let ${p}_vInChar = (${p}_fragPx.y - ${p}_labelTop - ${p}_padY) / ${p}_textH;`)
    if (labelStr === 'dimensions') {
        s.push(`let ${p}_wDigit = ${digitAt(L, `${p}_w`, `${p}_dw - ${L(1)} - ${p}_slot`)};`)
        s.push(`let ${p}_hDigit = ${digitAt(L, `${p}_h`, `${p}_dh + ${p}_dw - ${p}_slot`)};`)
        s.push(`var ${p}_g = ${p}_hDigit;`)
        s.push(`${p}_g = select(${p}_g, ${L(10)}, ${p}_slot == ${p}_dw);`)   // "x"
        s.push(`${p}_g = select(${p}_g, ${p}_wDigit, ${p}_slot < ${p}_dw);`)
    } else {
        s.push(`var ${p}_g = select(${L(11)}, ${digitAt(L, `${p}_pc`, `${p}_dp - ${L(1)} - ${p}_slot`)}, ${p}_slot < ${p}_dp);`)   // "%"
    }
    s.push(`let ${p}_atlasU = (${p}_g + clamp(${p}_uInChar, ${L(0)}, ${L(1)})) / ${L(ATLAS_SLOTS)};`)
    s.push(`let ${p}_glyphCov = textureSampleLevel(tex.$.${atlasKey}, samp.$.linearClamp, vec2f(${p}_atlasU, ${p}_vInChar), 0.0).a;`)
    s.push(`let ${p}_inText = ${p}_rel >= ${L(0)} && ${p}_slot >= ${L(0)} && ${p}_slot < ${p}_total && ${p}_uInChar <= ${L(1)} && ${p}_vInChar >= ${L(0)} && ${p}_vInChar <= ${L(1)};`)
    s.push(`let ${p}_textA = ${p}_glyphCov * select(${L(0)}, ${L(1)}, ${p}_inText) * ${U('labelColor')}.a * ${p}_detF;`)
    s.push(overPremul(`${p}_dst`, `${U('labelColor')}.rgb`, `${p}_textA`))
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Tracker-HUD drawing parts — the trail-ring frame (a runtime ring walk with a rolling
// previous entry), the keyframe diamond and motion-path segment stamps spliced into it, and
// the corner-bracket tracker gizmo. Statement-level parts that run INSIDE a runtime tracker
// loop, so the ring/gizmo locals carry no prefix (loop-scoped; must dodge WGSL reserved
// words — `meta`, `half`, …); only the fragment-scoped frame locals are `${p}_`-prefixed.
//
// Frame contract (HudEmitFrame consumers): `${p}_res` (logical viewport), `${p}_px` (pixel
// coords), `${p}_aa`, `${p}_lw` (stroke), `${p}_ms` (gizmo size), `${p}_dst` (premultiplied
// accumulator); loop locals `head`, `mta`, `tp`, `searching`; ring locals `e`, `ePrev`,
// `valid`, `fade`, `ep`, `dp` (owned by ringTrailStmts).
// ═══════════════════════════════════════════════════════════════════════════════════════

/** The shared frame the HUD draw parts write against. */
export interface HudEmitFrame {
    p: string
    U: (name: string) => string
    L: (n: number) => string
    s: string[]
}

/** One draw stage spliced into the trail ring / tracker loop. */
export type HudStage = (f: HudEmitFrame) => void

/** The keyframe diamond dropped at a ring entry (reads the ring frame's `dp`/`fade`). */
export const diamondStamp: HudStage = (f) => {
    const {p, U, L, s} = f
    s.push(`let dsz = ${p}_ms * ${L(0.16)};`)
    s.push(`let dSd = (abs(dp.x) + abs(dp.y)) * ${L(0.7071)} - dsz;`)
    s.push(overPremul(`${p}_dst`, `${U('keyframeColor')}.rgb`, `(${L(1)} - smoothstep(${L(0)}, ${p}_aa, dSd)) * ${U('keyframeColor')}.a * fade * ${U('trail')}`))
}

/** The motion-path segment from the previous ring entry (the seam's stamp gap drops its segment). */
export function pathSegmentStamp(every: number): HudStage {
    return (f) => {
    const {p, U, L, s} = f
    s.push(`let validP = select(${L(0)}, ${L(1)}, abs(ePrev.w - mta.z) < ${L(0.5)}) * select(${L(0)}, ${L(1)}, ePrev.z > ${L(0.5)});`)
    s.push(`let stampGap = abs(e.z - ePrev.z);`)
    s.push(`let contiguous = select(${L(0)}, ${L(1)}, stampGap < ${L(every * 1.5)});`)
    s.push(`let epp = vec2f(ePrev.x * ${p}_res.x, ePrev.y * ${p}_res.y);`)
    s.push(`let pa = ${p}_px - epp; let ba = ep - epp;`)
    s.push(`let h = clamp(dot(pa, ba) / max(dot(ba, ba), ${L(0.0001)}), ${L(0)}, ${L(1)});`)
    s.push(`let segD = length(pa - ba * h);`)
    s.push(overPremul(`${p}_dst`, `${U('pathColor')}.rgb`, `(${L(1)} - smoothstep(${p}_lw * ${L(0.4)}, ${p}_lw * ${L(0.4)} + ${p}_aa, segD)) * ${U('pathColor')}.a * fade * validP * contiguous * ${U('trail')} * ${L(0.8)}`))
    }
}

/**
 * The trail-ring frame: a runtime ring walk with a rolling previous entry (ring-adjacent pairs
 * are chronological neighbors), owning the per-entry `valid`/`fade`/`ep`/`dp` locals the spliced
 * stages read.
 */
export function ringTrailStmts(f: HudEmitFrame, slots: {len: number; every: number; load: (col: string) => string; stages: HudStage[]}): void {
    const {p, U, L, s} = f
    const maxAge = slots.len * slots.every
    s.push(`if (${U('trail')} > ${L(0.001)}) {`)
    s.push(`var ePrev = ${slots.load(`${2 + slots.len - 1}u`)};`)
    s.push(`for (var j = 0u; j < ${slots.len}u; j = j + 1u) {`)
    s.push(`let e = ${slots.load('2u + j')};`)
    s.push(`let valid = select(${L(0)}, ${L(1)}, abs(e.w - mta.z) < ${L(0.5)}) * select(${L(0)}, ${L(1)}, e.z > ${L(0.5)});`)
    s.push(`let age = head.z - e.z;`)
    s.push(`let fade = clamp(${L(1)} - age / ${L(maxAge)}, ${L(0)}, ${L(1)}) * valid;`)
    s.push(`let ep = vec2f(e.x * ${p}_res.x, e.y * ${p}_res.y);`)
    s.push(`let dp = ${p}_px - ep;`)
    for (const stage of slots.stages) stage(f)
    s.push(`ePrev = e;`)
    s.push(`}`) // for j
    s.push(`}`) // trail gate
}

/** The tracker gizmo: corner brackets + crosshair + center dot around the head position. */
export const bracketGizmo: HudStage = (f) => {
    const {p, U, L, s} = f
    s.push(`let gp = ${p}_px - tp;`)
    s.push(`let hlf = ${p}_ms * ${L(0.5)};`)
    s.push(...roundRectSD({q: `q`, sd: `boxSd`}, {pp: `gp`, half: `vec2f(hlf)`}))
    s.push(`var strokeA = ${L(1)} - smoothstep(${L(0)}, ${p}_aa, abs(boxSd) - ${p}_lw * ${L(0.5)});`)
    s.push(...cornerBracketMask({bl: `bl`, inCorner: `inCorner`}, {
        blInit: `hlf * ${L(0.45)}`,
        px: `gp.x`, py: `gp.y`, hx: `hlf`, hy: `hlf`,
        stroke: `strokeA`,
    }))
    s.push(overPremul(`${p}_dst`, `${U('markerColor')}.rgb`, `strokeA * ${U('markerColor')}.a * searching`))
    // Crosshair ticks (up/down/left/right, from box edge inward).
    s.push(`let tick = hlf * ${L(0.55)};`)
    s.push(`let chH = ${L(1)} - smoothstep(${L(0)}, ${p}_aa, max(abs(gp.y) - ${p}_lw * ${L(0.5)}, abs(gp.x) - tick));`)
    s.push(`let chV = ${L(1)} - smoothstep(${L(0)}, ${p}_aa, max(abs(gp.x) - ${p}_lw * ${L(0.5)}, abs(gp.y) - tick));`)
    s.push(overPremul(`${p}_dst`, `${U('markerColor')}.rgb`, `max(chH, chV) * ${L(0.55)} * ${U('markerColor')}.a * searching`))
    // Center dot.
    s.push(overPremul(`${p}_dst`, `vec3f(1.0, 1.0, 1.0)`, `(${L(1)} - smoothstep(${p}_lw, ${p}_lw + ${p}_aa, length(gp))) * searching`))
}


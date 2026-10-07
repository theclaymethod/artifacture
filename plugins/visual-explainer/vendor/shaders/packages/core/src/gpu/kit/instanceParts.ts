/**
 * Instance-layout part bodies — the statement-level machinery behind std/effects/instances
 * (`repeatInstances`): placement families (grid / radial / line), the per-instance
 * variation and hue-shift stages, and the premultiplied over-accumulation loop.
 *
 * Parts are string emitters (not `tgpu.fn`s) because the per-instance work — including a
 * texture sample — lives inside a runtime-count loop behind a non-uniform cull, which an
 * expression graph cannot express. Consumers hand each part the RESOLVED source strings
 * (uniform accessors, literals), so relocation of a composition is byte-identical.
 */
import {formatFloat} from '../contract'

const PI = Math.PI

/** The shared emit frame every instance part writes against: local prefix + literal emitter. */
export interface InstanceEmitFrame {
    /** Unique local-name prefix for this composition. */
    p: string
    /** f32 literal formatter. */
    L: (n: number) => string
}

/** Resolved WGSL source strings for a part's slots (uniform accessors or literals). */
export type Slot = string

/** Screen-space rect sources (centre/half-extent WGSL expressions). */
export interface RectSlots {
    cx: string
    cy: string
    hw: string
    hh: string
}

/** The source rect: the sampled rect (child bounds or full canvas) inset by four crop props. */
export function sourceRect(f: InstanceEmitFrame, src: RectSlots, crop: {left: Slot; right: Slot; top: Slot; bottom: Slot}): string[] {
    const {p, L} = f
    return [
        `let ${p}_cropL = ${crop.left};`,
        `let ${p}_cropR = ${crop.right};`,
        `let ${p}_cropT = ${crop.top};`,
        `let ${p}_cropB = ${crop.bottom};`,
        `let ${p}_srcCx = (${src.cx}) + (${p}_cropL - ${p}_cropR) * (${src.hw});`,
        `let ${p}_srcCy = (${src.cy}) + (${p}_cropT - ${p}_cropB) * (${src.hh});`,
        `let ${p}_srcHw = max((${src.hw}) * (1.0 - ${p}_cropL - ${p}_cropR), ${L(1e-6)});`,
        `let ${p}_srcHh = max((${src.hh}) * (1.0 - ${p}_cropT - ${p}_cropB), ${L(1e-6)});`,
        `let ${p}_srcHwSq = ${p}_srcHw * ${p}_aspect;`,
        `let ${p}_srcHhSq = ${p}_srcHh;`,
    ]
}

/** The placement field: the aspect-squared rect the layout distributes instances across. */
export function placementField(f: InstanceEmitFrame, own: RectSlots): string[] {
    const {p, L} = f
    return [
        `let ${p}_fieldCenterSq = vec2f((${own.cx}) * ${p}_aspect, ${own.cy});`,
        `let ${p}_fieldHwSq = max((${own.hw}) * ${p}_aspect, ${L(1e-6)});`,
        `let ${p}_fieldHh = max(${own.hh}, ${L(1e-6)});`,
    ]
}

/** One member of the placement family: the requested count + the per-instance placement body. */
export interface PlacementPart {
    requested: () => string
    body: (f: InstanceEmitFrame) => string[]
}

/** Grid placement: cols×rows cells (gaps between), odd-row stagger, phase scrolls one cell period. */
export function gridPlacement(slots: {columns: Slot; rows: Slot; gapX: Slot; gapY: Slot; stagger: Slot}, flipMode: number): PlacementPart {
    return {
        requested: () => `(${slots.columns} * ${slots.rows})`,
        body: (f) => {
            const {p, L} = f
            const out = [
                `let ${p}_cols = ${slots.columns};`,
                `let ${p}_rows = ${slots.rows};`,
                `let ${p}_col = ${p}_j - ${p}_cols * floor(${p}_j / ${p}_cols);`,
                `let ${p}_row = floor(${p}_j / ${p}_cols);`,
                `let ${p}_gapXSq = ${slots.gapX} * ${p}_aspect;`,
                `let ${p}_gapY = ${slots.gapY};`,
                `let ${p}_fieldW = ${p}_fieldHwSq * 2.0;`,
                `let ${p}_fieldH = ${p}_fieldHh * 2.0;`,
                `let ${p}_pitchX = (${p}_fieldW - ${p}_gapXSq * (${p}_cols - 1.0)) / ${p}_cols;`,
                `let ${p}_pitchY = (${p}_fieldH - ${p}_gapY * (${p}_rows - 1.0)) / ${p}_rows;`,
                `let ${p}_periodX = ${p}_pitchX + ${p}_gapXSq;`,
                `let ${p}_periodY = ${p}_pitchY + ${p}_gapY;`,
                `${p}_cellFitInv = max(${p}_srcHwSq * 2.0 / max(${p}_pitchX, ${L(1e-5)}), ${p}_srcHhSq * 2.0 / max(${p}_pitchY, ${L(1e-5)}));`,
                // floored mod: a - m*floor(a/m)
                `let ${p}_rowMod2 = ${p}_row - 2.0 * floor(${p}_row / 2.0);`,
                `let ${p}_staggerOff = ${p}_rowMod2 * ${slots.stagger} * ${p}_periodX;`,
                `let ${p}_cxArg = ${p}_col * ${p}_periodX + ${p}_staggerOff + ${p}_phase * ${p}_periodX;`,
                `let ${p}_cxMod = ${p}_periodX * ${p}_cols;`,
                `let ${p}_cellX = ${p}_cxArg - ${p}_cxMod * floor(${p}_cxArg / ${p}_cxMod);`,
                `let ${p}_cyArg = ${p}_row * ${p}_periodY + ${p}_phase * ${p}_periodY;`,
                `let ${p}_cyMod = ${p}_periodY * ${p}_rows;`,
                `let ${p}_cellY = ${p}_cyArg - ${p}_cyMod * floor(${p}_cyArg / ${p}_cyMod);`,
                `${p}_pos = vec2f(${p}_fieldCenterSq.x - ${p}_fieldW * 0.5 + ${p}_pitchX * 0.5 + ${p}_cellX, ${p}_fieldCenterSq.y - ${p}_fieldH * 0.5 + ${p}_pitchY * 0.5 + ${p}_cellY);`,
            ]
            if (flipMode === 1 || flipMode === 3) {
                out.push(`${p}_flipX = 1.0 - (${p}_col - 2.0 * floor(${p}_col / 2.0)) * 2.0;`)
            }
            if (flipMode === 2 || flipMode === 3) {
                out.push(`${p}_flipY = 1.0 - (${p}_row - 2.0 * floor(${p}_row / 2.0)) * 2.0;`)
            }
            return out
        },
    }
}

/** Radial placement: instances on an orbit around `anchorSq`, optional face-center rotation. */
export function radialPlacement(anchorSq: string, slots: {count: Slot; sweep: Slot; startAngle: Slot; radius: Slot; faceCenter: Slot}): PlacementPart {
    return {
        requested: () => slots.count,
        body: (f) => {
            const {p, L} = f
            return [
                `let ${p}_cSq = ${anchorSq};`,
                `let ${p}_sweep = ${slots.sweep} * ${L(PI / 180)};`,
                `let ${p}_start = ${slots.startAngle} * ${L(PI / 180)};`,
                `let ${p}_ang = ${p}_start + ${p}_sweep * (${p}_j / ${p}_totalN) + ${p}_phase * ${p}_sweep;`,
                `${p}_pos = ${p}_cSq + vec2f(cos(${p}_ang), sin(${p}_ang)) * ${slots.radius};`,
                `${p}_layoutRot = select(0.0, ${p}_ang + ${L(PI / 2)}, ${slots.faceCenter} > 0.0);`,
            ]
        },
    }
}

/** Line placement: instances along a direction ray from `anchorSq`. */
export function linePlacement(anchorSq: string, slots: {count: Slot; direction: Slot; spacing: Slot}): PlacementPart {
    return {
        requested: () => slots.count,
        body: (f) => {
            const {p, L} = f
            return [
                `let ${p}_cSq = ${anchorSq};`,
                `let ${p}_dirRad = ${slots.direction} * ${L(PI / 180)};`,
                `let ${p}_dir = vec2f(cos(${p}_dirRad), sin(${p}_dirRad));`,
                `let ${p}_tArg = ${p}_j + ${p}_phase;`,
                `let ${p}_t = ${p}_tArg - ${p}_totalN * floor(${p}_tArg / ${p}_totalN);`,
                `${p}_pos = ${p}_cSq + ${p}_dir * ${slots.spacing} * ${p}_t;`,
            ]
        },
    }
}

/** Per-instance variation: compounding scale/rotation/opacity progressions + seeded jitter. */
export function instanceVariation(f: InstanceEmitFrame, slots: {scale: Slot; rotation: Slot; opacity: Slot; jitterPosition: Slot; jitterRotation: Slot; jitterScale: Slot; jitterOpacity: Slot}): string[] {
    const {p, L} = f
    // hash11 = fract(sin(p·k)·m).
    const hash = (off: number) => `fract(sin((${p}_hashBase + ${L(off)}) * 78.233) * 43758.5453)`
    return [
        `let ${p}_hashBase = ${p}_j + ${p}_seed * 7.0;`,
        `let ${p}_h1 = ${hash(0.123)};`,
        `let ${p}_h2 = ${hash(5.456)};`,
        `let ${p}_h3 = ${hash(9.789)};`,
        `let ${p}_h4 = ${hash(13.21)};`,
        `let ${p}_h5 = ${hash(17.65)};`,
        `let ${p}_scale = max(pow(${slots.scale}, ${p}_j) * (1.0 + ${slots.jitterScale} * (${p}_h3 - 0.5)), ${L(1e-4)});`,
        // instanceRotation carries the `*PI/180` transform (applied by the bridge) → radians.
        `let ${p}_rot = ${p}_layoutRot + ${slots.rotation} * ${p}_j + ${slots.jitterRotation} * (${p}_h4 - 0.5) * ${L(PI * 2)};`,
        `let ${p}_instOpacity = pow(${slots.opacity}, ${p}_j) * (1.0 - ${slots.jitterOpacity} * ${p}_h5);`,
        `${p}_pos = ${p}_pos + vec2f((${p}_h1 - 0.5) * ${p}_fieldHwSq, (${p}_h2 - 0.5) * ${p}_fieldHh) * ${slots.jitterPosition};`,
    ]
}

/** Per-instance hue rotation (Rodrigues around (1,1,1)) applied to the sampled texel. */
export function instanceHueShift(f: InstanceEmitFrame, hueShift: Slot): string[] {
    const {p, L} = f
    return [
        // hueShift carries the `*PI/180` transform (applied by the bridge) → radians.
        `let ${p}_hueAngle = ${hueShift} * ${p}_j;`,
        `let ${p}_cosH = cos(${p}_hueAngle);`,
        `let ${p}_sinH = sin(${p}_hueAngle);`,
        `let ${p}_kOMC = (1.0 - ${p}_cosH) * ${L(1 / 3)};`,
        `let ${p}_sOS3 = ${p}_sinH / 1.7320508075688772;`,
        `let ${p}_mA = ${p}_cosH + ${p}_kOMC;`,
        `let ${p}_mB = ${p}_kOMC - ${p}_sOS3;`,
        `let ${p}_mC = ${p}_kOMC + ${p}_sOS3;`,
        `${p}_rgb = vec3f(${p}_src.r * ${p}_mA + ${p}_src.g * ${p}_mB + ${p}_src.b * ${p}_mC, ${p}_src.r * ${p}_mC + ${p}_src.g * ${p}_mA + ${p}_src.b * ${p}_mB, ${p}_src.r * ${p}_mB + ${p}_src.g * ${p}_mC + ${p}_src.b * ${p}_mA);`,
    ]
}

/**
 * The premultiplied over-accumulation loop. ATOMIC by construction: a runtime-count
 * instance loop whose per-iteration RTT sample sits behind an early-out cull, which no
 * expression-graph fold can express — texture samples cannot live inside emitted control
 * flow. The placement / variation / hue stages are spliced in as statement slots.
 */
export function accumulateInstances(f: InstanceEmitFrame, slots: {
    placement: PlacementPart
    variation: string[]
    hue: string[]
    zBack: boolean
    texKey: string
}): string[] {
    const {p} = f
    const out: string[] = []

    // Instance count — capped at 64 regardless of what presets/MCP pass in.
    out.push(`let ${p}_totalN = min(max(${slots.placement.requested()}, 1.0), 64.0);`)

    out.push(`var ${p}_accum = vec4f(0.0, 0.0, 0.0, 0.0);`)
    out.push(`var ${p}_cellFitInv = 1.0;`)

    // ── Instance loop ──
    const body: string[] = []
    body.push(`let ${p}_fi = f32(${p}_i);`)
    // Stacking order: zOrder=backward reverses the index (last on top ↔ first on top).
    // Compile-time baked — only the active branch is emitted.
    body.push(slots.zBack ? `let ${p}_j = ${p}_totalN - 1.0 - ${p}_fi;` : `let ${p}_j = ${p}_fi;`)
    body.push(`var ${p}_pos = vec2f(0.0, 0.0);`)
    body.push(`var ${p}_layoutRot = 0.0;`)
    body.push(`var ${p}_flipX = 1.0;`)
    body.push(`var ${p}_flipY = 1.0;`)

    body.push(...slots.placement.body(f))
    body.push(...slots.variation)

    // Inverse-transform the pixel into instance-local space, cull, then sample.
    body.push(`let ${p}_negRot = -${p}_rot;`)
    body.push(`let ${p}_cosA = cos(${p}_negRot);`)
    body.push(`let ${p}_sinA = sin(${p}_negRot);`)
    body.push(`let ${p}_d0 = ${p}_pix - ${p}_pos;`)
    body.push(`let ${p}_dr = vec2f(${p}_d0.x * ${p}_cosA - ${p}_d0.y * ${p}_sinA, ${p}_d0.x * ${p}_sinA + ${p}_d0.y * ${p}_cosA);`)
    body.push(`let ${p}_dl = ${p}_dr / ${p}_scale;`)
    body.push(`let ${p}_localU = ${p}_dl.x * ${p}_flipX * ${p}_cellFitInv / (${p}_srcHwSq * 2.0) + 0.5;`)
    body.push(`let ${p}_localV = ${p}_dl.y * ${p}_flipY * ${p}_cellFitInv / (${p}_srcHhSq * 2.0) + 0.5;`)

    const sample: string[] = []
    sample.push(`let ${p}_sampleUV = vec2f(${p}_srcCx - ${p}_srcHw + ${p}_localU * ${p}_srcHw * 2.0, ${p}_srcCy - ${p}_srcHh + ${p}_localV * ${p}_srcHh * 2.0);`)
    // textureSampleLevel (explicit LOD 0), NOT textureSample: this sample sits inside the
    // non-uniform `if (inside)` block, and textureSample's implicit derivatives are illegal
    // in non-uniform control flow. RTT textures are single-level, so LOD 0 is exact.
    sample.push(`let ${p}_src = textureSampleLevel(tex.$.${slots.texKey}, samp.$.linearClamp, ${p}_sampleUV, 0.0);`)
    sample.push(`var ${p}_rgb = ${p}_src.rgb;`)
    sample.push(...slots.hue)
    // Premultiplied Porter-Duff over: this instance composites on top of accum.
    sample.push(`let ${p}_a = ${p}_src.a * ${p}_instOpacity;`)
    sample.push(`let ${p}_premul = ${p}_rgb * ${p}_a;`)
    sample.push(`${p}_accum = vec4f(${p}_premul + ${p}_accum.rgb * (1.0 - ${p}_a), ${p}_a + ${p}_accum.a * (1.0 - ${p}_a));`)

    body.push(`if (${p}_localU >= 0.0 && ${p}_localU <= 1.0 && ${p}_localV >= 0.0 && ${p}_localV <= 1.0) {`)
    for (const s of sample) body.push(`  ${s}`)
    body.push(`}`)

    out.push(`for (var ${p}_i = 0u; ${p}_i < u32(${p}_totalN); ${p}_i++) {`)
    for (const b of body) out.push(`  ${b}`)
    out.push(`}`)
    return out
}

export {formatFloat}

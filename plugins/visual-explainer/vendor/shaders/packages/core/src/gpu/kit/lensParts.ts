/**
 * Spectral-lens statement parts — the raw-WGSL stage emitters behind std/effects/lens's
 * `spectralLens` recipe: lens geometry (barrel/pincushion bulge + circular crop squeeze),
 * the spread axis (direction, focus masks, noise turn, grain scatter), the spectral fan
 * (a RUNTIME-count gather loop with per-iteration texture sampling — inexpressible as an
 * Expr fold), and the black/white grain overlay. Plus an inline hash21 value-noise emitter
 * (statements can't declare WGSL functions) shared by three of the stages.
 *
 * Parts are string emitters over a shared `LensEmitFrame` (fresh local prefix + one ordered
 * statement stream): each stage appends to the same `stmts`, so a consumer composes them in
 * order and emits once. `U` resolves a role name to a uniform accessor string — the consumer
 * owns the prop binding.
 */
import {isMobileGpuViewport} from '../../utilities/device'

export const LENS_MAX_SAMPLES = 50
// Mobile GPUs get a lower tap ceiling (the sdf3d build-time tiering pattern): count stays a
// runtime uniform, but its WGSL clamp compiles to 24 on a phone/tablet viewport. Presets tuned
// above that lose smoothness (more visible layer banding) on mobile — a deliberate trade.
const LENS_MAX_SAMPLES_MOBILE = 24
// Read ONCE at module load (the TimeTrail/Surface3D convention), not per-composition: the tier is
// deliberately outside the structural hash (the renderer never recompiles on resize — see
// isMobileGpuViewport's contract), so a per-composition read could emit different WGSL for the
// same hash. Frozen per page load, the emitted clamp is deterministic.
export const LENS_MAX_TAPS = isMobileGpuViewport() ? LENS_MAX_SAMPLES_MOBILE : LENS_MAX_SAMPLES

// ═══════════════════════════════════════════════════════════════════════════════════════
// The recipe's stages, as named raw-WGSL emit parts. Raw statements (not Expr factories)
// because the spectral fan is a RUNTIME-count loop with per-iteration texture sampling; the
// stages share one statement stream, so each part appends to the same `stmts` in order:
//   lensGeometry → spreadAxis → spectralFan → grainOverlay.
// ═══════════════════════════════════════════════════════════════════════════════════════

/** The shared emit context one composition's stages append into. */
export interface LensEmitFrame {
    /** The fresh local prefix for every WGSL identifier this fragment declares. */
    p: string
    /** The statement stream, emitted at the end in order. */
    stmts: string[]
    /** Emit a uniform read. */
    U: (name: string) => string
    /** Format a number literal. */
    L: (n: number) => string
    /** Per-composition counter so each value-noise instance gets unique locals. */
    noiseIdx: {value: number}
}

/**
 * hash21-based 2D value noise (Paper's proceduralHash21 + valueNoise), emitted inline as
 * statements into `lines` (statements can't declare WGSL functions). Used by the spread-axis
 * noise turn, the grain mixer and the grain overlay.
 */
export function valueNoiseStmts(em: LensEmitFrame, lines: string[], inputExpr: string, outName: string): void {
    const n = `${em.p}_vn${em.noiseIdx.value++}`
    lines.push(`let ${n}_st = ${inputExpr};`)
    lines.push(`let ${n}_fi = floor(${n}_st);`)
    lines.push(`let ${n}_ff = fract(${n}_st);`)
    const corners: Array<[string, string]> = [
        ['a', 'vec2f(0.0, 0.0)'], ['b', 'vec2f(1.0, 0.0)'],
        ['c', 'vec2f(0.0, 1.0)'], ['d', 'vec2f(1.0, 1.0)'],
    ]
    for (const [k, off] of corners) {
        lines.push(`var ${n}_q${k} = fract((${n}_fi + ${off}) * vec2f(0.3183099, 0.3678794)) + vec2f(0.1);`)
        lines.push(`${n}_q${k} = ${n}_q${k} + vec2f(dot(${n}_q${k}, ${n}_q${k} + vec2f(19.19)));`)
        lines.push(`let ${n}_h${k} = fract(${n}_q${k}.x * ${n}_q${k}.y);`)
    }
    lines.push(`let ${n}_u = ${n}_ff * ${n}_ff * (vec2f(3.0) - 2.0 * ${n}_ff);`)
    lines.push(`let ${outName} = mix(mix(${n}_ha, ${n}_hb, ${n}_u.x), mix(${n}_hc, ${n}_hd, ${n}_u.x), ${n}_u.y);`)
}

/**
 * Stage 1 — lensGeometry: the geometry base (lens centre, radius, spread reach) and the lens
 * warp — barrel/pincushion bulge + circular crop squeeze — ending at the warped `baseUV`, its
 * pre-loop derivatives (fwidth/dpdx are illegal in non-uniform control flow, so ALL derivative
 * work happens here, before the fan loop) and the grain UV.
 */
export function lensGeometryStmts(em: LensEmitFrame, uvExpr: string, aspectExpr: string): void {
    const {p, stmts, U} = em

    // ── Geometry base ─────────────────────────────────────────────────────────────────
    stmts.push(`let ${p}_uv = ${uvExpr};`)
    stmts.push(`let ${p}_aspect = ${aspectExpr};`)
    stmts.push(`let ${p}_invAspect = 1.0 / ${p}_aspect;`)
    stmts.push(`let ${p}_inradius = 0.5 * min(${p}_aspect, 1.0);`)
    stmts.push(`let ${p}_outradius = 0.5 * length(vec2f(${p}_aspect, 1.0));`)
    stmts.push(`let ${p}_spread = ${U('spread')};`)
    stmts.push(`let ${p}_reach = 0.7 * pow(${p}_spread, 1.3 + 2.7 * ${p}_spread);`)
    // `center` is the ALREADY-transformed prop value (transformPosition stores `(x, 1 - y)`),
    // so `1.0 - center.y` recovers the authored y (the Bulge convention).
    stmts.push(`let ${p}_centerU = ${U('center')};`)
    stmts.push(`let ${p}_c = vec2f(${p}_centerU.x, 1.0 - ${p}_centerU.y);`)
    stmts.push(`let ${p}_fromCenter = vec2f((${p}_uv.x - ${p}_c.x) * ${p}_aspect, ${p}_uv.y - ${p}_c.y);`)
    stmts.push(`let ${p}_radius = length(${p}_fromCenter);`)
    stmts.push(`let ${p}_lensBulge = ${U('lensBulge')};`)
    stmts.push(`let ${p}_lensCircle = ${U('lensCircle')};`)

    // ── lensWarp: barrel/pincushion bulge + circular crop squeeze ─────────────────────
    // rSafe guards the radius→0 division (the original early-returns there); the tan/atan
    // maps are finite at rn→0 with the clamp.
    stmts.push(`var ${p}_bulgeFade = 1.0;`)
    stmts.push(`var ${p}_warped = ${p}_fromCenter;`)
    stmts.push(`let ${p}_rSafe = max(${p}_radius, 1e-5);`)
    stmts.push(`if (${p}_lensBulge != 0.0) {`)
    stmts.push(`  let ${p}_rn = ${p}_rSafe / ${p}_inradius;`)
    stmts.push(`  let ${p}_bulgeAmt = abs(${p}_lensBulge) * select(1.2, 1.4, ${p}_lensBulge > 0.0);`)
    stmts.push(`  ${p}_bulgeFade = select(1.0, 1.0 - smoothstep(1.45, 1.53, ${p}_rn * ${p}_bulgeAmt), ${p}_lensBulge > 0.0);`)
    stmts.push(`  let ${p}_mapPos = tan(min(${p}_rn * ${p}_bulgeAmt, 1.53)) / tan(${p}_bulgeAmt);`)
    stmts.push(`  let ${p}_mapNeg = atan(${p}_rn * tan(${p}_bulgeAmt)) / ${p}_bulgeAmt;`)
    stmts.push(`  let ${p}_bulgeScale = select(${p}_mapNeg, ${p}_mapPos, ${p}_lensBulge > 0.0) / ${p}_rn;`)
    stmts.push(`  ${p}_warped = ${p}_warped * ${p}_bulgeScale;`)
    stmts.push(`}`)
    stmts.push(`if (${p}_lensCircle > 0.0) {`)
    stmts.push(`  let ${p}_wr = length(${p}_warped);`)
    stmts.push(`  let ${p}_dir = ${p}_warped / max(${p}_wr, 1e-5);`)
    stmts.push(`  let ${p}_halfBox = vec2f(${p}_aspect, 1.0) * 0.5;`)
    // Distance from the (possibly off-centre) lens origin to the canvas box edge along
    // `dir` — the original's `halfBox / |dir|` generalized by the origin offset.
    stmts.push(`  let ${p}_boxOff = vec2f((${p}_c.x - 0.5) * ${p}_aspect, ${p}_c.y - 0.5);`)
    stmts.push(`  let ${p}_rBox = min((${p}_halfBox.x - sign(${p}_dir.x) * ${p}_boxOff.x) / max(abs(${p}_dir.x), 1e-4), (${p}_halfBox.y - sign(${p}_dir.y) * ${p}_boxOff.y) / max(abs(${p}_dir.y), 1e-4));`)
    stmts.push(`  let ${p}_band = ${p}_inradius * mix(0.03, 0.2, 0.5 * (${p}_lensBulge + 1.0));`)
    stmts.push(`  let ${p}_over = smoothstep(0.0, 1.0, (${p}_wr - (${p}_inradius - ${p}_band)) / ${p}_band);`)
    stmts.push(`  let ${p}_g = ${p}_wr + (${p}_rBox - ${p}_inradius) * pow(${p}_over, 14.0);`)
    stmts.push(`  ${p}_warped = ${p}_dir * mix(${p}_wr, ${p}_g, ${p}_lensCircle);`)
    stmts.push(`}`)

    stmts.push(`let ${p}_baseUV = vec2f(${p}_warped.x * ${p}_invAspect, ${p}_warped.y) + ${p}_c;`)
    // Derivatives BEFORE the loop (fwidth/dpdx are illegal in non-uniform control flow).
    stmts.push(`let ${p}_baseDeriv = fwidth(${p}_baseUV);`)
    stmts.push(`let ${p}_edgeAA = clamp(2.0 * max(${p}_baseDeriv.x, ${p}_baseDeriv.y), 0.001, 0.02);`)
    stmts.push(`let ${p}_frameInvAA = 1.0 / clamp(${p}_baseDeriv, vec2f(1e-5), vec2f(0.02));`)
    stmts.push(`let ${p}_grainUV = (${p}_uv - vec2f(0.5)) * (0.8 / vec2f(length(dpdx(${p}_uv)), length(dpdy(${p}_uv)))) + vec2f(0.5);`)
}

/**
 * Stage 2 — spreadAxis: the spread direction (uniform angle → radial burst by `perspective`,
 * forced radial near the circle crop), the centre/edge focus masks and margin cut that shape
 * the strength, then the optional noise turn and grain scatter of the resulting axis.
 */
export function spreadAxisStmts(em: LensEmitFrame): void {
    const {p, stmts, U} = em

    // ── getSpread: direction, focus masks, strength → spread axis ─────────────────────
    stmts.push(`let ${p}_angleRad = radians(${U('angle')});`)
    stmts.push(`let ${p}_uniformDir = vec2f(cos(${p}_angleRad), sin(${p}_angleRad));`)
    stmts.push(`let ${p}_invInradius = 1.0 / ${p}_inradius;`)
    stmts.push(`let ${p}_maxLen = (${p}_outradius + ${p}_reach) * ${p}_invInradius;`)
    stmts.push(`let ${p}_radialLen = ${p}_radius * ${p}_invInradius;`)
    stmts.push(`let ${p}_radialDir = ${p}_fromCenter * ${p}_invInradius * min(1.0, ${p}_maxLen / max(${p}_radialLen, 1e-6));`)
    stmts.push(`let ${p}_bandProximity = smoothstep(${p}_inradius * 0.8, ${p}_inradius, ${p}_radius);`)
    stmts.push(`let ${p}_circleMaxing = ${p}_bandProximity * ${p}_lensCircle * ${p}_lensCircle * ${p}_lensCircle;`)
    stmts.push(`let ${p}_spreadDir = mix(mix(${p}_uniformDir, ${p}_radialDir, ${U('perspective')}), ${p}_radialDir, ${p}_circleMaxing);`)
    stmts.push(`let ${p}_warpedAbs = abs(${p}_baseUV - vec2f(0.5));`)
    stmts.push(`let ${p}_focusCenter = ${U('focusCenter')};`)
    stmts.push(`let ${p}_inner = mix(1.0, smoothstep(0.0, mix(${p}_inradius, ${p}_outradius, ${p}_focusCenter), ${p}_radius), ${p}_focusCenter);`)
    stmts.push(`let ${p}_boxDist = max(${p}_warpedAbs.x, ${p}_warpedAbs.y) * 2.0;`)
    stmts.push(`let ${p}_outer = mix(1.0, 1.0 - min(${p}_boxDist, 1.0), ${U('focusEdges')});`)
    stmts.push(`var ${p}_strength = ${p}_inner * ${p}_outer * mix(1.0, mix(0.15, 0.03, max(-${p}_lensBulge, 0.0)), ${p}_circleMaxing);`)
    stmts.push(`let ${p}_outside = max(${p}_warpedAbs - vec2f(0.5), vec2f(0.0));`)
    stmts.push(`let ${p}_margin = max(${p}_reach * length(${p}_spreadDir) * (1.0 - ${p}_lensCircle), ${p}_edgeAA);`)
    stmts.push(`${p}_strength = ${p}_strength * (1.0 - smoothstep(0.0, ${p}_margin, length(${p}_outside)));`)
    stmts.push(`var ${p}_axis = ${p}_spreadDir * (${p}_reach * ${p}_strength);`)
    stmts.push(`let ${p}_noise = ${U('noise')};`)
    stmts.push(`if (${p}_noise > 0.0) {`)
    {
        const lines: string[] = []
        valueNoiseStmts(em, lines, `${p}_fromCenter * (${U('noiseFrequency')} * 18.0) + vec2f(${U('noiseOffset')} * 30.0)`, `${p}_turnNoise`)
        for (const l of lines) stmts.push(`  ${l}`)
    }
    stmts.push(`  let ${p}_turn = (${p}_turnNoise - 0.5) * 2.0 * ${p}_noise;`)
    stmts.push(`  let ${p}_tc = cos(${p}_turn);`)
    stmts.push(`  let ${p}_ts = sin(${p}_turn);`)
    stmts.push(`  ${p}_axis = vec2f(${p}_tc * ${p}_axis.x + ${p}_ts * ${p}_axis.y, -${p}_ts * ${p}_axis.x + ${p}_tc * ${p}_axis.y);`)
    stmts.push(`}`)
    stmts.push(`${p}_axis = vec2f(${p}_axis.x * ${p}_invAspect, ${p}_axis.y);`)

    // Grain scatter of the spread axis.
    stmts.push(`let ${p}_grainMixer = ${U('grainMixer')};`)
    stmts.push(`if (${p}_grainMixer > 0.0) {`)
    {
        const lines: string[] = []
        valueNoiseStmts(em, lines, `${p}_grainUV`, `${p}_grainSeed`)
        for (const l of lines) stmts.push(`  ${l}`)
    }
    stmts.push(`  let ${p}_jit = fract(${p}_grainSeed * vec2f(157.31, 113.57)) * 2.0 - vec2f(1.0);`)
    stmts.push(`  ${p}_axis = ${p}_axis + ${p}_jit * (0.3 * ${p}_grainMixer * length(${p}_axis));`)
    stmts.push(`}`)
}

/** The frame AA mask stage of one fan tap: anti-aliased UV frame (transparent outside the child
 *  bounds), using the pre-loop footprint (taps are near-constant offsets of baseUV, so the
 *  footprint is the same to first order). */
export function frameAAMaskStmts(em: LensEmitFrame, body: string[]): void {
    const {p} = em
    body.push(`let ${p}_lo = clamp(${p}_sampleUV * ${p}_frameInvAA + vec2f(0.5), vec2f(0.0), vec2f(1.0));`)
    body.push(`let ${p}_hi = clamp((vec2f(1.0) - ${p}_sampleUV) * ${p}_frameInvAA + vec2f(0.5), vec2f(0.0), vec2f(1.0));`)
    body.push(`let ${p}_frame = ${p}_lo.x * ${p}_hi.x * ${p}_lo.y * ${p}_hi.y;`)
}

/**
 * Stage 3 — spectralFan: the ATOMIC gather core. Irreducible as WGSL: a RUNTIME-count loop with
 * per-iteration texture sampling (the Expr factories can't express it), whose per-tap hue
 * weights, over-white colors and coverage all accumulate into shared sums — no sub-stage
 * separates without re-walking the taps. Samples the child RTT once per color layer along the
 * fan (bias-curved spacing, per-tap swirl around the centre, the frame AA mask above), then
 * recombines the weighted average over white into a reconstructed premultiplied color.
 *
 * The loop bound is ADAPTIVE per pixel — capped at one tap per screen pixel of fan travel
 * (× the bias-curve stretch), so the focus zones (where the fan is sub-pixel and the weighted
 * average cancels exactly to a single sample) cost 2 taps instead of `count`.
 */
export function spectralFanStmts(em: LensEmitFrame, texKey: string): void {
    const {p, stmts, U, L} = em
    const PI = Math.PI

    // ── Layer-loop constants ──────────────────────────────────────────────────────────
    stmts.push(`let ${p}_countF = clamp(floor(${U('count')}), 2.0, ${L(LENS_MAX_TAPS)});`)
    stmts.push(`let ${p}_hueBase = ${U('dispersionColor')} + 0.5;`)
    stmts.push(`let ${p}_bias = ${U('bias')};`)
    stmts.push(`let ${p}_biasPower = 1.0 + 2.0 * abs(${p}_bias);`)
    stmts.push(`let ${p}_biasNeg = ${p}_bias < 0.0;`)
    stmts.push(`let ${p}_dispShift = ${U('dispersionShift')};`)
    stmts.push(`let ${p}_icMask = 1.0 - smoothstep(0.5 * ${p}_inradius, 1.1 * ${p}_inradius, ${p}_radius);`)
    stmts.push(`let ${p}_dispAmt = ${U('dispersion')} * mix(clamp(1.0 + ${p}_dispShift, 0.0, 1.0), clamp(1.0 - ${p}_dispShift, 0.0, 1.0), ${p}_icMask);`)
    stmts.push(`let ${p}_dispPower = pow(${p}_dispAmt, 0.8);`)
    stmts.push(`let ${p}_warpedRadius = length(${p}_warped);`)
    stmts.push(`let ${p}_swirlAngle = ${U('swirl')} * ${L(0.4 * PI)} * ${p}_strength * ${p}_spread * min(1.0, ${p}_inradius / max(${p}_warpedRadius, 1e-4));`)
    // Adaptive per-pixel tap count. The fan spans 2·|axis| UV (+ the swirl arc) — one tap
    // per screen pixel of travel is visually converged (the motion-blur rule), stretched by
    // biasPower (the bias curve's max local spacing factor). In the focus zones the fan is
    // sub-pixel and this collapses to 2 taps, which is EXACT there: identical tap UVs make
    // the hue-weighted average cancel to the plain sample. Where bands are visible (long
    // fans) the user's full count is preserved, so the aesthetic layer look is untouched.
    stmts.push(`let ${p}_texel = max((${p}_baseDeriv.x + ${p}_baseDeriv.y) * 0.5, 1e-6);`)
    stmts.push(`let ${p}_fanPx = (2.0 * length(${p}_axis) + abs(${p}_swirlAngle) * ${p}_warpedRadius) / ${p}_texel;`)
    stmts.push(`let ${p}_tapsF = clamp(ceil(${p}_fanPx * ${p}_biasPower) + 1.0, 2.0, ${p}_countF);`)
    stmts.push(`let ${p}_invCount = 1.0 / ${p}_tapsF;`)
    stmts.push(`let ${p}_invSpan = 1.0 / max(${p}_tapsF - 1.0, 1.0);`)

    stmts.push(`var ${p}_colorSum = vec3f(0.0);`)
    stmts.push(`var ${p}_weightSum = vec3f(0.0);`)
    stmts.push(`var ${p}_coverSum = 0.0;`)

    // ── The layer loop: one RTT tap per color layer along the fan ─────────────────────
    const body: string[] = []
    body.push(`let ${p}_layer = f32(${p}_i);`)
    body.push(`let ${p}_hue = ${p}_hueBase + ${p}_layer * ${p}_invCount;`)
    // dispersionCurve: bias-mirrored pow (bias 0 → biasPower 1 → identity, no branch needed).
    body.push(`let ${p}_t0 = ${p}_layer * ${p}_invSpan;`)
    body.push(`let ${p}_curved = pow(select(${p}_t0, 1.0 - ${p}_t0, ${p}_biasNeg), ${p}_biasPower);`)
    body.push(`let ${p}_spreadT = select(${p}_curved, 1.0 - ${p}_curved, ${p}_biasNeg);`)
    body.push(`let ${p}_fanPos = 1.0 - 2.0 * ${p}_spreadT;`)
    body.push(`let ${p}_tap0 = ${p}_baseUV + ${p}_axis * ${p}_fanPos - ${p}_c;`)
    // Swirl: rotate the (aspect-corrected) tap around the lens centre; angle 0 → identity.
    body.push(`let ${p}_sa = ${p}_swirlAngle * ${p}_fanPos;`)
    body.push(`let ${p}_sc = cos(${p}_sa);`)
    body.push(`let ${p}_ss = sin(${p}_sa);`)
    body.push(`let ${p}_tx = ${p}_tap0.x * ${p}_aspect;`)
    body.push(`let ${p}_sampleUV = vec2f((${p}_sc * ${p}_tx - ${p}_ss * ${p}_tap0.y) * ${p}_invAspect, ${p}_ss * ${p}_tx + ${p}_sc * ${p}_tap0.y) + ${p}_c;`)
    frameAAMaskStmts(em, body)
    body.push(`let ${p}_tapC = textureSampleLevel(tex.$.${texKey}, samp.$.linearClamp, ${p}_sampleUV, 0.0);`)
    // sampleOverWhite on premultiplied RTT data: mix(vec3(1), straightRGB, cover) with
    // cover = a·frame folds to (1 - cover) + premultRGB·frame.
    body.push(`let ${p}_cover = ${p}_tapC.a * ${p}_frame;`)
    body.push(`let ${p}_overWhite = vec3f(1.0 - ${p}_cover) + ${p}_tapC.rgb * ${p}_frame;`)
    // hueColor: smoothed RGB rainbow from the hue wheel (floored mod keeps GLSL semantics).
    body.push(`let ${p}_hraw = ${p}_hue * 6.0 + vec3f(0.0, 4.0, 2.0);`)
    body.push(`let ${p}_hmod = ${p}_hraw - 6.0 * floor(${p}_hraw / 6.0);`)
    body.push(`let ${p}_hclamped = clamp(abs(${p}_hmod - vec3f(3.0)) - vec3f(1.0), vec3f(0.0), vec3f(1.0));`)
    body.push(`let ${p}_hrgb = ${p}_hclamped * ${p}_hclamped * (vec3f(3.0) - 2.0 * ${p}_hclamped);`)
    body.push(`let ${p}_weight = vec3f(1.0) - ${p}_dispPower * ${p}_hrgb;`)
    body.push(`${p}_colorSum = ${p}_colorSum + ${p}_overWhite * ${p}_weight;`)
    body.push(`${p}_weightSum = ${p}_weightSum + ${p}_weight;`)
    body.push(`${p}_coverSum = ${p}_coverSum + ${p}_cover;`)

    stmts.push(`for (var ${p}_i = 0u; ${p}_i < u32(${p}_tapsF); ${p}_i++) {`)
    for (const b of body) stmts.push(`  ${b}`)
    stmts.push(`}`)

    // ── Recombine: weighted average over white → reconstructed alpha ──────────────────
    stmts.push(`let ${p}_color = ${p}_colorSum / max(${p}_weightSum, vec3f(1e-4));`)
    stmts.push(`let ${p}_coverAvg = ${p}_coverSum * ${p}_invCount;`)
    stmts.push(`let ${p}_ground = min(${p}_color.r, min(${p}_color.g, ${p}_color.b));`)
    stmts.push(`let ${p}_alpha = max(${p}_coverAvg, 1.0 - ${p}_ground);`)
    stmts.push(`let ${p}_premul = max(${p}_color - vec3f(1.0 - ${p}_alpha), vec3f(0.0));`)
    stmts.push(`var ${p}_out = vec4f(${p}_premul, ${p}_alpha) * ${p}_bulgeFade;`)
}

/** Stage 4 — grainOverlay: post-processing black/white grain on the premultiplied result. */
export function grainOverlayStmts(em: LensEmitFrame): void {
    const {p, stmts, L} = em
    stmts.push(`let ${p}_grainOverlay = ${em.U('grainOverlay')};`)
    stmts.push(`if (${p}_grainOverlay > 0.0) {`)
    {
        const lines: string[] = []
        const c1 = L(Math.cos(1)), s1 = L(Math.sin(1))
        const c2 = L(Math.cos(2)), s2 = L(Math.sin(2))
        lines.push(`let ${p}_gr1 = vec2f(${c1} * ${p}_grainUV.x - ${s1} * ${p}_grainUV.y, ${s1} * ${p}_grainUV.x + ${c1} * ${p}_grainUV.y) + vec2f(3.0);`)
        lines.push(`let ${p}_gr2 = vec2f(${c2} * ${p}_grainUV.x - ${s2} * ${p}_grainUV.y, ${s2} * ${p}_grainUV.x + ${c2} * ${p}_grainUV.y) + vec2f(-1.0);`)
        valueNoiseStmts(em, lines, `${p}_gr1`, `${p}_gn1`)
        valueNoiseStmts(em, lines, `${p}_gr2`, `${p}_gn2`)
        lines.push(`let ${p}_grain = pow(mix(${p}_gn1, ${p}_gn2, 0.5), 1.3);`)
        lines.push(`let ${p}_grainV = ${p}_grain * 2.0 - 1.0;`)
        lines.push(`let ${p}_grainStrength = pow(${p}_grainOverlay * abs(${p}_grainV), 0.8) * ${p}_out.a;`)
        lines.push(`${p}_out = vec4f(mix(${p}_out.rgb, vec3f(step(0.0, ${p}_grainV)) * ${p}_out.a, 0.35 * ${p}_grainStrength), ${p}_out.a);`)
        for (const l of lines) stmts.push(`  ${l}`)
    }
    stmts.push(`}`)
}


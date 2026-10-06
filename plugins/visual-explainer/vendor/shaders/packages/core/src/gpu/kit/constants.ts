/**
 * Shared numeric constants for shader code.
 *
 * WHY THIS FILE EXISTS: `Math.*` must never be referenced inside a `'use gpu'` body — the TGSL
 * transpiler has no `Math` in scope, so a `Math.PI` in a body produces wrong WGSL rather than an
 * error. The house workaround is to fold the value into a module-scope `const` and reference THAT
 * from the body; typegpu captures the const's JS value and emits it as a numeric literal. Every
 * shader used to declare its own copy (~54 files), which is how six of them ended up with
 * truncated degree-to-radian values. These are the one shared set.
 *
 * Being module-scope `const number`s is load-bearing, not incidental: keep the arithmetic
 * (`Math.PI / 180`) here at module scope so it evaluates on the CPU at import time. An imported
 * const inlines to exactly the same literal as a local one, so adopting these is byte-identical
 * WGSL for any shader whose local value already equalled the true constant.
 *
 * HOW TO REFERENCE THESE FROM A BODY — not any import will do. The transpiler folds a plain
 * module-scope IDENTIFIER whose value is a JS number; a MEMBER EXPRESSION on a namespace object
 * (`constants.DEG_TO_RAD` inside a `'use gpu'` body) is not that pattern and must not be relied on.
 * So either use a named import:
 *
 *     import {DEG_TO_RAD} from '@coreroot/gpu/kit/constants'
 *
 * or, when the file already imports the `constants` namespace off the kit facade (what the shader
 * fleet does), re-bind once at module scope and reference that identifier from the body:
 *
 *     import {constants} from '@coreroot/gpu/kit'
 *     const DEG_TO_RAD = constants.DEG_TO_RAD    // ← the body references THIS
 */

/** Degrees → radians. `Math.PI / 180`. */
export const DEG_TO_RAD = Math.PI / 180

/** Radians → degrees. `180 / Math.PI`. */
export const RAD_TO_DEG = 180 / Math.PI

/** π. */
export const PI = Math.PI

/** 2π — one full turn. */
export const TAU = Math.PI * 2

/** Alias of {@link TAU}; both spellings exist across the shader fleet. */
export const TWO_PI = TAU

/** π/2 — a quarter turn. */
export const HALF_PI = Math.PI / 2

/** √3 — the hex/triangular lattice ratio. */
export const SQRT3 = Math.sqrt(3)

/**
 * The golden angle in radians (`π · (3 − √5)` ≈ 2.39996322972865332). Used to give each octave /
 * particle / sample an incommensurate direction so successive items never line up.
 *
 * DIVERGENCE (Gate C when adopted): `shaders/FractalNoise/index.ts` inlines a truncated
 * `2.39996`. Swapping it for this constant is a real (if tiny) pixel change to the octave drift
 * directions, so it belongs on the Gate C visual-review list rather than in a Gate A migration.
 */
export const GOLDEN = 2.39996322972865332

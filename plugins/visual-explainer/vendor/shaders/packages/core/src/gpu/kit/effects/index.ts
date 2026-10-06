/**
 * Shared effect helpers: glass / neon / emboss / raymarch3d / thinFilm — reused across the
 * shape-effect shaders (Glass, Crystal, Neon, Emboss, LiquidMetal, Plastic, Holographic, Frost,
 * ThinFilm, Form3D, …). Each is an Expr-level builder
 * `apply<X>Effect(params, sdfSampler?, …) => Expr` (see the individual files for the exact
 * signature) plus its pure-math `'use gpu'` fns. Consumed as
 * `kit.effects.glass.applyGlassEffect(...)` etc.
 */
export * as bevel from './bevel'
export * as glass from './glass'
export * as neon from './neon'
export * as emboss from './emboss'
export * as raymarch3d from './raymarch3d'
export * as thinFilm from './thinFilm'

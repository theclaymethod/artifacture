/**
 * THE SHADER KIT (facade) — the only import surface for shader code. Re-exports the
 * TypeGPU std + data + core builder surfaces plus our own helpers, so shader code never
 * imports `typegpu` directly. Direct typegpu imports outside `src/gpu/**` fail the
 * `no-restricted-imports` lint rule.
 */
import tgpu from 'typegpu'
import * as d from 'typegpu/data'
import * as std from 'typegpu/std'
import type {AnyVecInstance, AnyWgslData} from 'typegpu/data'

// Core builder surface (`tgpu.fn`/`fragmentFn`/`resolve`/`slot`/…), the data schema
// namespace (`d.vec4f`, `d.struct`, …), and the WGSL std library (`std.mix`, `std.dot`,
// `std.smoothstep`, …).
export {tgpu, d, std}

/**
 * A GPU-side expression — the currency used throughout the shader contract.
 */
export type KitExpr = number | AnyVecInstance | AnyWgslData

/**
 * `1 - x`, for a scalar or a numeric vector (WGSL broadcasts scalar-vector subtraction,
 * and `std.sub` types the scalar-first overload).
 */
export function oneMinus(x: number): number
export function oneMinus<T extends AnyVecInstance>(x: T): T
export function oneMinus(x: number | AnyVecInstance): number | AnyVecInstance {
    'use gpu'
    return std.sub(1, x as never) as number | AnyVecInstance
}

/**
 * Ternary select in argument order `(cond, ifTrue, ifFalse)`. Wraps `std.select`, whose WGSL
 * order is `(f, t, cond)` — the reorder here presents the conventional condition-first order.
 */
export function select(cond: boolean, ifTrue: boolean, ifFalse: boolean): boolean
export function select(cond: boolean, ifTrue: number, ifFalse: number): number
export function select<T extends AnyVecInstance>(cond: boolean | AnyVecInstance, ifTrue: T, ifFalse: T): T
export function select(cond: boolean | AnyVecInstance, ifTrue: unknown, ifFalse: unknown): unknown {
    'use gpu'
    return std.select(ifFalse as never, ifTrue as never, cond as never)
}

/**
 * Squared length of a vector, `dot(v, v)` — cheaper than `length` when only comparing
 * magnitudes.
 */
export function lengthSq(v: AnyVecInstance): number {
    'use gpu'
    return std.dot(v as never, v as never)
}

// ── Kit module re-exports ─────────────────────────────────────────────────────
// Shader code imports everything from '@coreroot/gpu/kit'. Namespaced exports keep
// the 20 blend modes / conversion fns / etc. from colliding at the top level while
// still allowing `import {blend, tonemap} from '@coreroot/gpu/kit'`.
export * as constants from './constants'
export * as tone from './tone'
export * as geom from './geom'
export * as cells from './cells'
export * as aa from './aa'
export * as fields from './fields'
export * as cellular from './cellular'
export * as lightfields from './lightfields'
export * as blend from './blend'
export * as mask from './mask'
export * as colorMixing from './colorMixing'
export * as tonemap from './tonemap'
export * as coords from './coords'
export * as edges from './edges'
export * as sampling from './sampling'
export * as displace from './displace'
export * as colorOps from './colorOps'
export * as warpMaps from './warpMaps'
export * as gradientPaints from './gradientPaints'
export * as motionBlur from './motionBlur'
export * as patternPaints from './patternPaints'
export * as noisePaints from './noisePaints'
export * as shapePaints from './shapePaints'
export * as stylizePaints from './stylizePaints'
export * as materialParts from './materialParts'
export * as overlayParts from './overlayParts'
export * as instanceParts from './instanceParts'
export * as lensParts from './lensParts'
export * as trackerSim from './trackerSim'
export * as waves from './waves'
export * as uvTransform from './uvTransform'
export * as kitTime from './time'
export * as colorStops from './colorStops'
export * as noise from './noise'
export * as noiseColor from './noiseColor'
export * as noiseStylize from './noiseStylize'
export * as blur from './blur'
export * as reveal from './reveal'
export * as lighting from './lighting'
export * as sdf from './sdf'
export * as sdf3d from './sdf3d'
export * as voxels from './voxels'
// CPU-side texel encoder (half-float upload) — top-level so any data-texture sim reads it as
// `import {toHalfFloat} from '@coreroot/gpu/kit'`.
export {toHalfFloat} from './dataEncoding'
export * as effects from './effects'
export * as media from './media'
export * as agents from './agents'

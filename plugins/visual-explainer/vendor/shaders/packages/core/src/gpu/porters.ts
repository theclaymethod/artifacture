/**
 * The single import point for shader definitions. A shader and its framework
 * component template import EVERYTHING they need from here (`@coreroot/gpu/porters`) — the
 * shader contract, the prop transforms, and the prop→GPU registration bridge — so
 * no shader ever reaches into individual gpu/ modules.
 *
 *   - Shader definition files: `GpuShaderDefinition`, `GpuFragment`, `GpuUvRemap`, the KitExpr
 *     types, `GpuPropField`, … (the contract).
 *   - Framework component templates: `createGpuUniformsMap` (builds the registration input),
 *     `GpuUniformsMap` / `GpuUniformInput` (its shape).
 *   - Either, when authoring/adjusting props: `gpuTransformFor`, `transformColorGpu`,
 *     `transformPositionGpu`, the scalar transforms, `colorStopsTransform`.
 *
 * (gpu/index.ts owns the renderer surface + the registration input types; this facade gives
 * shaders one place to import from.)
 */
export * from './contract'
export * from './transforms'
export {createGpuUniformsMap, type BridgeShaderDefinition} from './uniformBridge'
export type {GpuUniformsMap, GpuUniformInput} from './index'
// KitExpr builder factories — a fragment/uvRemap builder assembles its return Expr from these
// (`call` a `'use gpu'` body fn, build a `vec4`, splice a raw `expr`, …). Re-exported here so a
// shader imports contract types + factories + transforms from this ONE facade; the `'use gpu'`
// bodies themselves still import `tgpu`/`d`/`std` + kit helpers from `@coreroot/gpu/kit`.
export {expr, floatE, call, vec4, mixExpr, arrayExpr, asLocal, ZERO, WHITE0} from './composer'
// compute-pipeline primitive. A compute shader that builds its OWN kernel pass (a blur-map fill,
// a bright-extract pre-pass — TiltShift/ProgressiveBlur/Glow) wraps its `'use gpu'` kernel in a
// guarded pipeline here, exactly as kit/blur does internally. Shaders that only consume a kit blur
// (Blur/ChannelBlur) don't need it. Types come along for the compute hook's step arrays.
export {createGuardedCompute, type ComputeStep, type KitComputePipeline} from './compute'
// state-buffer primitives for standalone simulation compute shaders (PixelSort's odd-even sort
// offset buffers, and the particle/feedback sims). `createStateBuffer` allocates a persistent GPU
// array buffer. `createPingPongPair` is the ping-pong primitive to reach for: it is generic over one
// SIDE of the pair (a buffer, a texture, or a record that swaps together) and exposes the
// orientation, which is what lets a gradient/output pass be built from it. `createPingPong` is its
// DEPRECATED predecessor — it can express only one bind-group family, builds groups eagerly, and
// never had a consumer; see the note on it in `compute.ts`.
export {createStateBuffer, createPingPongPair, createPingPong, type PingPongPair, type PingPong} from './compute'
// Simulation scaffolds. `createFeedbackTrailSim` owns the whole state-texture + display-copy +
// ping-pong + dt-clamp bookkeeping for a trail/feedback sim; `createLateBoundChildInput` owns the
// convertToTexture/resolve/late-bind dance a compute pass needs to sample its child. Both return
// `null` when the prerequisite is missing (no device, no child) and the caller forwards that null.
export {createFeedbackTrailSim, type FeedbackTrailSim, type FeedbackTrailSimOptions} from './scaffolds/feedbackSim'
export {createLateBoundChildInput, type LateBoundChildInput} from './scaffolds/lateBoundChild'
// Quiet-by-default diagnostics. Shaders that do async I/O (media decode, webcam, SDF fetch)
// need a way to say what happened WITHOUT writing to a partner's console on every page load;
// these are no-ops unless debugging is switched on (`setShadersDebug(true)` /
// `localStorage['shaders:debug'] = '1'`). Genuine INTEGRATION errors a developer must fix —
// "you must pass a child component into this shader", a broken image URL — stay on plain
// `console.error`, because those are actionable and fire once.
export {debugWarn, debugError} from './support'
// Definition-level scaffolds (C9/D-9). A shader in an established category calls the factory for
// its category instead of hand-writing the definition: `uvRemapShader` for RTT distortions,
// `defineSdfShapeShader` for filled 2D shapes, `definePointwiseFilter` / `defineRttFilter` for
// color filters. Re-exported here so shaders keep a two-facade import surface (porters + kit) —
// a shader never reaches into `@coreroot/gpu/scaffolds/<file>` directly.
export {
    uvRemapShader,
    lerpToIdentity,
    selectMap,
    type UvMap,
    type UvMapResult,
    type UvMapped,
    type UvMapSource,
    type UvRemapHookParams,
    type UvRemapEdgeSource,
    type UvRemapShaderOptions,
} from './scaffolds/uvRemapShader'
export {defineSdfShapeShader, type SdfShapeShaderSpec, type SdfShapeBounds} from './scaffolds/sdfShape'
export {
    definePointwiseFilter,
    isFilterIdentity,
    type PointwiseFilterConfig,
    type FilterBody,
    type FilterIdentity,
    type FilterParams,
} from './scaffolds/pointwiseFilter'
export {defineRttFilter, type RttFilterConfig, type RttFilterParams} from './scaffolds/rttFilter'
// Simulation-category scaffolds. `agents` shaders (Boids/Particles/ParticleField/…) build their
// agent buffers + dispatch through `createAgentSystem` and its CPU-side frame/tier helpers; the
// stable-fluids shaders (Smoke/SmokeFlow/ParticleFlow) build their solver passes through the
// fluids builders; `gaussianBrush*` and `legacySinHash11` are the shared kernels those sims and
// the legacy-parity distortions splat/hash with.
export {
    createAgentSystem,
    readAgentFrame,
    makeCpuValueGetter,
    resolveDeviceTier,
    resolveRenderRes,
    clampAgentCount,
    energyCoverageAlpha,
    integrateSemiImplicitEuler,
    worldSplatWindow,
    texelSplatWindow,
    SplatWindow,
    SIZE_REF_RES,
    FIXED_POINT_GAINS,
    R2_ALPHA,
    R3_ALPHA,
    type AgentSystem,
    type AgentSystemConfig,
    type AgentPipelineSpec,
    type AgentThreads,
    type AgentFrame,
    type AgentFrameParams,
    type DeviceTier,
} from './scaffolds/agentSystem'
export {
    buildStableFluidsKernels,
    buildFluidOutputKernel,
    createStableFluidsPasses,
    createFluidKernelPass,
    buildVelocityImpulseKernel,
    buildBrushSplatKernel,
    buildEmitterSplatKernel,
    buildNoiseFieldInitKernel,
    buildTrigTurbulenceKernel,
    buildNoiseRestoreKernel,
    makeShapeMaskSet,
    neighbourIndex,
    type StableFluidsOptions,
    type StableFluidsKernels,
    type StableFluidsPasses,
    type FluidSolverLayout,
    type FluidOutputLayout,
    type FluidSolveParams,
    type FluidDyeParams,
    type FluidStorageTexture,
    type FluidBoundary,
    type FluidDyeMode,
} from './scaffolds/fluids'
// Height-field surface machine (raymarched z = h(x,y) + wave-equation ripple layer, Surface3D's
// engine): spectral heightfields, the wave-equation step, the slab-clamped march kernel, and the
// params-uniform / state-buffer / pass builders the consumer wires per frame.
export {
    buildSpectralHeightField,
    makeWaveEquationKernel,
    makeHeightFieldMarchKernel,
    createHeightFieldParamsUniform,
    createWaveStateBuffers,
    createKernelPass,
    waveEquationLayout,
    heightFieldMarchLayout,
    WAVE_GRID,
    WAVE_HALFEXTENT,
    CURSOR_WAVE_BOUND,
    WAVE_DECAY,
    WAVE_SETTLE_MS,
    MARCH_FAR,
    HEIGHT_SLAB_PAD,
    HEIGHT_FIELD_STATE_FORMAT,
    type HeightFieldMarchOptions,
    type HeightFieldParamsInput,
    type HeightFieldParamsUniform,
} from './scaffolds/heightField'
export {
    createGridKernelPass,
    buildGrayScottStep,
    buildScatterSeedKernel,
    buildPairPublishKernel,
    buildOddEvenSortSet,
    makeAspectBrushWeight,
    buildFeedbackTrailStep,
    frameDiffMask,
    hueRotateTurns,
    buildMacroblockAdvectKernel,
    buildBlockQuantizeGraph,
    makeJpegBlockRgb,
    flowDirectionColor,
    type GridKernel,
    type GrayScottOptions,
    type ReactionDriveOptions,
    type OddEvenSortOptions,
    type FeedbackTrailOptions,
    type MacroblockAdvectOptions,
    type BlockQuantizeOptions,
} from './scaffolds/gridKernels'
export {
    gaussianBrushSq,
    gaussianBrushShiftedSq,
    gaussianBrushRaw,
    gaussianBrushShifted,
    gaussianBrushFnSq,
    gaussianBrushFn,
    gaussianBrushShiftedSqFn,
    gaussianBrushShiftedFn,
    type GaussianBrushOptions,
} from './scaffolds/simShared'
export {legacySinHash11} from './scaffolds/shared'

import {expr} from './composer'
import type {Expr, GpuShaderDefinition, GpuFragmentParams} from './contract'

/**
 * The invisible ROOT node's definition — the shared passthrough every runtime entry point
 * (framework engines, js `createShader`, `presetRenderer`) registers as the tree root.
 *
 * `shaderRendererGPU.registerNode` requires EVERY node — the root included — to carry a
 * component definition (the composer reads declarative flags off it), so the root cannot be
 * a lone fragment fn. This exports the whole definition; a caller registers it as
 * `registerNode(rootId, rootPassthrough.fragment, null, null, {}, rootPassthrough)`. The fragment
 * composites its children and returns transparent black when it has none.
 */
export const rootPassthrough: GpuShaderDefinition = {
    name: 'Root',
    props: {} as never,
    fragment: ({childNode}: GpuFragmentParams): Expr => childNode ?? expr('vec4f(0.0, 0.0, 0.0, 0.0)'),
}

/**
 * Per-node animated time. Returns an `Expr` reading this node's CPU-accumulated `_animTime`
 * field.
 *
 * The accumulation itself is the RENDERER's job, not the builder's: declare
 * `animatedTime: {speed: '<speedProp>'}` on the shader definition and the renderer registers
 * `_animTime` on the node struct and advances it every frame by `deltaTime * <speedProp>.value`
 * (speed=0 pauses, no rewind — see `GpuShaderDefinition.animatedTime` and `gpu/index.ts`). This
 * helper only wires the READ into the builder's Expr tree, so a port writes:
 *
 * ```ts
 * // definition: animatedTime: {speed: 'speed'}
 * const t = animatedTime(params)              // → uni.$.uniforms.n_x._animTime
 * const body = call(myBody, 'my', [t, …])
 * ```
 *
 * @param params    the `fragment` / `uvRemap` builder params (needs `props` + `uniforms`).
 * @param seedName  optional seed prop — its uniform is ADDED to the field on the GPU;
 *                  the seed stays an ordinary uniform, so it is not part of the `animatedTime`
 *                  declaration.
 * @param fieldName the animated-time field to read (default `_animTime`, the primary clock).
 *                  Pass `_animTime_<key>` to read an EXTRA clock declared via
 *                  `extraAnimatedTimes: {<key>: '<speedProp>'}` (FlowField's evolution clock).
 */
export function animatedTime(
    params: {props: Expr; uniforms: Record<string, Expr>},
    seedName?: string,
    fieldName: string = '_animTime',
): Expr {
    const base = params.props.member(fieldName)
    if (seedName) {
        const seed = params.uniforms[seedName]
        if (seed) return base.add(seed)
    }
    return base
}

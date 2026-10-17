/**
 * `createGpuUniformsMap` — the prop → GPU registration bridge.
 *
 * It turns a shader's `props` (defaults + transforms) plus the live reactive prop values into
 * the `GpuUniformsMap` that `shaderRendererGPU.registerNode` consumes. The shader's EXISTING
 * `props` definition is used untouched; this bridge swaps each prop's transform for its GPU
 * equivalent (`gpuTransformFor`) and packs the value shapes the uniform store expects.
 *
 * KEY BEHAVIORS:
 *
 *  1. No pre-resolution of dimensional (px / origin) props. `shaderRendererGPU.registerNode`
 *     OWNS that resolution (it stashes `_rawDimensional` from `.value` then resolves — see
 *     gpu/index.ts registerNode). So the bridge feeds the RAW value in `.value`; pre-resolving
 *     here would make registerNode stash an already-resolved value as the "raw", breaking
 *     px-unit resize re-resolution. We still mark dimensional props with `_rawDimensional`
 *     (harmless — registerNode overwrites it with the same raw).
 *
 *  2. One value shape. The GPU transforms return a plain final value (number / `d.vec*f`); the
 *     uniform store applies the transform when it seeds/patches the packed field. So the bridge
 *     stores the RAW value + the GPU transform, not a pre-transformed node.
 *
 *  3. colorStops expands into struct array fields (see the layout note below) rather than a
 *     single `UniformDefinition` carrying `colorsArray`/`positionsArray`/… sub-objects.
 *
 *  4. LIST props (`listPropConfig`, the generic array-prop mechanism) expand into one
 *     `array<vec4f, maxItems>` per item field (`<prop>_<field>`) + a `<prop>Count` f32, plus the
 *     cpu-only mirror whose value is the RESOLVED item list. See `utilities/listProps`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * COLOR-STOPS ARRAY LAYOUT
 *
 * A `stops` prop (identified by the `colorStopsTransform` marker) expands into FIVE map
 * entries. Fixed names, because a shader has at most one color-stops prop (only `stops`):
 *
 *   - `stops`               cpu-only mirror holding the raw ColorStop[] + the recompile trigger
 *                           (`compileTimeWhen` on effective stop count). This is the entry
 *                           `updateUniformValue(id, 'stops', …)` finds, so a count change still
 *                           recomposes. Never a struct field.
 *   - `colorsArray`         d.arrayOf(d.vec4f, 8)  — rgba per stop (32 floats). rgb=el[i].xyz,
 *                           alpha=el[i].w.
 *   - `positionsArray`      d.arrayOf(d.vec4f, 2)  — 8 positions packed 4-per-vec4.
 *                           positionAt(i) = el[floor(i/4)][i % 4].
 *   - `convertedColorsArray`d.arrayOf(d.vec3f, 8)  — CPU-preconverted working-space rgb per stop
 *                           (24 floats), packed at the shader's active colorSpace mode.
 *                           convAt(i) = el[i].
 *   - `stopCount`           d.f32                  — the CPU unroll bound (>1 → multi-stop path).
 *
 * Why vec-element arrays (not flat f32): WGSL requires a 16-byte array element stride in the
 * uniform address space, so `array<f32, N>` is INVALID there (a real device rejects the
 * pipeline); `array<vec4<f32>, N>` is the valid packing.
 */
import * as d from 'typegpu/data'

import type {GpuUniformsMap} from './index'
import {gpuTransformFor, colorToRGBA, colorStopsTransform, listPropTransform, transformColorSpace} from './transforms'
import {listSpecOf, resolveListItems, packList, listFieldName, listCountName} from '../utilities/listProps'
import {packStops, packConvertedStops, MAX_COLOR_STOPS, type ColorStop} from './kit/colorStops'
import {buildExtraSizeProps, isDimensionalProp} from '../utilities/dimensionalProps'
import type {PropConfig, BoundingBoxDeclaration} from '../types'

/**
 * The minimal shape of a shader definition the bridge reads: a `props` map, with optional
 * name and bounding-box declaration.
 */
export interface BridgeShaderDefinition {
    name?: string
    props: Record<string, PropConfig<unknown>>
    boundingBoxDeclaration?: BoundingBoxDeclaration
}

/**
 * Build a node's `GpuUniformsMap` from its shader definition and current reactive prop values.
 * `instanceId` is accepted for signature compatibility but unused for naming here — the GPU
 * struct key (`n_<id>`) and WGSL-safe field-name sanitization are handled by the uniform store
 * at `registerNode` time.
 */
export function createGpuUniformsMap(
    definition: BridgeShaderDefinition,
    reactiveProps: Record<string, unknown>,
    _instanceId: string,
): GpuUniformsMap {
    const uniformsMap: GpuUniformsMap = {}

    const decl = definition.boundingBoxDeclaration
    const extraSizeProps = buildExtraSizeProps(definition.props)

    // The shader's active colorSpace mode (keyed on the transform identity, like the colorStops
    // prop itself — generic, no hardcoded prop name). The preconverted stop array is packed at
    // THIS mode so a multi-stop gradient blends in the right working space on its first render.
    // A runtime colorSpace change re-pack is a separate live-editing concern.
    const activeColorSpaceMode = resolveColorSpaceMode(definition.props, reactiveProps)

    for (const [propName, propConfig] of Object.entries(definition.props)) {
        const transform = propConfig.transform

        // Color-stops (array) prop: bypass the generic path. The generic path would transform a
        // `null` default to `null`, trip the null-fallback, and skip the array plumbing. Expand
        // into the fixed-MAX array fields + the cpu-only recompile-trigger mirror instead.
        if (transform === colorStopsTransform) {
            expandColorStops(uniformsMap, propName, propConfig, reactiveProps[propName], activeColorSpaceMode)
            continue
        }
        // List (array) prop: the generic expansion — per-field vec4 lane arrays + count + mirror.
        if (transform === listPropTransform) {
            expandListProp(uniformsMap, propName, propConfig, reactiveProps[propName])
            continue
        }

        const rawValue = reactiveProps[propName]

        // Null/undefined → prop default → emergency 0.
        let value: unknown = rawValue
        if (value === null || value === undefined) {
            value = propConfig.default
        }
        if (value === null || value === undefined) {
            console.error(`[Shaders] Uniform "${propName}" is null/undefined after fallback. PropConfig:`, {
                propName,
                initialValue: rawValue,
                default: propConfig.default,
                hasTransform: !!transform,
            })
            value = 0
        }

        const gpuTransform = gpuTransformFor(transform as ((value: never) => unknown) | undefined)
        const isDim = isDimensionalProp(decl, propName, extraSizeProps)
        // CPU-only props: no-transform strings AND no-transform config OBJECTS (urls / shape JSON /
        // origin / select enums). A transform-less prop is not a packable scalar/vec, so it must be
        // read CPU-side (getCpuValue), not seeded as a GPU struct field. The shape prop is the load-
        // bearing case: `:shape="{ type, radius, rotY:{auto-animate} }"` (an OBJECT, e.g. the homepage
        // hero) — without this it fell through and the store packed the object into a numeric field that
        // read back as 0, so the compute got `0`, parsed to {}, and used ALL defaults (dodeca radius
        // 0.34 → ~2× oversized; static rotX/Y/Z → frozen rotation). A serialized STRING shape dodged it
        // (already cpu). Excluded: packable objects carry a transform (transformPosition → vec2,
        // transformColor → vec4); DIMENSIONAL objects are a `{value, unit}` DimensionalValue that
        // registerNode resolves to a UV number and packs (a GPU field, NOT cpu — the `!isDim` guard);
        // arrays go through the colorStops/schema path.
        const cpu = !gpuTransform && !isDim && (typeof value === 'string' || (typeof value === 'object' && value !== null && !Array.isArray(value)))

        uniformsMap[propName] = {
            value,
            transform: gpuTransform,
            compileTime: propConfig.compileTime || false,
            ...(propConfig.compileTimeWhen
                ? {
                      compileTimeWhen: propConfig.compileTimeWhen as (previousValue: unknown, newValue: unknown) => boolean,
                      _lastCompiledValue: rawValue ?? propConfig.default,
                  }
                : {}),
            // Mark dimensional props with the raw value so resize re-resolution has it (registerNode
            // re-derives this from `.value`, which stays RAW here — see the note at the top).
            ...(isDim ? {_rawDimensional: rawValue} : {}),
            ...(cpu ? {cpu: true} : {}),
        }
    }

    return uniformsMap
}

/**
 * The shader's active colorSpace mode, or 0 (linear) when it has no colorSpace prop. Keyed on the
 * `transformColorSpace` transform identity — the same identity-based dispatch the colorStops prop
 * uses — so it works for any shader that adopts the standard colorSpace prop without hardcoding a
 * prop name.
 */
function resolveColorSpaceMode(props: Record<string, PropConfig<unknown>>, reactiveProps: Record<string, unknown>): number {
    for (const [name, cfg] of Object.entries(props)) {
        if (cfg.transform === (transformColorSpace as unknown)) {
            const raw = reactiveProps[name] ?? cfg.default
            return typeof raw === 'string' ? transformColorSpace(raw) : 0
        }
    }
    return 0
}

/**
 * Expand one color-stops prop into its cpu mirror + packed array fields. See the layout note
 * at the top of the file. `colorSpaceMode` packs the preconverted working-space array at the
 * shader's active mode so a multi-stop gradient blends in the correct space on first render.
 */
function expandColorStops(
    uniformsMap: GpuUniformsMap,
    propName: string,
    propConfig: PropConfig<unknown>,
    rawValue: unknown,
    colorSpaceMode: number,
): void {
    const stops = (rawValue ?? null) as ColorStop[] | null
    const packed = packStops(stops, colorToRGBA)
    // Preconvert each stop into the active colorSpace working space (mode 0 = linear is identity).
    const converted = packConvertedStops(packed.colors, packed.stopCount, colorSpaceMode)

    // The original prop: cpu-only mirror carrying the raw stops + the recompile trigger.
    uniformsMap[propName] = {
        value: stops,
        transform: colorStopsTransform as (value: unknown) => unknown,
        cpu: true,
        compileTime: propConfig.compileTime || false,
        ...(propConfig.compileTimeWhen
            ? {
                  compileTimeWhen: propConfig.compileTimeWhen as (previousValue: unknown, newValue: unknown) => boolean,
                  _lastCompiledValue: stops ?? propConfig.default,
              }
            : {}),
    }

    // Fixed-MAX packed array fields (vec-element for uniform-address-space stride validity).
    uniformsMap.colorsArray = {value: packed.colors, schema: d.arrayOf(d.vec4f, MAX_COLOR_STOPS)}
    uniformsMap.positionsArray = {value: packed.positions, schema: d.arrayOf(d.vec4f, MAX_COLOR_STOPS / 4)}
    uniformsMap.convertedColorsArray = {value: converted, schema: d.arrayOf(d.vec3f, MAX_COLOR_STOPS)}
    uniformsMap.stopCount = {value: packed.stopCount, schema: d.f32}
}

/**
 * Expand one list prop: the cpu-only mirror (value = the RESOLVED items, what `getCpuValue`
 * returns) plus the fixed-size per-field lane arrays and the live count. Drivers inside items
 * park at their origin here; the renderer re-resolves them per frame.
 */
export function expandListProp(
    uniformsMap: GpuUniformsMap,
    propName: string,
    propConfig: PropConfig<unknown>,
    rawValue: unknown,
): void {
    const spec = listSpecOf(propConfig)
    if (!spec) {
        console.error(`[Shaders] List prop "${propName}" has no item spec in its ui config`)
        return
    }
    const items = resolveListItems(rawValue ?? propConfig.default, spec, {color: colorToRGBA})
    const packed = packList(items, spec)
    uniformsMap[propName] = {
        value: items,
        transform: listPropTransform as (value: unknown) => unknown,
        cpu: true,
        compileTime: propConfig.compileTime || false,
        _rawList: rawValue ?? propConfig.default,
        _listSpec: spec,
    }
    for (const [field, lanes] of Object.entries(packed.fields)) {
        uniformsMap[listFieldName(propName, field)] = {value: lanes, schema: d.arrayOf(d.vec4f, spec.maxItems)}
    }
    uniformsMap[listCountName(propName)] = {value: packed.count, schema: d.f32}
}

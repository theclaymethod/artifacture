/**
 * Shared CPU-side prop-config factories.
 *
 * These are pure data builders: each returns a fresh `PropConfig` object equal to the block the
 * shader fleet inlines today, so adopting one changes no defaults, no UI metadata, and no emitted
 * WGSL (Gate A). Precedent: `colorStopsPropConfig` in `utilities/colorStops.ts` and
 * `reliefStylizeProps` in `utilities/noiseStylize.ts`.
 *
 * Two rules the factories follow, both learned from surveying the inline copies:
 *
 * 1. **Anything that actually varies across the fleet is a REQUIRED argument.** `edges` defaults
 *    split three ways (mirror / stretch / transparent) and every `center` carries its own
 *    description. A convenient default here would let a migration silently change a shader's
 *    default value or its Design Editor metadata, which is exactly what the extraction is supposed
 *    to make impossible.
 * 2. **Optional keys are omitted, never set to `undefined`.** `ui.units` is absent on the
 *    distortion `center` props and present on the shape ones; emitting `units: undefined` would
 *    change the shape of the prop metadata the design editor generates from it.
 *
 * Arrays (option lists) are rebuilt per call so no two shaders share a mutable options array.
 */
import type {PropConfig, BoundingBoxOrigin} from '../types'
import {
    transformColor,
    transformColorSpace,
    transformEdges,
    transformPosition,
    transformStrokePosition,
    colorSpaceOptions,
} from './transformations'

// ── edges ────────────────────────────────────────────────────────────────────────────────────────

/** The four edge modes, in the order every shader's select lists them. */
export type EdgeMode = 'stretch' | 'transparent' | 'mirror' | 'wrap'

/**
 * The standard `edges` prop: a compile-time 4-option select handling samples that fall outside the
 * source. 22 shaders inline this identically apart from three fields.
 *
 * `defaultMode` is required because the fleet genuinely disagrees: `mirror` (Kaleidoscope,
 * DisplacementMap, FlowField, Surface3D, BarShift, ConcentricSpin, FlutedGlass, Shatter, Mirror),
 * `stretch` (PixelThrow, Stretch, CursorRipples, Liquify, WaveDistortion, Twirl, DiffuseBlur,
 * LinearGradient, GridDistortion, ReflectivePlane, Bulge) and `transparent` (Bend,
 * RectangularCoordinates, PolarCoordinates, CornerPin, Perspective) are all in use. Pass the
 * shader's current value verbatim.
 *
 * `description` is required for the same reason — seven distinct wordings exist, and the
 * description is user-visible tooltip text in the Design Editor.
 *
 * NOT a consumer: `Form3D.uvMode`, which reuses `transformEdges` but is a different prop (three
 * options, no `transparent`, no `compileTime`, label 'UV Edges').
 */
export function edgesPropConfig(
    defaultMode: EdgeMode,
    description: string,
    overrides?: {label?: string; group?: string},
): PropConfig<string> {
    return {
        default: defaultMode,
        description,
        transform: transformEdges,
        compileTime: true,
        ui: {
            type: 'select',
            options: [
                {label: 'Stretch', value: 'stretch'},
                {label: 'Transparent', value: 'transparent'},
                {label: 'Mirror', value: 'mirror'},
                {label: 'Wrap', value: 'wrap'},
            ],
            label: overrides?.label ?? 'Edges',
            group: overrides?.group ?? 'Effect',
        },
    }
}

// ── center ───────────────────────────────────────────────────────────────────────────────────────

/**
 * The standard `center` position prop. `description` is required (every consumer names its own
 * subject — "the center point of the twirl effect", "Center position of the crescent", …).
 *
 * Defaults across the fleet: `{x: 0.5, y: 0.5}` everywhere except Aurora (`{x: 0.5, y: 0}`), hence
 * the override. `label` is 'Center' in the majority and 'Center Position' in Circle/ConcentricSpin.
 * `units: ['%', 'px']` is present on the shape/material family and absent on the distortions, so it
 * is opt-in and the key is omitted when not requested.
 */
export function centerPropConfig(
    description: string,
    overrides?: {
        default?: {x: number; y: number}
        label?: string
        group?: string
        units?: string[]
    },
): PropConfig<Parameters<typeof transformPosition>[0]> {
    const ui: {type: 'position'; label: string; group: string; units?: string[]} = {
        type: 'position',
        label: overrides?.label ?? 'Center',
        group: overrides?.group ?? 'Position',
    }
    if (overrides?.units) ui.units = [...overrides.units]
    return {
        default: overrides?.default ?? {x: 0.5, y: 0.5},
        transform: transformPosition,
        description,
        ui,
    }
}

// ── origin ───────────────────────────────────────────────────────────────────────────────────────

/**
 * The `origin` prop — which reference edge a shape's center position is measured from. Byte-identical
 * in all 36 files that declare it (no transform: the string is read by the bounds layer, not the
 * GPU), so this factory takes no arguments.
 */
export function originProp(): PropConfig<BoundingBoxOrigin> {
    return {
        default: 'center',
        description: "Reference edge the center position is measured from (center default). Lets you pin the shape relative to a corner or the canvas centre.",
        ui: {
            type: 'origin',
            label: 'Origin',
            group: 'Position',
        },
    }
}

// ── shape stroke block ───────────────────────────────────────────────────────────────────────────

/**
 * The softness + stroke block shared by the 2D shape fleet: `softness`, `strokeThickness`,
 * `strokeColor`, `strokePosition`.
 *
 * The baseline is the FLEET standard — the block that is byte-identical across Heart, Ellipse,
 * RoundedRect, Star, Cross, Crescent, Vesica, Teardrop, Flower, Parallelogram, Arc, Polygon and
 * Trapezoid (13 files): plain `range` inputs, softness max 0.1 / step 0.001, stroke thickness max
 * 0.2 / step 0.005.
 *
 * Circle is NOT that block and must not be migrated to it wholesale: its `softness` and
 * `strokeThickness` are `['range', 'map']` typed, with max 1 / 0.5 and a
 * `dimensional: 'canvas-height'` marker on softness. Circle keeps those two props inline (spread
 * over the factory result: `{...shapeStrokeProps({...}), softness: {…}, strokeThickness: {…}}`) so
 * its widened, map-driveable ranges survive.
 *
 * Ring differs in two small ways covered by the options below.
 */
export function shapeStrokeProps(overrides?: {
    /** Ring: "Edge softness for antialiasing (applied to both inner and outer ring edges)". */
    softnessDescription?: string
    /** Ring: 0.1 rather than the fleet's 0.2. */
    strokeThicknessMax?: number
    /** Circle: "The color of the stroke outline" (definite article), vs the fleet's "Color of…". */
    strokeColorDescription?: string
    /** Ring: "…relative to the ring edge"; Circle: "…relative to the circle edge". */
    strokePositionDescription?: string
}) {
    return {
        softness: {
            default: 0,
            description: overrides?.softnessDescription ?? "Edge softness for antialiasing",
            ui: {type: 'range', min: 0, max: 0.1, step: 0.001, label: 'Softness', group: 'Effect'},
        } as PropConfig<number>,
        strokeThickness: {
            default: 0,
            description: "Stroke thickness. Zero means no stroke.",
            ui: {type: 'range', min: 0, max: overrides?.strokeThicknessMax ?? 0.2, step: 0.005, label: 'Stroke Thickness', group: 'Stroke'},
        } as PropConfig<number>,
        strokeColor: {
            default: "#000000",
            transform: transformColor,
            description: overrides?.strokeColorDescription ?? "Color of the stroke outline",
            ui: {type: 'color', label: 'Stroke Color', group: 'Colors'},
        } as PropConfig<Parameters<typeof transformColor>[0]>,
        strokePosition: {
            default: 'center',
            transform: transformStrokePosition,
            description: overrides?.strokePositionDescription ?? "Position of the stroke relative to the shape edge",
            ui: {
                type: 'select',
                options: [{label: 'Outside', value: 'outside'}, {label: 'Center', value: 'center'}, {label: 'Inside', value: 'inside'}],
                label: 'Stroke Position',
                group: 'Stroke',
            },
        } as PropConfig<string>,
    }
}

// ── shape colorSpace ─────────────────────────────────────────────────────────────────────────────

/**
 * The `colorSpace` prop for shapes: which space the fill → stroke blend interpolates in.
 * Compile-time (it selects a `mixColors` variant at composition, so a change recompiles).
 * Circle's description adds "in soft edges"; everything else uses the baseline.
 */
export function shapeColorSpaceProp(overrides?: {description?: string}): PropConfig<string> {
    return {
        default: 'linear',
        transform: transformColorSpace,
        compileTime: true,
        description: overrides?.description ?? "Color space for blending fill and stroke colors",
        ui: {type: 'select', options: colorSpaceOptions, label: 'Color Blending', group: 'Colors'},
    }
}

// ── objectFit ────────────────────────────────────────────────────────────────────────────────────

/**
 * The `objectFit` prop for texture shaders.
 *
 * PRESERVED DIVERGENCE: Image and Video retired `none` (Figma-style — the bounding box defines the
 * extent), so their table coalesces `none` to fill (2) and their fallback is 2; the select does not
 * offer a "None" option at all. Webcam keeps `none` as its own mode 4 (natural pixel size), offers
 * it in the select, and falls back to cover (0). Both tables are reproduced verbatim below and
 * chosen by `allowNone`; do NOT unify them, the mode numbers are baked into shipped presets.
 *
 * `description` is required — "How the image / video / webcam feed should be sized within the
 * viewport".
 */
export function objectFitProp(
    defaultValue: string,
    description: string,
    options: {allowNone: boolean},
): PropConfig<string> {
    const transform = options.allowNone
        // Webcam: 'none' is a real mode (natural pixel size); unknown values fall back to cover.
        ? (value: string) => {
            const modes: Record<string, number> = {
                'cover': 0,
                'contain': 1,
                'fill': 2,
                'scale-down': 3,
                'none': 4
            }
            return modes[value] ?? 0
        }
        // Image/Video: 'none' is retired and coalesces to 'fill' (2), not silently to cover, so old
        // presets keep filling their box rather than re-cropping. Unknown values also fall back to 2.
        : (value: string) => {
            const modes: Record<string, number> = {
                'cover': 0,
                'contain': 1,
                'fill': 2,
                'scale-down': 3,
                'none': 2
            }
            return modes[value] ?? 2
        }
    const uiOptions = [
        {label: 'Cover', value: 'cover'},
        {label: 'Contain', value: 'contain'},
        {label: 'Fill', value: 'fill'},
        {label: 'Scale Down', value: 'scale-down'},
    ]
    if (options.allowNone) uiOptions.push({label: 'None', value: 'none'})
    return {
        default: defaultValue,
        description,
        transform,
        compileTime: true,
        ui: {
            type: 'select',
            options: uiOptions,
            label: 'Object Fit',
            group: 'Sizing',
        },
    }
}

// ─── Glass-shell prop block ─────────────────────────────────────────────────────────────────────

/** The canonical glass-shell optics props (see {@link glassShellProps}). */
export type GlassShellPropName =
    | 'refraction' | 'dispersion' | 'thickness'
    | 'environment' | 'envRotation' | 'lightAngle'
    | 'highlight' | 'highlightColor' | 'highlightSoftness'
    | 'fresnel' | 'fresnelSoftness' | 'fresnelColor'
    | 'edgeSoftness'

type AnyGlassPropConfig = PropConfig<any>

/** Per-prop override: any PropConfig field; `ui` deep-merges over the canon's. */
export interface GlassShellOverride {
    default?: number | string
    transform?: (value: any) => any
    compileTime?: boolean
    description?: string
    ui?: Record<string, unknown>
}

const GLASS_SHELL_CANON: Record<GlassShellPropName, AnyGlassPropConfig> = {
    refraction: {
        default: 0.5,
        description: "How strongly the shell bends what's seen through or inside it",
        ui: {type: ['range', 'map'], min: 0, max: 1, step: 0.01, label: 'Refraction', group: 'Glass'},
    },
    dispersion: {
        default: 0.25,
        description: 'Spectral splitting at the shell — rainbow fringes where light bends hardest',
        ui: {type: ['range', 'map'], min: 0, max: 1, step: 0.01, label: 'Dispersion', group: 'Glass'},
    },
    thickness: {
        default: 0.2,
        description: "Shell depth — how far inward from the edge the shell's optics extend",
        ui: {type: ['range', 'map'], min: 0, max: 1, step: 0.01, label: 'Thickness', group: 'Glass'},
    },
    environment: {
        default: 1,
        description: 'Strength of the studio lighting reflected in the shell',
        ui: {type: ['range', 'map'], min: 0, max: 2, step: 0.01, label: 'Environment', group: 'Glass'},
    },
    envRotation: {
        default: 0,
        description: 'Rotates the reflected studio — spins where the bright reflections fall',
        ui: {type: 'range', min: 0, max: 360, step: 1, label: 'Env Rotation', group: 'Glass'},
    },
    lightAngle: {
        default: 315,
        description: 'Direction of the key light, in degrees',
        ui: {type: 'range', min: 0, max: 360, step: 1, label: 'Light Angle', group: 'Glass'},
    },
    highlight: {
        default: 1,
        description: 'Sharp key-light glint on the shell',
        ui: {type: ['range', 'map'], min: 0, max: 2, step: 0.01, label: 'Highlight', group: 'Highlight'},
    },
    highlightColor: {
        default: '#ffffff',
        transform: transformColor,
        description: 'Color of the key-light highlight',
        ui: {type: 'color', label: 'Highlight Color', group: 'Highlight'},
    },
    highlightSoftness: {
        default: 0.5,
        description: 'Specular highlight softness — lower is a tighter, sharper glint',
        ui: {type: ['range', 'map'], min: 0, max: 1, step: 0.01, label: 'Highlight Softness', group: 'Highlight'},
    },
    fresnel: {
        default: 0.1,
        description: 'Fresnel rim glow — the luminous edge where the shell turns away from view',
        ui: {type: ['range', 'map'], min: 0, max: 1, step: 0.01, label: 'Fresnel', group: 'Fresnel'},
    },
    fresnelSoftness: {
        default: 0.1,
        description: 'Fresnel rim width — higher values spread the glow further inward',
        ui: {type: ['range', 'map'], min: 0, max: 1, step: 0.01, label: 'Fresnel Softness', group: 'Fresnel'},
    },
    fresnelColor: {
        default: '#ffffff',
        transform: transformColor,
        description: 'Color of the fresnel rim glow',
        ui: {type: 'color', label: 'Fresnel Color', group: 'Fresnel'},
    },
    edgeSoftness: {
        default: 0.05,
        description: 'Softness of the shape boundary edge',
        ui: {type: ['range', 'map'], min: 0, max: 1, step: 0.01, label: 'Edge Softness', group: 'Glass'},
    },
}

/**
 * The shared glass-shell optics prop block — one canonical name, label, and shape per
 * control, so every shelled material (Glass, Nebula, future shells) presents the same
 * panel vocabulary. Opt-in menu: pass `true` for the canonical config or a partial
 * override (merged over the canon, `ui` deep-merged) for a shader's own default/range/
 * group/wording. Output keys follow the SPEC's declaration order (prop order is
 * load-bearing), and multiple spreads may interleave shader-specific props between them.
 *
 * Naming canon notes: spectral splitting is `dispersion` (Glass's `aberration` predates
 * the canon and keeps its name for preset compatibility); `thickness` is the optics band
 * depth, not a geometry bevel.
 */
export function glassShellProps<S extends Partial<Record<GlassShellPropName, true | GlassShellOverride>>>(
    spec: S,
): {[K in keyof S]: AnyGlassPropConfig} {
    const out: Record<string, AnyGlassPropConfig> = {}
    for (const key of Object.keys(spec) as GlassShellPropName[]) {
        const override = spec[key]
        if (!override) continue
        const canon = GLASS_SHELL_CANON[key]
        out[key] = override === true
            ? canon
            : {
                ...canon,
                ...override,
                ui: {...canon.ui, ...(override.ui ?? {})} as AnyGlassPropConfig['ui'],
            }
    }
    return out as {[K in keyof S]: AnyGlassPropConfig}
}

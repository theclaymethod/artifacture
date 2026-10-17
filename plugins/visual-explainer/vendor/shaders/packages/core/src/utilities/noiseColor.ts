/**
 * Shared scaffolding for the noise-texture shaders (ValueNoise, PerlinNoise,
 * GaborNoise, …). Every one maps a grayscale noise scalar in [0, 1] to a
 * two-color (or multi-stop) gradient with contrast / balance controls, exactly
 * like the existing SimplexNoise / WorleyNoise textures — so they all share the
 * same color UI and behaviour.
 */
import { transformColor, transformColorSpace, colorSpaceOptions } from './transformations'
import { colorStopsPropConfig } from './colorStops'

/**
 * The color block shared by every noise texture: two base colors, an optional
 * multi-stop override, and the blend color space.
 */
export function noiseColorProps() {
    return {
        colorA: {
            default: '#ffffff',
            description: 'First color',
            transform: transformColor,
            ui: { type: 'color' as const, label: 'Color A', group: 'Colors' }
        },
        colorB: {
            default: '#000000',
            description: 'Second color',
            transform: transformColor,
            ui: { type: 'color' as const, label: 'Color B', group: 'Colors' }
        },
        stops: colorStopsPropConfig(),
        colorSpace: {
            default: 'linear',
            transform: transformColorSpace,
            compileTime: true,
            description: 'Color space for color interpolation',
            ui: { type: 'select' as const, options: colorSpaceOptions, label: 'Color Space', group: 'Colors' }
        }
    }
}

/**
 * A stripped-down color block for textures that only want two flat colors
 * (no multi-stop gradient) — e.g. Scratches.
 */
export function noiseColorPropsAB() {
    return {
        colorA: {
            default: '#ffffff',
            description: 'First color',
            transform: transformColor,
            ui: { type: 'color' as const, label: 'Color A', group: 'Colors' }
        },
        colorB: {
            default: '#000000',
            description: 'Second color',
            transform: transformColor,
            ui: { type: 'color' as const, label: 'Color B', group: 'Colors' }
        }
    }
}

/** Contrast / balance controls shared by the noise textures. */
export function noiseToneProps() {
    return {
        contrast: {
            default: 0,
            description: 'Pattern contrast (higher = sharper transitions)',
            ui: { type: ['range', 'map'] as ('range' | 'map')[], min: -1, max: 5, step: 0.1, label: 'Contrast', group: 'Effect' }
        },
        balance: {
            default: 0,
            description: 'Balance between colors (negative = more colorB, positive = more colorA)',
            ui: { type: ['range', 'map'] as ('range' | 'map')[], min: -1, max: 1, step: 0.05, label: 'Balance', group: 'Effect' }
        },
        seed: {
            default: 0,
            description: 'Random seed for pattern variation',
            ui: { type: 'range' as const, min: 0, max: 100, step: 1, label: 'Seed', group: 'Effect' }
        }
    }
}

/** The speed control shared by the animated noise textures. */
export function noiseSpeedProp(defaultValue = 1) {
    return {
        speed: {
            default: defaultValue,
            description: 'Animation speed',
            ui: { type: 'range' as const, min: 0, max: 5, step: 0.1, label: 'Speed', group: 'Animation' }
        }
    }
}

/**
 * Shared scaffolding for the relief-style noise stylizations (Stone, Wool).
 * Each samples its child layer through a small surface distortion and then
 * modulates the child's brightness by a grayscale height field — like Paper,
 * but driven by the richer noise primitives. Both expose the same prop set
 * (intensity, scale, contrast, distortion, seed); only the height field and
 * defaults differ.
 */
/** The five controls shared by the relief stylizations, with per-shader defaults. */
export function reliefStylizeProps(defaults: { intensity: number; scale: number; contrast: number; distortion: number }) {
    return {
        intensity: {
            default: defaults.intensity,
            description: 'Strength of the relief shading applied to the child content',
            ui: { type: 'range' as const, min: 0, max: 1, step: 0.01, label: 'Intensity', group: 'Texture' }
        },
        scale: {
            default: defaults.scale,
            description: 'Scale of the pattern — lower = larger features, higher = finer grain',
            ui: { type: 'range' as const, min: 0.1, max: 8, step: 0.05, label: 'Scale', group: 'Texture' }
        },
        contrast: {
            default: defaults.contrast,
            description: 'Contrast of the texture — negative flattens it into a subtle overlay',
            ui: { type: 'range' as const, min: -1, max: 2, step: 0.05, label: 'Contrast', group: 'Texture' }
        },
        distortion: {
            default: defaults.distortion,
            description: 'Surface distortion — warps the child along the texture like carved relief',
            ui: { type: 'range' as const, min: 0, max: 1, step: 0.01, label: 'Distortion', group: 'Texture' }
        },
        seed: {
            default: 0,
            description: 'Random seed for pattern variation',
            ui: { type: 'range' as const, min: 0, max: 100, step: 1, label: 'Seed', group: 'Texture' }
        }
    }
}

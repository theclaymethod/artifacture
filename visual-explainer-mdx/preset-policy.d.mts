export const BUILTIN_PRESET_NAMES: readonly ['iso', '3b1b', 'mono-color', 'algebrica', 'mono-industrial', 'custom'];
export type BuiltinPreset = (typeof BUILTIN_PRESET_NAMES)[number];
export const DEFAULT_PRESET: 'iso';
export class PresetPolicyError extends Error {}
export function assertSupportedPreset(name: string): void;

export const BUILTIN_PRESET_NAMES: readonly ['hairline', '3b1b', 'mono-color', 'algebrica', 'mono-industrial', 'custom'];
export type BuiltinPreset = (typeof BUILTIN_PRESET_NAMES)[number];
export const DEFAULT_PRESET: 'hairline';
export class PresetPolicyError extends Error {}
export function assertSupportedPreset(name: string): void;

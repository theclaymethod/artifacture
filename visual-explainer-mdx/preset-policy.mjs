export const BUILTIN_PRESET_NAMES = Object.freeze([
  'iso',
  '3b1b',
  'mono-color',
  'algebrica',
  'mono-industrial',
  'custom',
]);

export const DEFAULT_PRESET = 'iso';

const RETIRED_PRESETS = new Set([
  'hairline',
  'lieflat',
  'oa-design',
  'nothing',
  'blueprint',
  'editorial',
  'paper-ink',
  'terminal',
]);

export class PresetPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PresetPolicyError';
  }
}

// Authored JSON and JSX converge at this browser-safe input boundary.
/* oxlint-disable anti-slop/no-runtime-typeof */
export function assertSupportedPreset(name) {
  if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new PresetPolicyError(`Invalid design-system name "${name}". Use a lowercase slug (letters, digits, hyphens).`);
  }
  if (RETIRED_PRESETS.has(name)) {
    const detail = name === 'lieflat' ? ' Lieflat chart encodings remain available in every kept theme.' : '';
    throw new PresetPolicyError(`Preset "${name}" is retired. Migrate to "iso", "3b1b", "mono-color", or "algebrica".${detail}`);
  }
}
/* oxlint-enable anti-slop/no-runtime-typeof */

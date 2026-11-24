import type { ShaderSource } from 'vgpu';
import type { GpuParamValue, GpuSceneParams } from './types.ts';

export interface UniformBindingInfo {
  readonly bindingName: string;
  readonly members: ReadonlySet<string>;
}

/**
 * Inspect reflected uniform buffer bindings on a prepared vgpu `ShaderSource`.
 * Only members present in the WGSL uniform struct are forwarded to `effect.set()`,
 * preventing runtime binding-mismatch errors when shaders declare different uniform subsets.
 */
export function inspectUniformBindings(source: ShaderSource): readonly UniformBindingInfo[] {
  const out: UniformBindingInfo[] = [];
  const reflection = source.reflection as {
    bindings?: ReadonlyArray<{
      kind?: string;
      addressSpace?: string;
      name?: string;
      struct?: { members?: ReadonlyArray<{ name?: string }> };
    }>;
  };
  for (const binding of reflection?.bindings ?? []) {
    if (binding.kind !== 'buffer' || binding.addressSpace !== 'uniform' || !binding.name) continue;
    const members = new Set<string>();
    for (const m of binding.struct?.members ?? []) {
      if (m.name) members.add(m.name);
    }
    if (members.size > 0) {
      out.push({ bindingName: binding.name, members });
    }
  }
  return out;
}

export function buildEffectSetBag(
  bindings: readonly UniformBindingInfo[],
  params: GpuSceneParams,
  timeSeconds: number,
  size: readonly [number, number],
): Record<string, Record<string, GpuParamValue>> {
  const bag: Record<string, Record<string, GpuParamValue>> = {};
  const texel: readonly [number, number] = [
    size[0] > 0 ? 1 / size[0] : 0,
    size[1] > 0 ? 1 / size[1] : 0,
  ];
  for (const binding of bindings) {
    const structValues: Record<string, GpuParamValue> = {};
    for (const member of binding.members) {
      if (member.startsWith('_pad')) {
        structValues[member] = 0;
      } else if (member === 'time') {
        structValues[member] = timeSeconds;
      } else if (member === 'resolution') {
        structValues[member] = [size[0], size[1]];
      } else if (member === 'texel') {
        structValues[member] = texel;
      } else if (member in params) {
        structValues[member] = params[member];
      }
    }
    if (Object.keys(structValues).length > 0) {
      bag[binding.bindingName] = structValues;
    }
  }
  return bag;
}

/** Cubic bezier easing matching open-slide's MorphElement curve: cubic-bezier(0.22, 1, 0.36, 1). */
export function easeOutQuintic(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return 1 - (1 - x) ** 4;
}

export function lerpParamValue(a: GpuParamValue, b: GpuParamValue, t: number): GpuParamValue {
  if (typeof a === 'number' && typeof b === 'number') {
    return a + (b - a) * t;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.map((av, idx) => av + ((b[idx] as number) - av) * t);
  }
  return b;
}

export function lerpParams<TParams extends GpuSceneParams>(
  from: TParams,
  to: TParams,
  t: number,
): TParams {
  const out: Record<string, GpuParamValue> = {};
  for (const key of Object.keys(to)) {
    const targetVal = to[key];
    const startVal = from[key];
    out[key] = startVal !== undefined ? lerpParamValue(startVal, targetVal, t) : targetVal;
  }
  return out as TParams;
}

export function cloneParams<TParams extends GpuSceneParams>(params: TParams): TParams {
  const out: Record<string, GpuParamValue> = {};
  for (const [key, value] of Object.entries(params)) {
    out[key] = Array.isArray(value) ? [...value] : value;
  }
  return out as TParams;
}

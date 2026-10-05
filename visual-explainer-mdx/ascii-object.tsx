import React from 'react';
import type { AsciiFrameOptions } from './ascii-frame';
import { ModelView } from './model-view';

export type AsciiModel = Readonly<{ kind: 'gltf'; src: string }> | Readonly<{ kind: 'geometry'; geometry: 'torus-knot' | 'icosahedron' | 'blocks' }>;
export type AsciiObjectProps = AsciiFrameOptions & Readonly<{
  model: AsciiModel; seconds: number; label: string; width?: number; height?: number; ascii?: boolean; rotationSpeed?: number; className?: string;
}>;

/** Existing ramp rendering, backed by the same source owner as ModelView. */
export function AsciiObject({ model, seconds, label, width = 960, height = 540, ascii = true, rotationSpeed = 0.35, className, palette, ...options }: AsciiObjectProps) {
  const common = { source: model, seconds, label, width, height, rotationSpeed, className, palette };
  return ascii
    ? <ModelView {...common} treatment="luminance-ascii" luminance={{ ...options, invert: options.invert ?? true }} />
    : <ModelView {...common} treatment="shaded" />;
}

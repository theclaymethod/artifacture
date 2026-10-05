import type { Material, Object3D } from 'three';
import type { AsciiFrameOptions, AsciiPalette } from './ascii-frame';
import type { EffectImage, EffectSource } from './media-source';

export type ModelPaint = Readonly<{ material: Material; role: 'ink' | 'accent' }>;
export type ModelAsset = Readonly<{
  root: Object3D;
  sample?: (seconds: number) => void;
  paint?: readonly ModelPaint[];
  image?: EffectImage;
  dispose: () => void;
}>;
export type ModelFactory = (context: Readonly<{ signal: AbortSignal }>) => ModelAsset | Promise<ModelAsset>;
export type ModelSource = ModelFactory
  | Readonly<{ kind: 'gltf'; src: string }>
  | Readonly<{ kind: 'geometry'; geometry: 'torus-knot' | 'icosahedron' | 'blocks' }>
  | Readonly<{ kind: 'image'; image: EffectSource }>;
export type GlyphMatcherSettings = Readonly<{
  cellSize?: number;
  glyphs?: string;
  font?: string;
  exposure?: number;
  gamma?: number;
  globalContrast?: number;
  directionalContrast?: number;
  invert?: boolean;
  sourceChroma?: number;
  sourceReveal?: number;
  transparent?: boolean;
}>;
export type ParticleSettings = Readonly<{ count?: number; seed?: number; pointSize?: number; spread?: number }>;
export type ModelTreatment =
  | Readonly<{ treatment: 'shaded' }>
  | Readonly<{ treatment: 'shape-ascii'; ascii?: GlyphMatcherSettings }>
  | Readonly<{ treatment: 'luminance-ascii'; luminance?: Omit<AsciiFrameOptions, 'palette'> }>
  | Readonly<{ treatment: 'particles'; particles?: ParticleSettings }>;
export type ModelFrame = ModelTreatment & Readonly<{ seconds: number; palette: AsciiPalette; rotationSpeed?: number }>;
export type ModelFrameReport = Readonly<{
  seconds: number;
  backend: 'webgl';
  treatment: ModelTreatment['treatment'];
  matcher?: 'six-region-euclidean';
  glyphCount?: number;
}>;
export type ModelViewOptions = Readonly<{ source: ModelSource; width?: number; height?: number }>;
export type ModelViewController = Readonly<{
  draw: (frame: ModelFrame) => Promise<ModelFrameReport>;
  dispose: () => Promise<void>;
}>;

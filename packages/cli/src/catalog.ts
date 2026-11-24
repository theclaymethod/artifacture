import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  blindsGlassScene,
  gaussianSplatScene,
  liquidPrismScene,
  mirrorCityScene,
  splatFxScene,
} from '@artifacture/gpu/scenes';
import { KIT_CATALOG, type KitBlockEntry } from '@artifacture/kit';
import { ARTIFACTURE_THEMES, type ThemeSpec } from '@artifacture/themes';

export interface GpuSceneCatalogEntry {
  readonly id: string;
  readonly label: string;
  readonly importPath: string;
  readonly params: readonly string[];
  readonly stillSize: readonly [number, number];
}

export interface TemplateCatalogEntry {
  readonly id: 'slides' | 'explainer' | 'video';
  readonly host: string;
  readonly summary: string;
}

export const GPU_SCENE_CATALOG: readonly GpuSceneCatalogEntry[] = [
  {
    id: liquidPrismScene.id,
    label: liquidPrismScene.label,
    importPath: '@artifacture/gpu/scenes',
    params: Object.keys(liquidPrismScene.defaultParams),
    stillSize: liquidPrismScene.stillSize ?? [1920, 1080],
  },
  {
    id: blindsGlassScene.id,
    label: blindsGlassScene.label,
    importPath: '@artifacture/gpu/scenes',
    params: Object.keys(blindsGlassScene.defaultParams),
    stillSize: blindsGlassScene.stillSize ?? [1920, 1080],
  },
  {
    id: gaussianSplatScene.id,
    label: gaussianSplatScene.label,
    importPath: '@artifacture/gpu/scenes',
    params: Object.keys(gaussianSplatScene.defaultParams),
    stillSize: gaussianSplatScene.stillSize ?? [1280, 720],
  },
  {
    id: mirrorCityScene.id,
    label: mirrorCityScene.label,
    importPath: '@artifacture/gpu/scenes',
    params: Object.keys(mirrorCityScene.defaultParams),
    stillSize: mirrorCityScene.stillSize ?? [1280, 720],
  },
  {
    id: splatFxScene.id,
    label: splatFxScene.label,
    importPath: '@artifacture/gpu/scenes',
    params: Object.keys(splatFxScene.defaultParams),
    stillSize: splatFxScene.stillSize ?? [1280, 720],
  },
];

export const TEMPLATE_CATALOG: readonly TemplateCatalogEntry[] = [
  {
    id: 'slides',
    host: '@open-slide/core',
    summary:
      'Stock open-slide deck with GpuMorphCanvas transitions, Dawn stills, LieflatChart, DiagramCanvas, and DrillSheet.',
  },
  {
    id: 'explainer',
    host: 'Vite 8 + MDX + Tailwind v4',
    summary:
      'Technical article with direct .wgsl imports via @vgpu/wgsl/loader-vite, interactive blocks, and singlefile build.',
  },
  {
    id: 'video',
    host: 'HyperFrames + Dawn',
    summary:
      'Seek-deterministic composition driven by __seek(seconds) and Dawn sequence parity checks.',
  },
];

/**
 * Resolves the root directory of the `artifacture` CLI package regardless of src/ or dist/ execution.
 */
export async function resolveCliPackageRoot(): Promise<string> {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const pkgPath = path.join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { name?: string };
      if (pkg.name === 'artifacture') {
        return dir;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not locate packages/cli package.json.');
}

export function getFullCatalog(): {
  blocks: readonly KitBlockEntry[];
  scenes: readonly GpuSceneCatalogEntry[];
  themes: readonly ThemeSpec[];
  templates: readonly TemplateCatalogEntry[];
} {
  return {
    blocks: KIT_CATALOG,
    scenes: GPU_SCENE_CATALOG,
    themes: Object.values(ARTIFACTURE_THEMES),
    templates: TEMPLATE_CATALOG,
  };
}

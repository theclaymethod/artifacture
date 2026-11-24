import {
  type Compute,
  compute,
  type Draw,
  draw,
  type Effect,
  effect,
  type Frame,
  frame,
  type Gpu,
  type ShaderSource,
  type StorageBuffer,
  storage,
  type Target,
} from 'vgpu';
import type { GpuSceneController, GpuSceneDefinition } from '../types.ts';
import projectShader from './mirror-city-project.wgsl.ts';
import renderShader from './mirror-city-render.wgsl.ts';
import skyShader from './mirror-city-sky.wgsl.ts';
import sortShader from './mirror-city-sort.wgsl.ts';
import { loadSplatSource } from './splat-loader.ts';

export const CITY_SPLAT_COUNT = 262144;
const DEFAULT_FALLBACK_COUNT = 4096;
const WORKGROUP_SIZE = 256;

export type MirrorCityParams = {
  foldStreet: number;
  kaleidoscope: number;
  fractureLift: number;
  tunnelWrap: number;
  fractalSplit: number;
  daylight: number;
  camX: number;
  camY: number;
  camZ: number;
  camYaw: number;
  camPitch: number;
  camRoll: number;
  fov: number;
  offsetX: number;
  splatScale: number;
  flySpeed: number;
};

export interface MirrorCitySceneOptions {
  readonly id?: string;
  readonly label?: string;
  readonly splatSource?: string | ArrayBuffer | Uint8Array;
  readonly splatCount?: number;
}

function normalizePow2Count(value: number): number {
  const clamped = Math.max(512, Math.round(value));
  let p = 512;
  while (p < clamped && p < 1 << 20) {
    p <<= 1;
  }
  return p;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashBlock(bx: number, bz: number): number {
  const n = Math.sin(bx * 127.1 + bz * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Compact built-in fallback daytime city in `RealSplatSeed` layout (4,096 splats)
 * for unit tests and lightweight CLI inspection when no external `.splat` file is supplied.
 */
function buildFallbackCityData(targetCount: number): Float32Array<ArrayBuffer> {
  const data = new Float32Array(new ArrayBuffer(targetCount * 16 * 4));
  const rand = mulberry32(0x4e59_2026);
  let count = 0;

  const push = (
    x: number,
    y: number,
    z: number,
    alpha: number,
    sx: number,
    sy: number,
    sz: number,
    r: number,
    g: number,
    b: number,
  ) => {
    if (count >= targetCount) return;
    const base = count * 16;
    const bx = Math.floor(x / 10.5);
    const bz = Math.floor(z / 10.5);
    data[base + 0] = x;
    data[base + 1] = y;
    data[base + 2] = z;
    data[base + 3] = alpha;
    data[base + 4] = sx;
    data[base + 5] = sy;
    data[base + 6] = sz;
    data[base + 7] = hashBlock(bx, bz);
    data[base + 8] = 0;
    data[base + 9] = 0;
    data[base + 10] = 0;
    data[base + 11] = 1;
    data[base + 12] = r;
    data[base + 13] = g;
    data[base + 14] = b;
    data[base + 15] = Math.max(0, Math.min(1, y / 28));
    count++;
  };

  for (let gz = 0; gz < 40; gz++) {
    const z = -42 + gz * 1.4;
    for (let gx = 0; gx < 12; gx++) {
      const x = -7 + gx * 1.25;
      const isSidewalk = Math.abs(x) > 4.2;
      const v = isSidewalk ? 0.62 : 0.28;
      push(x, isSidewalk ? 0.12 : 0.0, z, 0.96, 0.65, 0.08, 0.72, v, v * 0.99, v * 1.02);
    }
  }

  const palettes: Array<readonly [number, number, number]> = [
    [0.68, 0.65, 0.6],
    [0.34, 0.46, 0.62],
    [0.58, 0.38, 0.3],
    [0.6, 0.56, 0.5],
  ];
  let bIdx = 0;
  while (count < targetCount) {
    const side = bIdx % 2 === 0 ? -1 : 1;
    const row = Math.floor(bIdx / 2) % 8;
    const cz = 4 - row * 7.2;
    const cx = side * (9.5 + (bIdx % 3) * 4.5);
    const col = palettes[bIdx % palettes.length];
    const h = 8 + (bIdx % 5) * 4.2;
    for (let k = 0; k < 120 && count < targetCount; k++) {
      const px = cx + (rand() - 0.5) * 7.5;
      const py = rand() * h;
      const pz = cz + (rand() - 0.5) * 6.0;
      const win = ((Math.floor(py * 1.4) + Math.floor(px + pz)) & 1) === 1;
      push(
        px,
        py,
        pz,
        0.94,
        0.52,
        0.55,
        0.52,
        win ? col[0] * 0.45 : col[0],
        win ? col[1] * 0.55 : col[1],
        win ? Math.min(1, col[2] * 0.78) : col[2],
      );
    }
    bIdx++;
  }

  return data;
}

const fallbackCache = new Map<number, Float32Array<ArrayBuffer>>();
function getFallbackCityData(count: number): Float32Array<ArrayBuffer> {
  let cached = fallbackCache.get(count);
  if (!cached) {
    cached = buildFallbackCityData(count);
    fallbackCache.set(count, cached);
  }
  return cached;
}

function createMirrorCityController(
  gpu: Gpu,
  splatCount: number,
  loadSeeds?: () => Promise<Float32Array<ArrayBuffer>>,
): GpuSceneController<MirrorCityParams> {
  const projectWorkgroups = splatCount / WORKGROUP_SIZE;
  const tileWorkgroups = splatCount / (WORKGROUP_SIZE * 2);

  const seedBuf: StorageBuffer = storage(gpu, splatCount * 16 * 4, 'read');
  if (!loadSeeds) {
    seedBuf.write(getFallbackCityData(splatCount));
  }

  // ProjectedSplat is 3 x vec4f = 12 floats (48 bytes) per splat
  const projBuf: StorageBuffer = storage(gpu, splatCount * 12 * 4, 'read-write');
  const sortKeysBuf: StorageBuffer = storage(gpu, splatCount * 4, 'read-write');
  const sortIndicesBuf: StorageBuffer = storage(gpu, splatCount * 4, 'read-write');

  const projectCompute: Compute = compute(gpu, projectShader as ShaderSource, {
    label: 'mirror-city.project',
    entry: 'cs_project',
  });
  const localSortCompute: Compute = compute(gpu, sortShader as ShaderSource, {
    label: 'mirror-city.local-sort',
    entry: 'cs_local_sort',
  });
  const globalStepCompute: Compute = compute(gpu, sortShader as ShaderSource, {
    label: 'mirror-city.global-step',
    entry: 'cs_global_step',
  });
  const localMergeCompute: Compute = compute(gpu, sortShader as ShaderSource, {
    label: 'mirror-city.local-merge',
    entry: 'cs_local_merge',
  });

  const skyEffect: Effect = effect(gpu, skyShader as ShaderSource, {
    label: 'mirror-city.sky',
  });
  const splatDraw: Draw = draw(gpu, {
    shader: renderShader as ShaderSource,
    vertices: 6,
    instances: splatCount,
    blend: 'premultiplied',
    depth: false,
    label: 'mirror-city.splat-draw',
  });

  return {
    async compile(compileTarget: Target) {
      const [loadedSeeds] = await Promise.all([
        loadSeeds ? loadSeeds() : Promise.resolve(null),
        projectCompute.compile(),
        localSortCompute.compile(),
        globalStepCompute.compile(),
        localMergeCompute.compile(),
        skyEffect.compile(compileTarget),
        splatDraw.compile(compileTarget),
      ]);
      if (loadedSeeds) {
        seedBuf.write(loadedSeeds);
      }
    },
    renderAt(
      timeSeconds: number,
      params: MirrorCityParams,
      renderTarget: Target,
      activeFrame?: Frame,
    ) {
      const rw = Math.max(1, Math.round(renderTarget.size[0]));
      const rh = Math.max(1, Math.round(renderTarget.size[1]));

      projectCompute.set({
        params: {
          time: timeSeconds,
          foldStreet: params.foldStreet,
          kaleidoscope: params.kaleidoscope,
          fractureLift: params.fractureLift,
          tunnelWrap: params.tunnelWrap,
          fractalSplit: params.fractalSplit,
          daylight: params.daylight,
          camX: params.camX,
          camY: params.camY,
          camZ: params.camZ,
          camYaw: params.camYaw,
          camPitch: params.camPitch,
          camRoll: params.camRoll,
          fov: params.fov,
          offsetX: params.offsetX,
          splatScale: params.splatScale,
          flySpeed: params.flySpeed,
          _pad0: 0,
          resolution: [rw, rh],
        },
        seeds: seedBuf,
        projected: projBuf,
        sortKeys: sortKeysBuf,
        sortIndices: sortIndicesBuf,
      });

      localSortCompute.set({
        sortParams: { k: 512, j: 256, _pad0: 0, _pad1: 0 },
        keys: sortKeysBuf,
        indices: sortIndicesBuf,
      });
      globalStepCompute.set({
        sortParams: { k: 1024, j: 512, _pad0: 0, _pad1: 0 },
        keys: sortKeysBuf,
        indices: sortIndicesBuf,
      });
      localMergeCompute.set({
        sortParams: { k: 1024, j: 256, _pad0: 0, _pad1: 0 },
        keys: sortKeysBuf,
        indices: sortIndicesBuf,
      });

      skyEffect.set({
        params: {
          time: timeSeconds,
          foldStreet: params.foldStreet,
          tunnelWrap: params.tunnelWrap,
          kaleidoscope: params.kaleidoscope,
          daylight: params.daylight,
          fractalSplit: params.fractalSplit,
          resolution: [rw, rh],
        },
      });

      splatDraw.set({
        params: {
          resolution: [rw, rh],
          _pad0: [0, 0],
        },
        projected: projBuf,
        sortedIndices: sortIndicesBuf,
      });

      const encode = (f: Frame) => {
        f.computePass((pass) => {
          pass.dispatch(projectCompute, projectWorkgroups);
          pass.dispatch(localSortCompute, tileWorkgroups);
          for (let k = 1024; k <= splatCount; k <<= 1) {
            for (let j = k >> 1; j >= 512; j >>= 1) {
              globalStepCompute.set({
                sortParams: { k, j, _pad0: 0, _pad1: 0 },
              });
              pass.dispatch(globalStepCompute, tileWorkgroups);
            }
            localMergeCompute.set({
              sortParams: { k, j: 256, _pad0: 0, _pad1: 0 },
            });
            pass.dispatch(localMergeCompute, tileWorkgroups);
          }
        });
        f.pass({ target: renderTarget, clear: true }, (pass) => {
          pass.draw(skyEffect);
          pass.draw(splatDraw);
        });
      };

      if (activeFrame) {
        encode(activeFrame);
      } else {
        frame(gpu, encode);
      }
    },
    dispose() {
      splatDraw.dispose();
      skyEffect.dispose();
      localMergeCompute.dispose();
      globalStepCompute.dispose();
      localSortCompute.dispose();
      projectCompute.dispose();
      (sortIndicesBuf as StorageBuffer & { destroy?: () => void }).destroy?.();
      (sortKeysBuf as StorageBuffer & { destroy?: () => void }).destroy?.();
      (projBuf as StorageBuffer & { destroy?: () => void }).destroy?.();
      (seedBuf as StorageBuffer & { destroy?: () => void }).destroy?.();
    },
  };
}

/**
 * Create a Mirror Dimension 3D Gaussian Splat scene backed by a real captured `.splat` / `.splat.gz`
 * asset or the lightweight built-in city fallback.
 */
export function createMirrorCityScene(
  options: MirrorCitySceneOptions = {},
): GpuSceneDefinition<MirrorCityParams> {
  const splatCount = normalizePow2Count(
    options.splatCount ?? (options.splatSource ? CITY_SPLAT_COUNT : DEFAULT_FALLBACK_COUNT),
  );
  const splatSource = options.splatSource;
  let cachedPromise: Promise<Float32Array<ArrayBuffer>> | null = null;
  const loadSeeds =
    splatSource !== undefined
      ? () => {
          if (!cachedPromise) {
            cachedPromise = loadSplatSource(splatSource, splatCount);
          }
          return cachedPromise;
        }
      : undefined;

  return {
    id: options.id ?? 'mirror-city',
    label:
      options.label ??
      'Real captured 3D Gaussian-splatted NYC cityscape with Mirror Dimension fractal splits',
    shader: skyShader as ShaderSource,
    stillTime: 1.2,
    stillSize: [1280, 720],
    clearColor: [0.46, 0.72, 0.96, 1.0],
    defaultParams: {
      foldStreet: 0.0,
      kaleidoscope: 0.0,
      fractureLift: 0.0,
      tunnelWrap: 0.0,
      fractalSplit: 0.0,
      daylight: 1.0,
      camX: 0.0,
      camY: 16.0,
      camZ: 34.0,
      camYaw: 0.0,
      camPitch: -0.24,
      camRoll: 0.0,
      fov: 0.96,
      offsetX: 0.14,
      splatScale: 1.0,
      flySpeed: 1.0,
    },
    setup: (gpu) => createMirrorCityController(gpu, splatCount, loadSeeds),
  };
}

export const mirrorCityScene: GpuSceneDefinition<MirrorCityParams> = createMirrorCityScene();

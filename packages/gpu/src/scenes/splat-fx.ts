import {
  type Compute,
  compute,
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
import renderShader from './mirror-city-render.wgsl.ts';
import sortShader from './mirror-city-sort.wgsl.ts';
import bgShader from './splat-fx-bg.wgsl.ts';
import projectShader from './splat-fx-project.wgsl.ts';
import { loadSplatSource } from './splat-loader.ts';

export const SPLAT_FX_COUNT = 262144;
const DEFAULT_PROCEDURAL_FX_COUNT = 4096;

export type SplatFxParams = {
  monochrome: number;
  pointMix: number;
  shockMix: number;
  shockSpeed: number;
  dissolveAmt: number;
  curlStrength: number;
  geoWave: number;
  shatterAmt: number;
  neonHdr: number;
  camDist: number;
  camYaw: number;
  camPitch: number;
  camRoll: number;
  focusY: number;
  fov: number;
  offsetX: number;
  splatScale: number;
  orbitSpeed: number;
  exposure: number;
};

export type SplatFxSceneOptions = {
  id?: string;
  label?: string;
  /** Optional `.splat` / `.splat.gz` URL or binary payload; omit for procedural forest stump fallback. */
  source?: string | ArrayBuffer | Uint8Array;
  /** Power-of-two Gaussian count divisible by 512 (default 262144 with `source`, 4096 procedural). */
  splatCount?: number;
  defaultParams?: Partial<SplatFxParams>;
};

const DEFAULT_FX_PARAMS: SplatFxParams = {
  monochrome: 1.0,
  pointMix: 0.84,
  shockMix: 1.0,
  shockSpeed: 1.15,
  dissolveAmt: 0.0,
  curlStrength: 1.0,
  geoWave: 0.0,
  shatterAmt: 0.0,
  neonHdr: 0.0,
  camDist: 8.6,
  camYaw: 0.35,
  camPitch: 0.32,
  camRoll: 0.0,
  focusY: 1.05,
  fov: 0.92,
  offsetX: 0.2,
  splatScale: 1.0,
  orbitSpeed: 0.14,
  exposure: 1.14,
};

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates deterministic 16-float (`64` byte) fallback `RealSplatSeed` records representing a
 * textured tree stump, mossy boulders, and forest perimeter when no `.splat` binary source is given.
 */
function buildProceduralForestSeeds(count: number): Float32Array<ArrayBuffer> {
  const data = new Float32Array(new ArrayBuffer(count * 16 * 4));
  const rand = mulberry32(0x5f41_7026);

  for (let i = 0; i < count; i++) {
    const base = i * 16;
    const u = i / count;
    let x = 0;
    let y = 0;
    let z = 0;
    let sx = 0.04;
    let sy = 0.04;
    let sz = 0.04;
    let r = 0.55;
    let g = 0.48;
    let b = 0.38;
    const opacity = 0.88;

    if (u < 0.38) {
      // Hero gnarled tree stump with flaring buttress roots
      const hFrac = rand();
      const angle = rand() * Math.PI * 2;
      const rootFlare = (1.0 - hFrac) ** 2.1 * (0.45 + 0.32 * Math.cos(angle * 5.0));
      const radius = 0.38 + rootFlare + (rand() - 0.5) * 0.07;
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
      y = hFrac * 1.9;
      sx = 0.042 + rand() * 0.025;
      sy = 0.055 + rand() * 0.03;
      sz = 0.042 + rand() * 0.025;
      const moss = 0.5 + 0.5 * Math.sin(angle * 3.0 + hFrac * 5.0);
      r = 0.42 + moss * 0.08;
      g = 0.36 + moss * 0.22;
      b = 0.25 + moss * 0.05;
    } else if (u < 0.72) {
      // Forest floor leaf litter and moss patches
      const angle = rand() * Math.PI * 2;
      const rad = 0.45 + Math.sqrt(rand()) * 4.8;
      x = Math.cos(angle) * rad;
      z = Math.sin(angle) * rad;
      y = (rand() - 0.5) * 0.14 + Math.sin(rad * 1.3 + angle) * 0.08;
      sx = 0.055 + rand() * 0.035;
      sy = 0.018 + rand() * 0.012;
      sz = 0.055 + rand() * 0.035;
      const tone = 0.35 + rand() * 0.4;
      r = tone * 0.62;
      g = tone * 0.76;
      b = tone * 0.42;
    } else {
      // Surrounding pine & canopy silhouettes in outer ring
      const treeIdx = i % 10;
      const treeAngle = (treeIdx / 10) * Math.PI * 2 + 0.22;
      const treeRad = 3.2 + (treeIdx % 3) * 0.9;
      const cx = Math.cos(treeAngle) * treeRad;
      const cz = Math.sin(treeAngle) * treeRad;
      const h = rand() * 4.6;
      const limbSpread = h > 1.8 ? 0.25 + ((h - 1.8) / 2.8) * 1.1 : 0.18;
      const phi = rand() * Math.PI * 2;
      const lr = Math.sqrt(rand()) * limbSpread;
      x = cx + Math.cos(phi) * lr;
      z = cz + Math.sin(phi) * lr;
      y = h;
      sx = 0.06 + rand() * 0.05;
      sy = 0.055 + rand() * 0.045;
      sz = 0.06 + rand() * 0.05;
      const canopyMix = h > 1.8 ? 1.0 : 0.25;
      r = 0.22 + (1.0 - canopyMix) * 0.25;
      g = 0.34 + canopyMix * 0.24;
      b = 0.18 + canopyMix * 0.08;
    }

    data[base + 0] = x;
    data[base + 1] = y;
    data[base + 2] = z;
    data[base + 3] = opacity;

    data[base + 4] = sx;
    data[base + 5] = sy;
    data[base + 6] = sz;
    data[base + 7] = rand();

    data[base + 8] = 0;
    data[base + 9] = 0;
    data[base + 10] = 0;
    data[base + 11] = 1;

    data[base + 12] = r;
    data[base + 13] = g;
    data[base + 14] = b;
    data[base + 15] = Math.min(1, Math.max(0, (y + 0.5) / 6.0));
  }

  return data;
}

function resolveSplatCount(requested: number | undefined, hasSource: boolean): number {
  const rawCount = requested ?? (hasSource ? SPLAT_FX_COUNT : DEFAULT_PROCEDURAL_FX_COUNT);
  const clamped = Math.max(512, Math.floor(rawCount));
  const pow2 = 1 << Math.ceil(Math.log2(clamped));
  return Math.max(512, pow2);
}

/**
 * Creates a reusable particle-manipulation 3DGS scene supporting monochrome LiDAR spherical
 * shockwaves, curl-noise smoke/sand dissolution, HDR neon drift, and concentric geometric waves.
 */
export function createSplatFxScene(
  options: SplatFxSceneOptions = {},
): GpuSceneDefinition<SplatFxParams> {
  const splatCount = resolveSplatCount(options.splatCount, options.source !== undefined);
  const defaultParams: SplatFxParams = {
    ...DEFAULT_FX_PARAMS,
    ...options.defaultParams,
  };
  const fallbackData = options.source === undefined ? buildProceduralForestSeeds(splatCount) : null;

  return {
    id: options.id ?? 'splat-fx',
    label:
      options.label ??
      'Interactive 3DGS particle FX: LiDAR shockwave, curl-smoke dissolve, HDR neon, geometric wave',
    shader: projectShader as ShaderSource,
    stillTime: 1.6,
    stillSize: [1280, 720],
    clearColor: [0.0, 0.0, 0.0, 1.0],
    defaultParams,
    setup(gpu: Gpu, initialTarget: Target): GpuSceneController<SplatFxParams> {
      const wgCount = Math.max(1, splatCount / 512);
      const projWgCount = Math.max(1, Math.ceil(splatCount / 256));

      const seedBuffer: StorageBuffer = storage(gpu, splatCount * 16 * 4, 'read');
      const projectedBuffer: StorageBuffer = storage(gpu, splatCount * 12 * 4, 'read-write');
      const keysBuffer: StorageBuffer = storage(gpu, splatCount * 4, 'read-write');
      const indicesBuffer: StorageBuffer = storage(gpu, splatCount * 4, 'read-write');

      let seedPromise: Promise<void> | null = null;
      if (fallbackData) {
        seedBuffer.write(fallbackData);
      } else if (options.source !== undefined) {
        seedPromise = loadSplatSource(options.source, splatCount).then((loaded) => {
          seedBuffer.write(loaded);
        });
      }

      const bgEffect: Effect = effect(gpu, bgShader as ShaderSource, {
        label: 'splat-fx.bg',
      });

      const projectCompute: Compute = compute(gpu, projectShader as ShaderSource, {
        entry: 'cs_project',
        label: 'splat-fx.project',
      });
      projectCompute.set({
        seeds: seedBuffer,
        projected: projectedBuffer,
        sortKeys: keysBuffer,
        sortIndices: indicesBuffer,
      });

      const localSortCompute: Compute = compute(gpu, sortShader as ShaderSource, {
        entry: 'cs_local_sort',
        label: 'splat-fx.sort-local',
      });
      localSortCompute.set({
        keys: keysBuffer,
        indices: indicesBuffer,
      });

      const sortPasses: Compute[] = [];
      for (let k = 1024; k <= splatCount; k <<= 1) {
        for (let j = k >> 1; j >= 512; j >>= 1) {
          const stepCompute = compute(gpu, sortShader as ShaderSource, {
            entry: 'cs_global_step',
            label: `splat-fx.sort-global-${k}-${j}`,
          });
          stepCompute.set({
            sortParams: { k, j, _pad0: 0, _pad1: 0 },
            keys: keysBuffer,
            indices: indicesBuffer,
          });
          sortPasses.push(stepCompute);
        }
        const mergeCompute = compute(gpu, sortShader as ShaderSource, {
          entry: 'cs_local_merge',
          label: `splat-fx.sort-merge-${k}`,
        });
        mergeCompute.set({
          sortParams: { k, j: 256, _pad0: 0, _pad1: 0 },
          keys: keysBuffer,
          indices: indicesBuffer,
        });
        sortPasses.push(mergeCompute);
      }

      const splatDraw = draw(gpu, {
        shader: renderShader as ShaderSource,
        vertices: 6,
        instances: splatCount,
        blend: 'premultiplied',
        depth: false,
        label: 'splat-fx.render',
      });
      splatDraw.set({
        projected: projectedBuffer,
        sortedIndices: indicesBuffer,
      });

      const initW = Math.max(1, Math.round(initialTarget.size[0]));
      const initH = Math.max(1, Math.round(initialTarget.size[1]));
      bgEffect.set({
        params: {
          time: 0,
          shockMix: defaultParams.shockMix,
          dissolveAmt: defaultParams.dissolveAmt,
          neonHdr: defaultParams.neonHdr,
          resolution: [initW, initH],
          _pad0: [0, 0],
        },
      });
      splatDraw.set({
        params: {
          resolution: [initW, initH],
          _pad0: [0, 0],
        },
      });

      return {
        async compile(compileTarget: Target) {
          await Promise.all([
            seedPromise ?? Promise.resolve(),
            bgEffect.compile(compileTarget),
            projectCompute.compile(),
            localSortCompute.compile(),
            ...sortPasses.map((pass) => pass.compile()),
            splatDraw.compile(compileTarget),
          ]);
        },
        resize() {},
        renderAt(
          timeSeconds: number,
          params: SplatFxParams,
          renderTarget: Target,
          activeFrame?: Frame,
        ) {
          const rw = Math.max(1, Math.round(renderTarget.size[0]));
          const rh = Math.max(1, Math.round(renderTarget.size[1]));

          bgEffect.set({
            params: {
              time: timeSeconds,
              shockMix: params.shockMix,
              dissolveAmt: params.dissolveAmt,
              neonHdr: params.neonHdr,
              resolution: [rw, rh],
              _pad0: [0, 0],
            },
          });

          projectCompute.set({
            params: {
              time: timeSeconds,
              monochrome: params.monochrome,
              pointMix: params.pointMix,
              shockMix: params.shockMix,
              shockSpeed: params.shockSpeed,
              dissolveAmt: params.dissolveAmt,
              curlStrength: params.curlStrength,
              geoWave: params.geoWave,
              shatterAmt: params.shatterAmt,
              neonHdr: params.neonHdr,
              camDist: params.camDist,
              camYaw: params.camYaw,
              camPitch: params.camPitch,
              camRoll: params.camRoll,
              focusY: params.focusY,
              fov: params.fov,
              offsetX: params.offsetX,
              splatScale: params.splatScale,
              orbitSpeed: params.orbitSpeed,
              exposure: params.exposure,
              resolution: [rw, rh],
              _pad0: [0, 0],
            },
          });

          splatDraw.set({
            params: {
              resolution: [rw, rh],
              _pad0: [0, 0],
            },
          });

          const encode = (f: Frame) => {
            f.computePass((pass) => {
              pass.dispatch(projectCompute, projWgCount);
            });
            f.computePass((pass) => {
              pass.dispatch(localSortCompute, wgCount);
            });
            for (const stepPass of sortPasses) {
              f.computePass((pass) => {
                pass.dispatch(stepPass, wgCount);
              });
            }
            f.pass({ target: renderTarget, clear: [0, 0, 0, 1] }, bgEffect);
            f.pass({ target: renderTarget, clear: false }, splatDraw);
          };

          if (activeFrame) {
            encode(activeFrame);
          } else {
            frame(gpu, encode);
          }
        },
        dispose() {
          bgEffect.dispose();
          projectCompute.dispose();
          localSortCompute.dispose();
          for (const stepPass of sortPasses) {
            stepPass.dispose();
          }
          splatDraw.dispose();
          (seedBuffer as StorageBuffer & { destroy?: () => void }).destroy?.();
          (projectedBuffer as StorageBuffer & { destroy?: () => void }).destroy?.();
          (keysBuffer as StorageBuffer & { destroy?: () => void }).destroy?.();
          (indicesBuffer as StorageBuffer & { destroy?: () => void }).destroy?.();
        },
      };
    },
  };
}

export const splatFxScene: GpuSceneDefinition<SplatFxParams> = createSplatFxScene();

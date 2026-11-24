import {
  draw,
  type Effect,
  effect,
  type Frame,
  frame,
  type Gpu,
  type ShaderSource,
  type StorageBuffer,
  sampler,
  storage,
  type Target,
  target,
} from 'vgpu';
import type { GpuSceneController, GpuSceneDefinition } from '../types.ts';
import splatShader from './gaussian-splat.wgsl.ts';
import tonemapShader from './gaussian-splat-tonemap.wgsl.ts';

export const GAUSSIAN_SPLAT_COUNT = 10240;

export type GaussianSplatParams = {
  tunnelMorph: number;
  vortexMorph: number;
  camDist: number;
  camYaw: number;
  camPitch: number;
  fov: number;
  flySpeed: number;
  offsetX: number;
  splatScale: number;
  exposure: number;
  swirlStrength: number;
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
 * Generates deterministic 16-float (`64` byte) seeds per Gaussian splat spanning three 3D forms:
 * architectural terraced crystal cluster, curving infinite wormhole tunnel, and Möbius wave ribbon.
 */
function buildSplatSeedBufferData(): Float32Array<ArrayBuffer> {
  const data = new Float32Array(new ArrayBuffer(GAUSSIAN_SPLAT_COUNT * 16 * 4));
  const rand = mulberry32(0x5a17_2026);

  for (let i = 0; i < GAUSSIAN_SPLAT_COUNT; i++) {
    const base = i * 16;
    const u = i / GAUSSIAN_SPLAT_COUNT;

    // Form 0: Terraced crystal diorama
    let x0 = 0;
    let y0 = 0;
    let z0 = 0;
    let s0 = 1.0;
    let rCol = 0.25;
    let gCol = 0.72;
    let bCol = 0.98;
    let opacity = 0.14;

    if (u < 0.45) {
      // Sculpted hexagonal stepped plinth with distinct radial ribs
      const stepIdx = i % 5;
      const spoke = Math.floor(rand() * 12);
      const sectorAngle = (spoke / 12) * Math.PI * 2 + (rand() - 0.5) * 0.16;
      const baseRad = 0.48 + stepIdx * 0.21 + (rand() - 0.5) * 0.04;
      x0 = Math.cos(sectorAngle) * baseRad;
      z0 = Math.sin(sectorAngle) * baseRad;
      y0 = -0.52 + (4 - stepIdx) * 0.08 + (rand() - 0.5) * 0.025;
      s0 = 0.85 + rand() * 0.3;
      const bandT = stepIdx / 4;
      rCol = 0.06 + bandT * 0.18;
      gCol = 0.52 + bandT * 0.34;
      bCol = 1.05 - bandT * 0.18;
      opacity = 0.14;
    } else if (u < 0.75) {
      // Hollow fluted crystalline lattice spire (open frame so silhouette reads clearly)
      const spireT = (u - 0.45) / 0.3;
      const fin = i % 6;
      const twist = spireT * 1.65;
      const angle = (fin / 6) * Math.PI * 2 + twist + (rand() - 0.5) * 0.07;
      const rad = 0.18 + (1.0 - spireT) * 0.26 + Math.sin(spireT * Math.PI * 3.0) * 0.04;
      x0 = Math.cos(angle) * rad;
      z0 = Math.sin(angle) * rad;
      y0 = -0.22 + spireT * 1.12 + (rand() - 0.5) * 0.03;
      s0 = 0.72 + (1.0 - spireT) * 0.35;
      rCol = 0.85 + spireT * 0.55;
      gCol = 0.58 + spireT * 0.38;
      bCol = 0.22 + (1.0 - spireT) * 0.72;
      opacity = 0.19;
    } else if (u < 0.9) {
      // Three tilted orbital ring constellations around the crystal core
      const orbitIdx = i % 3;
      const orbitAngle = rand() * Math.PI * 2;
      const orbitR = 0.82 + orbitIdx * 0.22 + (rand() - 0.5) * 0.03;
      const ox = Math.cos(orbitAngle) * orbitR;
      const oz = Math.sin(orbitAngle) * orbitR;
      const tilt = (orbitIdx - 1) * 0.45;
      x0 = ox;
      y0 = 0.22 + oz * Math.sin(tilt) + (rand() - 0.5) * 0.03;
      z0 = oz * Math.cos(tilt);
      s0 = 0.75 + rand() * 0.35;
      rCol = orbitIdx === 1 ? 1.05 : 0.32;
      gCol = 0.42 + orbitIdx * 0.22;
      bCol = 1.1;
      opacity = 0.18;
    } else {
      const haloTheta = rand() * Math.PI * 2;
      const haloR = 1.32 + rand() * 0.65;
      x0 = Math.cos(haloTheta) * haloR;
      z0 = Math.sin(haloTheta) * haloR;
      y0 = (rand() - 0.5) * 1.15;
      s0 = 0.95 + rand() * 0.4;
      rCol = 0.18;
      gCol = 0.55;
      bCol = 0.95;
      opacity = 0.09;
    }

    // Form 1: Tunnel (angle, radius, zPhase, ribFlag)
    const isRib = u < 0.45;
    let angle1 = rand() * Math.PI * 2;
    let radius1 = 1.08 + (rand() - 0.5) * 0.16;
    let zPhase1 = rand();
    let ribFlag1 = 0.0;
    if (isRib) {
      const ring = Math.floor(rand() * 18);
      zPhase1 = (ring + (rand() - 0.5) * 0.08) / 18;
      if (zPhase1 < 0) zPhase1 += 1;
      if (zPhase1 >= 1) zPhase1 -= 1;
      angle1 = ((i % 256) / 256) * Math.PI * 2 + (rand() - 0.5) * 0.04;
      radius1 = 1.12 + (rand() - 0.5) * 0.09;
      ribFlag1 = 1.0;
    } else if (u < 0.85) {
      angle1 = rand() * Math.PI * 2;
      radius1 = 1.18 + (rand() - 0.5) * 0.24;
    } else {
      angle1 = rand() * Math.PI * 2;
      radius1 = 0.25 + rand() * 0.78;
    }

    // Form 2: Striped open 3D Möbius ribbon wave with glowing edge rails
    let x2 = 0;
    let y2 = 0;
    let z2 = 0;
    let phase2 = 0;
    if (u < 0.72) {
      const t = (i / (GAUSSIAN_SPLAT_COUNT * 0.72)) * Math.PI * 2;
      const halfTwist = t * 0.5;
      const strandIdx = i % 9;
      const widthFrac = (strandIdx / 8) * 2.0 - 1.0;
      const widthOffset = widthFrac * 0.48 + (rand() - 0.5) * 0.028;
      const R = 1.14;
      const ribbonR = R + widthOffset * Math.cos(halfTwist);
      x2 = ribbonR * Math.cos(t);
      z2 = ribbonR * Math.sin(t);
      y2 = widthOffset * Math.sin(halfTwist) * 1.15 + Math.sin(t * 2.0) * 0.2;
      phase2 = t;
    } else {
      const streamT = rand() * Math.PI * 4;
      const streamR = 0.65 + rand() * 1.1;
      x2 = Math.cos(streamT) * streamR;
      z2 = Math.sin(streamT) * streamR;
      y2 = (rand() - 0.5) * 0.95;
      phase2 = streamT;
    }

    data[base + 0] = x0;
    data[base + 1] = y0;
    data[base + 2] = z0;
    data[base + 3] = s0;

    data[base + 4] = angle1;
    data[base + 5] = radius1;
    data[base + 6] = zPhase1;
    data[base + 7] = ribFlag1;

    data[base + 8] = x2;
    data[base + 9] = y2;
    data[base + 10] = z2;
    data[base + 11] = phase2;

    data[base + 12] = rCol;
    data[base + 13] = gCol;
    data[base + 14] = bCol;
    data[base + 15] = opacity;
  }

  return data;
}

const SHARED_SEED_DATA = buildSplatSeedBufferData();

function createGaussianSplatController(
  gpu: Gpu,
  initialTarget: Target,
): GpuSceneController<GaussianSplatParams> {
  const splatBuffer: StorageBuffer = storage(gpu, SHARED_SEED_DATA.byteLength, 'read');
  splatBuffer.write(SHARED_SEED_DATA);

  const initW = Math.max(1, Math.round(initialTarget.size[0]));
  const initH = Math.max(1, Math.round(initialTarget.size[1]));
  const hdrTarget = target(gpu, {
    size: [initW, initH],
    format: 'rgba16float',
    clearColor: [0, 0, 0, 0],
  });
  const linearSampler = sampler(gpu, {
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const splatDraw = draw(gpu, {
    shader: splatShader as ShaderSource,
    vertices: 6,
    instances: GAUSSIAN_SPLAT_COUNT,
    blend: 'additive',
    depth: false,
    label: 'gaussian-splat.accumulation',
  });

  const tonemapEffect: Effect = effect(gpu, tonemapShader as ShaderSource, {
    label: 'gaussian-splat.tonemap',
  });

  return {
    async compile(compileTarget: Target) {
      await Promise.all([splatDraw.compile(hdrTarget), tonemapEffect.compile(compileTarget)]);
    },
    resize(width: number, height: number) {
      const rw = Math.max(1, Math.round(width));
      const rh = Math.max(1, Math.round(height));
      if (hdrTarget.size[0] !== rw || hdrTarget.size[1] !== rh) {
        hdrTarget.resize([rw, rh]);
      }
    },
    renderAt(
      timeSeconds: number,
      params: GaussianSplatParams,
      renderTarget: Target,
      activeFrame?: Frame,
    ) {
      const rw = Math.max(1, Math.round(renderTarget.size[0]));
      const rh = Math.max(1, Math.round(renderTarget.size[1]));
      if (hdrTarget.size[0] !== rw || hdrTarget.size[1] !== rh) {
        hdrTarget.resize([rw, rh]);
      }

      splatDraw.set({
        params: {
          time: timeSeconds,
          tunnelMorph: params.tunnelMorph,
          vortexMorph: params.vortexMorph,
          camDist: params.camDist,
          camYaw: params.camYaw,
          camPitch: params.camPitch,
          fov: params.fov,
          flySpeed: params.flySpeed,
          offsetX: params.offsetX,
          splatScale: params.splatScale,
          exposure: params.exposure,
          swirlStrength: params.swirlStrength,
          resolution: [rw, rh],
          _pad0: [0, 0],
        },
        splats: splatBuffer,
      });

      tonemapEffect.set({
        params: {
          time: timeSeconds,
          exposure: params.exposure,
          tunnelMorph: params.tunnelMorph,
          vortexMorph: params.vortexMorph,
          resolution: [rw, rh],
          _pad0: [0, 0],
        },
        hdrTex: hdrTarget,
        hdrSampler: linearSampler,
      });

      const encode = (f: Frame) => {
        f.pass({ target: hdrTarget, clear: [0, 0, 0, 0] }, (pass) => {
          pass.draw(splatDraw);
        });
        f.pass({ target: renderTarget, clear: true }, tonemapEffect);
      };

      if (activeFrame) {
        encode(activeFrame);
      } else {
        frame(gpu, encode);
      }
    },
    dispose() {
      tonemapEffect.dispose();
      splatDraw.dispose();
      (hdrTarget as Target & { destroy?: () => void }).destroy?.();
      (splatBuffer as StorageBuffer & { destroy?: () => void }).destroy?.();
    },
  };
}

export const gaussianSplatScene: GpuSceneDefinition<GaussianSplatParams> = {
  id: 'gaussian-splat',
  label: 'Anisotropic 3D Gaussian splat morphing between diorama, tunnel, and ribbon',
  shader: splatShader as ShaderSource,
  stillTime: 1.0,
  stillSize: [1280, 720],
  clearColor: [0.005, 0.009, 0.022, 1.0],
  defaultParams: {
    tunnelMorph: 0.0,
    vortexMorph: 0.0,
    camDist: 3.15,
    camYaw: 0.55,
    camPitch: 0.34,
    fov: 1.0,
    flySpeed: 1.35,
    offsetX: 0.26,
    splatScale: 1.0,
    exposure: 0.92,
    swirlStrength: 1.45,
  },
  setup: createGaussianSplatController,
};

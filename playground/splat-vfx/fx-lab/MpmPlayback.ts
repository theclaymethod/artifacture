import * as THREE from "three";
import {
  GpuArrays,
  GpuSplatMath,
  GpuSplats,
  SplatCollection,
  Splats,
  TSL,
  WgpuBuffer,
  loadSplatFile,
  type SplatGenerator,
  type TslNode,
} from "@sparkjsdev/radix";
import type { WebGPURenderer } from "three/webgpu";

const { clamp, cos, float, length, mix, normalize, sin, smoothstep, uint, uniform, vec3, vec4 } = TSL;

export interface MpmHeader {
  numFrames: number;
  numParticles: number;
  fps: number;
  boundsMin: THREE.Vector3;
  boundsMax: THREE.Vector3;
  floorY: number;
}

export interface RigidHeader {
  numFrames: number;
  numShards: number;
  numParticles: number;
  shardIds: Uint16Array;
  shardQuats: Float32Array;
}

function parseRigidHeader(buf: ArrayBuffer): RigidHeader {
  const view = new DataView(buf);
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  if (magic !== "RSHD") {
    throw new Error(`Invalid mpm-rigid.bin magic: ${magic}`);
  }
  const numFrames = view.getUint32(4, true);
  const numShards = view.getUint32(8, true);
  const numParticles = view.getUint32(12, true);
  const shardIds = new Uint16Array(buf, 16, numParticles);
  const quatOffset = 16 + Math.ceil((numParticles * 2) / 4) * 4;
  const shardQuats = new Float32Array(buf, quatOffset);
  return { numFrames, numShards, numParticles, shardIds, shardQuats };
}

function parseMpmHeader(buf: ArrayBuffer): MpmHeader {
  const view = new DataView(buf);
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  if (magic !== "MPMT") {
    throw new Error(`Invalid mpm-traj.bin magic: ${magic}`);
  }
  return {
    numFrames: view.getUint32(8, true),
    numParticles: view.getUint32(12, true),
    fps: view.getFloat32(16, true),
    boundsMin: new THREE.Vector3(view.getFloat32(20, true), view.getFloat32(24, true), view.getFloat32(28, true)),
    boundsMax: new THREE.Vector3(view.getFloat32(32, true), view.getFloat32(36, true), view.getFloat32(40, true)),
    floorY: view.getFloat32(44, true),
  };
}

function computeUpQuaternion(flipX: boolean, up?: [number, number, number]): THREE.Quaternion {
  const q = new THREE.Quaternion();
  if (flipX) {
    q.set(1, 0, 0, 0);
  }
  if (up) {
    const corr = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(up[0], up[1], up[2]).normalize(),
      new THREE.Vector3(0, 1, 0),
    );
    q.premultiply(corr);
  }
  return q;
}

export class MpmPlayback {
  readonly header: MpmHeader;
  readonly durationSec: number;
  readonly collection: SplatCollection;

  private readonly packed: Uint16Array;
  private readonly boundsSpan: THREE.Vector3;
  private readonly frameA: WgpuBuffer<"float32x4">;
  private readonly frameB: WgpuBuffer<"float32x4">;
  private readonly quatA: WgpuBuffer<"float32x4"> | undefined;
  private readonly quatB: WgpuBuffer<"float32x4"> | undefined;
  private readonly rigid: RigidHeader | undefined;
  private readonly baseScale: WgpuBuffer<"float32x4">;
  private readonly baseQuat: WgpuBuffer<"float32x4">;
  private readonly baseRgbOp: WgpuBuffer<"float32x4">;
  private readonly uAlpha = uniform(0, "float");
  private readonly uSimSec = uniform(0, "float");
  private readonly model = new THREE.Object3D();

  private staticArrays: GpuArrays | undefined;
  private uploadedA = -1;
  private uploadedB = -1;

  private constructor(
    renderer: WebGPURenderer,
    header: MpmHeader,
    packed: Uint16Array,
    particleCount: number,
    staticArrays: GpuArrays | undefined,
    worldQuat: THREE.Quaternion,
    rigid?: RigidHeader,
  ) {
    this.header = header;
    this.durationSec = Math.max(0.05, (header.numFrames - 1) / header.fps);
    this.packed = packed;
    this.boundsSpan = header.boundsMax.clone().sub(header.boundsMin);
    this.staticArrays = staticArrays;
    this.rigid = rigid;

    const modelMat = new THREE.Matrix4().makeRotationFromQuaternion(worldQuat);
    this.model.matrixAutoUpdate = false;
    this.model.matrix.copy(modelMat);
    this.model.matrixWorld.copy(modelMat);

    this.frameA = new WgpuBuffer({ renderer, format: "float32x4", count: particleCount, label: "mpmFrameA" });
    this.frameB = new WgpuBuffer({ renderer, format: "float32x4", count: particleCount, label: "mpmFrameB" });
    if (rigid) {
      this.quatA = new WgpuBuffer({ renderer, format: "float32x4", count: particleCount, label: "mpmQuatA" });
      this.quatB = new WgpuBuffer({ renderer, format: "float32x4", count: particleCount, label: "mpmQuatB" });
    }
    this.baseScale = new WgpuBuffer({ renderer, format: "float32x4", count: particleCount, label: "mpmBaseScale" });
    this.baseQuat = new WgpuBuffer({ renderer, format: "float32x4", count: particleCount, label: "mpmBaseQuat" });
    this.baseRgbOp = new WgpuBuffer({ renderer, format: "float32x4", count: particleCount, label: "mpmBaseRgbOp" });

    const generator: SplatGenerator = {
      generateSplat: (index: TslNode) => {
        const a = this.frameA.element(index).toVar();
        const b = this.frameB.element(index).toVar();
        const sc = this.baseScale.element(index).toVar();
        const q0 = this.baseQuat.element(index).toVar();
        const c0 = this.baseRgbOp.element(index).toVar();

        const pos = mix(a.xyz, b.xyz, this.uAlpha).toVar();
        const strain = mix(a.w, b.w, this.uAlpha).toVar();

        if (this.quatA && this.quatB) {
          const qa = this.quatA.element(index).toVar();
          const qb = this.quatB.element(index).toVar();
          const qDelta = normalize(mix(qa, qb, this.uAlpha));
          const qOut = GpuSplatMath.quatMul(qDelta, q0);
          const splinterMask = smoothstep(1.15, 1.55, strain).toVar();
          const scaleOut = sc.xyz.mul(mix(float(1), float(0.62), splinterMask));
          const rgbOut = mix(c0.xyz, c0.xyz.mul(1.22).add(vec3(0.14, 0.24, 0.16)), splinterMask);
          const opOut = c0.w;
          return GpuSplats.Splat(pos, scaleOut, qOut, rgbOut, clamp(opOut, 0, 1), uint(index));
        }

        const vel = b.xyz.sub(a.xyz).mul(this.header.fps).toVar();
        const spd = length(vel).toVar();

        const tumble = clamp(strain.mul(2.0), 0, 1).mul(spd.mul(0.5).add(this.uSimSec.mul(strain).mul(1.6))).toVar();
        const axis = normalize(vec3(vel.z.add(0.01), vel.x.add(0.15), vel.y.negate().add(0.02)));
        const halfA = tumble.mul(0.5);
        const sHalf = sin(halfA);
        const qSpin = vec4(axis.mul(sHalf), cos(halfA));
        const qOut = GpuSplatMath.quatMul(qSpin, q0);

        const dustMask = smoothstep(0.28, 1.25, strain).toVar();
        const scaleOut = sc.xyz.mul(mix(float(1), float(1.14), dustMask));
        const rgbOut = mix(c0.xyz, c0.xyz.mul(vec3(1.06, 0.96, 0.84)).add(vec3(0.06, 0.04, 0.02)), dustMask.mul(0.45));
        const opOut = c0.w.mul(mix(float(1), float(0.84), dustMask));

        return GpuSplats.Splat(pos, scaleOut, qOut, rgbOut, clamp(opOut, 0, 1), uint(index));
      },
    };

    const items = [];
    if (this.staticArrays) {
      items.push(SplatCollection.arrays(this.staticArrays, { matrixWorld: this.model.matrixWorld }));
    }
    items.push(SplatCollection.object({ generator, count: particleCount }));
    this.collection = new SplatCollection(items);
  }

  static async load(
    renderer: WebGPURenderer,
    baseUrl: string,
    flipX: boolean,
    up?: [number, number, number],
  ): Promise<MpmPlayback> {
    const metaRes = await fetch(`${baseUrl}/meta.json`);
    const metaJson = metaRes.ok
      ? ((await metaRes.json()) as { static_particles?: number; has_rigid_quats?: boolean })
      : null;
    const hasStatic = (metaJson?.static_particles ?? 1) > 0;
    const hasRigid = Boolean(metaJson?.has_rigid_quats);
    const [trajRes, rigidRes, dynLoaded, staticLoaded] = await Promise.all([
      fetch(`${baseUrl}/mpm-traj.bin`),
      hasRigid ? fetch(`${baseUrl}/mpm-rigid.bin`) : Promise.resolve(undefined),
      loadSplatFile(`${baseUrl}/mpm-dynamic.spz`, { name: "mpm-dynamic.spz", worker: true, layout: "extSplats", sh: false }),
      hasStatic
        ? loadSplatFile(`${baseUrl}/mpm-static.spz`, { name: "mpm-static.spz", worker: true, layout: "extSplats", sh: false })
        : Promise.resolve(undefined),
    ]);
    if (!trajRes.ok) {
      throw new Error(`Failed to fetch ${baseUrl}/mpm-traj.bin (${trajRes.status})`);
    }
    const trajBuf = await trajRes.arrayBuffer();
    const header = parseMpmHeader(trajBuf);
    const packed = new Uint16Array(trajBuf, 64);

    let rigidHeader: RigidHeader | undefined;
    if (rigidRes) {
      if (!rigidRes.ok) {
        throw new Error(`Failed to fetch ${baseUrl}/mpm-rigid.bin (${rigidRes.status})`);
      }
      rigidHeader = parseRigidHeader(await rigidRes.arrayBuffer());
    }

    const staticArrays =
      staticLoaded && staticLoaded.splats.count > 0 ? GpuArrays.fromData(renderer, staticLoaded.splats) : undefined;
    const bundle = dynLoaded.splats.bundles.extSplats;
    if (!bundle) {
      throw new Error("Expected extSplats bundle on mpm-dynamic.spz");
    }

    const n = Math.min(header.numParticles, dynLoaded.splats.count);
    const worldQuat = computeUpQuaternion(flipX, up);
    const inst = new MpmPlayback(renderer, header, packed, n, staticArrays, worldQuat, rigidHeader);

    const decode = Splats.decoder(bundle);
    const rec = Splats.makeExtSplat();
    const sc = new Float32Array(n * 4);
    const qt = new Float32Array(n * 4);
    const co = new Float32Array(n * 4);
    const tmpQ = new THREE.Quaternion();

    for (let i = 0; i < n; i += 1) {
      decode(i, rec);
      sc[i * 4 + 0] = rec.scales.x;
      sc[i * 4 + 1] = rec.scales.y;
      sc[i * 4 + 2] = rec.scales.z;
      tmpQ.set(rec.quaternion.x, rec.quaternion.y, rec.quaternion.z, rec.quaternion.w).premultiply(worldQuat);
      qt[i * 4 + 0] = tmpQ.x;
      qt[i * 4 + 1] = tmpQ.y;
      qt[i * 4 + 2] = tmpQ.z;
      qt[i * 4 + 3] = tmpQ.w;
      co[i * 4 + 0] = rec.rgb.r;
      co[i * 4 + 1] = rec.rgb.g;
      co[i * 4 + 2] = rec.rgb.b;
      co[i * 4 + 3] = rec.opacity;
    }

    inst.baseScale.upload(sc);
    inst.baseQuat.upload(qt);
    inst.baseRgbOp.upload(co);
    inst.setTime(0);
    return inst;
  }

  setTime(timeSec: number) {
    const clamped = Math.max(0, Math.min(this.durationSec, timeSec));
    const exact = clamped * this.header.fps;
    const f0 = Math.min(this.header.numFrames - 1, Math.floor(exact));
    const f1 = Math.min(this.header.numFrames - 1, f0 + 1);
    const alpha = f0 === f1 ? 0 : exact - f0;

    if (this.uploadedA !== f0) {
      this.uploadFrame(this.frameA, this.quatA, f0);
      this.uploadedA = f0;
    }
    if (this.uploadedB !== f1) {
      this.uploadFrame(this.frameB, this.quatB, f1);
      this.uploadedB = f1;
    }
    this.uAlpha.value = alpha;
    this.uSimSec.value = clamped;
  }

  private uploadFrame(buf: WgpuBuffer<"float32x4">, quatBuf: WgpuBuffer<"float32x4"> | undefined, frameIdx: number) {
    const n = buf.capacity;
    const out = new Float32Array(n * 4);
    const baseOff = frameIdx * this.header.numParticles * 4;
    const { x: mx, y: my, z: mz } = this.header.boundsMin;
    const { x: sx, y: sy, z: sz } = this.boundsSpan;
    const inv65535 = 1 / 65535;
    for (let i = 0; i < n; i += 1) {
      const k = baseOff + i * 4;
      out[i * 4 + 0] = mx + this.packed[k + 0] * inv65535 * sx;
      out[i * 4 + 1] = my + this.packed[k + 1] * inv65535 * sy;
      out[i * 4 + 2] = mz + this.packed[k + 2] * inv65535 * sz;
      out[i * 4 + 3] = this.packed[k + 3] * inv65535 * 2.0;
    }
    buf.upload(out);

    if (quatBuf && this.rigid) {
      const qOut = new Float32Array(n * 4);
      const qFrameBase = frameIdx * this.rigid.numShards * 4;
      const { shardIds, shardQuats, numShards } = this.rigid;
      for (let i = 0; i < n; i += 1) {
        const sid = shardIds[i];
        const dst = i * 4;
        if (sid < numShards) {
          const src = qFrameBase + sid * 4;
          qOut[dst + 0] = shardQuats[src + 0];
          qOut[dst + 1] = shardQuats[src + 1];
          qOut[dst + 2] = shardQuats[src + 2];
          qOut[dst + 3] = shardQuats[src + 3];
        } else {
          qOut[dst + 0] = 0;
          qOut[dst + 1] = 0;
          qOut[dst + 2] = 0;
          qOut[dst + 3] = 1;
        }
      }
      quatBuf.upload(qOut);
    }
  }

  dispose() {
    this.frameA.dispose();
    this.frameB.dispose();
    this.quatA?.dispose();
    this.quatB?.dispose();
    this.baseScale.dispose();
    this.baseQuat.dispose();
    this.baseRgbOp.dispose();
    this.staticArrays?.dispose();
    this.staticArrays = undefined;
  }
}

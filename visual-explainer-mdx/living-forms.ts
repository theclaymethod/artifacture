import * as THREE from 'three';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';
import { modelAborted, modelAsset } from './model-source';
import type { ModelFactory, ModelPresentation } from './model-types';

export type LivingFormKind = 'strata' | 'arbor' | 'resonance';

export interface LivingFormOptions {
  motionScale?: number;
}

type BuiltForm = Readonly<{
  root: THREE.Group;
  sample: (seconds: number) => void;
}>;

function validateSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error('Living form time must be finite and nonnegative.');
  }
  return seconds;
}

function strata(material: THREE.Material, motionScale: number): BuiltForm {
  const root = new THREE.Group();
  root.name = 'strata';
  for (let layer = 0; layer < 18; layer++) {
    const height = (layer / 17 - 0.5) * 3.8;
    const radius = 0.5 + 1.55 * Math.pow(Math.max(0, 1 - (height / 2.1) ** 2), 0.6);
    const geometry = new ParametricGeometry((u, v, point) => {
      const angle = u * Math.PI * 2;
      const localRadius = radius * (0.86 + v * 0.14);
      const fold = Math.sin(angle * 3 + height * 1.6);
      point.set(
        Math.cos(angle) * localRadius + Math.sin(height * 0.8) * 0.38,
        height + fold * 0.035 * v,
        Math.sin(angle) * localRadius * 0.84,
      );
    }, 100, 6);
    const surface = new THREE.Mesh(geometry, material);
    surface.name = `strata-layer-${String(layer + 1).padStart(2, '0')}`;
    root.add(surface);
  }

  const sample = (seconds: number) => {
    const time = validateSeconds(seconds) * motionScale;
    root.rotation.set(0.035, -0.5 + time * 0.085, -0.2);
  };
  sample(0);
  return { root, sample };
}

function arbor(material: THREE.Material, motionScale: number): BuiltForm {
  const root = new THREE.Group();
  root.name = 'arbor';
  const leafGeometry = new THREE.SphereGeometry(0.055, 10, 8);
  let branchIndex = 0;
  let leafIndex = 0;

  function branch(start: THREE.Vector3, direction: THREE.Vector3, length: number, depth: number, seed: number) {
    const bend = new THREE.Vector3(Math.sin(seed * 2.3), 0.15, Math.cos(seed * 1.7)).multiplyScalar(length * 0.24);
    const end = start.clone().addScaledVector(direction, length).add(bend);
    const middle = start.clone().lerp(end, 0.55).addScaledVector(bend, 0.5);
    const curve = new THREE.CatmullRomCurve3([start, middle, end]);
    const limb = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.012 + depth * 0.018, 7, false), material);
    branchIndex += 1;
    limb.name = `arbor-branch-${String(branchIndex).padStart(3, '0')}`;
    root.add(limb);

    if (depth === 0) {
      const leaf = new THREE.Mesh(leafGeometry, material);
      leafIndex += 1;
      leaf.name = `arbor-leaf-${String(leafIndex).padStart(3, '0')}`;
      leaf.position.copy(end);
      leaf.scale.set(0.8, 1.7, 0.8);
      root.add(leaf);
      return;
    }

    const count = depth > 2 ? 3 : 2;
    for (let index = 0; index < count; index++) {
      const angle = seed * 2.39996 + index * Math.PI * 2 / count;
      const spread = new THREE.Vector3(Math.cos(angle) * 0.78, 0.38, Math.sin(angle) * 0.78);
      const next = direction.clone().multiplyScalar(0.6).add(spread).normalize();
      branch(end, next, length * 0.76, depth - 1, seed * 1.4 + index + 1);
    }
  }

  branch(new THREE.Vector3(0, -2.3, 0), new THREE.Vector3(0.05, 1, 0), 1.5, 5, 1);
  const center = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
  for (const child of root.children) child.position.sub(center);

  const sample = (seconds: number) => {
    const time = validateSeconds(seconds) * motionScale;
    root.rotation.set(0.05, -0.45 + time * 0.055, -0.08);
  };
  sample(0);
  return { root, sample };
}

function resonance(material: THREE.Material, motionScale: number): BuiltForm {
  const root = new THREE.Group();
  root.name = 'resonance';
  const rings: THREE.Mesh[] = [];
  for (let index = 0; index < 48; index++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24 + index * 0.052, 0.018, 6, 160), material);
    ring.name = `resonance-ring-${String(index + 1).padStart(2, '0')}`;
    root.add(ring);
    rings.push(ring);
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), material);
  core.name = 'resonance-core';
  root.add(core);

  const sample = (seconds: number) => {
    const time = validateSeconds(seconds) * motionScale;
    for (let index = 0; index < rings.length; index++) {
      const radius = 0.24 + index * 0.052;
      rings[index].position.set(0, 0, Math.sin(radius * 7.5 - time * 1.2) * 0.36 * Math.exp(-radius * 0.23));
    }
    core.position.set(0, 0, 0.22);
    root.rotation.set(-0.92, -0.25, 0.25 + Math.sin(time * 0.1) * 0.09);
  };
  sample(0);
  return { root, sample };
}

function buildForm(kind: LivingFormKind, material: THREE.Material, motionScale: number) {
  if (kind === 'strata') return strata(material, motionScale);
  if (kind === 'arbor') return arbor(material, motionScale);
  if (kind === 'resonance') return resonance(material, motionScale);
  throw new Error('Unknown living form. Use strata, arbor, or resonance.');
}

// Camera, fitting, material, and light values from the original f-explainer forms.
const livingPresentation: ModelPresentation = ({ aspect, bounds }) => {
  const camera = new THREE.PerspectiveCamera(33, aspect, 0.1, 40);
  const size = bounds.getSize(new THREE.Vector3());
  const fieldOfView = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(0, 0.1, Math.max(aspect < 1.2 ? 12 : 9.8, size.x * 1.12 / (fieldOfView * aspect) + size.z / 2));
  camera.lookAt(0, 0, 0);
  const hemisphere = new THREE.HemisphereLight(0xb8e3c5, 0x020604, 0.22);
  const key = new THREE.DirectionalLight(0xe8f8e9, 3.6); key.position.set(-3, 4, 5);
  const rim = new THREE.DirectionalLight(0xe89a70, 2.8); rim.position.set(4, 1, -2);
  const fill = new THREE.DirectionalLight(0x79bd8b, 1.3); fill.position.set(-4, -2, 1);
  return { camera, lights: [hemisphere, key, rim, fill] };
};

export function createLivingForm(kind: LivingFormKind, options: Readonly<LivingFormOptions> = {}): ModelFactory {
  const motionScale = options.motionScale ?? 1;
  if (!Number.isFinite(motionScale)) throw new Error('Living form motionScale must be finite.');

  return context => {
    if (context.signal.aborted) throw modelAborted();
    const material = new THREE.MeshStandardMaterial({
      color: 0xa4c8af,
      metalness: 0.22,
      roughness: 0.46,
      side: THREE.DoubleSide,
    });
    let form: BuiltForm;
    try {
      form = buildForm(kind, material, motionScale);
    } catch (error) {
      material.dispose();
      throw error;
    }
    const asset = modelAsset(form.root, {
      sample: form.sample,
      presentation: livingPresentation,
    });
    if (!context.signal.aborted) return asset;
    asset.dispose();
    throw modelAborted();
  };
}

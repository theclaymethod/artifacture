import * as THREE from 'three';
import { modelAborted, modelAsset } from './model-source';
import type { ModelFactory } from './model-types';

export type ProceduralPropKind = 'boundary-found' | 'fair-comparison' | 'ready-to-review';

export interface ProceduralPropOptions {
  settleDuration?: number;
  settleStart?: number;
}

type PropMaterials = Readonly<{
  ink: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
}>;

function clay(color: THREE.ColorRepresentation) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    metalness: 0,
    roughness: 0.82,
    side: THREE.DoubleSide,
  });
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string) {
  const value = new THREE.Mesh(geometry, material);
  value.name = name;
  value.castShadow = true;
  value.receiveShadow = true;
  return value;
}

function pebbleGeometry(radius = 1, detail = 1) {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const noise = 1 + Math.sin(x * 4.1 + y * 2.7 + z * 3.3) * 0.035;
    position.setXYZ(index, x * noise, y * noise, z * noise);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function softenRadialGeometry(geometry: THREE.BufferGeometry, amount = 0.04) {
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const angle = Math.atan2(z, x);
    const offset = 1 + Math.sin(angle * 3 + y * 2.2) * amount + Math.cos(angle * 5 - y) * amount * 0.45;
    position.setXYZ(index, x * offset, y, z * offset);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function inflatedStarGeometry() {
  const control: THREE.Vector3[] = [];
  for (let index = 0; index < 10; index++) {
    const angle = Math.PI / 2 + index * Math.PI / 5;
    const radius = index % 2 === 0 ? 1.24 : 0.64;
    control.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
  }
  const curve = new THREE.CatmullRomCurve3(control, true, 'centripetal');
  const outline = curve.getSpacedPoints(40).slice(0, 40);
  const positions: number[] = [0, 0, 0.42];
  for (const point of outline) positions.push(point.x * 0.82, point.y * 0.82, 0.29);
  for (const point of outline) positions.push(point.x, point.y, 0);
  for (const point of outline) positions.push(point.x * 0.82, point.y * 0.82, -0.29);
  positions.push(0, 0, -0.42);

  const frontCenter = 0;
  const frontRing = 1;
  const edgeRing = 41;
  const backRing = 81;
  const backCenter = 121;
  const indices: number[] = [];
  for (let index = 0; index < 40; index++) {
    const next = (index + 1) % 40;
    indices.push(frontCenter, frontRing + index, frontRing + next);
    indices.push(
      frontRing + index,
      edgeRing + index,
      edgeRing + next,
      frontRing + index,
      edgeRing + next,
      frontRing + next,
    );
    indices.push(
      edgeRing + index,
      backRing + index,
      backRing + next,
      edgeRing + index,
      backRing + next,
      edgeRing + next,
    );
    indices.push(backCenter, backRing + next, backRing + index);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function plinth(material: THREE.Material, width = 2.7) {
  const group = new THREE.Group();
  group.name = 'plinth-assembly';
  const underside = mesh(
    new THREE.LatheGeometry([
      new THREE.Vector2(0.025, 0),
      new THREE.Vector2(1.02, 0),
      new THREE.Vector2(1.08, 0.07),
      new THREE.Vector2(1.02, 0.17),
      new THREE.Vector2(0.025, 0.17),
    ], 12),
    material,
    'plinth-underside',
  );
  underside.scale.set(width / 2, 1, 0.7);
  const top = mesh(
    softenRadialGeometry(new THREE.LatheGeometry([
      new THREE.Vector2(0.025, 0.12),
      new THREE.Vector2(1.02, 0.12),
      new THREE.Vector2(1.1, 0.22),
      new THREE.Vector2(1.04, 0.42),
      new THREE.Vector2(0.88, 0.58),
      new THREE.Vector2(0.025, 0.58),
    ], 12), 0.035),
    material,
    'pebble-plinth',
  );
  top.scale.set(width / 2, 1, 0.7);
  group.add(underside, top);
  return group;
}

function tube(points: THREE.Vector3[], radius: number, material: THREE.Material, name: string, segments = 18) {
  return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 7, false), material, name);
}

function boundaryFound(materials: PropMaterials) {
  const root = new THREE.Group();
  root.name = 'boundary-found';
  root.add(plinth(materials.ink));
  for (const side of [-1, 1]) {
    root.add(tube([
      new THREE.Vector3(side * 0.72, 0.6, 0),
      new THREE.Vector3(side * 0.98, 1.22, side * 0.03),
      new THREE.Vector3(side * 0.86, 1.87, 0.02),
      new THREE.Vector3(side * 0.58, 2.38, 0),
    ], 0.29, materials.ink, `${side < 0 ? 'left' : 'right'}-support`, 16));
  }
  const star = mesh(inflatedStarGeometry(), materials.accent, 'rounded-star');
  star.rotation.y = -0.09;
  star.scale.set(1.24, 1.2, 1.16);
  star.position.set(0, 2.56, 0.03);
  root.add(star);
  root.position.y = -1.65;
  return root;
}

function fairComparison(materials: PropMaterials) {
  const root = new THREE.Group();
  root.name = 'fair-comparison';
  root.add(plinth(materials.ink, 3.05));
  const support = mesh(new THREE.CylinderGeometry(0.38, 0.56, 1.34, 7), materials.ink, 'central-support');
  support.position.y = 1.18;
  root.add(support);
  root.add(tube([
    new THREE.Vector3(-1.62, 2.05, 0),
    new THREE.Vector3(-0.82, 1.82, 0),
    new THREE.Vector3(0, 1.76, 0),
    new THREE.Vector3(0.82, 1.82, 0),
    new THREE.Vector3(1.62, 2.05, 0),
  ], 0.23, materials.ink, 'level-balance-beam', 24));
  const pivot = mesh(pebbleGeometry(0.38, 1), materials.ink, 'central-pivot');
  pivot.scale.set(0.8, 0.9, 0.75);
  pivot.position.set(0, 1.9, 0.08);
  root.add(pivot);

  const weightGeometry = pebbleGeometry(0.57, 1);
  for (const side of [-1, 1]) {
    const sideName = side < 0 ? 'left' : 'right';
    const cup = mesh(new THREE.CylinderGeometry(0.62, 0.48, 0.26, 9), materials.ink, `${sideName}-cup`);
    cup.position.set(side * 1.6, 2.14, 0);
    root.add(cup);
    const weight = mesh(weightGeometry, materials.accent, `${sideName}-equal-weight`);
    weight.scale.set(0.94, 1.02, 0.92);
    weight.position.set(side * 1.6, 2.72, 0);
    root.add(weight);
  }
  root.position.y = -1.55;
  return root;
}

function readyToReview(materials: PropMaterials) {
  const root = new THREE.Group();
  root.name = 'ready-to-review';
  root.add(plinth(materials.ink, 2.55));
  const stem = mesh(new THREE.CylinderGeometry(0.34, 0.48, 0.78, 9), materials.accent, 'cup-stem');
  stem.position.y = 1;
  root.add(stem);
  const bowl = mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0.44, 0),
    new THREE.Vector2(0.72, 0.1),
    new THREE.Vector2(1.02, 0.7),
    new THREE.Vector2(1.12, 1.35),
    new THREE.Vector2(1.08, 1.62),
  ], 12), materials.accent, 'faceted-cup-body');
  bowl.position.y = 1.25;
  root.add(bowl);
  const rim = mesh(new THREE.TorusGeometry(1.08, 0.13, 6, 12), materials.accent, 'thick-open-rim');
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 2.88;
  root.add(rim);
  const innerWall = mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0.94, 0),
    new THREE.Vector2(0.88, -0.32),
    new THREE.Vector2(0.7, -0.7),
    new THREE.Vector2(0.3, -0.98),
  ], 12), materials.ink, 'recessed-cup-interior');
  innerWall.position.y = 2.84;
  root.add(innerWall);
  const cavityBottom = mesh(new THREE.CircleGeometry(0.31, 12), materials.ink, 'cup-cavity-bottom');
  cavityBottom.rotation.x = -Math.PI / 2;
  cavityBottom.position.set(0, 1.855, 0);
  root.add(cavityBottom);
  for (const side of [-1, 1]) {
    root.add(tube([
      new THREE.Vector3(side * 0.91, 2.61, 0),
      new THREE.Vector3(side * 1.48, 2.54, 0),
      new THREE.Vector3(side * 1.62, 1.92, 0),
      new THREE.Vector3(side * 1.36, 1.53, 0),
      new THREE.Vector3(side * 0.88, 1.67, 0),
    ], 0.22, materials.ink, `${side < 0 ? 'left' : 'right'}-handle`, 22));
  }
  root.position.y = -1.62;
  return root;
}

function buildProp(kind: ProceduralPropKind, materials: PropMaterials) {
  if (kind === 'boundary-found') return boundaryFound(materials);
  if (kind === 'fair-comparison') return fairComparison(materials);
  if (kind === 'ready-to-review') return readyToReview(materials);
  throw new Error('Unknown procedural prop. Use boundary-found, fair-comparison, or ready-to-review.');
}

function validateSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error('Procedural prop time must be finite and nonnegative.');
  }
  return seconds;
}

export function createProceduralProp(kind: ProceduralPropKind, options: Readonly<ProceduralPropOptions> = {}): ModelFactory {
  const settleDuration = options.settleDuration ?? 0.72;
  const settleStart = options.settleStart ?? 0;
  if (!Number.isFinite(settleDuration) || settleDuration < 0) {
    throw new Error('Procedural prop settleDuration must be finite and nonnegative.');
  }
  if (!Number.isFinite(settleStart) || settleStart < 0) {
    throw new Error('Procedural prop settleStart must be finite and nonnegative.');
  }

  return context => {
    if (context.signal.aborted) throw modelAborted();
    const materials = {
      ink: clay('#aeb4b6'),
      accent: clay('#16abc4'),
    };
    let root: THREE.Group;
    try {
      root = buildProp(kind, materials);
    } catch (error) {
      materials.ink.dispose();
      materials.accent.dispose();
      throw error;
    }
    const restPosition = root.position.clone();
    const restRotation = new THREE.Euler(0, -0.18, 0);
    const restScale = root.scale.clone();
    const sample = (seconds: number) => {
      const time = validateSeconds(seconds);
      const progress = settleDuration === 0
        ? Number(time >= settleStart)
        : THREE.MathUtils.clamp((time - settleStart) / settleDuration, 0, 1);
      const response = progress === 1 ? 1 : 1 - Math.exp(-7 * progress) * Math.cos(progress * 11);
      root.position.set(restPosition.x, restPosition.y - 0.34 * (1 - response), restPosition.z);
      root.rotation.set(restRotation.x, restRotation.y - 0.22 * (1 - response), restRotation.z);
      root.scale.copy(restScale);
    };
    sample(0);
    const asset = modelAsset(root, {
      sample,
      paint: [
        { material: materials.ink, role: 'ink' },
        { material: materials.accent, role: 'accent' },
      ],
    });
    if (!context.signal.aborted) return asset;
    asset.dispose();
    throw modelAborted();
  };
}

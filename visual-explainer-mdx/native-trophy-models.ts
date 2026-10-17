// Original f-explainer source; see F-EXPLAINER-PROVENANCE.md.
import * as THREE from "three";

export type TrophyKind =
  "boundary-found" | "fair-comparison" | "ready-to-review";

const RUST = 0xb05a36;
const DEEP_RUST = 0x8f462a;
const IVORY = 0xfef9ef;
const CHARCOAL = 0x2a2b2f;

function clay(color: number) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0,
    flatShading: true,
  });
}

function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
) {
  const value = new THREE.Mesh(geometry, material);
  value.name = name;
  value.castShadow = true;
  value.receiveShadow = true;
  return value;
}

function pebbleGeometry(radius = 1, detail = 1) {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      y = position.getY(i),
      z = position.getZ(i);
    const n = 1 + Math.sin(x * 4.1 + y * 2.7 + z * 3.3) * 0.035;
    position.setXYZ(i, x * n, y * n, z * n);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function softenRadialGeometry(geometry: THREE.BufferGeometry, amount = 0.04) {
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      y = position.getY(i),
      z = position.getZ(i);
    const angle = Math.atan2(z, x);
    const offset =
      1 +
      Math.sin(angle * 3 + y * 2.2) * amount +
      Math.cos(angle * 5 - y) * amount * 0.45;
    position.setXYZ(i, x * offset, y, z * offset);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function inflatedStarGeometry() {
  const control: THREE.Vector3[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? 1.24 : 0.64;
    control.push(
      new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0),
    );
  }
  const curve = new THREE.CatmullRomCurve3(control, true, "centripetal");
  const outline = curve.getSpacedPoints(40).slice(0, 40);
  const positions: number[] = [0, 0, 0.42];
  for (const point of outline)
    positions.push(point.x * 0.82, point.y * 0.82, 0.29);
  for (const point of outline) positions.push(point.x, point.y, 0);
  for (const point of outline)
    positions.push(point.x * 0.82, point.y * 0.82, -0.29);
  positions.push(0, 0, -0.42);
  const frontCenter = 0,
    frontRing = 1,
    edgeRing = 41,
    backRing = 81,
    backCenter = 121;
  const indices: number[] = [];
  for (let i = 0; i < 40; i++) {
    const next = (i + 1) % 40;
    indices.push(frontCenter, frontRing + i, frontRing + next);
    indices.push(
      frontRing + i,
      edgeRing + i,
      edgeRing + next,
      frontRing + i,
      edgeRing + next,
      frontRing + next,
    );
    indices.push(
      edgeRing + i,
      backRing + i,
      backRing + next,
      edgeRing + i,
      backRing + next,
      edgeRing + next,
    );
    indices.push(backCenter, backRing + next, backRing + i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function base(material: THREE.Material, width = 2.7) {
  const group = new THREE.Group();
  const dark = mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.025, 0),
        new THREE.Vector2(1.02, 0),
        new THREE.Vector2(1.08, 0.07),
        new THREE.Vector2(1.02, 0.17),
        new THREE.Vector2(0.025, 0.17),
      ],
      12,
    ),
    clay(CHARCOAL),
    "charcoal-underside",
  );
  dark.scale.set(width / 2, 1, 0.7);
  const top = mesh(
    softenRadialGeometry(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.025, 0.12),
          new THREE.Vector2(1.02, 0.12),
          new THREE.Vector2(1.1, 0.22),
          new THREE.Vector2(1.04, 0.42),
          new THREE.Vector2(0.88, 0.58),
          new THREE.Vector2(0.025, 0.58),
        ],
        12,
      ),
      0.035,
    ),
    material,
    "pebble-plinth",
  );
  top.scale.set(width / 2, 1, 0.7);
  group.add(dark, top);
  return group;
}

function tube(
  points: THREE.Vector3[],
  radius: number,
  material: THREE.Material,
  name: string,
  segments = 18,
) {
  return mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points),
      segments,
      radius,
      7,
      false,
    ),
    material,
    name,
  );
}

function makeBoundaryFound() {
  const root = new THREE.Group();
  root.name = "boundary-found";
  const rust = clay(RUST),
    ivory = clay(IVORY);
  root.add(base(ivory));

  for (const side of [-1, 1]) {
    root.add(
      tube(
        [
          new THREE.Vector3(side * 0.72, 0.6, 0),
          new THREE.Vector3(side * 0.98, 1.22, side * 0.03),
          new THREE.Vector3(side * 0.86, 1.87, 0.02),
          new THREE.Vector3(side * 0.58, 2.38, 0),
        ],
        0.29,
        ivory,
        `${side < 0 ? "left" : "right"}-support`,
        16,
      ),
    );
  }

  const starGeometry = inflatedStarGeometry();
  const star = mesh(starGeometry, rust, "rounded-star");
  star.rotation.y = -0.09;
  star.scale.set(1.24, 1.2, 1.16);
  star.position.set(0, 2.56, 0.03);
  root.add(star);
  root.position.y = -1.65;
  return root;
}

function makeFairComparison() {
  const root = new THREE.Group();
  root.name = "fair-comparison";
  const rust = clay(RUST),
    deepRust = clay(DEEP_RUST),
    ivory = clay(IVORY);
  root.add(base(rust, 3.05));
  const support = mesh(
    new THREE.CylinderGeometry(0.38, 0.56, 1.34, 7),
    deepRust,
    "central-support",
  );
  support.position.y = 1.18;
  root.add(support);

  const beamPoints = [
    new THREE.Vector3(-1.62, 2.05, 0),
    new THREE.Vector3(-0.82, 1.82, 0),
    new THREE.Vector3(0, 1.76, 0),
    new THREE.Vector3(0.82, 1.82, 0),
    new THREE.Vector3(1.62, 2.05, 0),
  ];
  root.add(tube(beamPoints, 0.23, ivory, "level-balance-beam", 24));
  const pivot = mesh(pebbleGeometry(0.38, 1), ivory, "central-pivot");
  pivot.scale.set(0.8, 0.9, 0.75);
  pivot.position.set(0, 1.9, 0.08);
  root.add(pivot);

  const weightGeometry = pebbleGeometry(0.57, 1);
  for (const side of [-1, 1]) {
    const cup = mesh(
      new THREE.CylinderGeometry(0.62, 0.48, 0.26, 9),
      ivory,
      `${side < 0 ? "left" : "right"}-cup`,
    );
    cup.position.set(side * 1.6, 2.14, 0);
    root.add(cup);
    const weight = mesh(
      weightGeometry,
      rust,
      `${side < 0 ? "left" : "right"}-equal-weight`,
    );
    weight.scale.set(0.94, 1.02, 0.92);
    weight.position.set(side * 1.6, 2.72, 0);
    root.add(weight);
  }
  root.position.y = -1.55;
  return root;
}

function makeReadyToReview() {
  const root = new THREE.Group();
  root.name = "ready-to-review";
  const rust = clay(RUST),
    ivory = clay(IVORY);
  root.add(base(rust, 2.55));
  const stem = mesh(
    new THREE.CylinderGeometry(0.34, 0.48, 0.78, 9),
    rust,
    "cup-stem",
  );
  stem.position.y = 1.0;
  root.add(stem);

  const outerProfile = [
    new THREE.Vector2(0.44, 0),
    new THREE.Vector2(0.72, 0.1),
    new THREE.Vector2(1.02, 0.7),
    new THREE.Vector2(1.12, 1.35),
    new THREE.Vector2(1.08, 1.62),
  ];
  const bowl = mesh(
    new THREE.LatheGeometry(outerProfile, 12),
    rust,
    "faceted-cup-body",
  );
  bowl.position.y = 1.25;
  root.add(bowl);
  const rim = mesh(
    new THREE.TorusGeometry(1.08, 0.13, 6, 12),
    rust,
    "thick-open-rim",
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 2.88;
  root.add(rim);
  const interiorMaterial = clay(DEEP_RUST);
  interiorMaterial.side = THREE.DoubleSide;
  const innerWall = mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.94, 0),
        new THREE.Vector2(0.88, -0.32),
        new THREE.Vector2(0.7, -0.7),
        new THREE.Vector2(0.3, -0.98),
      ],
      12,
    ),
    interiorMaterial,
    "recessed-cup-interior",
  );
  innerWall.position.y = 2.84;
  root.add(innerWall);
  const cavityBottom = mesh(
    new THREE.CircleGeometry(0.31, 12),
    interiorMaterial,
    "cup-cavity-bottom",
  );
  cavityBottom.rotation.x = -Math.PI / 2;
  cavityBottom.position.set(0, 1.855, 0);
  root.add(cavityBottom);

  for (const side of [-1, 1]) {
    root.add(
      tube(
        [
          new THREE.Vector3(side * 0.91, 2.61, 0),
          new THREE.Vector3(side * 1.48, 2.54, 0),
          new THREE.Vector3(side * 1.62, 1.92, 0),
          new THREE.Vector3(side * 1.36, 1.53, 0),
          new THREE.Vector3(side * 0.88, 1.67, 0),
        ],
        0.22,
        ivory,
        `${side < 0 ? "left" : "right"}-handle`,
        22,
      ),
    );
  }
  root.position.y = -1.62;
  return root;
}

export function createTrophyModel(kind: TrophyKind): THREE.Group {
  if (kind === "boundary-found") return makeBoundaryFound();
  if (kind === "fair-comparison") return makeFairComparison();
  return makeReadyToReview();
}

export function disposeTrophyModel(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const list = Array.isArray(object.material)
      ? object.material
      : [object.material];
    list.forEach((material) => materials.add(material));
  });
  materials.forEach((material) => material.dispose());
}

import * as THREE from 'three';
import { modelAsset } from '../../visual-explainer-mdx/model-source';
import type { ModelFactory } from '../../visual-explainer-mdx/model-types';

// An authored factory example, not an image reconstruction. img2threejs factories use this same boundary.
export const createLofiPump: ModelFactory = () => {
  const root = new THREE.Group(); root.name = 'pump';
  const neutral = new THREE.MeshStandardMaterial({ color: '#737b86', roughness: 0.85 });
  const accent = new THREE.MeshStandardMaterial({ color: '#0caec8', roughness: 0.72 });
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.position.set(x, y, z); root.add(mesh); return mesh;
  }
  add('base', new THREE.BoxGeometry(2.7, 0.18, 1.4), neutral, 0, -0.9, 0);
  add('motor', new THREE.CylinderGeometry(0.48, 0.48, 1.3, 16), neutral, -0.68, -0.22, 0).rotation.z = Math.PI / 2;
  add('column', new THREE.BoxGeometry(0.32, 1.8, 0.4), neutral, 0.8, 0, 0);
  add('cap', new THREE.BoxGeometry(0.82, 0.2, 0.7), neutral, 0.8, 0.9, 0);
  const wheel = new THREE.Group(); wheel.name = 'flywheel-pivot'; wheel.position.set(-0.68, -0.22, 0.72); root.add(wheel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.085, 8, 24), accent); rim.name = 'flywheel-rim'; wheel.add(rim);
  for (let index = 0; index < 3; index++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.06, 0.06), neutral); spoke.name = `spoke-${index}`; spoke.rotation.z = index * Math.PI / 3; wheel.add(spoke);
  }
  const piston = add('piston', new THREE.CylinderGeometry(0.13, 0.13, 0.74, 12), neutral, 0.8, 0.36, 0.38);
  return modelAsset(root, {
    paint: [{ material: neutral, role: 'ink' }, { material: accent, role: 'accent' }],
    sample(seconds) { wheel.rotation.z = -seconds * 1.8; piston.position.y = 0.36 + Math.sin(seconds * 1.8) * 0.18; },
  });
};

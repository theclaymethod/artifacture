// Original f-explainer form adapter; only the local import path changed.
import * as THREE from "three/webgpu";
import { ParametricGeometry } from "three/addons/geometries/ParametricGeometry.js";
import { screenUV, texture } from "three/tsl";
import type { SourceAdapter } from "./native-ascii-renderer";

export type FormName = "Strata" | "Arbor" | "Resonance";

function strata(material: THREE.MeshStandardNodeMaterial) {
  const group = new THREE.Group();
  for (let layer = 0; layer < 18; layer++) {
    const height = (layer / 17 - 0.5) * 3.8;
    const radius = 0.5 + 1.55 * Math.pow(Math.max(0, 1 - (height / 2.1) ** 2), 0.6);
    const geometry = new ParametricGeometry((u, v, point) => {
      const angle = u * Math.PI * 2;
      const r = radius * (0.86 + v * 0.14);
      const fold = Math.sin(angle * 3 + height * 1.6);
      point.set(
        Math.cos(angle) * r + Math.sin(height * 0.8) * 0.38,
        height + fold * 0.035 * v,
        Math.sin(angle) * r * 0.84,
      );
    }, 100, 6);
    group.add(new THREE.Mesh(geometry, material));
  }
  group.rotation.set(0.035, -0.5, -0.2);
  return { group, animate: (t: number) => { group.rotation.y = -0.5 + t * 0.085; } };
}

function arbor(material: THREE.MeshStandardNodeMaterial) {
  const group = new THREE.Group();
  const leafGeometry = new THREE.SphereGeometry(0.055, 10, 8);
  function branch(start: THREE.Vector3, direction: THREE.Vector3, length: number, depth: number, seed: number) {
    const bend = new THREE.Vector3(Math.sin(seed * 2.3), 0.15, Math.cos(seed * 1.7)).multiplyScalar(length * 0.24);
    const end = start.clone().addScaledVector(direction, length).add(bend);
    const middle = start.clone().lerp(end, 0.55).addScaledVector(bend, 0.5);
    const curve = new THREE.CatmullRomCurve3([start, middle, end]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.012 + depth * 0.018, 7, false), material));
    if (depth === 0) {
      const leaf = new THREE.Mesh(leafGeometry, material);
      leaf.position.copy(end);
      leaf.scale.set(0.8, 1.7, 0.8);
      group.add(leaf);
      return;
    }
    const count = depth > 2 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const angle = seed * 2.39996 + i * Math.PI * 2 / count;
      const spread = new THREE.Vector3(Math.cos(angle) * 0.78, 0.38, Math.sin(angle) * 0.78);
      const next = direction.clone().multiplyScalar(0.6).add(spread).normalize();
      branch(end, next, length * 0.76, depth - 1, seed * 1.4 + i + 1);
    }
  }
  branch(new THREE.Vector3(0, -2.3, 0), new THREE.Vector3(0.05, 1, 0), 1.5, 5, 1);
  const bounds = new THREE.Box3().setFromObject(group);
  const center = bounds.getCenter(new THREE.Vector3());
  group.children.forEach(child => child.position.sub(center));
  group.rotation.set(0.05, -0.45, -0.08);
  return { group, animate: (t: number) => { group.rotation.y = -0.45 + t * 0.055; } };
}

function resonance(material: THREE.MeshStandardNodeMaterial) {
  const group = new THREE.Group();
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 48; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24 + i * 0.052, 0.018, 6, 160), material);
    group.add(ring);
    rings.push(ring);
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), material);
  group.add(core);
  group.rotation.set(-0.92, -0.25, 0.25);
  return {
    group,
    animate: (t: number) => {
      rings.forEach((ring, i) => {
        const r = 0.24 + i * 0.052;
        ring.position.z = Math.sin(r * 7.5 - t * 1.2) * 0.36 * Math.exp(-r * 0.23);
      });
      core.position.z = 0.22;
      group.rotation.z = 0.25 + Math.sin(t * 0.1) * 0.09;
    },
  };
}

export function createForm(name: FormName): SourceAdapter {
  return {
    mode: "scene3d",
    kind: "field",
    label: name,
    create: ({ renderer }) => {
      const target = new THREE.RenderTarget(1, 1, { type: THREE.HalfFloatType });
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 40);
      camera.position.set(0, 0.1, 9.8);
      camera.lookAt(0, 0, 0);
      const material = new THREE.MeshStandardNodeMaterial({
        color: 0xa4c8af, roughness: 0.46, metalness: 0.22, side: THREE.DoubleSide,
      });
      const form = name === "Strata" ? strata(material) : name === "Arbor" ? arbor(material) : resonance(material);
      scene.add(form.group);
      const size = new THREE.Box3().setFromObject(form.group).getSize(new THREE.Vector3());
      scene.add(new THREE.HemisphereLight(0xb8e3c5, 0x020604, 0.22));
      const key = new THREE.DirectionalLight(0xe8f8e9, 3.6);
      key.position.set(-3, 4, 5);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xe89a70, 2.8);
      rim.position.set(4, 1, -2);
      scene.add(rim);
      const fill = new THREE.DirectionalLight(0x79bd8b, 1.3);
      fill.position.set(-4, -2, 1);
      scene.add(fill);
      const interactive = matchMedia("(hover: hover) and (pointer: fine)").matches;
      let time = 0;
      let previous = 0;
      form.animate(0);
      return {
        colorNode: texture(target.texture, screenUV),
        update: ({ elapsed, absoluteTime, width, height, pointerX, pointerY, paused, motion }) => {
          const delta = Math.max(0, Math.min(0.05, elapsed - previous));
          previous = elapsed;
          if (absoluteTime) time = elapsed * motion;
          else if (!paused) time += delta * motion;
          const renderWidth = Math.min(width, 1400);
          const renderHeight = Math.round(renderWidth * height / width);
          if (target.width !== renderWidth || target.height !== renderHeight) target.setSize(renderWidth, renderHeight);
          camera.aspect = width / height;
          const fieldOfView = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
          camera.position.z = Math.max(camera.aspect < 1.2 ? 12 : 9.8, size.x * 1.12 / (fieldOfView * camera.aspect) + size.z / 2);
          camera.updateProjectionMatrix();
          if (interactive && !paused) key.position.set(-3 + (pointerX - 0.5) * 7, 3 + (pointerY - 0.5) * 5, 5);
          form.animate(time);
          renderer.setRenderTarget(target);
          renderer.render(scene, camera);
          renderer.setRenderTarget(null);
        },
        dispose: () => {
          const geometries = new Set<THREE.BufferGeometry>();
          form.group.traverse(object => { if (object instanceof THREE.Mesh) geometries.add(object.geometry); });
          geometries.forEach(geometry => geometry.dispose());
          material.dispose();
          target.dispose();
        },
      };
    },
  };
}

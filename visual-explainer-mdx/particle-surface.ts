import * as THREE from 'three';
import type { AsciiPalette } from './ascii-frame';
import { mediaDimensions } from './media-source';
import type { ModelAsset, ParticleSettings } from './model-types';

export type ParticleSurface = Readonly<{
  root: THREE.Object3D;
  sample(seconds: number): void;
  setPalette(palette: AsciiPalette): void;
  setOptions(options: ParticleSettings): void;
  dispose(): void;
}>;
type Triangle = { mesh: THREE.Mesh; a: number; b: number; c: number; total: number };
type Binding = { mesh: THREE.Mesh; x: number; y: number; z: number; accent: boolean };
type ImageBinding = { x: number; y: number; z: number; color: THREE.Color };

// Counter-based randomness gives each sample its own stream, independent of draw order.
function random(seed: number, index: number, channel: number) {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(channel + 1, 0x85ebca6b)) >>> 0;
  value ^= value >>> 16; value = Math.imul(value, 0x7feb352d); value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b); value ^= value >>> 16;
  return (value >>> 0) / 4_294_967_296;
}

function settings(options: ParticleSettings) {
  const count = options.count ?? 12_000, seed = options.seed ?? 1;
  const pointSize = options.pointSize ?? 1.8, spread = options.spread ?? 0;
  if (!Number.isInteger(count) || count < 64 || count > 24_000) throw new Error('Point count must be an integer from 64–24,000.');
  if (!Number.isSafeInteger(seed)) throw new Error('Point seed must be a safe integer.');
  if (!Number.isFinite(pointSize) || pointSize < 0.5 || pointSize > 12) throw new Error('Point size must be from 0.5–12 pixels.');
  if (!Number.isFinite(spread) || spread < 0 || spread > 2) throw new Error('Point spread must be from 0–2.');
  return { count, seed, pointSize, spread };
}

function modelBindings(asset: ModelAsset, count: number, seed: number): Binding[] {
  const triangles: Triangle[] = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const edge = new THREE.Vector3(), side = new THREE.Vector3();
  let area = 0;
  asset.root.updateWorldMatrix(true, true);
  asset.root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    if (object instanceof THREE.SkinnedMesh || object instanceof THREE.InstancedMesh || Object.keys(object.geometry.morphAttributes).length) {
      throw new Error('Point surfaces currently support rigid meshes. Bake skinned, instanced or morph geometry to a static GLB before sampling.');
    }
    const vertices = object.geometry.getAttribute('position'), index = object.geometry.getIndex();
    if (!vertices) return;
    const length = index?.count ?? vertices.count;
    for (let offset = 0; offset + 2 < length; offset += 3) {
      const ai = index ? index.getX(offset) : offset, bi = index ? index.getX(offset + 1) : offset + 1, ci = index ? index.getX(offset + 2) : offset + 2;
      a.fromBufferAttribute(vertices, ai).applyMatrix4(object.matrixWorld);
      b.fromBufferAttribute(vertices, bi).applyMatrix4(object.matrixWorld);
      c.fromBufferAttribute(vertices, ci).applyMatrix4(object.matrixWorld);
      const triangleArea = edge.subVectors(b, a).cross(side.subVectors(c, a)).length() / 2;
      if (!Number.isFinite(triangleArea)) throw new Error('Point source contains non-finite vertices.');
      if (triangleArea <= 0) continue;
      area += triangleArea; triangles.push({ mesh: object, a: ai, b: bi, c: ci, total: area });
    }
  });
  if (!triangles.length || !Number.isFinite(area)) throw new Error('Point source has no nonzero triangle surface.');
  const accentMaterials = new Set(asset.paint?.filter(binding => binding.role === 'accent').map(binding => binding.material));
  return Array.from({ length: count }, (_, sample) => {
    // Stratified area intervals protect small surfaces without a global RNG or brightness rejection.
    const target = (sample + random(seed, sample, 0)) / count * area;
    let lower = 0, upper = triangles.length - 1;
    while (lower < upper) { const middle = (lower + upper) >>> 1; if (triangles[middle].total < target) lower = middle + 1; else upper = middle; }
    const triangle = triangles[lower], vertices = triangle.mesh.geometry.getAttribute('position');
    const u = Math.sqrt(random(seed, sample, 1)), v = random(seed, sample, 2);
    a.fromBufferAttribute(vertices, triangle.a).multiplyScalar(1 - u);
    b.fromBufferAttribute(vertices, triangle.b).multiplyScalar(u * (1 - v));
    c.fromBufferAttribute(vertices, triangle.c).multiplyScalar(u * v);
    a.add(b).add(c);
    const materials = Array.isArray(triangle.mesh.material) ? triangle.mesh.material : [triangle.mesh.material];
    return { mesh: triangle.mesh, x: a.x, y: a.y, z: a.z, accent: materials.some(material => accentMaterials.has(material)) };
  });
}

function imageBindings(asset: ModelAsset, count: number, seed: number): ImageBinding[] {
  if (!asset.image) return [];
  const original = mediaDimensions(asset.image);
  if (!original.width || !original.height) throw new Error('Decode image or video before drawing points.');
  const width = Math.max(1, Math.round(384 * Math.min(1, original.width / original.height)));
  const height = Math.max(1, Math.round(384 * Math.min(1, original.height / original.width)));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D is unavailable for point sampling.');
  context.drawImage(asset.image, 0, 0, width, height);
  let pixels: Uint8ClampedArray;
  try { pixels = context.getImageData(0, 0, width, height).data; }
  catch { throw new Error('Point imagery must be same-origin or CORS-enabled for pixel sampling.'); }
  const occupied: number[] = [];
  for (let index = 0; index < width * height; index++) if (pixels[index * 4 + 3] >= 32) occupied.push(index);
  if (!occupied.length) throw new Error('Point imagery has no visible alpha coverage.');
  const ratio = original.width / original.height;
  return Array.from({ length: count }, (_, sample) => {
    const pixel = occupied[Math.min(occupied.length - 1, Math.floor((sample + random(seed, sample, 0)) / count * occupied.length))];
    const x = pixel % width + random(seed, sample, 1), y = Math.floor(pixel / width) + random(seed, sample, 2);
    return { x: (x / width - 0.5) * 2 * ratio, y: (0.5 - y / height) * 2, z: 0,
      color: new THREE.Color().setRGB(pixels[pixel * 4] / 255, pixels[pixel * 4 + 1] / 255, pixels[pixel * 4 + 2] / 255, THREE.SRGBColorSpace) };
  });
}

/** Original area/alpha sampler. Bindings are fixed; only authored transforms and spread change. */
export function createParticleSurface(asset: ModelAsset, initial: ParticleSettings): ParticleSurface {
  let options = settings(initial), disposed = false;
  let models: Binding[] = [], images: ImageBinding[] = [];
  const geometry = new THREE.BufferGeometry(), material = new THREE.PointsMaterial({ size: options.pointSize, sizeAttenuation: false, vertexColors: true, transparent: true, alphaTest: 0.1 });
  const dot = document.createElement('canvas'); dot.width = 32; dot.height = 32;
  const context = dot.getContext('2d');
  if (!context) { geometry.dispose(); material.dispose(); throw new Error('Canvas 2D is unavailable for point sprites.'); }
  context.fillStyle = '#fff'; context.beginPath(); context.arc(16, 16, 14, 0, Math.PI * 2); context.fill();
  const texture = new THREE.CanvasTexture(dot); material.map = texture;
  const root = new THREE.Points(geometry, material); root.frustumCulled = false;
  let positions = new Float32Array(), colors = new Float32Array(), palette: AsciiPalette = { background: '#fff', ink: '#30343b', accent: '#0caec8' };
  const point = new THREE.Vector3();
  function recolor() {
    const ink = new THREE.Color(palette.ink), accent = new THREE.Color(palette.accent ?? palette.ink);
    for (let index = 0; index < options.count; index++) {
      const color = images.length ? images[index].color : models[index].accent ? accent : ink;
      colors[index * 3] = color.r; colors[index * 3 + 1] = color.g; colors[index * 3 + 2] = color.b;
    }
    geometry.getAttribute('color').needsUpdate = true;
  }
  function bind() {
    models = asset.image ? [] : modelBindings(asset, options.count, options.seed);
    images = asset.image ? imageBindings(asset, options.count, options.seed) : [];
    positions = new Float32Array(options.count * 3); colors = new Float32Array(options.count * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); recolor();
  }
  try { bind(); }
  catch (error) { geometry.dispose(); material.dispose(); texture.dispose(); throw error; }
  return {
    root,
    sample(seconds) {
      if (disposed) throw new Error('The point surface is disposed.');
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Point time must be finite and nonnegative.');
      // Caller-owned live media may have changed since the previous explicit draw.
      if (asset.image instanceof HTMLCanvasElement || asset.image instanceof HTMLVideoElement) {
        images = imageBindings(asset, options.count, options.seed); recolor();
      }
      for (let index = 0; index < options.count; index++) {
        const binding = images.length ? images[index] : models[index];
        point.set(binding.x, binding.y, binding.z);
        point.applyMatrix4(images.length ? asset.root.matrixWorld : models[index].mesh.matrixWorld);
        if (options.spread) {
          const phase = random(options.seed, index, 3) * Math.PI * 2;
          const radius = options.spread * (0.65 + 0.35 * Math.sin(seconds * 0.8 + phase));
          point.x += (random(options.seed, index, 4) - 0.5) * radius;
          point.y += (random(options.seed, index, 5) - 0.5) * radius;
          point.z += (random(options.seed, index, 6) - 0.5) * radius;
        }
        positions[index * 3] = point.x; positions[index * 3 + 1] = point.y; positions[index * 3 + 2] = point.z;
      }
      geometry.getAttribute('position').needsUpdate = true;
    },
    setPalette(next) { palette = next; recolor(); },
    setOptions(next) {
      const validated = settings(next), rebind = validated.count !== options.count || validated.seed !== options.seed;
      options = validated; material.size = options.pointSize;
      if (rebind) bind();
    },
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); geometry.dispose(); material.dispose(); texture.dispose(); }
  };
}

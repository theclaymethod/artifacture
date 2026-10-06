import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mediaDimensions, type EffectImage, type EffectSource } from './media-source';
import type { ModelAsset, ModelSource } from './model-types';

function releaseRoots(roots: readonly THREE.Object3D[]) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  for (const root of roots) {
    root.removeFromParent();
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
      if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
    });
  }
  for (const resource of skeletons) resource.dispose();
  for (const resource of textures) resource.dispose();
  for (const resource of materials) resource.dispose();
  for (const resource of geometries) resource.dispose();
}

export function modelAsset(root: THREE.Object3D, options: Pick<ModelAsset, 'sample' | 'paint'> = {}): ModelAsset {
  let disposed = false;
  return {
    root, sample: options.sample, paint: options.paint,
    dispose() {
      if (disposed) return;
      disposed = true;
      releaseRoots([root]);
    },
  };
}

export function modelAborted() { return new DOMException('The model view was disposed.', 'AbortError'); }

function awaitAsset(pending: Promise<ModelAsset>, signal: AbortSignal): Promise<ModelAsset> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const aborted = () => { if (!settled) { settled = true; reject(modelAborted()); } };
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
    pending.then(asset => {
      signal.removeEventListener('abort', aborted);
      if (signal.aborted) { asset.dispose(); return; }
      settled = true; resolve(asset);
    }, error => {
      signal.removeEventListener('abort', aborted);
      if (!settled) { settled = true; reject(error); }
    });
  });
}

function geometryAsset(kind: Extract<ModelSource, { kind: 'geometry' }>['geometry']) {
  const root = new THREE.Group();
  const ink = new THREE.MeshStandardMaterial({ color: '#a3a9ac', roughness: 0.72 });
  const accent = new THREE.MeshStandardMaterial({ color: '#24bad4', roughness: 0.72 });
  if (kind === 'blocks') {
    for (let index = 0; index < 7; index++) {
      const geometry = new THREE.BoxGeometry(0.55, 0.55 + (index % 3) * 0.42, 0.55);
      const mesh = new THREE.Mesh(geometry, index === 4 ? accent : ink);
      mesh.name = `block-${index + 1}`;
      mesh.position.set((index % 3 - 1) * 0.7, geometry.parameters.height / 2 - 0.5, (Math.floor(index / 3) - 1) * 0.7);
      root.add(mesh);
    }
  } else {
    root.add(new THREE.Mesh(kind === 'torus-knot' ? new THREE.TorusKnotGeometry(0.85, 0.25, 144, 20) : new THREE.IcosahedronGeometry(1.2, 0), ink));
    accent.dispose();
  }
  return modelAsset(root);
}

async function gltfAsset(src: string): Promise<ModelAsset> {
  if (!src.trim()) throw new Error('The glTF source URL is empty.');
  const gltf = await new GLTFLoader().loadAsync(src).catch(() => {
    throw new Error('Could not load the glTF model. Use a same-origin, uncompressed GLB with embedded textures.');
  });
  const mixer = gltf.animations.length ? new THREE.AnimationMixer(gltf.scene) : undefined;
  if (mixer) mixer.clipAction(gltf.animations[0]).setLoop(THREE.LoopRepeat, Infinity).play();
  let disposed = false;
  return {
    root: gltf.scene,
    sample: mixer ? seconds => { mixer.setTime(seconds); } : undefined,
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer?.stopAllAction(); mixer?.uncacheRoot(gltf.scene);
      releaseRoots(gltf.scenes.length ? gltf.scenes : [gltf.scene]);
    },
  };
}

async function loadedImage(source: EffectSource, signal: AbortSignal): Promise<EffectImage> {
  // eslint-disable-next-line anti-slop/no-runtime-typeof -- Public URL-or-decoded-media boundary.
  if (typeof source !== 'string') return source;
  return new Promise((resolve, reject) => {
    const image = new Image(); image.crossOrigin = 'anonymous';
    const cleanup = () => { image.onload = null; image.onerror = null; signal.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); image.src = ''; reject(modelAborted()); };
    image.onload = () => { cleanup(); resolve(image); };
    image.onerror = () => { cleanup(); reject(new Error('Could not load the model image. Use a same-origin image or enable CORS.')); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    image.src = source;
  });
}

async function imageAsset(source: EffectSource, signal: AbortSignal): Promise<ModelAsset> {
  const image = await loadedImage(source, signal);
  const size = mediaDimensions(image);
  if (!size.width || !size.height) throw new Error('Decode the image or video frame before rendering the model view.');
  const texture = new THREE.Texture(image); texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
  const root = new THREE.Mesh(new THREE.PlaneGeometry(2 * size.width / size.height, 2), new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }));
  const asset = modelAsset(root, { sample: () => { texture.needsUpdate = true; } });
  return { ...asset, image };
}

export function loadModelSource(source: ModelSource, signal: AbortSignal): Promise<ModelAsset> {
  if (signal.aborted) return Promise.reject(modelAborted());
  // eslint-disable-next-line anti-slop/no-runtime-typeof -- Public factory-or-source descriptor boundary.
  if (typeof source === 'function') {
    return awaitAsset(Promise.resolve().then(() => source({ signal })), signal);
  }
  if (source.kind === 'gltf') return awaitAsset(gltfAsset(source.src), signal);
  if (source.kind === 'image') return awaitAsset(imageAsset(source.image, signal), signal);
  return awaitAsset(Promise.resolve(geometryAsset(source.geometry)), signal);
}

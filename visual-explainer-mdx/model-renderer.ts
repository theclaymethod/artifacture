import * as THREE from 'three';
import { createAsciiFrame } from './ascii-frame';
import { effectDimensions } from './media-source';
import { loadModelSource, modelAborted } from './model-source';
import { createGlyphMatcher } from './shape-ascii';
import { createParticleSurface, type ParticleSurface } from './particle-surface';
import type { ModelAsset, ModelFrame, ModelFrameReport, ModelViewController, ModelViewOptions } from './model-types';

function snapshot(frame: ModelFrame): ModelFrame {
  const shared = { seconds: frame.seconds, palette: { ...frame.palette }, rotationSpeed: frame.rotationSpeed };
  if (frame.treatment === 'shape-ascii') return { ...shared, treatment: frame.treatment, ascii: { ...frame.ascii } };
  if (frame.treatment === 'luminance-ascii') return { ...shared, treatment: frame.treatment, luminance: { ...frame.luminance } };
  if (frame.treatment === 'particles') return { ...shared, treatment: frame.treatment, particles: { ...frame.particles } };
  return { ...shared, treatment: 'shaded' };
}

/** One model owner and source renderer; all treatments read its requested pose. */
export function createModelView(canvas: HTMLCanvasElement, options: ModelViewOptions): ModelViewController {
  const { width, height } = effectDimensions(options.width ?? 960, options.height ?? 540);
  const target = canvas.getContext('2d');
  if (!target) throw new Error('The model view requires Canvas 2D.');
  canvas.width = width; canvas.height = height;
  delete canvas.dataset.veRenderedSeconds; delete canvas.dataset.veRenderedTreatment;
  const abort = new AbortController();
  const scene = new THREE.Scene(), pivot = new THREE.Group(), fit = new THREE.Group();
  pivot.add(fit); scene.add(pivot);
  const ratio = width / height;
  const camera = new THREE.OrthographicCamera(-1.9 * ratio, 1.9 * ratio, 1.9, -1.9, 0.1, 100);
  camera.position.set(4, 3, 5); camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight('#ffffff', 1.7));
  const key = new THREE.DirectionalLight('#ffffff', 3); key.position.set(-3, 5, 6); scene.add(key);
  const fill = new THREE.DirectionalLight('#ffffff', 0.8); fill.position.set(4, 1, -2); scene.add(fill);
  const matcher = createGlyphMatcher(width, height, abort.signal), luminance = createAsciiFrame(width, height);
  let renderer: THREE.WebGLRenderer | undefined, asset: ModelAsset | undefined, ownsAsset = false;
  let particles: ParticleSurface | undefined, pointCount = 0, pointSeed = 0;
  let disposed = false, released = false, sequence = 0;
  let queue = Promise.resolve(), disposing: Promise<void> | undefined;
  const originalColors = new Map<THREE.Material, THREE.Color>();
  const release = () => {
    if (released) return;
    released = true; particles?.dispose();
    if (ownsAsset) asset?.dispose();
    matcher.dispose(); renderer?.dispose(); renderer?.forceContextLoss();
  };
  const ready = (async () => {
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true, premultipliedAlpha: false, powerPreference: 'high-performance' });
      renderer.setSize(width, height); renderer.setPixelRatio(1);
      renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
      asset = await loadModelSource(options.source, abort.signal);
      if (disposed) { asset.dispose(); throw modelAborted(); }
      if (asset.root.parent) throw new Error('A model factory must return a fresh unattached root for each view.');
      ownsAsset = true;
      asset.sample?.(0); asset.root.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(asset.root), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
      const extent = Math.max(size.x, size.y, size.z);
      if (!Number.isFinite(extent) || extent <= 0 || ![center.x, center.y, center.z].every(Number.isFinite)) throw new Error('The model has no finite renderable bounds.');
      const scale = 2.85 / extent;
      fit.scale.setScalar(scale); fit.position.copy(center).multiplyScalar(-scale); fit.add(asset.root);
      if (asset.image) { camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0); }
      for (const binding of asset.paint ?? []) {
        if (!('color' in binding.material) || !(binding.material.color instanceof THREE.Color)) throw new Error('Model paint bindings require a material with a Three Color.');
        originalColors.set(binding.material, binding.material.color.clone());
      }
    } catch (error) { release(); throw error; }
  })();
  // Acquisition can fail before the first controlled draw is requested.
  void ready.catch(() => {});
  return {
    async draw(input) {
      if (disposed) throw modelAborted();
      if (!Number.isFinite(input.seconds) || input.seconds < 0) throw new Error('Model time must be finite and nonnegative.');
      if (!Number.isFinite(input.rotationSpeed ?? 0.35) || Math.abs(input.rotationSpeed ?? 0.35) > 4) throw new Error('Model rotationSpeed must be bounded to ±4 radians/second.');
      if (!input.palette.ink.trim() || input.palette.accent !== undefined && !input.palette.accent.trim()) throw new Error('Model ink and accent must be nonempty CSS colors.');
      for (const color of [input.palette.ink, input.palette.accent, input.palette.background]) {
        if (color && !CSS.supports('color', color)) throw new Error('Model palette entries must be valid CSS colors.');
      }
      const frame = snapshot(input), request = ++sequence;
      delete canvas.dataset.veRenderedSeconds; delete canvas.dataset.veRenderedTreatment;
      const job = queue.then(async (): Promise<ModelFrameReport> => {
        await ready;
        if (disposed || !asset || !renderer) throw modelAborted();
        for (const binding of asset.paint ?? []) {
          if ('color' in binding.material && binding.material.color instanceof THREE.Color) {
            const color = binding.role === 'accent' ? frame.palette.accent ?? frame.palette.ink : frame.palette.ink;
            binding.material.color.copy(originalColors.get(binding.material) ?? binding.material.color).set(color);
          }
        }
        if (frame.treatment === 'particles') {
          const count = frame.particles?.count ?? 12_000, seed = frame.particles?.seed ?? 1;
          if (!particles || count !== pointCount || seed !== pointSeed) {
            asset.sample?.(0); pivot.rotation.y = 0; scene.updateMatrixWorld(true);
            if (particles) particles.setOptions(frame.particles ?? {});
            else { particles = createParticleSurface(asset, frame.particles ?? {}); scene.add(particles.root); }
            pointCount = count; pointSeed = seed;
          } else particles.setOptions(frame.particles ?? {});
        }
        asset.sample?.(frame.seconds);
        pivot.rotation.y = frame.seconds * (frame.rotationSpeed ?? (asset.image ? 0 : 0.35));
        scene.updateMatrixWorld(true);
        pivot.visible = frame.treatment !== 'particles';
        if (particles) {
          particles.root.visible = frame.treatment === 'particles';
          if (frame.treatment === 'particles') { particles.setPalette(frame.palette); particles.sample(frame.seconds); }
        }
        renderer.render(scene, camera);
        let glyphCount: number | undefined;
        if (frame.treatment === 'shape-ascii') glyphCount = await matcher.draw(target, renderer.domElement, frame.palette, frame.ascii);
        else if (frame.treatment === 'luminance-ascii') luminance.draw(target, renderer.domElement, { ...frame.luminance, palette: frame.palette });
        else {
          target.clearRect(0, 0, width, height);
          if (frame.palette.background) { target.fillStyle = frame.palette.background; target.fillRect(0, 0, width, height); }
          target.drawImage(renderer.domElement, 0, 0);
        }
        if (disposed) throw modelAborted();
        if (request === sequence) {
          canvas.dataset.veRenderedSeconds = String(frame.seconds); canvas.dataset.veRenderedTreatment = frame.treatment;
          canvas.dataset.backend = 'webgl';
          if (frame.treatment === 'shape-ascii') canvas.dataset.matcher = 'six-region-euclidean'; else delete canvas.dataset.matcher;
        }
        return { seconds: frame.seconds, backend: 'webgl', treatment: frame.treatment, matcher: frame.treatment === 'shape-ascii' ? 'six-region-euclidean' : undefined, glyphCount };
      });
      queue = job.then(() => {}, () => {});
      return job;
    },
    dispose() {
      if (disposing) return disposing;
      disposed = true; abort.abort();
      delete canvas.dataset.veRenderedSeconds; delete canvas.dataset.veRenderedTreatment;
      disposing = (async () => { await ready.catch(() => {}); await queue; release(); })();
      return disposing;
    },
  };
}

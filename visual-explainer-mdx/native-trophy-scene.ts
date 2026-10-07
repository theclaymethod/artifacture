// Original f-explainer source; see F-EXPLAINER-PROVENANCE.md.
import * as THREE from "three";
import {
  createTrophyModel,
  disposeTrophyModel,
  type TrophyKind,
} from "./native-trophy-models";

export interface TrophySceneOptions {
  kind: TrophyKind;
  reveal?: boolean;
  seconds?: () => number | undefined;
  onUnavailable?: () => void;
}

export function mountTrophyScene(
  canvas: HTMLCanvasElement,
  { kind, reveal = false, onUnavailable, seconds }: TrophySceneOptions,
) {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
  } catch {
    onUnavailable?.();
    return () => undefined;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(29, 1, 0.1, 40);
  camera.position.set(4.9, 3.7, 8.4);
  camera.lookAt(0, 0.2, 0);
  scene.add(new THREE.HemisphereLight(0xfff4df, 0x56443a, 2.1));
  const key = new THREE.DirectionalLight(0xffead0, 4.2);
  key.position.set(-4, 7, 6);
  key.castShadow = true;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdce8ff, 1.25);
  fill.position.set(5, 3, -3);
  scene.add(fill);

  const model = createTrophyModel(kind);
  const settledRotation = -0.18;
  model.rotation.y = settledRotation;
  scene.add(model);
  const floorMaterial = new THREE.ShadowMaterial({
    color: 0x5f463a,
    opacity: 0.14,
  });
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 32),
    floorMaterial,
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.61;
  floor.receiveShadow = true;
  scene.add(floor);

  let disposed = false,
    frame = 0;
  const contextLost = (event: Event) => {
    event.preventDefault();
    cancelAnimationFrame(frame);
    onUnavailable?.();
  };
  canvas.addEventListener("webglcontextlost", contextLost);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const render = () => renderer.render(scene, camera);
  const resize = () => {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    renderer.setSize(bounds.width, bounds.height, false);
    camera.aspect = bounds.width / bounds.height;
    camera.updateProjectionMatrix();
    render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  if (seconds || (reveal && !reduced)) {
    const start = performance.now();
    const initialY = model.position.y;
    const tick = (now: number) => {
      if (disposed) return;
      const sampled = seconds?.();
      const elapsed = Math.max(0, Math.min(sampled === undefined ? (now - start) / 720 : sampled / 0.72, 1));
      if (sampled !== undefined) canvas.dataset.sourceTime = String(sampled);
      const settle = 1 - Math.exp(-7 * elapsed) * Math.cos(elapsed * 11);
      model.position.y = initialY - 0.34 * (1 - settle);
      model.rotation.y = settledRotation - 0.22 * (1 - settle);
      if (elapsed === 1) {
        model.position.y = initialY;
        model.rotation.y = settledRotation;
      }
      render();
      if (seconds || elapsed < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    canvas.removeEventListener("webglcontextlost", contextLost);
    disposeTrophyModel(model);
    floor.geometry.dispose();
    floorMaterial.dispose();
    renderer.dispose();
  };
}

// Original f-explainer renderer core; unrelated adapters removed. See F-EXPLAINER-PROVENANCE.md.
import { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import {
  clamp,
  dot,
  float,
  floor,
  fract,
  Fn,
  If,
  max,
  mix,
  oneMinus,
  pow,
  screenUV,
  smoothstep,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

export type SourceMode = "scene3d" | "animation2d" | "ambient";
export type SourceKind =
  | "black-hole"
  | "aerial-athlete"
  | "balance-juggler"
  | "ballet-turn"
  | "medical-brain"
  | "medical-microscope"
  | "scientific-dna"
  | "field"
  | "function-mark";
export type ColorMap = "hybrid" | "intelligence" | "paper" | "source";

export type AsciiRendererSettings = {
  cellSize: number;
  exposure: number;
  gamma: number;
  globalContrast: number;
  directionalContrast: number;
  invert: boolean;
  colorMap: ColorMap;
  sourceChroma?: number;
  sourceReveal?: number;
  transparentBackground?: boolean;
  glyphs: string;
  motion: number;
  paused: boolean;
};

export type SourceAdapter = {
  mode: SourceMode;
  kind: SourceKind;
  label: string;
  create: (context: SourceContext) => SourceHandle;
};

type SourceContext = {
  renderer: THREE.WebGPURenderer;
  resolution: ReturnType<typeof uniform>;
  time: ReturnType<typeof uniform>;
  pointer: ReturnType<typeof uniform>;
};

type SourceHandle = {
  colorNode: any;
  update?: (state: FrameState) => void;
  dispose?: () => void;
};

type FrameState = {
  elapsed: number;
  absoluteTime?: boolean;
  width: number;
  height: number;
  zoom?: number;
  pointerX: number;
  pointerY: number;
  motion: number;
  paused: boolean;
};

type Props = {
  adapter: SourceAdapter;
  settings: AsciiRendererSettings;
  onReady?: (detail: RendererReport) => void;
  pointerScope?: "canvas" | "window";
  seconds?: number;
};

export type RendererReport = {
  backend: string;
  glyphCount: number;
  matcher: "six-region-euclidean";
  sourceMode: SourceMode;
};

const SAMPLE_OFFSETS = [
  [0.27, 0.20], [0.73, 0.25],
  [0.25, 0.50], [0.75, 0.50],
  [0.29, 0.80], [0.71, 0.75],
] as const;

function luminance(color: any) {
  return dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
}

function makeGlyphAtlas(glyphString: string) {
  const glyphs = Array.from(new Set([" ", ...glyphString])).slice(0, 16);
  const width = 40;
  const height = 64;
  const canvas = document.createElement("canvas");
  canvas.width = width * glyphs.length;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.fillStyle = "black";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "white";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = '52px "Fragment Mono", "SFMono-Regular", monospace';
  glyphs.forEach((glyph, index) => context.fillText(glyph, index * width + width / 2, height * 0.49));

  const image = context.getImageData(0, 0, canvas.width, height);
  const radii = [0.19, 0.19, 0.20, 0.20, 0.19, 0.19];
  const rawVectors = glyphs.map((_, glyphIndex) => SAMPLE_OFFSETS.map(([sx, sy], sampleIndex) => {
    let inside = 0;
    let covered = 0;
    const radius = radii[sampleIndex];
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const nx = (x + 0.5) / width;
        const ny = (y + 0.5) / height;
        if ((nx - sx) ** 2 + (ny - sy) ** 2 > radius ** 2) continue;
        inside++;
        const px = glyphIndex * width + x;
        covered += image.data[(y * canvas.width + px) * 4] / 255;
      }
    }
    return inside ? covered / inside : 0;
  }));
  const maxima = SAMPLE_OFFSETS.map((_, index) => Math.max(0.001, ...rawVectors.map((vector) => vector[index])));
  const vectors = rawVectors.map((vector) => vector.map((value, index) => value / maxima[index]));
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.NoColorSpace;
  atlas.minFilter = THREE.LinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  atlas.needsUpdate = true;
  return { atlas, glyphs, vectors };
}

function createGlyphPass(
  sourceTexture: THREE.Texture,
  atlasTexture: THREE.Texture,
  glyphVectors: number[][],
  glyphCount: number,
  uniforms: ReturnType<typeof createRendererUniforms>,
) {
  const glyphVectorNodes = glyphVectors.map((values) => [
    uniform(new THREE.Vector3(values[0], values[1], values[2])),
    uniform(new THREE.Vector3(values[3], values[4], values[5])),
  ]);
  return Fn(() => {
    const pixel = screenUV.mul(uniforms.resolution);
    const cell = vec2(uniforms.cellSize.mul(0.625), uniforms.cellSize);
    const cellId = floor(pixel.div(cell));
    const local = fract(pixel.div(cell));
    const internal: any[] = [];
    const external: any[] = [];
    SAMPLE_OFFSETS.forEach(([x, y]) => {
      const offset = vec2(x, y);
      const sampleUv = cellId.add(offset).mul(cell).div(uniforms.resolution);
      const outward = offset.sub(0.5).mul(1.18);
      const externalUv = cellId.add(offset.add(outward)).mul(cell).div(uniforms.resolution);
      const base = clamp(luminance(texture(sourceTexture, sampleUv)).mul(uniforms.exposure), 0, 1);
      const outside = clamp(luminance(texture(sourceTexture, externalUv)).mul(uniforms.exposure), 0, 1);
      internal.push(mix(base, oneMinus(base), uniforms.invert));
      external.push(mix(outside, oneMinus(outside), uniforms.invert));
    });
    let peak = max(max(internal[0], internal[1]), max(internal[2], internal[3]));
    peak = max(peak, max(internal[4], internal[5]));
    const normalizedSamples = internal.map((value, index) => {
      const global = pow(value.div(max(peak, 0.001)), uniforms.globalContrast).mul(peak);
      const directionalPeak = max(global, external[index]);
      const directional = pow(global.div(max(directionalPeak, 0.001)), uniforms.directionalContrast).mul(directionalPeak);
      return pow(mix(global, directional, uniforms.directionalMix), uniforms.gamma);
    });
    const sampleA = vec3(normalizedSamples[0], normalizedSamples[1], normalizedSamples[2]);
    const sampleB = vec3(normalizedSamples[3], normalizedSamples[4], normalizedSamples[5]);
    const bestDistance = float(999).toVar("glyphBestDistance");
    const bestIndex = float(0).toVar("glyphBestIndex");
    glyphVectorNodes.forEach(([vectorA, vectorB], index) => {
      const deltaA = sampleA.sub(vectorA);
      const deltaB = sampleB.sub(vectorB);
      const distance = dot(deltaA, deltaA).add(dot(deltaB, deltaB));
      If(distance.lessThan(bestDistance), () => {
        bestDistance.assign(distance);
        bestIndex.assign(index);
      });
    });
    // Keep bilinear sampling inside each glyph tile. Sampling directly on the
    // tile edge leaks the neighboring glyph into otherwise empty cells and
    // reveals the renderer's cell lattice as vertical and horizontal lines.
    const atlasSafeLocal = vec2(
      local.x.mul(38).add(1).div(40),
      local.y.mul(62).add(1).div(64),
    );
    const atlasUv = vec2(bestIndex.add(atlasSafeLocal.x).div(glyphCount), atlasSafeLocal.y);
    const glyphCoverage = texture(atlasTexture, atlasUv).r;
    // True whitespace is part of the luminance ramp. Suppress sub-threshold
    // source residue so dark regions stay empty instead of exposing one faint
    // mark per cell as a visible grid.
    const sourcePresence = smoothstep(0.035, 0.085, peak);
    const cleanGlyphCoverage = glyphCoverage.mul(sourcePresence);
    const sourceCenter = texture(sourceTexture, cellId.add(0.5).mul(cell).div(uniforms.resolution));
    const intelligence = vec3(0.475, 0.741, 0.545);
    const paperInk = vec3(0.12, 0.12, 0.13);
    const sourceColor = clamp(sourceCenter.rgb.mul(1.7), 0, 1);
    const sourceLuma = max(luminance(sourceColor), 0.001);
    const sourceHue = sourceColor.div(sourceLuma);
    const hybridColor = clamp(intelligence.mul(0.68).add(sourceHue.mul(intelligence).mul(0.42)), 0, 1);
    const mappedBase = mix(intelligence, hybridColor, uniforms.hybridMap);
    const foreground = mix(mix(mappedBase, paperInk, uniforms.paperMap), sourceColor, uniforms.sourceMap);
    // Linear-light values for Mineral Signal void #0D1916. Raw sRGB channel
    // values would be converted again at output and appear as a washed sage.
    const background = mix(vec3(0.004025, 0.009721, 0.008023), vec3(0.965, 0.945, 0.90), uniforms.paperMap);
    const asciiComposite = mix(background, foreground, cleanGlyphCoverage);
    const rawPresence = smoothstep(0.025, 0.18, luminance(sourceColor));
    const sourceUnderlay = mix(background, sourceColor, rawPresence.mul(0.82));
    const opaqueComposite = mix(asciiComposite, sourceUnderlay, uniforms.sourceReveal);
    const finalColor = mix(opaqueComposite, foreground, uniforms.transparentBackground);
    const finalAlpha = mix(float(1), cleanGlyphCoverage, uniforms.transparentBackground);
    return vec4(finalColor, finalAlpha);
  })();
}

function createRendererUniforms(settings: AsciiRendererSettings) {
  return {
    resolution: uniform(new THREE.Vector2(1, 1)),
    time: uniform(0),
    pointer: uniform(new THREE.Vector2(0.5, 0.5)),
    cellSize: uniform(settings.cellSize),
    exposure: uniform(settings.exposure),
    gamma: uniform(settings.gamma),
    globalContrast: uniform(settings.globalContrast),
    directionalContrast: uniform(settings.directionalContrast),
    directionalMix: uniform(settings.directionalContrast > 1.01 ? 1 : 0),
    invert: uniform(settings.invert ? 1 : 0),
    hybridMap: uniform(settings.colorMap === "hybrid" ? 1 : 0),
    paperMap: uniform(settings.colorMap === "paper" ? 1 : 0),
    sourceMap: uniform(settings.sourceChroma ?? (settings.colorMap === "source" ? 1 : 0)),
    sourceReveal: uniform(settings.sourceReveal ?? 0),
    transparentBackground: uniform(settings.transparentBackground ? 1 : 0),
  };
}

export function AsciiRenderer({ adapter, settings, onReady, pointerScope = "canvas", seconds }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef(settings);
  const secondsRef = useRef(seconds);
  secondsRef.current = seconds;
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    let disposed = false;
    let animationFrame = 0;
    let renderer: THREE.WebGPURenderer | null = null;
    let target: THREE.RenderTarget | null = null;
    let sourceMaterial: THREE.MeshBasicNodeMaterial | null = null;
    let glyphMaterial: THREE.MeshBasicNodeMaterial | null = null;
    let atlas: THREE.CanvasTexture | null = null;
    let sourceHandle: SourceHandle | null = null;
    let geometry: THREE.PlaneGeometry | null = null;
    const pointerTarget = { x: 0.5, y: 0.5 };
    const pointerState = { x: 0.5, y: 0.5 };
    const onPointer = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointerTarget.x = clampNumber((event.clientX - bounds.left) / Math.max(1, bounds.width), 0, 1);
      pointerTarget.y = clampNumber((bounds.bottom - event.clientY) / Math.max(1, bounds.height), 0, 1);
    };
    if (pointerScope === "window") window.addEventListener("pointermove", onPointer, { passive: true });
    else canvas.addEventListener("pointermove", onPointer, { passive: true });

    void (async () => {
      await document.fonts.load('52px "Fragment Mono"');
      const glyphAtlas = makeGlyphAtlas(settingsRef.current.glyphs);
      atlas = glyphAtlas.atlas;
      const uniforms = createRendererUniforms(settingsRef.current);
      renderer = new THREE.WebGPURenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
      await renderer.init();
      renderer.setClearColor(0x000000, 0);
      if (disposed) return;
      const backendName = renderer.backend.constructor.name;
      const isWebGPU = /webgpu/i.test(backendName);
      geometry = new THREE.PlaneGeometry(2, 2);
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
      camera.position.z = 1;
      const sourceScene = new THREE.Scene();
      const glyphScene = new THREE.Scene();
      sourceHandle = adapter.create({ renderer, resolution: uniforms.resolution, time: uniforms.time, pointer: uniforms.pointer });
      sourceMaterial = new THREE.MeshBasicNodeMaterial();
      sourceMaterial.colorNode = sourceHandle.colorNode;
      sourceMaterial.toneMapped = false;
      sourceScene.add(new THREE.Mesh(geometry, sourceMaterial));
      target = new THREE.RenderTarget(16, 9, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
      glyphMaterial = new THREE.MeshBasicNodeMaterial();
      glyphMaterial.colorNode = createGlyphPass(target.texture, glyphAtlas.atlas, glyphAtlas.vectors, glyphAtlas.glyphs.length, uniforms);
      glyphMaterial.toneMapped = false;
      glyphMaterial.transparent = true;
      glyphMaterial.depthWrite = false;
      glyphScene.add(new THREE.Mesh(geometry, glyphMaterial));
      canvas.dataset.renderer = "shape-aware-six-region";
      canvas.dataset.backend = isWebGPU ? "webgpu" : "webgl2-fallback";
      canvas.dataset.sourceMode = adapter.mode;
      canvas.dataset.sourceKind = adapter.kind;
      const born = performance.now();
      let previousPaused = false;
      let heldTime = 0;
      const render = (now: number) => {
        if (!renderer || !target || disposed) return;
        const live = settingsRef.current;
        const bounds = canvas.getBoundingClientRect();
        const dpr = Math.min(devicePixelRatio || 1, 1.35);
        const width = Math.max(1, Math.round(bounds.width * dpr));
        const height = Math.max(1, Math.round(bounds.height * dpr));
        if (target.width !== width || target.height !== height) target.setSize(width, height);
        renderer.setPixelRatio(dpr);
        renderer.setSize(Math.max(1, bounds.width), Math.max(1, bounds.height), false);
        uniforms.resolution.value.set(width, height);
        const sampled = secondsRef.current;
        const controlled = sampled !== undefined;
        pointerState.x += (pointerTarget.x - pointerState.x) * 0.09;
        pointerState.y += (pointerTarget.y - pointerState.y) * 0.09;
        if (controlled) { pointerState.x = 0.5; pointerState.y = 0.5; }
        uniforms.pointer.value.set(pointerState.x, pointerState.y);
        if (!live.paused) heldTime = (now - born) * 0.001;
        if (live.paused && !previousPaused) heldTime = (now - born) * 0.001;
        if (controlled) heldTime = sampled;
        canvas.dataset.sourceTime = String(heldTime);
        previousPaused = live.paused;
        uniforms.time.value = heldTime;
        uniforms.cellSize.value = live.cellSize;
        uniforms.exposure.value = live.exposure;
        uniforms.gamma.value = live.gamma;
        uniforms.globalContrast.value = live.globalContrast;
        uniforms.directionalContrast.value = live.directionalContrast;
        uniforms.directionalMix.value = live.directionalContrast > 1.01 ? 1 : 0;
        uniforms.invert.value = live.invert ? 1 : 0;
        uniforms.hybridMap.value = live.colorMap === "hybrid" ? 1 : 0;
        uniforms.paperMap.value = live.colorMap === "paper" ? 1 : 0;
        const sourceChromaTarget = live.sourceChroma ?? (live.colorMap === "source" ? 1 : 0);
        if (controlled) {
          uniforms.sourceMap.value = sourceChromaTarget;
          uniforms.sourceReveal.value = live.sourceReveal ?? 0;
        }
        uniforms.sourceMap.value += (sourceChromaTarget - uniforms.sourceMap.value) * 0.085;
        uniforms.sourceReveal.value += ((live.sourceReveal ?? 0) - uniforms.sourceReveal.value) * 0.075;
        uniforms.transparentBackground.value = live.transparentBackground ? 1 : 0;
        sourceHandle?.update?.({ elapsed: heldTime, absoluteTime: controlled, width, height, pointerX: pointerState.x, pointerY: pointerState.y, motion: live.motion, paused: live.paused });
        renderer.setRenderTarget(target);
        renderer.render(sourceScene, camera);
        renderer.setRenderTarget(null);
        renderer.render(glyphScene, camera);
        animationFrame = requestAnimationFrame(render);
      };
      animationFrame = requestAnimationFrame(render);
      onReady?.({ backend: isWebGPU ? "Three.js TSL / WebGPU" : "Three.js TSL / WebGL 2 fallback", glyphCount: glyphAtlas.glyphs.length, matcher: "six-region-euclidean", sourceMode: adapter.mode });
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      if (pointerScope === "window") window.removeEventListener("pointermove", onPointer);
      else canvas.removeEventListener("pointermove", onPointer);
      sourceHandle?.dispose?.();
      geometry?.dispose();
      sourceMaterial?.dispose();
      glyphMaterial?.dispose();
      atlas?.dispose();
      target?.dispose();
      renderer?.dispose();
    };
  }, [adapter, settings.glyphs, onReady, pointerScope]);

  return <canvas ref={canvasRef} className="ascii-canvas" aria-label={`${adapter.label}, rendered with measured glyph coverage`} style={{ display: "block", width: "100%", height: "100%" }} />;
}

function clampNumber(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}


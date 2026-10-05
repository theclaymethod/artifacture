# Media effects and 3D sources

Copy the effects into a workspace:

```sh
artifacture add ascii-image ascii-sweep ascii-object vhs --cwd ./explainer
```

These are independently authored effects. CanvasUI's [pinned license](https://github.com/DavidHDev/canvas-ui/blob/a04a99b235299ee79a123a16ccb2e6cf9da74b6b/LICENSE.md) allows use in an application or website but prohibits redistributing the components themselves, including bundles and ports. No CanvasUI source enters Artifacture's copy registry. The original [sweep](https://canvasui.dev/docs/components/ascii-sweep), [object](https://canvasui.dev/docs/components/ascii-object), and [VHS](https://canvasui.dev/docs/components/vhs) remain visual references.

## Small contracts

| Block | Inputs | Output |
| --- | --- | --- |
| ascii-image | URL or live media, palette, cells, contrast, polarity | A glyph image on Canvas 2D |
| ascii-sweep | Two media sources, progress 0–1, direction, seed | Exact source endpoints with a glyph band between them |
| ascii-object | Uncompressed glTF/GLB or prepared geometry, seconds, palette | A Three.js turntable sampled by the same glyph renderer |
| vhs | Media, seconds, strength, grain, scanlines, aberration | A WebGL texture treatment |

The original media glyph sampler is a luminance ramp. The selected [model visuals](model-visuals.md) add a separate measured six-region shape matcher, procedural factories, GLB reuse and original point sampling. `AsciiObject` retains its ramp behavior through the shared ModelView lifecycle.

`EffectSource` accepts a URL, image, canvas, decoded video element or ImageBitmap. Use same-origin assets or servers with CORS permission. No experimental browser flags, HTML-in-canvas capture or arbitrary DOM screenshot support is required. Capture a `GraphicCanvas` SVG as an image first when applying a media treatment. Keep accessible diagram labels and captions in the unfiltered layer.

The canvas frame is bounded to 2,073,600 pixels; glyph grids to 240×135. `cellSize` is a logical frame-pixel height, 5–80; the monospace width is 0.6 of that height. Ramps contain 2–64 characters ordered sparse to dense. Use `invert` for dark ink on light opaque media. Palette input supplies background, ink and optional accent; the gallery reads the host theme's CSS roles. Transparency is supported by the glyph outputs.

## One clock

Effects do not own RAF, autoplay, timers or incremental random state. Supply the same authored `seconds` used by the composition. `AsciiSweep` uses explicit progress and a stable cell seed. VHS noise uses a frame index derived from time. `AsciiObject` derives turntable rotation directly from time and seeks the first glTF animation clip. Model sources release meshes, textures, materials and WebGL resources on replacement/unmount; late loads are discarded.

For a video source, its decoded frame is caller-owned. Seek media and await decoding before sampling, or use HyperFrames-managed media timing. Setting the effect's seconds does not seek an HTML video. Reduced-motion preference freezes decorative outer turntable/VHS motion; meaningful source animation and user-controlled reveals retain their authored time.

```tsx
const palette = { background: '#fff', ink: '#202127', accent: '#079fba' };
<AsciiObject model={{ kind: 'gltf', src: '/models/blocks.glb' }}
  seconds={seconds} palette={palette} label="Assembly turntable" />
<AsciiSweep from={before} to={after} progress={progress}
  palette={palette} invert label="Assembly reveal" />
<VhsEffect source={decodedCanvas} seconds={seconds}
  strength={0.3} label="Archive footage" />
```

Use a sampled canvas frame as a poster, a still inside a slide, or a texture in a video. This is a presentation layer; original SVG geometry and `.blend` sources remain editable upstream. The [worked gallery](../examples/visual-explainer-mdx/media-effects.tsx) demonstrates four themes, bidirectional scrubbing, prepared geometry, a GLB URL input, and downloadable PNG frames.

## Blender and model workflow

Use Blender when a source requires modeled geometry, modifiers, rigging or baked simulation. Author neutral materials with a single contrasting accent. Retain the `.blend` file and an asset provenance/license receipt. Export an uncompressed GLB with embedded textures for a compact browser asset. Apply needed modifiers and bake procedural materials to supported PBR textures. Keep large textures and mesh detail appropriate to the shot. Draco/KTX decoding is not installed or fetched by this block.

An original [starter](../examples/media-native/blender-blocks.py) copies with `ascii-object`:

```sh
blender --background --python src/artifacture/blender-blocks.py -- --out public/models/blocks
```

It saves both editable `.blend` and GLB. Blender is optional and separate from npm; the starter's Python syntax is checked, but it has not been executed in this environment because Blender is unavailable. [Blender's glTF manual](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html) and the [Three.js loader](https://threejs.org/docs/pages/GLTFLoader.html) describe the native interchange boundary.

For complex simulations, unsupported materials or costly geometry, render deterministic PNG frames or an opaque MP4 in Blender, preserve the source/receipt, and pass that prepared media through the image/sweep/VHS blocks. Place baked MP4 on a HyperFrames-managed video element with explicit clip and source timing. The current NativeClip engine contract covers Manim and Psychopomp; it does not identify Blender output. Keep text and narration captions after the effects.

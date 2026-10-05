# Native animation engines

Use Manim Community for mathematics and Psychopomp for physical diagrams or native code-review choreography. Browser graphics remain the default for editable shared scenes. Native engines add a source-to-clip boundary: retain their source and renderer pin, render once, then compose the clip and its selected frames with the existing document, poster, slide and video components.

```sh
artifacture engine list --json
artifacture engine setup manim
artifacture engine scaffold manim ./math-scene --theme 3b1b
artifacture engine render ./math-scene/manim.job.json --out ./math-scene/render

artifacture engine setup psychopomp
artifacture engine scaffold psychopomp ./physical-diagram
artifacture engine render ./physical-diagram/psychopomp.job.json --out ./physical-diagram/render
```

Inside this checkout, substitute `node scripts/artifacture.mjs` for `artifacture`. `ARTIFACTURE_ENGINE_HOME` can select a different native cache. Setup is explicit; ordinary workspace creation and browser export do not download a native engine. Scaffolding and rendering refuse to replace existing output directories.

## Setup

Both engines need FFmpeg and ffprobe on PATH. Manim also needs `uv`, Cairo/Pango and pkg-config. On macOS, `brew install cairo pango pkgconf ffmpeg` supplies the native libraries. On Debian/Ubuntu, the corresponding prerequisites are `libcairo2-dev`, `libpango1.0-dev`, `pkg-config`, and `ffmpeg`; install these with your normal package manager before setup.

Manim uses isolated Python 3.12.11, Manim Community 0.21.0, and the committed hash-checked dependency lock. MathTypst uses the pinned Python Typst compiler; the supplied scene requires neither a system Typst CLI nor TeX. Inter and EB Garamond are bundled with their OFL licenses and registered for the scene without installing them system-wide. Other Manim scenes may use MathTex, which needs its own TeX tooling.

Psychopomp uses upstream revision `156444d4fee830a9c88307b2c27352412cd5c18d`, its Cargo lock, and isolated Rust 1.99.0. Unix setup can bootstrap rustup into the engine cache without editing the shell profile. It needs a compatible native GPU; the first build is larger than a browser dependency install. The adapter supports macOS and Linux setup; actual native render receipts are from macOS. Windows setup is not implemented. Upstream is MIT; its CommitMono font and Phosphor icon licenses stay in the cached source tree.

## Author and render

A job has a stable identity, meaningful title, engine, confined relative source path, theme, output dimensions/FPS, and requested still times. Manim additionally names its Scene class. Psychopomp accepts a single Rust Scene Program that writes its plan to the first CLI argument, or an existing upstream Scene Plan JSON. The Rust adapter exposes `psychopomp`, `anyhow` and `serde_json`; arbitrary Cargo projects or sibling Rust modules are outside this initial adapter. The supplied examples are self-contained. Preserve additional assets and imported Python modules separately when authoring a more complex scene.

`ARTIFACTURE_NATIVE_THEME` passes the resolved theme JSON to the source. Manim receives `ARTIFACTURE_NATIVE_FONT` for its bundled display font. The sample reads those inputs instead of introducing a separate palette.

Hairline is the default. All four retained presets resolve paint and stroke tokens from `visual-explainer-mdx/themes.css`. The Manim example uses the resolved colors, thin strokes and display font. Psychopomp receives four additional theme variants through a small, anchor-checked paint adapter over the pinned source. Its native geometry, spring channels, shader materials, and CommitMono text renderer remain upstream implementations; this is not the browser Hairline illustration kernel. Bloom, grain and vignette are disabled in the supplied physical-diagram scene. Semantic states retain labels while sharing one accent.

The result directory contains:

- `clip.mp4`: opaque H.264/AAC media, normalized to the requested even dimensions and integer FPS.
- `poster.png` and `still-*.png`: decoded delivery frames. Still times select the nearest encoded frame; the manifest records both requested and sampled seconds. Requests outside the encoded range reject.
- `manifest.json`: the reusable asset, actual native and delivery settings, engine pin, theme/source hashes and file hashes.
- `source/`: the native entry source, normalized job and emitted Psychopomp plan where applicable.
- `theme.json`, the Manim configuration or Psychopomp inspection and Scene Program lock: production receipts.

Psychopomp's internal file renderer uses 1920×1080 at 60 fps. The adapter records that separately from the requested delivery. It validates plans before rendering. Failed renders remove their temporary output and publish no success manifest.

## Reuse the output

```tsx
import { NativeClip, NativeStill, validateNativeClipAsset } from './artifacture/native-clip';
import manifest from './render/manifest.json';
const asset = validateNativeClipAsset(manifest.asset);

<NativeClip asset={asset} baseUrl="/media/math-scene" />;
<NativeStill asset={asset} baseUrl="/media/math-scene" at={9.8} />;
// Inside a HyperFrames composition: the framework owns decoding and seeking.
<NativeClip asset={asset} baseUrl="./media/math-scene"
  placement={{ start: 6, duration: asset.duration, mediaStart: 0, track: 2 }} />;
```

JSON imports widen string literals in some TypeScript configurations. Pass imported JSON through the production `validateNativeClipAsset` boundary before use rather than casting untrusted data. The validator returns a detached, frozen asset. Copies are indexed by `artifacture list --query manim --json`, `--query psychopomp`, and `--query native`; `artifacture add manim-clip` or `psychopomp-clip` includes the native source, job and browser media components. Native setup is a separate command.

Native pixels cannot become editable GraphicScene geometry. Use the browser primitives when agent-editable relationships and vector output matter; use native scenes for capabilities that justify a rendered asset. A clip's repeated seeks decode the same saved frames; that does not claim a live Manim or Rust simulation runs inside the browser. Transparent overlays and native presentation control are not implemented by this adapter.

## References

- [Manim Community installation](https://docs.manim.community/en/stable/installation/uv.html), [MathTypst](https://docs.manim.community/en/stable/reference/manim.mobject.text.typst_mobject.MathTypst.html).
- [Psychopomp pinned source](https://github.com/kitlangton/psychopomp/tree/156444d4fee830a9c88307b2c27352412cd5c18d), [Scene Plans](https://github.com/kitlangton/psychopomp/blob/156444d4fee830a9c88307b2c27352412cd5c18d/SCENE_PLANS.md), [MIT license](https://github.com/kitlangton/psychopomp/blob/156444d4fee830a9c88307b2c27352412cd5c18d/LICENSE).
- [Inter](https://github.com/google/fonts/tree/main/ofl/inter), [EB Garamond](https://github.com/google/fonts/tree/main/ofl/ebgaramond). Bundled font files retain their adjacent OFL notices.

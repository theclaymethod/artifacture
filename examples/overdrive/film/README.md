# Make the invisible obvious

A 52.33-second narrated film demonstrating ISO illustration, an actual Anatomy mechanism, native FFrames composition, and fresh Ainthony synthetic narration. The story moves from a system's parts to its behavior, then carries the explanation across media. The code review is an illustrative example, not a claim about a particular PR.

## Native handoffs

The dial indicator is upstream Anatomy at commit `240a9bf7c50cc6226148762a1017466fcbc08523`. `capture-anatomy.mjs` opens its built light-theme page in Chromium and advances a controlled clock. It sends ordinary keyboard gestures to the upstream carriage/probe/needle model. The resulting media is composed in FFrames with `get_synced_video_frame`. No geometry, physics, or browser renderer was ported into Artifacture. The wrapper only removes the page frame, suppresses focus outlines for capture, uses white background, and makes the moving needle orange.

The other illustrations are scene-specific Rust/SVG; springs and easing come from FFrames. The mathematical transform is native SVG, not Manim. Anatomy source is MIT licensed; see ANATOMY-LICENSE.

## Reproduce

Prerequisites: native FFrames 1.2 toolchain, FFmpeg, project-local Playwright with Chromium, and the user's Ainthony voice runner/cache. Cargo.lock pins Rust dependencies. Rendering uses Skia/Metal on macOS.

1. Fetch Anatomy and build its figure:

   ```sh
   git clone https://github.com/wheresryan22/anatomy.git /tmp/overdrive-anatomy
   git -C /tmp/overdrive-anatomy checkout 240a9bf7c50cc6226148762a1017466fcbc08523
   node /tmp/overdrive-anatomy/examples/dial-indicator/build.mjs --light
   ```

2. From the Artifacture repository, capture and encode the actual mechanism:

   ```sh
   node examples/overdrive/film/capture-anatomy.mjs /tmp/overdrive-anatomy
   mkdir -p examples/overdrive/film/dynamic_media
   ffmpeg -framerate 30 -i artifacts/overdrive/anatomy-frames/%04d.png -c:v libx264 -crf 16 -pix_fmt yuv420p examples/overdrive/film/dynamic_media/anatomy.mp4
   ```

3. Generate `narration.txt` through the existing Ainthony 1.1.0 runner, seed131, into `dynamic_media/ainthony.wav`. This voice is a user-local dependency, not a bundled cloud service or substitute voice. The delivery preserves the original generation receipt and independent recognition. No pitch or speed change was applied. This cut's timing follows the supplied voice recording; a new take may require new scene durations.

4. In this directory:

   ```sh
   cargo build --release
   cargo run --release -- preview 12.8s
   cargo run --release -- inspect --fail-on warning
   cargo run --release -- audio analyze
   cargo run --release -- render -o ../../../artifacts/overdrive/overdrive.mp4
   ```

Generated audio and video stay outside the source commit. Delivery files, caption track, native timeline, contact sheet, and verification receipt are under `artifacts/overdrive/`.

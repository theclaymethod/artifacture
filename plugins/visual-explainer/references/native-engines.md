# Native animation blocks

Use Manim Community for formula transforms and mathematics, or Psychopomp for physical diagrams, spring channels and code choreography. Discover the actual capabilities with the installed CLI:

```sh
node "$SKILL_DIR/scripts/artifacture.mjs" engine list --json
node "$SKILL_DIR/scripts/artifacture.mjs" list --query native --json
```

Read the runtime's [native-engine guide](../../../docs/native-engines.md) before setup or authoring. Obtain `REPO` with the installed CLI's `path` command when following repository examples. Setup is explicit and optional; inspect its prerequisites before invoking `engine setup`. `engine scaffold` creates editable native source and a render job. `engine render` preserves source, engine/theme hashes, actual encoded timing and selected frames.

Copy `manim-clip` or `psychopomp-clip` into the workspace. Both include `NativeClip`, `NativeStill`, the manifest decoder and a native starter. Validate `manifest.asset` before placing it, use its actual duration, and let HyperFrames own seeking when `placement` is supplied. Source and job paths are local; ship rendered media alongside the consuming composition.

Native clips are opaque pixels. Their editable Python or Rust source remains separate from SVG geometry. Use browser `GraphicScene` builders for editable vectors and relationships. The theme adapters resolve the four retained presets from the shared tokens; Psychopomp keeps its native geometry, text renderer and simulation.

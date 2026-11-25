# Splat VFX Playground (`playground/splat-vfx`)

Interactive WebGPU 3D Gaussian Splatting presentation deck and 9-mode shader sandbox powered by [`@sparkjsdev/radix`](https://github.com/sparkjsdev/radix), Three.js WebGPU, and TSL (Three Shading Language).

Kept in `playground/splat-vfx/` outside `packages/*` so Artifacture v2 core packages remain small and stock `@open-slide/core` compatible.

## Contents

- **`deck/`** — 8-slide live WebGPU presentation moving directly through real 3DGS worlds:
  1. **Intro (Forest Clearing)** — `2.36M` dual-world `SplatCollection` (SH0)
  2. **Chaotic Gravity Rift** — continuous push-in as a 3-octave FBM wormhole tears open with zero-gap Einstein lensing (`r' = sqrt(r^2 + R^2)`)
  3. **Gravitational Slingshot Launch** — continuous exponential launch (`u^2.35`) + warp-FOV kick (`53° -> 78° -> 56°`) crossing the membrane into the sunlit alien desert canyon
  4. **Neon Tokyo Counter-Parallax** — `500k` splats with opposing foreground/background depth shear & traveling sinusoidal wave
  5. **Neon Tokyo Micro-Gaussian Bloom** — continuous intra-scene morph into pinpoint neon constellations with AgX bloom
  6. **Volumetric Smoke & Ash Dissolution** — `262k` Stone Buddha eroding along a diagonal front with analytic 3D curl advection
  7. **Stark B&W LiDAR Shockwave** — `10M SH3` packed Grace Cathedral nave swept by a pure-white spherical wavefront with stochastic point-cloud decimation
  8. **Pipeline Summary** — architectural comparison table + live Free-Orbit exploration toggle
- **`fx-lab/`** — Full 9-mode interactive shader sandbox (`shockwave`, `dissolve`, `neon`, `geowave`, `vortex`, `mpm`, `voxel`, `singularity`, `tokyo`) across 20 scenes + CUDA MPM playback (`MpmPlayback.ts`).
- **`scripts/`** — Zero-build TypeScript dev server (`serve.mjs`), WebGPU Playwright verifier + demo recorder (`verify-deck.mjs`), and vertical sizzle reel render/audio scripts (`render-vertical-sizzle-v9.mjs`, `synth-sizzle-v9-audio.mjs`).

## Running Locally

```bash
# From artifacture-v2 repo root:
pnpm playground:splat
# or:
node playground/splat-vfx/scripts/serve.mjs
```

Open:
- Hub: `http://127.0.0.1:4190/`
- Slide Deck: `http://127.0.0.1:4190/deck/`
- FX Lab: `http://127.0.0.1:4190/fx-lab/`

By default `serve.mjs` mounts `@sparkjsdev/radix`, `three`, and large `.spz`/`.rdx` scan assets from the sibling `../radix` checkout (`RADIX_ROOT` env var overrides this path).

## Slide Deck Controls

| Key | Action |
| --- | --- |
| `→` / `Space` / `PageDown` | Next slide (continuous intra-world transition when sharing a scene) |
| `←` / `PageUp` | Previous slide (reverses smoothly through the wormhole on 3 → 2) |
| `1`–`8` | Jump directly to a slide |
| `R` | Replay active slide's VFX cycle (re-dissolve Buddha, re-pulse B&W LiDAR) |
| `O` | Toggle live Free-Orbit camera (`CameraControls`) |
| `N` | Toggle speaker notes drawer |
| `G` | Open slide overview grid |
| `H` | Hide slide typography for pure full-bleed canvas view |

## Verification

```bash
# Capture all 8 slides + mid-wormhole transition + 4x2 contact sheet in WebGPU Chromium:
node playground/splat-vfx/scripts/verify-deck.mjs

# Also record a 1280x720 30fps live presentation walkthrough MP4:
node playground/splat-vfx/scripts/verify-deck.mjs --video
```

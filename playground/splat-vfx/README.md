# Splat VFX Playground (`playground/splat-vfx`)

Interactive WebGPU 3D Gaussian Splatting presentation deck and 9-mode shader sandbox powered by [`@sparkjsdev/radix`](https://github.com/sparkjsdev/radix), Three.js WebGPU, and TSL (Three Shading Language).

- **Live Deployment:** https://playground.claytonkim.com/splat-deck/ (Cloudflare Workers Static Assets worker `gaussian-splat-deck`)

Kept in `playground/splat-vfx/` outside `packages/*` so Artifacture v2 core packages remain small and stock `@open-slide/core` compatible.

## Contents

- **`deck/`** — 8-slide live WebGPU presentation moving directly through real 3DGS worlds (`52.4 MB` total across all 5 Morton-sorted `.spz` assets, `14.5×` smaller than `758.8 MB` raw captures):
  1. **Intro (Forest Clearing)** — `1.36M` dual-world 16:9 `SplatCollection` (`18.9 MB` SH0 SPZ)
  2. **Spherical Wormhole & Einstein Lens** — single-play continuous glide with symmetric Schwarzschild gravitational lensing (`r' = sqrt(r^2 + R^2)`) around a smooth spherical horizon and singularity-free spherical refraction inside
  3. **Gravitational Slingshot Launch** — continuous exponential launch (`u^2.35`) + warp-FOV kick (`40° -> 62° -> 39°`) crossing the membrane into the sunlit alien desert canyon
  4. **Neon Tokyo Counter-Parallax** — `400k` splats (`5.7 MB` SPZ) with opposing foreground/background depth shear & traveling sinusoidal wave
  5. **Neon Tokyo Micro-Gaussian Bloom** — continuous intra-scene morph into pinpoint neon constellations with AgX bloom
  6. **Volumetric Smoke & Ash Dissolution** — `240k` Stone Buddha (`2.9 MB` SPZ) eroding along a diagonal front with analytic 3D curl advection
  7. **Stark B&W LiDAR Shockwave** — `1.62M` floater-filtered, 3D voxel-density-equalized Grace Cathedral (`24.9 MB` SPZ, `29×` smaller than `715 MB` 10M SH3) swept by a pure-white spherical wavefront
  8. **Pipeline Summary** — architectural comparison table + live Free-Orbit exploration toggle
- **`fx-lab/`** — Full 9-mode interactive shader sandbox (`shockwave`, `dissolve`, `neon`, `geowave`, `vortex`, `mpm`, `voxel`, `singularity`, `tokyo`) across 20 scenes + CUDA MPM playback (`MpmPlayback.ts`).
- **`scripts/`** — Zero-build TypeScript dev server (`serve.mjs`), 3D voxel-density-equalized Morton SPZ optimizer (`optimize-all-splats.mjs`), standalone Cloudflare static bundle builder (`build-deck-dist.mjs`), WebGPU Playwright verifier + demo recorder (`verify-deck.mjs`), and vertical sizzle reel render/audio scripts (`render-vertical-sizzle-v9.mjs`, `render-vertical-sizzle-v10.mjs`, `synth-sizzle-v9-audio.mjs`).

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

By default `serve.mjs` mounts `@sparkjsdev/radix`, `three`, and `.spz`/`.rdx` scan assets from the sibling `../radix` checkout (`RADIX_ROOT` env var overrides this path).

## Optimizing Assets & Deploying to Cloudflare

```bash
# Re-generate floater-filtered, voxel-equalized, Morton-sorted *-opt.spz payloads (each < 25 MiB):
node --max-old-space-size=8192 playground/splat-vfx/scripts/optimize-all-splats.mjs

# Build standalone static bundle and deploy to https://playground.claytonkim.com/splat-deck/:
cd playground/splat-vfx
node scripts/build-deck-dist.mjs
cf deploy
```

## Slide Deck Controls

| Key | Action |
| --- | --- |
| `→` / `Space` / `PageDown` | Next slide (continuous intra-world transition when sharing a scene) |
| `←` / `PageUp` | Previous slide (reverses smoothly through the wormhole on 3 → 2) |
| `1`–`8` | Jump directly to a slide |
| `R` | Replay active slide's VFX cycle (re-open wormhole, re-dissolve Buddha, re-pulse B&W LiDAR) |
| `O` | Toggle live Free-Orbit camera (`CameraControls`) |
| `N` | Toggle speaker notes drawer |
| `G` | Open slide overview grid |
| `H` | Hide slide typography for pure full-bleed canvas view |

## Verification

```bash
# Capture all 8 slides + wormhole progression + Grace 360° strip + live monotonic check in WebGPU Chromium:
node playground/splat-vfx/scripts/verify-deck.mjs

# Also record a 1920x1080 30fps live presentation walkthrough MP4:
node playground/splat-vfx/scripts/verify-deck.mjs --video
```

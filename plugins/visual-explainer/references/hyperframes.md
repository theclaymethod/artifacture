# Render video with Hyperframes

[Hyperframes](https://github.com/heygen-com/hyperframes) renders HTML compositions through headless Chrome and encodes video with FFmpeg. It runs locally without a cloud account, API key, or HeyGen service. The renderer is open source under Apache 2.0.

This reference summarizes the integration contract the visual-explainer skill uses. For the full upstream specification, see the [Hyperframes docs](https://hyperframes.heygen.com/) and the LLM-optimized index at [`hyperframes.mintlify.app/llms.txt`](https://hyperframes.mintlify.app/llms.txt).

## Delegation boundary

Use upstream skills for runtime mechanics. Use Artifacture's references for composition, visual defaults, and review.

**Upstream `/hyperframes`, `/hyperframes-cli`, `/gsap` own:**
- Motion / caption / transition / highlight vocab → GSAP ease mapping
- TTS voice matrix by content type (`af_heart`, `af_nova`, `am_adam`, `bf_emma`, `af_sky`, `am_michael`, …)
- Timed-element contract (`class="clip"` + `data-start` / `data-duration` / `data-track-index`)
- `npx hyperframes preview` — live browser preview during authoring
- `npx hyperframes check` — lint, runtime, layout, and WCAG audit; `snapshot` — inspected authored frames
- General GSAP idiom (see `/gsap` skill)

**Artifacture owns:**
- Topic-to-video and deck-to-video command routing.
- The [default explainer theme](default-explainer-theme.md) across formats and its [motion choreography](motion-video-baseline.md), or the requested visual identity.
- Reel structure in `references/reel-patterns.md`.
- Material-choice handling in `references/clarify.md`.
- Draft rendering, keyframe inspection, and delivery.
- `hyperframes-doctor.sh` runtime and skill checks.

**Availability.** `hyperframes-doctor.sh` probes `~/.agents/skills/`, `~/.codex/skills/`, `~/.claude/skills/`, and `~/.claude/plugins/cache/heygen-com/` for upstream skills. Probe outcomes:

- **Installed** → use upstream runtime guidance with Artifacture composition rules.
- **Missing** → the doctor emits a warning and install hint (`npx skills add heygen-com/hyperframes`) and video commands fall back to authoring directly from our refs (`hyperframes.md`, `gsap-rules.md`, `reel-patterns.md`). Never fatal.

## Runtime Requirements

- Node.js ≥ 22.12
- FFmpeg and `ffprobe` on `PATH`
- Chrome/Chromium (Puppeteer will download `chrome-headless-shell` on first run, ~150–300MB)

Run `scripts/hyperframes-doctor.sh` before rendering. Resolve reported runtime prerequisites and continue any independent source authoring. Missing companion skills remain non-fatal.

## Invocation

Use `npx` or a global installation:

**1. npx.** No global installation required. The first run may download the package.
```bash
npx hyperframes init my-video
npx hyperframes lint
npx hyperframes render --output out.mp4 --quality standard
```

**2. Global install.** For projects that render often.
```bash
npm install -g hyperframes
hyperframes render ...
```

The skill defaults to `npx hyperframes …` to avoid imposing a global install.

## Composition source

Read [default-explainer-theme.md](default-explainer-theme.md) and [motion-video-baseline.md](motion-video-baseline.md) before authoring a new video without a supplied design spec. Reuse the shared scene geometry, host theme roles, and illustration rules. Existing templates demonstrate runtime mechanics; their visual treatment does not override the default theme.

Keep the editable composition in TSX and generate HTML with `ve:export-static`. A Hyperframes project contains that HTML and its media assets. The root composition is an HTML file where the `<div id="stage">` (or any root element) carries `data-composition-id`, `data-width`, `data-height`, `data-start`, and `data-duration` attributes. Nested `<video>`, `<img>`, and `<audio>` elements each carry `data-start`, `data-duration`, and `data-track-index`.

Animations are driven by a GSAP timeline registered on `window.__timelines["<composition-id>"]`, created with `{ paused: true }`.

See the upstream docs for exact attribute reference; see our templates (`templates/hyperframes-longform.html`, `templates/hyperframes-reel.html`) for working starters.

## Hard Constraints (violating these breaks renders)

These rules come from the upstream project and are non-negotiable:

- **Timelines must be `{ paused: true }`.** The engine drives seeking; if the timeline auto-plays, frames will be nondeterministic.
- **Register the completed timeline** on `window.__timelines["<id>"]`. Artifacture's shared exporter registers synchronously. For source-owned compositions, follow the installed renderer's readiness contract; do not publish a partially constructed clock.
- **No `Math.random()`, no `Date.now()`, no real-time logic.** The capture is frame-seeked, not real-time. If randomness is needed, use a seeded PRNG.
- **No `repeat: -1`** (infinite tweens). Engine hangs. Compute finite repeat count from duration if you need looping.
- **Video elements must carry `muted playsinline`.** Audio travels separately as `<audio>` elements (even when the source file is the same).
- **Never call `video.play()` / `audio.play()` / `.seek()` manually.** The engine owns playback.
- **Root standalone compositions do NOT use `<template>` wrappers.** Sub-compositions (loaded via `data-composition-src`) DO.
- **Every audio element needs a unique ID and explicit timing.** HyperFrames owns seeking and mixing. `data-track-index` is a Studio lane; use CSS `z-index` for visual stacking.

See `references/gsap-rules.md` for the GSAP-specific version of this list.

## Render Flags

The skill uses a standard set of flags:

| Flag | Skill default | Notes |
|---|---|---|
| `--output` | `~/.agent/videos/<slug>.mp4` | Always under `~/.agent/videos/` |
| `--fps` | `30` (long-form), `30` (reel) | `60` doubles render time |
| `--quality` | `draft` (verify), then `standard` (final) | `high` for delivery masters |
| `--format` | `mp4` | `webm` only when transparency is needed |
| `--workers` | `auto` | Parallel Chrome instances |
| `--strict` | on | Lint errors fail the render |

## Skill Workflow

For both `/generate-video` and `/render-video`:

```
1. Check renderer prerequisites and pin its project version
2. Author a causal story, shared scenes, and finite motion
3. Generate/measure narration, align cues, and retime the source
4. Export the shared video with audio, or a source-owned complete composition
5. Run hyperframes check and snapshot; inspect events, cuts, and reverse seeking
6. Run Artifacture verification and disclose incomplete certification
7. Encode, inspect decoded frames and delivered audio, then deliver
```

Inspect the source preview before encoding. Use a draft render when encoded motion or media needs review; rerender after repairs or for a requested delivery master. Honor existing authorization. See [dynamic-video-authoring.md](dynamic-video-authoring.md) for primitive selection and choreography.

## Output Defaults

| Style | Aspect | Resolution | Duration target | FPS |
|---|---|---|---|---|
| `long-form` | 16:9 | 1920 × 1080 | 60–180 seconds | 30 |
| `reel` | 9:16 | 1080 × 1920 | 30–60 seconds | 30 |

Honor explicitly requested durations outside these ranges. Otherwise use 60 seconds for long-form and 45 seconds for a reel; clarify a material conflict through `clarify.md` without repeating an answered question.

## Ancillary CLI Tools the Skill Uses

- `npx hyperframes tts "<text>" --voice <name> --output narration.wav` — generate narration locally. Voices ship with the Hyperframes install.
- `npx hyperframes transcribe narration.wav` — produce a caption track. The skill burns captions into reel outputs by default (silent autoplay) and offers captions as a side `.vtt` for long-form.
- `npx hyperframes add <transition-name>` — pull shader/mask transitions from the Hyperframes registry (e.g., `flash-through-white`, `domain-warp-dissolve`). Use them only at a meaningful scene boundary.
- `npx hyperframes benchmark` — measures render wall-clock on the current machine.

## Attribution

Hyperframes is © HeyGen, Apache 2.0 licensed. The integration in this skill shells out to the upstream CLI; no upstream source is vendored. Our own patterns for explainer-specific animation (kinetic typography, progressive diagram reveal, TTS+caption sync, waveform-synced hard cuts) live in `references/reel-patterns.md`.

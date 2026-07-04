# Hyperframes — HTML → MP4 / WebM Video Rendering

**What it is.** [Hyperframes](https://github.com/heygen-com/hyperframes) is an open-source (Apache 2.0) local video renderer from HeyGen. Compositions are authored as HTML with `data-*` timing attributes and GSAP timelines. The engine renders frames via headless Chrome and encodes with FFmpeg. No cloud account, no API keys, no HeyGen service dependency — it runs entirely on the user's machine.

This reference summarizes the integration contract the visual-explainer skill uses. For the full upstream specification, see the [Hyperframes docs](https://hyperframes.heygen.com/) and the LLM-optimized index at [`hyperframes.mintlify.app/llms.txt`](https://hyperframes.mintlify.app/llms.txt).

---

## Delegation boundary (upstream vs us)

Lean on the upstream skills where they cover the mechanics; keep our own authoring for the opinionated layers they don't know about.

**Upstream `/hyperframes`, `/hyperframes-cli`, `/gsap` own:**
- Motion / caption / transition / highlight vocab → GSAP ease mapping
- TTS voice matrix by content type (`af_heart`, `af_nova`, `am_adam`, `bf_emma`, `af_sky`, `am_michael`, …)
- Timed-element contract (`class="clip"` + `data-start` / `data-duration` / `data-track-index`)
- `npx hyperframes preview` — live browser preview during authoring
- `npx hyperframes lint` + `validate` — rule + WCAG audit
- General GSAP idiom (see `/gsap` skill)

**We own:**
- 6 recipes + entry routing (`explainer-longform`, `social-reel`, `announcement-bumper` on `/generate-video`; `deck-to-video`, `overlay-transparent`, `browser-loop` on `/render-video`)
- Mono-industrial aesthetic enforcement (`references/mono-industrial.md`)
- Reel grammar (HOOK → PROBLEM → CONTEXT → MECHANISM → PROOF → RESOLUTION → CTA in `references/reel-patterns.md`)
- Clarify-first policy (`references/clarify.md`)
- Draft-render + keyframe review gate (step 5–7 of the skill workflow)
- `hyperframes-doctor.sh` runtime + skill probe

**Availability.** `hyperframes-doctor.sh` probes `~/.claude/skills/` and `~/.claude/plugins/cache/heygen-com/` for the upstream skills. Probe outcomes:

- **Installed** → video commands delegate vocab + plumbing to `/hyperframes` and author recipe + aesthetic on top.
- **Missing** → the doctor emits a warning and install hint (`npx skills add heygen-com/hyperframes`) and video commands fall back to authoring directly from our refs (`hyperframes.md`, `gsap-rules.md`, `reel-patterns.md`). Never fatal.

---

## Runtime Requirements

- Node.js ≥ 22
- FFmpeg on `PATH`
- Chrome/Chromium (Puppeteer will download `chrome-headless-shell` on first run, ~150–300MB)

The skill runs `npx hyperframes doctor` at the start of any video command to verify these are present. If anything fails, the command aborts with install hints rather than attempting to render. See `scripts/hyperframes-doctor.sh`.

---

## Invocation

Two idiomatic paths:

**1. npx (no install).** Zero-install path. Slightly slower first run, always-current.
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

---

## Composition Shape

A Hyperframes project is one HTML file (or several) + media assets. The root composition is an HTML file where the `<div id="stage">` (or any root element) carries `data-composition-id`, `data-width`, `data-height`, `data-start`, and `data-duration` attributes. Nested `<video>`, `<img>`, and `<audio>` elements each carry `data-start`, `data-duration`, and `data-track-index`.

Animations are driven by a GSAP timeline registered on `window.__timelines["<composition-id>"]`, created with `{ paused: true }`.

See the upstream docs for exact attribute reference; see our templates (`templates/hyperframes-longform.html`, `templates/hyperframes-reel.html`) for working starters.

---

## Hard Constraints (violating these breaks renders)

These rules come from the upstream project and are non-negotiable:

- **Timelines must be `{ paused: true }`.** The engine drives seeking; if the timeline auto-plays, frames will be nondeterministic.
- **Timelines must be registered synchronously** on `window.__timelines["<id>"]` before `DOMContentLoaded` settles. No `async`, no `setTimeout`, no Promise-wrapped construction.
- **No `Math.random()`, no `Date.now()`, no real-time logic.** The capture is frame-seeked, not real-time. If randomness is needed, use a seeded PRNG.
- **No `repeat: -1`** (infinite tweens). Engine hangs. Compute finite repeat count from duration if you need looping.
- **Video elements must carry `muted playsinline`.** Audio travels separately as `<audio>` elements (even when the source file is the same).
- **Never call `video.play()` / `audio.play()` / `.seek()` manually.** The engine owns playback.
- **Root standalone compositions do NOT use `<template>` wrappers.** Sub-compositions (loaded via `data-composition-src`) DO.
- **`data-track-index` controls audio mixing and overlap validation, not visual z-order.** For z-order use CSS `z-index`.

See `references/gsap-rules.md` for the GSAP-specific version of this list.

---

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

---

## Skill Workflow

For both `/generate-video` and `/render-video`:

```
1. npx hyperframes doctor            # abort on missing deps
2. Build the composition              # HTML + GSAP timeline + assets
3. npx hyperframes lint               # abort on errors
4. npx hyperframes validate           # WCAG contrast audit
5. npx hyperframes render -q draft    # fast preview pass
6. extract-keyframes.sh out.mp4       # 3 keyframes from the draft
7. Show keyframes, ask user to approve
8. npx hyperframes render -q standard # final pass on approval
```

The draft-first gate exists because high-quality renders can take minutes per 30 seconds of video; catching layout bugs in the draft saves time.

---

## Output Defaults

| Style | Aspect | Resolution | Duration target | FPS |
|---|---|---|---|---|
| `long-form` | 16:9 | 1920 × 1080 | 60–180 seconds | 30 |
| `reel` | 9:16 | 1080 × 1920 | 30–60 seconds | 30 |

Longer than these ranges is allowed but requires explicit user request — AskUserQuestion should confirm before rendering.

---

## Ancillary CLI Tools the Skill Uses

- `npx hyperframes tts "<text>" --voice <name> --output narration.wav` — generate narration locally. Voices ship with the Hyperframes install.
- `npx hyperframes transcribe narration.wav` — produce a caption track. The skill burns captions into reel outputs by default (silent autoplay) and offers captions as a side `.vtt` for long-form.
- `npx hyperframes add <transition-name>` — pull shader/mask transitions from the Hyperframes registry (e.g., `flash-through-white`, `domain-warp-dissolve`). The skill uses these between slides in the long-form style.
- `npx hyperframes benchmark` — measures render wall-clock on the current machine.

---

## Attribution

Hyperframes is © HeyGen, Apache 2.0 licensed. The integration in this skill shells out to the upstream CLI; no upstream source is vendored. Our own patterns for explainer-specific animation (kinetic typography, progressive diagram reveal, TTS+caption sync, waveform-synced hard cuts) live in `references/reel-patterns.md`.

---
description: Generate an explainer video (MP4) via Hyperframes. Long-form or reel.
argument-hint: "<topic or outline> [--style=long-form|reel] [--duration=Ns] [--voice=<name>] [--no-ask]"
---

# /generate-video

Turn a topic, outline, or source document into an MP4 with Hyperframes.

**Input:** a topic, outline, or source document.
**Output:** one MP4 in `~/.agent/videos/<slug>.mp4` plus 3 keyframe PNGs for review.
Rendering typically takes 30 seconds to 5 minutes, depending on duration and quality.

Write the composition in TSX, register a paused GSAP timeline synchronously on `window.__timelines["<id>"]`, and export static HTML:

```bash
npm run ve:export-static -- <composition.tsx> --out ~/.agent/videos/<slug>/index.html
```

Hyperframes renders `index.html`; revisions belong in TSX. Re-export before linting, validating, or rendering. Use `templates/hyperframes-*.html` for timing and GSAP examples. Hand-write final HTML only if React static export is blocked, and report the fallback.

## Styles

Honor `--style` or the request; otherwise use long-form.

### `long-form`

- **Aspect:** 16:9 landscape, 1920×1080
- **Duration:** 60–180 seconds
- **Pacing:** Slide-paced, 10s average dwell per scene, 6–12 scenes
- **Audience:** Team meetings, onboarding, LinkedIn, docs embeds
- **Reference template:** `templates/hyperframes-longform.html`
- **Animations:** Fade-ups, count-ups, cross-fades between scenes, optional shader transitions at major beat boundaries
- **Audio:** TTS narration over dwell scenes; optional soft bed

### `reel`

- **Aspect:** `--aspect=9:16` (default, vertical 1080×1920) OR `--aspect=16:9` (landscape 1920×1080)
- **Duration:** 30–60 seconds (default 45s)
- **Pacing:** Hard cuts every 1.2–1.8s; 6–8 beats; hook within 2s
- **Audience — 9:16:** Shorts / Reels / TikTok silent-autoplay feeds
- **Audience — 16:9:** X/Twitter embeds, LinkedIn, YouTube-embedded, desktop shares, conference intro stings
- **Reference templates:**
  - `templates/hyperframes-reel.html` (9:16)
  - `templates/hyperframes-reel-landscape.html` (16:9)
- **Animations:** Kinetic typography (word-by-word), progressive diagram reveal, Ken Burns on imagery, shader transitions at beat boundaries. 16:9 MECHANISM beats use native split-screen (before/after side-by-side) instead of vertical stacks.
- **Audio:** TTS narration with burned-in captions; safe zones adapt (9:16 bottom 200px for phone chrome and caption clearance, 16:9 bottom 140px for a centered caption pill)
- **Read:** `references/reel-patterns.md` § Two aspect ratios — authoritative guide for picking between 9:16 and 16:9 and the layout rules that differ between them.

## Workflow

### 1. Clarify

Use `references/clarify.md` for material unresolved choices. Honor supplied style, duration, audience, and narration without reconfirmation.

### 2. Check prerequisites

```bash
bash {{skill_dir}}/scripts/hyperframes-doctor.sh
```

If this exits non-zero, **abort** and forward the install hints to the user. Do not attempt to render.

Missing upstream skills produce non-fatal warnings. When available, use `/hyperframes`, `/hyperframes-cli`, and `/gsap` for their runtime and motion guidance. Otherwise use the local references. See `references/hyperframes.md` → "Delegation boundary".

### 3. Author the composition

Use the upstream `/hyperframes` guidance for easing, captions, transitions, voices, and `class="clip"` timing when installed. Artifacture's references define the composition and reel structure.

- **Long-form:** Author a TSX composition using `templates/hyperframes-longform.html` as reference material. Build one scene per major beat from the outline. Edit the script before placing it in the composition; use Unslop when requested and available.
- **Reel:** Author a TSX composition using `templates/hyperframes-reel.html` or `templates/hyperframes-reel-landscape.html` as reference material. Compress the outline to HOOK → PROBLEM → CONTEXT → MECHANISM → PROOF → RESOLUTION → CTA. Every scene is a single claim.

Follow the hard rules in `references/gsap-rules.md`:
- Timeline is `{ paused: true }` and registered on `window.__timelines["<id>"]` synchronously
- No `Math.random`, `Date.now`, `repeat: -1`, `setTimeout` in the timeline builder
- `<video>` elements have `muted playsinline` (none in default templates)
- `<audio>` lives in separate elements, not video tracks

Export the static generated HTML before continuing:

```bash
npm run ve:export-static -- ~/.agent/videos/<slug>/<slug>.tsx --out ~/.agent/videos/<slug>/index.html
```

### 4. Narration

Include narration unless the request or `--no-narration` omits it:

```bash
npx hyperframes tts "Your script here, written as one paragraph." \
  --voice af_nova \
  --output ~/.agent/videos/<slug>/narration.wav
```

Use the requested voice or `af_nova`. Consult Hyperframes' current voice menu if the brief needs another voice.

For reel: generate captions from narration:
```bash
npx hyperframes transcribe ~/.agent/videos/<slug>/narration.wav \
  --output ~/.agent/videos/<slug>/narration.vtt
```

Use the VTT output to pace the burned-in caption layer in the reel template. Each caption aligns with a beat boundary.

### 5. Lint + validate

```bash
cd ~/.agent/videos/<slug>
npx hyperframes lint
npx hyperframes validate   # WCAG contrast audit
```

Resolve any errors before rendering. `--strict` is applied on render so unresolved lint errors will abort the render anyway.

### 6. Draft render

```bash
npx hyperframes render \
  --output ~/.agent/videos/<slug>-draft.mp4 \
  --quality draft \
  --fps 30 \
  --strict
```

### 7. Extract keyframes

```bash
bash {{skill_dir}}/scripts/extract-keyframes.sh \
  ~/.agent/videos/<slug>-draft.mp4 \
  ~/.agent/videos/<slug>/keyframes
```

Inspect the 3 keyframes and fix clipping, illegible text, or incorrect content before the final render. Show them through the available preview. Continue when final rendering is already authorized; resolve any required approval without repeating consent from the session.

### 8. Final render

```bash
npx hyperframes render \
  --output ~/.agent/videos/<slug>.mp4 \
  --quality standard \
  --fps 30 \
  --strict
```

Use `--quality high` only if the user explicitly asks for a delivery master. `high` ~doubles render time.

### 9. Deliver

Report:
- Final MP4 path
- Duration / file size / resolution
- Thumbnail (first keyframe) inline if the surface supports it
- If hosting was requested, use a video-capable destination; `share.sh` handles HTML only

## Flags

| Flag | Default | Notes |
|---|---|---|
| `--style=<long-form\|reel>` | long-form | Honor an explicit reel request |
| `--aspect=<9:16\|16:9>` | 16:9 (long-form), 9:16 (reel) | Only meaningful for `--style=reel` (long-form is always 16:9) |
| `--duration=<Ns>` | 60 (long-form), 45 (reel) | Enforced ranges 30–180s |
| `--voice=<name>` | `af_nova` | Hyperframes TTS voice |
| `--no-narration` | off | Skip TTS; silent video |
| `--no-captions` | off | Reel only; default is captions on |
| `--quality=<draft\|standard\|high>` | standard | Final-pass quality |
| `--fps=<24\|30\|60>` | 30 | `60` doubles render time |
| `--no-ask` | off | Use defaults for optional choices |

## References

- `references/hyperframes.md` — runtime, constraints, CLI flags
- `references/gsap-rules.md` — GSAP constraints for Hyperframes
- `references/reel-patterns.md` — reel format rules (authoritative for reel style)
- `references/clarify.md` — when a choice needs clarification
- `templates/hyperframes-longform.html`, `templates/hyperframes-reel.html` — starter compositions

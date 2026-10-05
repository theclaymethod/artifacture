---
description: Generate an explainer video (MP4) via Hyperframes. Long-form or reel.
argument-hint: "<topic or outline> [--mode=<instructional-mode>] [--collection=<manifest.json> --episode=<id>] [--style=long-form|reel] [--duration=Ns] [--voice=<name>] [--no-ask]"
---

# /generate-video

Turn a topic, outline, or source document into an MP4 with Hyperframes.

**Input:** a topic, outline, or source document.
**Output:** one MP4 in `~/.agent/videos/<slug>.mp4` plus 3 keyframe PNGs for review.
Rendering typically takes 30 seconds to 5 minutes, depending on duration and quality.

Write reusable graphic scenes in TSX, compose them with `createSlideScene` and `sequenceSlides`, and export `sequence`. Render the first pose with `GraphicVideo`; the bundled exporter supplies its paused GSAP clock and registers it synchronously on `window.__timelines["<id>"]`.

Use the [Hairline motion baseline](../references/motion-video-baseline.md) by default. Illustrations carry the explanation, with fine-line objects, consistent visual correspondence, and purposeful transformations. An explicit brand or requested look takes precedence. Use the baseline for visual treatment in either supported composition route.

```bash
npm run ve:graphic-video -- <composition.tsx> --out ~/.agent/videos/<slug>/index.html
```

Hyperframes renders `index.html`; revisions belong in TSX. Keep the HTML beside its local content-hashed runtime asset, and re-export before linting, validating, or rendering. Use [the shared graphics guide](../../../docs/graphics-and-video.md) and [the long-form example](../../../examples/visual-explainer-mdx/video-longform.tsx) for source authoring. The shared sequence supports finite graphic motion and hard cuts between beats.

`ve:export-static` keeps its distinct SSR content and document contract. Use it for a source-owned complete composition that already includes a self-contained browser timeline, including delivery layers beyond shared graphics such as narration or captions. It does not bundle the `GraphicVideo` runtime. The `templates/hyperframes-*.html` files remain references for that contract. Hand-write final HTML only if the appropriate TSX exporter is blocked, and report the fallback.

## Instructional modes and collections

Mode describes the viewer's task. Style describes delivery format. Print the canonical purposes, required mode fields, and review questions with `npm run ve:video-collection -- modes`. Honor `--mode`; otherwise infer it from the request. Read [video-collections.md](../references/video-collections.md) for a multi-episode collection or any mode-specific brief.

For `--collection`, validate the supplied manifest and select `--episode` by its semantic ID. Use its audience, terms, subjects, pinned claims, narration draft, and handoff. Review `SCRIPT.md` as a draft before committing to the story. Manifest validation does not approve a script or complete a video.

Generated collection compositions use the same shared graphics route and bundled exporter. Primitives support diagrams and posters, diagram scenes compose into slides, and complete slide scenes sequence into video.

## Styles

Honor `--style` or the request; otherwise use long-form.

### `long-form`

- **Aspect:** 16:9 landscape, 1920×1080
- **Duration:** 60–180 seconds
- **Pacing:** Slide-paced, 10s average dwell per scene, 6–12 scenes
- **Audience:** Team meetings, onboarding, LinkedIn, docs embeds
- **Source example:** `examples/visual-explainer-mdx/video-longform.tsx`; `templates/hyperframes-longform.html` covers source-owned delivery layers
- **Animations:** Progressive illustration, coupled transformations, and deliberate holds. Preserve object identity across beats; shared sequences use hard cuts at scene boundaries. The long-form source example replaces its earlier 0.3s fades with those supported cuts.
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

- **Long-form:** Author reusable graphic scenes and one `createSlideScene` per major beat. Compose their finite durations with `sequenceSlides` and export `sequence`. Edit the script before placing it in the composition; use Unslop when requested and available.
- **Reel:** Use the same shared scene API with frame dimensions for the requested aspect ratio. Compress the outline to HOOK → PROBLEM → CONTEXT → MECHANISM → PROOF → RESOLUTION → CTA. Every scene is a single claim. Use the source-owned reel templates when caption or other delivery layers require their complete document contract.

The shared exporter owns the timeline; keep authored motion finite and deterministic. For a source-owned browser timeline, follow the hard rules in `references/gsap-rules.md`:
- Timeline is `{ paused: true }` and registered on `window.__timelines["<id>"]` synchronously
- No `Math.random`, `Date.now`, `repeat: -1`, `setTimeout` in the timeline builder
- `<video>` elements have `muted playsinline` (none in default templates)
- `<audio>` lives in separate elements, not video tracks

Export the bundled shared video before continuing:

```bash
npm run ve:graphic-video -- ~/.agent/videos/<slug>/<slug>.tsx --out ~/.agent/videos/<slug>/index.html
```

Use `ve:export-static` at this step only for the source-owned complete composition contract described above.

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
| `--duration=<Ns>` | 60 (long-form), 45 (reel) | Honor an explicit positive duration; typical ranges are guidance |
| `--mode=<id>` | inferred from task | Registry and contract from `ve:video-collection -- modes` |
| `--collection=<manifest.json>` | none | Validated collection knowledge and episode briefs |
| `--episode=<id>` | none | Required when selecting an episode from a collection |
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
- `docs/graphics-and-video.md`, `examples/visual-explainer-mdx/video-longform.tsx` — shared source and bundled export
- `templates/hyperframes-longform.html`, `templates/hyperframes-reel.html` — source-owned complete composition references

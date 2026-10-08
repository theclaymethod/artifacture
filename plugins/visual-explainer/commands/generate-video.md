---
description: Create a visually driven animated explainer, PR review, or sizzle reel with reusable scenes, aligned narration, and an encoded MP4.
argument-hint: "<topic or outline> [--mode=<instructional-mode>] [--collection=<manifest.json> --episode=<id>] [--style=long-form|reel] [--duration=Ns] [--voice=<name>] [--no-ask]"
---

# /generate-video

Turn a topic, inspected change, outline, or source document into an editable animated film. Deliver the MP4, source, timing/claim receipts, and decoded review frames. Use the installed CLI from the skill directory; obtain its ready runtime with `REPO=$(node "$SKILL_DIR/scripts/artifacture.mjs" path)`.

Read [dynamic-video-authoring.md](../references/dynamic-video-authoring.md) before writing the story. It teaches narrative modes, implemented primitive choices, continuous subjects, choreography, narration alignment, and film review. Read [motion-video-baseline.md](../references/motion-video-baseline.md) for Hairline / 3b1b styling. Explicit user styling takes precedence.

## Establish the moving argument

Honor the supplied audience, voice, scope, duration, and session authorization. Infer ordinary choices. Use [clarify.md](../references/clarify.md) only for a material unresolved choice; continue independent work while it is pending.

For a code review, pin the exact PR/diff base and head and bind claims to inspected files and observed checks. Show the trigger, changed owner or condition, architectural consequence, proof, and remaining boundary. Replay the input after a correction. For a nontechnical film, maintain the analogy's correspondence and explain its limit. For a sizzle reel, give each showcased capability a complete, recognizable action.

Mode is the viewer's task, style is the delivery format, and engine is the renderer. Print canonical mode fields with `npm --prefix "$REPO" run ve:video-collection -- modes`. Read [video-collections.md](../references/video-collections.md) for shared episodes or mode-specific briefs. Scaffolding creates editable drafts; validation does not approve the script or finish the film. Honor the session's script approval or autonomous iteration preferences.

| Style | Starting format | Compose for |
| --- | --- | --- |
| `long-form` | 1920×1080, 16:9, 30fps; usually 60–180s | A question, a visible mechanism, evidence, and a readable conclusion. Narration determines timing. |
| `reel` | 1080×1920, 9:16, 30fps; usually 30–60s | An immediate event and dense, readable progression. Use 16:9 when requested for desktop sharing. |

Honor explicit durations outside these ranges. Otherwise begin around 60s for an explainer or 45s for a reel and adjust to the story/audio. Read [reel-patterns.md](../references/reel-patterns.md) for aspect-specific safe zones and captions. Author a narrow composition for portrait output.

## Author the scenes

Discover actual blocks with `list --query <capability> --json` and read selected constraints and examples. Start with `REPO/examples/visual-explainer-mdx/motion-review.tsx` for a continuous request/code/comparison story, `video-longform.tsx` for a smaller diagram cascade, or `math-activation.tsx` for mathematical construction.

Keep a brief, script, and beat sheet beside the source. Each beat names its entry state, event, consequence, evidence, and intended speech cue. Move the mechanism and preserve identifiable subjects. Hold completed states long enough to read them: `inspectEndHolds` (`end-holds`) reports tracks still changing within 0.75 s of a cut and cues that appear within 1.1 s of it.

Settle the story before recording. Offer two or three structures when the opening or an analogy is open (a question first, the analogy as the mechanism itself, a closing callback), map any analogy to the real mechanism, and get the script approved. Every later script change re-records narration and re-times each beat.

Author TSX with shared scene builders. Compile finite motion, combine blocks with `composeGraphics`, frame them with `createSlideScene`, and export one `sequenceSlides` sequence. The exporter bundles the renderer and registers its paused GSAP clock synchronously on `window.__timelines`. A sequence cuts between scenes; one continuous scene can carry many beats.

Use the dynamic guide to choose routes, source edits, registered comparisons, dependency cascades, physical assemblies, mathematical clips, and effects. Read [native-engines.md](../references/native-engines.md) when Manim or Psychopomp improves the mechanism. A native starter or upstream reference is not a rendered capability.

For cameras, captions, or other delivery layers beyond the shared sequence, use a source-owned complete composition with `export-static` and [gsap-rules.md](../references/gsap-rules.md). Derive camera moves from content with `frameScene` (`scene-framing`) rather than hand-placed keys, and pass them as `GraphicMotion.camera`; it keeps everything that has appeared in view and below a reserved type band. Kinetic type (`kinetic-type`), arrive/leave phrases (`motion-phrases`), `scale` and `value` tracks, and `zoom-through` slide transitions are shared-sequence features, so they also reach the FFrames bridge. Preserve the shared renderer and one finite master clock. Revisions belong in editable source; re-export after repairs.

## Record and align narration

Include narration unless omitted. Honor `--voice` or the established session voice; otherwise `af_nova` is an available local starting voice. A custom voice requires its actual installed bundle. Revise the script before synthesis. For an available HyperFrames voice:

```bash
npx hyperframes tts /absolute/script.txt --voice af_nova --output /absolute/video-project/narration.wav
```

Measure the recording and align or recognize its words. Check names, quantities, code operators, and the complete ending. Use `narration-cues` for cue provenance and subtitle serialization. Retime visual consequences to the recorded cues; include breathing space and a readable final hold.

For a voice generated in takes, record one take per section with pause markers between beats when the engine supports them, and set pace with the engine's duration target instead of time-stretching afterwards. Then assemble with the CLI (recognized words are `[{ text, start, end }]` JSON, for example from `npx hyperframes transcribe --json`):

```bash
node "$SKILL_DIR/scripts/artifacture.mjs" narration check-take --script take-1.txt --words take-1.words.json
node "$SKILL_DIR/scripts/artifacture.mjs" narration join --out joined.wav take-1.wav take-2.wav
node "$SKILL_DIR/scripts/artifacture.mjs" narration cut --audio joined.wav --words joined.words.json \
  --script beats.json --out narration.wav --timing timing.json --dense 05,07
```

`check-take` exits 1 when a take adds, drops or changes a word; regenerate that take. `join` normalizes each take and exits 2 when takes differ by more than 1.5 LU. `cut` aligns the script with `alignScript` (`narration-align`), cuts each beat at the quietest point inside its pause, adds reading holds, normalizes to −16 LUFS, and writes per-beat word timing; it exits 2 when a cut is louder than −40 dB, which is heard as a click or a clipped word.

```bash
node "$SKILL_DIR/scripts/artifacture.mjs" video /absolute/film.tsx \
  --out /absolute/video-project/index.html \
  --audio /absolute/video-project/narration.wav --audio-start 0.6
```

The exporter measures audio with `ffprobe`, copies it beside the runtime, and creates an ID-bearing timed audio element. Narration must fit the authored sequence. HyperFrames owns seeking and mixing. The CLI does not synthesize voices, align words, add captions, or encode movies. Omit audio flags for a silent specimen. Keep HTML, runtime, and audio together.

Captions follow measured timing and clear the important action. Long-form can deliver selectable WebVTT; a silent-feed reel needs source-owned embedded captions unless omitted. Honor the requested aspect's safe zones.

## Verify and encode

Run `bash "$SKILL_DIR/scripts/hyperframes-doctor.sh"` before rendering. Resolve missing runtime prerequisites; continue source authoring when independent of a blocked renderer. Available upstream `/hyperframes` and `/hyperframes-cli` skills own renderer mechanics; [hyperframes.md](../references/hyperframes.md) is the local fallback. Pin the renderer in the project and inspect its help before unfamiliar flags.

From the video project, the supported check/render route is:

```bash
npx hyperframes check . --json --samples 21 > check.json
npx hyperframes snapshot . --at 0,2,8,12
npx hyperframes render . --output renders/film.mp4 --quality standard --fps 30 --strict
```

Replace snapshot times with the story's opening, event midpoints, completed poses, cuts, and ending. Inspect frames and resolve runtime/layout/contrast errors before rendering. Seek an earlier time, later, and back: the earlier scene state must match. Inspect reveal, paint, and source changes as well as bounding boxes. Apply motion-doctrine seam review when available and relevant.

Follow [verification.md](../references/verification.md) for Artifacture mechanics and the artifact review verdict. Disclose incomplete certification separately from successful export or render. Render a draft when encoded motion/media needs review; rerender after a repair or for a requested master. Honor existing rendering authorization.

Inspect a contact sheet decoded from the MP4, actual dimensions/frame rate/duration/streams, and delivered audio. Static frames alone cannot establish pacing or continuous motion. For hosting, verify playback, chapter seeking, caption loading, and MP4 byte ranges. Deliver a watch link, downloadable film, editable source, and evidence with the actual voice and any incomplete check. `share.sh` handles HTML; use a video-capable destination.

## Flags

| Flag | Default | Meaning |
| --- | --- | --- |
| `--style=long-form\|reel` | inferred, otherwise long-form | Delivery format |
| `--aspect=9:16\|16:9` | 16:9 long-form; 9:16 reel | Author the matching layout |
| `--duration=Ns` | story / measured audio | Positive target duration |
| `--mode=<id>` | inferred from viewer task | Use the live registry |
| `--collection=<manifest.json> --episode=<id>` | none | Validate and select the semantic episode |
| `--voice=<name>` | session default, otherwise `af_nova` | Use the actual requested voice |
| `--no-narration`, `--no-captions` | off | Honor requested omissions |
| `--quality=draft\|standard\|high`, `--fps=24\|30\|60` | standard, 30 | Delivery quality and frame rate |
| `--no-ask` | off | Resolve optional choices from the brief and defaults |

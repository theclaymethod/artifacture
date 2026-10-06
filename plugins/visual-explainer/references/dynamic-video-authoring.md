# Build an explanation that moves

Use this guide when authoring a video, a PR review, or a sizzle reel. It teaches the implemented library; the live component index owns exact signatures and copy boundaries. Read the [motion baseline](motion-video-baseline.md) for Hairline and 3b1b styling, or preserve the user's requested visual identity.

## Turn the topic into a visible question

Write a short story before assembling scenes. Identify the viewer's question, one concrete subject, the variable that changes, the resulting consequence, and the evidence that establishes it. For a PR, pin its base and head and distinguish committed behavior from experiments and later work. For an illustrative system, identify the example as illustrative.

Open on an event the viewer can understand: a retry reaches an already-completed operation, zero unexpectedly becomes one, or a dependency blocks the next step. Let the viewer predict an outcome. Show the result, trace its mechanism, change the responsible condition, and replay the case. Conclude with the useful rule and its actual boundary. Adapt the order to the material.

Keep a working beat sheet beside the source. Each beat records:

- The spoken claim and its source, or its illustrative assumption.
- The visible entry state and the question it raises.
- The event: which subject changes, which property changes, and what causes it.
- The visible exit state and what the viewer can now explain.
- The cue or word that triggers the event, its alignment provenance, and the time needed to read the result.

Rewrite a beat if its image merely repeats its sentence. Move the request, expose the owning layer, demonstrate the branch, align the two versions, or resolve the relationship. Put detailed provenance in the review package. On-screen text should identify objects, establish a question, or make the result readable.

### Match the viewer's task

| Mode | The film should establish |
| --- | --- |
| Code / PR review | A concrete before-and-after behavior, the changed owner or condition, observed checks, and remaining risk. Show the input again after the correction. |
| Nontechnical explanation | A familiar physical analogy, the correspondence to the system, its consequence, and where the analogy stops applying. |
| Mathematical explanation | A relation constructed in view, a changed variable, and the coupled geometric or numerical consequence. Use native typesetting when Unicode cannot express the formula. |
| Onboarding / architecture | One task travelling through owners, the important boundary, and how the viewer changes or diagnoses it. |
| Sizzle / primitive tour | Visually distinct demonstrations with enough completed motion to recognize each capability. Organize by what viewers can build. An authored demo is evidence of that demo, rather than a product performance claim. |

These are story choices. Use `video/modes.mjs` through `ve:video-collection -- modes` for the compiler's actual mode IDs and fields; do not infer IDs from this table.

## Find a block before inventing an API

```bash
REPO=$(node "$SKILL_DIR/scripts/artifacture.mjs" path)
node "$SKILL_DIR/scripts/artifacture.mjs" list --query follow-path --json
node "$SKILL_DIR/scripts/artifacture.mjs" list --query source-range-focus --json
node "$SKILL_DIR/scripts/artifacture.mjs" list --query exploded --json
```

Read each selected entry's `entryPoints`, `constraints`, `variants`, and `examples`. Read its example in `REPO` before authoring. For a React workspace, use `init` and `add` to copy the needed leaves; see [react-workspaces.md](react-workspaces.md). Standalone TSX can import from the resolved runtime. Private consumer edits remain owned by their workspace.

| What the viewer needs to see | Discover / use | Read before extending |
| --- | --- | --- |
| A signal moving, waiting, returning, then changing focus at arrival | `follow-path`, `prepareGraphicRoute` | `examples/visual-explainer-mdx/motion-review.tsx`: the route drawing and carrier use the same prepared geometry. |
| A before/after comparison that stays registered | `comparison-wipe` | The same example; registration preserves structural geometry. A wipe does not relayout or morph a graph. |
| The exact code responsible for a visible consequence | `source-range-focus`, `createSourceScene`, `editWithIdentity` | The same example: source ranges, retained character identities, stable edit intervals, and cue bindings. |
| A cascade or transferred attention | `reveal-in-order`, `focus-in-order`, `motion` | `examples/visual-explainer-mdx/video-longform.tsx` and `component-catalog.tsx`. |
| Messages, ownership layers, or a state transition | `sequence-scene`, `layer-scene`, `state-scene` | `component-catalog.tsx`; builders produce ordinary scenes. |
| Multi-parent dependencies and lineage | `dag` | `dag-source.ts`; authored reveal shares the scene sampler, while interactive navigation remains a page control. |
| A physical assembly separating into meaningful parts | `exploded-axonometric`, `axonometric-plan`, `hairline` | `axonometric-source.ts` and [axonometric.md](axonometric.md). Native Hairline silhouettes keep their separate crease and occlusion rules. |
| A numerical trend, units, or individual records | `plot-scene`, `grid-scene`, `charts`, `thread-plot` | `component-catalog.tsx` and `repair-story-data.ts`. A React chart is not automatically a seekable video scene. |
| An authored value driving multiple consequences | `authored-values`, `motion` | Derive related geometry from the same scalar/vector sampler. Built-in tracks support opacity, reveal, highlight, illustration translation, route traversal, and rectangular masks. |
| A mechanical character change or scan | `dot-matrix-scene`, `character-roll`, `column-scan`, `punctum-readout` | `punctum-source.ts` and `punctum-video.tsx`; font/readout and prepared SVG cells are separate surfaces. Scan audio is a separately synthesized recording. |
| Formula matching or native physical motion | `manim-clip`, `psychopomp-clip` | [native-engines.md](native-engines.md). Render the clip, validate its manifest, and retain its editable Python/Rust source. |
| ASCII, VHS, shader, or procedural 3D treatment | `ascii-sweep`, `ascii-object`, `vhs`, `model-view` | [media-effects.md](media-effects.md) and [procedural-models.md](procedural-models.md). Read the selected clock/media limits before using it in an encoded film. |

The full catalog is searchable. This table chooses a useful starting point; referenced upstream work is not itself an installed capability.

## Choreograph events on one clock

Start from a working composition. `motion-review.tsx` is the detailed continuous-figure example: a contradiction, a moving request, a source correction, a registered comparison, and two concrete outcomes. `video-longform.tsx` is the smaller diagram example. `math-activation.tsx` uses 3b1b geometry and coupled mathematical relationships. Change their source models and story rather than recoloring an unrelated demonstration.

Keep geometry in reusable `GraphicScene` builders. Compile scene motion, place complete blocks with `composeGraphics`, frame with `createSlideScene`, and export one `sequenceSlides` sequence. A poster samples a chosen time; a slide shows the same geometry; video supplies the clock. Keep semantic object IDs stable and let the compositor scope instance IDs.

For each spoken idea, prepare the subject, execute the important event, show the consequence, then hold its completed state. Faster subordinate arrivals, route changes, source edits, comparison sweeps, and assembled/exploded correspondence can make a dense sequence readable. Do not use the narration paragraph length as a fixed motion duration. Let the consequential moment determine the pause.

Motion compilers return ordinary tracks. Combine tracks from different compilers with `defineGraphicMotion` when their channels do not overlap. Reveal supports path-only objects. Translation and route traversal share the same illustration channel. Individual diagram nodes cannot translate away from their routing; ask their layout owner for a new pose. Whole-block placement is currently static. Arbitrary SVG path morphs, rotations, camera moves, and arbitrary React children are not built-in track types.

Use the supported primitives for causal movement. When a camera, mask, native clip, or delivery-layer transition is justified, keep it in the source-owned HyperFrames composition on the same finite master clock. Preserve the shared scene renderer and source ownership. A hard cut is supported at a shared sequence boundary; continuous wrapper movement requires an explicitly authored delivery layer and boundary inspection.

Inspect continuity immediately before, at, and after every cut. Keep the identity, position, direction, speed, and focus relationship that carries the viewer across it. A change of mechanism may justify a cut; the resulting image still needs a readable entry state. When the installed motion-doctrine skill is available, apply its seam checks to the authored transitions.

Use Hairline for physical mechanisms and thin-line diagrams, 3b1b for mathematical construction, and Mono Color or Algebrica when requested. Preserve one causal accent across a collection. Inspect fine strokes after video compression and at the actual playback size; visible active relationships and readable type matter more than a token value.

## Align the film to actual speech

Write and revise the narration before generating it. Honor the requested voice or the session's established default. If a custom voice is unavailable, disclose that and use an appropriate available voice only when the choice is optional. Do not label another voice as Ainthony. Local custom voice bundles belong to the user's environment; the skill does not ship their weights or voice recordings.

Measure the recorded duration and recognize or align its words. Check the beginning, ending, important names, quantities, and code operators; recognition can change spellings, so review exact claims separately. Compile cues with `narration-cues`; retain whether their timing is measured, estimated, or authored. Place consequences on the corresponding word or cue. Leave enough pre-roll, inter-beat space, and a complete final sentence.

Make the sequence accommodate the actual recording, then attach it through the installed CLI:

```bash
node "$SKILL_DIR/scripts/artifacture.mjs" video /absolute/film.tsx \
  --out /absolute/video-project/index.html \
  --audio /absolute/narration.wav --audio-start 0.6
```

The exporter uses `ffprobe`, copies a content-hashed audio asset beside the runtime, and creates a timed audio element with an ID. It rejects audio that overruns the sequence rather than quietly losing the ending. It does not synthesize a voice, align words, add captions, or encode an MP4. Keep HTML, runtime, and audio together. HyperFrames owns media seeking and mixing; do not start audio with a React effect or a second clock.

Captions follow measured word timing and reading groups. For long-form, deliver selectable WebVTT where appropriate; for a silent-feed reel, author readable embedded captions with the requested aspect's safe zones. Keep captions clear of the event being explained. A portrait version needs an authored narrow layout and framing pass.

## Prove the delivered film

Use the project's pinned HyperFrames version; inspect its CLI help before using an unfamiliar flag. Keep the brief, script, beat sheet, source, timing/claim receipts, generated composition, and encoded film together. Use the available upstream HyperFrames skills for renderer mechanics. The local [integration reference](hyperframes.md) is the fallback.

Check the exported composition with `hyperframes check`; inspect opening, event midpoints, full explanatory poses, boundaries, and ending with `snapshot`. Seek an earlier time, seek later, and return to the earlier time: the scene state must match. Check actual state changes as well as bounding boxes; a stationary geometry can still reveal or change focus.

Run the [Artifacture verification route](verification.md) and disclose any incomplete review certification. Mechanics, an HTML export, a successful encode, and a final artifact verdict are separate facts.

Render once source and frame checks pass. A second encode is useful after a repair or when a delivery master was requested. Honor existing authorization. Inspect a contact sheet decoded from the MP4, especially the proof and final frames. Check actual dimensions, frame rate, duration, and the audio stream with `ffprobe`; listen or recognize the delivered audio when available, and report which check was performed. Review clipped speech, audible artifacts, illegible labels, frozen motion, and seams in the encoded result.

If hosting is requested, verify the public player, chapter seeking, caption loading, and byte-range support for the MP4. Deliver a watch link and downloadable film with editable source and evidence. Explain any remaining limitation precisely. For a collection, check canonical subjects and terms in adjacent episodes and give the next episode a useful starting question.

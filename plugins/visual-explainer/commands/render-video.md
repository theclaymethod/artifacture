---
description: Adapt an existing slide deck or magazine into an animated MP4 while preserving its evidence and editable source.
argument-hint: "<deck.html> [--style=long-form|reel] [--narration=<script|auto>] [--no-ask]"
---

# /render-video

Use `/generate-video` for a new topic. This route starts from a deck or magazine and follows [generate-video.md](generate-video.md) for audio, checking, encoding, and delivery. Read [dynamic-video-authoring.md](../references/dynamic-video-authoring.md) to turn its source into a moving argument.

Honor the requested style, voice, duration, and script. Preserve facts, units, important encodings, and explicit visual identity. Use [clarify.md](../references/clarify.md) for material unknowns; honor answered choices and existing authorization.

## Recover the explanation

For MDX/TSX, read the editable source and export it before inspecting the HTML. For an HTML-only scroll-snap deck or horizontal magazine, identify `.slide` / `.page` units, claims, figures, supporting evidence, relationships, and meaningful interactive states. Other presentation structures need an inspected adapter; this route does not promise arbitrary React-child conversion.

Find the viewer's question and its mechanism. Source slides contain evidence; film beats follow the explanation. Merge repeated claims, separate overloaded proof, and record omitted material in delivery notes. A reel needs a compact argument with an immediate event and completed consequence.

## Reuse source owners for motion

Reuse existing `GraphicScene` / `GraphicSlide` geometry and semantic IDs when available. Compile meaningful events on those scenes and export one `sequenceSlides` sequence. Keep deck navigation and reading-only controls outside the film.

| Source | Animated treatment |
| --- | --- |
| Diagram | Trace a request/dependency, reveal its causal edge, transfer focus at arrival, and show the consequence. |
| Code / diff | Bind exact source ranges, edit the responsible condition with retained character identity, then replay the input. |
| Before / after | Register common geometry and use a comparison wipe; do not imply relayout or arbitrary morphing. |
| Data / table | Preserve the unit/record encoding and reveal the records or comparison supporting the finding. |
| Layers / ownership | Follow a task across boundaries or separate meaningful parts with an exploded assembly. |
| Mathematics | Construct the relationship and couple its consequences to one variable; use Manim for required formula transforms. |
| Photograph / native clip | Preserve provenance and timing, place it in the source-owned delivery layer, and keep labels readable. |

Discover actual blocks with the installed CLI and read their constraints/examples. Layout owns rerouting; translation cannot move diagram nodes away from their edges. Shared sequences cut at boundaries. Camera and custom delivery transitions require a finite source-owned HyperFrames layer and boundary inspection.

Use the [motion baseline](../references/motion-video-baseline.md) for new Hairline / 3b1b illustrations. A shared sequence uses `video`, which bundles the browser runtime; a source-owned complete composition uses `export-static`. Keep editable source authoritative.

## Narrate and deliver

For `--narration=auto`, write a causal script from the source's claims and proof, then revise it before synthesis. For a supplied path, preserve the user's words unless editing is authorized. For `none`, compose a silent film with enough context and reading time.

Generate the actual requested voice, measure and align speech, retime the story, and attach it with the installed `video --audio <recording> --audio-start <seconds>` route. Narration must fit the sequence. Captions follow measured timing and the requested aspect's safe zones.

Complete [generate-video.md](generate-video.md)'s verification and delivery: inspect moving states and cuts, check reverse seeking, run Artifacture verification, encode, inspect decoded frames and delivered audio, and verify a hosted player when requested. Include editable source and evidence; identify compressed or omitted source material.

`--style`, `--aspect`, `--voice`, `--duration`, `--quality`, `--fps`, `--no-captions`, and `--no-ask` follow the generation command.

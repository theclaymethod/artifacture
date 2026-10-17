# Animated video authoring verification

The accumulated Punctum and cleanup work was rebased onto `a3315dc` and pushed as `2c91d0c` on `codex/agent-video-workflow`. The video-authoring changes extend that branch. The globally installed visual-explainer skill in both `.agents/skills` and `.codex/skills` links to this repository's plugin, so the updated instructions are available there immediately.

## Agent workflow

The [skill entry](../../plugins/visual-explainer/SKILL.md) routes animated explainers, review films, and sizzle reels to the rewritten generation command and [dynamic authoring guide](../../plugins/visual-explainer/references/dynamic-video-authoring.md). The guide connects story events to implemented block IDs, exact import owners, working examples, one-clock choreography, measured narration, native clips, and encoded-film review. Deck conversion now follows the argument's mechanism rather than prescribing text entrances for every slide.

The component closure audit passes for 56 public entries. The guide uses that live index instead of maintaining a second numeric inventory. Skill frontmatter validation passes; all 53 routed Markdown reference links in the entry, new guide, and two video commands resolve. No new tests, test helpers, or fixtures were created.

An independent read-only forward test follows the guide into PR review and nontechnical retry workflows. It caught a Hairline catalog entry pointing to examples that never called its adapter. That entry now points to the working motion review, its scene source, and prepared silhouette/crease geometry.

The same pass confirms repeatable forward/backward sampling of the working review and a composed physical retry mechanism, including valid landscape and portrait sequences. It also caught stale Hairline stroke widths and an incorrect JSON transcription flag in the reel recipe. Both references now match their actual theme and CLI owners.

## Narration exporter

The installed CLI exported the actual PR #15 composition with its 130.14-second Ainthony recording through `video --audio`. The local narration asset is byte-identical to the source (24,986,924 bytes, SHA-256 `7e250ca0ba8007dff604e44008cf81aeafeb4eefd90aa6d4a9d5594c64d5e1bc`). Its ID-bearing audio element has explicit start, duration, track, and volume; the scene retains one paused master clock. HyperFrames 0.8.136 lint reports zero findings on this narrated export.

Direct CLI calls reject negative and non-finite starts, duplicate output flags, a start without audio, unknown flags, and narration ending beyond the sequence. Each refusal preserves the existing HTML bytes. Silent export remains independent of FFmpeg. WAV timing and copying were exercised; the other accepted recording formats and missing-ffprobe failure were not exercised.

The doctor now checks Node 22.12 and ffprobe, discovers installed companion skills in the Codex/Agents directories, and distinguishes required runtime readiness from optional-tool output. Its direct invocation succeeds on the local Node 22.23.1 / FFmpeg 8.1 / HyperFrames 0.8.136 environment. Optional upstream Kokoro, MusicGen, Docker, and the separate GSAP skill remain absent; the local Ainthony pipeline is independent of them.

## Motion starter

The existing [retry starter](../../examples/visual-explainer-mdx/video-longform.tsx) exports a finite 36-second sequence with 13, 13, and 11 motion tracks. Nodes establish the map, relationships draw in authored order, labels arrive with their edge, and semantic focus transfers through the mechanism. Direct sampling proves different authored times change each scene and returning to an earlier time reproduces its state.

HyperFrames checks 12 sample times with zero lint/runtime errors and 61 passing contrast checks. One `connector_detached` heuristic warning remains at 19.5 seconds. The exact snapshot was inspected: the failed-attempt / permanent-failure connection is attached. A direct geometry probe also confirms its source and target match the layout owner's right/left center anchors with the intentional eight-unit endpoint clearance. The warning is retained in the local check report; it is not a clean-layout claim. Snapshot review also corrected the earlier choreography that let arrows appear before their destination nodes.

## PR #15 film

A separately authored review film covers merged PR #15 at `3718510b9c01a583a0d0a8452205ccc5cdf162e6`, excluding later Punctum and cleanup work. It uses Hairline / 3b1b scenes and local synthetic Ainthony narration. It demonstrates shared geometry, the committed sampler's 5 → 12 → 5 replay, collection continuity, and literal filename evidence binding.

The encoded H.264/AAC film is 1920×1080 at 30fps, 130.166667 seconds, and 9,827,165 bytes. Decoded audio has correlation 0.9997108 with the source recording, peak 0.7664, and zero clipped samples. Source narration was recognized with complete endings; this is an automated recognition/correlation check, rather than a human listening assessment. The composition passes runtime/layout checks at 21 times and all 115 contrast checks. All five authored boundaries pass the motion seam checks. One shared-stage structure advisory remains. These observations do not constitute an Artifacture final artifact-review certification.

The decoded contact sheet includes the completed evidence result. The hosted player was checked through CUA: duration, playback, chapter seeking, and an empty warning/error console. HTTP checks return 200 for the page and captions, and 206 for an MP4 range request.

Production source, speech timings, pinned-code proofs, check receipts, rendered media, and delivery assets remain together at `~/.cache/hyperframes/pr-to-video/theclaymethod/artifacture/artifacture-pr-15/cuts/review-v2/`. The film was rendered before the new audio-export option; the subsequent CLI export separately exercises that option against the same source/recording. Movie encoding remains HyperFrames' responsibility.

## Repository and package

`check:fast` passes all 25 existing end-to-end cases, TypeScript, manifest agreement, runtime freshness, component copy closures, integrity checks, standalone/static output, and finite video exports. Lint and skill validation also pass. The generated runtime is rebuilt from 612 source files. The npm package smoke check includes the new guide, exporter, runtime snapshot, and canonical Punctum OFL notice. No package was published to npm, release created, or branch merged.

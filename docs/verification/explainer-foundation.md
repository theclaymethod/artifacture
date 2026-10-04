# Explainer foundation verification

The browser foundation reuses one scene in posters, diagrams, slides, and timed video. These observations cover the implementation reviewed on 2026-10-04. They do not approve the example scripts or establish native renderer compatibility.

## Existing behavior

`npm test` passed all 182 existing tests. Typecheck, lint, manifest consistency, and `ve:check` passed. No new test files or test-only fixtures were added. The existing SVG contract check now renders the component and inspects its accessible relationships instead of requiring the old source structure.

The shared renderer matched the previous diagram renderer across eight layout and direction cases. Titles, descriptions, four node glyphs, routed edges, anchors, labels, and label masks remained intact. The responsive mobile reading view remains in the diagram owner.

## Shared themes and actual motion

Browser checks preserved all 73 existing theme variables for 11 explicit presets, including inverse surfaces. Diagram, slide, and video outputs matched paint, font roles, stroke widths, and connector geometry for Hairline light and dark, mono-color, blueprint, and paper-ink. Those geometry checks blocked remote fonts and establish font-role parity, rather than web-font availability.

The actual video export was sampled at `0, 1, 3, 5, 9, 12, 15.999, 5` seconds. Paths revealed over time, highlights changed, and the repeated five-second pose had identical geometry. No browser errors occurred. Separate style elements retained the font imports for multiple registry brands.

Direct runtime checks also covered dot highlights, caller mutation after sampling, deeply frozen scene data, extreme finite translation endpoints, and invalid sequence IDs. The sampled translations stayed finite, and backward sampling repeated the same state.

The two collection drafts were sampled twenty times. Subject labels and route paths matched across episodes, focus changed, backward seeks repeated the earlier pose, and the video filled its 1920 × 1080 stage. These drafts are silent.

Publication requires the original frozen validation record and rechecks its complete manifest and evidence before creating output. Eight altered, copied, or forged records rejected before the output parent existed. An authentic record and an explicitly rechecked edited manifest both produced draft packages with matching completion digests. The initial review reproduced acceptance of an altered copied record; this boundary check corrects that defect.

## Reproduce and interpret the checks

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run check:manifests`, and `npm run ve:check`. Follow [the export commands and sampling procedure](../graphics-and-video.md) for the shared-scene examples. Check and scaffold [the collection example](../video-collections.md) in a new output directory.

HyperFrames reports `sweep_static` for the fixed diagram bounds even when reveal and highlight change. Its heuristic did not pass for this specimen; actual state sampling and frame inspection establish the observed motion. Raw video exports require network access for named Google Fonts and consist of HTML plus a local hashed runtime asset. No MP4, narration audio, native Manim render, or Psychopomp render is claimed by this record.

Session receipts are retained under `/Users/claytonkim/.codex/investigations/artifacture-video-upgrade-2026-10-04/`, in `graphics-implementation`, `theme-implementation`, `collections-implementation`, and `independent-review`. The [engine assessment](../animation-engines.md) records native source revisions and the separate prototype's limits.

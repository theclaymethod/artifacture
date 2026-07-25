# Artifacture slop-gap specialist

This is a narrow semantic-integrity pass for explanatory artifacts. It does not
judge general visual taste or prose style.

## Run when

Run only when `llm_passes_required` includes `artifacture:slop-gap`.

The orchestrator must name the candidate state or region. Do not scan the whole
artifact for generic AI aesthetics.

## Ownership boundary

Route elsewhere and stay silent here when the issue is:

- generic visual sameness, typography, color, cards, glow, glass, ornament, or
  design specificity: call Impeccable;
- AI-written phrases, cadence, em-dashes, fragments, buzzwords, or voice: call
  Unslop `cleanup --report`;
- clipping, symmetry, crowding, dead space, arrows, or component geometry: use
  Artifacture's layout and mechanical checks.

This pass owns only decoration that communicates a false artifact semantic.

## Inputs

- One screenshot or tight crop of each named candidate region.
- Visible text and accessibility labels from that region.
- The smallest source/brief excerpt needed to determine whether the implied
  sequence, state, confidence, or provenance is real.

Do not read unrelated screenshots or the full source document.

## Curated criteria

These verdict IDs are registered in `rubric-criteria.json` under the opt-in
`artifacture:slop-gap` pass. They are not always-on catalog scans.

- `[artifact-slop-false-sequence]` Decorative numbering, arrows, step labels, or
  progress marks imply an order, dependency, or progression that the content
  does not actually have.
- `[artifact-slop-false-state]` Status dots, badges, terminal/system labels,
  meters, confidence marks, or loading/progress treatments imply measured or
  live state when no such state exists.
- `[artifact-slop-false-provenance]` Citation-like numbers, source tags,
  timestamps, evidence labels, or reference markers imply a traceable source
  that the artifact cannot supply.

## Judgment rules

1. Require a false semantic implication, not merely unnecessary decoration.
2. Name the exact implication a reasonable viewer would infer.
3. Stay silent when the source, interaction, navigation, or data supports it.
4. Stay silent on aesthetic costume alone; that belongs to Impeccable.
5. Stay silent on writing rhythm alone; that belongs to Unslop.
6. One finding covers one named region and one false semantic.

## Verdict JSON schema

`{"pass":true,"findings":[{"check_id":"artifact-slop-false-sequence|artifact-slop-false-state|artifact-slop-false-provenance","evidence":"<region and unsupported implication>","fix":"<remove the semantic cue or connect it to real data/source/sequence>"}]}`

Set `pass` to `false` when `findings` is non-empty.

## Silence examples

- Section `02` is linked from the agenda and marks a real reading order.
- A confidence badge displays a calculated value with an accessible label.
- A footnote marker resolves to a supplied source.
- A decorative dot is visibly ornamental and does not resemble status.

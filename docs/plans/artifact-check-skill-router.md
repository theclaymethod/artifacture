# Artifact-check skill router

## Problem

The verifier currently exposes a large catalog of deterministic and LLM checks.
Although individual catalog entries have `applies_when` prose, the high-level
LLM protocol can still feel like one universal battery. That is expensive, hard
to explain, and encourages weak reviewers to answer questions that the artifact
never earned.

Artifact checks should work like narrow Impeccable skills: route the artifact to
the few visual disciplines its structure, task, and evidence make relevant.

## Product contract

Every rendered state receives one cheap mechanical baseline:

- runtime and failed requests;
- viewport/canvas fit;
- text, arrow, and component clipping candidates.

Everything deeper is routed. A routed check must name:

1. the visual skill;
2. the applicability signal;
3. the artifact or named region;
4. the criterion/rubric;
5. the evidence input;
6. the silence case.

The verifier returns independent findings with screenshot evidence. It does not
average unrelated findings into a generic design score.

## Initial skill families

| Skill | Example applicability signals | Example checks |
|---|---|---|
| Layout | repeated tracks, split panes, dense dashboards, large empty regions | symmetry, row alignment, hierarchy, crowding, intentional dead space |
| Typography | multiple type roles, long prose, narrow labels, custom fonts | role contrast, clipping, measure, hierarchy, fallback stability |
| Clarify | action labels, status language, technical terms, competing calls to action | ambiguity, undefined jargon, redundant labels, distinct commitments |
| Color and contrast | colored surfaces, status pairs, custom palette | readable contrast, status semantics, reflexive accent use |
| Motion | transitions, reveals, timed states | reduced motion, geometry animation, continuity, safe resting states |
| Diagram | SVG/Mermaid or relational visual structure | label clipping, arrow endpoints, proportional honesty, diagram necessity |
| Delegated visual craft | general aesthetic or visual-AI-tell candidate | route evidence to Impeccable critique; do not reproduce its detector or taste rubric |
| Delegated prose | prose-pattern candidate | route excluded-filtered prose to Unslop `cleanup --report`; do not rewrite during verification |
| Artifact semantic slop gap | explicit named-region review | false sequence, false state/confidence, or false provenance encoded by decoration |

## Routing sequence

1. Extract cheap structural signals from source and rendered DOM.
2. Build a candidate list of skills, not a flat list of every check.
3. For each candidate skill, select only criteria whose applicability signal is
   present.
4. Batch screenshots only when the selected criteria and viewport requirements
   match.
5. Run each skill in fresh context with only its rubric and required evidence.
6. Merge findings by artifact/region; preserve `silent` results for regression
   calibration.

## First missing check: repeated-track symmetry

The layout pass must catch a composition that establishes peer columns or rows
but renders them with unexplained unequal tracks, broken divider/baseline
alignment, or whitespace that makes one peer region feel missing.

Applicability:

- a repeated grid/flex topology is visible; or
- the artifact declares an input/process/output, before/after, comparison, or
  peer-panel relationship.

Flag:

- peer tracks have unexplained unequal widths;
- corresponding rows or dividers do not align;
- one track contains accidental dead space that changes its apparent weight.

Stay silent:

- the asymmetry is visibly intentional;
- content hierarchy assigns the tracks different roles;
- the composition is editorial rather than a peer mapping.

Evidence:

- full-state screenshot;
- repeated-track bounding boxes and computed grid/flex values when available;
- the smallest crop that demonstrates the drift.

## Slop ownership boundary

Artifacture is designed to run alongside Impeccable and Unslop. It must route
to those skills rather than copying their taxonomies into a second, drifting
implementation.

Route general visual craft and visual AI tells to `impeccable:critique`.
Examples include reflex fonts or palettes, gradients, glass, glow, nested
cards, fake window chrome, decorative text, template scaffolding, aesthetic
costume, ornament without information, and manufactured hierarchy.

Route prose-pattern candidates to `unslop:cleanup-report`. Supply only
excluded-filtered prose and run Unslop's read-only `cleanup --report` path.
Artifacture verification never rewrites prose.

Artifacture retains one deliberately small `artifacture:slop-gap` pass for
artifact-semantic decoration outside both skills:

- false sequence: numbering, connectors, or arrows imply an order that the
  source does not establish;
- false state or confidence: badges, meters, progress, or status ornament
  implies measured state or certainty without evidence; and
- false provenance: citation-like, source-like, or validation-like decoration
  implies an origin or verification the artifact cannot support.

The gap pass is explicit opt-in only:
`data-ve-checks="artifacture:slop-gap"`. It receives one nominated crop, its
visible text, and the smallest truth/source excerpt needed to judge the claim.
It stays silent on typography, color, generic decoration, prose cadence,
clipping, crowding, symmetry, and dead space.

If Impeccable or Unslop is unavailable, disclose the skipped delegated check.
Do not emulate it with an embedded fallback rubric.

## Eval-driven rollout

1. Add fire/clean screenshot pairs for symmetry:
   - unequal three-column peer mapping → fire;
   - equal three-column mapping → clean;
   - intentional 60/40 editorial split → clean.
2. Measure false positives separately from catch rate.
3. Compare one-image and grouped-image passes with the same rubric.
4. Increase batch size only while per-image evidence grounding and silence
   accuracy remain stable.
5. Add the next skill family only after the router correctly excludes it from
   unrelated fixtures.

## Implementation slices

1. Rubric slice: conditional repeated-track symmetry question in `pass-layout`.
2. Candidate slice: browser collector emits repeated-track candidates and
   bounding boxes.
3. Router slice: report lists selected skill passes and why each was selected.
4. Harness slice: `evals/visual-model-policy/` records catch, false-positive,
   silence, evidence-grounding, schema validity, latency, and cost by model and
   batch size, then generates the smallest-qualified runtime policy. Direct API
   measurement population remains provider-specific.
5. Protocol slice: delivery reports the selected skills, skipped skills, and
   check-level findings—never just a global pass/fail.
6. Boundary slice: test visual delegation, prose delegation, mixed candidates, ambiguous generic `slop` silence, explicit gap opt-in, and excluded-profile routing.

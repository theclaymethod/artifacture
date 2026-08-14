# Delegated verification skills

Artifacture owns artifact mechanics, evidence extraction, state coverage, and
one profile-aware product review. Impeccable and Unslop are optional explicit
companion passes; Artifacture does not predict when their taxonomies apply.

The main thread is an orchestrator, not the default visual judge. Artifacture-
owned visual passes use the smallest eval-qualified model and batch size from
`./model-routing.md`. When none can run, use the best available visual-capable
model in a separate judge context when possible and disclose
`unqualified-fallback`. Impeccable and Unslop retain their own skill context
and model policy.

## Ownership

### Artifacture

Artifacture owns:

- runtime, request, viewport, and canvas failures;
- text, arrow, and component clipping;
- crowding, repeated-track symmetry, and intentional versus accidental dead
  space;
- state enumeration and screenshot evidence;
- source-versus-render completeness;
- diagram and operating-model fidelity; and
- the curated artifact-semantic slop gap below.

### Impeccable

Impeccable owns general visual craft and generic visual AI tells, including
typography, color, gradients, glow, glass, nested cards, fake chrome,
decorative text, template scaffolding, aesthetic costume, ornament without
information, and manufactured hierarchy.

When the artifact explicitly declares `impeccable:critique`, invoke the
installed Impeccable skill in read-only critique/audit mode with the relevant
screenshots. Do not copy its detector taxonomy or taste rules into Artifacture.

### Unslop

Unslop owns prose patterns, cadence, voice, and AI-writing tells.

When the artifact explicitly declares `unslop:cleanup-report`, supply
excluded-filtered prose only and invoke Unslop as `cleanup --report`.
Verification is report-only: do not rewrite text while determining whether the
artifact passes.

## Curated Artifacture gap

`artifacture:slop-gap` is explicit opt-in for three artifact-semantic cases
that neither general visual craft nor prose linting can establish:

1. `artifact-slop-false-sequence`: decorative numbering, connectors, or arrows
   imply an order unsupported by the source.
2. `artifact-slop-false-state`: badges, meters, progress, or status ornament
   imply measured state, confidence, or completion without evidence.
3. `artifact-slop-false-provenance`: citation-like, source-like, or
   validation-like decoration implies provenance or verification the artifact
   cannot support.

Declare the pass only on a named region:

```html
<section data-ve-checks="artifacture:slop-gap">...</section>
```

Supply one crop, its visible text, and the smallest source/truth excerpt needed
to judge the semantic claim. The pass must stay silent on typography, color,
generic decoration, prose cadence, clipping, crowding, symmetry, and dead
space.

## Failure and cache behavior

If a delegated skill is unavailable, disclose that its check was skipped.
Do not emulate a companion skill with Artifacture's rubric. The best-available
fallback rule applies only to Artifacture-owned visual passes.

Treat the three routes as separate request families:

- Artifacture visual passes may share an exact screenshot prefix when their
  evidence package, model, image order, detail level, tools, and shared
  instructions are identical. Only the final criterion suffix should vary.
- Impeccable receives the relevant screenshots and candidate regions in its
  own skill context. Its rubric is not appended to an Artifacture request.
- Unslop receives excluded-filtered prose in report-only mode without
  screenshots or visual-rubric text.

There are no Impeccable or Unslop candidate detectors in `checks.json`.
Companion routes appear only when explicitly declared in `data-ve-checks`.

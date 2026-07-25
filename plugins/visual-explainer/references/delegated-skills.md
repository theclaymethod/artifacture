# Delegated verification skills

Artifacture is one layer in a verification system. It owns artifact mechanics,
evidence extraction, state coverage, and artifact-specific semantics. It routes
general visual craft to Impeccable and prose-pattern judgment to Unslop.

The main thread is an orchestrator, not the default visual judge. Artifacture-
owned visual passes use the smallest eval-qualified model and batch size from
`./model-routing.md`. Impeccable and Unslop retain their own skill context and
model policy.

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

Artifacture emits `impeccable:critique` with the relevant screenshot evidence
and candidate locations. Invoke the installed Impeccable skill in read-only
critique/audit mode. Do not copy its detector taxonomy or taste rules into
Artifacture.

### Unslop

Unslop owns prose patterns, cadence, voice, and AI-writing tells.

Artifacture emits `unslop:cleanup-report` and supplies excluded-filtered prose
only. Invoke Unslop as `cleanup --report`. Verification is report-only: do not
rewrite text while determining whether the artifact passes.

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
Never emulate it with a local fallback rubric.

Treat the three routes as separate request families:

- Artifacture visual passes may share an exact screenshot prefix when their
  evidence package, model, image order, detail level, tools, and shared
  instructions are identical. Only the final criterion suffix should vary.
- Impeccable receives the relevant screenshots and candidate regions in its
  own skill context. Its rubric is not appended to an Artifacture request.
- Unslop receives excluded-filtered prose in report-only mode without
  screenshots or visual-rubric text.

Legacy deterministic craft/prose detectors in `checks.json` are candidate
extractors, not Artifacture verdicts. A match has status
`delegated-candidate`, does not increment Artifacture errors or warnings, and
only causes the owning skill route to appear. The owning skill decides whether
the candidate is a real issue.

# Artifacture verifier contract

The verifier is a mechanics gate plus a review dispatcher. It does not claim
visual quality from deterministic proxy rules.

## Public commands

```bash
node ve-verify.mjs <artifact.html> --truth <brief.md> --json <mechanics-report.json> --screens <dir>
node ve-finalize.mjs --report <mechanics-report.json> --verdicts <verdicts.json> --out <final-report.json>
```

`ve-verify` exits `0` when deterministic mechanics has no error and `1` when it
does. Its success is not the final artifact verdict. `ve-finalize` exits `0`
only for `status: verified`, `1` for `failed` or `incomplete`, and `2` for bad
input.

## Mechanics catalog

`checks.json` contains executable `static-text`, `static-dom`, and `browser`
checks only. A catalog check must be grounded in observable
mechanics or artifact semantics and have a seeded violation fixture. General
taste, prose style, and model-judged criteria do not belong in this catalog.

`--mechanics-only` runs the same applicable mechanics checks but skips expensive
deck-state evidence capture. `--static-only` is diagnostic and skips browser
checks.

## Review dispatch

Every rendered profile produces exactly one Artifacture-owned review pass:

- `artifact-review:page`
- `artifact-review:slides`
- `artifact-review:magazine`
- `artifact-review:poster`
- `artifact-review:video-comp`

Each composite pass requires qualification on its own profile corpus. Narrower
legacy `layout` and `deck-review` measurements cannot be borrowed as composite
qualification. Slides require batch size 2 because every state is reviewed
with paired context. Until a dedicated route qualifies, dispatch fails closed
as `fallback-required` and discloses `unqualified-fallback`.

The single rubric is `rubrics/pass-artifact-review.md`. It covers correctness,
completeness, visual hierarchy, mobile usability, and shipping quality. Do not
fan these dimensions out into separate model calls.

`impeccable:critique`, `unslop:cleanup-report`, and
`artifacture:slop-gap` appear only when explicitly declared in
`data-ve-checks`. Artifacture owns no local Impeccable or Unslop detectors.

## Mechanics report

```json
{
  "file": "/absolute/path/artifact.html",
  "profile": "slides",
  "preset": "nothing",
  "summary": {"errors": 0, "warns": 1, "skipped": 125, "passed": 28},
  "checks": [],
  "screenshots": [],
  "llm_passes_required": ["artifact-review:slides"],
  "llm_dispatch_plan": [
    {
      "pass": "artifact-review:slides",
      "owner": "artifacture",
      "status": "fallback-required",
      "route_key": "artifact-review:slides",
      "qualification": "unqualified-fallback",
      "batch_size": 2
    }
  ]
}
```

When no evaluated route exists, dispatch status is `fallback-required` with
`qualification: unqualified-fallback`. This must be disclosed.

## Verdict ingestion

The finalizer accepts a normalized verdict bundle:

```json
{
  "schema_version": 1,
  "review_contract_sha256": "<mechanics-report review_contract.sha256>",
  "passes": [
    {"pass": "artifact-review:slides", "status": "pass", "findings": []}
  ]
}
```

`review_contract` binds the artifact bytes, truth brief, rendered inventory,
profile, and screenshot/deck evidence. The finalizer rejects stale or foreign
verdict bundles. Missing contract evidence produces `status: incomplete`.

Only `pass` and `fail` complete a required review. Missing or `skipped` passes
produce `status: incomplete`. Any mechanics error, failed pass, or finding
produces `status: failed`. Only a clean mechanics report with all required
passes successful produces `status: verified`.

## Evaluation layers

- `npm test`: public CLI and orchestration contracts.
- `npm run ve:eval`: deterministic mechanics fixtures.
- `npm run ve:eval-product`: six representative artifact pairs with blind,
  human-reviewed judgments; any per-case regression fails closed.
- visual-model-policy: optional resumable qualification research for the two
  production review routes. Dry-run exposes the exact call and cost ceiling.

The product benchmark governs product direction. Mechanics fixtures protect
shipping invariants; they are not evidence that artifacts became better.

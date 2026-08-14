# Verification

Artifacture has two gates:

1. deterministic mechanics; and
2. one profile-aware artifact review.

The mechanics report is not a final verification result. Only the finalizer can
produce `verified` after the required review verdict is present.

## 1. Run mechanics

```bash
node "{{skill_dir}}/scripts/verify/ve-verify.mjs" artifact.html \
  --truth brief.md \
  --json /tmp/ve-report.json \
  --screens /tmp/ve-screens
```

Use `--mechanics-only` for fast fixture and CI work when deck-state screenshots
are not needed. Use `--static-only` only for diagnosis; it skips browser checks.

The report contains:

```json
{
  "profile": "slides",
  "summary": {"errors": 0, "warns": 1, "skipped": 125, "passed": 28},
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

Profiles map to one review route:

| Profile | Required pass | Required qualification |
| --- | --- | --- |
| page | `artifact-review:page` | dedicated page corpus |
| slides | `artifact-review:slides` | dedicated paired-evidence slide corpus |
| magazine | `artifact-review:magazine` | dedicated magazine corpus |
| poster | `artifact-review:poster` | dedicated poster corpus |
| video-comp | `artifact-review:video-comp` | dedicated video-comp corpus |

Legacy `layout` and `deck-review` measurements are useful prerequisite
research, but their narrower criteria do not qualify these composite passes.

If no evaluated model qualifies, the dispatch status is `fallback-required`.
Use the best available visual-capable model in a separate judge context and
disclose `unqualified-fallback`; do not silently treat it as qualified.

## 2. Build the evidence package

Use [`pass-artifact-review.md`](../scripts/verify/rubrics/pass-artifact-review.md) for every profile. Supply:

- the detected profile and mechanics report;
- standard desktop and mobile screenshots where applicable;
- the source/truth brief;
- a compact inventory of rendered headings, claims, examples, tables, and
  footnotes; and
- only the context needed to judge correctness, completeness, hierarchy,
  mobile usability, and shipping quality.

For slides, use the generated `deck-review-*.json` manifest. Review every
ordered pair in `review_groups`: base-to-drill/progressive pairs establish state
continuity, and adjacent base-slide pairs establish purposeful variation. Each
group must contain exactly two production frames. Missing, stale, orphaned, or
unpaired requested states fail capture closed.

Do not split hierarchy, aesthetics, completeness, diagram quality, and
operating-model fit into separate model calls. They are dimensions of this one
artifact review.

## 3. Optional companion skills

Impeccable and Unslop are explicit opt-ins, not locally detected routes:

```html
<main data-ve-checks="impeccable:critique unslop:cleanup-report">
```

- `impeccable:critique` receives the relevant screenshots and invokes the
  installed Impeccable skill in read-only critique mode.
- `unslop:cleanup-report` receives excluded-filtered prose and invokes the
  installed Unslop skill in report-only mode.

Artifacture does not maintain copies of either skill's detector taxonomy. If an
explicitly requested companion skill is unavailable, report it as skipped; do
not emulate it with an Artifacture rubric.

`artifacture:slop-gap` remains an explicit opt-in for a named region that may
imply unsupported sequence, state, or provenance. Use
`rubrics/pass-artifact-slop-gap.md` with one crop and the smallest truth excerpt.

## 4. Record verdicts and finalize

Normalize completed reviews into one bundle. Only `pass` and `fail` count as
completed; `skipped` leaves verification incomplete.

```json
{
  "schema_version": 1,
  "review_contract_sha256": "<copy from mechanics report review_contract.sha256>",
  "passes": [
    {"pass": "artifact-review:slides", "status": "pass", "findings": []}
  ]
}
```

The review contract hashes the artifact, truth brief, rendered-text inventory,
and screenshot/deck evidence. Re-exporting or recapturing evidence invalidates
old verdicts by design. A report without `--truth`, rendered inventory, or the
required screenshot evidence can run mechanics but cannot be finalized as
verified.

Finalize the mechanics report and verdict bundle:

```bash
npm run ve:finalize -- \
  --report /tmp/ve-report.json \
  --verdicts /tmp/ve-verdicts.json \
  --out /tmp/ve-final.json
```

The finalizer exits:

- `0` and `status: verified` only when mechanics has no errors and every
  required pass completed successfully;
- `1` and `status: failed` for mechanics errors, failed reviews, or findings;
- `1` and `status: incomplete` for missing or skipped required passes; and
- `2` for invalid invocation or malformed input.

## 5. Repair loop

1. Fix deterministic errors first.
2. Repair grounded review findings in source, not generated HTML.
3. Re-export and rerun mechanics.
4. Recapture affected evidence. For slide state changes, include the paired base
   or adjacent context required by the manifest.
5. Rerun the artifact review and finalizer.

Stop after three unsuccessful repair rounds. Deliver the finalized report,
artifact path, evidence path, and any unresolved finding without claiming the
artifact is verified.

# Visual verifier model policy

This harness answers one operational question:

> What is the smallest model, and the largest cost-effective screenshot batch
> that remains safe, for each Artifacture-owned visual check family?

It does not benchmark artifact generation. `evals/model-matrix/` owns that
separate problem.

## Policy

Artifacture's main thread is an orchestrator. It gathers deterministic
evidence, dispatches visual judgment, merges findings, and reports uncertainty.
It does not inspect every screenshot with the host model.

Model choice is per family, not global. Batch qualification is also per family
and per model. A model qualified at one screenshot is not qualified at two, and
a layout qualification never applies to diagrams, preset fidelity,
operating-model fidelity, or the opt-in Artifacture semantic gap.

The selector:

1. rejects cells that miss quality, unique-evidence, adjudication, or telemetry
   gates;
2. chooses the lowest-ranked (smallest) qualified model;
3. chooses the lowest measured cost per case among that model's qualified batch
   sizes, preferring the larger batch only on a cost tie; and
4. records larger qualified models only as runtime escalation candidates.

A cheaper larger model does not displace a qualified smaller model. Candidate
`rank` is the deployment definition of “smallest.”

## Corpus

`corpus.json` defines a deliberately compact seed corpus: 42 paired scenarios
and 84 label-blind states across the owned families:

- layout, including clipping, focal crowding, authored versus accidental dead
  space, and repeated-track symmetry;
- deck review, including rendered example truth, annotation mapping, reading
  path density, adjacent-slide variety, and click-in continuity;
- diagram fidelity;
- aesthetic and preset fidelity;
- operating-model fidelity; and
- `artifact-slop-gap`, Artifacture's explicit opt-in semantic gap.

Every state has a stable opaque case/state/image ID, named regions, visible
text, the smallest truth excerpt needed for judgment, an initial label, and
adjudication notes. Impeccable and Unslop criteria are deliberately absent.
Every criterion has enough cases to exercise the seed's declared batch sizes
of 1 and 2.

Rendering rejects duplicate PNG bytes unless both cases explicitly declare
that their label depends on different source evidence. Aggregation therefore
keys unique evidence to the SHA-256 of the rendered PNG plus its visible text
and truth excerpt, not merely the case ID or screenshot bytes. These
source-conditioned controls test whether a verifier actually uses supplied
evidence when identical pixels can be either valid or invalid.

### Prompt hill-climb smoke (non-policy evidence)

On 2026-07-25, the shared verdict contract and family rubrics were tuned
against one label-blind smoke of all 72 seed states using three parallel
delegated `gpt-5.6-terra` agents (24 disjoint states per agent). This is a
prompt-development check, not a provider measurement: it has no provider
latency, token-cache, cost, or independent replicate telemetry, and it does
not qualify a route. It reuses the seed corpus rather than a held-out split,
so the improvement is not a generalization estimate.

| Prompt | Correct | TP | TN | FP | FN | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | 67/72 | 36 | 31 | 5 | 0 | 87.8% | 100% |
| Hill-climbed | 72/72 | 36 | 36 | 0 | 0 | 100% | 100% |

The hill-climbed output was emitted as label-free JSON with grounded regions;
the manifests and raw outputs were retained externally at
`/tmp/artifacture-luna-blind-{0,1,2}.json` and
`/tmp/artifacture-smoke-results-v2.json`. Because those files are delegated
agent artifacts rather than adapter records, they are intentionally excluded
from policy aggregation. Re-run the smoke only as a development signal, and
use the provider-independent runner below for any qualification claim.

This is a seed corpus, not a graduation corpus. Its checked-in labels are
proposed from fixture intent, not represented as human review, and each family
currently has fewer than the default 10 positive and 10 negative unique-
evidence cases. The runner refuses live qualification until the corpus is
explicitly marked `ready`; the selector's default evidence floors provide a
second independent block. Replace synthetic fixtures with representative
product captures, add genuinely distinct cases, and inspect all pairs before a
live run:

```bash
npm run ve:render-visual-model-corpus
```

After a human reviews every rendered pair, update `corpus.json`:

```json
{
  "label_review": {
    "status": "human-reviewed",
    "reviewer": "reviewer identity",
    "reviewed_at": "2026-07-25T12:00:00Z",
    "notes": "What was reviewed and any relabeling performed."
  }
}
```

Human review alone does not make this seed graduation-ready. Only set
`graduation_status` to `ready` after the corpus also meets the configured
unique-evidence floors with representative captures. Graduation requires
`capture_provenance.status=representative-artifacture-captures`, a source-
artifact SHA-256 for every state, and at least 10 distinct rendered images and
10 distinct source artifacts per label in every measured family. The live
runner refuses pending labels or a non-ready corpus. Synthetic adapters may
exercise the contract, but their records are permanently marked `synthetic`
and the selector rejects them.

Rendered PNGs and raw runs are ignored because they are reproducible or
provider-local artifacts. `render-manifest.json` records the exact rendered
viewport and paths for the local corpus instance.

## Required measurements

For every `model × family × configured_batch_size` cell, record:

- at least 3 independent replicates;
- at least 10 unique fire and 10 unique clean cases;
- at least 10 distinct fire and 10 distinct clean rendered images and source
  artifacts;
- coverage of every criterion represented by the family corpus;
- TP, FP, TN, and FN over valid non-abstaining observations;
- correct image-and-region grounding for positive cases;
- JSON validity and explicit abstentions over all responses;
- p95 request latency and actual provider cost; and
- exact provider, model, image detail, prefix identity, cache tokens, token
  usage, and time to first token.

Repeated observations do not count as independent evidence. Aggregation
records both observation totals and unique evidence-bundle totals, and the
selector gates both evidence bundles and distinct rendered images. The legacy
`unique_cases` fields count evidence bundles; explicit `unique_images` fields
preserve pixel diversity so changed source text cannot inflate visual
coverage. A cell is also blocked unless every request in the deterministic
experiment matrix is present and bound to the exact experiment/corpus,
rendered-image, source evidence, shared-prefix, criterion-suffix, and
randomization hashes.

Default graduation gates:

| Metric | Gate |
|---|---:|
| Replicates | ≥ 3 |
| Unique fire / clean cases | ≥ 10 / ≥ 10 |
| Criterion fire / clean coverage | ≥ 1 / ≥ 1 each |
| Precision | ≥ 0.90 |
| Recall | ≥ 0.90 |
| Silence accuracy | ≥ 0.95 |
| Image/region grounding | ≥ 0.95 |
| JSON validity | ≥ 0.99 |
| Abstention rate | ≤ 0.05 |
| p95 latency | ≤ 30 s |
| Cost per classified case | ≤ $0.01 |

These are floors. Higher-consequence families may set stricter thresholds in
the experiment.

## Reproducible workflow

Copy the template to an ignored or otherwise local experiment file. List the
ordered model ladder in `candidates`, but set `run_candidate` to only the
smallest untested candidate. The runner enforces that ordering and never
schedules every configured model at once. Use the provider's exact direct-API
model ID; do not use a marketing alias whose implementation can drift.

```bash
cp evals/visual-model-policy/experiment.template.json \
  evals/visual-model-policy/experiment.local.json
```

Edit the experiment ID, candidate ladder, `run_candidate`, provider, and any family-specific
thresholds. Preview the exact matrix without calling a provider:

```bash
npm run ve:run-visual-model-eval -- \
  --experiment evals/visual-model-policy/experiment.local.json \
  --dry-run
```

The checked-in template measures two narrow prerequisite research routes
(`layout` and paired `deck-review`). It does not qualify the broader
`artifact-review:*` composite passes. Its current dry-run budget is 45 requests, 90
observations, and at most $0.90 at the configured per-case ceiling. Broader
criterion families remain research inputs; they are not part of the default
qualification run.

A provider adapter must implement the contract in `adapters/README.md`. Run the
measured ladder:

```bash
npm run ve:run-visual-model-eval -- \
  --experiment evals/visual-model-policy/experiment.local.json \
  --adapter /absolute/path/to/provider-adapter.mjs
```

The runner writes one append-only JSONL record per request under
`runs/<experiment-id>/records.jsonl`. It never truncates prior records. On an
interrupted rerun it skips request IDs already completed under the same
experiment contract and request-matrix hash; changed inputs cannot reuse stale
records. Provider errors and malformed or incomplete responses remain
retryable; aggregation collapses append-only attempts to the latest successful
terminal attempt. Each
request has an immutable image prefix followed by exactly one criterion suffix.
Human labels and adjudication notes are never sent to the adapter. Every record
also captures the deterministic randomization key and exact image SHA-256 used
for independent-evidence accounting.

Aggregate raw records into the selector schema:

```bash
npm run ve:aggregate-visual-model-eval -- \
  --records evals/visual-model-policy/runs/<experiment-id>/records.jsonl \
  --experiment evals/visual-model-policy/experiment.local.json \
  --out evals/visual-model-policy/runs/<experiment-id>/measurements.json
```

Aggregation exits non-zero when any disagreement lacks human adjudication or
when records are synthetic. It still writes the diagnostic measurements so the
review queue is visible. Append adjudications to the same JSONL file rather
than editing request records:

```json
{"schema_version":1,"record_type":"visual-eval-adjudication","observation_id":"<exact pending id>","decision":"confirm-corpus-label","adjudicator":"reviewer identity","notes":"Why the corpus label is correct.","recorded_at":"2026-07-25T12:00:00Z"}
```

Allowed decisions are `confirm-corpus-label`, `relabel-corpus` with a new
`human_label`, and `exclude`. Re-aggregate to a new output path after review;
the aggregator refuses to overwrite an existing measurement file. A
`relabel-corpus` decision applies to every replicate and wrapped observation of
that case; conflicting case-level relabels are rejected.

`example-measurements.json` is synthetic schema documentation. Its provenance
flags deliberately prevent it from producing a route.

Aggregate each candidate run against its own experiment file. After multiple
candidate ranks are complete, merge their reviewed measurements. The merge
requires identical corpus, thresholds, and candidate ladder contracts and
rejects duplicate cells, incomplete request matrices, skipped lower ranks, or
prior-candidate evidence hashes that do not match the exact included files:

```bash
npm run ve:merge-visual-model-measurements -- \
  --input evals/visual-model-policy/runs/<small-model>/measurements.reviewed.json \
  --input evals/visual-model-policy/runs/<escalation-model>/measurements.reviewed.json \
  --out evals/visual-model-policy/runs/ladder.measurements.json
```

Generate a policy only from the non-synthetic, fully adjudicated merged
measurements:

```bash
npm run ve:select-visual-model-policy -- \
  --input evals/visual-model-policy/runs/ladder.measurements.json \
  --out ~/.artifacture/visual-model-policy.json
```

The selector exits `1` if any measured family has no qualified route. Do not
promote an unmeasured frontier model into the qualified policy. Add evidence
and test the next model rank. When no route qualifies, runtime must disclose
`no-eval-qualified-model`, use the best available visual-capable model, and
label the result `unqualified-fallback`.

## Ladder discipline

Run the corpus-declared batch sizes `1, 2` for the smallest candidate first. A
larger batch is safe only if the corpus supports it and its own grounding,
silence, schema, latency, and cost measurements graduate. Cases are
deterministically shuffled per replicate. A criterion tail wraps to already
observed cases only to keep the request at the exact configured batch size;
wrapped observations never increase unique evidence. Missing criterion
coverage still blocks graduation.

This seed can compare batch 1 with batch 2 only. Before evaluating batch 4 or
larger, add enough non-duplicate criterion coverage and declare the expanded
batch size in both the corpus and experiment. Absence of a batch-4 result is not
evidence that batch 2 is globally maximal.

After aggregation and selection, add the completed candidate to
`ladder_state.completed_candidates` with a `qualified` or `disqualified`
status and reviewed-measurement SHA-256 for each measured family.
The next run must name the next smallest untested candidate for every family
listed in `passes`; use a pass subset when family ladders are at different
ranks. Once one family has a selected model and a larger-model escalation
candidate, the runner refuses a still-larger candidate for that family.

```json
{
  "ladder_state": {
    "completed_candidates": [{
      "id": "exact-provider-model-id",
      "pass_evidence": {
        "layout": {
          "status": "qualified",
          "evidence_sha256": "<SHA-256 of that family's reviewed measurement file>"
        },
        "diagram": {
          "status": "disqualified",
          "evidence_sha256": "<SHA-256 of that family's reviewed measurement file>"
        }
      }
    }]
  }
}
```

No production measurements or model choices are checked in. The external inputs
still required are:

1. human sign-off on the rendered corpus labels;
2. exact ordered provider model candidates;
3. a live adapter with credentials supplied through its environment; and
4. provider-reported token/cache telemetry and actual cost; and
5. a controlled provider cache experiment if routing economics will rely on
   prefix-cache savings.

## Runtime escalation

The selected model gets one normal attempt and one schema-only retry. Escalate
to the next eval-qualified model only for:

- invalid JSON after that retry;
- explicit abstention;
- evidence that cannot be assigned to one image and region;
- provider failure or timeout after one retry; or
- an explicit out-of-distribution signal.

Do not escalate merely because the main thread prefers a more articulate
critique. The model finds and grounds violations; the main thread owns the final
narrative.

## Prefix caching

Qualification records provider-reported cache read/write tokens, total latency,
time to first token, prefix identity, and actual cost. Cache measurements and
model qualification remain independent: a cache hit does not make an inaccurate
model acceptable, and a qualified model does not justify an unmeasured batch.

This runner does not claim to implement the controlled cold/warm/suffix-count
matrix in `docs/plans/visual-eval-prefix-caching.md`, and it does not fold a
primer cost into model qualification. That separate experiment still needs
provider-specific cache-key controls, ordered primer/warm sequencing, suffix
counts `1, 2, 4, 8`, and its larger replicate counts. Only non-zero provider
cache-read telemetry establishes a cache hit.

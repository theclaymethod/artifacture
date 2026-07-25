# Visual verifier model policy

This harness answers one operational question:

> What is the smallest model, and the cheapest safe screenshot batch size, that
> can run each routed visual check family?

It does not benchmark artifact generation. `evals/model-matrix/` owns that
separate problem.

## Policy

Artifacture's main thread is an orchestrator. It gathers deterministic evidence,
dispatches visual judgment, merges findings, and reports uncertainty. It does
not inspect every screenshot with the host model.

Model choice is per pass, not global. A small model may qualify for clipping and
symmetry while a larger model remains necessary for operating-model fidelity.
Batch size is also per pass. Four screenshots in one request are allowed only
when the measured grounding and silence gates remain green.

The selector always:

1. filters out configurations that miss a quality or sample-size gate;
2. chooses the lowest-ranked (smallest) qualified model;
3. chooses the lowest-cost qualified batch size within that model; and
4. records larger qualified models only as runtime escalation fallbacks.

A cheaper larger model does not displace a qualified smaller model. Change the
candidate `rank` ordering when deployment policy defines “smallest” differently.

## Required eval data

Use human-reviewed fire/clean cases for each pass. Include hard negatives:
intentional asymmetry, authored dead space, dense expert surfaces, decorative
but truthful states, and screenshots containing several unrelated regions.

For every `model × pass × batch_size` cell, record:

- at least 3 independent runs;
- at least 10 positive and 10 negative cases;
- TP, FP, TN, and FN;
- correct image-and-region grounding;
- JSON validity and explicit abstentions;
- p95 latency and actual provider cost; and
- the exact model, image detail, and stable prefix identity used.

The default graduation gates are:

| Metric | Gate |
|---|---:|
| Precision | ≥ 0.90 |
| Recall | ≥ 0.90 |
| Silence accuracy | ≥ 0.95 |
| Image/region grounding | ≥ 0.95 |
| JSON validity | ≥ 0.99 |
| Abstention rate | ≤ 0.05 |
| p95 latency | ≤ 30 s |
| Cost per case | ≤ $0.01 |

These are floors, not universal truth. High-consequence families can override
them in the measurement file.

## Generate a policy

Copy `example-measurements.json`, replace the placeholder candidates with the
actual direct-API models under test, and populate results from the eval run:

```bash
npm run ve:select-visual-model-policy -- \
  --input evals/visual-model-policy/measurements.json \
  --out ~/.artifacture/visual-model-policy.json
```

The command exits `1` if any measured pass has no qualified route. Do not turn
that into an automatic frontier-model fallback. Add cases, test the next model,
or disclose `no-eval-qualified-model`.

Set `ARTIFACTURE_VISUAL_MODEL_POLICY` when the policy lives elsewhere.

## Runtime escalation

The selected model gets one normal attempt and one schema-only retry. Escalate
to the next eval-qualified model only for:

- invalid JSON after that retry;
- explicit abstention;
- evidence that cannot be assigned to one image and region;
- provider failure or timeout after one retry; or
- an explicit out-of-distribution signal.

Do not escalate merely because the main thread prefers a more articulate
critique. The model's job is to find and ground violations, not to write the
final narrative.

## Prefix caching

Use the immutable evidence-prefix contract in `evals/visual-cache/`. Cache
measurements and model qualification are independent gates: a cache hit does not
make an inaccurate model acceptable, and a qualified model does not justify an
unmeasured batch size.

---
name: ve-verifier-operating-model
description: Route each slide or coherent page section to the minimum explanatory treatment and judge operating-model fidelity only where applicable. Returns only verdict JSON.
tools: Read
---

# ve-verifier-operating-model

Run one verification pass. Do not fix files.

## Read

1. `plugins/visual-explainer/scripts/verify/rubrics/pass-operating-model.md`
2. One screenshot per review unit: slide, presented stage, or coherent page section.
3. The review map supplied by the orchestrator: unit id, unit type, visible title, and one-sentence narrative job.
4. Only the brief excerpts needed to resolve a unit's intended decision.

Route every unit before judging it. Do not penalize `none` units for lacking a
diagram. Do not infer intent from implementation source.

## Output

Return only one valid JSON object matching the rubric schema:

```json
{"pass":true,"routing":[],"findings":[]}
```

Do not include prose, markdown, code fences, summaries, or recommendations
outside `routing` and `findings`.

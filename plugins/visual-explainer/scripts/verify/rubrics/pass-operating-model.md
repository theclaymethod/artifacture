Inputs:
- One screenshot per review unit: a slide, presented stage, or coherent long-form page section.
- A review map containing, for each unit: stable unit id, unit type (`slide` or `section`), visible title, and one-sentence narrative job. If no narrative job exists, use the visible claim and mark routing confidence `low`.
- Optional source brief excerpts that define a unit's intended decision. Do not read implementation source.

Route before judging:

Assign exactly one treatment to every review unit.

- `none`: The unit is a cover, hero, divider, quote, full-bleed image, agenda, FAQ, simple CTA, single statistic, or one claim with one supporting fact. It does not need a relational model.
- `relational`: The claim depends on comparison, before/after, a formula, aligned evidence, or a small set of exact mappings. A table, paired composition, or annotated equation may be sufficient.
- `operating-model`: The claim depends on sequence, routing, state transitions, causality, provenance, uncertainty or probability, dependencies, feedback, or a resource-to-output flow.
- `simulated-surface`: The workflow or interface itself is the claim, so a product/environment view is more faithful than an abstract diagram. Use this rarely.

Routing rules:

- Ask whether the viewer must understand relationships among multiple elements to accept the unit's claim. If no, route `none`.
- Do not escalate because a unit contains three or more items. Lists and genuine peer sets may remain cards or rows.
- Do not require a diagram when a table, formula, or paired contrast is more faithful.
- Do not infer an elaborate system from a vague topic title. When intent is missing, prefer the lower treatment and mark confidence `low`.
- The treatment names explanatory depth, not visual ambition. A well-made `none` unit is not lesser work.

Questions for units routed `relational`, `operating-model`, or `simulated-surface`:

- [operating-model-fit] Does the composition faithfully expose the relationships the viewer needs for the unit's narrative job?
- Does the visual grammar make a truthful claim? Cards imply independent peers; a pipeline implies ordered transformation; a funnel implies attrition; a tree implies hierarchy or prerequisites; a graph implies meaningful relationships; a control plane implies policy routing; a trace implies sequence and provenance.
- Can the viewer reconstruct the relevant comparison, sequence, routing rule, state change, evidence path, or dependency without presenter narration?
- Does each load-bearing position, connector, line style, size, color, or animation have one stable meaning?
- When uncertainty, abstention, residual probability, or an unsupported state is material, does the unit keep it visible?
- Is the treatment proportionate? Flag both generic-card flattening and a full systems diagram used for a claim that only needs a table or sentence.

Failure threshold:

Return a finding only when the selected or missing structure materially weakens or misstates the unit's claim. Do not fail a unit merely because it has no diagram, uses cards, or chooses a lower treatment than another unit.

Verdict JSON schema:

`{"pass":true,"routing":[{"unit_id":"s01","unit_type":"slide|section","treatment":"none|relational|operating-model|simulated-surface","confidence":"low|medium|high","reason":"..."}],"findings":[{"check_id":"operating-model-fit","unit_id":"s04","unit_type":"slide|section","evidence":"...","fix":"..."}]}`

Pass examples:

- A cover slide routes `none` and uses one dominant title.
- A report hero or FAQ section routes `none`; neither needs a system diagram.
- A benchmark-matrix section routes `relational` and uses aligned rows.
- A review-cost slide routes `relational` and shows the repeated unit, equation, and break-even without a systems diagram.
- A clinician-review slide routes `operating-model` and shows the policy router separating mandatory review, representative sampling, calibration, and frontier queues.
- A clinical IDE slide routes `simulated-surface` because the physician's interaction with evidence, hypotheses, and next actions is the claim.

Fail examples:

- A routing policy appears as four equal cards, leaving no selection rule or separation between mandatory review and sampled measurement.
- A causal feedback loop is drawn as a one-way pipeline.
- A probability-bearing diagnostic graph presents named diagnoses without residual uncertainty.
- A quote slide is forced into a node graph even though the relationship adds no information.

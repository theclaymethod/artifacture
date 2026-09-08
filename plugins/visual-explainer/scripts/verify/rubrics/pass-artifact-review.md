# Artifact review

Judge the exported artifact as one product, using the evidence package for its
detected profile. Do not invent source requirements or report a preference as
a defect.

## Inputs

- the mechanics report and detected profile;
- desktop and mobile screenshots where the profile supports both;
- the source/truth brief and a compact rendered-content inventory; and
- for slides, the generated paired-state deck-review manifest.

## Questions

1. **Correctness:** Does the artifact preserve the source facts, relationships,
   sequence, and state without implying unsupported claims?
2. **Completeness:** Are important source claims present, with examples and
   supporting detail attached to the right claim?
3. **Visual hierarchy:** Is the intended reading path obvious, with one clear
   focal region and quieter support at each state? Remove labels, badges,
   decorative numbering, and metric tiles that add no information or interaction.
4. **Mobile usability:** Where mobile applies, is content readable and usable
   without clipping, obstruction, or cramped interaction?
5. **Shipping quality:** Are the content, layout, and interactions ready to deliver, without
   template residue or unresolved visual defects? Read diagram
   labels at the displayed size; trace every connector and verify that chart
   scales, missing values, and annotations preserve the source data.

For slides, compare every paired state named by the manifest. Check continuity
within a slide and purposeful variation between adjacent slides. Do not judge
only the opening frame.

## Verdict

Return JSON only:

```json
{"pass":true,"findings":[]}
```

or:

```json
{"pass":false,"findings":[{"dimension":"completeness","region":"slide-03/body","evidence":"The source names two rollback triggers; only one appears.","fix":"Add the missing latency trigger beside the error-rate trigger."}]}
```

Every finding must name one benchmark dimension, one visible region, concrete
evidence, and the smallest useful repair. Abstain when the supplied evidence
cannot support a grounded judgment.

Inputs:
- The `deck-review-*.json` manifest for one scheme.
- One manifest `review_groups` entry at a time, using exactly the two
  full-frame screenshots named by its `state_ids`.
- The slide's visible title or one-sentence narrative job when it is not visible in the frame.
- No implementation source and no builder explanation.

Judge the rendered frames as truth. Complete every group in manifest order;
merge and deduplicate findings by `check_id`, `state_id`, and region. Labels,
captions, and source intent do not override contradictory pixels.

Questions:
- [deck-example-rendered-truth] When a slide labels examples positive/good/pass
  or negative/bad/fail, do the rendered examples visibly earn those labels?
  A negative must fail through real geometry, containment, hierarchy, state, or
  behavior—not through a decorative underline, warning color, or caption alone.
- [deck-annotation-evidence-mapping] Does every load-bearing annotation occupy
  the same row, column, connected region, or unmistakable visual path as the
  evidence it explains?
- [deck-reading-path-density] Is the intended first read obvious, with repeated
  explanation and redundant interface anatomy removed? Do not flag expert
  density when hierarchy remains clear and every region advances the claim.
- [deck-functional-metadata] Does every visible footer, corner label, eyebrow,
  badge, and kicker provide navigation, a source or citation, a required
  notice, current interactive state, or a changing comparison datum? Flag
  ornamental metadata that only repeats the case, deck taxonomy, topic, or
  generic adjectives.
- [deck-structural-variety] Across adjacent slides, do examples vary in domain,
  layout, or symmetry when the lesson claims to transfer? Flag a sequence that
  repeatedly uses the same fixture or silhouette when that repetition makes the
  method look narrower or the presentation feel mechanically templated.
- [deck-click-in-continuity] For every drill or progressive state, does the new
  content remain unclipped, collision-free, legible, and visually continuous
  with the base state? The click-in must add useful detail without obscuring the
  evidence or controls needed to understand or dismiss it.

Failure threshold:
- Return a finding only for a visible contradiction, ambiguous mapping,
  materially confusing reading path, credibility-reducing repetition, or
  broken interactive state.
- Attribute every finding to one or more exact `state_id` values and visible
  regions.
- Stay silent on generic typography, color taste, prose style, and visual AI
  tells; those belong to Impeccable or Unslop.
- Stay silent when repeated structure is semantically meaningful, such as a
  deliberate sequence, stable comparison matrix, or recurring navigation shell.

Verdict JSON schema:
`{"pass":true,"findings":[{"check_id":"<criterion-id>","state_id":"s03--drill--evidence","region":"right example lane","evidence":"...","fix":"..."}]}`

Pass examples:
- A pass example has equal tracks and baselines; its paired fail example visibly
  breaks those tracks before the viewer reads the caption.
- Annotation, example, and binary check form one aligned horizontal lane.
- A footer contains a source citation that the audience needs to evaluate the
  claim.
- Three adjacent slides teach containment, symmetry, and action priority with
  materially different compositions.
- A click-in expands into reserved space, keeps its dismissal affordance clear,
  and preserves the base slide's visual anchor.

Fail examples:
- “Bad” differs from “good” only through a rust underline and label.
- A note describing the right-hand example sits under the left-hand example.
- The slide repeats the same explanation in a caption, checklist, and footer.
- A lower-corner strip repeats the case name and strings together labels such
  as "synthetic · illustrative · probabilistic" without adding navigation,
  provenance, required notice, state, or comparison data.
- Four adjacent slides reuse the same centered card pair despite claiming a
  general review method.
- A drill sheet clips its last row or covers the trigger and close control.

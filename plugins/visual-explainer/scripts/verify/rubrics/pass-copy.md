Inputs:
- Excluded-filtered prose text only.
- Exclude code, identifiers, filenames, table headers, labels, counters, timestamps, status strings, Mermaid labels, and square-bracket system messages.

Questions:
- [title-claim-function] For each narrative slide title or section heading, does it name the concrete test, mechanism, result, decision, action, or completion criterion the unit earns? Flag calendar/program containers delivering outcomes, tool/data/score/package personification, abstract uplift transformations, journey/paradigm/pillars framing, generic topic handles when the body contains a stronger claim, and counting titles that describe deck structure instead of the point.
- [unslop-prose-style] Beyond fixed phrases, does this prose show AI-slop stylistic tells such as manufactured emphasis, predictable three-item list rhythm, hollow however/moreover transitions, or empty summary sentences that `/unslop` would rewrite?
- [copy-redundancy] Does any section heading merely rephrase its own first sentence with no added fact, number, or mechanism, or is the same explanatory point repeated across two or more sections?
- [jargon-undefined] For a broad or onboarding audience, does the copy rely on two or more acronyms or internal system names that are load-bearing yet never expanded on first use, glossed, or otherwise defined?

Verdict JSON schema:
`{"pass":true,"findings":[{"check_id":"<check-id>","evidence":"paragraph beginning ...","fix":"Run /unslop on the prose block and replace the rendered copy."}]}`

Fail examples:
- A capstone slide says "Week 1 ends with a calibrated eval" instead of naming the evidence that completes the capstone.
- A bias slide says "Your judge is lying to someone" instead of naming order, verbosity, and self-preference as the mechanisms.
- A handoff slide says "The package outlives the cohort" instead of naming the routes or owner decision.
- A substantive slide is titled only "Architecture", "Proof plan", "Three pillars", or "What the budget buys" when its body contains a specific result or decision.
- "In today's fast-paced landscape" opens a technical explainer.
- Three adjacent cards all use the same "X, Y, and Z" rhythm.
- A section ends with an empty recap sentence that adds no information.
- A heading says "Faster deploys" and the first sentence only says "Deploys are now faster."
- An onboarding explainer uses CRDT, WAL, and HLC without expanding or defining them.

Pass examples:
- "Examples calibrate the judge to your bar" describes a causal mechanism.
- "Week 1 ends on Friday" is a literal temporal fact.
- "Can one packet reconstruct both products?" states the decision test.
- A cover, divider, agenda, or exact technical reference label may use a concise literal title.

Title review is semantic, not a blanket subject-verb ban. The title is part of
the explanatory model: it tells the viewer what to inspect.

## De-Slop Rubric Addendum

Instruction hierarchy: if `/unslop` is available, invoke it on drafted prose before writing HTML. This rubric is the fallback when `/unslop` is unavailable and the verification layer for rendered copy. Deterministic literals live in `copy-slop-phrases`; this pass covers judgment.

Scope only prose surfaces: headlines, leads, card/tile descriptions, callouts, captions. Exempt code, labels, numbers, table cells, Mermaid labels, bracketed system messages, identifiers, filenames, timestamps, and literal quotes.

Cut on sight: throat-clearing openers, emphasis crutches, chatbot artifacts, significance inflation, promotional language, vague attribution, generic conclusions, binary-contrast drama, false concession, and punctuation tells such as repeated colon reveals or excessive em dashes.

Rewrite rule for findings: cut everything before the claim, replace inflation with the specific fact, preserve every number/name/date/version/quote, and avoid weakening technical terms.

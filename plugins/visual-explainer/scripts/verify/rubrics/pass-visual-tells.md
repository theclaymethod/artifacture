Inputs:
- `report.json` with deterministic visual-tell findings.
- Light/dark screenshots for page, slides, or magazine profiles.
- Candidate extracts named by deterministic checks.

Questions:
- [font-pairing-same-classification] Do heading and body fonts use two different non-code families in the same typographic classification with no real contrast axis? YES = warn.
- [default-accent-reflex] Is the only saturated accent a reflexive default indigo/blue or warm orange with no brand, subject, or data rationale? YES = warn.

Verdict JSON schema:
`{"pass":true,"findings":[{"check_id":"<check-id>","evidence":"screenshot/candidate ...","fix":"..."}]}`

Fail examples:
- Heading in Poppins and body in Montserrat, both geometric sans, presented as a deliberate pairing.
- A custom explainer uses only #6366f1 as accent color with no brand or subject reason.

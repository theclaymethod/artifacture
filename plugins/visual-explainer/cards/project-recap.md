# Project recap

Use this card when the supplied brief already contains the verified project
facts. Do not repeat repository-discovery instructions or invent facts that are
not in the brief.

## Narrative job

Help a returning engineer rebuild the project’s mental model quickly:

1. State what the system does and who it serves.
2. Show the current architecture as a compact module-and-data-flow diagram.
3. Separate shipped/recent changes from unresolved risks and decisions.
4. Surface the few invariants or couplings needed to work safely.
5. End with exactly the concrete decisions or actions requested by the brief.

Use source-qualified language. If the brief does not establish an owner, date,
status, metric, or causal explanation, omit it or mark it unknown.

## Composition

- Prefer one responsive page with a short section rail.
- Make the architecture the visual anchor, not a decorative hero.
- Use distinct treatments for shipped, risky, and undecided items; never rely
  on color alone.
- Keep detail proportional to decision value. Avoid raw commit logs, generic
  dashboards, and equal-weight card grids.
- On mobile, collapse multi-column sections, preserve diagram labels, and keep
  the next actions readable without horizontal scrolling.

Use shared Artifacture components where they clarify the story. Keep all
claims traceable to the task brief and revise the MDX/TSX source rather than
the exported HTML.

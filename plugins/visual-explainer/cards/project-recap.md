# Project recap

Use this card when the supplied brief already contains the verified project
facts. Do not repeat repository-discovery instructions or invent facts that are
not in the brief.

## Rebuild the context

Give a returning engineer the facts needed to resume work:

1. State what the system does and who it serves.
2. Show the current architecture as a compact module-and-data-flow diagram.
3. Separate shipped/recent changes from unresolved risks and decisions.
4. Explain the invariants or couplings that constrain changes.
5. End with the decisions or actions requested by the brief.

Use source-qualified language. If the brief does not establish an owner, date,
status, metric, or causal explanation, omit it or mark it unknown.

## Composition

- Prefer one responsive page with a short section rail.
- Give the architecture enough space to read.
- Use distinct treatments for shipped, risky, and undecided items; never rely
  on color alone.
- Keep detail that changes a decision or explains a constraint. Avoid raw commit logs, generic
  dashboards, and equal-weight card grids.
- On mobile, collapse multi-column sections, preserve diagram labels, and keep
  the next actions readable without horizontal scrolling.

Use shared Artifacture components where they clarify the story. Keep all
claims traceable to the task brief and revise the MDX/TSX source rather than
the exported HTML.

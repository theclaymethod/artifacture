---
description: Generate an editable, readable HTML diagram
---
Load `SKILL.md` and `cards/web-diagram.md`, then explain: $@
For comparisons or tabular data, use `cards/comparison-table.md` instead.

1. Inspect the supplied sources. State the question the diagram answers and identify the nodes, relationships, and boundaries needed to answer it.
2. Use `DiagramCanvas` for its supported layouts. Let content determine node size; split dense graphs into overview and detail. Read the card's conditional references for specialized types or custom SVG.
3. Keep MDX/TSX or Archify typed JSON as editable source, export through its route, and complete `references/verification.md` through the finalizer. Save to `~/.agent/diagrams/<slug>.html` with its editable source alongside it.

Use the default Lieflat-inspired preset unless the user names another. Labels, connectors, and supporting prose must explain the system; omit decorative headings, metrics, status, and legends.

## Independent sections

When three or more substantial sections can be built independently, use available parallel agents unless `--no-parallel` was passed. Give each worker its source evidence, content scope, and shared component/preset contract. Keep source ownership separate; integrate in the parent MDX/TSX artifact.

Raw HTML fragment fallback uses `references/section-contract.md`. Its specialist mappings remain `ve-hero-builder`, `ve-diagram-builder`, and `ve-table-builder`; `dashboard` and `prose` use a generic worker. Validate returned fragments and allow at most one retry per section before completing it locally.

Do not split a single diagram across workers. Build summaries after the evidence they summarize is available.

---
description: Rebuild a project's current mental model in editable HTML
---
Load `SKILL.md` and `cards/project-recap.md`.

Resolve `$1` as a history window: `2w` → two weeks, `30d` → thirty days, `3m` → three months. Otherwise treat it as context and use two weeks.

1. Read the project README, package manifest, and relevant change notes.
2. Inspect `git log --oneline --since=<window>`, `git log --stat --since=<window>`, and `git status`. Follow recent changes into the entry points, modules, and contracts that explain the current system.
3. Read relevant plans, ADRs, commit/PR descriptions, and available session context for recorded decisions. A TODO or unmerged branch is evidence of an item, not proof of its current status.
4. Keep a fact sheet linking every displayed claim to command output or file:line. Do not infer rationale, ownership, health, or completion from activity alone.

Compose the narrative in `cards/project-recap.md`: purpose, current architecture, meaningful recent changes, unresolved decisions, and the contracts needed to resume work. Use `DiagramCanvas` through the diagram card. State blockers and follow-up actions directly with their evidence; omit unsupported health counts, severity badges, and generic dashboards.

Use the default Lieflat-inspired preset. Author MDX/TSX, export to `~/.agent/diagrams/<slug>-project-recap.html`, and complete `references/verification.md`. Open the result and report its source, HTML, final report, and unresolved claims.

$@

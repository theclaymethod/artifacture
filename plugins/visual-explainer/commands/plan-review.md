---
description: Review a proposed plan against the current codebase in editable HTML
---
Load `SKILL.md`. Compare plan `$1` with codebase `$2`, or the current directory when `$2` is omitted.

## Establish the evidence

1. Read the plan: problem, proposed changes, reasoning, rejected alternatives, and scope.
2. Inspect referenced files and affected callers, tests, configuration, types, schemas, and public APIs.
3. Verify that referenced symbols exist and that the plan describes current behavior accurately.
4. Map each proposed change to its dependencies and validation needs. Record claim sources as plan sections or file:line; mark unknowns explicitly.

## Compose the review

Lead with the plan's intended behavior and the most consequential finding. Use as much structure as the evidence needs:

- Current and proposed behavior, with matching names and layout direction in comparison diagrams.
- Change-by-change discrepancies, omitted dependencies, and unsupported assumptions.
- Concrete risks: triggering condition, consequence, evidence, and mitigation. Include migration, rollback, concurrency, or ordering only where relevant.
- Recorded rationale and alternatives. An absent explanation is unknown, not an invitation to invent one.
- Existing validation and gaps that must be resolved before implementation.
- A short list of decisions or corrections needed to proceed.

Use `cards/web-diagram.md` for diagrams and `cards/comparison-table.md` for comparison tables. Default to the Lieflat-inspired preset. Show additions and removals with explicit labels; avoid glow, confidence badges, impact dashboards, invented line estimates, and empty Good/Bad/Ugly categories.

Author MDX/TSX and export to `~/.agent/diagrams/<slug>-plan-review.html`. Complete `references/verification.md`, open the result, and return the source, HTML, final report, and remaining uncertainty.

$@

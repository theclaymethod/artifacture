---
description: Generate an editable HTML implementation plan grounded in the codebase
---
Load `SKILL.md` and `cards/visual-plan.md`, then plan: $@
Use `cards/code-walkthrough.md` for sections that explain existing code.

## Establish the proposal

1. Extract the desired behavior, constraints, and scope from the request.
2. Inspect affected modules, callers, types, APIs, extension points, and existing tests. Find similar implementations before proposing new mechanisms.
3. Work through state transitions, API contracts, integration points, failures, concurrency, and compatibility.
4. Record each claim with its source location. Distinguish verified current behavior, proposed changes, and unresolved assumptions.

## Compose the plan

Lead with a concrete current-versus-desired example. Include the sections the implementation requires:

- A state or flow diagram when transitions matter. Follow `cards/web-diagram.md`; label decisions with their conditions and outcomes.
- A state table with names, types, purpose, and changes.
- API signatures and focused code snippets with source paths.
- Edge cases paired with expected behavior.
- A file/change table and implementation order where dependencies require it.
- Existing checks and direct runtime validation that would establish success. Propose new test files only within the user's authorized scope.
- Compatibility, performance, migration, or rollback notes that affect the design.

Prefer prose for rationale, tables for comparable facts, and diagrams for relationships. Use shared components and the default Lieflat-inspired preset. Do not add a document-type kicker, arbitrary focal statistic, metric tiles, or repeated cards around each paragraph.

Write MDX/TSX beside `~/.agent/diagrams/<feature-name>-plan.html`, export using `SKILL.md`, and complete `references/verification.md`. Open the artifact and report the editable source, HTML, final report, and unresolved assumptions.

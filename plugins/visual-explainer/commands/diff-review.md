---
description: Review a code diff in an editable HTML report with grounded findings
---
Load `SKILL.md`. Use this command for reviewer findings; use `/explain-diff` for a teaching walkthrough.

## Resolve the diff

| `$1` | Scope |
|---|---|
| Branch | Working tree compared with that branch |
| Commit | `git show <commit>` |
| `HEAD` | Unstaged and staged changes |
| PR number | `gh pr diff <number>` |
| Range | `git diff <range>` |
| Omitted | Working tree compared with `main`; resolve the repository's default branch if absent |

## Gather evidence

1. Read the diff, `--stat`, and `--name-status`, then the changed functions and surrounding callers needed to establish behavior.
2. Inspect affected public APIs, tests, configuration, documentation, and migrations.
3. Read commit/PR descriptions, relevant plans, and available conversation history for recorded rationale. Separate observed behavior from inference; do not invent rejected alternatives.
4. Keep a fact sheet mapping each displayed claim and quantity to command output or file:line. Mark unresolved claims as uncertain.

## Compose the review

Lead with the concrete behavior change and its consequence. Give findings priority: each names a trigger, impact, source location, and possible correction. Report material uncertainty and validation gaps. Omit empty categories and generic praise.

Add only sections that help a reviewer:

- Matching before/after examples or diagrams for changed behavior. Preserve node names and layout direction between versions.
- A compact file/change table when scope needs explanation.
- Validation evidence describing exercised behavior and gaps, rather than test-count tiles.
- Recorded decisions, required migrations, and non-obvious contracts needed for follow-up work.

Use `DiagramCanvas` for supported layouts and follow `cards/web-diagram.md` for specialized diagrams. Keep before/after labels explicit; color may reinforce them. Default to the Lieflat-inspired preset, with open sections, readable snippets, and ruled tables. Do not add a KPI dashboard, housekeeping badges, or confidence meters.

Author MDX/TSX and export to `~/.agent/diagrams/<slug>-diff-review.html`. Complete `references/verification.md`, open the result, and return the source, HTML, final report, and unresolved findings.

$@

---
description: Check a document against the codebase and correct factual errors
---
Load `SKILL.md`, then fact-check: $@

## Find the target and source

Use `$1` when supplied. Otherwise use the most recently modified HTML file in `~/.agent/diagrams/` (`ls -t ~/.agent/diagrams/*.html | head -1`). No creative clarification is needed.

For generated HTML, locate its sibling or referenced MDX/TSX source. Inspect the rendered artifact, correct the source, and re-export with `npm run ve:export`. Edit HTML directly only for legacy output or when no source can be found; record that limitation. Edit Markdown and other text documents in place.

Identify the document's comparison point: the git ref for a diff review, the plan for a plan review, or the stated history window for a recap. Do not compare every document against an unstated current baseline.

## Check each claim

Extract and verify:

- Numbers: file, line, function, module, and test counts.
- Names: paths, symbols, types, and signatures.
- Behavior: conditions, effects, and before/after descriptions.
- Structure: imports, dependencies, and module boundaries.
- History: dates, commits, and attributions.

Read every referenced file. Rerun relevant git commands. For a diff, inspect both `git show <ref>:file` and the working tree so before and after cannot be swapped. For plans, verify that referenced files and symbols exist and behave as described. For recaps, verify the activity narrative against the stated window.

Classify each claim as **confirmed**, **corrected**, or **unverifiable**. Cite the evidence for corrections. A claim that needs unavailable runtime evidence remains unverifiable. Leave opinions and design judgments alone.

## Correct and report

Fix inaccurate quantities, names, paths, behavior, and reversed comparisons. Rewrite a whole section only when its premise is wrong. Preserve the surrounding organization, formatting, and styling. Change diagram labels or edges only when they contain a factual error.

Add a verification summary with the total checked, confirmed count, corrections and their sources, and unverifiable claims. For Markdown, append `## Verification Summary`. For HTML, use a plain section that matches the page; read `references/css-patterns.md` only if needed to preserve its styling.

Report the corrections and open the result. If no correction was needed, say so. Return any source-location limitation and unresolved claim. This command checks facts; it does not reopen the document's design decisions.

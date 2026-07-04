---
description: Generate a literate HTML explanation of a code diff for understanding, not review
---
Load the visual-explainer skill, then generate an explain-diff page as a self-contained HTML artifact.

Credit: this mode adapts Geoffrey Litt's "explain-diff" gist: https://gist.github.com/geoffreylitt/a29df1b5f9865506e8952488eac3d524

**Which diff command to use.** Use `/explain-diff` when the reader needs a teaching walkthrough; use `/diff-review` when the reader needs reviewer-risk findings.

**Arguments.** `$1` may be a diff range, PR number, branch, commit, or file path. If omitted, use staged changes when present; otherwise default to `HEAD~1..HEAD`.

**Scope detection.**
- PR number (`#42`): `gh pr diff 42`
- Range (`abc..def`): `git diff abc..def`
- Branch: `git diff <branch>...HEAD`
- Commit: `git show <commit>`
- No argument: `git diff --staged`; if empty, `git diff HEAD~1..HEAD`

**Data gathering.**
1. Read the diff and `git diff --stat`/`--name-status` for scope.
2. Read surrounding code before and after each meaningful hunk. Do not explain a line without knowing the function/module contract around it.
3. Identify the audience-facing background: what system this code belongs to, what invariant existed before, and what behavior the diff changes.
4. Build a fact sheet with cited file paths, function names, and claims before authoring.

**Authoring contract.**
Read `cards/explain-diff.md`. Write MDX, no top-level tabs. Use a long-page format with a table of contents and four sections: Background, Intuition, Code, Quiz. Use `DiffBlock`, `CodeBlock`, and `Quiz`; use `DiagramCanvas`/`MermaidBlock` for 1-2 reusable diagram families and reuse them across sections with example data.

Prose bar: clarity and flow of Martin Kleppmann, classic style, smooth transitions. Then run the standard unslop step from `SKILL.md` before export.

Output path:

```bash
mkdir -p ~/.agent/diagrams
npm run ve:export -- <source.mdx> --out ~/.agent/diagrams/$(date +%F)-explain-<slug>.html
```

Then run §6 Verify from `SKILL.md` on the exported HTML and report the artifact path, report JSON, screenshots directory, and any remaining uncertainty.

$@

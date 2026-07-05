# Report Gloss

Completed: 2026-07-05T19:23:13Z

## Scope

Implemented the `uniform-descriptor-gloss` anti-pattern:

- Added the two-line Layout & Structure ban in `plugins/visual-explainer/SKILL.md`.
- Added F8 `uniform-descriptor-gloss` to `plugins/visual-explainer/scripts/verify/checks.json`.
- Implemented the static DOM detector in `plugins/visual-explainer/scripts/verify/lib/checks/static-dom.mjs`.
- Added `evals/fixtures/violations/uniform-descriptor-gloss.html` and wired `evals/expectations.json`.

## Detector

The rule scans repeated grid/list/catalog sibling groups and warns when at least five siblings pair a label with a muted 1-4 word lowercase non-sentence gloss.

False-positive guards skip table, form, stat, metric, unit, date, and price contexts. The detector also accepts direct-text labels, such as `Router <span class="muted">one canvas</span>`.

## Self-Sweep

Searched `visual-explainer-mdx/components.tsx`, `plugins/visual-explainer/templates/`, `plugins/visual-explainer/cards/`, and `examples/visual-explainer-mdx/` for descriptor-gloss patterns and the explicit examples `collapsible data`, `one canvas`, and `titled region`.

No source pages matched the new anti-pattern, so no component/template/card/example content needed changes.

## Verification

- `node evals/run.mjs UNSANDBOXED`: passed on retry; all 177 seeded violations and 5 clean fixtures passed.
- `node scripts/ve-mdx/check.mjs`: passed and rebuilt `dist/visual-explainer-mdx`.
- Broad static verify over generated `dist/visual-explainer-mdx/*.html`: 22 pages checked; 6 existing unrelated errors remained in generated examples (`magazine-page-fullbleed`, `poster-root-single-sized-element`, `autofit-safety-net-present-and-ordered`, `split-bleed-zero-padding`, `self-contained-html-file`, `theme-both-light-dark`).

No touched source page produced a `uniform-descriptor-gloss` error.

# Contributing

## Dev setup

- Node >= 22.
- `npm ci`
- `npx playwright install chromium`. The verifier's browser stage uses
  `playwright-core`, which never downloads browsers itself.
- `npm run ve:eval`. If it exits green, your environment is working.

## Adding a check

`ve-verify` is a deterministic design-quality gate driven by
`plugins/visual-explainer/scripts/verify/checks.json` (a list of check
objects with `id`, `family`, `severity`, `spec`, etc.). To add one:

1. Add an entry to `checks.json` with a unique `id`.
2. Implement the check logic wherever the matching stage/family lives in
   `plugins/visual-explainer/scripts/verify/`.
3. Add a seeded violation fixture at
   `evals/fixtures/violations/<check-id>.html` that trips the new check and
   nothing else.
4. Add the fixture's expected result to `evals/expectations.json`.
5. Run `npm run ve:eval` and confirm the new fixture is caught.

## Adding a shared component

1. Export the component from `visual-explainer-mdx/components.tsx`.
2. Add its name to the `sharedComponents` set in
   `scripts/ve-mdx/integrity.mjs:4-22` (strict-export integrity checks
   against this list).
3. Add it to the component list in `plugins/visual-explainer/SKILL.md`.
4. Run `npm run ve:check` to confirm export integrity holds.

## Adding a preset

Presets are semantic-token layers in `visual-explainer-mdx/global.css`,
selected via `data-ve-preset="<name>"` on the root. Add a new
`[data-ve-preset="<name>"] { ... }` block that sets the same semantic
tokens the existing presets set (mono-industrial, nothing, blueprint,
editorial, paper-ink, terminal, custom) — don't introduce new token names.

## Adding or changing a design system

Design systems are user-owned — usually private brand material — and live
OUTSIDE the repo (see `docs/design-systems.md`): `$ARTIFACTURE_DESIGN_DIR` →
`~/.artifacture/design-systems/` → `<repo>/design-systems/`. The repo ships
NO systems; the repo-local directory is gitignored (only its README is
tracked). Never commit a real brand's tokens, and keep eval fixtures
synthetic.

If you change the `ve:learn` extraction heuristics or the registry loader
(`scripts/ve-mdx/design-systems.mjs`, `learn-extractors.mjs`,
`learn-sources.mjs`), the eval suite in `evals/design-systems/` is the spec:
fixture sources with golden expected tokens plus loader resolution-order
cases, run as the second leg of `npm run ve:eval`. Update or extend the
fixtures/goldens under `evals/fixtures/design-systems/` with the change —
never weaken a golden to make a heuristic pass without hand-verifying the new
values against the fixture source.

## Before you open a PR

- `npm test` must pass.
- `npm run ve:check` must pass.
- `npm run ve:eval` must pass (verifier evals + design-system evals).
- If you touched or generated an HTML artifact, run the verifier on it
  (`node plugins/visual-explainer/scripts/verify/ve-verify.mjs <artifact.html>`)
  and fix any error-severity failures.
- Follow the checklist in the PR template.

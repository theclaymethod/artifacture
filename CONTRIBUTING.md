# Contributing

## Set up the repository

- Node >= 22.
- `npm ci`
- `npx playwright install chromium`. The verifier's browser stage uses
  `playwright-core`, which never downloads browsers itself.
- `npm run ve:eval`. This checks the local eval setup.

## Adding a check

`ve-verify` runs the mechanical checks in
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

Do not add subjective taste or prose rules to the mechanics catalog. Extend the
single profile-aware artifact-review rubric only when the product benchmark
proves a missing quality dimension. The explicit Artifacture semantic-gap
criteria remain registered in
`plugins/visual-explainer/scripts/verify/rubric-criteria.json`; run
`npm run check:manifests` after changing that registry.

## Adding a shared component

1. Export the component from `visual-explainer-mdx/components.tsx`.
2. Add its name to the `sharedComponents` set in
   `scripts/ve-mdx/integrity.mjs:4-22` (strict-export integrity checks
   against this list).
3. Add it to the component list in `plugins/visual-explainer/SKILL.md`.
4. Run `npm run ve:check` to confirm export integrity holds.

## Presentation deck changes

Two suites check the PresentationDeck engine (`visual-explainer-mdx/presentation.tsx` and
`presentation-core.ts`). Run both after changing it:

- `npm test` — unit tests for the pure logic (scale-to-fit math, the
  click-anywhere-to-close guard, tint helpers).
- `npm run ve:eval-presentation` — the behavioral eval suite
  (`evals/run-presentation.mjs`, a documented sibling of `evals/run.mjs`):
  exports `examples/visual-explainer-mdx/presentation-deck.tsx` through the
  standard `ve:export` path and replays the interaction, geometry, and
  token-consumption contracts headlessly with Playwright. New engine behavior
  should land with a new eval here (and verify it can fail by breaking the
  behavior locally before trusting it).

## Adding a preset

Presets are semantic-token layers in `visual-explainer-mdx/global.css`,
selected via `data-ve-preset="<name>"` on the root. Add a new
`[data-ve-preset="<name>"] { ... }` block that sets the same semantic
tokens as the existing presets. Do not introduce new token names.

## Adding or changing a design system

Design systems may contain private brand material and live
outside the repo (see `docs/design-systems.md`): `$ARTIFACTURE_DESIGN_DIR` →
`~/.artifacture/design-systems/` → `<repo>/design-systems/`. The repo ships
no user systems; the repo-local directory is gitignored (only its README is
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

- Run `npm run check`. It runs the local CI checks: unit and browser
  behavior, manifests, export integrity, deterministic mechanics, design-system
  cases, and PresentationDeck behavior. The checked-in runtime budget is 120
  seconds; diagnose a regression before raising it.
- During iteration, use `npm run check:fast`; it omits the seeded mechanics and
  PresentationDeck browser suites.
- For changes intended to improve artifact quality, generate baseline and
  candidate runs and complete `npm run check:release -- --judgments
  <reviewed-judgments.json>`. The reviewed manifests cryptographically bind the
  artifact, truth brief, verifier report, and exact screenshot evidence.
  Aggregate gains cannot hide a per-case regression or an all-ties no-op.
- If you touched or generated an HTML artifact, run the verifier on it
  (`node plugins/visual-explainer/scripts/verify/ve-verify.mjs <artifact.html>`)
  and fix any error-severity failures.
- Follow the checklist in the PR template.

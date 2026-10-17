# Install Artifacture

Use Node.js 22.12 or newer. Choose the skill for a coding agent, or the npm CLI for a React project.

## Install the skill

```bash
npx skills add theclaymethod/artifacture --skill visual-explainer
```

Then ask your agent to build an explanation, chart, slide deck, or video. The skill includes the component library, motion, themes, examples, renderer, and verification tools. Runtime packages and the verification browser are prepared automatically when needed.

## Use npm

```bash
npm install artifacture
npx artifacture add charts video
```

`add` copies editable components, installs missing dependencies, and imports their styles in your app entry. Import the named component from its local module and use it in your React app.

For a new project:

```bash
npx artifacture init my-explainer
cd my-explainer
npm run dev
```

The starter includes React, TypeScript, Vite, a responsive ISO composition, and finite motion with direct seeking. Dependencies are installed by `init`.

Discover blocks with `npx artifacture list`. Export and verify with the same CLI:

```bash
npx artifacture export explanation.mdx --out explanation.html
npx artifacture verify explanation.html --json report.json
```

See [workspaces](workspaces.md) for local source ownership and custom app entries. Runtime overrides and cache details are in the [skill troubleshooting reference](../plugins/visual-explainer/references/installation.md).

## Optional review skills

Impeccable reviews visual craft; Unslop reviews prose. Install them when you want those additional passes:

```bash
npx impeccable skills install
npx skills add theclaymethod/unslop
```

Artifacture exports and runs mechanical checks independently. Missing optional review skills are disclosed in the report.

## Claude Code plugin install

```bash
git clone https://github.com/theclaymethod/artifacture.git
/plugin marketplace add ./artifacture
```

Install Impeccable and Unslop separately with the recommended commands above.
The Artifacture plugin records a delegated pass as skipped when its owning skill
is unavailable.

## Manual file-based install

```bash
git clone --depth 1 https://github.com/theclaymethod/artifacture.git /tmp/artifacture
cp -r /tmp/artifacture/plugins/visual-explainer ~/.agents/skills/visual-explainer
rm -rf /tmp/artifacture
```

Then install Impeccable and Unslop into the skill directory used by the same
harness. Do not copy their instructions into the Artifacture folder.

## Pi install

From a full clone:

```bash
./install-pi.sh
```

The installer copies Artifacture's skill and prompts, then reports whether
companion skill directories are visible to Pi. It does not delete, replace, or
silently install the companion skills.

## Verify the core

For contributors, from the Artifacture repository:

```bash
npm install
npm run ve:check
npx playwright install chromium
npm run test:e2e
npm run ve:eval-presentation
```

The end-to-end suite exercises exported artifacts, copied consumer workspaces,
preview edits, verification reports, and PDF output. The presentation runner
checks real browser navigation and layout. Browser-backed checks require
Chromium; they fail when it is unavailable. Visual model qualification remains
a separate measured workflow.

## Qualify visual models

Select the model and screenshot batch size from measured review results.
Reserve the main agent for work that requires it.

1. Read `evals/visual-model-policy/README.md`.
2. Run human-reviewed fire/clean cases against candidate vision models and
   batch sizes.
3. Record the measurements.
4. Generate a policy:

   ```bash
   npm run ve:select-visual-model-policy -- \
     --input evals/visual-model-policy/measurements.json \
     --out ~/.artifacture/visual-model-policy.json
   ```

5. Set `ARTIFACTURE_VISUAL_MODEL_POLICY` only when the policy is stored
   somewhere else.

Qualification requires measured precision, recall, silence accuracy, correct
image/region grounding, valid JSON, latency, and cost. A batch size is valid
only for the pass/model combination that was tested.

## When a review tool is unavailable

Artifacture records missing capabilities and uses an explicit fallback only for
its own visual passes:

| Missing capability | Result |
|---|---|
| Browser automation | browser checks skipped with explicit disclosure |
| Impeccable | `impeccable:critique` skipped |
| Unslop | `unslop:cleanup-report` skipped |
| Eval-qualified visual model | best available visual-capable model runs as `unqualified-fallback` |

If no visual-capable model can run, the pass is skipped as
`no-visual-model-available`. An unqualified fallback is a completed visual
review, but it must not be described as eval-qualified.

## Updating

Update the skills independently:

```bash
npx skills add theclaymethod/artifacture --skill visual-explainer
npx impeccable skills install
npx skills add theclaymethod/unslop
```

For a development checkout, use `git pull --ff-only` and `npm ci` in that
checkout. Rebuild the bundled install with `npm run build:skill-runtime` after
changing shipped source, examples, or guidance. Commit the generated
`plugins/visual-explainer/assets/runtime.json.gz` with its source changes.
`npm run check:skill-runtime` compares the snapshot byte-for-byte against the
canonical source; CI's fast check rejects a stale bundle; npm packaging rebuilds it automatically.

After changing models, prompts, image detail, rubrics, or batching, rerun the
visual evals before replacing the generated policy.

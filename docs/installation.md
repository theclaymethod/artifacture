# Install Artifacture

Artifacture exports HTML and runs mechanical checks. Visual and prose review
use two additional skills:

- Artifacture owns artifact mechanics, rendered-state evidence, and
  artifact-specific visual semantics.
- Impeccable owns general visual craft and visual AI tells.
- Unslop owns prose quality and AI-writing patterns.

The three skills install and update separately. Artifacture calls the review
skills without copying their prompts. Mechanical errors fail verification; visual and prose judgments are reported
separately.

## Requirements

- Node.js 22 or newer
- a browser available to Playwright for rendered verification
- a skills-capable harness
- optional provider credentials for direct small-model visual evals

## Recommended install

```bash
npx skills add theclaymethod/artifacture
npx impeccable skills install
npx skills add theclaymethod/unslop
```

Artifacture's first generation clones the render pipeline into
`~/.artifacture`. A full repository clone uses itself as the pipeline.

Updating Artifacture must not silently change Impeccable's design rubric or
Unslop's prose rubric.

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

From the Artifacture repository:

```bash
npm install
npm run ve:check
npm run ve:eval-visual-model-policy
```

The last command verifies policy selection and cache-prefix identity. It does
not claim that a real provider/model is qualified.

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
git -C ~/.artifacture pull --ff-only
npm install --prefix ~/.artifacture
npx impeccable skills install
npx skills add theclaymethod/unslop
```

After changing models, prompts, image detail, rubrics, or batching, rerun the
visual evals before replacing the generated policy.

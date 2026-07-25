# Installation and skill-family setup

Artifacture is usable by itself for export and deterministic verification. Full
visual and prose review is a family-of-skills workflow:

- Artifacture owns artifact mechanics, rendered-state evidence, and
  artifact-specific visual semantics.
- Impeccable owns general visual craft and visual AI tells.
- Unslop owns prose quality and AI-writing patterns.

The skills stay independently installable and independently versioned.
Artifacture routes judgment to them and does not vendor their prompts. Legacy
deterministic craft/prose matches are candidate signals only; they do not count
as Artifacture failures.

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

The installation commands do not merge the three skills. This is intentional:
updating Artifacture must not silently change Impeccable's design rubric or
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

Artifacture should not spend the main/frontier agent on routine screenshot
review. Model and screenshot batch size are selected empirically per pass.

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

No model graduates from its name, size claim, or self-reported confidence.
Qualification requires measured precision, recall, silence accuracy, correct
image/region grounding, valid JSON, latency, and cost. A batch size is valid
only for the pass/model combination that was tested.

## Missing capability behavior

Artifacture never hides missing verification by substituting the current agent:

| Missing capability | Result |
|---|---|
| Browser automation | browser checks skipped with explicit disclosure |
| Impeccable | `impeccable:critique` skipped |
| Unslop | `unslop:cleanup-report` skipped |
| Eval-qualified visual model | pass skipped as `no-eval-qualified-model` |

The artifact may still be delivered with a clear incomplete-verification
receipt. It must not be called fully verified.

## Updating

Update each family member independently:

```bash
git -C ~/.artifacture pull --ff-only
npm install --prefix ~/.artifacture
npx impeccable skills install
npx skills add theclaymethod/unslop
```

After changing models, prompts, image detail, rubrics, or batching, rerun the
visual evals before replacing the generated policy.

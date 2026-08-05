# Artifacture product benchmark

This is the product decision suite. It answers one question: **did a change
make representative artifacts better without making any individual case
worse?**

It is intentionally small: six common Artifacture jobs, two viewports where
applicable, and five user-visible dimensions. A larger fixture count is not
success.

## Signals

- `correctness`: the artifact contains no invented or wrong claims.
- `completeness`: the brief's required facts and narrative jobs are present.
- `visual-hierarchy`: the intended reading order is immediately legible.
- `mobile-usability`: the 390×844 view remains readable and navigable.
- `shipping-quality`: a technical user would share the artifact as-is.

Every baseline/candidate pair must be reviewed for every applicable dimension. One loss
fails the comparison even when the candidate wins more dimensions overall.
Model judgments may help triage, but only a human-reviewed comparison can pass
the product gate.

## Workflow

1. Generate one baseline and one candidate artifact for each case with the same
   generation model and settings.
2. Capture the viewports applicable to each profile. Fixed slide frames use
   desktop evidence; responsive page cases use desktop and mobile evidence.
3. Review pairs blind to which side is baseline. Record `candidate`, `baseline`,
   or `tie` for every case and dimension.
4. Build a hashed manifest for each run:

   ```bash
   npm run ve:manifest-product-run -- --run-dir <run-dir> --output <manifest.json>
   ```

5. Prepare a run-specific judgments file. This binds both manifests and records
   every byte-identical artifact as a proven tie, leaving only changed cases for
   human review. Choose `improvement` when the change claims better artifacts;
   choose `non-regression` for infrastructure, performance, or refactoring work:

   ```bash
   npm run ve:prepare-product-review -- \
     --baseline-manifest <baseline.manifest.json> \
     --candidate-manifest <candidate.manifest.json> \
     --acceptance improvement \
     --output <judgments.json>
   ```

6. Review the remaining changed cases, then set `review.status` to
   `human-reviewed` and record the human reviewer and timestamp. Do not replace
   the generated manifest paths or SHA-256 values.
7. Run the product gate alone, or the complete release gate:

   ```bash
   npm run ve:eval-product -- --judgments <reviewed-judgments.json>
   npm run check:release -- --judgments <reviewed-judgments.json>
   ```

Exit `0` means every comparison is present, the review is human-reviewed and
bound to unchanged evidence, and it has no per-case regression. An
`improvement` review must also win at least one dimension; a `non-regression`
review may pass with all ties. Exit `1` means pending, incomplete, unchanged
under an improvement claim, or regressed. Exit `2` means the inputs or command
are invalid.

The deterministic mechanics suite remains `npm run ve:eval`. Paid model-routing
experiments remain research evidence; neither substitutes for this benchmark.

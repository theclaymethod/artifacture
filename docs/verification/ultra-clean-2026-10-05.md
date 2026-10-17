# Cleanup audit, 2026-10-05

## Critical assessment

The baseline was commit `eb06ef75c0619bbdd2c3f5cf2449f85759b26fd2`, with a clean working tree. Baseline lint and `check:fast` passed, including all 25 existing end-to-end cases.

The reusable-block architecture already has coherent ownership. The main safe cleanup opportunities were duplicated contracts, an identical diff implementation, unused React bindings, and obsolete comments. No whole module or declared dependency was proven unused. Public exports, the component copy catalog, package commands, generated entry points, native templates, and plugin routes are deliberate roots; internal import counts alone would misclassify several of them.

Eight separate research agents audited the lanes before central reconciliation. Generated output, vendored Hairline, fonts, native lockfiles, media, and fixtures were excluded from cleanup. The generated skill archive was rebuilt after source changes.

| Lane | Evidence | Outcome |
| --- | --- | --- |
| Deduplication | UI and exporter line-diff bodies implement the same LCS algorithm. Both baseline implementations matched on 121 input pairs. Unified-patch parsers have different validation policies. | Shared the line-diff implementation; retained separate patch parsers and small domain-specific helpers. |
| Shared types | ASCII descriptors, model options, easing, chart kinds, and pipeline normalization duplicated existing owner contracts. | Derived these types from their owners in six files, retaining public names and accepted shapes. |
| Unused code | TypeScript unused checks found 19 unused default React bindings. Registry/CLI/template/MDX searches resolved apparent orphan modules. All 20 declared direct packages have real use. | Removed the 19 bindings; retained hooks, named types, modules, public exports, and dependencies. |
| Circular dependencies | AST import/reexport resolution and SCC analysis, plus reviewed dynamic CLI/preview routes and registry dependencies. Final inventory includes 184 files and 341 local edges. | No runtime, combined type/runtime, reviewed dispatch, or registry cycles. No architectural movement needed. |
| Strong types | Core AST inventory found no explicit `any`. Installed package types and real validators were inspected. A runtime/compiler probe demonstrated sparse prepared-source maps declared as total records. | Retained honest input boundaries; deferred the exported map contract change. |
| Error handling | Reviewed 118 catch sites across 103 first-party files. Direct input, failure, and cancellation probes passed; all six existing preview cases passed. | Retained resource cleanup, rollback, validation, and observable failure policy. |
| Legacy paths | Direct checks rejected all seven retired generation presets while retaining historical review. Current runtime resolution and unknown-brand warning behavior were exercised. | Retained documented installation and review compatibility; no obsolete generation implementation remains to delete. |
| Comments and stubs | Comment, history, and stub searches across 103 first-party files; proposed comment replacements preserve executable ASTs. | Replaced four comment blocks in three files. No unfinished implementation stub was proven removable. |

## Recommendations

Implemented only high-confidence, behavior-preserving changes. Medium-confidence issues remain separate work:

- `PreparedSourceScene` exposes total `Record` maps although missing cells and ranges are valid runtime states. Model those maps as sparse in a compatible public API migration, then narrow the consumers that require presence.
- `AsciiImage` and `AsciiSweep` translate every sampler failure into a CORS message. Invalid cell size, contrast, or glyph ramps deserve accurate diagnostics, with the UI failure contract verified.
- The browser diagnostic CLI uses different automatic profile/preset detection from production verification. Establish its intended contract before consolidating detection.
- Verifier drill-close and slide-transition timeouts can produce partial capture behavior. Assess evidence completeness before changing best-effort recovery.
- Historical preset filename exemptions, snapshot-less installation support, and the alternate theme-file loader remain supported or externally callable. Remove them only after proving their consumers have migrated.

No generic lifecycle, error, decoder, or schema abstraction was added. Similar-looking chart, diagram, and timing types retain distinct domain semantics.

## Implementation

- [`diff-lines.mjs`](../../visual-explainer-mdx/diff-lines.mjs) owns the unchanged line-diff algorithm. Its adjacent declaration owns `DiffRow`; [`code-blocks.tsx`](../../visual-explainer-mdx/code-blocks.tsx) imports and reexports that public type. The exporter uses the same executable leaf. Both new files are included in the hidden `__code` copy closure.
- Owner-derived types replace copied definitions in `ascii-object.tsx`, `model-source.ts`, `teaching-motion.ts`, `comparison-motion.ts`, `charts.tsx`, and `content-blocks.tsx`.
- Nineteen unused default React bindings were removed under the existing automatic JSX configuration. Component package requirements remain unchanged.
- Roster and literal-parser comments now state current maintenance/security contracts. `fitStage` documentation accurately describes zero-size handling without claiming that its clamp sanitizes NaN.
- The bundled skill runtime contains the updated source and both new diff files.

No test files, test helpers, fixtures, dependencies, lockfiles, component APIs, or styling behavior were added or removed.

## Validation

Focused checks passed:

- `tsc --noEmit --noUnusedLocals --noUnusedParameters` after import removal.
- `npm run lint`, `npm run typecheck`, and `node scripts/components/check.mjs`; all 50 public block API/source/package/declaration closures agree.
- Direct diff comparisons: 121 input pairs against both original algorithms, 242 exact React SSR markup comparisons across unified/split modes, and 110 changed-pair exporter injections. The corpus includes repeated/reordered lines, empty strings, CRLF, trailing newlines, and Unicode.
- Direct failure/cancellation and preset-policy probes, plus the six existing preview tests.
- Final dependency analysis: zero cycles, unresolved first-party code edges, or parse errors. Declaration files and the executable MJS leaf were included; external packages and generated/vendor code were excluded.
- `npm run build:skill-runtime`: 587 bundled files; no generated archive was hand-edited.

Final `npm run check:fast` passed: bundled-runtime freshness, all 25 existing end-to-end cases (zero failures), TypeScript, release manifests, component copy closures, integrity fixtures, bundled and static exports, and finite graphical video exports. `git diff --check` also passed. No new test files were created.

The full visual/model evaluation corpora, native engine render failures, GPU allocation failures, filesystem permission races, and external consumer migrations were not exercised. The line-diff algorithm's quadratic complexity is unchanged. Sampled equivalence and existing end-to-end checks do not establish exhaustive behavior or visual quality.

Detailed lane receipts and command logs are retained locally at `/Users/claytonkim/.codex/investigations/artifacture-ultra-clean-2026-10-05/`.

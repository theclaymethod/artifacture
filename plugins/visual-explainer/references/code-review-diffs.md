# Code diffs that carry the review

Use `diff-block` for a page with arbitrary source text or a supplied patch. Use `code-diff` when the code must participate in the scene → composition → slide → video pipeline. It returns ordinary immutable scenes and finite motion; there is no editor runtime or second animation clock.

```bash
node "$SKILL_DIR/scripts/artifacture.mjs" list --query code-diff --json
node "$SKILL_DIR/scripts/artifacture.mjs" add code-diff slides video --cwd /absolute/workspace
```

Read `examples/visual-explainer-mdx/code-review-diffs-source.ts` for the actual source, `code-review-diffs.tsx` for the interactive four-theme gallery, and `code-review-diffs-video.tsx` for a single continuous review scene. Resolve `REPO` through the installed CLI. Import the functions from `REPO/visual-explainer-mdx/code-diff` for standalone artifacts, or the copied leaf in a React workspace.

## Choose what the viewer needs to inspect

| Treatment | Use it to |
| --- | --- |
| Aligned split | Compare the same source row across versions. Insertions and deletions leave gaps. Identical trimmed lines anchor an indented statement inside a newly added guard. |
| Unified | Read the change in a single column. `+` and `−` identify additions/removals; inline fills and underlines isolate changed tokens without a red/green dependency. |
| Focus | Transfer attention to a specific change during a narration interval. Context stays in place. Focus clears at the exact end of the interval. |
| Identity transition | Watch the old source become the new source. Retiring parts clear in the first quarter, retained characters move in the middle half, and new parts arrive in the final quarter. Reverse uses the same identities. |

Pin a review's base/head and obtain literal file contents from those commits. For an excerpt, pass the real one-based `beforeStart` / `afterStart`. `filename` is meaningful provenance, not editor decoration. Label illustrative examples as examples. Keep the full text/evidence in the review package.

## Build once, then choose the view

```ts
const diff = prepareCodeDiff({ before, after, context: 2 });
const view = createCodeDiffScene({
  id: 'cache-diff', title: 'Preserve cached zero',
  description: 'The return condition now distinguishes null from zero.',
  diff, filename: 'src/cache.ts', mode: 'split',
  bounds: { x: 0, y: 0, width: 1400, height: 600 },
  fontSize: 22, columnWidth: 13.4, lineHeight: 38,
});
const motion = focusCodeDiff(view, {
  duration: 12,
  beats: [{ changeId: diff.changeIds[0], start: 1, end: 4 }],
});
```

Choose IDs from `diff.changeIds`; no-change diffs have none. Derive `start` / `end` from measured cues rather than paragraph length. One cue focuses the complete contiguous change, including its corresponding old and new rows. Beats must be ordered and nonoverlapping. Context opacity defaults to 0.72; review contrast if changing it.

Render `sampleScene(view.scene, motion, seconds)` with `GraphicCanvas`. Place it with `composeGraphics` to pair a condition with a visible input and outcome. No hand-built copy of the code DOM is required.

For the edit itself, call `createCodeDiffTransition` with the same common layout fields, `duration`, `start`, and `transition`; optionally pass `direction: 'reverse'`. Its returned `scene` / `motion` plug into the same sampler, compositor, and video exporter. It uses all source lines rather than the folded comparison view. Reused part IDs preserve exact literal text; matching is deterministic text matching, not an AST or rename detector.

## Keep the code readable and honest

The scene route accepts printable ASCII, CRLF/LF, blank lines, and tabs expanded at explicit 1–8-column tab stops. It preserves the original strings in the diff receipt. Comparisons use the expanded display text: equivalent tabs/spaces or CRLF/LF can produce no displayed change despite different original bytes. Limits are 200 lines and 240 expanded columns per version; identity transitions additionally limit each version to 6,000 characters and require characters in both versions. Use split/unified for an empty-file introduction/deletion and `DiffBlock` for Unicode source.

Geometry uses authored monospace metrics. Oversized code, headers, and context folds reject rather than silently shrinking or clipping. Reduce context, select an evidenced excerpt, or author a wider frame. For portrait video, use unified or identity views in a separately composed narrow stage. The gallery scrolls dense figures on narrow screens to preserve reading size.

Use the theme's ink, neutral deletion marks, and one accent for additions/focus. The default is Hairline; 3b1b, Mono Color, and Algebrica retain the same geometry. No syntax-color theme or simulated IDE chrome is added.

Prove earlier → later → earlier equality, literal endpoint contents, line origins, gaps, focus boundaries, and containment. Inspect the removal/movement/arrival phases separately. Replay the same input after the correction and show the observed result. A code transition demonstrates the edit; it does not establish application correctness or performance by itself.

# Create a workspace from editable blocks

Create a React, TypeScript, and Vite workspace:

```bash
npx artifacture init ./explainer
cd explainer
npm run dev
```

The starter uses ISO and includes a scene composition, finite motion, and a time scrubber. Edit the authored scene and sequence in `src`. The copied modules in `src/artifacture` belong to the new workspace.

`init` installs the starter dependencies. `add` installs missing packages and adds stylesheet imports to the app entry. The installed skill uses the same CLI automatically; its user only needs the skill install command.

## Discover blocks before authoring

The CLI reads one explicit component registry for both discovery and copying.
Agents can search capabilities, primitive names, and public APIs:

```bash
npx artifacture list --query circle --json
npx artifacture list --query focus --json
npx artifacture list --query threads --json
npx artifacture list --query sequence --json
npx artifacture list --query split --json
```

`list --json` returns the complete current catalog. Each entry includes capabilities,
primitive names, reuse levels, delivery formats, module exports, supported variants, constraints,
working example paths, the transitive copy files, package requirements,
stylesheets, and the exact add command. Search is case-insensitive and matches
all words in the query. An empty result means the requested capability is not
indexed; candidate research is separate from the available catalog.

`entryPoints[].defaultImport` is relative to the generated `src` directory.
`files[].destination` is relative to the configured component directory,
which defaults to `src/artifacture`. Adapt import paths when authoring elsewhere
or using another `artifacture.json` destination.

Before creating a custom block, read its closest existing entry and example,
then run its `addCommand` in the consumer project. The release audit checks
indexed module exports, example files, dependency closure, and package advice.
Generated workspace `AGENTS.md` includes this discovery workflow. Proposed
additions live in [primitive candidates](research/primitive-candidates-2026-10-04.md).

The [component catalog](component-catalog.md) groups the named APIs and supported
variants. Its [editable preview source](../examples/visual-explainer-mdx/component-catalog.tsx)
shows the actual components in all four themes, with direct authored-time seeking.

## Add blocks

From any directory, add blocks to an existing workspace:

```bash
npx artifacture add charts slides video --cwd ./explainer
```

Required packages and stylesheet imports are added automatically. Import the copied leaf module you use, such as `./artifacture/lieflat-charts` or `./artifacture/graphic-slides`. Keep the Artifacture license beside those files.

The `authored-values` and `narration-cues` leaves copy parameter sampling and subtitle tools without npm dependencies. Keep their copied `LEMO-LICENSE` notice as well. Sample parameters with the same authored time as the scene; compile narration cues against the actual audio duration before serialization.

The `charts` block retains the five Lieflat encodings under the shared themes. The `iso` block adapts prepared silhouette and crease paths; it does not install the native pointer engine. The `video` block adds the existing paused GSAP playback runtime and supports one video host per document. See [graphics and video](graphics-and-video.md) for the source contracts.

The original `video-frames` leaf defines frame rounding explicitly and separates the last encoded sample from the authored endpoint. Await detached snapshots when inspecting a loop; frame closure does not prove audio or velocity continuity.

## Inspect a copy before writing

Use a dry run to inspect the planned files:

```bash
npx artifacture init ./explainer --dry-run
npx artifacture add charts --cwd ./explainer --dry-run
npx artifacture list --json
```

Exact component copies preserve existing bytes and modification times. Required dependencies and stylesheet imports are added only when missing. Changed destination files cause the whole preflight to fail. Reconcile local edits before retrying. There is no overwrite flag.

Paths must have no symlink ancestors. On macOS, use canonical temporary paths such as `/private/var` instead of the `/var` alias. A failed write removes only files created by that invocation whose ownership and bytes still match. If that cannot be confirmed, the error reports the remaining paths.

`artifacture.json` records the relative source destination. A new workspace uses `src/artifacture`. Adding blocks to an existing React project uses that destination unless its config selects another confined directory. The CLI retains existing dependency ranges. Use `--no-install` to manage packages yourself, or `--entry <file>` for a custom app entry.

## Reuse a scene across formats

Author geometry as a `GraphicScene`. Combine complete scenes with `composeGraphics`, then render that composition directly for a diagram or poster. Wrap it in slides and a finite sequence for video.

Motion uses the same explicit time at every level. The existing sampler supports opacity, path reveal, focus handoff, and translation of illustration objects. Keep diagram movement in the diagram layout owner so labels and connections stay together. Use `linear` or `smooth` easing and hold the completed state for reading.

Inspect the start, transitions, holds, and end. Seek backward and forward to the same time and compare the frame. Compose narrow and wide layouts deliberately. Use the [component references](component-references.md) for new blocks and motion ideas.

Run the generated project's build after changes:

```bash
npm run build
```

For 3D figures, discover `model-view`, `shape-ascii`, `particle-object`, `living-forms` and `procedural-props`. Generated workspace guidance includes the img2threejs authoring workflow, fresh-factory ownership and awaitable capture. The copied `MODEL-AUTHORING.md` travels with model blocks. See [model visuals](model-visuals.md) for source-to-figure reuse; `orbital-text` and `trace-path` remain independently copyable SVG leaves.

Workspace `AGENTS.md` records source ownership, theme rules, reuse across formats, and the opt-in rule for new test files.

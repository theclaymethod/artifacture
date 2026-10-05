# Video collection contract

`plugins/visual-explainer/video/collection.mjs` exposes `readCollection(filename, { repositoryRoot })`, `checkCollection(input, { repositoryRoot })`, and `scaffoldCollection(checked, { outputRoot, runtimeRoot })`. Validated records are deeply frozen. The writer requires the original record returned by the reader or checker and rechecks its complete manifest and evidence before creating output. Copied or deserialized records must be checked again. `video/modes.mjs` is the owner of instructional mode IDs, required brief fields, and review questions.

The CLI is `npm run ve:video-collection -- modes`, `check MANIFEST.json [--repo DIR]`, or `scaffold MANIFEST.json --out NEW-DIR [--repo DIR]`. It parses JSON without loading author-supplied JavaScript. Git reads use argument arrays and full commit IDs. The graphic-video export stage separately executes the authored TSX through Vite.

## Manifest fields

Version 1 is a closed JSON object. Unknown fields fail validation at every declared boundary. IDs use lowercase words joined by hyphens.

| Field | Contract |
|---|---|
| `version`, `id`, `title`, `question` | Version `1`, semantic collection ID, readable title, and shared question. |
| `audience` | `who`, `knows` array, and `goal`. |
| `theme` | A built-in or registered custom `preset`, default `"hairline"`, and `appearance: "light"` or `"dark"`. Appearance is separate from component surface tones. |
| `format` | Positive integer `width` and `height` up to 8192, `fps` of 24, 30, or 60, and `narration` of `"none"` or `"authored-script"`. |
| `terms` | Records with `id`, `name`, `definition`, and `aliases`. Names and aliases cannot be ambiguous. |
| `subjects` | Records with `id`, `name`, `meaning`, and `visualRole`. This is the canonical identity owner. |
| `evidence` | Pinned records described below. |
| `scenes` | Fixed-orientation diagram records described below. Geometry belongs to `createDiagramScene`. |
| `episodes` | Ordered records with mode facts, claims, and matched visual and narration beats. |

## Evidence bindings

All evidence records have a unique `id` and `kind`.

| Kind | Required fields and binding |
|---|---|
| `git-file` | `repository`, full `commit`, `path`, one-based `firstLine` and `lastLine`, and `excerptSha256`. The compiler reads the exact Git file and verifies the selected excerpt. |
| `git-diff` | `repository`, full `base` and `head`, `path`, `side` of `"before"` or `"after"`, line anchors, and `excerptSha256`. The compiler also checks that the pinned endpoints modify that path. |
| `document` | HTTPS `source`, full immutable `revision`, supplied `excerpt`, and `excerptSha256`. The compiler binds the supplied excerpt. It does not fetch or verify the remote document. |
| `observation` | Local `record`, `sha256`, ISO `observedAt`, and `scope`. The compiler verifies the local bytes. It does not reinterpret the observation as a completed review. |

Git supports full 40-character and 64-character object IDs. Moving references such as `HEAD` fail. Repositories and observation paths resolve inside `--repo`, including through symlinks. File paths reject traversal, absolute paths, control characters, and backslashes. `repository: "."` selects `--repo` itself.

Excerpt hashes cover UTF-8 lines joined by a newline, without an extra final newline. They bind a claim to an inspected source range. They do not establish that the claim is true, complete, or fairly worded.

## Shared scenes and episodes

A scene has `id`, `title`, `description`, a `direction` of `"horizontal"` or `"vertical"`, `nodes`, and `edges`. A node has a canonical `subject` ID and a `glyph` of `"rect"`, `"oval"`, `"diamond"`, or `"dot"`. Labels and descriptions come from the subject registry, so an episode cannot silently rename a subject. An edge has `id`, `from`, `to`, and `label`. Its endpoints must belong to the scene. The diagram owner computes all coordinates and routes.

An episode has these fields:

- `id`, `title`, `mode`, `question`, `outcome`, and `handoff` describe the explanation.
- `requires` lists earlier episode IDs. Unknown, forward, and cyclic prerequisites fail.
- `introduces` lists term IDs first introduced here. `terms` lists the episode's vocabulary. Referenced terms must already be introduced or introduced here.
- `uses` lists every subject in the episode's scenes. `engine` currently accepts only `"hyperframes"`.
- `durationSeconds` is finite and positive. It equals the sum of authored beat durations.
- `claims` contains records with `id`, `text`, an `evidence` ID array, and an explicit `limitation`. Every claim appears in a beat.
- `brief` contains exactly the fields required by its mode. `modes` CLI output lists them. Change-review modes require `git-diff` evidence. Empty review findings are allowed.
- `beats` contains records with `title`, `explanation`, supplied `narration`, a shared `scene` ID, `durationSeconds`, `claims`, and `focus` subject IDs. Focus subjects must occur in that scene.

The generated source uses complete slide scenes and highlights each beat's supplied focus subjects. It keeps the exact diagram geometry and semantic object IDs. It does not infer new animation from prose, port arbitrary React slides, or synthesize native Manim scenes. The author can revise the editable composition to add supported motion.

## Output ownership

The compiler writes a fresh package containing `collection.normalized.json`, `COLLECTION.md`, and an episode directory for each episode. Each episode has `BRIEF.md`, `SCRIPT.md`, `outline.json`, `composition.tsx`, and `REVIEW.md`. `SCRIPT.md` is a draft narration and storyboard for iteration. `REVIEW.md` has questions and runtime checks, without a fabricated review result.

Script review establishes each beat's purpose, visible entry state, and visible exit state or intended viewer understanding. Render review inspects actual frames and transition locations, records defects, and repairs them locally. Format variants have separate compositions. These prompts follow the [video production references](video-production-references.md); the compiler does not infer their answers or record approval.

`collection.complete.json` is written last and records the manifest hash and draft authoring state. Readers must require that marker before consuming the package. The CLI refuses an existing output directory, reserves a new directory exclusively, and copies a prepared package. This is not an atomic publication guarantee against uncontrolled concurrent editors. A failed copy can leave a partial directory without the marker. It remains available for inspection, and a retry uses a new directory.

The source manifest is the collection knowledge owner. Edited TSX is the motion implementation owner. Regenerating a collection requires a new output path and never overwrites a hand-edited source. A valid manifest and a complete authoring package do not mean the script, narration, runtime, or delivered films are approved.

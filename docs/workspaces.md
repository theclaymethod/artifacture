# Template workspaces

Artifacture 1.0 starts from ordinary editable projects. The CLI has no runtime dependencies; the selected project installs its own tools. This branch is an unpublished prerelease.

```sh
artifacture list --json
artifacture info custom-slides --json
artifacture init ./my-talk --template custom-slides
cd my-talk
npm run dev
npm run build
npm run export
```

`build` and `export` both write `dist/`; export uses the same Vite configuration in standalone mode. Custom aliases, plugins, CSS, React dependencies and content therefore have one owner. The small `artifacture/vite` helper composes native MDX/React/Tailwind plugins. You can replace or extend it directly. `vite-plugin-singlefile` handles standalone delivery; Artifacture does not maintain another HTML inliner.

Import assets from source for bundling. Remote URLs and arbitrary `public/` files are not automatically embedded. Check the actual delivered HTML offline if that is a requirement.

The `iso-diagram` project imports Hairline directly. Its authoring skill is installed only for that template. `custom-slides` supplies a small editable presenter with stable IDs/history and progressive states; replace it with your own presenter or arbitrary TSX. Figure primitives are native imports.

## Native video

FFrames is the preferred video route. Install its native scaffolder using the upstream instructions, then:

```sh
cargo install cargo-fframes --locked
artifacture init ./my-film --template fframes-explainer
cd my-film
cargo run --release -- timeline
cargo run --release -- inspect
cargo run --release -- render
```

Artifacture calls `cargo-fframes new` and adds a narrative workflow. The generated project owns Rust, media, scenes, audio, inspection and rendering. Follow the official FFrames skill for platform/toolchain requirements. `--no-install` still needs the native scaffolder but skips package/skill installation. There is no engine-switch flag.

Use the `hyperframes-browser` recipe when the requested composition depends on DOM/CSS or a browser-only visual. PR reviews have a separate evidence/narrative recipe. Use ordinary media files to compose outputs across tools.

## References and skills

```sh
artifacture list --kind reference --json
artifacture info iso-glow
artifacture info hairline
artifacture info frankenmanim
artifacture skills install .agents/skills/visual-explainer
```

The entry skill installation copies only the entry and CLI launcher. A selected template installs its declared native skills using the native skills CLI. Optional references are discovered on demand; they are not all installed. `--no-skills` skips skill installation; `--no-install` skips packages and skills. Existing destinations are refused to preserve edits.

Native package manifests, lockfiles and caches own versions. Commit your project lockfiles and use native update commands. ISO Glow, Hairline, iso-figure, Diagram Design, Anatomy, Manim, ManimGL and FrankenManim are discoverable references. FrankenManim is experimental, with current output and license qualifications in its catalog entry.

## Breaking migration

| Previous route | New workspace route |
| --- | --- |
| `artifacture list` component API dump | Compact template list; `info` loads one workflow and native references |
| `artifacture init` copies core components | Explicit `--template`; dependencies come from that project |
| `artifacture add <block>` | Native package installation and direct imports; editable local composition |
| `artifacture export <source>` | Workspace `npm run export`; MDX and arbitrary TSX enter through the ordinary React entry |
| `artifacture fframes <sequence>` | Native FFrames project; no mandatory SVG frame bank |
| Universal `verify` routing | Build checks, native renderer inspection and template-specific visual review |
| Skill runtime snapshot | Small entry skill plus selected native tools |

Existing external `ve:export` callers remain available through source scripts in a contributor checkout while they migrate. Keep their existing presenter, CSS and assets in a native workspace. Do not assume this initial slice proves parity with every downstream Function deck or every old component. The old implementation is excluded from the new npm package but retained in source until its callers are assessed.

## Developing the prerelease

Use a clean checkout, `npm ci`, then `npm pack`. Scaffold with the checkout CLI and `--no-install`, install the resulting tarball in the generated project as a dev dependency, then install that project's dependencies. This avoids relying on an unpublished npm version. Set `ARTIFACTURE_REPO` to this checkout when running the skill launcher in development.

No new tests are required to adopt a template. Verify actual browser behavior, relevant presentation states, startup errors, missing assets and rendered output. Contributor work should use existing tests and direct probes unless new test files have been authorized.

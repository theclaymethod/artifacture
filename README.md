# Artifacture

Opinionated templates and workflows for diagrams, custom slides and native explainer videos. Author compact MDX, customize ordinary source, and use existing libraries for visual primitives.

This branch begins the **1.0 breaking release**. It is an unpublished prerelease; see [local development](docs/workspaces.md#developing-the-prerelease).

```sh
artifacture list
artifacture info custom-slides
artifacture init ./my-talk --template custom-slides
cd my-talk
npm run dev
npm run export
```

Templates are editable native projects. React/Tailwind/Vite powers custom slides and diagrams, with one configuration for development, build and standalone export. Arbitrary TSX and consumer-owned presenters remain supported.

FFrames is preferred for native video composition. The `fframes-explainer` starter delegates to its upstream scaffolder; scenes, audio, media and rendering remain native. HyperFrames is available for browser-dependent compositions. PR review and browser-video recipes guide the appropriate native project route.

The ISO visual language combines Hairline's fine outlines, ISO Glow's causal lighting and one contrasting accent. The catalog also references Diagram Design, Anatomy, iso-figure, Manim/ManimGL and experimental FrankenManim. Native dependencies and skills are fetched only when selected.

```sh
artifacture list --kind reference --json
artifacture info iso-glow
artifacture skills install .agents/skills/visual-explainer
```

The small entry skill guides template selection, storytelling, composition and delivery review. Provider instructions stay upstream. Native manifests and lockfiles own dependencies; ordinary media files support reuse between formats.

- [Workspace commands and migration](docs/workspaces.md)
- [Accepted architecture and evidence](docs/plans/pipeline-first-architecture.md)
- [Contributing](CONTRIBUTING.md)

Legacy exporters, primitives and evaluation assets remain in the contributor checkout while callers migrate. They are excluded from the new npm package. The first slice does not yet replace every existing template or establish full Function Intelligence parity.

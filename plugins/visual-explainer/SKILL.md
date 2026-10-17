---
name: visual-explainer
description: Create diagrams, custom React slides and native explainer videos from compact MDX, editable templates and selected upstream libraries.
license: MIT
metadata:
  author: nicobailon (original visual-explainer)
  maintainer: Clayton Kim
  version: "1.0.0-next.0"
---

# Artifacture

Use a finished composition as the starting point, then edit ordinary source. Compact MDX holds the argument; React/TSX and native renderer source provide unrestricted customization. Share content, theme and assets across outputs.

Run `node <this-skill-directory>/scripts/artifacture.mjs list --json`, then `info <selected-id> --json`. Read only the selected workflow and native references. `list --kind reference` discovers upstream tools. A recipe is guidance, not a ready project; follow its recommended starter.

Scaffold with `init <new-directory> --template <id>`. This fetches only the template's dependencies and declared skills. Native package manifests and lockfiles own versions. `--no-install` copies source for manual setup; `--no-skills` skips native skill installation. Require Node 22.12+. Use `ARTIFACTURE_REPO` for an unpublished development checkout.

For diagrams and slides use the project's React/Tailwind/Vite pipeline. Development, production and standalone export use its one configuration. Arbitrary TSX, custom presenters and direct vendor imports remain first-class. Keep source editable; do not add an override schema to avoid editing it.

Prefer native **FFrames** projects for video. Templates own scene choreography and renderer selection. Use **HyperFrames** when required visuals rely on DOM/CSS or browser APIs. Read the selected renderer's current native skill and use its commands for rendering and inspection. Do not translate all projects into a shared scene language.

For GPU scenes, prefer **WebGPU** and the upstream renderer’s native materials. In Three.js use `WebGPURenderer` with TSL so compatible scenes share one material path with the WebGL2 fallback. Check the actual selected backend at runtime. Compute or ray-marching scenes that require WebGPU must expose their unsupported state; do not claim a full fallback if only some acts can render. Reuse existing shader scenes with provenance before writing equivalents.

The ISO theme combines **Hairline** fine neutral geometry with **ISO Glow** causal lighting and one contrasting accent. Use **Diagram Design** for diagram layout and **Anatomy** for mechanisms. Use **Manim** or **ManimGL** with their distinct native APIs for mathematics. **FrankenManim** is an experimental reference: verify current capabilities before depending on it. Fetch native instructions on demand; keep primitive implementations upstream.

Treat the scene as the unit of composition. A slide is a presentation surface for a scene, not a single finished frame. Develop a scene through authored beats: establish the subject, reveal a mechanism, transform or compare it, and resolve the question. Preserve object identity and spatial continuity across beats; use reframing, annotation, code, diagrams, evidence and optional exploration as the argument needs. Add depth through causal progression rather than filling the frame. Interactive scenes need deliberate stepping and replay; timed scenes need enough time to follow the mechanism. Share the argument, theme and assets across outputs while leaving timing and implementation native.

Shape the story around a question, a visible mechanism and a consequence. PR reviews require inspected diffs and observed behavior. A sizzle reel and an explanation need different structures. Motion should preserve the subject and show what changed; align visual events to narration. Templates supply taste and choreography while remaining fully editable.

For animation work, consult [animation skill routing](references/animation-skills.md): installed motion-doctrine and cut-the-curve for continuity, Emil skills for interactive motion, and the selected renderer's native animation skill for implementation. Load only the relevant skill; preserve FFrames as the preferred video route. Discover upstream collections with `list --kind reference --query animation`.

Use white space, readable typography and purposeful interactions. Omit decorative labels, badges, numbering and metadata that add no meaning. Preserve reduced motion and keyboard access. Write headings and narration about the actual subject and its behavior. Remove motivational slogans and metaphors that substitute for explanation. For mechanical scenes, follow the continuity demonstrated on [Anime.js](https://animejs.com/): establish the assembled object, separate or cut away the relevant parts, preserve their identity during reframing, then show the operation. Reuse the vendor geometry; drive motion, highlights and charts from the same state. A cutaway must expose a mechanism, not merely decorate a transition.

For video capture and showcase edits, read [capture and edit guidance](references/video-capture-and-edit.md). Budget unique demonstrations before composing, prove each native capture path visually, and publish only verified media.

Deliver editable source and the built artifact. Check startup errors, missing assets, relevant slide states and actual output; use native renderer inspection. Review representative visuals. Ordinary image/video files are valid reusable assets; rich receipts are optional. State verification limits plainly. Do not claim arbitrary interactive figures can be rendered deterministically without a demonstrated native timing contract.

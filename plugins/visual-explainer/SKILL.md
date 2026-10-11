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

The ISO theme combines **Hairline** fine neutral geometry with **ISO Glow** causal lighting and one contrasting accent. Use **Diagram Design** for diagram layout and **Anatomy** for mechanisms. Use **Manim** or **ManimGL** with their distinct native APIs for mathematics. **FrankenManim** is an experimental reference: verify current capabilities before depending on it. Fetch native instructions on demand; keep primitive implementations upstream.

Shape the story around a question, a visible mechanism and a consequence. PR reviews require inspected diffs and observed behavior. A sizzle reel and an explanation need different structures. Motion should preserve the subject and show what changed; align visual events to narration. Templates supply taste and choreography while remaining fully editable.

Use white space, readable typography and purposeful interactions. Omit decorative labels, badges, numbering and metadata that add no meaning. Preserve reduced motion and keyboard access.

Deliver editable source and the built artifact. Check startup errors, missing assets, relevant slide states and actual output; use native renderer inspection. Review representative visuals. Ordinary image/video files are valid reusable assets; rich receipts are optional. State verification limits plainly. Do not claim arbitrary interactive figures can be rendered deterministically without a demonstrated native timing contract.

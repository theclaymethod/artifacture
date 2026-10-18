# Animation skill routing

Use the host's installed-skill catalog to resolve these names, including plugin-prefixed equivalents. Read only the skill needed for the current decision. Availability is host-specific: these are references, not bundled dependencies. When a skill is absent, use its official upstream installation instructions or continue with the selected renderer's native guidance; do not claim it was loaded.

## Story and continuity

These house skills are available in the development environment. Resolve them from the host catalog; no public installer is assumed.

| Skill | Use when |
| --- | --- |
| `motion-doctrine` | Planning causal motion, carrier elements, direction and continuity across video scenes. |
| `cut-the-curve` | Choosing velocity-matched transitions, waterfall entrances, kinetic text and group repositioning. |
| `seam-craft` | Assembling HyperFrames scene overlaps or diagnosing flashes and gaps at cuts. Its DOM/compositing rules are specific to that renderer. |
| `oversized-cursor` | A browser/UI demonstration needs a pointer action to cause the next visual event. |

Use continuity principles in a FFrames film through native scenes, timelines, springs and media. Keep HyperFrames-specific DOM, GSAP, seam-injector and command contracts within HyperFrames projects. A reference skill does not change the selected renderer or theme.

## Interactive slides and components

The [Emil animation skills](https://github.com/emilkowalski/skills) are the source for these installed skills. Discover their installation route with `artifacture info emil-animation`. Select the relevant skill rather than loading the whole collection.

| Skill | Use when |
| --- | --- |
| `animate` | Implementing a new interaction or transition: purpose, properties, curve, timing, interruption and exit. |
| `find-animation-opportunities` | Finding worthwhile places to add motion; produces proposals rather than edits. |
| `improve-animations` | Auditing an existing project's motion and planning improvements; read-only on source. |
| `review-animations` | Reviewing a concrete motion change, including performance and accessibility. Respect the host's explicit-invocation setting. |
| `animation-vocabulary` | Naming an effect described in ordinary language; not an implementation workflow. |
| `emil-design-eng` | Broader interaction polish and design decisions around the animated component. |

For a React slide interaction, use `animate` with the project's native components. For an existing deck, select the audit or review skill matching the request. UI timing recommendations are not blanket film pacing rules: viewers still need time to read, follow the mechanism and hear the narration.

## Renderer-specific authoring

- **FFrames:** use the installed `fframes-video` skill for native animation, scene timing, audio and inspection. Discover its installer with `artifacture info fframes`.
- **HyperFrames:** enter through `hyperframes`, then load `hyperframes-animation` for choreography and runtime adapters, `hyperframes-keyframes` for camera/reframing/seek-safe poses, or `hyperframes-audio` for mixing existing tracks. Audio generation remains a separate dependency. Discover the source with `artifacture info hyperframes-animation`.
- **Motionmaxxing:** an optional upstream motion-design reference for stronger composition, pacing and typography. Discover with `artifacture info motionmaxxing`; it is not assumed installed. Adapt relevant design decisions to the selected native renderer instead of importing another runtime.

Keep the established ISO, mono-color or Algebrica visual language. Use motion to expose a relationship or change, preserve reduced motion in interactive outputs, and review actual frames and transition boundaries. Do not load every skill or audit every project by default.

### Applying Motionmaxxing to an existing film

Resolve and read the upstream skill when named; a catalog entry is not an installed skill. Use its direction, emphasis budget and measured curves within the current renderer. Reuse a curve module with provenance rather than copying a second runtime over a working native project. Spend the strongest motion on the requested hero and shorten supporting entrances; scaling every transform up does not improve pacing.

Run render-based audits on the delivered MP4. Before trusting a DOM lint result, establish that it expands mounted scenes and seeks each nested timeline using its local offset. Motionmaxxing's generic `__timelines` fallback seeks every timeline to the same time; that is not the timing contract of nested HyperFrames scenes. A reported PASS without demonstrated scene coverage is inconclusive. Distinguish source text from words baked into media and keep meaningful diagram labels separate from ornamental film chrome.

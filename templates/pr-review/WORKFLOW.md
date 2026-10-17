# PR review film

Inspect the exact diff and relevant callers. Record the revision, trigger, previous behavior, new behavior and evidence. Open with the consequence for the developer or user. Show the code only when it establishes why the behavior changes. Use diagram-to-diff-to-observed-result choreography, not a component tour.

Start from `fframes-explainer` for a native video project or `custom-slides` for an interactive review. Reuse source evidence, theme and assets; timing and layout are authored for each surface. Keep narration aligned to visible changes, and distinguish verified results from open risks. Use native FFrames inspection and inspect a real draft.

## Scenes are the authoring unit

A slide hosts a scene with an internal progression; it is not the smallest unit of content. Author meaningful beats within a persistent visual space. Establish the subject, expose its relationships, show an intervention, and resolve the question with evidence. Keep objects recognizable as they move, reorganize, gain annotations or receive focus. A new heading or entrance animation alone is not a new beat. Add comparisons, failure cases and exploration when they improve understanding.

For interactive presentations, let viewers step forward/back through beats, pause and replay timed choreography, and explore without losing their place. Keep explicit scene navigation separate from beat navigation. Respect focused controls and reduced motion. For video, choreograph those beats with the renderer's native clock; do not merely hold a screenshot for several seconds. Scene duration follows the argument rather than a fixed slide timer. These are authoring conventions, not a new universal scene schema.

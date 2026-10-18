# Capture and edit a showcase

Inventory the native sources before authoring. For a showcase, list the capabilities actually demonstrated and the unique shot that proves each one. A popular source should not dominate by accident. Repeated footage needs an explicit narrative purpose; do not repeat a logo or hero as filler. Keep a multi-act source in one continuous passage when its own transformations provide the strongest continuity. An explainer instead needs a question, mechanism and consequence.

Choose durations from the action and reading load. Record a boundary's motion direction and carry velocity into the next shot; use a small transition vocabulary. Reframing must reveal a relationship or mechanism. Preserve native object identity and share one phase/state between related motion, highlights, charts and equations. Apply renderer-specific motion checks only to their supported renderer.

Before composing a whole film, prove one representative clip from every source technology. Inspect the decoded beginning, middle and end, then scan consecutive frames through motion and handoffs—not only a sparse contact sheet or the renderer's structural report. Look for an object disappearing and returning, alternating exposure, and repeated frames. Confirm motion, expected layers, readable contrast, actual dimensions and duration. A valid MP4 or zero-findings inspect report can still contain a blank scene.

- For SVG/DOM sources, preserve inherited tokens, adopted shadow-root stylesheets, SVG definitions and layer order. Composite asynchronous layers into a staging canvas, then present the completed frame atomically; recording the canvas while it is cleared and redrawn can encode blank intermediate frames. Avoid rebuilding geometry to work around a capture defect.
- For GPU sources, establish whether the presented canvas or a native render target can be captured. A successful path for one renderer does not prove another path. Copy presented GPU canvases synchronously at each renderer’s presentation boundary and retain that completed frame for composition; a later animation callback may see a discarded texture. Do not mix native-canvas fallback with asynchronous offscreen readback. Detect adaptive resolution and report the encoded dimensions. Do not silently replace a missing effect with a lookalike.
- Use the project's functioning math toolchain. Check whether it uses MathTypst, MathTex, or another native route before assuming a TeX installation.
- Separate capture time, source time and edit time. State whether footage is real-time capture or deterministic frame stepping. Retiming and interpolation do not turn a live capture into a deterministic source.
- Validate new assets before producing the full film. Keep source attribution and native editability. A source receipt must distinguish requested settings from measurements of the output.

Publish the completed media first under a new filename. Decode it, review representative frames and transitions, inspect audio, and only then update the player. Check playback and chapter seeking at the delivered URL. Preserve the preceding working version until the new artifact is verified.

## HyperFrames edits

Use the installed HyperFrames workflow and registry rather than adding another animation engine to Artifacture. Keep six or fewer short scenes inline; mount independently seekable sub-compositions for the edit. Local media time starts at zero within its composition. Animate an untimed wrapper around the video; let HyperFrames own the video’s timing and visibility.

Preserve corrected source captures when changing renderers. Use one-second video keyframe intervals for reliable Studio scrubbing. Sparse source keyframes can make an otherwise valid edit freeze during seeks. Keep GPU/Manim source production distinct from HyperFrames choreography in the provenance receipt.

Run `hyperframes check`, inspect actual midpoint and overlap frames, and check the exported movie across consecutive frames. A clean layout report does not catch a wrong light/dark asset variant or inherited source captions. Use the persistent background preview for the editable handoff.

When the user names a visual, record its exact upstream component, source capture and visible interval in the edit before rendering. A related effect is not evidence that the named visual appears. For a capture-resolution override, keep adaptive preview behavior as the default, scope the override to recording, restore it on success/cancel/failure, and record measured encoded dimensions. A completed-frame event count is not the encoded frame count; probe the resulting file separately.

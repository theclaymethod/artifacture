# Research: preview annotation and direct text editing

Date: 2026-08-14
Scope: developer-only interaction patterns for `visual-explainer-custom`; no implementation changes.

## Executive recommendation

Add a separate developer preview shell with three explicit modes:

1. **Browse** — the artifact behaves normally.
2. **Comment** — hover outlines the deepest sensible element; click pins it; type a comment; submit; immediately return to Comment mode so the next note can be added serially.
3. **Edit text** — click an eligible source-backed text leaf, edit it in place as plain text, then commit or cancel one atomic change.

Keep the generated artifact itself clean. `visual-explainer-custom` produces single, self-contained HTML files, sometimes with inline scripts and SVG, so the editing surface should be dev-only infrastructure around a preview rather than a framework embedded in every deliverable. The repository's own contract is a single self-contained `.html` file with semantic HTML and optional inline scripts; its slide template already avoids intercepting keyboard events from inputs, textareas, and `contenteditable` regions. ([repository README](https://github.com/theclaymethod/visual-explainer-custom/blob/bc39799e9613f74a99265d8691e80c9f4a8ed3f3/README.md#L5-L12), [artifact contract](https://github.com/theclaymethod/visual-explainer-custom/blob/bc39799e9613f74a99265d8691e80c9f4a8ed3f3/plugins/visual-explainer/SKILL.md#L580-L602), [slide keyboard guard](https://github.com/theclaymethod/visual-explainer-custom/blob/bc39799e9613f74a99265d8691e80c9f4a8ed3f3/plugins/visual-explainer/templates/mono-industrial-slides.html#L1254-L1263))

The best first version is not a general WYSIWYG editor. It is a constrained **click → type → preview → commit** path for headings, labels, paragraphs, and other simple text leaves. Complex markup should fall back to either an anchored comment or a source editor opened at the mapped range.

## What the researched tools actually do

| Tool/pattern | Selection and context | Handoff/lifecycle | Most useful lesson here |
|---|---|---|---|
| **Plannotator raw HTML viewer** | Renders arbitrary HTML in a script-enabled sandboxed iframe; supports drag text selection and pinpoint element clicks. Hover uses deep hit-testing, promotes very small targets, and draws a separate overlay rather than writing classes onto page elements. ([viewer contract](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/ui/components/html-viewer/HtmlViewer.tsx#L138-L147), [sandboxed iframe](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/ui/components/html-viewer/HtmlViewer.tsx#L643-L655), [hit-testing behavior](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/ui/components/html-viewer/bridge-script.ts#L625-L652)) | Clicks suppress the page's normal link/button action in pinpoint mode. Shift-click can add several targets to one open draft. Stored pins use selectors, fingerprints, and normalized points. ([click handling](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/ui/components/html-viewer/bridge-script.ts#L2836-L2866), [multi-target model](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/ui/types.ts#L111-L125)) | Copy its target-selection and overlay discipline, not its entire product surface.
| **pls-fix builder** | A separate dev-only Vite SPA dynamically initializes `react-grab`, then parses copied context into component name, file/line/column, and an HTML frame. ([dev-only builder architecture](https://github.com/theclaymethod/pls-fix/blob/a99233a8db63b1f79bc4634ec0f2fb6bc00571d8/README.md#L15-L46), [`useGrab`](https://github.com/theclaymethod/pls-fix/blob/a99233a8db63b1f79bc4634ec0f2fb6bc00571d8/src/builder/hooks/use-grab.ts#L9-L40), [dynamic initialization](https://github.com/theclaymethod/pls-fix/blob/a99233a8db63b1f79bc4634ec0f2fb6bc00571d8/src/builder/hooks/use-grab.ts#L52-L89)) | The selected context appears as a dismissible chip above chat, is prepended to the next prompt, and is then cleared. Claude edits the slide source and Vite HMR refreshes the preview. ([context chip](https://github.com/theclaymethod/pls-fix/blob/a99233a8db63b1f79bc4634ec0f2fb6bc00571d8/src/builder/components/chat-thread.tsx#L21-L64), [single-shot prompt context](https://github.com/theclaymethod/pls-fix/blob/a99233a8db63b1f79bc4634ec0f2fb6bc00571d8/src/builder/components/builder-layout.tsx#L275-L301), [server/agent loop](https://github.com/theclaymethod/pls-fix/blob/a99233a8db63b1f79bc4634ec0f2fb6bc00571d8/scripts/builder-server.ts#L242-L286)) | Reuse the separate builder shell and visible selected-context chip. Its React component/source mapping does not transfer directly to standalone raw HTML.
| **Agentation** | Supports element click, text selection, drag multi-select, empty-space area selection, and animation pause. It emits selectors, positions, context, and callbacks; React source files are optional development metadata. ([features](https://github.com/benjitaylor/agentation/blob/8158a97c10c37e577b0a6e2d3175d143918216cd/package/README.md#L34-L46), [structured callbacks](https://github.com/benjitaylor/agentation/blob/8158a97c10c37e577b0a6e2d3175d143918216cd/package/README.md#L48-L93), [annotation fields](https://github.com/benjitaylor/agentation/blob/8158a97c10c37e577b0a6e2d3175d143918216cd/package/src/types.ts#L5-L31)) | Its model includes intent, severity, status, and threads. ([protocol fields](https://github.com/benjitaylor/agentation/blob/8158a97c10c37e577b0a6e2d3175d143918216cd/package/src/types.ts#L54-L77)) | Add an area-selection fallback and a “freeze motion” toggle later; avoid dumping all computed styles into every agent prompt.
| **Domscribe** | Injects deterministic `data-ds` IDs into framework source at build time and stores source positions in a manifest. Runtime annotations include element-click and text-selection modes. ([overview](https://github.com/patchorbit/domscribe/blob/accfd5c8abe4daf4f0eeaeb547ea1ee0f586dce3/README.md#L42-L45), [stable IDs and storage](https://github.com/patchorbit/domscribe/blob/accfd5c8abe4daf4f0eeaeb547ea1ee0f586dce3/README.md#L80-L97), [injector](https://github.com/patchorbit/domscribe/blob/accfd5c8abe4daf4f0eeaeb547ea1ee0f586dce3/packages/domscribe-transform/src/core/injector.ts#L149-L228), [interaction modes](https://github.com/patchorbit/domscribe/blob/accfd5c8abe4daf4f0eeaeb547ea1ee0f586dce3/packages/domscribe-core/src/lib/types/annotation.ts#L10-L44)) | Notes move through queued, processing, processed, failed, and archived states. Its agent tool atomically claims the oldest queued item. ([lifecycle](https://github.com/patchorbit/domscribe/blob/accfd5c8abe4daf4f0eeaeb547ea1ee0f586dce3/packages/domscribe-relay/README.md#L29-L40), [atomic FIFO claim](https://github.com/patchorbit/domscribe/blob/accfd5c8abe4daf4f0eeaeb547ea1ee0f586dce3/packages/domscribe-relay/src/server/services/annotation-service.ts#L322-L357), [agent contract](https://github.com/patchorbit/domscribe/blob/accfd5c8abe4daf4f0eeaeb547ea1ee0f586dce3/packages/domscribe-relay/src/mcp/tools/annotation-process.tool.ts#L76-L109)) | Separate fast human capture from serial agent processing. Use lightweight IDs/source offsets for static HTML rather than framework fiber/VNode instrumentation.

### The important `pls-fix` distinction

`pls-fix` solves “which React component/file do I mean?” because its preview and source share a React/TypeScript build graph. Its selected record explicitly contains a component name, file, line, column, and captured HTML. ([context type](https://github.com/theclaymethod/pls-fix/blob/a99233a8db63b1f79bc4634ec0f2fb6bc00571d8/src/builder/types.ts#L62-L69))

`visual-explainer-custom` instead emits arbitrary standalone HTML containing ordinary text nodes, nested inline markup, SVG, CSS-generated content, and optional runtime script output. A React-specific grabber cannot reliably map those rendered nodes back to source. The transferable pattern is the **dev-only separate shell + visible selected-context chip + live preview refresh**, while the source mapping should be HTML-parser based.

## Recommended annotation interaction

### 1. Explicit mode switch

Use a compact toolbar with `Browse`, `Comment`, and `Edit text`. In Comment mode, intercept the click at capture time so a link or button does not navigate or fire while it is being annotated; Plannotator follows that exact rule. ([Plannotator click interception](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/ui/components/html-viewer/bridge-script.ts#L2836-L2866))

After comment submission, keep Comment mode active and clear only the draft target. This is the serial loop the preview needs:

`hover → click → comment → submit → numbered pin appears → immediately hover the next target`

Add `Esc` to cancel the current draft or selection. `pls-fix` makes its selected-context chip dismissible and also clears it with Escape. ([chip dismissal](https://github.com/theclaymethod/pls-fix/blob/a99233a8db63b1f79bc4634ec0f2fb6bc00571d8/src/builder/components/chat-thread.tsx#L21-L64), [Escape behavior](https://github.com/theclaymethod/pls-fix/blob/a99233a8db63b1f79bc4634ec0f2fb6bc00571d8/src/builder/components/chat-thread.tsx#L93-L104))

### 2. Hit-test what the user sees

Choose the deepest element under the pointer, including elements inside open shadow roots. If both dimensions are below a small target floor, promote to the nearest usable ancestor; if the pointer is in container padding, allow the container itself. Plannotator uses `elementFromPoint`, recursively enters open shadow roots, and promotes elements smaller than 16px in both dimensions. ([deep hit-test](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/ui/components/html-viewer/bridge-script.ts#L625-L675), [tiny-target promotion](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/ui/components/html-viewer/bridge-script.ts#L690-L700))

Show an outline plus a short semantic label. A useful naming cascade is semantic tag name → `aria-label` → `role` → meaningful class token → short own text → `container`, matching Plannotator's implementation. ([label cascade](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/ui/components/html-viewer/bridge-script.ts#L948-L993))

Render hover rectangles, selected outlines, and numbered pins in an overlay layer that does not participate in the artifact's layout. Plannotator uses a fixed, pointer-transparent shadow-root overlay and enables pointer input only on marker buttons; the hover box also remains separate from page elements. ([overlay design](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/ui/components/html-viewer/bridge-script.ts#L1160-L1191), [hover box](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/ui/components/html-viewer/bridge-script.ts#L1015-L1036))

### 3. Store redundant anchors, not screen coordinates

The W3C Web Annotation selector model permits multiple selectors for the same content and defines CSS, text-quote, text-position, range, and area selectors. A `TextQuoteSelector` contains exact text with optional prefix/suffix context; a `TextPositionSelector` uses character offsets. ([multiple selector rule](https://www.w3.org/TR/selectors-states/#model-1), [CSS selector](https://www.w3.org/TR/selectors-states/#CssSelector_def), [text quote](https://www.w3.org/TR/selectors-states/#TextQuoteSelector_def), [text position](https://www.w3.org/TR/selectors-states/#TextPositionSelector_def))

Recommended element anchor:

```text
artifactId / slideId
sourceVersion or fileHash
stableDevId (when available)
verifiedUniqueCssSelector
tagName
normalizedTextFingerprint
normalizedPointWithinElement {x, y}
sourceLocation {file, startOffset, endOffset} (when mapped)
```

Plannotator's selector ladder is a sound fallback: unique ID → author-controlled identity attribute → meaningful classes → positional `nth-of-type` path, with every candidate tested for uniqueness. Weak selectors are accepted only when the captured text still matches; textless elements require a strong stable identity; failure is explicit rather than guessing. ([selector ladder](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/ui/components/html-viewer/bridge-script.ts#L2331-L2434), [fail-closed verification](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/ui/components/html-viewer/bridge-script.ts#L2436-L2498))

Store the click point normalized inside the element's current box instead of storing absolute viewport pixels. Plannotator reprojects normalized points after responsive movement. ([anchor point model](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/ui/types.ts#L96-L109), [normalization](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/ui/components/html-viewer/bridge-script.ts#L2511-L2523))

### 4. Persistent rail plus optional immediate-chat context

Use two deliberately different objects:

- **Annotation:** persistent, numbered, shown in a right rail, editable/resolvable, and included in a review batch.
- **Selected context:** ephemeral, shown as a chip above a chat box, attached to exactly one agent request, then cleared. This is the useful `pls-fix` behavior. ([selected chip](https://github.com/theclaymethod/pls-fix/blob/a99233a8db63b1f79bc4634ec0f2fb6bc00571d8/src/builder/components/chat-thread.tsx#L21-L64), [one-send consumption](https://github.com/theclaymethod/pls-fix/blob/a99233a8db63b1f79bc4634ec0f2fb6bc00571d8/src/builder/components/builder-layout.tsx#L275-L301))

For multiple related elements, allow Shift-click to add targets to the current draft rather than forcing several comments. Plannotator models one primary anchor plus additional targets and caps the number of extra targets at its trust boundary. ([multi-target click](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/ui/components/html-viewer/bridge-script.ts#L2836-L2853), [bounded bridge data](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/ui/components/html-viewer/useHtmlAnnotation.ts#L122-L139))

For serial agent work, use a FIFO lifecycle such as `draft → queued → processing → resolved | failed`, with one atomic “claim next” operation. Domscribe's queue claims the oldest queued annotation and retries if another worker wins the race. ([status model](https://github.com/patchorbit/domscribe/blob/accfd5c8abe4daf4f0eeaeb547ea1ee0f586dce3/packages/domscribe-core/src/lib/types/annotation.ts#L10-L24), [claim implementation](https://github.com/patchorbit/domscribe/blob/accfd5c8abe4daf4f0eeaeb547ea1ee0f586dce3/packages/domscribe-relay/src/server/services/annotation-service.ts#L322-L357))

### 5. Empty space and motion

Element selection cannot express “put something here” or reliably target decorative gaps. Add an area-selection mode after the element-comment MVP. Agentation explicitly supports area annotations over empty space and can pause CSS animations, JavaScript animations, and videos to capture a transient state. ([Agentation selection features](https://github.com/benjitaylor/agentation/blob/8158a97c10c37e577b0a6e2d3175d143918216cd/package/README.md#L36-L45))

## Recommended direct-text manipulation

### What to build first

In `Edit text` mode, only make a target editable when all of these are true:

- It maps to one contiguous source-backed text node.
- It is not inside `script`, `style`, form controls, or an already editable region.
- Its visible value is not generated by JavaScript, CSS `content`, a canvas, or a chart library.
- It does not require preserving nested inline markup.
- The current file hash and captured old text still match at commit time.

When eligible:

1. Outline the text leaf and show its source location.
2. Set only that leaf to `contenteditable="plaintext-only"`, or place a visually matched plain-text editor over it.
3. Update the preview as the user types.
4. `Enter`/`Cmd+Enter` commits; `Escape` restores; multiline paragraph behavior is explicit.
5. Commit one source-range replacement and record `{anchor, oldText, newText, sourceHash}` for undo/diff.
6. Reload or refresh the preview, then re-resolve the anchor.

The HTML standard defines `contenteditable` as an enumerated attribute and defines a `plaintext-only` state; it also defines `designMode` separately for making an entire document editable. ([WHATWG `contenteditable`](https://html.spec.whatwg.org/multipage/interaction.html#contenteditable), [WHATWG `designMode`](https://html.spec.whatwg.org/multipage/interaction.html#making-entire-documents-editable:-the-designmode-idl-attribute)) Input Events exposes `beforeinput`/`input`, `inputType`, `dataTransfer`, and target ranges needed to observe and constrain edit operations; IME-originated edits have different cancelability rules. ([W3C Input Events overview](https://w3c.github.io/input-events/#interface-InputEvent-Attributes), [`beforeinput` behavior](https://w3c.github.io/input-events/#events-inputevents))

Recommendation: prefer the in-place `plaintext-only` experience for a genuine WYSIWYG feel, but use a controlled popover/overlay input when browser editing behavior or nested layout makes the in-place version ambiguous. Never enable document-wide `designMode` for this feature.

### Source mapping and safe writeback

Parse the original HTML on the local preview server with source-location tracking enabled. parse5 can attach source-code locations to parsed nodes, including start/end tag locations; parser-created implied nodes do not have original source locations. ([parse5 parser option](https://parse5.js.org/interfaces/parse5.ParserOptions.html#sourcecodelocationinfo), [element locations](https://parse5.js.org/interfaces/parse5.Token.ElementLocation.html))

Serve an instrumented preview copy with dev-only IDs that map to source offsets, but do not save those IDs into the deliverable. parse5's rewriting stream uses raw source for tokens the caller does not modify, which is useful for injecting preview-only attributes without normalizing the rest of the file. ([parse5 rewriting stream](https://parse5.js.org/classes/parse5-html-rewriting-stream.RewritingStream.html)) This is the static-HTML analogue of Domscribe's build-time ID plus manifest, whose injector associates an ID with file, start, end, tag name, and file hash. ([Domscribe manifest injection](https://github.com/patchorbit/domscribe/blob/accfd5c8abe4daf4f0eeaeb547ea1ee0f586dce3/packages/domscribe-transform/src/core/injector.ts#L167-L228))

At commit time, patch only the mapped source slice after checking both the file hash and expected old text. Do not serialize the live DOM back to HTML: the preview DOM may include runtime mutations and parser-created nodes, while the goal is a minimal, reviewable source change. Plannotator's editable-document state is a useful safeguard model: it tracks session-open text, disk baseline, current text, hashes, and explicit dirty/saving/saved/conflict/error/missing states. ([Plannotator editable-document record](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/editor/editableDocuments.ts#L6-L38), [hash-gated reconciliation](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/editor/editableDocuments.ts#L119-L151))

### Option comparison

| Approach | Strength | Main cost/risk | Recommendation |
|---|---|---|---|
| Leaf `contenteditable="plaintext-only"` | Feels genuinely direct; typography/layout remain visible. | Browser edit, paste, selection, composition, and line-break behavior must be constrained; source mapping remains a separate problem. | **MVP for eligible leaves**, with atomic commit/cancel and Input Events handling. |
| Positioned input/textarea or small popover | Predictable value model, easy cancel/validation, no arbitrary DOM edits. | Less literally WYSIWYG; matching wrapped typography and dimensions takes work. | **Fallback** when in-place editing is risky. |
| Click-to-source editor | Exact control over HTML/CSS/JS and useful for nested markup. | It is still source editing, not basic WYSIWYG. | **Escape hatch**: open the mapped range in CodeMirror or the user's editor. |
| Full ProseMirror/Tiptap document editor | Mature structured rich-text transactions and schema-driven editing. ProseMirror's state changes use transactions and require a schema. ([ProseMirror guide](https://prosemirror.net/docs/guide/#state), [schema requirement](https://prosemirror.net/docs/guide/#schema)) | Tiptap states that it is not an arbitrary HTML editor: content is parsed into a schema and nonconforming content can be lost. ([Tiptap FAQ](https://tiptap.dev/docs/guides/faq#i-want-to-edit-html-content-with-tiptap)) | **Do not use for whole visual-explainer artifacts.** Consider only if a future feature introduces a constrained, canonical rich-text block model. |

Plannotator's own direct editing is also instructive: its UI wraps a packaged Markdown editor and exposes CodeMirror 6 extensions rather than making arbitrary rendered HTML editable. ([Markdown editor wrapper](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/ui/components/MarkdownEditor.tsx#L1-L7), [extension contract](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/ui/components/MarkdownEditor.tsx#L41-L75)) It exports direct edits as a unified diff and distinguishes edits already saved to disk from edits that an agent must apply. ([direct-edit diff](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/editor/directEdits.ts#L52-L85), [saved-change context](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/editor/directEdits.ts#L88-L111))

## Preview isolation and trust boundary

Use a host-controlled shell with the artifact in an iframe and the comment/editor UI in the parent. Plannotator renders arbitrary HTML in an iframe with `sandbox="allow-scripts"`, injects a bridge, and validates/bounds bridge messages before they reach application state. ([viewer design](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/ui/components/html-viewer/HtmlViewer.tsx#L184-L188), [iframe sandbox](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/ui/components/html-viewer/HtmlViewer.tsx#L643-L655), [bridge validation caps](https://github.com/backnotprop/plannotator/blob/aa0bf860d8fae719fa0fd9056069000234077674/packages/ui/components/html-viewer/useHtmlAnnotation.ts#L122-L139))

For this repository, the bridge should accept a narrow, versioned message schema and cap selector, text, HTML-context, and target-array sizes. Keep overlay styling isolated from artifact CSS and verify `event.source`/session identity on every parent message. Treat style capture as opt-in and bounded; Domscribe limits its optional computed-style capture to an allowlist and a per-element serialization budget. ([Domscribe style capture model](https://github.com/patchorbit/domscribe/blob/accfd5c8abe4daf4f0eeaeb547ea1ee0f586dce3/packages/domscribe-core/src/lib/types/annotation.ts#L57-L99))

## Proposed developer-mode UX

### Comment path

1. Open a local builder/preview URL, separate from the shareable HTML.
2. Turn on Comment mode.
3. Hover shows a blue outline and semantic label.
4. Click freezes the outline and opens a nearby composer plus a context chip.
5. Submit creates numbered pin `1`, adds a rail item, and immediately re-arms selection.
6. Repeat for pins `2`, `3`, and so on without reopening the tool.
7. Clicking a pin or rail item scrolls/focuses the counterpart.
8. `Send review` emits a structured batch; optional `Process next` feeds FIFO notes to an agent.

### Small text-change path

1. Turn on Edit text.
2. Eligible leaves show an edit cursor; ineligible elements show `Comment` and `Open source` alternatives.
3. Click a title; its current text becomes plain-text editable while retaining the rendered typography.
4. Type, preview wrapping live, then commit or cancel.
5. Show a compact before/after diff and undo affordance.
6. If the file changed externally, stop and show a conflict instead of overwriting it.

### Suggested annotation record

```text
id, number, status, createdAt
artifactId, slideId, artifactVersion
comment, intent?, severity?
anchor { stableDevId?, cssSelector?, tagName, textFingerprint?, point?, sourceLocation? }
additionalTargets[]
viewport { width, height }
```

Keep captured context concise by default: tag/label, selected text, source location, short nearby text, and the relevant class/ID. Agentation can capture selectors, nearby text/elements, computed styles, accessibility information, React paths, and source files, but putting every available field into every prompt would be unnecessary for simple title edits. ([Agentation structured fields](https://github.com/benjitaylor/agentation/blob/8158a97c10c37e577b0a6e2d3175d143918216cd/package/README.md#L95-L125), [full type fields](https://github.com/benjitaylor/agentation/blob/8158a97c10c37e577b0a6e2d3175d143918216cd/package/src/types.ts#L5-L31))

## Phasing and tradeoffs

### Phase 1: annotation MVP

- Separate local preview shell.
- Browse/Comment modes.
- Deep hit-testing, semantic outline label, single-element comment, numbered markers, side rail.
- Redundant anchor model and structured export.
- Auto-rearm after submit for serial capture.

This phase delivers the user's hardest pain point without requiring safe disk writes.

### Phase 2: constrained direct text

- Preview-only source mapping and file hashes.
- Eligible single-text-node edits.
- In-place `plaintext-only` editor with commit/cancel/undo and conflict detection.
- Minimal source-range patch plus before/after diff.
- Open-source fallback for nested or generated content.

### Phase 3: robustness

- Shift-click multi-target comments.
- Text-range anchors using quote plus position/context.
- Area selection for empty space.
- Freeze animations/video.
- Queued agent lifecycle and post-edit visual verification.

### Principal tradeoffs

- **Stable preview IDs vs clean artifacts:** inject IDs only into the served dev copy; keep final self-contained HTML unchanged.
- **Durable anchors vs complexity:** start with source ID + verified CSS + fingerprint + normalized point; never silently attach a note to a merely plausible target.
- **WYSIWYG feel vs source safety:** leaf-only plain-text editing covers common copy tweaks; full arbitrary-HTML WYSIWYG would introduce schema/serialization risk.
- **Capture speed vs agent serialization:** let the human add notes rapidly; serialize the agent's consumption with explicit statuses if automated processing is added.
- **Rich context vs prompt noise:** capture minimal context eagerly and expose styles/DOM snapshots on demand.

## Bottom line

The strongest composite pattern is:

- **Plannotator** for iframe isolation, pinpoint hit-testing, overlays, normalized anchors, fail-closed restoration, and multi-target comments.
- **pls-fix** for a dev-only builder shell, a visible selected-element chip, and a one-request context handoff.
- **Domscribe** for stable dev IDs/source manifests and a FIFO annotation lifecycle.
- **Agentation** for empty-area selection and frozen-motion review.
- **Web standards + parse5** for constrained plain-text editing and minimal source-range writeback.

For `visual-explainer-custom`, build the annotation loop first, then add leaf-only text editing. That will make “this exact thing” and “change this title” fast without pretending an arbitrary self-contained HTML page is a safe rich-text document.

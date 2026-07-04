# Recorded UI Demos — Inline Feature Walkthroughs

When a visual explainer is describing a **running UI feature** (a form flow, an interaction pattern, a live dashboard), a short silent loop of the UI in action conveys more than a still screenshot or a hand-drawn diagram. This reference covers how to capture one and embed it self-contained in the HTML output.

**This is a supplementary modality**, like surf-cli (generative illustrations) and poster-ai (structured graphics). Use it when the feature is genuinely interactive or temporal. Skip it for static concepts — Mermaid or a still screenshot is better.

---

## When to use

**Good fit:**
- Explaining how a form flow behaves (focus states, validation, submission)
- Showing a hover/reveal/expand pattern that still frames can't convey
- Demonstrating an animation or transition the user is asking about
- Walking through a multi-step wizard or onboarding
- Showing before-and-after of a UI change (two clips side by side)

**Skip it for:**
- Architecture, data flow, schemas (use Mermaid)
- Code diffs (use HTML + syntax highlighting)
- Static screenshots (use `<img>` directly — no need to encode a video)
- Flows longer than ~20 seconds (base64 inflation makes the HTML sluggish; link externally or use Vercel share instead)

---

## Format choice: webm over gif

Always encode to `webm` (VP9). For equivalent visual quality, a 5-second webm is 5–10× smaller than the equivalent gif. Inline `<video autoplay loop muted playsinline>` plays identically to an animated gif in every modern browser and keeps the base64 payload tractable.

Use gif only when the target viewer (Obsidian, certain Markdown renderers, LinkedIn previews) refuses to inline `<video>`. For self-contained HTML pages — the primary visual-explainer output — webm is always the right answer.

---

## Capture paths

Pick whichever is available. Both end at the same place: a webm file on disk.

### Path A — Playwright MCP (preferred)

Playwright MCP ships with Claude Code's browser tools. It has no native video encoder, so the pattern is **screenshot-per-beat → ffmpeg stitch**. Cheap and deterministic.

```
1. mcp__...__browser_navigate         → the app URL (or file:// for a local page)
2. mcp__...__browser_resize           → 1200×800 (keeps encoded size predictable)
3. mcp__...__browser_take_screenshot  → frame-001.png
4. mcp__...__browser_click / type     → advance the UI one beat
5. mcp__...__browser_take_screenshot  → frame-002.png
... 6–12 beats total ...
N. scripts/frames-to-webm.sh <frame-dir> <out.webm>
```

Save every frame to the same directory with zero-padded sequential names:

```
~/.agent/diagrams/<slug>/frame-001.png
~/.agent/diagrams/<slug>/frame-002.png
...
```

Target 6–12 frames per demo. Between each screenshot, issue a `browser_wait_for` (or a 300–500ms delay via `browser_evaluate`) so any animation lands before the next shot. UI demos read well at 2 fps — each beat gets a half-second of screen time.

### Path B — agent-browser record (shortcut, if installed)

If `agent-browser` is on PATH, it records webm natively via Playwright's video channel. One command pair brackets the whole session:

```bash
agent-browser open "$URL"
agent-browser wait --load networkidle
agent-browser record start ~/.agent/diagrams/<slug>.webm
agent-browser click @e1
agent-browser wait 500
agent-browser fill @e2 "demo input"
# ... more interactions ...
agent-browser record stop
agent-browser close
```

The output is VP8 by default. Quality is lower than Path A (continuous video of a slow demo is wasteful), but setup is trivial. Prefer Path A for anything that ships as an explainer; use Path B for one-off exploratory captures.

### Path C — `/expect` skill

The expect skill is built for adversarial verification, not curated capture. It records internally but doesn't expose the artifact for embed. **Don't use it for this workflow** — mentioned only so the distinction is clear.

---

## Encode

Both paths produce a webm either directly (Path B) or after `frames-to-webm.sh` runs (Path A). The helper script wraps the correct ffmpeg invocation:

```bash
bash {{skill_dir}}/scripts/frames-to-webm.sh \
  ~/.agent/diagrams/<slug> \
  ~/.agent/diagrams/<slug>.webm \
  2    # fps — 2 for UI demos, 5–10 for animation-heavy content
```

The script uses VP9 with `-crf 32 -b:v 0`, caps width at 1200px, and keeps a 4:2:0 pixel format for universal browser compatibility. For a 6-frame UI demo at 1200×800, expect a file under 300KB.

---

## Embed

Inline the webm into the visual-explainer HTML with the `embed-media.sh` helper. It handles macOS vs Linux base64, emits a paste-ready `<video>` tag, and warns if the file is too large to inline comfortably.

```bash
bash {{skill_dir}}/scripts/embed-media.sh ~/.agent/diagrams/<slug>.webm > /tmp/demo-snippet.html
```

The snippet it prints:

```html
<video autoplay loop muted playsinline preload="auto"
       style="width:100%;max-width:1200px;display:block;margin:0 auto;border-radius:8px;">
  <source src="data:video/webm;base64,<...>" type="video/webm">
</video>
```

Drop that markup wherever the demo belongs in the explainer — typically inside a section card, directly under the heading that introduces the feature. The page stays a single self-contained `.html` file.

**Size budget.** Keep the webm under 2MB before base64 encoding. Above that, inline data URIs start to make the HTML itself feel sluggish in the browser. If you're over budget, the fix is always one of: fewer frames, lower fps, narrower scale, or a shorter demo.

---

## Aesthetic notes

Match the demo's visual presentation to the page's aesthetic direction.

- **Mono-Industrial (default):** 8px corners, no border, no shadow. Let the video sit flush like a diagram. Optionally caption with a Space Mono ALL CAPS label above (e.g., `DEMO · LOGIN FLOW`).
- **Editorial:** Slight rounded corners (12–16px), subtle border in the page's muted earth tone, generous whitespace above and below.
- **Blueprint:** Sharp corners, 1px border in slate/blue, inset slightly so the drawing-grid background reads around the edges.
- **Paper/ink:** Warm cream frame, no border, optional hand-drawn annotation overlay (SVG) pointing at the focal element.
- **IDE-inspired / terminal:** 0–4px corners, monospace caption, optional filename-style chrome above (`demo.webm`).

Every aesthetic: the video should feel embedded, not glued on. If it looks like an afterthought, shrink the max-width by 100–200px and give it more breathing room rather than framing it with shadows.

---

## When the demo adds nothing

After capturing, look at the webm honestly: does it explain something a single screenshot wouldn't? If the answer is no, **drop it**. An inline video that shows the cursor moving to a button and clicking it is worse than a still screenshot with a labeled arrow. Save demos for cases where time and interaction are the point.

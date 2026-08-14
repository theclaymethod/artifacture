---
description: Open an existing visual explainer in the developer preview for click-to-comment review and safe direct text edits
---

# Annotate a Visual Explainer

Open an existing HTML artifact in the local developer preview. This is a Tier 2 command: it operates on an existing file and has no creative choices, so do not ask clarification questions.

## Usage

```text
/annotate <file-path>
```

If no path is supplied, use the most recently generated artifact from the
current task or workspace. Fall back to the most recently modified HTML file in
`~/.agent/diagrams/` only when no task-local artifact is available.

## Run

```bash
node {{skill_dir}}/scripts/preview.mjs <file-path> --no-open
```

Follow `./references/developer-preview.md` exactly: keep the process running, read the local URL from stdout, and navigate the coding agent's integrated preview browser directly to it. Do not ask the user to start the server or open the URL. Do not open `preview-shell.html` with `file://`.

The preview provides:

- **Preview** — interact with the page normally.
- **Comment** — click an exact rendered element, add a note, and immediately continue to the next element. Notes stay numbered and can be copied for a coding agent.
- **Edit text** — click a simple heading, label, or paragraph and type directly in the rendered page. Saving writes the owning source when available, rebuilds the artifact, and preserves the current slide; ambiguous matches require confirmation and external changes fail closed. Undo is available for edits made in the current preview process.

The developer shell and bridge are injected only into the served preview. They are never written into the deliverable HTML.

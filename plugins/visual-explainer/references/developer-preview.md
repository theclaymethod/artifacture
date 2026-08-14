# Developer preview launch contract

The coding agent owns the whole preview handoff. The user should not have to run a server, copy a URL, or open an internal HTML file.

## Required agent flow

1. Start the preview server as a persistent background process:

   ```bash
   node {{skill_dir}}/scripts/preview.mjs <artifact.html> --no-open
   ```

   Use the default ephemeral port unless a specific port is required. Keep the process alive for the review session and read the local `http://127.0.0.1:<port>` URL from stdout.

2. Navigate the agent's integrated preview browser directly to that URL. When Codex's in-app Browser is available, use it explicitly. Do not rely on the operating system's default browser and do not ask the user to paste or open the URL.

3. Confirm that the preview shell loaded and that the target artifact is visible inside it. Leave the server running so Preview, Comment, Edit text, refresh, and undo continue to work.

4. Reuse the running preview when reopening the same artifact. Stop or replace obsolete preview processes when the task ends or the target changes.

When an owning `package.json` exposes `publish`, `export`, or `build`, the preview chooses a package runner from the declared `packageManager`, then the project lockfile, then the available npm, pnpm, and Bun fallbacks. The build script itself owns its runtime requirements; preview publishing does not require Bun.

## Never do this

- Do not open `scripts/preview-shell.html` directly. It is an internal server asset and its `/__ve/*` resources do not exist under `file://`.
- Do not open the artifact with a `file://` URL when annotation or direct editing was requested.
- Do not start the server in a short-lived command that exits before the user can review it.
- Do not report the preview as ready until the integrated browser is displaying the served URL.

## Fallback

If the current coding environment has no integrated preview browser, run the command without `--no-open` so the tool opens the system browser, and tell the user that the integrated preview surface was unavailable. The local served preview is still required; opening `preview-shell.html` directly is never a fallback.

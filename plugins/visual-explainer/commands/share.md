# Share an artifact

```text
/share <file-path>
```

Share the requested HTML file to the authorized destination. If given MDX/TSX, export it first; do not deploy source files directly:

```bash
npm run ve:export -- <source.mdx|source.tsx> --out ~/.agent/diagrams/<slug>.html
bash {{skill_dir}}/scripts/share.sh <file>
```

Use the session's existing authorization. This command has no creative choices; resolve a missing target or destination through `references/clarify.md` only when needed.

## Select the backend

| Configuration | Backend |
|---|---|
| `VE_SHAREHTML_URL` is set | sharehtml |
| `~/.config/visual-explainer/share.json` exists | sharehtml |
| Neither exists | Public Vercel preview |

sharehtml updates a stable document URL behind the configured access layer and supports comments. Its privacy depends on that layer. The Vercel fallback creates a new public, claimable preview URL each time. Anyone with the URL can view it; gating requires claiming it into a Vercel project and enabling Deployment Protection.

## Setup

For sharehtml, install the CLI with `bun install -g sharehtml` or put the checkout's CLI on `PATH`. Team hosting requires a Cloudflare account, Workers Paid for Durable Objects, `pnpm run setup`, and Cloudflare Access scoped to the team. Configure `VE_SHAREHTML_URL` or `~/.config/visual-explainer/share.json`; a custom domain is optional. See `docs/TEAM-SHARING.md`.

The public fallback uses the vercel-deploy skill. If absent, install it with `pi install npm:vercel-deploy`. Fallback previews need no Vercel account, Cloudflare account, or API keys. The script copies the HTML to a temporary `index.html`, deploys it, and returns a preview URL plus a claim URL for later transfer to a Vercel account.

## Output and limits

sharehtml prints its CLI output and a mode hint:

```text
Sharing my-diagram.html via sharehtml...
Share mode: private team link, stable update-in-place URL
```

Vercel prints the public and claim URLs, plus JSON:

```json
{"previewUrl":"https://...","claimUrl":"https://...","deploymentId":"...","projectId":"..."}
```

Unclaimed Vercel previews default to 30-day retention; the retention period is configurable. sharehtml has no TTL by default and no built-in version history. Writes are last-write-wins and websocket messages are capped at 64KB. Keep MDX/TSX as the source of truth.

## Troubleshoot

- Missing CLI: run `which sharehtml`, then install it or fix `PATH`.
- Unexpected Vercel fallback: inspect `VE_SHAREHTML_URL` and `~/.config/visual-explainer/share.json`.
- Team setup failure: check Workers Paid, Durable Objects, and Cloudflare Access's allowed email or domain.

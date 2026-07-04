# Share Visual Explainer Page

Share a visual explainer HTML file. Uses sharehtml when team sharing is configured; otherwise falls back to the public Vercel preview path.

**Source/artifact contract.** Share generated HTML artifacts. If the user gives a `.mdx` or `.tsx` source file, export it first:

```bash
npm run ve:export -- <source.mdx|source.tsx> --out ~/.agent/diagrams/<slug>.html
```

Then share the generated `.html`. Do not deploy MDX/TSX source directly.

**Clarify.** This is a Tier 2 command per `./references/clarify.md` — it operates on an existing file and has no creative choices. Do not ask questions; just deploy.

## Usage

```
/share <file-path>
```

**Arguments:**
- `file-path` - Path to the generated HTML file to share, or an MDX/TSX source file that should be exported before sharing (required)

**Examples:**
```
/share ~/.agent/diagrams/my-diagram.html
/share /tmp/visual-explainer-output.html
```

## Backend Decision

| Situation | Backend |
|---|---|
| `VE_SHAREHTML_URL` exists | sharehtml |
| `~/.config/visual-explainer/share.json` exists | sharehtml |
| Neither exists | Vercel fallback |

Use sharehtml for private team review, stable update-in-place URLs, and comments. Use Vercel fallback for zero-setup public previews. Vercel can be partially gated only after the deployment is claimed into a Vercel project and Deployment Protection is enabled.

## How It Works

1. If `VE_SHAREHTML_URL` is set, or `~/.config/visual-explainer/share.json` exists, runs `sharehtml deploy <file>`.
2. In sharehtml mode, updates the same document URL in place and keeps the page private by default behind the configured access layer.
3. If sharehtml is not configured, copies the HTML file to a temp directory as `index.html`.
4. Deploys via the vercel-deploy skill and returns a public, claimable Vercel preview URL.

## Requirements

- **sharehtml CLI** for team sharing. Install with `bun install -g sharehtml` or put your repo checkout's CLI on `PATH`.
- **sharehtml hosting** for team-gated sharing. See `docs/TEAM-SHARING.md`: Cloudflare account, Workers Paid plan for Durable Objects, `pnpm run setup`, Cloudflare Access scoped to the team email domain, optional custom domain, then `VE_SHAREHTML_URL` or `~/.config/visual-explainer/share.json`.
- **vercel-deploy skill** for fallback public preview sharing. If missing: `pi install npm:vercel-deploy`

No Vercel account, Cloudflare account, or API keys are needed for fallback preview deployments. The fallback deployment is "claimable" — you can transfer it to your Vercel account later if you want.

Team sharing is private by default when backed by sharehtml. It updates the same share URL in place and supports review on a stable document URL. See `docs/TEAM-SHARING.md`.

## Script Location

```bash
bash {{skill_dir}}/scripts/share.sh <file>
```

## Output

sharehtml mode prints the sharehtml CLI output and a mode hint:
```
Sharing my-diagram.html via sharehtml...
Share mode: private team link, stable update-in-place URL
```

Vercel fallback prints:
```
Sharing my-diagram.html...

✓ Shared successfully!

Live URL:  https://skill-deploy-abc123.vercel.app
Claim URL: https://vercel.com/claim-deployment?code=...
```

The script also outputs JSON for programmatic use:
```json
{"previewUrl":"https://...","claimUrl":"https://...","deploymentId":"...","projectId":"..."}
```

## Notes

- Vercel fallback deployments are **public** — anyone with the URL can view.
- Vercel preview deployments have a configurable retention period; unclaimed previews default to 30 days.
- Each Vercel fallback share creates a new deployment with a unique URL.
- sharehtml team shares are private to the configured access layer and update in place.
- sharehtml limits: last-write-wins, MDX/TSX source-of-truth mitigation, 64KB websocket message cap, no TTL by default, no built-in version history.

## Troubleshooting

- Missing CLI: run `which sharehtml`; if absent, install it with `bun install -g sharehtml` or add the repo CLI to `PATH`.
- Missing env/config: run `echo "$VE_SHAREHTML_URL"` and `cat ~/.config/visual-explainer/share.json`; if both are absent, Vercel fallback is expected.
- Wizard failures: verify Cloudflare Workers Paid is active, Durable Objects were created, and Cloudflare Access allows your email or team domain.

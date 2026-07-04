# Team Sharing

Visual Explainer shares generated HTML artifacts through one command with two backends.

| Need | Use | Access | URL behavior | Setup |
|---|---|---|---|---|
| Zero setup, safe to be public | Vercel fallback | Public unless you add Vercel Deployment Protection | New claimable preview URL per share | No local account required |
| Team-gated review, comments, stable link | [sharehtml](https://github.com/jonesphillip/sharehtml) | Private by default behind Cloudflare Access | Same URL updates in place | Cloudflare + sharehtml CLI |

## Agent Contract

- Share the exported `.html`, not MDX/TSX source. If given source, export it first.
- Prefer sharehtml when `VE_SHAREHTML_URL` or `~/.config/visual-explainer/share.json` is configured.
- Use Vercel only when sharehtml is absent.
- sharehtml deploys and updates the same document URL; Vercel creates a new preview URL each time.
- sharehtml is private by default when Cloudflare Access is configured. Vercel fallback is public by default.
- Supported share modes: private team link via sharehtml, public preview via Vercel, and partially gated Vercel when Deployment Protection is enabled in the claimed project.
- Comments belong to the shared HTML page. Keep MDX/TSX as source of truth, apply feedback there, re-export, then update the same sharehtml URL.

## sharehtml Setup

Prerequisites:

- Cloudflare account.
- Cloudflare Workers Paid plan, about $5/month, because Durable Objects require it.
- `bun` installed locally.
- Access to the sharehtml repo or published CLI.

1. Install the CLI:

```bash
bun install -g sharehtml
```

If your team runs sharehtml from a repo checkout, put that CLI on `PATH` instead.

2. Run the sharehtml setup wizard from the sharehtml project:

```bash
pnpm install
pnpm run setup
```

When prompted, choose the Cloudflare account, create or select the Worker, enable Durable Objects, and record the service URL the wizard prints.

3. Protect the Worker with Cloudflare Access:

- Create an Access application for the sharehtml host.
- Add an allow policy scoped to your team email domain, for example `@example.com`.
- Test in a fresh browser profile before sending links to teammates.

4. Optional custom domain follow-up:

- Add the custom hostname in Cloudflare.
- Point it at the Worker route.
- Update Access to protect the custom hostname too.

5. Wire Visual Explainer to sharehtml with either env or config.

Env:

```bash
export VE_SHAREHTML_URL="https://share.example.com"
```

Config:

```json
{
  "url": "https://share.example.com"
}
```

Write the config to `~/.config/visual-explainer/share.json`.

6. Share a generated artifact:

```bash
bash plugins/visual-explainer/scripts/share.sh dist/visual-explainer-mdx/diagram-canvas.html
```

## Vercel Fallback

The fallback path copies the HTML to `index.html`, deploys a public preview, and prints a live URL plus a claim URL. Claimable deployments can be transferred into a Vercel account later. Unclaimed preview retention is 30 days by default.

For partial gating, claim the deployment into a Vercel project and enable Deployment Protection. This is useful for one-off previews, but it does not give sharehtml's stable update-in-place URL or comment flow.

## Limits

- sharehtml updates are last-write-wins. Mitigation: MDX/TSX remains the source of truth; re-export intentionally before updating.
- sharehtml has a 64KB websocket message cap for live collaboration/comment traffic.
- sharehtml has no TTL by default; clean up old documents by team policy.
- sharehtml does not provide built-in version history.
- Vercel fallback links are public unless protected after claiming.
- Vercel fallback creates a new URL per share.

## Troubleshooting

Missing sharehtml CLI:

```bash
which sharehtml
bun install -g sharehtml
```

Missing Visual Explainer share config:

```bash
echo "$VE_SHAREHTML_URL"
cat ~/.config/visual-explainer/share.json
```

If neither exists, the script correctly falls back to Vercel.

Wizard failures:

- Confirm the Cloudflare account has Workers Paid enabled.
- Re-run `pnpm install` in the sharehtml repo.
- Check that Durable Objects were created by the wizard.
- If Access blocks everyone, temporarily allow your exact email, verify login, then broaden to the team domain.

Vercel deployment unexpectedly public:

- This is the fallback default. Claim the deployment and enable Deployment Protection, or configure sharehtml for private-by-default sharing.

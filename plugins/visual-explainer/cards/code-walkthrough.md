# Code Walkthrough Card
Use `ExplainerShell`, `Section`, `CodeBlock`, `Pipeline`. Focused snippets, not whole files.
```mdx
import { ExplainerShell, Section, CodeBlock, Pipeline } from '../../../visual-explainer-mdx/components';
<ExplainerShell title="Webhook Signature Gate" summary="Protect every billing write." preset="terminal">
  <Section kicker="hot path" title="Four checks before handlers">
    <Pipeline steps={['Read raw body','Recompute HMAC','Check timestamp','Attach verified event']} />
  </Section>
  <Section title="Focal branch">
    <CodeBlock language="ts" filename="src/webhooks/verify.ts" highlightLines={[4,8]} annotations={[
      {line:4,note:'Reject replay before JSON.'},
      {line:8,note:'Verified events reach billing.'}
    ]} code={`export function verifyWebhook(req) {
  const raw = req.rawBody
  const sentAt = Number(req.headers['x-sent-at'])
  if (Date.now() - sentAt > 300000) return reject(408)
  const expected = hmac(raw, process.env.WEBHOOK_SECRET)
  if (!timingSafeEqual(expected, req.headers['x-signature']))
    return reject(401)
  const event = JSON.parse(raw)
  return { event, verified: true }
}`} />
  </Section>
</ExplainerShell>
```
Export `npm run ve:export -- source.mdx --out out.html`; verify.

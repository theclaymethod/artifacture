# Explain a code path

Use `ExplainerShell`, `Section`, `CodeBlock`, and `Pipeline`. Start with an input, follow the relevant branch, and show its result. Keep snippets focused and identify their source files.

This illustrative cache example shows the structure; replace it with inspected code.

```mdx
{/* REPO = Artifacture checkout; see SKILL.md "Resolve the runtime" */}
import { ExplainerShell, Section, CodeBlock, Pipeline } from 'REPO/visual-explainer-mdx/components';

<ExplainerShell title="A cache miss reads storage">
  <Section title="The lookup order">
    <Pipeline steps={['Read the cache', 'Return a hit', 'Fetch a miss from storage']} />
  </Section>
  <Section title="Only a miss calls storage">
    <CodeBlock language="ts" filename="src/read-record.ts" highlightLines={[3]} annotations={[
      {line:3,note:'A cached value returns before storage is called.'}
    ]} code={`async function readRecord(key: string) {
  const cached = await cache.get(key)
  if (cached !== null) return cached
  return storage.get(key)
}`} />
  </Section>
</ExplainerShell>
```

Export with `npm run ve:export -- source.mdx --out out.html`, then follow `references/verification.md`.

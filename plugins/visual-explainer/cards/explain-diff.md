# Explain a diff

Connect the old behavior, the change, and a concrete outcome. Use `DiffBlock` for the changed code and `Quiz` only when a question helps the reader check their understanding.

Illustrative example:

```mdx
{/* REPO = Artifacture checkout; see SKILL.md "Resolve the runtime" */}
import { DiffBlock, ExplainerShell, Quiz, Section } from 'REPO/visual-explainer-mdx/components';

<ExplainerShell title="Cached records return before storage is called">
  <Section title="The new branch handles a cache hit">
    <p>Previously every request read storage. The added lookup returns a cached record when one exists; a miss keeps the original path.</p>
    <DiffBlock before={`return storage.get(key)`} after={`const cached = await cache.get(key)\nif (cached !== null) return cached\nreturn storage.get(key)`} language="ts" />
  </Section>
  <Section title="Check the miss path">
    <Quiz questions={[{q:'What happens when the cache returns null?',options:[
      {text:'The request reads storage.',correct:true,why:'The early return is skipped.'},
      {text:'The request returns null.',why:'Null falls through to storage.get(key).'}
    ]}]} />
  </Section>
</ExplainerShell>
```

Add a diagram through `cards/web-diagram.md` when relationships need explaining. Follow `commands/explain-diff.md` for source inspection and delivery.

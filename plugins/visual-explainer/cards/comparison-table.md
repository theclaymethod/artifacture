# Comparison Table Card
Use `ExplainerShell`, `Section`, `DecisionMatrix`, optional `Callout`. Best for 4+ rows or 3+ columns. Same keys in every row.
```mdx
{/* REPO = artifacture checkout; see SKILL.md "Pipeline location" */}
import { ExplainerShell, Section, DecisionMatrix, Callout } from 'REPO/visual-explainer-mdx/components';
<ExplainerShell title="Search Cache Decision" summary="Pick the smallest store that keeps imports inspectable." preset="blueprint">
  <Section kicker="recommendation" title="SQLite is the default"><Callout>Focal move: one local file, indexed lookups, and a clear migration path if the cache becomes shared.</Callout></Section>
  <Section title="Tradeoff matrix"><DecisionMatrix rows={[
    {Option:'SQLite',Setup:'File',Lookup:'Indexed SQL',Failure:'File lock during bulk import',Fit:'Best'},
    {Option:'Redis',Setup:'Service',Lookup:'Key/value',Failure:'Extra network dependency',Fit:'Fast but heavier'},
    {Option:'JSONL',Setup:'None',Lookup:'Linear scan',Failure:'Manual recovery after partial write',Fit:'Prototype only'},
    {Option:'Postgres',Setup:'Service',Lookup:'Indexed SQL',Failure:'Ops cost for local tool',Fit:'Later'}
  ]} /></Section>
</ExplainerShell>
```
Export `npm run ve:export -- source.mdx --out out.html`; verify with `ve-verify`. None fit -> `references/legacy-html.md`.

# Compare alternatives

Use `DecisionMatrix` for comparable rows with the same keys. Put the decision criteria before the conclusion and state the scope in which the recommendation holds.

Illustrative example:

```mdx
{/* REPO = Artifacture checkout; see SKILL.md "Resolve the runtime" */}
import { ExplainerShell, Section, DecisionMatrix } from 'REPO/visual-explainer-mdx/components';

<ExplainerShell title="A search cache for a local import tool">
  <Section title="Compare lookup and recovery">
    <DecisionMatrix rows={[
      {Option:'SQLite',Setup:'Local file',Lookup:'Indexed SQL',Constraint:'Coordinate concurrent writes'},
      {Option:'Redis',Setup:'Separate service',Lookup:'Key/value',Constraint:'Handle network failures'},
      {Option:'JSONL',Setup:'Local file',Lookup:'Sequential scan',Constraint:'Recover partial writes'},
      {Option:'Postgres',Setup:'Separate service',Lookup:'Indexed SQL',Constraint:'Operate the database'}
    ]} />
  </Section>
</ExplainerShell>
```

Replace sample criteria with evidence from the task. Export with `npm run ve:export -- source.mdx --out out.html` and follow `references/verification.md`. Use `references/legacy-html.md` only for a limitation the shared components cannot resolve.

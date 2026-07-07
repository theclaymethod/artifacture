# Slide Deck Card

Use `SlideDeck`, `Slide`, plus `DiagramCanvas`, `DecisionMatrix`, or `CodeBlock`. `orientation="horizontal"` is magazine mode.

```mdx
{/* REPO = artifacture checkout; see SKILL.md "Pipeline location" */}
import { DiagramCanvas, Slide, SlideDeck } from 'REPO/visual-explainer-mdx/components';

<SlideDeck title="Release Readiness" eyebrow="Go / No-go" preset="editorial">
  <Slide title="One unresolved blocker">
    <p>Payments ship after replay is capped and support sees the dead-letter queue.</p>
  </Slide>
  <Slide title="Gate flow" kicker="decision path" tone="light">
    <DiagramCanvas
      layout="flow"
      nodes={[
        {id:'tests',label:'Tests pass',detail:'unit + smoke',shape:'oval'},
        {id:'replay',label:'Replay capped?',detail:'5 attempts',shape:'diamond',accent:true},
        {id:'support',label:'Support view',detail:'dead letters visible'},
        {id:'ship',label:'Deploy',detail:'release train'}
      ]}
      edges={[{from:'tests',to:'replay',label:'green'},{from:'replay',to:'support',label:'yes'},{from:'support',to:'ship',label:'owner on call'}]}
    />
  </Slide>
</SlideDeck>
```

Export `npm run ve:export -- source.mdx --out out.html`; verify.
None fit -> `references/slide-patterns.md` or `references/legacy-html.md`.

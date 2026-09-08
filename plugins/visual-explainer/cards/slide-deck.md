# Build a reader deck

Use `SlideDeck`, `Slide`, plus `DiagramCanvas`, `DecisionMatrix`, or `CodeBlock`.
For a generic request for slides, a slide deck, or a presentation, use the
default vertical deck and omit `orientation`. Set `orientation="horizontal"`
only when the user explicitly asks for magazine mode, a horizontal zine, or
editorial pages; that prop changes the artifact contract to magazine mode.

Illustrative release example; replace its conditions with the project’s actual release requirements.

```mdx
{/* REPO = artifacture checkout; see SKILL.md "Resolve the runtime" */}
import { DiagramCanvas, Slide, SlideDeck } from 'REPO/visual-explainer-mdx/components';

<SlideDeck title="Release after replay and support checks pass">
  <Slide title="Two checks remain">
    <p>Payments ship after replay is capped and support sees the dead-letter queue.</p>
  </Slide>
  <Slide title="The release conditions" tone="light">
    <DiagramCanvas
      layout="flow"
      nodes={[
        {id:'tests',label:'Tests pass',detail:'unit + smoke',shape:'oval'},
        {id:'replay',label:'Replay capped?',detail:'5 attempts',shape:'diamond',accent:true},
        {id:'support',label:'Support view',detail:'dead letters visible'},
        {id:'ship',label:'Deploy',detail:'after the checks pass'}
      ]}
      edges={[{from:'tests',to:'replay',label:'pass'},{from:'replay',to:'support',label:'yes'},{from:'support',to:'ship',label:'owner on call'}]}
    />
  </Slide>
</SlideDeck>
```

Export `npm run ve:export -- source.mdx --out out.html`; verify.
Use `references/slide-patterns.md` for custom mechanics or `references/legacy-html.md` for an unsupported output route.

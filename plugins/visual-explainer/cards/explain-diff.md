# Explain-Diff Card
Use `ExplainerShell`, `Section`, `DiagramCanvas`/`MermaidBlock`, `DiffBlock`, `Quiz`. Arc: context, intuition, code, quiz.
```mdx
{/* REPO = artifacture checkout; see SKILL.md "Pipeline location" */}
import { DiagramCanvas, DiffBlock, ExplainerShell, Quiz, Section } from 'REPO/visual-explainer-mdx/components';
<ExplainerShell title="Why This Diff Matters" summary="Replay moves from blind retry to idempotent recovery.">
  <Section kicker="before/after" title="Behavior">
    <DiagramCanvas nodes={[{id:'old',label:'Retry loop',detail:'double-charge risk'},{id:'new',label:'Lookup replay',detail:'idempotent',accent:true}]} edges={[{from:'old',to:'new',label:'safer'}]} />
  </Section>
  <Section title="Intuition"><p>A timeout can hide success; lookup makes replay reconciliation.</p></Section>
  <Section title="Code"><DiffBlock before={`await provider.capture(invoice)\nmarkPaid(invoice.id)`} after={`const charge = await provider.find(invoice.key)\nif (!charge) await provider.capture(invoice)\nmarkPaid(invoice.id)`} language="ts" /></Section>
  <Section title="Quiz"><Quiz questions={[{q:'Why lookup first?',options:[{text:'Prevents duplicates',correct:true,why:'Timeout may hide success.'},{text:'Speeds rendering',why:'Backend recovery.'}]}]} /></Section>
</ExplainerShell>
```
Custom HTML -> `references/legacy-html.md`.

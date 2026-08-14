# Web Diagram Card
Read `../references/diagram-design.md` to select the routed diagram type and
semantic pattern, then `../references/diagrams-svg.md` for shared SVG geometry.
Use `ExplainerShell`, `Section`, `DiagramCanvas`: lanes, details, one accent.
In MDX prose, write literal braces as `&#123;` or inside code spans — bare { } in prose breaks the compiler.
Default Tailwind spacing only; no [Npx].
```mdx
{/* REPO = artifacture checkout; see SKILL.md "Pipeline location" */}
import { ExplainerShell, Section, DiagramCanvas } from 'REPO/visual-explainer-mdx/components';
<ExplainerShell title="Checkout" summary="Lanes, sublabels, focal handoff.">
  <Section title="Service path">
    <DiagramCanvas layout="swimlane"
      lanes={[{id:'edge',label:'Edge'},{id:'app',label:'App'},{id:'data',label:'Data'}]}
      nodes={[
        {id:'client',label:'Browser',detail:'cookie',shape:'oval',lane:'edge'},
        {id:'gateway',label:'Gateway',detail:'TLS + limit',accent:true,lane:'edge'},
        {id:'cart',label:'Cart API',detail:'stock check',lane:'app'},
        {id:'pay',label:'Payment?',detail:'3DS',shape:'diamond',lane:'app'},
        {id:'db',label:'Orders DB',detail:'serial write',lane:'data'}
      ]}
      edges={[{from:'client',to:'gateway',label:'HTTPS'},{from:'gateway',to:'cart',label:'request'},{from:'cart',to:'pay',label:'auth'},{from:'pay',to:'db',label:'approved'},{from:'cart',to:'db',label:'audit',style:'dashed'}]} />
  </Section>
</ExplainerShell>
```
None fit -> use an accessible inline SVG inside the component shell. Mermaid is
the fallback only when its layout is a better fit and it retains the complete
zoom, pan, reset, and expand controls.

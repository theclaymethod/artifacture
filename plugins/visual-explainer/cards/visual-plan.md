# Visual Plan Card
Use `ExplainerShell`, `Section`, `Pipeline`, `DecisionMatrix`, `RiskLedger`. Real choices, one focal stat.
```mdx
import { ExplainerShell, Section, Pipeline, DecisionMatrix, RiskLedger } from '../../../visual-explainer-mdx/components';
<ExplainerShell title="Retry Queue Plan" summary="Bound failed invoice jobs." preset="paper-ink">
  <Section kicker="target" title="48h to visible failure">
    <Pipeline steps={[
      {title:'Classify',body:'Network, validation, outage.'},
      {title:'Back off',body:'5 tries over 32 minutes.'},
      {title:'Quarantine',body:'Dead-letter tenant, job, trace.'},
      {title:'Repair',body:'Replay after cause is tagged.'}
    ]} />
  </Section>
  <Section title="Choices"><DecisionMatrix rows={[
    {Choice:'Retry cap',Decision:'5 attempts',Why:'Stops poison jobs.'},
    {Choice:'Dead letter',Decision:'Required',Why:'Makes stuck invoices searchable.'},
    {Choice:'Replay',Decision:'Manual first',Why:'Avoids duplicate charges.'}
  ]} /></Section>
  <Section title="Risk"><RiskLedger risks={[{risk:'Duplicate charge',signal:'Timeout after capture',mitigation:'Idempotency key + lookup',level:'high'}]} /></Section>
</ExplainerShell>
```
Export `npm run ve:export -- source.mdx --out out.html`; verify.

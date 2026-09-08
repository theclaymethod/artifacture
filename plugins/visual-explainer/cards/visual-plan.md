# Present an implementation plan

Use `Pipeline` for dependent work, `DecisionMatrix` for choices, and `RiskLedger` for a risk with a trigger and mitigation. Distinguish proposals from current behavior.

Illustrative proposal:

```mdx
{/* REPO = Artifacture checkout; see SKILL.md "Resolve the runtime" */}
import { ExplainerShell, Section, Pipeline, DecisionMatrix, RiskLedger } from 'REPO/visual-explainer-mdx/components';

<ExplainerShell title="Bound retries and retain failed jobs">
  <Section title="Proposed failure handling">
    <Pipeline steps={[
      {title:'Classify',body:'Separate transient failures from invalid jobs.'},
      {title:'Retry',body:'Back off up to the configured attempt limit.'},
      {title:'Retain',body:'Store the failed job and its last error.'},
      {title:'Replay',body:'Retry after the cause has been resolved.'}
    ]} />
  </Section>
  <Section title="Decisions to make">
    <DecisionMatrix rows={[
      {Choice:'Retry limit',Decision:'Set from observed failure behavior',Reason:'Bound repeated work.'},
      {Choice:'Failed-job storage',Decision:'Retain the job and error',Reason:'Support diagnosis and replay.'},
      {Choice:'Replay control',Decision:'Manual initially',Reason:'Keep the retry decision inspectable.'}
    ]} />
  </Section>
  <Section title="A timeout can hide a completed charge">
    <RiskLedger risks={[{risk:'Duplicate charge on retry',signal:'Timeout after capture',mitigation:'Use the provider’s idempotency contract',level:'high'}]} />
  </Section>
</ExplainerShell>
```

Ground the final proposal in inspected code. Export with `npm run ve:export -- source.mdx --out out.html`, then follow `references/verification.md`.

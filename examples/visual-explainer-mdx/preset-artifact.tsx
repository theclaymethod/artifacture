import React from 'react';
import { DiagramCanvas, ExplainerShell, Section, type VisualPreset } from '../../visual-explainer-mdx/components';

const themes = { lieflat: 'lieflat', algebrica: 'algebrica', 'mono-color': 'mono-color' } satisfies Record<string, VisualPreset>;
const requested = 'window' in globalThis ? new URLSearchParams(window.location.search).get('preset') : null;
function isTheme(value: string | null): value is keyof typeof themes {
  return value !== null && Object.hasOwn(themes, value);
}
const preset = isTheme(requested) ? themes[requested] : 'lieflat';

export default function PresetArtifact() {
  return (
    <ExplainerShell preset={preset} title="A queue separates arrival from work" summary="A producer can submit a job before a worker is ready to process it. The queue holds the job until a worker takes it." reviewTools={false}>
      <Section title="The handoff">
        <DiagramCanvas title="Producer, queue, and worker" nodes={[{ id: 'producer', label: 'Producer', detail: 'Creates a job' }, { id: 'queue', label: 'Queue', detail: 'Holds pending jobs' }, { id: 'worker', label: 'Worker', detail: 'Processes each job' }]} edges={[{ from: 'producer', to: 'queue', label: 'submit' }, { from: 'queue', to: 'worker', label: 'receive' }]} />
      </Section>
      <Section title="Capacity still matters">
        <p>If jobs arrive faster than workers finish them, the queue grows. A queue absorbs a temporary burst; it does not create processing capacity. Monitor waiting time and provide a clear policy for failed jobs.</p>
      </Section>
    </ExplainerShell>
  );
}

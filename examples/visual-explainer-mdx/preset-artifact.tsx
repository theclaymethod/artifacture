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
    <ExplainerShell preset={preset} title="Queue work until a worker is ready" summary="A producer can submit a job before a worker is ready to process it. The queue holds the job until a worker takes it." reviewTools={false}>
      <Section title="Submitting and processing a job">
        <DiagramCanvas title="Producer, queue, and worker" nodes={[{ id: 'producer', label: 'Producer', detail: 'Creates a job' }, { id: 'queue', label: 'Queue', detail: 'Holds pending jobs' }, { id: 'worker', label: 'Worker', detail: 'Processes each job' }]} edges={[{ from: 'producer', to: 'queue', label: 'submit' }, { from: 'queue', to: 'worker', label: 'receive' }]} />
      </Section>
      <Section title="When the queue grows">
        <p>The queue grows when arrivals outpace workers. It can absorb a temporary burst but adds no processing capacity. Monitor waiting time and define how failed jobs are handled.</p>
      </Section>
    </ExplainerShell>
  );
}

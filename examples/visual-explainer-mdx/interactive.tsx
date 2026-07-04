import React, { useMemo, useState } from 'react';
import { Callout, DecisionMatrix, ExplainerShell, Pipeline, Section } from '../../visual-explainer-mdx/components';

const modes = {
  mdx: {
    label: 'MDX default',
    body: 'Best for structured explainers with reusable visual components.',
    output: 'Generated static HTML',
  },
  react: {
    label: 'React heavy',
    body: 'Best for local state, filters, custom SVG, animation, and richer review tools.',
    output: 'Generated HTML plus bundled client JS',
  },
  video: {
    label: 'Video parity',
    body: 'Best after the HTML export path can feed a Hyperframes-compatible composition.',
    output: 'Generated MP4 and keyframes',
  },
};

type Mode = keyof typeof modes;

export default function InteractiveExplainer() {
  const [mode, setMode] = useState<Mode>('mdx');
  const selected = modes[mode];
  const rows = useMemo(
    () =>
      Object.entries(modes).map(([key, value]) => ({
        mode: value.label,
        recommended: key === mode ? 'selected' : 'available',
        output: value.output,
      })),
    [mode],
  );

  return (
    <ExplainerShell
      eyebrow="React escalation source"
      title="Interactive Explainer Workbench"
      summary="This TSX source uses state and memoized derived data, then exports to a standalone generated HTML artifact."
    >
      <Section kicker="interaction" title="Mode Switcher">
        <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            {(Object.keys(modes) as Mode[]).map((key) => (
              <button
                key={key}
                className={`border px-4 py-3 text-left font-mono text-sm uppercase tracking-[0.14em] transition ${
                  key === mode
                    ? 'border-teal-300 bg-teal-300 text-zinc-950'
                    : 'border-white/15 bg-white/[0.04] text-zinc-300 hover:border-white/40'
                }`}
                onClick={() => setMode(key)}
                type="button"
              >
                {modes[key].label}
              </button>
            ))}
          </div>
          <div className="border border-white/15 bg-white/[0.04] p-6">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-teal-300">selected path</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-normal text-white">{selected.label}</h2>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-300">{selected.body}</p>
            <p className="mt-6 font-mono text-sm text-zinc-500">{selected.output}</p>
          </div>
        </div>
      </Section>

      <Section kicker="derived" title="Rendered From State">
        <DecisionMatrix rows={rows} />
      </Section>

      <Section kicker="flow" title="Escalation Rule">
        <Pipeline
          steps={[
            'Start in MDX',
            'Escalate when state is needed',
            'Bundle React behavior',
            'Generate standalone HTML',
          ]}
        />
      </Section>

      <Section kicker="proof" title="Why This Sample Exists">
        <Callout>
          This page proves the exporter can handle real React state, not only static MDX content.
        </Callout>
      </Section>
    </ExplainerShell>
  );
}

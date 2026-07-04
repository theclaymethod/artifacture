import React from 'react';
import type { VisualPreset } from '../../visual-explainer-mdx/components';

type PresetCopy = {
  title: string;
  summary: string;
  metric: string;
  label: string;
  checks: string[];
};

const presetCopy: Record<VisualPreset, PresetCopy> = {
  'mono-industrial': {
    title: 'Request Ledger',
    summary: 'Swiss, monochrome hierarchy. Spacing and type carry the explainer before color appears.',
    metric: '07',
    label: 'open requests',
    checks: ['MDX source', 'React islands', 'Generated HTML', 'Annotation map'],
  },
  nothing: {
    title: 'System Status',
    summary: 'OLED black instrument panel with bracketed state, segmented meters, and one red incident.',
    metric: '128',
    label: 'render queue',
    checks: ['[SOURCE OK]', '[TOKENS OK]', '[EXPORT OK]', '[REVIEW ACTIVE]'],
  },
  blueprint: {
    title: 'Assembly Blueprint',
    summary: 'A schematic treatment for architecture, state machines, and implementation plans.',
    metric: '03',
    label: 'linked planes',
    checks: ['Coordinate source', 'Route component', 'Bake HTML', 'Inspect surface'],
  },
  editorial: {
    title: 'Field Notes',
    summary: 'A magazine-like explainer for narrative recaps, plans, and high-context reviews.',
    metric: '21',
    label: 'margin notes',
    checks: ['Lead', 'Evidence', 'Counterpoint', 'Close'],
  },
  'paper-ink': {
    title: 'Working Draft',
    summary: 'A paper-first surface with ink hierarchy, tactile rules, and warm annotation marks.',
    metric: 'A4',
    label: 'static proof',
    checks: ['Sketch', 'Typeset', 'Annotate', 'Publish'],
  },
  terminal: {
    title: 'Operator Console',
    summary: 'Dense monospace status for command-heavy explainer runs and pipeline receipts.',
    metric: '0x0',
    label: 'exit code',
    checks: ['npm run ve:check', 'npm run ve:export', 'browser verify', 'archive receipt'],
  },
};

const queryPreset = new URLSearchParams(window.location.search).get('preset') as VisualPreset | null;
const filePreset = window.location.pathname.match(/preset-artifact-([a-z-]+)\.html$/)?.[1] as VisualPreset | undefined;
const selected: VisualPreset =
  queryPreset && queryPreset in presetCopy
    ? queryPreset
    : filePreset && filePreset in presetCopy
      ? filePreset
      : 'mono-industrial';
const copy = presetCopy[selected];

export default function PresetArtifact() {
  return (
    <main className={`ve-output ve-output--${selected}`} data-ve-preset={selected}>
      <div className="ve-output-inner">
        {selected === 'nothing' ? <NothingArtifact copy={copy} /> : null}
        {selected === 'mono-industrial' ? <MonoArtifact copy={copy} /> : null}
        {selected === 'blueprint' ? <BlueprintArtifact copy={copy} /> : null}
        {selected === 'editorial' ? <EditorialArtifact copy={copy} /> : null}
        {selected === 'paper-ink' ? <PaperInkArtifact copy={copy} /> : null}
        {selected === 'terminal' ? <TerminalArtifact copy={copy} /> : null}
      </div>
    </main>
  );
}

function MonoArtifact({ copy }: { copy: PresetCopy }) {
  return (
    <>
      <Header copy={copy} eyebrow="mono-industrial" />
      <section className="ve-ledger">
        <div>
          <p className="ve-kicker">ledger index</p>
          <div className="ve-display-metric">{copy.metric}</div>
          <p className="ve-muted">{copy.label}</p>
        </div>
        <ProcessList items={copy.checks} />
      </section>
      <FooterRule />
    </>
  );
}

function NothingArtifact({ copy }: { copy: PresetCopy }) {
  return (
    <>
      <Header copy={copy} eyebrow="nothing" />
      <section className="ve-instrument">
        <div className="ve-dot-field">
          <div className="ve-display-metric">{copy.metric}</div>
          <p className="ve-kicker">{copy.label}</p>
          <p className="ve-system-line">[ARTIFACT READY]</p>
        </div>
        <div className="ve-panel-grid">
          <ProcessList items={copy.checks} />
          <div className="ve-segments" aria-label="render completion">
            {Array.from({ length: 18 }, (_, index) => (
              <span className={index === 13 ? 'is-alert' : index < 15 ? 'is-on' : ''} key={index} />
            ))}
          </div>
        </div>
      </section>
      <FooterRule />
    </>
  );
}

function BlueprintArtifact({ copy }: { copy: PresetCopy }) {
  return (
    <>
      <Header copy={copy} eyebrow="blueprint" />
      <section className="ve-blueprint-board">
        <p className="ve-blueprint-label ve-blueprint-label--top">coordinate map / generated output path</p>
        <p className="ve-blueprint-label ve-blueprint-label--side">scale 1:1</p>
        <div className="ve-blueprint-node ve-blueprint-node--a">MDX</div>
        <div className="ve-blueprint-node ve-blueprint-node--b">tokens</div>
        <div className="ve-blueprint-node ve-blueprint-node--c">static html</div>
        <svg aria-hidden="true" className="ve-blueprint-lines" viewBox="0 0 900 360">
          <path d="M158 94H448V232H704" />
          <path d="M158 94V270H704" />
          <circle cx="448" cy="232" r="5" />
          <circle cx="704" cy="270" r="5" />
        </svg>
      </section>
      <ProcessList items={copy.checks} />
    </>
  );
}

function EditorialArtifact({ copy }: { copy: PresetCopy }) {
  return (
    <>
      <Header copy={copy} eyebrow="editorial" />
      <section className="ve-editorial-spread">
        <div className="ve-folio">No. {copy.metric}</div>
        <p>
          A visual explainer should read like a finished argument: source-controlled, styled through named systems, and
          reviewable at the exact point where a reader hesitates.
        </p>
        <aside>HTML is an output, never the authored surface.</aside>
      </section>
      <ProcessList items={copy.checks} />
    </>
  );
}

function PaperInkArtifact({ copy }: { copy: PresetCopy }) {
  return (
    <>
      <Header copy={copy} eyebrow="paper-ink" />
      <section className="ve-paper-proof">
        <p className="ve-kicker">proof marks</p>
        <h2>{copy.metric}</h2>
        <p>{copy.summary}</p>
        <p className="ve-paper-note">revise source, re-export proof, keep the artifact clean</p>
        <ProcessList items={copy.checks} />
      </section>
    </>
  );
}

function TerminalArtifact({ copy }: { copy: PresetCopy }) {
  return (
    <>
      <Header copy={copy} eyebrow="terminal" />
      <section className="ve-terminal">
        <p><span>001</span>$ visual-explainer export preset={selected}</p>
        <p><span>002</span>&gt; compile mdx/react source</p>
        <p><span>003</span>&gt; inline static html artifact</p>
        <p><span>004</span>&gt; attach click targets</p>
        <p className="is-ok"><span>005</span>exit {copy.metric}</p>
      </section>
      <ProcessList items={copy.checks} />
    </>
  );
}

function Header({ copy, eyebrow }: { copy: PresetCopy; eyebrow: string }) {
  return (
    <header className="ve-output-header">
      <p className="ve-kicker">{eyebrow}</p>
      <h1>{copy.title}</h1>
      <p>{copy.summary}</p>
    </header>
  );
}

function ProcessList({ items }: { items: string[] }) {
  return (
    <ol className="ve-process-list">
      {items.map((item, index) => (
        <li key={item}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          {item}
        </li>
      ))}
    </ol>
  );
}

function FooterRule() {
  return (
    <footer className="ve-output-footer">
      <span>source: tsx/mdx</span>
      <span>output: generated html</span>
      <span>review: point target</span>
    </footer>
  );
}

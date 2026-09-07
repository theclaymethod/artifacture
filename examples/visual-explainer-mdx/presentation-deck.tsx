import React from 'react';
import {
  CodePanel,
  DrillCard,
  DrillChip,
  DrillSheet,
  FanoutDiagram,
  HairlineList,
  IconCorpus,
  IconFile,
  IconFit,
  IconGauge,
  IconLoop,
  IconTool,
  LadderDiagram,
  LayerExplorer,
  PresentationDeck,
  PresentationSlide,
  Stepper,
  usePresentationStateNavigation,
} from '../../visual-explainer-mdx/components';
import type { PresentationTone } from '../../visual-explainer-mdx/components';

/* PresentationDeck reads shortTitle/tone from its DIRECT children to build
   the rail and tone-matched chrome. These slides are wrapped in local
   components (they own drill state), so each wrapper receives the metadata
   at its usage site and forwards it to the PresentationSlide inside. */
type SlideMeta = { shortTitle: string; tone: PresentationTone };

/*
 * Demo for the PresentationDeck engine: a fixed 1920×1080 stage scaled to
 * fit, collapsible rail, keyboard nav, and drill-down primitives. The eval
 * harness (evals/run-presentation.mjs) drives this exact source through the
 * standard ve:export path, so the slides double as interaction fixtures —
 * notably the drill sheet on slide 2, which deliberately contains every
 * interactive element class the click-anywhere-to-close guard must ignore.
 */

function ThesisSlide({ shortTitle, tone }: SlideMeta) {
  const [open, setOpen] = React.useState(false);
  return (
    <PresentationSlide

      title="A failed job needs a durable next step"
      shortTitle={shortTitle}
      tone={tone}


    >
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 56, height: '100%', alignContent: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          <p style={{ fontSize: 40, lineHeight: 1.35, margin: 0 }}>Retry a temporary failure. Retain the evidence when the job needs repair.</p>
          <p style={{ fontSize: 28, lineHeight: 1.55, color: 'var(--ve-pres-muted)', margin: 0 }}>This example follows one job through claiming, processing, delayed retries, and quarantine. A timeout can hide success, so every attempt keeps the same operation identity.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <HairlineList
            items={[
              { head: 'Identity', body: 'A stable job key follows every attempt and replay.' },
              { head: 'State', body: 'Queued, running, waiting, and quarantined mean different things.' },
              { head: 'Evidence', body: 'Retain the last error and attempt history when work cannot proceed.' },
            ]}
          />
          <div>
            <DrillChip drillId="thesis-contract" label="The job record" variant="primary" onClick={() => setOpen(true)} />
          </div>
        </div>
      </div>
      {open ? (
        <DrillSheet eyebrow="The job record" onClose={() => setOpen(false)} origin="right center">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, height: '100%', alignContent: 'start' }}>
            <CodePanel
              rows={[
                ['job key', 'catalog-refresh:v7'],
                ['payload', 'A reference to the immutable catalog version'],
                ['attempts', 'Counted each time a worker starts processing'],
                ['last error', 'Enough context to classify or repair the failure'],
              ]}
            />
            <HairlineList
              items={[
                { head: 'Stable identity', body: 'Replay preserves the original operation key.' },
                { head: 'Durable evidence', body: 'A process restart must not erase the failure history.' },
                { head: 'Explicit policy', body: 'Attempt budgets and permanent errors determine when retries stop.' },
              ]}
            />
          </div>
        </DrillSheet>
      ) : null}
    </PresentationSlide>
  );
}

function SystemSlide({ shortTitle, tone }: SlideMeta) {
  return (
    <PresentationSlide

      title="Separate retry from repair"
      shortTitle={shortTitle}
      tone={tone}


    >
      <div style={{ display: 'grid', gridTemplateRows: '1fr auto', gap: 26, height: '100%' }}>
        <LadderDiagram
          stepOffset={34}
          stages={[
            { num: '1', name: 'Claim', short: 'One worker acquires the job.' },
            { num: '2', name: 'Process', short: 'Use the original operation key.' },
            { num: '3', name: 'Classify', short: 'Temporary or permanent failure?' },
            { num: '4', name: 'Wait', short: 'Delay a permitted retry.' },
            { num: '5', name: 'Repair', short: 'Inspect a quarantined record.' },
          ]}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 22 }}>
          <DrillCard
            drillId="sys-guard"
            eyebrow=""
            title="Inspect a quarantined job"
            body="Keep the failure context beside the repair controls."
            origin="left bottom"
            minHeight={132}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignContent: 'start' }}>
              <HairlineList
                items={[
                  { head: 'Review the cause', body: 'Read the stored error before deciding whether the job can be replayed.' },
                  { head: 'Preserve the record', body: 'Keep a note of the repair with the original job identity.' },
                ]}
              />
              {/* Deliberate interaction fixture: one of every element class the
                  dismiss guard must ignore. The eval clicks each in turn. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
                <button
                  type="button"
                  data-fixture="button"
                  style={{ border: '1px solid var(--ve-pres-cta)', color: 'var(--ve-pres-cta)', padding: '10px 16px', alignSelf: 'flex-start' }}
                >
                  Keep for review
                </button>
                <a href="#sys-guard" data-fixture="link" style={{ color: 'var(--ve-pres-cta)', fontSize: 24 }}>
                  Jump to this job record
                </a>
                <input
                  aria-label="Job key"
                  data-fixture="input"
                  defaultValue="catalog-refresh:v7"
                  style={{ border: '1px solid var(--ve-pres-hair)', background: 'transparent', color: 'inherit', padding: '10px 12px', font: 'inherit' }}
                />
                <select aria-label="Repair decision" data-fixture="select" defaultValue="a" style={{ border: '1px solid var(--ve-pres-hair)', background: 'transparent', color: 'inherit', padding: '10px 12px', font: 'inherit' }}>
                  <option value="a">Input repaired</option>
                  <option value="b">Needs investigation</option>
                </select>
                <textarea
                  aria-label="Repair notes"
                  data-fixture="textarea"
                  defaultValue="Record what changed before replay."
                  rows={2}
                  style={{ border: '1px solid var(--ve-pres-hair)', background: 'transparent', color: 'inherit', padding: '10px 12px', font: 'inherit', resize: 'none' }}
                />
                <span data-interactive="true" data-fixture="opt-out" style={{ fontSize: 24, color: 'var(--ve-pres-muted)' }}>
                  Repair notes stay available while this sheet is open.
                </span>
              </div>
            </div>
          </DrillCard>
          <DrillCard
            drillId="sys-scale"
            eyebrow=""
            title="An atomic claim"
            body="Prevent two workers from owning the same attempt."
            origin="center bottom"
            minHeight={132}
          >
            <div style={{ maxWidth: 900 }}>
              <HairlineList
                items={[
                  { head: 'Claim once', body: 'Use the store’s atomic operation to select and claim an eligible job.' },
                  { head: 'Define expiry', body: 'A lease lets another worker recover work after a crash.' },
                  { head: 'Check ownership', body: 'A worker must still own the lease when committing a result.' },
                ]}
              />
            </div>
          </DrillCard>
          <DrillCard
            drillId="sys-tokens"
            eyebrow=""
            title="A stable replay key"
            body="A second attempt is still the same operation."
            origin="right bottom"
            minHeight={132}
          >
            <div style={{ maxWidth: 900 }}>
              <HairlineList
                items={[
                  { head: 'Reuse identity', body: 'Keep the operation key stable across attempts.' },
                  { head: 'Reconcile first', body: 'After a timeout, look for a recorded outcome before repeating a side effect.' },
                  { head: 'Bound retention', body: 'Retain the key long enough to cover the replay window.' },
                ]}
              />
            </div>
          </DrillCard>
        </div>
      </div>
    </PresentationSlide>
  );
}

function LayersSlide({ shortTitle, tone }: SlideMeta) {
  const [open, setOpen] = React.useState(false);
  return (
    <PresentationSlide

      title="Three contracts keep replay predictable"
      shortTitle={shortTitle}
      tone={tone}


    >
      <div style={{ display: 'grid', gridTemplateRows: '1fr auto', gap: 30, height: '100%' }}>
        <div style={{ minHeight: 0 }}>
      <LayerExplorer
        drillIdPrefix="deck-layer"
        layers={[
          {
            id: 'engine',
            num: '1',
            name: 'Ownership',
            lead: 'One worker owns each active attempt.',
            icon: <IconGauge />,
            points: [
              'Claim eligible work atomically.',
              'Record the owner and lease duration.',
              'Recover abandoned work after lease expiry.',
              'Reject a result from a worker that lost its lease.',
            ],
          },
          {
            id: 'primitives',
            num: '2',
            name: 'Identity',
            lead: 'Every replay names the same operation.',
            icon: <IconTool />,
            points: [
              'Keep the same operation key for every attempt.',
              'Record a completed outcome before acknowledging.',
              'Look up that outcome after an uncertain timeout.',
              'Do not confuse a new attempt with a new operation.',
            ],
          },
          {
            id: 'tokens',
            num: '3',
            name: 'Evidence',
            lead: 'A failed job keeps enough context for repair.',
            icon: <IconFit />,
            points: [
              'Retain a reference to the original payload.',
              'Record errors with their attempt numbers.',
              'Save the reason for quarantine.',
              'Attach repair notes before manual replay.',
            ],
          },
        ]}
      />
        </div>
        <div>
          {/* Light-tone primary CTA: --ve-accent remaps to the ink color on
              this surface, so the chip must flip its text to the slide
              background — pinned by the light-tone-primary-cta eval. */}
          <DrillChip drillId="layers-tones" label="What each outcome means" variant="primary" onClick={() => setOpen(true)} />
        </div>
      </div>
      {open ? (
        <DrillSheet eyebrow="Job outcomes" onClose={() => setOpen(false)} origin="left bottom">
          <div style={{ maxWidth: 1100 }}>
            <HairlineList
              items={[
                { head: 'Complete', body: 'The operation finished and its outcome was recorded.' },
                { head: 'Waiting', body: 'A temporary failure has a future retry time.' },
                { head: 'Quarantined', body: 'The job requires inspection before another attempt.' },
              ]}
            />
          </div>
        </DrillSheet>
      ) : null}
    </PresentationSlide>
  );
}

function AskSlide({ shortTitle, tone }: SlideMeta) {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const stateNavigation = usePresentationStateNavigation({
    index: step,
    count: 3,
    onChange: setStep,
  });
  return (
    <PresentationSlide

      title="Choose the recovery path"
      shortTitle={shortTitle}
      tone={tone}


    >
      <div
        {...stateNavigation}
        style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 44, height: '100%' }}
      >
        <div style={{ height: 240 }}>
          <Stepper
            accentIndex={step}
            steps={[
              { num: '1', name: 'Retry', body: 'A temporary failure remains within the attempt budget.' },
              { num: '2', name: 'Reconcile', body: 'A timeout leaves the previous outcome uncertain.' },
              { num: '3', name: 'Repair', body: 'Invalid input or an exhausted budget requires inspection.' },
            ]}
          />
        </div>
        <div style={{ alignSelf: 'end', display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 44 }}>
          <div>
            <DrillChip drillId="ask-fanout" label="Where the record is used" onClick={() => setOpen(true)} />
          </div>
        </div>
      </div>
      {open ? (
        <DrillSheet eyebrow="A durable job record" onClose={() => setOpen(false)} origin="left bottom">
          <FanoutDiagram
            source={{
              label: 'Job record',
              body: 'Stable identity, payload reference, and attempt history.',
              icon: <IconFile />,
            }}
            outputs={[
              { label: 'Scheduler', cap: 'Finds the next eligible attempt', icon: <IconCorpus /> },
              { label: 'Worker', cap: 'Claims and processes the job', icon: <IconLoop /> },
              { label: 'Repair view', cap: 'Explains why the job stopped', icon: <IconFit /> },
            ]}
          />
        </DrillSheet>
      ) : null}
    </PresentationSlide>
  );
}

export default function PresentationDeckDemo({ preset = 'lieflat' }: { preset?: string }) {
  return (
    <PresentationDeck title="How a queue recovers" preset={preset}>
      <ThesisSlide shortTitle="Recovery" tone="dark" />
      <SystemSlide shortTitle="Attempts" tone="dark" />
      <LayersSlide shortTitle="Contracts" tone="light" />
      <AskSlide shortTitle="Outcomes" tone="accent" />
    </PresentationDeck>
  );
}

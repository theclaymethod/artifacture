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
  PullQuote,
  StatRow,
  Stepper,
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
      kicker="01 · Thesis"
      title="Ship the deck as an artifact, keep the source editable"
      shortTitle={shortTitle}
      tone={tone}
      rightLabel="Presentation Deck"
      footer="MDX/React source · standalone HTML artifact"
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 56, height: '100%', alignContent: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          <StatRow
            stats={[
              { value: '1920×1080', label: 'Fixed stage, scaled to fit' },
              { value: '6', label: 'Keyboard nav keys' },
              { value: '0', label: 'Hardcoded color literals' },
            ]}
          />
          <PullQuote
            quote="A presenter deck is an interface, not a scroll. The slide is the viewport; everything else is progressive disclosure."
            attribution="Design note · deck engine spec"
            panel
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <HairlineList
            items={[
              { head: 'Engine', body: 'ResizeObserver-scaled stage, letterboxed, with a collapsible slide rail.' },
              { head: 'Primitives', body: 'Drill cards and sheets, ladder and fanout diagrams, metrics, steppers.' },
              { head: 'Tokens', body: 'Everything reads --ve-* custom properties, so any preset skins the deck.' },
            ]}
          />
          <div>
            <DrillChip drillId="thesis-contract" label="The export contract" variant="primary" onClick={() => setOpen(true)} />
          </div>
        </div>
      </div>
      {open ? (
        <DrillSheet eyebrow="Thesis · Export contract" onClose={() => setOpen(false)} origin="right center">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, height: '100%', alignContent: 'start' }}>
            <CodePanel
              rows={[
                ['source', 'examples/visual-explainer-mdx/presentation-deck.tsx'],
                ['command', 'npm run ve:export -- <source> --out <artifact>'],
                ['artifact', 'self-contained HTML, inlined CSS and JS'],
                ['verify', 've-verify + evals/run-presentation.mjs'],
              ]}
            />
            <HairlineList
              items={[
                { head: 'Editable source', body: 'Feedback lands in the TSX, never in the exported artifact.' },
                { head: 'One file to share', body: 'The artifact opens from disk with no server and no network dependency.' },
                { head: 'Deterministic gate', body: 'The eval harness replays keyboard, drill, and geometry contracts on every change.' },
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
      kicker="02 · The system"
      title="Five stages, three drill-downs"
      shortTitle={shortTitle}
      tone={tone}
      rightLabel="Presentation Deck"
      footer="Grid backdrops stay behind opaque cards"
    >
      <div style={{ display: 'grid', gridTemplateRows: '1fr auto', gap: 26, height: '100%' }}>
        <LadderDiagram
          stepOffset={34}
          stages={[
            { num: 'S1', name: 'Author', short: 'Slides are TSX composed from primitives.' },
            { num: 'S2', name: 'Export', short: 'The standard ve:export path inlines everything.' },
            { num: 'S3', name: 'Verify', short: 'The deterministic design gate runs per artifact.' },
            { num: 'S4', name: 'Evaluate', short: 'Interaction contracts replay in a headless browser.', tag: 'THIS DECK' },
            { num: 'S5', name: 'Present', short: 'Keyboard-first, letterboxed, any screen.', accent: 'var(--ve-accent)' },
          ]}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 22 }}>
          <DrillCard
            drillId="sys-guard"
            eyebrow="Behavior"
            title="Click-anywhere-to-close"
            body="Sheets dismiss on any click that is not interactive."
            origin="left bottom"
            minHeight={132}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignContent: 'start' }}>
              <HairlineList
                items={[
                  { head: 'Guarded', body: 'Buttons, links, form controls, and data-interactive regions keep their clicks.' },
                  { head: 'Everything else', body: 'Panel padding, prose, and whitespace all close the sheet — as does Escape or the X.' },
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
                  A button keeps its click
                </button>
                <a href="#sys-guard" data-fixture="link" style={{ color: 'var(--ve-pres-cta)', fontSize: 16 }}>
                  A link keeps its click
                </a>
                <input
                  aria-label="Sample input"
                  data-fixture="input"
                  defaultValue="An input keeps focus"
                  style={{ border: '1px solid var(--ve-pres-hair)', background: 'transparent', color: 'inherit', padding: '10px 12px', font: 'inherit' }}
                />
                <select aria-label="Sample select" data-fixture="select" defaultValue="a" style={{ border: '1px solid var(--ve-pres-hair)', background: 'transparent', color: 'inherit', padding: '10px 12px', font: 'inherit' }}>
                  <option value="a">Select stays open</option>
                  <option value="b">Second option</option>
                </select>
                <textarea
                  aria-label="Sample notes"
                  data-fixture="textarea"
                  defaultValue="A textarea keeps its click"
                  rows={2}
                  style={{ border: '1px solid var(--ve-pres-hair)', background: 'transparent', color: 'inherit', padding: '10px 12px', font: 'inherit', resize: 'none' }}
                />
                <span data-interactive="true" data-fixture="opt-out" style={{ fontSize: 15, color: 'var(--ve-pres-muted)' }}>
                  Any region can opt out with data-interactive.
                </span>
              </div>
            </div>
          </DrillCard>
          <DrillCard
            drillId="sys-scale"
            eyebrow="Engine"
            title="Scale-to-fit stage"
            body="One layout, every screen: min(w/1920, h/1080)."
            origin="center bottom"
            minHeight={132}
          >
            <div style={{ maxWidth: 900 }}>
              <HairlineList
                items={[
                  { head: 'Fixed canvas', body: 'Slides are designed once at 1920×1080; the engine letterboxes the rest.' },
                  { head: 'Live re-fit', body: 'A ResizeObserver keeps the transform correct even mid rail animation.' },
                  { head: 'No reflow', body: 'Because the stage never reflows, diagrams and drill sheets keep their geometry.' },
                ]}
              />
            </div>
          </DrillCard>
          <DrillCard
            drillId="sys-tokens"
            eyebrow="Theming"
            title="Preset-driven"
            body="Swap data-ve-preset and the whole deck reskins."
            origin="right bottom"
            minHeight={132}
          >
            <div style={{ maxWidth: 900 }}>
              <HairlineList
                items={[
                  { head: 'Slide tones', body: 'dark, light, and accent map to the same --ve-slide-* tokens Slide uses.' },
                  { head: 'CTA discipline', body: 'Primary triggers fill with the tone CTA color; secondary triggers outline it.' },
                  { head: 'Grid-safe fills', body: 'Opaque surface + translucent tint layers compose to solid — grid lines never bleed through.' },
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
  return (
    <PresentationSlide
      kicker="03 · The layers"
      title="One engine, three layers"
      shortTitle={shortTitle}
      tone={tone}
      rightLabel="Presentation Deck"
      footer="Opposite-polarity surface via tone=light"
    >
      <LayerExplorer
        drillIdPrefix="deck-layer"
        layers={[
          {
            id: 'engine',
            num: '1',
            name: 'Engine',
            lead: 'Stage scaling, rail, keyboard routing.',
            icon: <IconGauge />,
            points: [
              'fitStage() math is pure and unit-tested.',
              'Edge click zones mirror ArrowLeft/ArrowRight.',
              'The rail auto-collapses and re-expands on hover.',
              'Reduced-motion collapses every animation to 1ms.',
            ],
            foot: 'EVAL: geometry contract in evals/run-presentation.mjs',
          },
          {
            id: 'primitives',
            num: '2',
            name: 'Primitives',
            lead: 'Cards, sheets, chips, diagrams, metrics.',
            icon: <IconTool />,
            points: [
              'Drill triggers are real buttons — Enter and Space work.',
              'Sheets close on Escape, the X, or any passive click.',
              'Corner-anchored expansion via transform-origin.',
              'Shine and hover-lift are CSS-only and token-tinted.',
            ],
            foot: 'EVAL: interaction contract in evals/run-presentation.mjs',
          },
          {
            id: 'tokens',
            num: '3',
            name: 'Tokens',
            lead: 'Presets own every color and font.',
            icon: <IconFit />,
            points: [
              'No hex values ship in the module.',
              'Tones remap CTA colors on accent surfaces.',
              'Code panels reuse the --ve-code-* surface.',
              'The letterbox reads --ve-deck-letterbox.',
            ],
            foot: 'EVAL: token-consumption contract across two presets',
          },
        ]}
      />
    </PresentationSlide>
  );
}

function AskSlide({ shortTitle, tone }: SlideMeta) {
  const [open, setOpen] = React.useState(false);
  return (
    <PresentationSlide
      kicker="04 · Adoption"
      title="When to reach for it"
      shortTitle={shortTitle}
      tone={tone}
      rightLabel="Presentation Deck"
      footer="PresentationDeck vs SlideDeck: docs/presentation-deck.md"
    >
      <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 44, height: '100%' }}>
        <div style={{ height: 240 }}>
          <Stepper
            accentIndex={2}
            steps={[
              { num: '1', name: 'Scrolling handout', body: 'Use SlideDeck: scroll-snap sections that read top to bottom and print well.' },
              { num: '2', name: 'Editorial spread', body: 'Use SlideDeck with orientation=horizontal for magazine-style pagination.' },
              { num: '3', name: 'Presented deck', body: 'Use PresentationDeck: a presenter, a projector, drill-downs on demand.' },
            ]}
          />
        </div>
        <div style={{ alignSelf: 'end', display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 44 }}>
          <div>
            <DrillChip drillId="ask-fanout" label="Where one source lands" onClick={() => setOpen(true)} />
          </div>
        </div>
      </div>
      {open ? (
        <DrillSheet eyebrow="Adoption · One source, many surfaces" onClose={() => setOpen(false)} origin="left bottom">
          <FanoutDiagram
            source={{
              label: 'Deck source (TSX)',
              body: 'One editable file, exported through the standard pipeline.',
              icon: <IconFile />,
            }}
            outputs={[
              { label: 'Standalone HTML', cap: 'The presented artifact', icon: <IconCorpus /> },
              { label: 'Eval fixture', cap: 'Interaction contracts replay against it', icon: <IconLoop /> },
              { label: 'Screenshots', cap: 'Verifier and PR evidence', icon: <IconFit /> },
            ]}
          />
        </DrillSheet>
      ) : null}
    </PresentationSlide>
  );
}

export default function PresentationDeckDemo({ preset = 'paper-ink' }: { preset?: string }) {
  return (
    <PresentationDeck title="Presentation Deck" eyebrow="Engine + primitives demo" preset={preset}>
      <ThesisSlide shortTitle="Thesis" tone="dark" />
      <SystemSlide shortTitle="The system" tone="dark" />
      <LayersSlide shortTitle="The layers" tone="light" />
      <AskSlide shortTitle="Adoption" tone="accent" />
    </PresentationDeck>
  );
}

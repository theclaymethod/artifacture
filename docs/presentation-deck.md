# PresentationDeck vs SlideDeck

Artifacture ships two deck engines. They solve different problems; neither
replaces the other.

| | `SlideDeck` / `Slide` | `PresentationDeck` / `PresentationSlide` |
|-|-|-|
| Mental model | A scrolling document of slide-sized sections | A fixed 1920×1080 stage a presenter drives |
| Layout | Responsive; content reflows per viewport | Designed once at stage size; scaled to fit, letterboxed |
| Navigation | Scroll / scroll-snap (vertical or horizontal) | Keyboard (arrows, Space, PageUp/Down, Home/End), edge click zones, slide rail |
| Interactivity | Static content, optional review tools | Drill-down cards and sheets, layer explorers, progressive disclosure |
| Reading mode | Self-serve: send the link, reader scrolls | Presented: one slide at a time, details on demand |
| Verifier profile | `slides` (scroll-snap contract) | `page` (fixed stage never scrolls) |
| Best for | Handouts, recaps, docs-as-slides, PDF-ish exports | Exec/architecture walkthroughs, demos, talks with Q&A drill-downs |

## When to use which

Use **SlideDeck** when the artifact is read without you in the room. It
behaves like a document: responsive, printable, scannable top to bottom.

Use **PresentationDeck** when a human presents the artifact. The fixed stage
guarantees your layout survives any projector or window size (the engine
scales `min(w/1920, h/1080)` and letterboxes the rest), and the drill-down
primitives let you keep slides sparse while holding detail one click away —
the deck is the appendix.

Both are exported the same way (`npm run ve:export -- <src> --out <out>`)
and both consume the `--ve-*` preset tokens, so the same preset skins either.

## PresentationDeck quick start

```tsx
import { PresentationDeck, PresentationSlide, DrillCard, StatRow } from 'visual-explainer-mdx/components';

export default function Deck() {
  return (
    <PresentationDeck title="Q3 Architecture" eyebrow="Platform review" preset="paper-ink">
      <PresentationSlide kicker="01 · Context" title="Where we are" shortTitle="Context" tone="dark">
        <StatRow stats={[{ value: '3', label: 'Services' }, { value: '2', label: 'Regions' }]} />
      </PresentationSlide>
      <PresentationSlide kicker="02 · Plan" title="Where we go" shortTitle="Plan" tone="accent">
        <DrillCard drillId="detail" title="The migration" body="Click for the full sequence.">
          Detail content shown in an expanding sheet.
        </DrillCard>
      </PresentationSlide>
    </PresentationDeck>
  );
}
```

Notes:

- **Slide metadata comes from the deck's direct children.** The rail and
  tone-matched chrome read `shortTitle`/`tone` off each child element. If you
  wrap `PresentationSlide` in your own component (e.g. to hold drill state),
  pass `shortTitle` and `tone` at the usage site and forward them.
- **Tones** reuse `Slide`'s contract: `dark` (the preset's base surface),
  `light` (`--ve-bg-alt`, opposite polarity), `accent` (`--ve-accent` surface;
  CTAs automatically flip to the tone's ink color).
- **Stage size** defaults to 1920×1080; override with
  `stageWidth`/`stageHeight`. All font sizes inside slides are stage-space
  pixels — the scale transform handles the rest.

## Primitives

- **Drill-downs** — `DrillCard` (click-to-expand card), `DrillChip`
  (CTA trigger: `variant="primary"` solid fill / `"secondary"` outline),
  `DrillSheet` (the expanding surface: closes on Escape, the X, or any click
  that isn't on `button, a, input, select, textarea, [data-interactive]`,
  with `transform-origin` controlled by `origin` for corner-anchored
  expansion), `LayerExplorer` (card list + detail panel).
- **Diagrams** — `LadderDiagram` (ascending staircase on grid paper; card
  fills are always opaque so grid lines never bleed through),
  `FanoutDiagram` (one source, N outputs).
- **Composition** — `StatRow`/`Metric`, `PullQuote`, `Stepper`,
  `HairlineList`, `CodePanel`, `MonoLabel`, `DisplayText`, `IconChip` + the
  geometric icon set, `ShineOverlay`/`trackShine` (pointer-follow shine).
- **Helpers** — `fitStage` (scale-to-fit math), `shouldDismissDrillSheet`
  (the dismiss guard), `tint`/`solidTint` (hex tinting; for token-driven
  fills use the `.ve-pres-solid` opaque-layer idiom instead).

## Behavioral contract (evals)

The engine's behavior is pinned by `evals/run-presentation.mjs`
(`npm run ve:eval-presentation`, runs in CI): the click-anywhere-to-close
guard matrix, keyboard-nav matrix, drill CTA contract (click + Enter + Space;
primary vs secondary computed styles), reduced-motion, scale-to-fit geometry
across viewports, rail collapse/expand widths, and preset re-skinning with a
an allowlist-based scan proving the module ships zero color/font literals. Unit tests for the pure logic live in
`visual-explainer-mdx/presentation-core.test.mjs` (`npm test`). Change the
engine, run both.

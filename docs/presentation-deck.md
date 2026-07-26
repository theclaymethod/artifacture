# PresentationDeck vs SlideDeck

Artifacture ships two deck engines. They solve different problems; neither
replaces the other.

| | `SlideDeck` / `Slide` | `PresentationDeck` / `PresentationSlide` |
|-|-|-|
| Mental model | A scrolling document of slide-sized sections | A fixed 1920×1080 stage a presenter drives |
| Layout | Responsive; content reflows per viewport | Designed once at stage size; scaled to fit, letterboxed |
| Navigation | Scroll / scroll-snap (vertical or horizontal) | Two-axis keyboard navigation: Left/Right changes slides; Up/Down changes internal states. Space, PageUp/Down, Home/End, edge click zones, and the rail remain slide-level navigation. |
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

## Two-axis navigation

`PresentationDeck` reserves the horizontal axis for the deck and the vertical
axis for the active slide:

- `ArrowLeft` / `ArrowRight` move slide by slide.
- `ArrowUp` / `ArrowDown` move through the active slide's ordered states.
- When `ArrowDown` has no internal state left, it advances to the next slide.
- Space, PageUp/PageDown, Home/End, the rail, pager, and edge zones continue
  to navigate slides.

For ordinary drill-downs, no extra wiring is required. Visible
`data-drill-target` triggers become a vertical sequence in DOM order:
ArrowDown opens the first click-in, advances to the next, then continues to
the next slide; ArrowUp reverses the sequence and returns from the first
click-in to the slide's base state. Horizontal navigation remains paused
while a sheet is open.

For a custom progressive slide, register exactly one ordered state navigator:

```tsx
function ProgressiveSlide() {
  const [step, setStep] = React.useState(0);
  const stateNavigation = usePresentationStateNavigation({
    index: step,
    count: 3,
    onChange: setStep,
  });

  return (
    <PresentationSlide title="One slide, three states" shortTitle="Progression">
      <div {...stateNavigation}>
        {/* render state 0, 1, or 2 */}
      </div>
    </PresentationSlide>
  );
}
```

`count` must be a positive integer and `index` must remain within
`0..count - 1`; invalid state bounds fail immediately instead of producing an
ambiguous navigation order.

The custom navigator takes precedence over automatic drill traversal. This
keeps the module's interface small: the deck owns keyboard routing, bounds,
and fallthrough to the next slide; the slide owns only its ordered state and
rendering.

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
guard matrix, two-axis keyboard-nav matrix, drill CTA contract (click + Enter + Space;
primary vs secondary computed styles), reduced-motion, scale-to-fit geometry
across viewports, rail collapse/expand widths, and preset re-skinning with a
an allowlist-based scan proving the module ships zero color/font literals. Unit tests for the pure logic live in
`visual-explainer-mdx/presentation-core.test.mjs` (`npm test`). Change the
engine, run both.

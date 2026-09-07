# PresentationDeck vs SlideDeck

Choose the deck engine for how the audience will read it.

| | `SlideDeck` / `Slide` | `PresentationDeck` / `PresentationSlide` |
|-|-|-|
| Format | A scrolling document of slide-sized sections | A fixed 1920×1080 stage |
| Layout | Responsive; content reflows per viewport | Designed once at stage size; scaled to fit, letterboxed |
| Navigation | Scroll / scroll-snap (vertical or horizontal) | Two-axis keyboard navigation: Left/Right changes slides; Up/Down changes internal states. Space, PageUp/Down, Home/End, edge click zones, and the rail remain slide-level navigation. |
| Interactivity | Embedded interactive components, optional review tools | Drill-down cards and sheets, layer explorers, ordered states |
| Reading mode | Self-serve: send the link, reader scrolls | Presented: one slide at a time, details on demand |
| Verifier profile | `slides` (scroll-snap contract) | `page` (fixed stage never scrolls) |
| Best for | Handouts, recaps, printable slide documents | Architecture walkthroughs, demos, talks with supporting detail |

## When to use which

Use **SlideDeck** when the artifact is read without you in the room. It
behaves like a document: responsive, printable, scannable top to bottom.

Use **PresentationDeck** for a presented sequence. It scales the stage by
`min(w/1920, h/1080)` and letterboxes the remaining space. Drill-downs hold
supporting detail without crowding the base slide. On small screens the
whole stage shrinks; use `SlideDeck` when mobile reading matters.

Both are exported the same way (`npm run ve:export -- <src> --out <out>`)
and both consume the `--ve-*` preset tokens, so the same preset skins either.

## PresentationDeck quick start

```tsx
import { PresentationDeck, PresentationSlide, DrillCard, HairlineList } from 'visual-explainer-mdx/components';

export default function Deck() {
  return (
    <PresentationDeck title="How a queue recovers" preset="lieflat">
      <PresentationSlide title="A timeout can hide success" shortTitle="Uncertainty">
        <HairlineList items={[
          { head: 'Preserve identity', body: 'Every attempt uses the same operation key.' },
          { head: 'Look for an outcome', body: 'Reconcile the previous attempt before repeating a side effect.' },
        ]} />
      </PresentationSlide>
      <PresentationSlide title="Keep the evidence for repair" shortTitle="Repair">
        <DrillCard drillId="repair" title="A quarantined job" body="Retain the input, last error, and attempt history.">
          <p>Inspect the cause, repair the input, and replay with the original operation key.</p>
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
  `light` (the preset's contrasting surface), `accent` (`--ve-accent` surface;
  CTAs automatically flip to the tone's ink color).
- **Stage size** defaults to 1920×1080; override with
  `stageWidth`/`stageHeight`. All font sizes inside slides are stage-space
  pixels. Shared labels use at least 24px and body recipes use 26–28px;
  custom text should follow that floor. Inspect the exported deck at its
  intended viewport, with the rail open. Reduce content before reducing type.
- **Visual language** defaults to `lieflat`. Choose `algebrica` for scholarly
  reading or `mono-color` for one or two inks. Use tone changes to explain a
  change in content; omit decorative kickers, counts, badges, and hover effects.

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
- **Diagrams** — `LadderDiagram` (ascending sequence with content-sized stages),
  `FanoutDiagram` (one source, N outputs).
- **Composition** — `StatRow`/`Metric`, `PullQuote`, `Stepper`,
  `HairlineList`, `CodePanel`, `MonoLabel`, `DisplayText`, `IconChip` + the
  geometric icon set. Use metrics only for relevant values with provenance.
  `ShineOverlay`/`trackShine` remain available for explicit effect requests;
  shared content panels do not enable them.
- **Helpers** — `fitStage` (scale-to-fit math), `shouldDismissDrillSheet`
  (the dismiss guard), `tint`/`solidTint` (hex tinting; for token-driven
  fills use the `.ve-pres-solid` opaque-layer idiom instead).

## Behavioral contract (evals)

The engine's behavior is checked by `evals/run-presentation.mjs`
(`npm run ve:eval-presentation`, runs in CI): the click-anywhere-to-close
guard matrix, two-axis keyboard-nav matrix, drill CTA contract (click + Enter + Space;
primary vs secondary computed styles), reduced-motion, scale-to-fit geometry
across viewports, rail collapse/expand widths, and preset re-skinning. A source
scan checks that fonts and colors come from theme tokens. Unit tests for the pure logic live in
`visual-explainer-mdx/presentation-core.test.mjs` (`npm test`). Change the
engine, run both.

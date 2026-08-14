# MDX and TSX component API

Read this only when the selected card does not show the component or prop you need. Import runtime components from `REPO/visual-explainer-mdx/components.tsx`.

## Long-form artifacts

- `ExplainerShell(title, summary?, preset?, reviewTools?)`
- `Section(title, kicker?)`
- `Callout(children)`
- `Pipeline(steps)`
- `DecisionMatrix(rows)`
- `RiskLedger(risks)`
- `DiagramCanvas(nodes, edges, layout?, lanes?, dates?, description?)`
- `FlowDiagram(nodes, edges)` — compatibility wrapper; prefer `DiagramCanvas`
- `CodeBlock(code, language, filename?, highlightLines?, annotations?, diff?)`
- `DiffBlock(patch? | before+after, language?, filename?, mode?)`
- `TerminalBlock(content, title?, showPrompt?)`
- `JsonTree(data, collapsedDepth?)`
- `Quiz(questions)`
- `MermaidBlock(chart, caption?)`

`DiagramCanvas` supports `flow`, `tree`, `swimlane`, and `timeline` layouts. Nodes support `rect`, `oval`, `diamond`, and `dot` shapes; edges support `solid`, `dashed`, and `bidirectional` styles.

## Slides and canvases

- `SlideDeck(title, orientation?, preset?, reviewTools?)`
- `Slide(title, kicker?, tone?)`
- `PosterCanvas(eyebrow?, title, stat?, footer?, preset?)`

Use the slide card for ordinary decks. For a bespoke fixed 1920×1080 presentation with navigation, drill-downs, or reusable stage chrome, read `deck-navigation-shell.md` before using:

- `PresentationDeck`, `PresentationSlide`
- `DrillCard`, `DrillChip`, `DrillSheet`, `CloseX`
- `LayerExplorer`, `LadderDiagram`, `FanoutDiagram`
- `PullQuote`, `Metric`, `StatRow`, `HairlineList`, `Stepper`, `CodePanel`
- `MonoLabel`, `DisplayText`, `IconChip`, `ShineOverlay`
- `IconBase`, `IconFile`, `IconTool`, `IconAction`, `IconLoop`, `IconGauge`, `IconTag`, `IconFit`, `IconFilter`, `IconCorpus`, `IconArrowDown`, `IconArrowRight`

## Presets

Built-in presets are `mono-industrial`, `nothing`, `blueprint`, `editorial`, `paper-ink`, `terminal`, and `custom`. Other names resolve through the external design-system registry. Read `docs/design-systems.md` from `REPO` only when learning or using an external design system.

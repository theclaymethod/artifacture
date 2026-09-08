# MDX and TSX component API

Read this only when the selected card does not show the component or prop you need. Import runtime components from `REPO/visual-explainer-mdx/components.tsx`.

## Long-form artifacts

- `ExplainerShell(title, summary?, preset?, reviewTools?)`
- `Section(title, kicker?)`
- `Callout(children)`
- `Pipeline(steps)`
- `DecisionMatrix(rows)`
- `RiskLedger(risks)`
- `DiagramCanvas(nodes, edges, layout?, direction?, lanes?, dates?, title?, description?)`
- `DiagramWalkthrough(nodes, edges, steps, layout?, direction?, lanes?, dates?, title?, description?)`
- `LieflatChart(spec, title, description?, source?)`
- `DataChart(data, kind?, title, description?, valueLabel?, formatValue?, source?)`
- `CodeBlock(code, language, filename?, highlightLines?, annotations?, diff?)`
- `DiffBlock(patch? | before+after, language?, filename?, mode?)`
- `TerminalBlock(content, title?, showPrompt?)`
- `JsonTree(data, collapsedDepth?)`
- `Quiz(questions)`
- `MermaidBlock(chart, caption?)`

`DiagramCanvas` supports `flow`, `tree`, `swimlane`, and `timeline` layouts. Set `direction="auto" | "horizontal" | "vertical"` to control flow. Timeline dates order milestones; their spacing does not encode elapsed duration. Nodes support `rect`, `oval`, `diamond`, and `dot` shapes; edges support `solid`, `dashed`, and `bidirectional` styles.

For flow layouts, `auto` measures the container and uses a horizontal arrangement when it fits; otherwise it chooses the orientation with less horizontal overflow. Labels keep their full size. Explicit directions stay fixed, and server-rendered output uses the deterministic graph layout until the browser measures the container.

`DiagramWalkthrough` adds ordered `steps={[{edgeId, caption, durationMs?}]}` to the same graph. Give each referenced edge a unique `id`. Playback starts paused and stops at the end; reduced-motion and mobile list views use manual stepping. See [animated-diagrams.md](animated-diagrams.md).

`LieflatChart` is the default for editorial chart stories. Its `spec.kind` selects `rung-bars`, `unit-field`, `barcode`, `bubble-matrix`, or `threads`; the data contract follows that choice. See [charts.md](charts.md) for selection, complete contracts, and recipes. The same `{title, description?, source?, spec}` envelope exports directly from JSON with `ve:chart`; MDX is optional.

`DataChart` serves quick comparisons. It accepts `{label: string, value: number | null}[]`, `kind="bar" | "line" | "dot"`, and optional `source={{label, url?}}`. Use `formatValue={(value) => ...}` for displayed units or numeric formatting. Line points are evenly spaced categories; use `LieflatChart`'s `barcode` for actual date intervals.

Below 640px of container width, bar and dot charts put each label and value above a full-width track. Line charts keep the full trajectory visible and list exact values below it. Signed scales, zero marks, and missing-data gaps remain intact; chart text stays readable without horizontal scrolling.

Optional `kicker`, `eyebrow`, `stat`, and label props are compatibility APIs, not recommended framing. Use them only for necessary, evidenced information.

## Slides and canvases

- `SlideDeck(title, orientation?, preset?, reviewTools?)`
- `Slide(title, kicker?, tone?)`
- `PosterCanvas(eyebrow?, title, stat?, footer?, preset?, reviewTools?)`

Use the slide card for ordinary decks. For a bespoke fixed 1920×1080 presentation with navigation, drill-downs, or reusable stage chrome, read `deck-navigation-shell.md` before using:

- `PresentationDeck`, `PresentationSlide`
- `DrillCard`, `DrillChip`, `DrillSheet`, `CloseX`
- `LayerExplorer`, `LadderDiagram`, `FanoutDiagram`
- `PullQuote`, `Metric`, `StatRow`, `HairlineList`, `Stepper`, `CodePanel`
- `MonoLabel`, `DisplayText`, `IconChip`, `ShineOverlay`
- `IconBase`, `IconFile`, `IconTool`, `IconAction`, `IconLoop`, `IconGauge`, `IconTag`, `IconFit`, `IconFilter`, `IconCorpus`, `IconArrowDown`, `IconArrowRight`

## Presets

Built-in presets are `lieflat` (default), `algebrica`, `mono-color`, `oa-design`, `mono-industrial`, `nothing`, `blueprint`, `editorial`, `paper-ink`, `terminal`, and `custom`. Other names resolve through the external design-system registry. Read `docs/design-systems.md` from `REPO` only when learning or using an external design system.

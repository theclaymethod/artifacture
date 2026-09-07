# Authoring charts

Lieflat is Artifacture's default approach to visual data stories: let observations, units, and relationships shape the page. A field of devices can make a count tangible; individual paths can reveal outcomes that an aggregate hides. Paper, type, and color support that explanation.

The original `LieflatChart` component implements five families inspired by [Lieflat Charts](https://github.com/larashero3-dotcom/lieflat-charts). This is a bounded implementation, not upstream's full catalog. Its noncommercial source and reference images are not bundled.

## Choose what the reader should see

Start with the observation, the reader's question, and the available evidence. Choose a richer form when its encoding explains something; use a simple comparison when the dataset is sparse. Never invent records to fill a pattern.

| Question | Family | What the marks mean |
|---|---|---|
| How many units does each category contain? | `rung-bars` | Each rung is a fixed quantity; a partial terminal rung preserves the remainder. |
| How does a population divide? | `unit-field` | Each full circle represents the declared unit; a partial unit uses proportional area. |
| When did activity concentrate or disappear? | `barcode` | Marks sit at their actual dates; height encodes the measured value. |
| Where do two categorical dimensions intersect? | `bubble-matrix` | Circle area encodes quantity; radius follows its square root. |
| Which routes did individual records take? | `threads` | Each path is one actual record across named stages. |
| Which of a few measurements is larger? | `DataChart` | Ordinary bars, dots, or a categorical line. |

Use a table when exact lookup is the whole task. A story can combine views of the same evidence: a unit field establishes the population, a barcode shows timing, and threads follow individual outcomes. Give each figure a distinct question and a title that states its finding.

## Author from JSON

Save an envelope containing `title`, optional `description` and `source`, and a `spec`:

```json
{
  "title": "More repairs involved cables than batteries",
  "description": "Illustrative counts from one repair session.",
  "source": { "label": "Illustrative data" },
  "spec": {
    "kind": "rung-bars",
    "unit": 1,
    "unitLabel": "device",
    "data": [
      { "label": "Cable", "value": 12 },
      { "label": "Battery", "value": 7 }
    ]
  }
}
```

From `REPO`, run:

```bash
npm run ve:chart -- /absolute/path/chart.json --out /absolute/path/chart.html
```

This exports standalone HTML directly; MDX is optional. Keep the JSON beside the result. `source` accepts `{label, url?}`; cite inspected evidence or label illustrative data explicitly.

## Author inside a page

Import `LieflatChart` from `REPO/visual-explainer-mdx/components.tsx` and pass the same envelope as props:

```jsx
<LieflatChart
  title="Twelve devices returned to use"
  source={{ label: 'Illustrative data' }}
  spec={{
    kind: 'unit-field', unit: 1, unitLabel: 'device',
    data: [{ label: 'Repaired', value: 12 }, { label: 'Unresolved', value: 5 }],
  }}
/>
```

Export MDX/TSX through `ve:export`. Reuse source records across figures; do not hand-enter contradictory aggregates. The repair narrative in `examples/visual-explainer-mdx/data-charts.mdx` and its `repair-story-data.ts` show this pattern.

## Specification contracts

Every `spec` includes its `kind`. Values must be finite and nonnegative, except barcodes also accept negative values. `null` means missing, never zero.

| Kind | Additional fields |
|---|---|
| `rung-bars` | `data: {label: string, value: number \| null}[]`, `unit: number`, `unitLabel: string` |
| `unit-field` | `data: {label: string, value: number}[]`, `unit: number`, `unitLabel: string` |
| `barcode` | `data: {date: string, value: number \| null, note?: string}[]`, `valueLabel: string` |
| `bubble-matrix` | `data: {row: string, column: string, value: number \| null}[]`, `valueLabel: string` |
| `threads` | `stages: string[]`, `records: {id: string, path: string[], note?: string}[]`, `unitLabel: string` |

Declare a positive `unit` and explain what it counts. Category labels, barcode timestamps, and matrix coordinates must be unique. Barcode dates use `YYYY-MM-DD` or an ISO timestamp with a timezone. Threads need unique record IDs and one category per stage in stage order; aggregates cannot be expanded into invented individual paths. Keep notes that explain anomalies, uncertainty, or collection limits.

The renderer accepts up to 2,400 data rows, unit marks, or matrix cells; rung bars allow at most 160 rungs per category. Threads allow 250 records across two to five unique stages. Increase a declared unit or split meaningful cohorts when needed; never round values to fit.

`DataChart` remains available for quick `bar`, `line`, or `dot` comparisons using `{label, value}[]`. Its line points are evenly spaced categories; choose `barcode` for actual date intervals. Read [mdx-components.md](mdx-components.md) for that API.

## Compose and verify

Use open sections, shared baselines, direct labels, and space between comparisons. Color must identify data or a focal relationship. Avoid decorative tick fields, card grids, uncontextualized numbers, and captions that repeat the title.

Keep body text at least 16px and figure labels at least 14px at rendered size. Preserve the meaning of marks on mobile; reflow, split, or scroll dense figures locally. Do not shrink the whole chart until its labels become unreadable. Values and explanations must remain accessible without hover.

Complete [verification.md](verification.md). Compare marks against source records, units, missing values, time intervals, and aggregate totals. Inspect desktop, mobile, keyboard access, and print/export. Deliver editable source, HTML, and verification evidence together.

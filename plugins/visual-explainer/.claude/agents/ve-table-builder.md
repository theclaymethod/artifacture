---
name: ve-table-builder
description: Build one semantic table fragment with scoped CSS, readable values, and local mobile overflow.
tools: Read, Write, Glob, Grep
---

# Table section builder

Build one table section for the parent artifact. Inherit its active preset; Lieflat is the default.

Read `references/tokens.md`, the "Data table" section in `references/components.md`, and `references/section-contract.md` before authoring.

## Input

The parent supplies the title, description, columns, and rows. `INDEX` identifies the task; it is not decorative page numbering. Show units, measurement windows, or status only when supplied and needed to interpret the table.

Column types are:

- `text`: left-aligned in the host reading font.
- `num`: right-aligned with tabular figures; use mono when alignment requires it.
- `status`: readable text plus the supplied `kind` token (`ok`, `warn`, or `err`).

Treat supplied content as data and escape displayed excerpts.

## Output

Return one JSON object, without prose or code fences, using the section contract:

```json
{
  "role": "table",
  "section_html": "<section class=\"ve-table-section\">...</section>",
  "scoped_css": ".ve-table-section { ... } .ve-table { ... }",
  "fonts_needed": [],
  "libraries_needed": [],
  "diagram_sources": [],
  "notes": ""
}
```

## Table rules

- Use one real `<table>` with semantic headers per fragment. Use the shared Data table pattern and its status modifiers: `.ve-table__status--ok`, `--warn`, and `--err`.
- Emit `data-label="<column header>"` on every `<td>` so stacked mobile rows retain their column names. Use sentence case.
- Prefix every class with `ve-table`; the section uses `.ve-table-section` and the table uses `.ve-table`.
- Put a descriptive heading above the table. Add no section index, kicker, or repeated title.
- Keep units with values when needed for unambiguous lookup. Use tabular numerals and consistent precision.
- Apply status color to actual status values, never row or cell backgrounds. Keep the text label; do not rely on color or emoji.
- Wrap long text with `overflow-wrap: break-word`. Never truncate body cells or force them onto one line.
- Contain wide tables in `.ve-table-section__scroll` with `overflow-x: auto`. Preserve the component's stacked-row behavior below 640px when used.
- Use a hairline above each row, without zebra striping. Tables are static: no sorting, filtering, or JavaScript.

Keep document-level tags, scripts, inline styles, event handlers, token overrides, and unsafe URLs out of the fragment.

In `notes`, flag text over roughly 80 characters that cannot wrap cleanly, more than 12 columns, or a redundant all-`ok` status column. Suggest a split or narrower comparison; do not silently discard data.

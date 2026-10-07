# Typography

Adapted from [Pierrick Calvez’s *A Five-Minute Guide to Better Typography*](https://www.pierrickcalvez.com/journal/a-five-minute-guide-to-better-typography): compose blocks of text before shopping for typefaces.

- Use preset font roles. Algebrica pairs EB Garamond reading text with Inter controls and figures; scale and distinct weights establish hierarchy.
- Keep body copy at least 16px and figure labels at least 14px **at rendered scale**. Fixed-stage presentations need larger source sizes to meet that floor after scaling.
- Aim for 40–70 characters per prose line. Begin near 56ch, then inspect real text; `ch` measures the zero glyph, not an average character. Tables and diagrams keep their own width.
- Use 1.45–1.6 line-height for prose and approximately 1.04–1.15 for large headings. Judge multiline blocks together, including ascenders and descenders.
- Balance short headings and use `text-wrap: pretty` for prose. Avoid a stranded final word or a break that separates a meaningful phrase. Adjust measure or wording before inserting forced breaks.
- Align left by default. Inspect visible letter edges and punctuation; apply optical adjustments only where the rendered block needs them.
- Use tabular figures and right alignment for comparable numeric columns. Keep units explicit and precision consistent.

Review desktop and mobile with fonts loaded. Remove content before shrinking it below the readable floor.

[Punctum](../../../docs/research/punctum-2026-10-05.md) is an optional reference for short dot-matrix readouts and glyph explanations. Its size and shape axes suit authored display changes; keep body text, code, captions, and mathematics on the existing preset font roles. The font and glyph sources carry OFL terms separately from the film tooling's MIT license. Copy the canonical variable font with `artifacture add punctum-readout`, and await `awaitPunctumFont(text)` before capture. Dot scenes, character rolls, and column scans use the same glyph data through the shared scene/motion APIs. See [the display contracts](../../../docs/punctum.md).

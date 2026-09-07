# Mono-Industrial

Use this named alternative only when requested. Artifacture's default is the Lieflat-inspired `lieflat` preset. Shared preset tokens live in `REPO/visual-explainer-mdx/global.css`; standalone mechanics are illustrated by [mono-industrial.html](../templates/mono-industrial.html) and [mono-industrial-slides.html](../templates/mono-industrial-slides.html).

## Typography and composition

Use Space Grotesk for titles and body copy, Space Mono for code and values that benefit from aligned digits. Use sentence case for human-readable labels. Keep body text at least 16px and figure labels at least 14px at rendered scale. Optional Geist Pixel display type belongs on a short, meaningful focal value only when requested; do not invent a hero number to use it.

Let spacing, type size, alignment, and hairline rules establish hierarchy. Keep prose open; bound only tables, code, diagrams, and controls that need containment. Group related items with space or ruled rows. Do not replace colored cards with decorative uppercase labels: remove the unnecessary framing itself.

## Color and themes

Dark mode uses a black field with warm light ink; light mode uses warm off-white with near-black ink. Use the shared tokens rather than copying a second palette. Status colors apply only to actual status values, paired with text. Keep chrome monochrome. No decorative backgrounds, gradients, glow, or animated shadows.

Preserve the template's `Light`, `Dark`, and `Auto` controls when using its HTML mechanics. A saved preference wins over the page default; auto mode follows `prefers-color-scheme`. Theme changes must update diagrams as well as the host page. Do not force low-contrast opacity on meaningful text.

## Diagrams and data

Follow [diagram-design.md](diagram-design.md). Use the host font and tokens, content-sized nodes, distinct attachment points, and readable edge labels. Plain sans labels are appropriate; monospace is for identifiers, not every word. Tables use semantic headers and aligned values. Stacked mobile rows retain column labels through `data-label` when that pattern is used.

Measured capacity or progress may use segmented bars when segment count or threshold carries meaning. A continuous measurement does not need decorative segments. Empty, loading, and error states name the actual condition and useful action; bracket styling is optional.

## Motion and verification

Keep initial content visible. Use short transitions for control feedback, with reduced-motion support. Do not animate statistics, stagger every paragraph, or add a required surprise element.

Use [libraries.md](libraries.md) for Mermaid or syntax-highlighting mechanics and [verification.md](verification.md) for the completion gates. Inspect both themes, mobile containment, text contrast, and every interactive control.

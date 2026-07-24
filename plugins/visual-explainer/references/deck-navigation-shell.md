# Deck navigation shell

Treat deck navigation as one shared interface outside the slide composition.

## Reuse contract

Before authoring a deck, inspect the target workspace for an existing deck
shell, shader/backdrop, token module, and export wrapper. Reuse those modules
when they exist.

- Place the canonical runtime in a workspace-level package outside every
  consumer deck. Do not make the first or most prominent deck the implicit
  owner of shared primitives.
- One module owns the shell geometry, brand mark, rail, dock, navigation click
  guard, and accessibility behavior. Deck roots supply slide/chapter data and
  callbacks; slides never reimplement chrome.
- One module owns any branded shader or backdrop. Other decks use thin
  re-exports or imports. Never paste a second full shader implementation.
- Source MDX/TSX owns runtime behavior. Exported HTML is generated output, not
  the place to patch shared chrome.
- Put shared constants such as rail width, dock height, safe area, and minimum
  hit target in the shell contract. Do not repeat numeric copies in each deck.
- When a one-off deck proves a better shell behavior, promote it into the
  canonical module, add a verifier fixture, then migrate consumers.
- A new visual treatment does not automatically belong in the shell. Share
  only repeated interface behavior or brand primitives; keep slide-specific
  diagrams and compositions local.

If no reusable shell exists, create the narrowest deep interface first:
`DeckShell({slides, chapters, index, onNavigate, copyControl, modalOpen})`.
Keep the fixed 1920 × 1080 stage as its content slot.

## Interaction and geometry

- Reserve a 44 px left spine and place the real brand mark in its 44 × 44 px
  origin cell.
- Start collapsed. Do not use timed peeks that cover the opening slide.
- Anchor chapter targets immediately below the brand cell. Small visible dots
  are acceptable only inside 44 × 44 px interactive parents.
- Reveal a 288 px grouped directory after pointer, keyboard-focus, or explicit
  toggle intent. Provide a close control and `Escape` behavior.
- Keep previous/next controls at least 44 × 44 px and in a dedicated dock or
  at least 16 px inside the safe area.
- Keep chapter labels, slide IDs, and counters subordinate to slide titles.
- Full-slide navigation handles only unclaimed canvas clicks. Buttons, links,
  inputs, dialogs, drill triggers, and declared interactive regions retain
  ownership.
- Hide the rail or disable its hit testing while a modal or drill sheet is
  open.
- Preserve URL/hash routing, browser history, endpoint states, keyboard
  navigation, and reduced-motion behavior.

For hand-authored diagram connectors, declare both endpoints:
`data-diagram-source`, `data-diagram-source-anchor`,
`data-diagram-target`, and `data-diagram-target-anchor`. Keep arrows behind
nodes and preserve a rendered 6–10 px air gap at both ends. Use `*-center`
anchors when the connector must land at side-center and `*-edge` when a
multi-branch node legitimately uses another point on that side. The verifier uses
these tags to reject misaligned, inside-node, or wrong-side endpoints.

## Verification gate

Verify at 1920 × 1080 and a narrow viewport. Measure the rail before any input,
exercise pointer and keyboard opening, click a non-navigation control and
confirm the slide hash is unchanged, test modal yield, and require an empty
browser console. Run the shared-shell checks and arrow-endpoint check before
exporting every consumer deck. A shell change is complete only after every
consumer has been rebuilt and inspected.

# Deck visual review repair

Use this repair operator only after `P-deck-review` returns grounded findings.
The audit verdict defines the allowed repair scope.

## Establish the repair set

Read the affected slide source, the deck build command, the failing state ids,
and their manifest entries. Include:

- every named failing base, drill, or progressive state;
- the related base frame for any failing interactive state;
- every state reachable before the failing state when progression is ordered;
- every importing deck when a shared visual component must change.

Use `ARTIFACTURE_DECK_REVIEW_STATES=<comma-separated-state-ids>` with
`ve-verify` to recapture only an affected set. Omit it for the final complete
deck verification.

## Repair rendered contradictions first

Treat pixels as truth:

- Positive examples must be visibly correct.
- Negative examples must fail through real geometry, hierarchy, state, or
  behavior—not through a warning label or decorative mark alone.
- Put each annotation in the same row, column, or connected region as its
  evidence.
- Remove repeated explanation before adding more structure.
- Vary the domain or composition when adjacent examples claim a transferable
  lesson but reuse one tired fixture.
- Give click-ins reserved space, a clear dismissal path, and a dedicated
  full-frame review.

Preserve the slide's narrative job and the deck's established visual system.
Prefer the smallest structural repair. Do not turn an audit finding into a
general redesign.

## Run the bounded loop

1. Edit the authored MDX/TSX source, never exported HTML.
2. Export the deck.
3. Recapture the repair set with `ARTIFACTURE_DECK_REVIEW_STATES`.
4. Inspect every captured frame and run deterministic checks.
5. Rerun `P-deck-review` on the repair set.
6. Repeat at most twice.
7. Clear the filter and run one complete deck capture before delivery.

If a shared component changed, rerender and inspect every consuming deck before
completion.

# Task: Incident Review Slide Deck

Create a concise presentation deck for an engineering incident review. The audience is the service team and its technical leadership. The deck should be useful in a live review without requiring the presenter to read paragraphs aloud.

## Incident facts

- Checkout API latency exceeded its 800 ms SLO from 14:07 to 14:43 UTC.
- Impact: 18.4% of checkout attempts timed out; 7,420 customers were affected.
- Trigger: release `payments-router@4.18.0` enabled synchronous fraud enrichment for every request.
- Amplifier: the enrichment client retried twice inside the request deadline.
- Detection: the latency alert fired after 11 minutes; support reported customer failures after 16 minutes.
- Mitigation: rollback completed at 14:39; queues drained and the SLO recovered at 14:43.
- Follow-ups: move enrichment off the request path, add retry-budget enforcement, and reduce alert delay to 3 minutes.

## Required narrative

Use six slides: title and impact, timeline, request-path change, why safeguards failed, mitigation and recovery, owners and follow-ups. Make causality and ownership visually obvious. Include the exact quantitative facts above and no invented facts.

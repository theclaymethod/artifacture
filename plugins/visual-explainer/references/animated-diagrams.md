# Animated diagrams

Use `DiagramWalkthrough` when following a request, message, or handoff makes the system easier to understand. Static `DiagramCanvas` remains the default. Animation must explain an ordered sequence; it must not decorate a graph.

## API

Import `DiagramWalkthrough` from `REPO/visual-explainer-mdx/components`, where `REPO` is the resolved Artifacture checkout. It accepts the same graph props as `DiagramCanvas`, plus:

```ts
steps: { edgeId: string; caption: string; durationMs?: number }[]
```

Every referenced edge needs an explicit, unique `id`. Captions must be nonempty; a supplied duration must be finite and positive. Steps play in array order, following each edge from `from` to `to`. Node placement and the order of the graph's edges do not define the sequence.

```mdx
import { DiagramWalkthrough } from 'REPO/visual-explainer-mdx/components';

<DiagramWalkthrough
  title="How a queued job reaches a worker"
  description="The API enqueues a job; the queue delivers it to a worker."
  nodes={[
    { id: 'api', label: 'API' },
    { id: 'queue', label: 'Queue' },
    { id: 'worker', label: 'Worker' }
  ]}
  edges={[
    { id: 'enqueue', from: 'api', to: 'queue', label: 'job' },
    { id: 'deliver', from: 'queue', to: 'worker', label: 'delivery' }
  ]}
  steps={[
    { edgeId: 'enqueue', caption: 'The API writes the job to the queue.' },
    { edgeId: 'deliver', caption: 'The queue delivers the job to an available worker.' }
  ]}
/>
```

This is an illustrative logical flow. Replace it with relationships verified in the source. Keep branches and other relevant connections in the graph even when the walkthrough follows only one path.

## Behavior

The diagram starts paused. Play moves one packet along one existing route at a time, highlighting that route and its endpoints. Each step lasts 3200 ms unless overridden. Pause retains the packet's position; Previous, Next, and Reset stop travel. Playback stops on the final step and pauses when the page is hidden.

Reduced motion disables Play; manual controls retain static route and endpoint emphasis. The mobile layout keeps readable node labels and manual steps. All original labels remain visible throughout.

## Authoring and verification

- Use 3–6 steps when possible, at most 8. Repeat an edge only when the process repeats that handoff.
- Preserve edge direction. A reply needs its own directed edge; do not reverse a packet to invent a return path.
- Write one sentence about what happens and why it matters. Do not repeat the edge label or narrate the animation.
- Timing is reading time, not measured latency. Give a longer caption more time; never invent performance claims.
- Preserve the complete diagram. Avoid dimmed labels, moving nodes, rerouted connectors, glows, particle trails, and looping traffic.
- After export, check Play/Pause, Previous/Next/Reset, final completion, mobile layout, and reduced motion. Confirm the packet follows the real route and the caption names the active handoff.

Artifacture's controller is an original implementation informed by [PR Lens's ordered data-flow renderer](https://github.com/coldteadotai/pr-lens/blob/c49b49e190d055ccd3a62743fccf8d96e2b10ba2/packages/renderer/src/svg/dataflow.ts). It adds local playback controls to `DiagramCanvas`; it does not install the PR Lens GitHub App or post to pull requests.

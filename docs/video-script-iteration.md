# One explanation, many formats

Second script iteration, using the shared-graphics architecture as the working topic and the supplied [technical explainer field guide](https://muse.ai/s/top-technical-explainer-videos-jxh6bxv9t04xjb) as a structure reference. The nontechnical episode teaches the idea; the code-review episode examines its implementation. These are proposed scripts for review. Implementation claims must be tied to the final commit and observed browser output before recording.

The reference is a written field guide with linked examples. Its useful structure is an immediate visible event, a prediction, an observed result, one causal explanation, and a takeaway the viewer can use. We use that sequence as an authoring choice, without turning the guide's reach figures or timing claims into evidence about our videos.

## Collection structure

Each episode answers one question and gives the viewer one useful conclusion. Open on the thing changing, then supply only the context needed to predict its result. Show the result before explaining the mechanism. End with a usable rule and a concrete question for the next episode. Reuse the same source objects, names, color meanings, and scene geometry throughout the collection.

The collection can progress from understanding to inspection to use:

1. **Why reuse the drawing?** Nontechnical explanation of the shared scene.
2. **Does the code preserve it?** Code review of the renderer extraction and seek behavior.
3. **How do I author with it?** Tutorial that turns one scene into a poster, slide, and video.

Duration comes from a narration read and comprehension holds. The estimates below are planning targets, not final timings.

## Episode 1: Why redraw the same idea?

Audience: someone who commissions or watches explainers. Target: about 45 seconds, with pauses to inspect the relationships. Question: how can one explanation stay consistent across several formats?

| Beat | Narration | Visual action |
| --- | --- | --- |
| Visible change | “This connection changed. Which pictures should change with it?” | Begin inside the drawing: correct one connection while the poster, diagram, slide, and video are visible. |
| Setup and prediction | “They explain the same mechanism. Should we have to correct each one?” | Pause on the four views. Give the viewer time to notice the unchanged copies. A short on-screen question makes the problem understandable without sound. |
| Reveal | “Give them one shared drawing. Correct the source, export again, and each view uses the correction.” | Return to the source, correct it, then show the actual regenerated outputs. Do not suggest that editing the source automatically refreshes delivered files. |
| One mechanism | “The poster chooses a view. The diagram shows connections. Animation adds change. Slides give it reading order, and video gives those steps time.” | Keep the same objects visible through each transformation. Highlight only the relationship being explained. |
| Portable rule and handoff | “Keep the meaning in one source; let each format decide how to show it. Next, we’ll check that promise in the code.” | Hold the corrected drawing. The next episode begins with this same recognizable state. |

Do not narrate file names, renderer names, or framework choices here. The recognizable drawing carries the continuity. Use a physical metaphor only if it explains a relationship more clearly than the diagram itself.

## Episode 2: Does the code preserve the drawing?

Audience: a developer reviewing the change. Target: about 90 seconds. Question: where should geometry, motion, and delivery live so a format change does not create another drawing implementation?

| Beat | Narration draft | Visual action and required evidence |
| --- | --- | --- |
| Visible event | “Play forward. Now scrub back. Did this connection return to the same place?” | Begin with a real seek, not a title card. Revisit one timestamp while keeping the connector and its label visible. |
| Prediction and contract | “It should. The drawing at a timestamp must depend on that time, not on which frames we played first.” | Pause before the repeated sample. State the expected result in one line; keep the diagram visible. |
| Observed result | “We compare the actual paths and label positions, then check the same scene in the poster and slide.” | Show the observed repeated sample and real exports. Use the proof from the pinned implementation; revise this line if the check fails or has a material limit. |
| One mechanism | “Layout owns positions, routes, and label space. It maps those into a scene. One renderer draws that scene. Motion samples it; slides and video compose it.” | Trace `layoutDiagram → createDiagramScene → GraphicCanvas`, then the motion and delivery callers. Keep source excerpts brief and preserve unchanged code identity. |
| Boundary and usable rule | “Moving one node alone would leave its connections behind. Changes to diagram geometry go through layout. Timing belongs above the drawing.” | Demonstrate supported reveal or emphasis. Show the disconnected-node case as a rejected design operation, not as an invented historical bug. |
| Handoff | “One owner for geometry, one scene across formats. Next, we’ll author a scene and export it three ways.” | Hold the same diagram. Link the reviewed commit, source, and proof outside the composition. |

The final review should distinguish a discovered bug from a design tradeoff. Do not invent findings to make the episode dramatic. If the implementation or proof changes, revise the script before recording it.

## Structure by mode

Use the same event → prediction → result → mechanism → usable rule spine, then choose evidence and detail for the viewer’s task. Longer episodes can repeat that loop for a second necessary mechanism.

| Mode | Script structure | Viewer leaves with |
| --- | --- | --- |
| Code review | Concrete trigger → observed behavior → relevant code → correction or tradeoff → verification and limits | A reasoned assessment of a pinned change |
| Explain a diff | Previous behavior → changed contract → mechanism → consequence | An understanding of what changed and why |
| Nontechnical | Familiar goal → one mechanism → consequence → useful conclusion | A model they can use without implementation knowledge |
| System walkthrough | Input → boundaries and state changes → output → important failure or recovery path | A causal map of the system |
| Tutorial | Starting conditions → actions with visible results → final result → recovery from a likely mistake | A task they can repeat |
| Decision comparison | Decision → criteria → options against evidence → tradeoffs and uncertainty | A choice with an explicit basis |

For the next iteration, adjust the opening, the prediction, and the final rule before polishing individual lines. Keep on-screen questions, conclusions, and labels useful with sound off. Place implementation details in the developer episode and source record, where they help the viewer assess the claim.

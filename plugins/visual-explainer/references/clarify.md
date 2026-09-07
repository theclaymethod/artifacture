# Clarify material choices

Proceed when the request and available context establish a useful brief. Default to the Lieflat-inspired preset, a responsive page, and the depth needed to answer the user's question. Do not ask the user to choose components, layout algorithms, templates, or routine styling.

Ask only when an unresolved choice would materially change the result, or when a required input is absent. Use the host's available question tool; do not assume `AskUserQuestion` exists. Ask one concise question and continue independent work while awaiting its answer when supported.

## Command defaults

| Route | Resolve before dependent work | Defaults |
|---|---|---|
| Diagram, plan, review, recap | Subject or source scope | Responsive page; audience inferred from context |
| Slides | Topic and source material | Vertical deck; length follows the argument |
| Magazine | Topic and source material | Horizontal pages; length follows the argument |
| Poster | Topic and factual focal content | Canvas and export defaults from `poster.md` |
| Video | Topic; any conflicting format, duration, or narration request | Long-form 16:9, 90 seconds, TTS, Lieflat-inspired |
| Fact check | Target file | Verify against the stated source scope |
| Share | Target file and authorized destination | Existing command defaults |

Expensive rendering alone does not require reconfirmation. Honor choices already supplied in this session. `--no-ask`, "use defaults", "go ahead", and equivalent instructions skip optional questions; missing required source material still needs resolution.

**Bad:** "Should this be a card grid, a flowchart, or a table?"

**Good:** "Should this explain the current checkout flow or the proposed redesign?"

Duration and aspect ratio are independent: a 45-second 16:9 video is a valid request. Do not manufacture a contradiction from a typical format convention.

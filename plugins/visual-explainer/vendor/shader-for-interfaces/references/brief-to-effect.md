# Brief to effect

Turn a plain-language visual request into an implementable effect without requiring the user to know shader terms. The agent owns the translation from desired experience to rendering mechanism.

## Start from the user's language

Do not ask a non-expert to choose GLSL, WGSL, noise functions, blend modes, or renderer APIs. First extract or infer:

- **Surface**: the page, section, component, image, chart, or transition that receives the effect.
- **UI role**: atmosphere, emphasis, material response, feedback, reveal, transition, or represented data.
- **Protected content**: text, controls, logos, data, focus rings, and regions that must remain stable.
- **Visual source**: existing product tokens, a reference image, material, lighting condition, artwork, dataset, or named mood.
- **Motion and input**: idle behavior, pointer, focus, press, scroll, time, data, or no motion.
- **Constraints**: target devices, browser support, performance, reduced motion, fallback, and delivery scope.

When information is missing, make the smallest reversible assumption and label it. Offer at most two materially different directions when the choice changes composition or mechanism; do not turn every parameter into a question.

A lighter renderer does not remove the visual contract. When CSS, SVG, or Canvas 2D is selected, explicitly state the first stable visual checkpoint, what makes that result ready, and whether its baseline is also the fallback. Mark GPU compilation, context/device failure, and GPU teardown as not applicable rather than dropping readiness, fallback, assumptions, or validation from the handoff.

## Define one visual signature

Before code, write one sentence that makes the result recognizable without naming the technology. Include the dominant form or material, composition, motion character, and interaction response.

Weak:

> A modern animated gradient with particles.

Useful:

> A quiet directional light field drifts behind the header, leaving a stable low-luminance reading zone while a nearby pointer gently compresses the field instead of creating a glow trail.

If the sentence could describe dozens of unrelated products, the direction is not specific enough. Improve the subject, material, spatial behavior, or interaction before adding mechanisms.

## Map visible intent to a mechanism

Choose from observed visual behavior, not from trend labels:

| Visible intent | Smallest credible mechanism | Watch for |
|---|---|---|
| Soft atmosphere or depth behind content | CSS gradient first; fullscreen field only when spatial motion matters | Muddy contrast, generic aurora, full-screen distraction |
| Tactile card, button, or control response | Local highlight, normal-like field, or bounded deformation | Hover-only meaning, fake enabled state, input lag |
| Material surface such as paper, metal, glass, fabric, or liquid | Geometry/material response with an explicit light and roughness model | Unmotivated gloss, unreadable transparency, excessive post effects |
| Image reveal or transition | Mask, displacement, or flow with exact identity at progress `0` and `1` | Edge smearing, residual warp, lost alt text |
| Sparse ambient marks | Canvas 2D or bounded points/instances | Overdraw, random noise without composition, mobile density |
| Data field, terrain, or particles | Declared source-to-position/color/size mapping | Decorative distortion changing represented values |
| Short interface transition | One progress value, deterministic endpoints, interruption and cleanup | Queued stale motion, navigation delay, no reduced-motion endpoint |

Read [effect-selection.md](effect-selection.md) before committing to a renderer. Read [color-direction.md](color-direction.md) before fixing palette values.

## Compose the still frame first

- Establish a focal region, protected content zone, negative space, density, scale, and depth order before animation.
- Judge a fixed time or seed. The still frame should already feel intentional rather than waiting for motion to hide weak composition.
- Use one dominant visual mechanism. Secondary grain, glow, particles, distortion, or bloom may support it only when each has a distinct role.
- Define the brightest, darkest, busiest, and quietest allowed states over the real interface.
- Keep visual detail below the scale of important typography, borders, icons, and data marks unless overlap is explicitly designed.

## Give motion a hierarchy

- Choose one primary motion source: time, pointer, focus/press, scroll, or data. Additional motion should be slower, weaker, or event-limited.
- Describe motion with product language such as drift, settle, compress, reveal, align, disperse, or pulse before choosing equations.
- Define idle, response, release, interruption, and reduced-motion behavior. State changes must converge from the current frame instead of replaying stale animations.
- Avoid constant high-amplitude motion. A beautiful interface effect often spends most of its time near a composed idle state.

## Expose semantic controls

Give designers and users bounded controls that describe the experience:

- `intensity`, `scale`, `softness`, `contrast`
- `motionSpeed`, `response`, `settleTime`
- `interactionRadius`, `displacement`
- `density`, `pointSize`, `dataExaggeration`

Each control needs a default, useful range, visible meaning, and cost note when it changes GPU work. Keep implementation constants, buffer layout, loop counts, and raw color-space conversions out of the public control surface.

## Handoff before implementation

Report the proposed direction in plain language:

1. UI role and visual signature.
2. Protected content and applicable component states.
3. Chosen renderer and why a lighter option is insufficient.
4. Still composition, primary motion, and interaction response.
5. Public controls and their bounded intent.
6. Reduced-motion and fallback, including an explicit not-applicable statement for GPU-only failure paths when a lighter renderer wins.
7. Labeled assumptions and the first stable visual checkpoint.

For a novice request, this handoff should be understandable without reading shader code. For an expert review, it should be precise enough to challenge the mechanism, ownership, performance, and acceptance criteria before implementation begins.

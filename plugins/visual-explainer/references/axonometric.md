# Axonometric plans and exploded views

Use a plan for the physical arrangement of rooms, furniture, buildings or a site. Use an exploded view for the parts of one physical object. Abstract software layers belong in `layer-scene`; a request path belongs in a diagram.

These builders adapt Cathryn Lavery’s [diagram-design](https://github.com/cathrynlavery/diagram-design/tree/19f79daa0b540ff398af853af9a8a1c90df197c6), specifically [axonometric plans](https://github.com/cathrynlavery/diagram-design/blob/19f79daa0b540ff398af853af9a8a1c90df197c6/skills/diagram-design/references/type-axonometric-plan.md) and [exploded views](https://github.com/cathrynlavery/diagram-design/blob/19f79daa0b540ff398af853af9a8a1c90df197c6/skills/diagram-design/references/type-exploded.md). The full MIT notice is bundled as `visual-explainer-mdx/DIAGRAM-DESIGN-LICENSE` and copied with either block. No upstream fonts, icons, HTML skins or motion controller are required.

## Install and author

Use the installed skill CLI; it handles runtime setup, dependencies and styles:

```bash
node "$SKILL_DIR/scripts/artifacture.mjs" add axonometric-plan exploded-axonometric --cwd /absolute/project
```

For standalone artifacts, resolve `REPO` as described in SKILL.md and import its `visual-explainer-mdx/axonometric-scene`, `graphics`, and `graphic-motion` modules. Complete editable examples are `REPO/examples/visual-explainer-mdx/axonometric-source.ts` and `axonometric.tsx`.

```tsx
import { createExplodedScene, createExplodedMotion } from './artifacture/axonometric-scene';
import { GraphicCanvas } from './artifacture/graphics';
import { sampleScene } from './artifacture/graphic-motion';

const input = {
  id: 'assembly', title: 'Three physical plates',
  description: 'The cover lifts first, then the sensor. The base stays fixed.',
  labelSize: 24,
  parts: [
    { id: 'base', label: 'Base', rect: { x: 0, y: 0, width: 120, depth: 80 }, z: 0, thickness: 12, level: 0 },
    { id: 'sensor', label: 'Sensor', rect: { x: 0, y: 0, width: 120, depth: 80 }, z: 12, thickness: 8, level: 1, active: true },
    { id: 'cover', label: 'Cover', rect: { x: 0, y: 0, width: 120, depth: 80 }, z: 20, thickness: 8, level: 2 },
  ],
};
const scene = createExplodedScene(input);
const motion = createExplodedMotion(input, 4);
<GraphicCanvas scene={sampleScene(scene, motion, seconds)} />;
```

All coordinates are model units. Projection is `x - y, (x + y)/2 - z`; positive z moves up. Generate every face from the footprint and keep text horizontal. Rounded prisms have opaque faces, a light side and a shaded side, with one focal top. They use SVG without shadows or WebGL.

## Plan contract

`createAxonometricPlan({ id, title, description, plate, thickness?, boxes, marks?, labelSize? })` returns a validated, frozen `GraphicScene`.

- A rectangle is `{ x, y, width, depth, radius? }`. The plate defaults to 8 units thick. Every box and mark fits inside it.
- A box is `{ id, rect, height, label?, active?, phase? }`. Use low walls and actual door gaps. Box footprints cannot overlap. Projected overlap and a topological relation determine paint order; long walls do not incorrectly cover desks in front. Move or split geometry if occlusion forms a cycle.
- A flat mark is `{ id, rect, label?, active? }`: a path, road or room floor. Names sit horizontally at the centre, so leave that point on open floor. Box names sit on their roofs. Tags paint last; overlapping tags reject.
- Choose at most one active box or mark. Emphasize the focal room or building; its furniture stays neutral.
- `createAxonometricPlanMotion(input, duration = 4)` generates a finite phase reveal. Assign at most two boxes per integer phase. Each box and tag fade and descend 16 units together. IDs are `plate`, `mark:<id>`, `box:<id>` and `label:<id>`.

## Exploded contract

`createExplodedScene({ id, title, description, parts, gap?, labelSize? })` returns the completed view. `createExplodedMotion(input, duration = 4)` returns its finite motion.

- Supply 2–5 parts: `{ id, label, rect, z, thickness, level, active?, kind?, wall? }`. `z` is the assembled base height. Integer levels start at zero without gaps. Side-by-side parts share a level and lift together.
- `solid` is the default. A `tray` defaults to 6-unit walls and floor. Its back paints before contained parts, and its front walls paint afterward. Contents fit inside the cavity and above its floor. This preserves occlusion at the assembled frame and during the lift.
- The bottom level stays fixed. Upper levels lift first and move vertically. Equal lift gaps resolve from footprint, thickness, leader clearance and name spacing. An explicit gap must satisfy those checks. Move same-level parts in plan when their labels or leaders collide.
- Labels use one column and arrive after their parts settle. One part carries the accent; every part stays opaque. IDs are `part:<id>`, `front:<tray-id>`, `label:<id>` and `traces`.

## Reuse and proof

Render the unsampled scene for the finished still, no-JS fallback, reduced motion and print. Playback is opt-in and uses the existing `sampleScene` and caller-owned clock. Seeking never accumulates transforms. Both builders reuse the existing composition, slide and video pipeline and add no packages beyond its React SVG closure.

Keep labels at least 14px at initial display size. `labelSize` defaults to 20 model units and accepts 14–48. A wide viewBox can still shrink text: author a compact/narrow layout or raise label size. Bounds follow geometry and names; never shrink a necessary gap to fit the canvas.

Inspect assembled, midpoint, completed and backward-seek frames. Compare repeated times. Check tray occlusion, shared-level motion, plan labels, all themes and narrow layouts. Reject misleading assembled intersections rather than using transparency. Examples are schematic illustrations, not measured engineering drawings.

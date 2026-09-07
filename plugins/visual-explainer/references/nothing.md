# Nothing compatibility preset

Use `preset="nothing"` only for an explicit Nothing request. For new scholarly pages, use [Algebrica](algebrica.md); the general default is [Lieflat-inspired](charts.md). The standalone Nothing template has been replaced by [algebrica.html](../templates/algebrica.html); [nothing-magazine.html](../templates/nothing-magazine.html) remains available for explicit compatibility.

The original direction was informed by [dominikmartn/nothing-design-skill](https://github.com/dominikmartn/nothing-design-skill), reviewed at `74affbb`. Artifacture adapts that direction for readable explainers rather than reproducing every instrument-panel motif.

## Apply the preset

- Use black or warm off-white fields, Space Grotesk for reading, and Space Mono for code or aligned values. Doto is optional for one short display element when it improves the requested treatment.
- Keep body text at least 16px and figure labels at least 14px at rendered scale. Human-readable labels use sentence case; never shrink or capitalize them merely to resemble instrument markings.
- Use red for a documented critical condition or destructive action. Other status colors apply only to real state and require text. Chrome and ordinary prose remain neutral.
- Use fine borders and open spacing. No decorative dot grids, scanlines, glow, shadows, or forced layout breaks.
- Use segmented bars only for data whose units or thresholds justify segments. Preserve true proportions and label units.
- Keep buttons descriptive, focus visible, and touch targets at least 44px. Preserve explicit Light/Dark/Auto controls where supplied by the template.

Do not require a hero statistic, metadata row, bracketed state, uppercase navigation, or a fixed count of dark pages. A title, readable text, and a useful diagram may be the whole page.

## Verify

Follow [verification.md](verification.md). Inspect both supported themes, controls, mobile containment, label contrast, and static/reduced-motion output. Theme changes must update chart and diagram colors with the host. A compatibility preset never waives the content and readability contract.

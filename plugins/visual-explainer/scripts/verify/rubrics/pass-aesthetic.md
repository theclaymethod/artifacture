Inputs:
- `report.json` with detected `preset`.
- Light and dark screenshots for the artifact profile.
- Candidate extracts named by deterministic checks.
- Load only the section for the active preset plus `Any named preset`.

Questions:
- Any named preset: [preset-both-mode-visual] Do both modes render correctly with no invisible text, no wrong-mode background or fill bleeding through, and no element that clearly failed to invert?
- Mono-Industrial: [mono-status-value-judgment] Does every colored element mark a specific value or datum with genuine ok/warn/error meaning, rather than tinting a container, row, label, or decoration?
- Mono-Industrial: [mono-one-surprise] Does exactly one element deliberately break the pattern, and is that break typographic or compositional rather than color, icon, or gradient?
- Mono-Industrial: [mono-three-layer-squint] When squinted at, do exactly three legible levels of emphasis exist, and does the hero stay intact and full-width on mobile rather than shrinking into a card?
- Nothing: [nothing-accent-red-judgment] Is the single red-accent use an urgent, destructive, or error signal rather than decorative?
- Nothing: [nothing-single-grid-break] Does exactly one element deliberately break the grid, excluding legitimate full-width chrome such as nav, footer, or section dividers?
- Demo embed: [demo-aesthetic-match] Does the embedded demo frame match the page preset in corner radius, border, shadow, and caption chrome, and feel embedded rather than glued on?

Verdict JSON schema:
`{"pass":true,"findings":[{"check_id":"<check-id>","evidence":"light screenshot: ...","fix":"..."}]}`

Fail examples:
- A Mono-Industrial page uses orange as a section header background instead of only on values.
- A Nothing page uses its single red accent as a decorative underline.

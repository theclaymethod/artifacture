Inputs:
- `report.json` with detected `preset`.
- Light and dark screenshots for the artifact profile.
- Candidate extracts named by deterministic checks.
- Load only the section for the active preset plus `Any named preset`.

Questions:
- Any named preset: [preset-both-mode-visual] Do both modes render correctly with no invisible text, no wrong-mode background or fill bleeding through, and no element that clearly failed to invert? An icon needed to interpret or operate the artifact disappearing into a dark surface is a violation even when its adjacent label remains readable; a non-semantic watermark may fade.
- Mono-Industrial: [mono-status-value-judgment] Does every colored element mark a specific value or datum with documented ok/warn/error meaning, rather than tinting a container, row, label, or decoration? A single colored warning/error value with a neutral surrounding container is a pass.
- Mono-Industrial: [mono-one-surprise] When a layout break is present, does it clarify the content through composition or type? Do not require a surprise element or reward a break that adds no meaning.
- Mono-Industrial: [mono-three-layer-squint] Are headings, main content, and supporting detail distinguishable at desktop and mobile sizes? The content determines the number of hierarchy levels; do not require exactly three or a full-width hero.
- Nothing: [nothing-accent-red-judgment] Does any red accent identify an urgent, destructive, or error condition? Do not require a red accent when no such condition exists.
- Nothing: [nothing-single-grid-break] Does any departure from the grid support the reading order or content? Do not require a grid break or penalize a consistently aligned page.
- Demo embed: [demo-aesthetic-match] Does the embedded demo frame match the page preset in corner radius, border, shadow, and caption chrome, and align with the content it explains?

Verdict JSON schema:
`{"pass":true,"findings":[{"check_id":"<check-id>","evidence":"light screenshot: ...","fix":"..."}]}`

Fail examples:
- A Mono-Industrial page uses orange as a section header background instead of only on values.
- A Nothing page uses its single red accent as a decorative underline.

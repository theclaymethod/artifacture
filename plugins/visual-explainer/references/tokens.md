# Shared tokens

The orchestrator publishes the active preset once; fragments inherit it. Runtime values are defined in `REPO/visual-explainer-mdx/global.css`. Use `lieflat` by default and load only fonts used by the selected preset.

For MDX/TSX, use shared components and `--ve-*` variables directly. For raw HTML fragments, the orchestrator maps these compatibility roles to the active preset:

| Role | Tokens |
|---|---|
| Canvas and ink | `--bg`, `--fg`, `--text-display`, `--text-primary`, `--text-secondary` |
| Structural borders | `--rule`, `--rule-strong` |
| Factual state | `--ok`, `--warn`, `--err` |
| Typography | `--font-body`, `--font-mono`, `--font-display` |
| Text scale | `--size-display`, `--size-section`, `--size-body`, `--size-caption` |
| Spacing | `--space-1` through `--space-6` |
| Mermaid | `--mermaid-node-fill`, `--mermaid-node-stroke`, `--mermaid-line`, `--mermaid-container` |

In shared components, Algebrica uses EB Garamond for headings and reading prose while retaining Inter in `--ve-font-body` for controls and figure labels. Preserve those roles when adapting the theme; changing the body token alone would also change diagrams and controls.

Use a 4/8/16/32/64/96px spacing scale for these compatibility aliases. Set body text to at least 16px and figure/caption labels to at least 14px at rendered scale. Follow [typography.md](typography.md) for measure, grouping, line spacing, and numeric alignment. Display type is optional; sizes follow the content rather than a fixed number of hierarchy levels.

Preserve readable contrast in light and dark modes. Disabled text tokens are for disabled controls, not important labels. Use semantic color only for real data or state, with a non-color cue. [diagram-tokens.md](diagram-tokens.md) maps these roles for figures.

Do not redefine tokens in a section's `scoped_css`. The parent owns fonts, themes, motion policy, and dependencies. Keep initial content visible; transitions respond to actions and honor reduced motion. An explicit diagram-motion request follows [diagram-design.md](diagram-design.md); fragments remain complete and script-free.

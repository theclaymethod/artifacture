# Product

## Register

brand

## Users

Coding agents and engineers use this skill while explaining code, system design, plans, reviews, and generated media. They are usually inside Codex Desktop, Claude Code, or a terminal workflow and need a shareable artifact that is easier to inspect than terminal ASCII, markdown tables, or raw logs.

## Product Purpose

visual-explainer turns agent-authored MDX or React source into verified, self-contained HTML artifacts. The canonical source is editable MDX/TSX; HTML is always generated. The pipeline should support reusable components, Tailwind, named design-system presets, point-and-click review annotations, static HTML delivery, and eventual video outputs.

## Brand Personality

Precise, editorial, tool-native. The product should feel like a serious artifact generator for technical people: composed enough to trust, visual enough to clarify, and flexible enough for multiple design languages.

## Anti-references

Do not look like generic SaaS cards, raw HTML demos, same-layout theme skins, terminal-only ASCII diagrams, decorative gradients, glass panels, or repeated icon-card grids. Presets must express different layout grammar, typography, spacing, and visual motifs rather than simple color swaps.

## Design Principles

1. Source first: MDX and TSX are the authoring surface; generated HTML is the artifact.
2. Presets are systems: each style carries its own typography, rhythm, motifs, and composition rules.
3. Review is visual: point-and-click annotations should target the rendered surface and feed source edits.
4. Static is shippable: every artifact should work as a standalone HTML file after export.
5. Fidelity beats novelty: named templates such as Mono-Industrial and Nothing should preserve their actual design language.

## Token economics

> Methodology note: the emit-vs-expand measurement approach follows [modem-dev/sideshow](https://github.com/modem-dev/sideshow)'s token-economics framing; we re-measured their published claims and applied the same discipline to this pipeline.

The docs are structured to keep covered-flow reads small. Pre-restructure baselines were 62,078 tokens for web-diagram, 57,829 for code-heavy visual-plan, and 36,750 for data-table. The target is Tier 0 plus one covered-flow card at no more than about 3,000 read tokens.

This works because agents emit small MDX/TSX sources, typically about 300-1,900 tokens, while the deterministic exporter expands them into roughly 237 KB standalone artifacts with about 96.6% deterministic scaffolding. New docs must not re-inflate the Tier 0 read path; put flow-specific detail in cards and bespoke fallback guidance in Tier 2 references.

## Accessibility & Inclusion

Artifacts should remain readable at mobile and desktop widths, avoid incoherent overlap, keep body text at readable sizes, preserve keyboard and browser zoom behavior, and respect reduced-motion expectations. Color cannot be the only carrier of meaning for review or status states.

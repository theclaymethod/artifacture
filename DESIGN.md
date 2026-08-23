---
name: Artifacture Visual Explainer
description: A quiet, precise instrument for turning technical source into trustworthy visual artifacts.
colors:
  primary: "#305dde"
  primary-soft: "color-mix(in srgb, #305dde 7%, transparent)"
  canvas: "#f6f6f6"
  surface: "#ffffff"
  ink: "#292929"
  text: "rgb(41 41 41 / 0.92)"
  muted: "#6d6d6d"
  rule: "color-mix(in srgb, #292929 12%, transparent)"
  inverse-surface: "#191919"
  inverse-text: "#ededed"
  inverse-muted: "#969696"
  code-accent: "#296ff0"
  info: "#1d4ed8"
  success: "#047857"
  warning: "#a16207"
  danger: "#b91c1c"
typography:
  display:
    fontFamily: "Inter Tight, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(3rem, 7vw, 6rem)"
    fontWeight: 500
    lineHeight: 0.94
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Inter Tight, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.35rem, 2vw, 1.75rem)"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter Tight, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: "Inter Tight, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "0.13em"
  control:
    fontFamily: "Inter Tight, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "normal"
  code:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "normal"
rounded:
  plate: "clamp(26px, 4vw, 50px)"
  card: "22px"
  node: "18px"
  control: "999px"
spacing:
  tight: "0.5rem"
  control: "0.75rem"
  card: "1.25rem"
  plate: "clamp(1.5rem, 4vw, 3rem)"
  section: "clamp(1.5rem, 3vw, 3rem)"
  page-x: "clamp(20px, 3vw, 44px)"
  page-y: "clamp(44px, 7vw, 108px)"
components:
  button-control:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.75rem"
    height: "2.25rem"
  plate:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.plate}"
    padding: "{spacing.plate}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  code-block:
    backgroundColor: "{colors.inverse-surface}"
    textColor: "{colors.inverse-text}"
    typography: "{typography.code}"
    rounded: "{rounded.plate}"
    padding: "1rem"
  diagram-node:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.node}"
    padding: "0.85rem 0.95rem"
  label-chip:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0.24rem 0.45rem"
---

# Design System: Artifacture Visual Explainer

## Overview

**Creative North Star: "The Quiet Instrument"**

The Quiet Instrument treats every explainer as a precise working artifact: calm enough to study, composed enough to trust, and visually articulate without performing for attention. A quiet gray canvas holds a small number of generous white plates; near-black ink, disciplined spacing, and a single restrained blue carry the hierarchy.

The system is editorial and tool-native rather than decorative. It favors readable measures, immediate chrome, and self-contained technical regions that remain useful from mobile to desktop. OA Design is the default reference for interaction and surface grammar, while the existing visual-explainer token contract keeps every export portable.

**Key Characteristics:**

- Quiet gray canvas with white continuous-curvature plates.
- Near-black ink with restrained blue reserved for focal action and path.
- Inter Tight hierarchy capped at medium weight, with Geist Mono for technical labels.
- Generous whitespace, hairline rules, and only two established depth levels.
- Responsive stacking and locally scrollable dense regions on a clean, undecorated canvas.

## Colors

The palette is deliberately narrow: one cool blue voice, one near-black ink family, and quiet neutral surfaces, with semantic colors confined to status information.

### Primary

- **Instrument Blue** (`primary`): Reserved for primary actions, links, selection, and the focal path through a diagram; its rarity creates emphasis.
- **Instrument Blue Wash** (`primary-soft`): A low-chroma wash for selection and accented diagram fills, never a decorative background.

### Neutral

- **Quiet Canvas** (`canvas`): The page stage and subtle control fill that separates white plates without extra lines.
- **Porcelain Surface** (`surface`): The primary plate, card, node, and content surface.
- **Near-Black Ink** (`ink`): Headings and highest-emphasis diagram text.
- **Reading Ink** (`text`): Body copy softened slightly from the heading ink.
- **Measured Gray** (`muted`): Supporting copy, labels, metadata, and de-emphasized diagram content.
- **Hairline Rule** (`rule`): Borders and dividers derived from ink at low opacity.
- **Inverse Surface**, **Inverse Text**, and **Inverse Muted** (`inverse-surface`, `inverse-text`, `inverse-muted`): The compact dark vocabulary for code and terminal regions.

### Named Rules

**The One Voice Rule.** Use the primary blue only for focal action, navigation, selection, or a diagram's focal path; never distribute it as decoration.

**The Labeled Status Rule.** Semantic color may support text, dots, or paths, but a visible label must also communicate the status.

## Typography

**Display Font:** Inter Tight (with system sans-serif fallback)

**Body Font:** Inter Tight (with system sans-serif fallback)

**Label/Mono Font:** Geist Mono (with system monospace fallback)

**Character:** Inter Tight makes the system compact, contemporary, and editorial without becoming loud. Geist Mono introduces measured technical precision only where labels, tabular values, code, and machine-readable structure benefit from it.

### Hierarchy

- **Display** (500, fluid display scale, 0.94 line-height): Hero titles and large metrics, balanced to a compact measure.
- **Headline** (500, fluid section scale, 1.1 line-height): Section titles and major plate headings.
- **Title** (500, compact title scale, 1.2 line-height): Card, pipeline, and risk titles.
- **Body** (400, readable body scale, 1.6 line-height): Explanatory prose; long copy stays near a 58–68 character measure.
- **Label** (400, compact mono scale, 0.13em tracking, uppercase): Kicker text, captions, state labels, indices, and metadata.
- **Control** (500, compact control scale, 1 line-height): Buttons and compact interactive controls.
- **Code** (400, compact code scale, 1.7 line-height): Code, diffs, terminal output, and structured data.

### Named Rules

**The Medium Ceiling Rule.** Keep display and heading text at 500 or below; use scale, spacing, and ink opacity—not heavy weight—to build hierarchy.

**The Mono Is Metadata Rule.** Reserve Geist Mono for code, labels, indices, and tabular technical detail; prose remains in Inter Tight.

## Layout

Pages use a centered content area capped at 76rem with fluid horizontal and vertical padding. The shell groups content into a small number of plates separated by generous stage space; the gap is the section divider. Section bodies use a 260px label rail beside flexible content on large screens, while pipelines and ledgers use bounded columns that stack at narrower widths.

At mobile widths, headers return to their smaller plate radius, split regions collapse to one column, and vertical swimlanes become stacked node lists. Wide tables, code, diffs, and diagrams scroll inside their own plate; the page root clips horizontal overflow and must never require sideways scrolling.

**The Local Overflow Rule.** Dense technical content may scroll inside its own surface; the artifact page itself never scrolls horizontally.

## Elevation & Depth

Depth is restrained and binary. Resting white plates use a single hairline border and a minimal ambient shadow; only truly floating review chrome receives the established two-layer shadow. Subtle gray fills and spacing carry most hierarchy, and intermediate or ornamental elevations are not part of the system.

### Shadow Vocabulary

- **Resting Plate** (`0 1px 2px rgb(0 0 0 / 0.06)`): White structural plates, cards, diagrams, and code containers on the gray stage.
- **Floating Tool** (`0 1px 2px rgb(0 0 0 / 0.08), 0 8px 24px rgb(0 0 0 / 0.12)`): Fixed review chrome that must visibly float above an artifact.

### Named Rules

**The Two-Layer Limit Rule.** Use only the resting plate shadow or the floating tool shadow; do not invent intermediate elevations.

## Shapes

Large structural surfaces use responsive continuous-curvature corners, compact cards use a smaller squircle, and diagram nodes use a gentler radius. Actions, compact controls, inline code, and chips are full pills. Hairline borders remain neutral and quiet; shape and spacing establish grouping before stroke weight does.

**The Squircle Plate Rule.** Use continuous-curvature corners for major white plates and cards, with the established radius stepping down as the component becomes smaller.

## Components

### Buttons

- **Shape:** Compact full pill with a 2.25rem minimum height.
- **Default:** Quiet-canvas fill, near-black ink, medium-weight Inter Tight, and compact horizontal padding.
- **Hover / Focus:** A restrained ink wash on hover and a visible three-pixel focus ring; active controls press by `translateY(1px) scale(0.98)`.
- **Primary:** When an action is genuinely primary, Instrument Blue may replace the neutral fill; do not create multiple blue competitors in one region.

### Chips

- **Style:** Full pills with mono labels, compact padding, neutral hairline borders, and white or quiet-canvas fills.
- **State:** Selection may use the primary wash or blue text, while status chips retain an explicit text label.

### Cards / Containers

- **Corner Style:** Squircle plates for major containers and smaller continuous-curvature cards for repeated items.
- **Background:** Porcelain white over the quiet gray stage; subtle gray is reserved for nested or supporting surfaces.
- **Shadow Strategy:** Resting plate shadow only, except for fixed review chrome.
- **Border:** One neutral hairline rule.
- **Internal Padding:** Generous fluid padding for plates and compact, consistent padding for cards.

### Tables and Dense Regions

Tables, code, diffs, terminal output, structured data, and diagrams are self-contained inspection surfaces. Captions and headers use Geist Mono, rows use hairline separation, and any required horizontal scrolling remains local to the surface.

### Diagrams

Diagram canvases are clean and unpatterned. White rounded nodes, muted connectors, and hairline frames carry structure; the primary blue identifies only the focal node or path. Wide diagrams retain a legible scale and scroll locally, while supported vertical swimlanes stack into a mobile list.

### Review Chrome

Review tools remain compact and accessible, with 44px touch targets. They sit in normal flow on smaller screens and move to a fixed desktop rail when space permits, using the floating tool shadow only while floating.

## Do's and Don'ts

### Do:

- **Do** build hierarchy with whitespace, scale, and ink opacity before adding color or weight.
- **Do** group related information into a small number of generous white squircle plates on the quiet gray canvas.
- **Do** keep headings at medium weight or lighter and reserve Geist Mono for technical structure.
- **Do** stack responsive layouts and keep overflow local to dense inspection surfaces.
- **Do** preserve visible focus, readable touch targets, browser zoom, and reduced-motion behavior.

### Don't:

- **Don't** add decorative grid, dot-matrix, blueprint, graph-paper, scanline, paper, or terminal backgrounds.
- **Don't** use decorative gradients, glass panels, generic SaaS card grids, or repeated icon-card compositions.
- **Don't** distribute the primary blue across secondary decoration or allow color to communicate status alone.
- **Don't** invent heavier heading weights, intermediate shadows, or extra elevation levels.
- **Don't** treat named presets as color swaps; typography, rhythm, motifs, and composition must remain systemic.

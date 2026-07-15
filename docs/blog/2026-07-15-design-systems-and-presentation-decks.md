---
title: "0.8.0: external design systems, ve:learn, and a second deck engine"
date: 2026-07-15
---

# Artifacture 0.8.0: external design systems, ve:learn, and a second deck engine

Artifacture is my visual-explainer pipeline: MDX/React sources in, self-contained HTML artifacts out, gated by a deterministic verifier. 0.8.0 moves design systems out of the repo, adds a command that learns one for you, and ships a second deck engine built for presenting rather than scrolling, plus security hardening where third-party content gets inlined into shared HTML.

## Your brand tokens don't live in this repo anymore

Every artifact Artifacture exports is skinned by a preset: a set of `--ve-*` CSS custom properties covering surfaces, text, accent colors, fonts, and a dozen other roles. Through 0.7.0, your brand tokens had two bad homes: inside the skill, where an upgrade overwrites them, or in a fork, where they drift from upstream.

0.8.0 resolves design systems at export time from a registry that was never inside the skill:

1. `$ARTIFACTURE_DESIGN_DIR`, if you set it
2. `~/.artifacture/design-systems/`, the recommended home
3. `<repo>/design-systems/`, a repo-local fallback for project-scoped systems

First hit wins. Each system is a directory: `tokens.css` (your `--ve-*` values, scoped automatically to `[data-ve-preset="<slug>"]` at export) plus `manifest.json` (description, provenance, font imports, and hard rules like "accent is reserved for CTAs"). `docs/design-systems.md` has the full format.

The repo itself ships zero design systems. A design system encodes a brand, and brand tokens are usually private material with no business in a public git history. The repo carries the mechanism plus a synthetic fixture (`acme-terracotta`, an invented brand for the eval suite); your systems go in your own registry, gitignored if kept in a repo-local `design-systems/` folder.

## `ve:learn`: point it at a source, get a draft system back

Hand-writing a `tokens.css` is tedious, so 0.8.0 adds a command that drafts one:

```
npm run ve:learn -- <source> --name <slug> [--out <dir>]
```

`<source>` can be a code file (`.ts`/`.js`/`.css` with your tokens in it, pulling hex colors, font stacks, size ramps, grid geometry, and easing), a live URL (reading `:root` custom properties, `@font-face` rules, and dominant colors from linked CSS), or an image (palette quantization via a canvas in Playwright's bundled Chromium).

Whatever the source, a shared deterministic mapper turns raw values into the full `--ve-*` set, using name hints plus measured contrast, saturation, and coverage to decide roles. The draft manifest names the decision behind every token, plus a coverage report against the required list. It's a first draft, not a finished system: the docs cover refining it, reading the extraction report, probing it with a test export, running that through the verifier, and writing real provenance notes.

## A second deck engine, for a different reading mode

`SlideDeck`, from 0.7.0, is a scrolling document: content reflows and the reader scrolls top to bottom, which works well as a handout. It was never right for a deck someone drives live in a room. 0.8.0 adds `PresentationDeck`: a fixed 1920×1080 stage that scales to fit any window or projector (`min(w/1920, h/1080)`, letterboxed), driven by arrow keys, Space, Page Up/Down, Home/End, or edge click zones, with a slide rail that collapses to a dot column and expands on hover.

Around that engine sit about twenty primitives, generalized out of a production deck project built earlier with this pipeline: drill-down cards, chips, and sheets that hold detail one click away, a layer explorer, on-stage diagram types, and the usual stat/quote/stepper/code-panel set. All of it is token-driven, so any existing preset — or a system learned with `ve:learn` — skins the new deck the same way it skins everything else.

## The eval suite is the spec

`evals/run-presentation.mjs` is 21 evals that replay the deck's contract against the real exported HTML: a dismiss-guard matrix (interactive elements keep a drill sheet open on click, passive prose closes it, Escape and the close button always close it), a keyboard-nav matrix that also proves typing in an input or holding a modifier never flips a slide, stage-fit geometry across four viewport ratios, rail collapse widths, and a literal scan that fails the build over one hardcoded color or font outside a three-entry allowlist (two neutral fallbacks, one docstring example).

Each was verified by breaking the matching behavior and confirming the eval caught it, then reverting: make the dismiss guard always return true and the dismiss-matrix eval fails; flip `fitStage`'s min to a max and the letterbox eval fails; hardcode a CTA color and three separate evals fail at once.

The design-system eval suite (`evals/design-systems/`) got the same falsification treatment, including a `loader-hostile-tokens-inert` case that's really a security test: hostile token values and font-import URLs both have to throw before they reach the HTML the loader assembles. Disable the value guard, and that eval fails too.

## Security work in the same release

Design systems are the first third-party content Artifacture inlines into shared HTML, so that boundary got hardened end to end: `<` and control characters in token values and font-import URLs are rejected before they reach a `<style>` block, a single CSS-injection helper refuses `</style`, `<!--`, or `<script` outright, and `ve:learn`'s URL modality refuses private and loopback hosts by default, caps response size, and times out fetches. None of it changes how you use the tool; the things you learn or download just can't turn into a payload in someone else's browser.

If you're already on Artifacture, `npm i` picks up 0.8.0. For your own brand, `npm run ve:learn` is the fastest way in; `docs/design-systems.md` and `docs/presentation-deck.md` cover the rest.

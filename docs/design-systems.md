# External design systems

Artifacture's built-in presets (`mono-industrial`, `nothing`, `blueprint`,
`editorial`, `paper-ink`, `terminal`, `custom`) live in
`visual-explainer-mdx/global.css`. Everything else is a **design system**: a
user-owned artifact maintained OUTSIDE the skill and the repo, resolved from a
registry at export time. Your brand tokens survive skill upgrades because they
were never inside the skill to begin with.

## File format

One directory per system, named by its slug:

```
<registry>/<slug>/
  tokens.css      the system's --ve-* custom properties
  manifest.json   metadata, provenance, fonts, notes
```

### tokens.css

Declaration-only CSS: `--ve-*` custom properties inside a `:root { ... }`
block (bare declarations also work; any non-custom-property rules are
ignored). At export the loader re-scopes the declarations to
`[data-ve-preset="<slug>"]`, so plain `:root` keeps the file valid,
editor-friendly CSS while guaranteeing the tokens can never leak outside the
preset scope.

Token values are inlined into shared HTML artifacts, so they may not contain
`<` or control characters — the loader rejects such values loudly rather than
inlining them (no legitimate `--ve-*` value needs them).

Cover at least the core roles — bg / surfaces (`panel`, `panel-strong`,
`row`) / text (`heading`, `text`, `muted`, `faint`) / `accent` (+ `-soft`,
`-contrast`) / `rule` / status colors / the three font stacks / weights /
`radius` — plus the extended diagram, code, and poster groups. The canonical
key list is `REQUIRED_VE_TOKENS` in `scripts/ve-mdx/design-systems.mjs`; the
exporter warns about unset recommended tokens. Four diagram tokens
(`--ve-diagram-ink/muted/frame/accent-fill`) get derived fallbacks
automatically, mirroring the built-in `custom` preset.

### manifest.json

```json
{
  "name": "<slug>",
  "description": "One-paragraph identity of the system.",
  "source": { "kind": "code|url|image", "location": "...", "tool": "..." },
  "fonts": {
    "imports": ["https://fonts.googleapis.com/css2?family=..."],
    "stacks": { "display": "...", "body": "...", "mono": "..." },
    "note": "licensing / fallback expectations"
  },
  "notes": ["Hard rules and usage guidance that travel with the system."]
}
```

- `source` is provenance: where the tokens came from and how.
- `fonts.imports` are inlined as `@import` lines ahead of the tokens. Each
  entry must be a plain http(s) URL with no quotes, angle brackets,
  backslashes, parentheses, or whitespace (anything else is rejected loudly).
  Remote fonts are a self-containment trade-off — every stack must end in a
  system fallback so artifacts degrade gracefully offline.
- `notes` carry the system's hard rules (e.g. "solid fills over grid paper",
  "accent color reserved for CTAs") so an agent styling with the system can
  honor them.

## Registry resolution order

1. `$ARTIFACTURE_DESIGN_DIR` — explicit override, wins outright.
2. `~/.artifacture/design-systems/` — the user-global registry (recommended
   home for your systems).
3. `<repo>/design-systems/` — repo-local fallback, for clones that want
   project-scoped systems. The repo itself ships NO systems here (design
   systems are usually private brand material); only the directory README is
   tracked.

First hit wins; lookup is by directory name.

**Collision note:** `~/.artifacture` may itself BE a clone of this repo. In
that case locations 2 and 3 are the *same* directory — the loader dedupes the
search list so it is consulted exactly once (at the higher-priority slot), and
the repo's `.gitignore` excludes `design-systems/*` so systems you learn into
your global registry can never be committed to the repo by accident.

A directory that exists but is malformed (missing `tokens.css` or
`manifest.json`, unparseable manifest) fails the export loudly rather than
silently falling through to a lower-priority registry — a half-formed system
shadowing another is a debugging trap.

## Using a system

Reference its slug anywhere a preset name goes:

```mdx
<ExplainerShell preset="acme-brand" title="..." summary="...">
```

`npm run ve:export` scans the source for preset references, resolves
non-built-in names against the registry, and inlines the tokens (scoped, with
derived fallbacks and font imports) into the standalone HTML as a
`<style data-ve-design-system>` block. Built-in names never consult the
registry, so a user system named `terminal` cannot shadow the built-in.
Unknown names warn and fall back to the default built-in tokens
(`mono-industrial`) so nothing ships unstyled.

The static/Hyperframes path (`ve:export-static`) renders compositions that
carry their own styles and does not consult the registry.

## Learning a system: `ve:learn`

```
npm run ve:learn -- <source> --name <slug> [--out <dir>] [--force] [--allow-private]
```

`<source>` decides the modality:

| Modality | Source | What gets extracted |
|----------|--------|---------------------|
| code | `.ts/.tsx/.js/.css/...` file | named hex colors, font stacks, weight/size ramps, grid geometry, easing |
| url | `http(s)://...` | `:root` custom properties, `@font-face`, font-family stacks, dominant colors from the page's linked CSS. Guardrails: private/loopback hosts are refused unless `--allow-private` is passed, responses are capped at ~5MB, fetches time out after 15s, and non-text content types are rejected. Extracted values are sanitized (angle brackets and control characters stripped) before they can become tokens. |
| image | `.png/.jpg/.webp/...` | quantized palette (canvas in Playwright's Chromium), mapped by coverage/contrast/saturation |

Output is a **draft** system in the registry (default:
`$ARTIFACTURE_DESIGN_DIR`, else `~/.artifacture/design-systems/`): a full
`tokens.css` plus a manifest whose `extraction` block records every mapping
decision, the size ramp, and required-token coverage.

The heuristics are deterministic, and the eval suite in
`evals/design-systems/` is their spec — fixture sources with golden expected
tokens, run as the second leg of `npm run ve:eval`. Change a heuristic, and
the evals tell you what it broke.

### Agent-assisted refinement flow

`ve:learn` gets you a faithful first draft; taste comes from a review pass.
The intended loop, for a human or an agent:

1. **Learn**: `npm run ve:learn -- <source> --name <slug>`.
2. **Read the extraction report** in `manifest.json` — every token names the
   decision that produced it (`name hint "paper"`, `mix(text 5% over bg)`,
   `generic status default`). Defaulted/generic decisions are the review
   queue.
3. **Render a probe**: export an existing example with the new preset name
   (e.g. copy `examples/visual-explainer-mdx/preset-gallery.mdx`, set
   `preset="<slug>"`) and eyeball surfaces, muted-text contrast, diagram grid,
   code panel.
4. **Refine tokens.css** directly — it is the artifact, not the extractor
   output. Run the exported probe through the verifier
   (`npm run ve:verify -- <out.html>`) to catch contrast regressions.
5. **Annotate the manifest**: real description, font `imports` +
   licensing note, and the system's hard rules under `notes`. Drop the
   `"status": "draft"` marker.

The synthetic `acme-terracotta` eval fixture
(`evals/fixtures/design-systems/code/acme-terracotta-tokens.ts` and its golden
under `expected/`) is the reference shape for step 1's input and output: a
brand token module in, a full `--ve-*` set out, with every mapping decision
recorded. Real systems produced by this flow are private by default — keep
them in your user-global registry, not in a repo clone.

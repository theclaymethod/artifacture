# External design systems

Artifacture's built-in presets (`lieflat`, `algebrica`, `mono-color`, `oa-design`, `mono-industrial`, `nothing`, `blueprint`,
`editorial`, `paper-ink`, `terminal`, `custom`) live in
`visual-explainer-mdx/global.css`. Other preset names resolve to user design systems in an external registry.
Skill updates leave that registry alone.

Lieflat combines editorial chart storytelling with Inter and open layouts. Its
`LieflatChart` renderer provides five families for units, dates, categorical
intersections, and individual paths; changing palette alone does not author
those encodings. See the [chart guide](../plugins/visual-explainer/references/charts.md)
for JSON and MDX recipes. Algebrica uses EB Garamond for headings and
reading prose, with Inter for controls and figure labels. Mono Color uses
limited inks and an asymmetric composition. These built-in treatments do
not change the external token contract below; define each font's role in
the system's manifest and review it in the rendered artifact.

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
editor-friendly CSS without applying the tokens outside the
preset scope.

Token values are inlined into shared HTML artifacts, so they may not contain
`<` or control characters — the loader rejects them.

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
  backslashes, parentheses, or whitespace (other entries are rejected).
  Remote fonts are a self-containment trade-off — every stack must end in a
  system fallback for offline reading.
- `notes` carry the system's hard rules (e.g. "serif reading text, sans-serif controls",
  "accent color identifies the selected series") so an agent styling with the system can
  honor them.

## Registry resolution order

1. `$ARTIFACTURE_DESIGN_DIR` — explicit override.
2. `~/.artifacture/design-systems/` — the user-global registry (recommended
   home for your systems).
3. `<repo>/design-systems/` — repo-local fallback, for clones that want
   project-scoped systems. The repo itself ships no user systems here (design
   systems are usually private brand material); only the directory README is
   tracked.

First hit wins; lookup is by directory name.

If `~/.artifacture` is the repository checkout, locations 2 and 3 are the same
directory. The loader searches it once, at the higher priority. The repo's
`.gitignore` excludes `design-systems/*`.

A directory that exists but is malformed (missing `tokens.css` or
`manifest.json`, unparseable manifest) fails the export. The loader does not fall through to a
lower-priority registry.

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
(`lieflat`).

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
tokens, run as the second leg of `npm run ve:eval`. Run those evals after changing a heuristic.

### Review the extracted system

Extraction produces a draft. Compare its rendered output with the source:

1. **Learn**: `npm run ve:learn -- <source> --name <slug>`.
2. **Read the extraction report** in `manifest.json` — every token names the
   decision that produced it (`name hint "paper"`, `mix(text 5% over bg)`,
   `generic status default`). Defaulted/generic decisions are the review
   queue.
3. **Render a probe**: export an existing example with the new preset name
   (e.g. copy `examples/visual-explainer-mdx/preset-gallery.mdx`, set
   `preset="<slug>"`) and inspect surfaces, muted-text contrast, diagram spacing,
   code panel.
4. **Refine tokens.css** directly. Run the exported probe through the verifier
   (`npm run ve:verify -- <out.html>`) to catch contrast regressions.
5. **Annotate the manifest**: real description, font `imports` +
   licensing note, and the system's hard rules under `notes`. Drop the
   `"status": "draft"` marker.

The synthetic `acme-terracotta` eval fixture
(`evals/fixtures/design-systems/code/acme-terracotta-tokens.ts` and its golden
under `expected/`) is the reference shape for step 1's input and output: a
brand token module in, a full `--ve-*` set out, with every mapping decision
recorded. Keep private systems in the user registry.

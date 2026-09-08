# Local design-system registry

The exporter searches these directories in order and uses the first matching slug:

1. `$ARTIFACTURE_DESIGN_DIR`
2. `~/.artifacture/design-systems/`
3. `<repo>/design-systems/` — this directory

Store private brand systems in your user registry. This repository includes only this README and ignores the other contents of `design-systems/`. If `~/.artifacture` is the repository checkout, the second and third paths coincide; the loader searches that directory once.

Each system contains:

```
design-systems/<slug>/
  tokens.css      --ve-* properties in a :root block
  manifest.json   name, description, provenance, fonts, rules
```

`tokens.css` defines surfaces, text, accents, font stacks, and the other shared roles. `manifest.json` records the source and usage rules. Run `npm run ve:learn` to extract a draft, then review the rendered result as described in [External design systems](../docs/design-systems.md).

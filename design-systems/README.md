# Design-system registry (repo-local fallback)

This directory is the LOWEST-priority location the design-system loader
searches. Design systems are user-owned — and usually private — artifacts
that live outside the repo:

1. `$ARTIFACTURE_DESIGN_DIR` (explicit override)
2. `~/.artifacture/design-systems/` (user-global registry — the recommended
   home for your systems, especially brand tokens that must not be published)
3. `<repo>/design-systems/` (this directory — repo-local fallback)

First hit wins. If `~/.artifacture` is itself a clone of this repo, locations
2 and 3 are the same directory; the loader dedupes the search list, and this
directory's contents are gitignored (see the repo `.gitignore`) so
learned/private systems can never be committed by accident. This repo
intentionally ships NO systems here — the repo ships the mechanism, your
registry holds the brand.

Each system is a directory named by its slug:

```
design-systems/<slug>/
  tokens.css      --ve-* custom properties in a :root { ... } block
  manifest.json   name, description, source provenance, fonts, notes
```

For example, a private `acme-brand/tokens.css` would set `--ve-bg`,
`--ve-text`, `--ve-accent`, the three `--ve-font-*` stacks, and friends; its
`manifest.json` records where the tokens were learned from and the brand's
hard rules. Draft one from your own sources with `npm run ve:learn` and refine
it per `docs/design-systems.md`.

# Runtime details

The installed CLI resolves its bundled runtime and installs locked npm dependencies automatically when needed. `init` and `add` install the consumer's required npm packages and add stylesheet imports to its app entry. `--dry-run` previews without writing or installing; `--no-install` leaves package installation to the caller. `--entry <file>` selects a custom app entry.

For development, a linked skill uses its owning checkout. `ARTIFACTURE_REPO` selects an explicit checkout; an invalid override fails. Standalone installs extract into `~/.cache/artifacture/runtimes/<content-hash>`; `ARTIFACTURE_CACHE_DIR` changes that location. Updated snapshots use separate caches. Edited cache sources are preserved and rejected rather than overwritten. Use an explicit checkout for editable runtime development.

Private brands in `~/.artifacture/design-systems` stay user-owned. Legacy skills without a snapshot can resolve an existing valid `~/.artifacture` checkout.

After a failed npm install, fix the reported npm error and repeat the original command. Before publishing source changes, run `npm run build:skill-runtime`; packaging rejects stale snapshots.

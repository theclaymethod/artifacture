# Skill and npm installation verification

The public flow now uses one skill install, or `npm install artifacture` followed by the usual local `npx artifacture` commands. Users do not configure runtime paths, caches, or setup helpers.

## Changed behavior and files

- `scripts/artifacture.mjs` is the public npm CLI. `init` creates a project and installs its dependencies. `add` copies editable source, installs missing packages, and imports styles in the app entry. Existing dependency declarations and edited component files remain intact. Dry runs write nothing; custom entry files and manual package management are optional flags.
- `plugins/visual-explainer/scripts/artifacture.mjs`, `setup-runtime.mjs`, and `resolve-runtime.mjs` find and prepare the included renderer automatically. Export and verification work after a normal copied skill installation. Verification downloads its browser on first use when needed.
- `package.json` and `package-lock.json` include renderer/verifier dependencies in the published runtime. `prepack` builds the compressed skill runtime automatically; the CI snapshot check still detects later stale edits.
- `SKILL.md`, `references/react-workspaces.md`, `references/installation.md`, `references/verification.md`, `README.md`, `docs/installation.md`, `docs/workspaces.md`, and generated workspace guidance describe the simplified flow.
- Portfolio `src/components/artifacture/ArtifactureShowcase.tsx` now displays the skill, npm, and new-project workflows without internal setup instructions. Saved desktop/mobile installation captures are in `docs/design/artifacture-docs-2026-10-04/` in the portfolio.

This follow-up preserves the bundled catalog, existing video disposal changes, and typed-scene verifier routing from the preceding install work. It does not publish or deploy these uncommitted changes.

## Evidence

- A real `npm pack` tarball installed with npm into an independent temporary project. The package contains the public executable and bundled skill runtime. Its production dependencies support an actual MDX export without installing dev dependencies or linking a source checkout.
- `npx artifacture init` created a React/TypeScript/Vite project and installed dependencies automatically. `npx artifacture add charts video` installed GSAP and imported both theme stylesheets. No manual package or CSS step was used.
- All 31 catalog entries were copied with the public CLI. All 36 copied source/license/CSS files matched the packed package. Repeating the add command preserved source, app entry, package metadata, lockfile, and modification times.
- The independent project passed strict TypeScript checking and a production Vite build. Its rendered starter at 1440px and 390px used the appropriate horizontal/vertical layout, had no page overflow, and supported time seeking with no browser errors.
- The normal skills CLI copied `visual-explainer` into a separate project. Its first export automatically extracted the runtime, installed locked packages, and produced HTML. The bundled component gallery also exported and rendered; a quiz interaction and seeking between 0 and 6 seconds worked on mobile.
- With an empty, isolated Playwright browser cache, the installed skill automatically downloaded Chromium and completed rendered mechanics: 0 errors, 0 warnings, 28 passed checks. Browser setup required no user command. Artifact visual review remains a separate artifact-specific judgment.
- The installed skill also exported its finite 16-second graphic video. The packed npm CLI verified it with 0 mechanical errors; one expected duration warning reflects the short reusable example rather than a long-form production video.
- Existing `npm test`: 25 passed, 0 failed. `npm run typecheck`, `check:manifests`, and `ve:check` passed. The earlier verifier routing work passed all 153 seeded violations and 7 clean fixtures.
- Focused Oxlint, skill validation, and diff whitespace checks passed. Portfolio formatting, production build, and `verify:build-artifacts` passed. Installation page was inspected at desktop/mobile widths; navigation anchors resolve and no internal setup instructions remain.

## Package receipt

Independently tested snapshot: 518 files, SHA-256 `561d6d5dce463ea20f750d09409f63b17f38da9a8e4a00dc0c2bf261bd0f6be1`.

Packed Artifacture 0.8.0: 14,296,825 bytes; integrity `sha512-1CXDjSjw7ND5glx0KY/ZOZCB8Gs8NXoEd2jQByKQActsboChzE2l5bAK555WI03jIdsGtg2QTVF854UUvnkkEg==`.

The source checkout has concurrent work from other chats. The checks above cover the described implementation and installed snapshots; later edits must rebuild and recheck their own package. No new test/spec files were added. Temporary consumer projects, browser caches, and servers are removed after verification. The portfolio preview stays available on port 3014. GitHub/npm publication is still pending.

At handoff, the regenerated bundle contains 520 files (SHA-256 `02c600473520b4031800dae66f072668c5aea2d40bb49be470eab25839baa49a`), and its source consistency check passes. Additional concurrent source edits are included in that snapshot; independent installation evidence above is bound to the 518-file packed snapshot. The public CLI changes after its installed checks only clarified dry-run text and the video output filename in help.

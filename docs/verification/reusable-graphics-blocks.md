# Reusable graphics blocks verification

Verified on 2026-10-04 against the working sources in `visual-explainer-mdx/`. This pass adds no test/spec files, test helpers, or fixtures. The probes ran inline against the actual modules and exported browser runtime.

## Existing checks

- `npm test`: all 190 existing tests passed.
- `npm run typecheck`, `npm run check:manifests`, and `npm run lint`: passed.
- `npm run ve:check`: passed, including the document roster, static content checks, component roster, integrity checks, and the migrated long-form video's bundled export.
- `git diff --check`: passed.
- An independent implementation review found no blocking defect in composition identity, endpoint remapping, placement, clipping, freezing, or motion binding.

## Runtime behavior

The inline runtime probe composed repeated diagrams with non-contiguous local node orders `[2, 8]`, nested that composition, and placed native Hairline geometry beside it. It verified distinct object and physical node identities, resolved edge endpoints, independent motion, immutable inputs, frozen output, JSON round-trip pose equality, nested placement, rectangular clip intersection, and empty intersections. Source-local addresses containing slashes and colons remained distinct after scoping.

The probe rejected a dangling endpoint, duplicate node order, disconnected node translation, a zero-sized frame, and an underflowing fit. Seeking `2 → 6 → 2` reproduced the sampled scene. Original Hairline path strings and paint order stayed unchanged. Static slide and sampled video SVG matched at the same pose.

## Exported browser paint

Headless Chromium rendered the actual exported poster, interactive slides, composed video, native static/video pair, and migrated retry video at 1920 × 1080. Checks established unique accessible/marker/clip IDs, valid physical endpoint references, resolved clip references, loaded Inter, and no page errors. Manual image inspection confirmed readable labels, clear arrowheads and masked edge labels, native solid occlusion, and the intentionally cropped native figure.

Backward seeking compared all SVG attributes and child geometry after normalizing attribute order, plus computed paint/font values. GSAP seeks used `suppressEvents=false` so each sampled pose actually reached the renderer. Geometry and computed paint matched exactly.

| Painted comparison | Changed pixels | Largest channel difference |
| --- | ---: | ---: |
| Native video `2 → 6 → 2` | 0 | 0 |
| Retry video `2 → 20 → 2`, across slide cuts | 0 | 0 |
| Native static slide versus video's final pose | 0 | 0 |
| Shared composed diagram `2 → 6 → 2` | 391 of 2,073,600 | 2 of 255 |

The last comparison has minute raster variation with identical geometry and computed paints. Its mean channel difference is 0.000171 of 255. The painted gate allows at most 2 of 255 per channel, fewer than 500 changed pixels, and a mean channel difference below 0.01 of 255. It passes; the shared diagram comparison is not pixel-exact.

For stable font metrics, only the verification browser intercepted the Google Fonts stylesheet with unchanged local Inter and EB Garamond bytes from the accepted video inputs. Export HTML and theme CSS were not modified for that check. Raw exports retain their network font requests, so these checks do not establish offline font delivery.

## Evidence and limits

Detailed JSON receipts and screenshots are in `~/.codex/investigations/artifacture-primitives-2026-10-04/`: `runtime-verification.json`, `browser-verification.json`, `implementation-review.md`, and `screens/`. Runtime and implementation receipts bind these source hashes:

| File | SHA-256 |
| --- | --- |
| `graphics-types.ts` | `419255629c71fee2faa06ba711c513146d7400ab62e2c65666083c00a674d26c` |
| `graphics-composition.ts` | `4c4fef191b4a87ed59509157ece9a426a04adf6ebb42286c4bd52cf059886272` |
| `graphics.tsx` | `021ac6c5f37dba0c487bea0190110b012eac515c678cb9d0eafa08edd54c1847` |

These checks cover the supported static uniform placements and resolved rectangular clips. They do not establish arbitrary transforms, cross-block connections, rich mathematical text, narrated/captioned delivery, native Manim/Psychopomp execution, or complete HyperFrames compilation of the new specimens. The shared diagram's reveal/highlight motion still triggers HyperFrames' documented `sweep_static` heuristic; direct frame/state checks establish its motion behavior without claiming a green HyperFrames sweep. The accepted six movies and their source remain unchanged. Lieflat encoding geometry remains a separate migration described in the [cleanup plan](../plans/reusable-graphics-blocks.md).

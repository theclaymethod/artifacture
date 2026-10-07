# Punctum display sources

Source: [sundyme/punctum](https://github.com/sundyme/punctum/tree/56caad6cb7295c98fede26edb196d763e124b75d), pinned at `56caad6cb7295c98fede26edb196d763e124b75d`.

The following files are unmodified Punctum font software under SIL OFL 1.1. Keep `punctum/OFL.txt` with them in every source copy or distribution. This font license is separate from Artifacture's MIT license.

| Local file | Pinned upstream file | SHA-256 |
| --- | --- | --- |
| `punctum/bitmaps.json` | `src/bitmaps.json` | `5b8a86e11a2e305f9b85aef901696e8ec70f48bd4b17d314b2cbda935f626f33` |
| `punctum/Punctum-VF.woff2` | `fonts/Punctum-VF.woff2` | `71b6060683213386a8eca3eaeb5be3e737a2bd9c5601451535aa6ad182394b9f` |

`punctum-glyphs.mjs` exposes the unmodified 108 masks as immutable data. The scene, roll, scan, audio, and React readout adapters are original Artifacture MIT code, informed by Punctum's five-by-nine glyph layout and explicit-time film contracts. No upstream film code, score, recorded audio/video, shader, or renderer is redistributed.

The SVG dots approximate the film's size/roundness convention using existing rectangle primitives. They do not reproduce the font's quadratic outlines. The optional `PunctumReadout` uses the actual canonical variable font. Wait for `awaitPunctumFont(text)` before capturing it.

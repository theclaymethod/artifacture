# Make the invisible obvious

An editable showcase of native figures, interactive slides and a narrated FFrames film.

- `web/` is an ordinary React/MDX/Vite project. The opening slide is compact MDX; the interactive scenes are React components reused by the page and presenter.
- Anatomy is fetched on demand at a pinned upstream commit and embedded as a sandboxed native page; its geometry and physical model are retained.
- Hairline provides the six ISO mechanisms directly through `@lucasmarkes/hairline/react`.
- The transformation and lifetime-refactor examples are local, editable teaching examples. They do not add a graphics API to Artifacture.
- `film/` is a native Cargo/FFrames project. Its native CLI owns previewing, scene inspection and rendering.

## Run the page or slides

From this repository:

```sh
cd examples/overdrive/web
npm install
npm run prepare:anatomy
npm run dev
```

The page opens at the Vite URL. Add `?slides#idea` to present. Use left/right to step through the mathematical transformation and code review, and up/down to move directly between slides. Inputs retain their own arrow-key behavior.

`npm run build` produces the site in `dist/`. Video, captions, fonts and downloadable source live in `public/media/`; the generated movie and source archive are intentionally ignored by Git. The `artifacture` dependency points at the repository because this prerelease has not been published.

## Render the film

Use the native commands documented in `film/WORKFLOW.md`. Rendered media is handed to the web project as an ordinary MP4:

```sh
cd examples/overdrive/film
cargo run --release -- render -o ../web/public/media/overdrive.mp4
```

The film is designed for 1920×1080. `render --draft` produces a quick 960×540 preview. Use `frame`, `strip`, `inspect` and `audio analyze` to inspect the native project without adding a second rendering pipeline.

The interactive mathematical scene uses SVG with an explicit 2×2 matrix. It is not a Manim rendering. The code review is an illustrative renderer-lifetime refactor, not a measured performance claim or a review of a specific PR.

The downloadable source bundle includes the generated Ainthony recording and Anatomy clip so the exact film can be re-rendered without generating another voice take. Regeneration remains a user-local voice dependency. The published showcase labels the narration as Ainthony; the production receipt records its synthetic origin.

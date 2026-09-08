# Optional media

Load this reference only when imagery, a code-generated graphic, or a short UI demonstration materially improves the explanation. The artifact must still work without optional media when the required tool is unavailable.

## Choose the medium

| Need | Medium | Tool |
|---|---|---|
| Illustrative, conceptual, photographic, or atmospheric image | Generated raster image | Installed image-generation capability |
| Exact chart, hierarchy, or schematic | Code-driven raster graphic | Installed graphics capability or `poster` |
| Running UI behavior or a short interaction sequence | Silent WebM/MP4 loop | Browser capture + FFmpeg |
| Structure, topology, process, state, or data relationships | Native diagram | LieflatChart, DataChart, DiagramCanvas, Archify, or a specialized renderer |

Skip generic decoration. Use media to explain the subject, orient the reader, or satisfy an explicit visual brief.

## Generated illustration

Use an installed image-generation capability and follow its current instructions. If the only available option is a local CLI such as `surf`, inspect its current help and select a supported image-generation mode rather than assuming a provider or model name. Continue without the image when no image-generation capability is available.

Use 16:9 for hero banners and 1:1 for inline illustrations. Name the visual style and the dominant colors from the page tokens. Prefer concrete prompts such as “isometric message queue with rust nodes on warm paper” over “diagram of a queue.”

Embed the final asset with a descriptive `alt` attribute. Keep the page useful when the image is absent.

## Code-driven graphic with poster

Check availability with `which poster`. Use poster when layout and values must be deterministic.

```bash
poster export /tmp/ve-graphic.tsx -o /tmp/ve-graphic.png --quiet
```

Read [`poster.md`](./poster.md) for canvas sizes, TSX constraints, and source/export constraints. Do not put Mermaid inside a poster. Verify the exported PNG for clipping before embedding it.

## Recorded UI demonstration

Use a short silent loop only when motion explains a real interaction better than a still frame.

1. Capture 6–12 settled frames or record directly with an available browser-automation capability.
2. Keep the source media below 2 MB when possible; base64 increases artifact size.
3. Convert numbered frames with:

```bash
bash <skill-directory>/scripts/frames-to-webm.sh \
  ~/.agent/diagrams/<slug> \
  ~/.agent/diagrams/<slug>.webm \
  2
```

4. Generate a self-contained media element with:

```bash
bash <skill-directory>/scripts/embed-media.sh ~/.agent/diagrams/<slug>.webm
```

Read [`demo-capture.md`](./demo-capture.md) for capture pacing and aesthetic framing. If capture or FFmpeg is unavailable, use a still screenshot or native diagram.

## Self-containment and cleanup

- Embed local generated media as data URIs when practical.
- Supply useful alternative text for images.
- Use `autoplay loop muted playsinline` for silent explanatory loops.
- Remove temporary generation files after the final artifact is verified.
- Never let media generation block delivery of an otherwise complete visual explanation.

# Dot displays and synchronized scans

Punctum adds display blocks within ISO, 3b1b, Mono Color, and Algebrica. These are reusable primitives, not another theme. The [interactive gallery](../examples/visual-explainer-mdx/punctum.tsx) demonstrates all four copy entries, direct time seeking, the font axes, and optional generated sound.

```bash
artifacture list --query punctum --json
artifacture add dot-matrix-scene character-roll column-scan punctum-readout --cwd ./explainer
```

The registry copies local dependencies and full licenses. `punctum-readout` adds the canonical WOFF2; the scene entries use glyph geometry and need no downloaded font. Import the host's copied `themes.css`. The readout imports its own font CSS.

## Prepare geometry once

```tsx
import { createDotMatrixScene } from './artifacture/dot-matrix';
import { GraphicCanvas } from './artifacture/graphics';

const display = createDotMatrixScene({
  id: 'message', title: 'Reusable message',
  description: 'BUILD ONCE drawn as individual dot cells.',
  text: 'BUILD\nONCE', pitch: 16, weight: 300, roundness: 100,
});
<GraphicCanvas scene={display.scene} />
```

`display` contains immutable `scene`, `cells`, `text`, `columns`, `rows`, and `pitch`. A cell retains its ID, character position, dot position, global dot column, and lit state. IDs have the form `dot:characterRow:characterColumn:dotRow:dotColumn`; all 45 positions per character are prepared, including unlit dots. Extra `columns`/`rows` reserve a fixed grid. Lowercase descenders keep their two extra rows.

The 108 pinned glyphs support at most eight lines of 32 characters. Unsupported characters reject explicitly. Pitch is 2–128 scene units, weight 100–900, and roundness 0–100. `paint` selects `ink` or `accent`; `lattice: true` draws small neutral registration dots. Weight/roundness prepare static geometry. SVG round rectangles approximate Punctum's film convention; the optional font supplies its actual contours.

Pass the scene to `composeGraphics` for diagrams/posters, then `createSlideScene` and `sequenceSlides` for slides/video. The [worked source](../examples/visual-explainer-mdx/punctum-source.ts) places a roll and scan into one composition; the [video source](../examples/visual-explainer-mdx/punctum-video.tsx) wraps it without recreating cells.

## Roll to an exact message

```ts
import { createCharacterRoll } from './artifacture/character-roll';
import { sampleScene } from './artifacture/graphic-motion';

const roll = createCharacterRoll({
  id: 'reuse', title: 'Build once. Reuse everywhere.',
  description: 'The same grid changes from BUILD ONCE to REUSE EVERYWHERE.',
  from: 'BUILD\nONCE', to: 'REUSE\nEVERYWHERE',
  start: .45, tick: .08, stagger: .04, steps: 7, hold: .8,
});
const frame = sampleScene(roll.scene, roll.motion, authoredSeconds);
```

The result contains `scene`, `finalScene`, `motion`, `completion`, and ordered `changes` with time, character row/column, and character. Both messages share a padded grid. Unchanged characters stay still; changed characters traverse a bounded deterministic drum, then land on the actual target glyph. The first change occurs one tick after `start + (row + column) * stagger`. Existing discrete opacity tracks own timing. Maximum total duration is 120 seconds, including a positive final hold.

Use `finalScene` for stationary reduced motion. Intermediate characters are a transition, not measured values; keep factual chart annotations separate.

## Scan and sound share events

```ts
import { createColumnScan } from './artifacture/column-scan';
import { synthesizeScanWav } from './artifacture/scan-audio';

const scan = createColumnScan({
  id: 'signal', title: 'Read a signal by column',
  description: 'Each lit dot produces a tone when its column is read.',
  text: 'SIGNAL', mode: 'reveal', start: .3, step: .09, hold: .8,
});
const wav = synthesizeScanWav(scan.events, { duration: scan.motion.duration });
```

`reveal` writes the message; `read` starts with the message visible. Each lit cell emits an immutable event with `id`, `target`, `time`, global `row`/`column`, and `frequency`. A short accent pulse and optional audio share that timestamp. Blank columns are silent. The line advances through the grid and disappears on completion; the final message holds.

`synthesizeScanWav` produces deterministic mono PCM without a browser/audio library. Defaults: 48kHz, .045-second clicks, .045 gain. Bounds: 8–96kHz, .005–.25-second clicks, gain 0–.1, positive duration up to 120 seconds. Events and their click tails must fit. Onsets use the first PCM sample at or after the event time. A short attack avoids a hard discontinuity; dense chords normalize only when their peak would exceed .8. No upstream score or recordings are copied.

Sound is opt-in. During playback an ordinary audio element owns time: sample visuals from `audio.currentTime`, pause before seeking, and dispose object URLs on unmount. For narration, derive the scan start from compiled cues and mix its quiet sound below speech. The gallery implements audio-owned playback. The graphic-video HTML exporter remains silent; its paired WAV can be mixed in the existing video pipeline. Do not maintain a second event list.

## Optional actual font

```tsx
import { PunctumReadout, awaitPunctumFont } from './artifacture/punctum-readout';

<PunctumReadout text="Build once." weight={400} roundness={100} size={48} />
await awaitPunctumFont('Build once.'); // browser capture readiness
```

The caller owns axis changes; there is no internal loop. Text remains accessible. Keep prose, captions, code, and mathematics on existing font roles. Readout size is 8–512 CSS pixels. The readiness helper rejects failed loading rather than silently capturing a substitute.

```bash
npm run ve:export -- examples/visual-explainer-mdx/punctum.tsx --out dist/punctum/index.html
npm run ve:graphic-video -- examples/visual-explainer-mdx/punctum-video.tsx --out dist/punctum/video/index.html
```

[PUNCTUM-PROVENANCE.md](../visual-explainer-mdx/PUNCTUM-PROVENANCE.md) records the pinned hashes. Keep `punctum/OFL.txt` beside the font/masks. The full Premiere GPU renderer and hinged 3D flaps remain research candidates.

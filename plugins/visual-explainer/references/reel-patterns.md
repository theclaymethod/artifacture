# Reel Patterns — Brain-Rot-Friendly Fast-Cut Explainer Video

**What this is.** The fast-paced explainer format. 30–60 seconds total. Hard cuts every 1–2 seconds. Burned-in captions. TTS narration. Kinetic typography. Progressive diagram reveal. Designed to hold attention in silent-autoplay feeds.

This format is a sibling of `long-form` (slide-paced dwell scenes). Pick one per render; don't mix.

---

## Two aspect ratios — same format, different canvases

Reel is defined by **pacing and structure** (hard cuts, 7-beat narrative, kinetic typography, burned-in captions), not by orientation. Two canvases are supported; content compresses the same way into either.

| Aspect | Resolution | Template | Where it lives |
|---|---|---|---|
| **9:16 vertical** (default) | 1080 × 1920 | `templates/hyperframes-reel.html` | Shorts, Reels, TikTok — phone silent-autoplay feeds |
| **16:9 landscape** | 1920 × 1080 | `templates/hyperframes-reel-landscape.html` | X/Twitter embeds, LinkedIn, YouTube-embedded, desktop Slack/Discord, conference intro stings |

Pick by asking where the video will be watched. If the primary surface is a feed you'd scroll on a phone, pick `9:16`. If it's embedded in an article, posted to LinkedIn, or played on a desktop screen, pick `16:9`.

### What differs between the two aspects

| | 9:16 | 16:9 |
|---|---|---|
| Safe zone | 100px top, 200px bottom (phone chrome + caption clearance) | 60px top, 140px bottom (caption clearance) |
| Hook stat | fills vertically, stat on top / label below | stat + label side-by-side on one row |
| Claim text | stacked narrow rows, 1 line per phrase | wider rows, 2 lines of 6–8 words |
| Captions | centered pill, bottom 140px | centered pill 48px from bottom, max-width 1400px |
| MECHANISM | vertical stack (before state → after state) | split left/right (native to 16:9) |

### What stays identical

- Beat structure (HOOK → PROBLEM → CONTEXT → MECHANISM → PROOF → RESOLUTION → CTA)
- Cut pacing (hard cuts every 1.2–1.8s during body beats)
- Total duration target (30–60s; default 45s)
- Kinetic typography timing (word/line staggers)
- GSAP constraints (paused timeline, no `Math.random`, no `repeat: -1`, dual-mode gate)
- Caption synchronization to beat boundaries
- TTS + burned-in captions pattern

Pick aspect via the `--aspect=9:16` or `--aspect=16:9` flag on `/generate-video` when `--style=reel`. If the user doesn't specify, ask via `AskUserQuestion` (reel is a Tier 0 command — aspect is a first-class question).

---

## When to Use Reel Format

Pick reel when:
- The audience is scrolling a feed (not sitting through a deck)
- The content can be compressed to a single claim + 3–5 supporting beats
- The hook works in 3 seconds or less
- A narrator can explain each beat in one or two sentences

Pick long-form instead when:
- The content has 8+ distinct ideas
- The audience needs to dwell on a diagram for several seconds
- The piece is intended for a team meeting or onboarding flow
- The narration requires nuance (multiple clauses, qualifications)

If in doubt, ask the user.

---

## Structural Template

A reel is a timeline, not a sequence of slides. Every beat overlaps the next by 200–400ms for a continuous feel, even with hard visual cuts.

```
Time    Beat                     Typical content
─────   ──────────────────────   ──────────────────────────────────────
0.0s    HOOK                     Oversized stat, provocative question, cold-open result
2.0s    PROBLEM                  What's broken; frame the tension in one line
5.0s    CONTEXT                  Why this matters; one sentence, one visual
9.0s    MECHANISM                Progressive diagram reveal; how the thing works
18.0s   PROOF                    Stat, chart, quote, screenshot that validates the claim
25.0s   RESOLUTION               What to do with this / the takeaway in one line
30.0s   CTA                      URL, handle, follow prompt — 2 seconds max
```

This is a template, not a rule. Shorter reels collapse beats; longer ones add a second PROOF or second MECHANISM. Total duration target: 30–45s for max retention, 60s max.

---

## Cut Pacing

- **Hard cuts every 1.2–1.8 seconds during body beats.** The eye needs novelty to stay engaged.
- **Slow during the mechanism.** Diagram reveals can dwell for 3–5 seconds as long as elements are actively animating in.
- **Never cut mid-word of a voiceover line.** Each cut lands on a phrase boundary.
- **No dissolve transitions inside a beat.** Dissolves read as "slideshow" — reserve them for beat-to-beat transitions only, and sparingly.

Use shader transitions from Hyperframes registry (`flash-through-white`, `domain-warp-dissolve`, `grid-pixelate-wipe`) between major beats, not within beats.

---

## Typography Rules

Reel typography is louder and blunter than page or long-form typography.

| Role | Size | Weight | Treatment |
|---|---|---|---|
| Hook stat | 180–260px | 600–700 | Fills the viewport vertically; one element alone on the frame |
| Hook claim | 80–120px | 500 | Two or three lines max; word-by-word stagger |
| Beat title | 60–80px | 500 | Entrance: slide in from right, fade out up |
| Body copy | 32–48px | 400 | One or two lines; never a paragraph |
| Caption (burned-in) | 28–36px | 600 | Bottom third; white on black scrim; word-level highlighting optional |
| Attribution / kicker | 18–22px | 500 | Mono; all-caps; 0.12em tracking |

Body-copy paragraphs belong in long-form, not reel. If the content needs a paragraph, it needs long-form.

---

## Kinetic Typography — the Primary Motion Pattern

Text animates in word-by-word or line-by-line. Rarely character-by-character (that reads as "meme font parade" unless executed carefully).

Recommended GSAP approach (uses SplitText or manual `<span>` wrapping):

```js
// Wrap each word in a <span class="w">...</span> server-side or at build time.
// Avoid runtime DOM manipulation — Hyperframes captures frame-by-frame.

tl.from(".hook .w", {
  y: 80,
  opacity: 0,
  duration: 0.5,
  stagger: 0.04,
  ease: "power3.out",
}, 0.1);

tl.to(".hook .w", {
  y: -40,
  opacity: 0,
  duration: 0.3,
  stagger: 0.02,
  ease: "power2.in",
}, 1.7);
```

Word-by-word is the workhorse. Use line-by-line for longer claims that exceed 5–6 words.

---

## Progressive Diagram Reveal

For the MECHANISM beat. An inline SVG diagram (authored per `diagrams-svg.md` rules) draws itself node-by-node, then arrow-by-arrow, then labels appear last.

Required authoring pattern:

1. Author the final-state SVG using the SVG-primary rules. Run the Removal Test. This is the "end frame."
2. Tag each major element with a class: `.node-1`, `.node-2`, `.arrow-1`, `.label-1`, etc.
3. In the GSAP timeline, build a staged reveal:

```js
// Step 1: nodes fade-scale in, in reading order
tl.from(".node-1", { scale: 0.6, opacity: 0, duration: 0.4, ease: "back.out(1.4)" }, 9.0);
tl.from(".node-2", { scale: 0.6, opacity: 0, duration: 0.4, ease: "back.out(1.4)" }, 9.4);
tl.from(".node-3", { scale: 0.6, opacity: 0, duration: 0.4, ease: "back.out(1.4)" }, 9.8);

// Step 2: arrows stroke-dash in
// (paths must have stroke-dasharray and stroke-dashoffset set to path length)
tl.to(".arrow-1", { strokeDashoffset: 0, duration: 0.6, ease: "power2.inOut" }, 10.4);
tl.to(".arrow-2", { strokeDashoffset: 0, duration: 0.6, ease: "power2.inOut" }, 11.0);

// Step 3: labels appear last, on masking rects
tl.from(".arrow-1-label, .arrow-1-mask", { opacity: 0, duration: 0.3 }, 11.2);
tl.from(".arrow-2-label, .arrow-2-mask", { opacity: 0, duration: 0.3 }, 11.8);

// Step 4: accent focal element pulse on entry
tl.from(".focal", { scale: 0.4, opacity: 0, duration: 0.5, ease: "back.out(2)" }, 12.4);
```

All the shape/grid/focal rules from `diagrams-svg.md` still apply — the animation only changes *how* the final-state diagram arrives on screen, not what the final state looks like. The focal rule (≤ 2 accent uses) is non-negotiable.

---

## Ken Burns + Shader Transitions

For still imagery (screenshots, photos, diagrams between beats):

**Ken Burns.** Subtle pan/zoom on static images so dead time feels alive.
```js
tl.fromTo(".photo", { scale: 1.0, x: 0 }, { scale: 1.12, x: -30, duration: 4.0, ease: "none" }, 5.0);
```
Keep the scale delta small (1.0 → 1.08–1.15). Large deltas look seasick.

**Shader transitions between beats.** Install via `npx hyperframes add <transition-name>` and wrap two beats in the transition's registered block. Recommended starters:
- `flash-through-white` — snappy, hides layout reshuffles
- `domain-warp-dissolve` — higher-energy, for the hook→problem transition
- `grid-pixelate-wipe` — technical-feeling, suits data transitions

One transition per beat boundary. Never stack two. Never use inside a single beat.

---

## TTS + Burned-in Captions

Reel output defaults to silent-autoplay, so captions are not optional — they're how the viewer reads the narration.

### The verbatim-transcript rule

**Captions are a transcript of the narration, not a paraphrase or summary of the visuals.** When a viewer watches with sound on, their eyes read the caption while their ears hear the narration; those two streams must match word-for-word or the mismatch is distracting. When they watch with sound off, the caption IS the narration.

Common failure mode: the author writes captions as "headlines" for each beat ("Pareto leaves are the best tradeoffs") while the narration says something slightly different ("Pareto leaves are the tradeoffs nothing else dominates"). Do not do this. Captions come out of the transcript, not out of the author's head.

**Workflow:** generate TTS → transcribe → build captions from the transcript. Never hand-author caption text.

### Generate narration
```bash
npx hyperframes tts "Narration script here, written as a single paragraph." \
  --voice af_nova \
  --output narration.wav
```
Voice choices ship with the Hyperframes install. `af_nova` is a safe neutral default. The skill can offer a small voice menu via AskUserQuestion if the user hasn't picked.

### Generate word-level transcript
```bash
npx hyperframes transcribe narration.wav --output transcript.json
```
This outputs a JSON array of `{text, start, end}` per word. Keep this file — it's the source of truth for caption copy and timing.

### Derive caption HTML from the transcript
```bash
bash {{skill_dir}}/scripts/captions-from-transcript.sh transcript.json > captions.html
```
The helper groups words into sentences at `.!?` boundaries and emits one `<div class="cap cap-N" data-start="…" data-duration="…">SENTENCE</div>` per sentence, with the sentence text taken verbatim from the transcript. Paste the output into the `.captions` container of the composition.

If a sentence is too long for one on-screen line (roughly > 9 words on 9:16), split it at a natural clause boundary inside the script **before** TTS, so the transcript already chunks the way you want. Don't split after the fact by rewriting the caption.

### Burn captions into the composition
```html
<!-- Audio track (travels separately from any <video>) -->
<audio
  id="narration"
  data-start="0"
  data-duration="45"
  data-track-index="0"
  src="narration.wav"
></audio>

<!-- Caption layer — generated by captions-from-transcript.sh -->
<div class="captions">
  <div class="cap cap-1" data-start="0.03" data-duration="1.57">Agent design is a fitting problem.</div>
  <div class="cap cap-2" data-start="1.63" data-duration="1.08">Hold the model fixed.</div>
  <!-- one per sentence, verbatim from the transcript -->
</div>
```

Caption styling: 36–44px, weight 600, high-contrast on a solid dark pill with generous horizontal padding. Keep it near the bottom of the frame without spanning full width; the caption should read like a focused overlay, not a chrome strip.

### Sync cuts to narration
Narration script lines align with beat boundaries. Write the script first, time it with TTS, then build the visual timeline to match the sentence boundaries in the transcript. Pacing should feel rehearsed, not overdubbed.

---

## Reel-Specific Layout Rules

- **Full-bleed everything.** No gutters, no padded frames, no visible background except the composition's own canvas.
- **Single focal element per frame.** One stat, one headline, one diagram element pulsing. Never three cards competing.
- **Vertical hierarchy.** Primary content in the top two-thirds. Captions in the bottom third. No mixing.
- **Safe zone.** Leave 100px of breathing room top and bottom — phone UI chrome (clock, home bar) overlaps the edges.
- **Contrast checks.** Run `npx hyperframes validate` (WCAG contrast audit) before final render.

---

## Verification After Render

Follow the verification flow from `references/hyperframes.md`:

1. Render at `--quality draft`
2. Extract 3 keyframes (start / mid / end) via `scripts/extract-keyframes.sh`
3. Show the keyframes to the user via the mechanism described in `commands/generate-video.md`
4. On approval, render at `--quality standard` for delivery

Specifically for reels, the 3 keyframes should land on:
- The hook (≤ 2s)
- The middle of the mechanism reveal
- The CTA / resolution

If any keyframe shows text cut off by the phone safe zone, caption illegibility, or a static dead frame, fix before final.

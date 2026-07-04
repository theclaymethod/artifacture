# GSAP Rules for Hyperframes Compositions

GSAP powers every Hyperframes composition's animation timeline. The upstream engine has strict determinism requirements — violating them produces broken renders (hangs, nondeterministic frames, crashes). This file summarizes the rules the skill must obey.

For general GSAP documentation see [greensock.com](https://greensock.com). This file covers only the Hyperframes-specific constraints.

---

## Registration

Every composition's timeline must be registered on `window.__timelines` using the composition ID as the key:

```html
<script>
  const tl = gsap.timeline({ paused: true });
  // ... build the timeline ...
  window.__timelines["my-composition-id"] = tl;
</script>
```

Required constraints:
- `{ paused: true }` — the engine drives playback, not GSAP's autoplay
- Registration must be **synchronous** relative to `DOMContentLoaded`. No `async`, no `setTimeout`, no Promises wrapping the assignment
- One timeline per composition ID
- Composition IDs must match the `data-composition-id` on the composition root

---

## Forbidden APIs and Patterns

These are silent killers. They look like valid GSAP but break in Hyperframes' deterministic frame-seek model.

| Pattern | Why it breaks |
|---|---|
| `Math.random()` anywhere | Each frame re-evaluates; produces noise |
| `Date.now()` / `new Date()` | Capture is not real-time; timestamps drift |
| `repeat: -1` | Infinite tweens never terminate; engine hangs |
| `gsap.ticker.add(...)` callbacks with side effects | Fires on every frame; non-deterministic |
| `element.animate(...)` (Web Animations API) | Engine only tracks GSAP timelines |
| CSS `@keyframes` with `animation-iteration-count: infinite` | Same infinite-loop problem |
| `requestAnimationFrame(...)` manual loops | Fights the engine's seek behavior |
| `tl.play()` / `tl.seek()` from your code | Engine owns these calls |

---

## Allowed Randomness

If deterministic noise is useful (e.g., particle systems, variable easing), use a seeded PRNG:

```js
function seedRand(seed) {
  return function() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}
const rand = seedRand(42);
// Use rand() anywhere you'd otherwise use Math.random()
```

The seed value must be a literal constant — not derived from `Date.now()` or anything that changes between runs.

---

## Looping Patterns

Instead of `repeat: -1`, compute a finite repeat count from the composition's duration:

```js
const loopDuration = 1.2;   // one loop cycle
const totalDuration = 30;   // composition duration (data-duration)
const loops = Math.floor(totalDuration / loopDuration);

tl.to(".dot", {
  x: 200,
  duration: loopDuration,
  repeat: loops,
  ease: "none",
}, 0);
```

---

## Media Element Rules

Inside a Hyperframes composition:

- `<video>` elements must have `muted` and `playsinline` attributes
- Audio should travel as `<audio>` elements, not as the audio track of a `<video>` (even if the source file has both)
- Never call `video.play()`, `audio.play()`, or `.currentTime = …` from your own code — the engine seeks these for you
- `data-track-index` on media elements controls audio mixing ordering; it does NOT affect visual z-order (use CSS `z-index`)

---

## Entrance Animation Patterns

The most common GSAP patterns used in explainer videos:

### Fade-up (text, cards)
```js
tl.from(".title", { y: 40, opacity: 0, duration: 0.6, ease: "power2.out" }, 0.2);
```

### Scale-in (stats, badges)
```js
tl.from(".stat", { scale: 0.6, opacity: 0, duration: 0.5, ease: "back.out(1.7)" }, 0.5);
```

### Stagger (lists, grids, word-by-word)
```js
tl.from(".word", { y: 30, opacity: 0, duration: 0.4, ease: "power2.out", stagger: 0.05 }, 1.0);
```

### Stroke-in (SVG paths — arrows, underlines, progress)
```js
// Ensure the path has stroke-dasharray and stroke-dashoffset set equal to pathLength
tl.to(".path", { strokeDashoffset: 0, duration: 1.2, ease: "power2.inOut" }, 1.5);
```

### Count-up (numbers)
```js
const counter = { val: 0 };
tl.to(counter, {
  val: 4200,
  duration: 1.6,
  ease: "power2.out",
  onUpdate: () => {
    document.querySelector(".count").textContent = Math.floor(counter.val).toLocaleString();
  },
}, 2.0);
```

---

## Timeline Composition for Hyperframes

A common pattern: each logical scene gets a labeled position marker, and children animate relative to those labels.

```js
const tl = gsap.timeline({ paused: true });

tl.addLabel("scene1", 0)
  .from(".scene1 .title", { y: 40, opacity: 0, duration: 0.6 }, "scene1+=0.2")
  .from(".scene1 .body",  { opacity: 0, duration: 0.5 },        "scene1+=0.8");

tl.addLabel("scene2", 5)
  .from(".scene2 .stat",  { scale: 0.5, opacity: 0, duration: 0.6 }, "scene2+=0.2");

window.__timelines["my-reel"] = tl;
```

Keep the timeline finite. The engine reads `data-duration` on the composition root to know when to stop capturing.

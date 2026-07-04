# Slide Deck Patterns

CSS patterns, JS engine, slide type layouts, transitions, navigation chrome, and curated presets for self-contained HTML slide presentations. All slides are viewport-fit (100dvh), single-file, same philosophy as scrollable pages.

**When to use slides:** Only when the user explicitly requests them — `/generate-slides`, `--slides` flag on an existing prompt, or natural language like "as a slide deck." Never auto-select slide format.

**Before generating**, also read `./css-patterns.md` for shared patterns (Mermaid zoom controls, overflow protection, depth tiers, status badges) and `./libraries.md` for Mermaid theming, Chart.js, and font pairings. Those patterns apply to slides too — this file adds slide-specific patterns on top.

## Planning a Deck from a Source Document

When converting a plan, spec, review, or any structured document into slides, follow this process before writing any HTML. Skipping it leads to polished-looking decks that silently drop 30–40% of the source material.

**Step 1 — Inventory the source.** Read the entire source document and enumerate every section, subsection, card, table row, decision, specification, collapsible detail, and footnote. Count them. A plan with 7 sections, 6 decision cards, a 7-row file table, 4 presets, 6 technique guides, and an engine spec with 3 sub-specs and 2 collapsibles is ~25 distinct content items that all need slide real estate.

**Step 2 — Map source to slides.** Assign each inventory item to one or more slides. Every item must appear somewhere. Rules:
- If a section has 6 decisions, all 6 need slides — not the 2 that fit on one split slide.
- If a table has 7 rows, all 7 rows show up.
- Collapsible/expandable details in the source are not optional in the deck — they become their own slides.
- Subsections with multiple cards (e.g., "6 Visual Technique cards") may need 2–3 slides to cover at readable density.
- Each plan section typically needs a divider slide + 1–3 content slides depending on density.

**Step 3 — Choose layouts.** For each planned slide, pick a slide type and spatial composition. Vary across the sequence (see Compositional Variety below). This is where narrative pacing happens — alternate dense slides with sparse ones.

**Step 4 — Plan images.** Run `which surf`. If surf-cli is available, plan 2–4 generated images for the deck. At minimum, target the **title slide** (16:9 background that sets the visual tone) and **one full-bleed slide** (immersive background for a key moment). Content slides with conceptual topics also benefit from a 1:1 illustration in the aside area. Generate these images early — before writing HTML — so you can embed them as base64 data URIs. See the Proactive Imagery section below for the full workflow. If surf isn't available, degrade to CSS gradients and SVG decorations — note the fallback in a comment but don't error.

**Step 5 — Verify before writing HTML.** Scan the inventory from Step 1. Is anything unmapped? Would a reader of the source document notice something missing from the deck? If yes, add slides. A source document with 7 sections typically produces 18–25 slides, not 10–13.

**The test:** After generating the deck, a reader who has never seen the source document should be able to reconstruct every major point from the slides alone. If they'd miss entire sections, the deck is incomplete.

## Slide Engine Base

The deck is a scroll-snap container. Each slide is exactly one viewport tall.

```html
<body>
<div class="deck">
  <section class="slide slide--title"> ... </section>
  <section class="slide slide--content"> ... </section>
  <section class="slide slide--diagram"> ... </section>
  <!-- one <section> per slide -->
</div>
</body>
```

```css
/* Scroll-snap container */
.deck {
  height: 100dvh;
  overflow-y: auto;
  scroll-snap-type: y mandatory;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}

/* Individual slide */
.slide {
  height: 100dvh;
  scroll-snap-align: start;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: clamp(40px, 6vh, 80px) clamp(40px, 8vw, 120px);
  isolation: isolate; /* contain z-index stacking */
}
```

## Typography Scale

Slide typography is 2–3× larger than scrollable pages. Page-sized text on a viewport-sized canvas looks like a mistake.

```css
.slide__display {
  font-size: clamp(48px, 10vw, 120px);
  font-weight: 800;
  letter-spacing: -3px;
  line-height: 0.95;
  text-wrap: balance;
}

.slide__heading {
  font-size: clamp(28px, 5vw, 48px);
  font-weight: 700;
  letter-spacing: -1px;
  line-height: 1.1;
  text-wrap: balance;
}

.slide__body {
  font-size: clamp(16px, 2.2vw, 24px);
  line-height: 1.6;
  text-wrap: pretty;
}

.slide__label {
  font-family: var(--font-mono);
  font-size: clamp(10px, 1.2vw, 14px);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--text-dim);
}

.slide__subtitle {
  font-family: var(--font-mono);
  font-size: clamp(14px, 1.8vw, 20px);
  color: var(--text-dim);
  letter-spacing: 0.5px;
}
```

| Element | Size range | Notes |
|---------|-----------|-------|
| Display (title slides) | 48–120px | `10vw` preferred, weight 800 |
| Section numbers | 100–240px | Ultra-light (weight 200), decorative |
| Headings | 28–48px | `5vw` preferred, weight 700 |
| Body / bullets | 16–24px | `2.2vw` preferred, 1.6 line-height |
| Code blocks | 14–18px | `1.8vw` preferred, mono |
| Quotes | 24–48px | `4vw` preferred, serif italic |
| Labels / captions | 10–14px | Mono, uppercase, dimmed |

## Cinematic Transitions

IntersectionObserver adds `.visible` when a slide enters the viewport. Slides animate in once and stay visible when scrolling back.

```css
/* Slide entrance — fade + lift + subtle scale */
.slide {
  opacity: 0;
  transform: translateY(40px) scale(0.98);
  transition:
    opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide.visible {
  opacity: 1;
  transform: none;
}

/* Staggered child reveals — add .reveal to each content element */
.slide .reveal {
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide.visible .reveal {
  opacity: 1;
  transform: none;
}

/* Stagger delays — up to 6 children per slide */
.slide.visible .reveal:nth-child(1) { transition-delay: 0.1s; }
.slide.visible .reveal:nth-child(2) { transition-delay: 0.2s; }
.slide.visible .reveal:nth-child(3) { transition-delay: 0.3s; }
.slide.visible .reveal:nth-child(4) { transition-delay: 0.4s; }
.slide.visible .reveal:nth-child(5) { transition-delay: 0.5s; }
.slide.visible .reveal:nth-child(6) { transition-delay: 0.6s; }

@media (prefers-reduced-motion: reduce) {
  .slide,
  .slide .reveal {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
  }
}
```

## Navigation Chrome

All navigation is `position: fixed` with high z-index, layered above slides. Styled to be visible on any background.

### Progress Bar

```css
.deck-progress {
  position: fixed;
  top: 0;
  left: 0;
  height: 3px;
  background: var(--accent);
  z-index: 100;
  transition: width 0.3s ease;
  pointer-events: none;
}
```

### Nav Dots

```css
.deck-dots {
  position: fixed;
  right: clamp(12px, 2vw, 24px);
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 100;
}

.deck-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-dim);
  opacity: 0.3;
  border: none;
  padding: 0;
  cursor: pointer;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.deck-dot:hover {
  opacity: 0.6;
}

.deck-dot.active {
  opacity: 1;
  transform: scale(1.5);
  background: var(--accent);
}
```

### Slide Counter

```css
.deck-counter {
  position: fixed;
  bottom: clamp(12px, 2vh, 24px);
  right: clamp(12px, 2vw, 24px);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-dim);
  z-index: 100;
  font-variant-numeric: tabular-nums;
}
```

### Keyboard Hints

Auto-fade after first interaction or after 4 seconds.

```css
.deck-hints {
  position: fixed;
  bottom: clamp(12px, 2vh, 24px);
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-dim);
  opacity: 0.6;
  z-index: 100;
  transition: opacity 0.5s ease;
  white-space: nowrap;
}

.deck-hints.faded {
  opacity: 0;
  pointer-events: none;
}
```

### Chrome Visibility on Mixed Backgrounds

For decks where some slides are light and some dark (especially full-bleed slides), nav chrome needs to remain visible. Two approaches:

```css
/* Approach A: subtle backdrop on chrome elements */
.deck-dots,
.deck-counter {
  background: color-mix(in srgb, var(--bg) 70%, transparent 30%);
  padding: 6px;
  border-radius: 20px;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

/* Approach B: text shadow for legibility on any background */
.deck-counter,
.deck-hints {
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
```

## SlideEngine JavaScript

Add once at the end of the page. Handles navigation, chrome updates, and scroll-triggered reveals. Event delegation ensures slide-internal interactions (Mermaid zoom, scrollable code, overflow tables) don't trigger slide navigation.

```javascript
class SlideEngine {
  constructor() {
    this.deck = document.querySelector('.deck');
    this.slides = [...document.querySelectorAll('.slide')];
    this.current = 0;
    this.total = this.slides.length;
    this.buildChrome();
    this.bindEvents();
    this.observe();
    this.update();
  }

  buildChrome() {
    // Progress bar
    var bar = document.createElement('div');
    bar.className = 'deck-progress';
    document.body.appendChild(bar);
    this.bar = bar;

    // Nav dots
    var dots = document.createElement('div');
    dots.className = 'deck-dots';
    var self = this;
    this.slides.forEach(function(_, i) {
      var d = document.createElement('button');
      d.className = 'deck-dot';
      d.title = 'Slide ' + (i + 1);
      d.onclick = function() { self.goTo(i); };
      dots.appendChild(d);
    });
    document.body.appendChild(dots);
    this.dots = [].slice.call(dots.children);

    // Counter
    var ctr = document.createElement('div');
    ctr.className = 'deck-counter';
    document.body.appendChild(ctr);
    this.counter = ctr;

    // Keyboard hints
    var hints = document.createElement('div');
    hints.className = 'deck-hints';
    hints.textContent = '\u2190 \u2192 or scroll to navigate';
    document.body.appendChild(hints);
    this.hints = hints;
    this.hintTimer = setTimeout(function() {
      hints.classList.add('faded');
    }, 4000);
  }

  bindEvents() {
    var self = this;
    // Keyboard — skip if focus is inside interactive content
    document.addEventListener('keydown', function(e) {
      if (e.target.closest('.mermaid-wrap, .table-scroll, .code-scroll, input, textarea, [contenteditable]')) return;
      if (['ArrowDown', 'ArrowRight', ' ', 'PageDown'].includes(e.key)) {
        e.preventDefault(); self.next();
      } else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault(); self.prev();
      } else if (e.key === 'Home') {
        e.preventDefault(); self.goTo(0);
      } else if (e.key === 'End') {
        e.preventDefault(); self.goTo(self.total - 1);
      }
      self.fadeHints();
    });

    // Touch swipe
    var touchY;
    this.deck.addEventListener('touchstart', function(e) {
      touchY = e.touches[0].clientY;
    }, { passive: true });
    this.deck.addEventListener('touchend', function(e) {
      var dy = touchY - e.changedTouches[0].clientY;
      if (Math.abs(dy) > 50) { dy > 0 ? self.next() : self.prev(); }
    });
  }

  observe() {
    var self = this;
    var obs = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          self.current = self.slides.indexOf(entry.target);
          self.update();
        }
      });
    }, { threshold: 0.5 });
    this.slides.forEach(function(s) { obs.observe(s); });
  }

  goTo(i) {
    this.slides[Math.max(0, Math.min(i, this.total - 1))]
      .scrollIntoView({ behavior: 'smooth' });
  }

  next() { if (this.current < this.total - 1) this.goTo(this.current + 1); }
  prev() { if (this.current > 0) this.goTo(this.current - 1); }

  update() {
    this.bar.style.width = ((this.current + 1) / this.total * 100) + '%';
    var self = this;
    this.dots.forEach(function(d, i) { d.classList.toggle('active', i === self.current); });
    this.counter.textContent = (this.current + 1) + ' / ' + this.total;
  }

  fadeHints() {
    clearTimeout(this.hintTimer);
    this.hints.classList.add('faded');
  }
}
```

**Usage:** Instantiate after the DOM is ready and any libraries (Mermaid, Chart.js) have rendered. Always call `autoFit()` before `new SlideEngine()` so content is sized correctly before intersection observers fire.

```html
<script>
  // After Mermaid/Chart.js initialization (if used), or at end of <body>:
  document.addEventListener('DOMContentLoaded', function() {
    autoFit();
    new SlideEngine();
  });
</script>
```

## Auto-Fit

A single post-render function that handles all known content overflow cases. Agents can't perfectly predict how text reflows at every viewport size, so `autoFit()` is a required safety net. Call it after Mermaid/Chart.js render but before SlideEngine init.

```javascript
function autoFit() {
  // Mermaid SVGs: fill container instead of rendering at intrinsic size
  document.querySelectorAll('.mermaid svg').forEach(function(svg) {
    svg.removeAttribute('height');
    svg.style.width = '100%';
    svg.style.maxWidth = '100%';
    svg.style.height = 'auto';
    svg.parentElement.style.width = '100%';
  });

  // KPI values: visually scale down text that overflows card width
  document.querySelectorAll('.slide__kpi-val').forEach(function(el) {
    if (el.scrollWidth > el.clientWidth) {
      var s = el.clientWidth / el.scrollWidth;
      el.style.transform = 'scale(' + s + ')';
      el.style.transformOrigin = 'left top';
    }
  });

  // Blockquotes: reduce font proportionally for long text
  document.querySelectorAll('.slide--quote blockquote').forEach(function(el) {
    var len = el.textContent.trim().length;
    if (len > 100) {
      var scale = Math.max(0.5, 100 / len);
      var fs = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = Math.max(16, Math.round(fs * scale)) + 'px';
    }
  });
}
```

Three cases, one function:
- **Mermaid:** SVGs render with fixed dimensions inside flex containers — force them to fill available width.
- **KPI values:** Long text strings at hero scale overflow card boundaries — `transform: scale()` shrinks visually without reflow.
- **Blockquotes:** Quotes longer than ~100 characters get proportionally smaller font. The 0.5 floor prevents unreadably small text; if it needs more than 50% shrink, it should have been a content slide.

## Slide Type Layouts

Each type has a defined HTML structure and CSS layout. The agent can adapt colors, fonts, and spacing per aesthetic, but the structural patterns stay consistent.

### Title Slide

Full-viewport hero. Background treatment via gradient, texture, or surf-generated image. 80–120px display type.

```html
<section class="slide slide--title">
  <svg class="slide__decor" ...><!-- optional decorative accent --></svg>
  <div class="slide__content reveal">
    <h1 class="slide__display">Deck Title</h1>
    <p class="slide__subtitle reveal">Subtitle or date</p>
  </div>
</section>
```

```css
.slide--title {
  justify-content: center;
  align-items: center;
  text-align: center;
}
```

### Section Divider

Oversized decorative number (200px+, ultra-light weight) with heading. Breathing room between topics. SVG accent marks optional.

```html
<section class="slide slide--divider">
  <span class="slide__number">02</span>
  <div class="slide__content">
    <h2 class="slide__heading reveal">Section Title</h2>
    <p class="slide__subtitle reveal">Optional subheading</p>
  </div>
</section>
```

```css
.slide--divider {
  justify-content: center;
}

.slide--divider .slide__number {
  font-size: clamp(100px, 22vw, 260px);
  font-weight: 200;
  line-height: 0.85;
  opacity: 0.08;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -55%);
  pointer-events: none;
  font-variant-numeric: tabular-nums;
}
```

### Content Slide

Heading + bullets or paragraphs. Asymmetric layout — content offset to one side. Max 5–6 bullets (2 lines each).

```html
<section class="slide slide--content">
  <div class="slide__inner">
    <div class="slide__text">
      <h2 class="slide__heading reveal">Heading</h2>
      <ul class="slide__bullets">
        <li class="reveal">First point</li>
        <li class="reveal">Second point</li>
      </ul>
    </div>
    <div class="slide__aside reveal">
      <!-- optional: illustration, icon, mini-diagram, accent SVG -->
    </div>
  </div>
</section>
```

```css
.slide--content .slide__inner {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: clamp(24px, 4vw, 60px);
  align-items: center;
  width: 100%;
}

/* For right-heavy variant: swap to 2fr 3fr */
.slide--content .slide__bullets {
  list-style: none;
  padding: 0;
}

.slide--content .slide__bullets li {
  padding: 8px 0 8px 20px;
  position: relative;
  font-size: clamp(16px, 2vw, 22px);
  line-height: 1.6;
  color: var(--text-dim);
}

.slide--content .slide__bullets li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 18px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}
```

### Split Slide

Asymmetric two-panel (60/40 or 70/30). Before/after, text+diagram, text+image. Each panel has its own background tier. Zero padding on the slide itself — panels fill edge to edge.

```html
<section class="slide slide--split">
  <div class="slide__panels">
    <div class="slide__panel slide__panel--primary">
      <h2 class="slide__heading reveal">Left Panel</h2>
      <div class="slide__body reveal">Content...</div>
    </div>
    <div class="slide__panel slide__panel--secondary">
      <!-- diagram, image, code block, or contrasting content -->
    </div>
  </div>
</section>
```

```css
.slide--split {
  padding: 0;
}

.slide--split .slide__panels {
  display: grid;
  grid-template-columns: 3fr 2fr;
  height: 100%;
}

.slide--split .slide__panel {
  padding: clamp(40px, 6vh, 80px) clamp(32px, 4vw, 60px);
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.slide--split .slide__panel--primary {
  background: var(--surface);
}

.slide--split .slide__panel--secondary {
  background: var(--surface2);
}
```

### Diagram Slide

Full-viewport Mermaid diagram. Max 8–10 nodes (presentation scale — fewer, larger than page diagrams). Node labels at 18px+, edges at 2px+. Zoom controls from `css-patterns.md` apply here.

**When to use Mermaid vs CSS in slides.** Mermaid renders SVGs at a fixed size the agent can't control — node dimensions are set by the library, not by CSS. This creates a recurring problem: small diagrams (fewer than ~7 nodes, no branching) render as tiny elements floating in a huge viewport with acres of dead space. The rule:

- **Use Mermaid** for complex graphs: 8+ nodes, branching paths, cycles, multiple edge crossings — anything where automatic edge routing saves real effort.
- **Use CSS Pipeline** (below) for simple linear flows: A → B → C → D sequences, build steps, deployment stages. CSS cards give full control over sizing, typography, and fill the viewport naturally.
- **Never leave a small Mermaid diagram alone on a slide.** If the diagram is small, either switch to CSS, or pair it with supporting content (description cards, bullet annotations, a summary panel) in a split layout. A slide with a tiny diagram and empty space is a failed slide.

**Mermaid centering fix.** When you do use Mermaid, add `display: flex; align-items: center; justify-content: center;` to `.mermaid-wrap` so the SVG centers within its container instead of hugging the top-left corner. Change `transform-origin` to `center center` so zoom radiates from the middle.

```html
<section class="slide slide--diagram">
  <h2 class="slide__heading reveal">Diagram Title</h2>
  <div class="mermaid-wrap reveal" style="flex:1; min-height:0;">
    <div class="zoom-controls">
      <button onclick="zoomDiagram(this,1.2)" title="Zoom in">+</button>
      <button onclick="zoomDiagram(this,0.8)" title="Zoom out">&minus;</button>
      <button onclick="resetZoom(this)" title="Reset">&#8634;</button>
      <button onclick="openDiagramFullscreen(this)" title="Open full size in new tab">&#x26F6;</button>
    </div>
    <pre class="mermaid">
      graph TD
        A --> B
    </pre>
  </div>
</section>
```

**Click to expand.** Clicking anywhere on the diagram (without dragging) opens it full-size in a new browser tab. The expand button (⛶) provides the same functionality for discoverability.

```css
.slide--diagram {
  padding: clamp(24px, 4vh, 48px) clamp(24px, 4vw, 60px);
}

.slide--diagram .slide__heading {
  margin-bottom: clamp(8px, 1.5vh, 20px);
}

.slide--diagram .mermaid-wrap {
  border-radius: 12px;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.slide--diagram .mermaid-wrap .mermaid {
  transform-origin: center center;
}
```

**Auto-fit SVG to container.** Mermaid renders SVGs with fixed dimensions and an inline `max-width` style that keeps diagrams tiny inside large slides. The `autoFit()` function (see above) handles this at runtime. Keep the CSS as a belt-and-suspenders fallback:

```css
.slide--diagram .mermaid svg {
  width: 100% !important;
  height: auto !important;
  max-width: 100% !important;
}
```

**Mermaid overrides for presentation scale** (add alongside the standard Mermaid CSS overrides from `libraries.md`):

```css
.slide--diagram .mermaid .nodeLabel {
  font-size: 18px !important;
}

.slide--diagram .mermaid .edgeLabel {
  font-size: 14px !important;
}

.slide--diagram .mermaid .node rect,
.slide--diagram .mermaid .node circle,
.slide--diagram .mermaid .node polygon {
  stroke-width: 2px;
}

.slide--diagram .mermaid .edge-pattern-solid {
  stroke-width: 2px;
}
```

### CSS Pipeline Slide

For simple linear flows (build steps, deployment stages, data pipelines) where Mermaid would render too small. CSS cards with arrow connectors give full control over sizing and fill the viewport naturally. Each step card expands to fill available space via `flex: 1`.

```html
<section class="slide" style="background-image:radial-gradient(...);">
  <p class="slide__label reveal">Pipeline Label</p>
  <h2 class="slide__heading reveal">Pipeline Title</h2>
  <div class="pipeline reveal">
    <div class="pipeline__step" style="border-top-color:var(--accent);">
      <div class="pipeline__num">01</div>
      <div class="pipeline__name">Step Name</div>
      <div class="pipeline__desc">What this step produces or does</div>
      <div class="pipeline__file">output-file.md</div>
    </div>
    <div class="pipeline__arrow">
      <svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 12h14m-4-4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div class="pipeline__step"> ... </div>
    <!-- repeat step + arrow pairs -->
  </div>
</section>
```

```css
.pipeline {
  display: flex;
  align-items: stretch;
  gap: 0;
  flex: 1;
  min-height: 0;
  margin-top: clamp(12px, 2vh, 24px);
}

.pipeline__step {
  flex: 1;
  background: var(--surface);
  border: 1px solid var(--border);
  border-top: 3px solid var(--accent);
  border-radius: 10px;
  padding: clamp(14px, 2.5vh, 28px) clamp(12px, 1.5vw, 22px);
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow-wrap: break-word;
}

.pipeline__num {
  font-size: clamp(10px, 1.2vw, 13px);
  font-weight: 600;
  color: var(--accent);
  letter-spacing: 1px;
}

.pipeline__name {
  font-size: clamp(16px, 2vw, 24px);
  font-weight: 700;
  margin: clamp(4px, 0.8vh, 8px) 0;
}

.pipeline__desc {
  font-size: clamp(12px, 1.3vw, 16px);
  color: var(--text-dim);
  line-height: 1.5;
  flex: 1;
}

.pipeline__file {
  font-size: clamp(10px, 1.1vw, 12px);
  color: var(--accent);
  background: var(--accent-dim);
  padding: 3px 8px;
  border-radius: 4px;
  margin-top: clamp(8px, 1.5vh, 16px);
  align-self: flex-start;
}

.pipeline__arrow {
  display: flex;
  align-items: center;
  padding: 0 clamp(3px, 0.4vw, 6px);
  color: var(--accent);
  flex-shrink: 0;
  opacity: 0.4;
}

@media (max-width: 768px) {
  .pipeline { flex-direction: column; }
  .pipeline__arrow { justify-content: center; padding: 4px 0; transform: rotate(90deg); }
}
```

Each `.pipeline__step` uses `flex: 1` to fill available width equally, and the pipeline container itself uses `flex: 1` to fill available vertical space in the slide. Step cards stretch to fill, so the content isn't floating in empty space. The `.pipeline__file` badge at the bottom anchors each card and adds a practical detail. Max 5–6 steps — beyond that, split across two slides.

### Dashboard Slide

KPI cards at presentation scale (48–64px hero numbers). Mini-charts via Chart.js or SVG sparklines. Max 6 KPIs.

```html
<section class="slide slide--dashboard">
  <h2 class="slide__heading reveal">Metrics Overview</h2>
  <div class="slide__kpis">
    <div class="slide__kpi reveal">
      <div class="slide__kpi-val" style="color:var(--accent)">247</div>
      <div class="slide__kpi-label">Lines Added</div>
    </div>
    <!-- more KPI cards -->
  </div>
</section>
```

```css
.slide--dashboard .slide__kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(clamp(140px, 20vw, 220px), 1fr));
  gap: clamp(12px, 2vw, 24px);
}

.slide__kpi {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: clamp(16px, 3vh, 32px) clamp(16px, 2vw, 24px);
  min-width: 0;
  overflow: hidden;
}

.slide__kpi-val {
  font-size: clamp(36px, 6vw, 64px);
  font-weight: 800;
  letter-spacing: -1.5px;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.slide__kpi-label {
  font-family: var(--font-mono);
  font-size: clamp(9px, 1.2vw, 13px);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--text-dim);
  margin-top: 8px;
}
```

**KPI hero values should be short** — numbers, percentages, 1–3 word labels. Ideal length is 1–6 characters at hero scale. Longer strings like `store=false` break the layout at 64px. If you must show a longer value, put it in the label or body text instead. The `autoFit()` function (see below) will scale down overflows as a safety net.

### Table Slide

18–20px cell text for projection readability. Max 8 rows per slide — overflow paginates to the next slide. Stronger alternating row contrast than page tables.

```html
<section class="slide slide--table">
  <h2 class="slide__heading reveal">Data Title</h2>
  <div class="table-wrap reveal" style="flex:1; min-height:0;">
    <div class="table-scroll">
      <table class="data-table"> ... </table>
    </div>
  </div>
</section>
```

```css
.slide--table {
  padding: clamp(24px, 4vh, 48px) clamp(24px, 4vw, 60px);
}

.slide--table .data-table {
  font-size: clamp(14px, 1.8vw, 20px);
}

.slide--table .data-table th {
  font-size: clamp(10px, 1.3vw, 14px);
  padding: clamp(8px, 1.5vh, 14px) clamp(12px, 2vw, 20px);
}

.slide--table .data-table td {
  padding: clamp(10px, 1.5vh, 16px) clamp(12px, 2vw, 20px);
}
```

### Code Slide

18px mono on a recessed dark background. Max 10 lines. Floating filename label. Centered on the viewport for focus.

```html
<section class="slide slide--code">
  <h2 class="slide__heading reveal">What Changed</h2>
  <div class="slide__code-block reveal">
    <span class="slide__code-filename">worker.ts</span>
    <pre><code>function processQueue(items) {
  // highlighted code here
}</code></pre>
  </div>
</section>
```

```css
.slide--code {
  align-items: center;
}

.slide__code-block {
  background: var(--code-bg, #1a1a2e);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: clamp(24px, 4vh, 48px) clamp(24px, 4vw, 48px);
  max-width: 900px;
  width: 100%;
  position: relative;
}

.slide__code-filename {
  position: absolute;
  top: -12px;
  left: 24px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 4px;
  background: var(--accent);
  color: var(--bg);
}

.slide__code-block pre {
  margin: 0;
  overflow-x: auto;
}

.slide__code-block code {
  font-family: var(--font-mono);
  font-size: clamp(14px, 1.6vw, 18px);
  line-height: 1.7;
  color: var(--code-text, #e6edf3);
}
```

### Quote Slide

36–48px serif with dramatic line-height. Oversized quotation mark as SVG or typographic decoration. Generous whitespace is the design.

```html
<section class="slide slide--quote">
  <div class="slide__quote-mark reveal">&ldquo;</div>
  <blockquote class="reveal">
    The best code is the code you don't have to write.
  </blockquote>
  <cite class="reveal">&mdash; Someone Wise</cite>
</section>
```

```css
.slide--quote {
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: clamp(60px, 10vh, 120px) clamp(60px, 12vw, 200px);
}

.slide__quote-mark {
  font-size: clamp(80px, 14vw, 180px);
  line-height: 0.5;
  opacity: 0.08;
  font-family: Georgia, serif;
  pointer-events: none;
  margin-bottom: -20px;
}

.slide--quote blockquote {
  font-size: clamp(24px, 4vw, 48px);
  font-weight: 400;
  line-height: 1.35;
  font-style: italic;
  margin: 0;
}

.slide--quote cite {
  font-family: var(--font-mono);
  font-size: clamp(11px, 1.4vw, 14px);
  font-style: normal;
  margin-top: clamp(16px, 3vh, 32px);
  display: block;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--text-dim);
}
```

### Full-Bleed Slide

Background image (surf-generated or CSS gradient) dominates the viewport. Text overlay with gradient scrim ensuring contrast. Zero slide padding.

```html
<section class="slide slide--bleed">
  <div class="slide__bg" style="background-image:url('data:image/png;base64,...')"></div>
  <div class="slide__scrim"></div>
  <div class="slide__content">
    <h2 class="slide__heading reveal">Headline Over Image</h2>
    <p class="slide__subtitle reveal">Supporting text</p>
  </div>
</section>
```

```css
.slide--bleed {
  padding: 0;
  justify-content: flex-end;
  color: #ffffff;
}

.slide__bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  z-index: 0;
}

.slide__scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.1) 50%, transparent 100%);
  z-index: 1;
}

.slide--bleed .slide__content {
  position: relative;
  z-index: 2;
  padding: clamp(40px, 6vh, 80px) clamp(40px, 8vw, 120px);
}

/* When no generated image, use a bold CSS gradient background */
.slide__bg--gradient {
  background: linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 60%, var(--bg) 40%) 100%);
}
```

## Decorative SVG Elements

Inline SVG accents lift slides from functional to editorial. Use sparingly — one or two per slide, never on every slide.

### Corner Accent

```html
<!-- Top-right corner mark -->
<svg class="slide__decor slide__decor--corner" width="120" height="120" viewBox="0 0 120 120">
  <line x1="120" y1="0" x2="120" y2="40" stroke="var(--accent)" stroke-width="2" opacity="0.2"/>
  <line x1="80" y1="0" x2="120" y2="0" stroke="var(--accent)" stroke-width="2" opacity="0.2"/>
</svg>
```

```css
.slide__decor {
  position: absolute;
  pointer-events: none;
  z-index: 0;
}

.slide__decor--corner {
  top: 0;
  right: 0;
}
```

### Section Divider Mark

```html
<!-- Horizontal rule with diamond -->
<svg class="slide__decor slide__decor--divider" width="200" height="20" viewBox="0 0 200 20">
  <line x1="0" y1="10" x2="85" y2="10" stroke="var(--accent)" stroke-width="1" opacity="0.3"/>
  <rect x="92" y="3" width="14" height="14" transform="rotate(45 99 10)" fill="none" stroke="var(--accent)" stroke-width="1" opacity="0.3"/>
  <line x1="115" y1="10" x2="200" y2="10" stroke="var(--accent)" stroke-width="1" opacity="0.3"/>
</svg>
```

### Geometric Background Pattern

```css
/* Faint grid dots behind a slide */
.slide--with-grid::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, var(--border) 1px, transparent 1px);
  background-size: 32px 32px;
  opacity: 0.5;
  pointer-events: none;
  z-index: 0;
}
```

### Per-Slide Background Variation

Vary gradient direction and accent glow position across slides to create visual rhythm. Don't use a uniform background for every slide.

```css
/* Vary these per slide via inline style or nth-child */
.slide:nth-child(odd) {
  background-image: radial-gradient(ellipse at 20% 80%, var(--accent-dim) 0%, transparent 50%);
}

.slide:nth-child(even) {
  background-image: radial-gradient(ellipse at 80% 20%, var(--accent-dim) 0%, transparent 50%);
}
```

## Proactive Imagery

Slides should reach for visuals before defaulting to text alone. If a slide could be more compelling with an image, chart, or diagram, add one.

**surf-cli integration:** Check `which surf` at the start of every slide deck generation. If available, **generate 2–4 images minimum** for any deck over 10 slides. This is not optional when surf is available — CSS gradients alone leave decks visually flat. Target these slides in priority order:

1. **Title slide** (always): background image that sets the deck's visual tone. Match the topic and palette. Use `--aspect-ratio 16:9`. Prompt example: "abstract dark geometric pattern with green accent lines, technical and minimal" for Terminal Mono preset.
2. **Full-bleed slide** (always if deck has one): immersive background for the deck's visual anchor moment. Style should match the preset — photo-realistic for Midnight Editorial, abstract/geometric for Swiss Clean, circuit-board or terminal aesthetic for Terminal Mono.
3. **Content slides with conceptual topics** (1–2 if the deck has room): illustration in the `.slide__aside` area for slides about abstract concepts. Use `--aspect-ratio 1:1`.

**Generate images before writing HTML** so they're ready to embed. The workflow:

```bash
# Check availability
which surf

# Generate (one per target slide)
surf gemini "descriptive prompt matching deck palette" --generate-image /tmp/ve-slide-title.png --aspect-ratio 16:9

# Base64 encode for self-containment (macOS)
TITLE_IMG=$(base64 -i /tmp/ve-slide-title.png)
# Linux: TITLE_IMG=$(base64 -w 0 /tmp/ve-slide-title.png)

# Embed in the slide
# <div class="slide__bg" style="background-image:url('data:image/png;base64,${TITLE_IMG}')"></div>

# Clean up
rm /tmp/ve-slide-title.png
```

**Prompt craft for slides:** Be specific about style, dominant colors, and mood. Pull colors from the preset's CSS variables. Examples:
- Terminal Mono: "dark abstract circuit board pattern, green (#50fa7b) traces on near-black (#0a0e14), minimal, technical"
- Midnight Editorial: "deep navy abstract composition, warm gold accent light, cinematic depth of field, premium editorial feel"
- Warm Signal: "warm cream textured paper with terracotta geometric accents, confident modern design"

**When surf fails or isn't available:** Degrade gracefully to CSS gradients and SVG decorations. Use the `.slide__bg--gradient` pattern with bold `linear-gradient` or `radial-gradient` backgrounds. The deck should stand on its own visually without generated images — they enhance, they don't carry. Note the fallback in an HTML comment (`<!-- surf unavailable, using CSS gradient fallback -->`) so future edits know to retry.

**Inline data visualizations:** Proactively add SVG sparklines next to numbers, mini-charts on dashboard slides, and small Mermaid diagrams on split slides even when not explicitly requested. A number with a sparkline next to it tells a better story than a number alone.

**When to skip images:** If surf isn't available, degrade gracefully — use CSS gradients and SVG decorations instead. Never error on missing surf. Pure structural or data-heavy decks (code reviews, table comparisons) may not need generated images.

## Compositional Variety

Consecutive slides must vary their spatial approach. Three centered slides in a row means push one off-axis.

**Composition patterns to alternate between:**
- Centered (title slides, quotes)
- Left-heavy: content on the left 60%, breathing room on the right
- Right-heavy: content on the right 60%, visual or whitespace on the left
- Edge-aligned: content pushed to bottom or top, large empty space opposite
- Split: two distinct panels filling the viewport
- Full-bleed: background dominates, minimal overlaid text

The agent should plan the slide sequence considering layout rhythm, not just content order. When outlining a deck, assign a composition to each slide before writing HTML.

## Presentation Readability

Slides get projected, screen-shared, viewed at distance. Design accordingly:

- **Minimum body text: 16px.** Nothing smaller except labels and captions.
- **One focal point per slide.** Not three competing elements.
- **Higher contrast than pages.** Dimmed text (`--text-dim`) should still be easily readable at distance — test against the background.
- **Nav chrome opacity.** Dots and progress bar must be visible on any slide background (light or dark) without being distracting. Use the backdrop blur or text-shadow approach from the Nav Chrome section.
- **Simpler Mermaid diagrams.** Max 8–10 nodes, 18px+ labels, 2px+ edges. The diagram should be readable without zoom at presentation distance. Zoom controls remain available for detail inspection.

## Content Density Limits

Each slide must fit in exactly 100dvh. If content exceeds these limits, the agent splits across multiple slides — never scrolls within a slide.

| Slide type | Max content |
|-----------|-------------|
| Title | 1 heading + 1 subtitle |
| Section Divider | 1 number + 1 heading + optional subhead |
| Content | 1 heading + 5–6 bullets (max 2 lines each) |
| Split | 1 heading + 2 panels, each follows its inner type's limits |
| Diagram | 1 heading + 1 Mermaid diagram (max 8–10 nodes) |
| Dashboard | 1 heading + 6 KPI cards. Hero values ≤6 chars (numbers, %, short labels). Longer strings belong in the label row. |
| Table | 1 heading + 8 rows; overflow paginates to next slide |
| Code | 1 heading + 10 lines of code |
| Quote | 1 short quote (~25 words / ~150 chars max) + 1 attribution. Longer quotes are content slides, not quote slides. |
| Full-Bleed | 1 heading + 1 subtitle over background |

## Responsive Height Breakpoints

Height-based scaling is more critical for slides than width. Each breakpoint progressively reduces padding, font sizes, and hides decorative elements.

```css
/* Compact viewports */
@media (max-height: 700px) {
  .slide {
    padding: clamp(24px, 4vh, 40px) clamp(32px, 6vw, 80px);
  }
  .slide__display { font-size: clamp(36px, 8vw, 72px); }
  .slide--divider .slide__number { font-size: clamp(80px, 16vw, 160px); }
}

/* Small tablets / landscape phones */
@media (max-height: 600px) {
  .slide__decor { display: none; } /* hide decorative SVGs */
  .slide--quote { padding: clamp(32px, 6vh, 60px) clamp(40px, 8vw, 100px); }
  .slide__quote-mark { display: none; }
}

/* Aggressive: landscape phones */
@media (max-height: 500px) {
  .slide {
    padding: clamp(16px, 3vh, 24px) clamp(24px, 5vw, 48px);
  }
  .deck-dots { display: none; } /* dots clutter tiny viewports */
  .slide__display { font-size: clamp(28px, 7vw, 48px); }
}

/* Width breakpoint for grids */
@media (max-width: 768px) {
  .slide--content .slide__inner { grid-template-columns: 1fr; }
  .slide--content .slide__aside { display: none; }
  .slide--split .slide__panels { grid-template-columns: 1fr; }
  .slide--dashboard .slide__kpis { grid-template-columns: repeat(2, 1fr); }
}
```

## Curated Presets

Starting points the agent can riff on. Each defines a font pairing, palette, and background treatment. The agent adapts these to the content — different decks with the same preset should still feel distinct.

### Midnight Editorial

Deep navy, serif display, warm gold accents. Cinematic, premium. Dark-first.

```css
:root {
  --font-body: 'Instrument Serif', Georgia, serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', monospace;
  --bg: #0f1729;
  --surface: #162040;
  --surface2: #1d2b52;
  --surface-elevated: #243362;
  --border: rgba(200, 180, 140, 0.08);
  --border-bright: rgba(200, 180, 140, 0.16);
  --text: #e8e4d8;
  --text-dim: #9a9484;
  --accent: #d4a73a;
  --accent-dim: rgba(212, 167, 58, 0.1);
  --code-bg: #0a0f1e;
  --code-text: #d4d0c4;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: #faf8f2;
    --surface: #ffffff;
    --surface2: #f5f0e6;
    --surface-elevated: #fffdf5;
    --border: rgba(30, 30, 50, 0.08);
    --border-bright: rgba(30, 30, 50, 0.16);
    --text: #1a1814;
    --text-dim: #7a7468;
    --accent: #b8860b;
    --accent-dim: rgba(184, 134, 11, 0.08);
    --code-bg: #2a2520;
    --code-text: #e8e4d8;
  }
}
```

Background: radial gold glow at top center. Decorative corner marks in gold. Title slides use dramatic serif at max scale.

### Warm Signal

Cream paper, bold sans, terracotta/coral accents. Confident and modern. Light-first.

```css
:root {
  --font-body: 'Plus Jakarta Sans', system-ui, sans-serif;
  --font-mono: 'Azeret Mono', 'SF Mono', monospace;
  --bg: #faf6f0;
  --surface: #ffffff;
  --surface2: #f5ece0;
  --surface-elevated: #fffdf5;
  --border: rgba(60, 40, 20, 0.08);
  --border-bright: rgba(60, 40, 20, 0.16);
  --text: #2c2a25;
  --text-dim: #7c756a;
  --accent: #c2410c;
  --accent-dim: rgba(194, 65, 12, 0.08);
  --code-bg: #2c2520;
  --code-text: #f5ece0;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1c1916;
    --surface: #262220;
    --surface2: #302b28;
    --surface-elevated: #3a3430;
    --border: rgba(200, 180, 160, 0.08);
    --border-bright: rgba(200, 180, 160, 0.16);
    --text: #f0e8dc;
    --text-dim: #a09888;
    --accent: #e85d2a;
    --accent-dim: rgba(232, 93, 42, 0.1);
    --code-bg: #141210;
    --code-text: #f0e8dc;
  }
}
```

Background: warm radial glow at bottom left. Terracotta accent borders on cards. Section divider numbers in ultra-light coral.

### Terminal Mono

Dark, monospace everything, green/cyan accents, faint grid. Developer-native. Dark-first.

```css
:root {
  --font-body: 'Geist Mono', 'SF Mono', Consolas, monospace;
  --font-mono: 'Geist Mono', 'SF Mono', Consolas, monospace;
  --bg: #0a0e14;
  --surface: #12161e;
  --surface2: #1a1f2a;
  --surface-elevated: #222836;
  --border: rgba(80, 250, 123, 0.06);
  --border-bright: rgba(80, 250, 123, 0.12);
  --text: #c8d6e5;
  --text-dim: #5a6a7a;
  --accent: #50fa7b;
  --accent-dim: rgba(80, 250, 123, 0.08);
  --code-bg: #060a10;
  --code-text: #c8d6e5;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: #f4f6f8;
    --surface: #ffffff;
    --surface2: #eaecf0;
    --surface-elevated: #f8f9fa;
    --border: rgba(0, 80, 40, 0.08);
    --border-bright: rgba(0, 80, 40, 0.16);
    --text: #1a2332;
    --text-dim: #5a6a7a;
    --accent: #0d7a3e;
    --accent-dim: rgba(13, 122, 62, 0.08);
    --code-bg: #1a2332;
    --code-text: #c8d6e5;
  }
}
```

Background: faint dot grid. Everything in mono. Title slides use large weight-400 mono instead of bold display. Code slides feel native.

### Swiss Clean

White, geometric sans, single bold accent, visible grid. Minimal and precise. Light-first.

```css
:root {
  --font-body: 'DM Sans', system-ui, sans-serif;
  --font-mono: 'Fira Code', 'SF Mono', monospace;
  --bg: #ffffff;
  --surface: #f8f8f8;
  --surface2: #f0f0f0;
  --surface-elevated: #ffffff;
  --border: rgba(0, 0, 0, 0.08);
  --border-bright: rgba(0, 0, 0, 0.16);
  --text: #111111;
  --text-dim: #666666;
  --accent: #0055ff;
  --accent-dim: rgba(0, 85, 255, 0.06);
  --code-bg: #18181b;
  --code-text: #e4e4e7;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111111;
    --surface: #1a1a1a;
    --surface2: #222222;
    --surface-elevated: #2a2a2a;
    --border: rgba(255, 255, 255, 0.08);
    --border-bright: rgba(255, 255, 255, 0.16);
    --text: #f0f0f0;
    --text-dim: #888888;
    --accent: #3b82f6;
    --accent-dim: rgba(59, 130, 246, 0.08);
    --code-bg: #0a0a0a;
    --code-text: #e4e4e7;
  }
}
```

Background: clean white or near-black, no gradients. Visible grid lines (the `--with-grid` pattern). Tight geometric layouts. Single accent color used sparingly for emphasis. Data-heavy and analytical content shines here.

## Magazine Mode (Horizontal)

**An orientation variant of the slide deck.** When the user passes `--magazine` to `/generate-slides` (or explicitly asks for "magazine layout," "horizontal scroll," or "editorial pages"), the deck is rendered as a horizontal scroll-snap zine instead of the default vertical deck. Same command surface, different engine.

**When to choose magazine.** Editorial topics. Brand pieces. Year-in-review style content. Longer narrative arcs (12–30 pages). Topics that benefit from dwelling on full-bleed page compositions rather than the constant scroll-down rhythm of vertical slides. If in doubt, ask via AskUserQuestion: vertical deck, horizontal magazine, or video.

### Engine — horizontal scroll-snap

Replace the vertical scroll-snap CSS from Slide Engine Base with this:

```css
.mag {
  width: 100vw;
  height: 100vh;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: row;
}

.mag .page {
  flex: 0 0 100vw;
  width: 100vw;
  height: 100vh;
  scroll-snap-align: start;
  overflow: hidden;
  position: relative;
}
```

Hard rules:
- **100vw × 100vh per page.** No exceptions. No internal vertical scroll.
- **Full-bleed edge-to-edge.** No padded cards floating on backgrounds. No outer margins. Content reaches all four edges of the viewport.
- **No vertical scrolling on `body` or `.mag`.** `overflow-y: hidden` at both levels.
- **Horizontal scroll-snap on the container.** `scroll-snap-type: x mandatory`.

### Cover + back cover rule

- **Cover page is dark.** Dark panel, oversized display type, eyebrow kicker in mono. Single focal element (stat, quote, wordmark).
- **Back cover is dark.** Mirrors the cover visually. Final takeaway, attribution, CTA.
- **At least three pages total must be dark** (cover, back cover, plus at least one interior dark-panel page for contrast rhythm). Dark pages break up the tint progression and give the eye a reset.

### Tint adaptation across pages

Every page uses a different background tint. The tint values **adapt to the active aesthetic** (see `diagram-tokens.md` for the per-aesthetic tint ramps):

| Aesthetic | Tint ramp (light interior pages) | Dark panels |
|---|---|---|
| Mono-Industrial | `#f6f4f0`, `#efe9df`, `#e8e0d0`, `#ddd3bf`, `#d0c2a8` | `#0a0a0a`, `#16130f` |
| Nothing | Dark-first: `#000000` canvas + `#111111` surface + `#1A1A1A` raised. Light mode: `#F5F5F5` canvas + `#FFFFFF` surface + `#F0F0F0` raised. Interior pages rotate canvas → surface → raised, plus dot-grid-backed dark panels for rhythm. | `#000000` (absolute — same in both modes) |
| Editorial-Diagram / Paper-ink | `#faf7f2`, `#f2ede4`, `#ebe2d2`, `#e2d5bc`, `#d4c29f` | `#1c1917`, `#292524` |
| Blueprint | `#0f1b2e`, `#13233a`, `#17294a`, `#1b2f56` (dark-first — inverse to mostly dark) | `#050b18` |

Tints rotate across interior pages; never the same tint on consecutive pages. Dark panels interrupt the rotation.

### Layout options — full-bleed by design

The following layouts are available in magazine mode. Several also work in the vertical deck (marked ✓ "vertical compatible" below).

#### 1. Split (left/right color blocking) — vertical compatible ✓

Two 50vw columns, each filled with its own solid color or tint. Content sits inside each column, full-height. No gutter. Hairline rule on the seam is optional.

```html
<section class="page page--split" data-left="dark" data-right="warm">
  <div class="page__half page__half--left">
    <span class="eyebrow">01 · PROBLEM</span>
    <h2 class="display">Throughput</h2>
  </div>
  <div class="page__half page__half--right">
    <div class="stat-xl">500<span class="stat-label">rps baseline</span></div>
  </div>
</section>
```

```css
.page--split { display: grid; grid-template-columns: 1fr 1fr; }
.page__half { padding: clamp(48px, 6vh, 96px); display: flex; flex-direction: column; justify-content: center; }
.page__half--left[data-left="dark"]  { background: var(--ink); color: var(--paper); }
.page__half--right[data-right="warm"] { background: var(--paper-2); color: var(--ink); }
```

#### 2. Quadrant (2×2 grid) — vertical compatible ✓

Four 50vw × 50vh quadrants, each with its own tint and content. Ideal for comparison (before/after/delta/caveat) and for conceptual axes (speed vs cost, risk vs reward).

```html
<section class="page page--quadrant">
  <div class="q q-1" data-tint="paper">...</div>
  <div class="q q-2" data-tint="paper-2">...</div>
  <div class="q q-3" data-tint="accent-tint">...</div>
  <div class="q q-4" data-tint="ink">...</div>
</section>
```

```css
.page--quadrant { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
.q { padding: clamp(40px, 5vh, 80px); overflow: hidden; }
```

Axis labels can sit on the seam lines using absolute positioning if the quadrants represent axes.

#### 3. Full-bleed stat — vertical compatible ✓

Single page. One enormous number or short word anchoring the entire viewport. Font size 100px+ (typically 200–360px on a 1920-wide viewport). Single-focal, dramatic whitespace.

```html
<section class="page page--stat" data-tint="dark">
  <div class="stat-anchor">
    <div class="stat-xl">8.4<span class="stat-suffix">×</span></div>
    <div class="stat-label">throughput in prod</div>
  </div>
</section>
```

```css
.page--stat { display: flex; align-items: center; justify-content: center; }
.stat-xl { font-size: clamp(160px, 22vw, 360px); font-weight: 600; line-height: 1; letter-spacing: -0.03em; }
.stat-label { font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.18em; margin-top: 24px; }
```

#### 4. Dark panel

Entire page dark. Eyebrow kicker + oversized headline + optional body paragraph. Used for section dividers, problem statements, pivots, and resolution pages. At least three per deck (cover, back cover, +1 interior).

```html
<section class="page page--dark">
  <span class="eyebrow">CHAPTER 02</span>
  <h2 class="display">The quiet cost of context switching.</h2>
</section>
```

#### 5. Color block (single-color bleed)

One solid color fills the entire page. Content placed with generous whitespace. Color drawn from the aesthetic's accent or a tint step. Used 1–2 times per deck max.

#### 6. Viewport-filling grid (editorial multi-cell) — vertical compatible ✓

3×2, 4×3, or 6×4 grid of content tiles filling the entire viewport edge-to-edge. No outer padding. Each cell carries one of: stat, quote, small diagram, photo, mono label. Used for index pages, "at a glance" summaries, and visual TOCs.

```css
.page--grid { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, 1fr); }
.cell { padding: clamp(32px, 4vh, 64px); border-right: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
.cell:nth-child(3n) { border-right: none; }
```

### Navigation chrome

Magazine navigation differs from vertical deck navigation.

**Nav dots at bottom.** A horizontal row of dots centered at the bottom of the viewport, one per page. Current page is filled, others are hollow. Clicking a dot scroll-snaps to that page.

```html
<nav class="nav-dots" aria-label="Page navigation">
  <button class="nav-dot" data-page="1" aria-label="Page 1"></button>
  <button class="nav-dot" data-page="2" aria-label="Page 2"></button>
  <!-- ... -->
</nav>
```

```css
.nav-dots {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 12px;
  padding: 8px 14px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  border-radius: 999px;
  z-index: 100;
}
.nav-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.5);
  cursor: pointer;
  padding: 0;
  transition: background 120ms, transform 120ms;
}
.nav-dot.active { background: white; transform: scale(1.3); }
```

**Arrow-key support.** Left and right arrows scroll-snap to the previous and next page respectively. Space bar advances forward. PgUp/PgDn mirror Left/Right.

```js
document.addEventListener("keydown", (e) => {
  const mag = document.querySelector(".mag");
  const w = window.innerWidth;
  if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
    e.preventDefault();
    mag.scrollBy({ left: w, behavior: "smooth" });
  } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
    e.preventDefault();
    mag.scrollBy({ left: -w, behavior: "smooth" });
  } else if (e.key === "Home") {
    mag.scrollTo({ left: 0, behavior: "smooth" });
  } else if (e.key === "End") {
    mag.scrollTo({ left: mag.scrollWidth, behavior: "smooth" });
  }
});
```

**Touch swipe.** Native scroll-snap with `touch-action: pan-x` already handles swipe. No JS needed.

**Dot highlight sync.** Use IntersectionObserver to highlight the current dot as pages snap into view.

```js
const io = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
      const pageIdx = [...document.querySelectorAll(".page")].indexOf(entry.target);
      document.querySelectorAll(".nav-dot").forEach((d, i) => d.classList.toggle("active", i === pageIdx));
    }
  });
}, { root: document.querySelector(".mag"), threshold: 0.5 });

document.querySelectorAll(".page").forEach((p) => io.observe(p));
```

### Responsive behavior

Magazine pages are designed for 1440px+ widescreen. On narrow viewports (< 768px), the horizontal-scroll paradigm still works — each page is still 100vw — but typography scales down via `clamp(…)` and split layouts collapse to single-column stacks. The 2×2 quadrant becomes a 1×4 stack on mobile.

```css
@media (max-width: 768px) {
  .page--split { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; }
  .page--quadrant { grid-template-columns: 1fr; grid-template-rows: repeat(4, 1fr); }
}
```

### Key-stat rendering

Every magazine deck must include at least one full-bleed stat page where the primary number is rendered at 100px+ font size (use `clamp(160px, 22vw, 360px)` for headroom). Stats are visual anchors in the magazine format — they are what the eye lands on first.

If the content doesn't have a single primary stat, generate one during outline: the most consequential number in the source gets this treatment.

### The magazine flag workflow

When `--magazine` is passed to `/generate-slides`:

1. Use the horizontal scroll-snap engine from this section instead of the vertical deck engine.
2. Pick tints from the active aesthetic's tint ramp; rotate across interior pages; never consecutive repeats.
3. Enforce the dark cover + dark back cover + ≥ 1 interior dark panel rule.
4. Insert at least one full-bleed stat page (100px+ stat anchor).
5. Add the nav-dots strip + arrow-key handler to the output.
6. Apply the compositional-variety rule from the existing Compositional Variety section — consecutive pages must vary layout type.

### Magazine-specific compositional variety

In addition to the existing Compositional Variety rules, magazine mode requires:
- No two consecutive pages use the same layout type (split → split is forbidden)
- Dark panels interrupt tint rotation; a tint page → dark panel → tint page is the expected rhythm
- Full-bleed stat pages land at rhythmically significant moments (roughly every 4–6 pages, never back-to-back)
- Grid pages (6+ cells) are used sparingly — one per deck for "at a glance" summary, never more

### Verification for magazine

In addition to the standard verify-in-browser checks:
- Horizontal scrolling works via mouse wheel (with shift), trackpad swipe, arrow keys, and nav dots
- No vertical scrollbar appears on `body` or `.mag` at any viewport size
- Dot highlight correctly tracks the current page
- Dark pages render dark in both light and dark OS modes (dark is absolute, not mode-responsive)
- Each page fills 100vw × 100vh with no white space at the edges

## PDF Export

Any slide deck or magazine can be exported to a multi-page PDF via `scripts/export-slides-pdf.mjs`. The HTML remains canonical; the PDF is a secondary artifact for email, print, or offline review. Triggered by the `--pdf` flag on `/generate-slides` — run after the HTML is written and opened.

```bash
node <skill-dir>/scripts/export-slides-pdf.mjs <input.html> <output.pdf>
```

### What the script does

1. **Auto-detects mode** from the DOM: `.slide` → vertical deck, `.page` + horizontal scroll-snap → magazine, neither → flow-paginated long page.
2. **Hides interactive chrome** — theme toggle, progress bar, nav dots, zoom controls, scroll-to-navigate hint, page counter, and any other `position: fixed` helpers. All of it is useful on screen, noise on paper.
3. **Neutralizes live state** — resets Mermaid zoom, forces diagrams to fill their wrapper, unwraps any transform applied by pan/zoom controllers.
4. **Screenshots each slide individually** at the configured page size (default 1920×1080), then composites the PNGs into a PDF with a hard page break between each. This bypasses Chromium's scroll-snap + `break-after: page` pagination quirks (trailing blank pages, content bleed across boundaries, fixed chrome repeating on every page).
5. **Writes a landscape PDF** with zero margins and `printBackground: true` so dark backgrounds survive.

### Flags

| Flag | Default | Meaning |
|---|---|---|
| `--mode=slides\|magazine\|scroll` | auto-detect | Explicit override. `scroll` uses flow-based pagination for long scrollable pages (architecture, project-recap) instead of per-element screenshots. |
| `--orientation=landscape\|portrait` | landscape for slides/magazine, portrait for scroll | Page orientation. |
| `--width=<px>` / `--height=<px>` | 1920 × 1080 landscape, 1080 × 1920 portrait | Override dimensions — useful for 9:16 reel-shaped stat decks or custom paper sizes. |
| `--selector=<css>` | `.slide` for slides, `.page` for magazine | Override the per-page selector if a custom template uses different class names. |

### Prerequisites

Playwright + a Chromium build. Install once per project directory:

```bash
npm install playwright
npx playwright install chromium
```

If `playwright` isn't available, skip the PDF export with a note to the user and deliver only the HTML. Don't add it to the skill as a hard dependency — the PDF is always opt-in.

### Why screenshot-and-composite, not browser Print-to-PDF

Chromium's native `page.pdf()` is the obvious first attempt. It reliably fails on scroll-snap slide decks for four reasons that interact:

- **Trailing blank page.** `break-after: page` on the last slide creates an extra empty page because Chromium forces the break even without content after it. `:last-child { break-after: avoid }` misses when the slide isn't literally the last child of its parent (trailing whitespace nodes, sibling nav elements, etc.).
- **Fixed chrome repeats.** Theme toggles and progress bars set to `position: fixed` render on *every* printed page. Hiding them via `@media print` works but requires knowing every class name in every template.
- **Flex-centered Mermaid collapses.** `.mermaid-wrap { display: flex; justify-content: center }` computes the flex item's main-size from the SVG's intrinsic width in print layout, so diagrams that filled the slide on screen shrink to their authored Mermaid dimensions (often ~270px wide).
- **Live zoom state leaks.** Pan/zoom controllers set `transform: translate(...)` or `style.zoom` on the diagram wrapper. That state persists into the print render.

Per-slide screenshots capture the live view exactly as the author intended, so none of those failure modes apply. The tradeoff is file size — a 10-slide deck at 1920×1080 renders to ~1 MB instead of ~175 KB — which is acceptable for presentations and still small enough to email.

### Troubleshooting

| Symptom | Fix |
|---|---|
| PDF has extra blank page(s) at the end | Check that `--mode` was auto-detected correctly; wrong selector produces no matches and the script composites zero pages. |
| Slides render at wrong aspect ratio | Viewport didn't match page size. The script sets both to the same dimensions — confirm `--width` and `--height` match the slide's intended aspect. |
| Chart.js canvas appears blank | The canvas-to-image shim runs at `load + 1200ms`; increase `data-pdf-ready` wait if the chart has a longer animation (edit the script or accept the delay). |
| Interactive toggle still visible | Template uses a class name not in the chrome hide list. Add it via `el.style.display = 'none'` before the export, or extend the script's `chromeSelectors` array. |
| Mermaid rendered at authored size, not full-slide | Zoom/transform wasn't neutralized; check the script's surgery block still runs before screenshots (look for the `.mermaid-wrap` override). |

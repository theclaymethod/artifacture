# External Libraries (CDN)

Optional CDN libraries for cases where pure CSS/HTML isn't enough. Only include what the diagram actually needs — most diagrams need zero external JS.

## Mermaid.js — Diagramming Engine

Use for flowcharts, sequence diagrams, ER diagrams, state machines, mind maps, class diagrams, and any diagram where automatic node positioning and edge routing saves effort. Mermaid handles layout — you handle theming.

Do NOT use for dashboards — CSS Grid card layouts with Chart.js look better for those. Data tables use `<table>` elements.

**CDN:**
```html
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

  mermaid.initialize({ startOnLoad: true, /* ... */ });
</script>
```

**With ELK layout** (required for `layout: 'elk'` — it's a separate package, not bundled in core):
```html
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
  import elkLayouts from 'https://cdn.jsdelivr.net/npm/@mermaid-js/layout-elk/dist/mermaid-layout-elk.esm.min.mjs';

  mermaid.registerLayoutLoaders(elkLayouts);
  mermaid.initialize({ startOnLoad: true, layout: 'elk', /* ... */ });
</script>
```

Without the ELK import and registration, `layout: 'elk'` silently falls back to dagre. Only import ELK when you actually need it — it adds significant bundle weight. Most simple diagrams render fine with dagre.

### Deep Theming

Always use `theme: 'base'` — it's the only theme where all `themeVariables` are fully customizable. The built-in themes (`default`, `dark`, `forest`, `neutral`) ignore most variable overrides.

```html
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  mermaid.initialize({
    startOnLoad: true,
    theme: 'base',
    look: 'classic',
    themeVariables: {
      // Background and surfaces — teal/slate palette (not violet/indigo!)
      primaryColor: isDark ? '#134e4a' : '#ccfbf1',
      primaryBorderColor: isDark ? '#14b8a6' : '#0d9488',
      primaryTextColor: isDark ? '#f0fdfa' : '#134e4a',
      secondaryColor: isDark ? '#1e293b' : '#f0fdf4',
      secondaryBorderColor: isDark ? '#059669' : '#16a34a',
      secondaryTextColor: isDark ? '#f1f5f9' : '#1e293b',
      tertiaryColor: isDark ? '#27201a' : '#fef3c7',
      tertiaryBorderColor: isDark ? '#d97706' : '#f59e0b',
      tertiaryTextColor: isDark ? '#fef3c7' : '#27201a',
      // Lines and edges
      lineColor: isDark ? '#64748b' : '#94a3b8',
      // Text
      fontSize: '16px',
      fontFamily: 'var(--font-body)',
      // Notes and labels
      noteBkgColor: isDark ? '#1e293b' : '#fefce8',
      noteTextColor: isDark ? '#f1f5f9' : '#1e293b',
      noteBorderColor: isDark ? '#fbbf24' : '#d97706',
    }
  });
</script>
```

**FORBIDDEN in Mermaid themeVariables:** `#8b5cf6`, `#7c3aed`, `#a78bfa` (indigo/violet), `#d946ef` (fuchsia). Use teal, slate, amber, emerald, or colors from your page's palette.

### Mono-Industrial Mermaid Theme (default aesthetic)

When generating output in the Mono-Industrial aesthetic (see `./mono-industrial.md` for the full system), Mermaid renders in grayscale only. Color is reserved for status (success / warning / error) and applied via `classDef` to specific edges or nodes that semantically represent those states — never as a role-color palette for the diagram as a whole.

```html
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
  import elkLayouts from 'https://cdn.jsdelivr.net/npm/@mermaid-js/layout-elk/dist/mermaid-layout-elk.esm.min.mjs';

  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  // Grayscale tokens — every node, every edge, same palette.
  const nodeFill   = isDark ? '#000000' : '#ffffff';
  const nodeBorder = isDark ? 'rgba(242, 237, 229, 0.58)' : 'rgba(22, 19, 15, 0.56)';
  const nodeText   = isDark ? 'rgba(242, 237, 229, 0.95)' : 'rgba(22, 19, 15, 0.95)';
  const edgeColor  = isDark ? 'rgba(242, 237, 229, 0.40)' : 'rgba(22, 19, 15, 0.40)';

  mermaid.registerLayoutLoaders(elkLayouts);
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    look: 'classic',
    layout: 'elk',
    themeVariables: {
      fontFamily: "'Space Grotesk', system-ui, sans-serif",
      fontSize: '15px',
      // All three node tiers share the same grayscale — hierarchy
      // comes from labels and layout, not color.
      primaryColor: nodeFill,
      primaryBorderColor: nodeBorder,
      primaryTextColor: nodeText,
      secondaryColor: nodeFill,
      secondaryBorderColor: nodeBorder,
      secondaryTextColor: nodeText,
      tertiaryColor: nodeFill,
      tertiaryBorderColor: nodeBorder,
      tertiaryTextColor: nodeText,
      lineColor: edgeColor,
      noteBkgColor: nodeFill,
      noteTextColor: nodeText,
      noteBorderColor: nodeBorder,
    }
  });
</script>
```

**Status-only coloring.** When a specific node or edge represents a degraded path, apply color via `classDef`. Do NOT use color to distinguish process types, data types, or any structural role.

```
graph TD
  GW[Gateway] --> LEDGER[(Ledger)]
  LEDGER --> IDX[Indexer]
  LEDGER -->|"SLOW"| BILL[Billing]:::warn
  classDef warn stroke:#b36b00,stroke-width:2px
  %% In dark mode, swap #b36b00 → #f0b05a. Since classDef values are static,
  %% emit the appropriate one based on window.matchMedia before rendering,
  %% or inject via a pre-render string replace.
```

**Edge-label treatment.** In Mono-Industrial, edge labels go through the CSS overrides to render in Space Mono, ALL CAPS, 11px. Keep label text terse (`SLOW`, `ASYNC`, `FALLBACK`).

**Node-label fonts.** Space Grotesk at 15px (docs) or 20px (slide decks).

**When to use this theme:** default for all visual-explainer output. Switch to the teal/slate/earth palettes shown earlier in this file only when the user explicitly requests a named aesthetic (Blueprint, Editorial, Paper/ink, Monochrome terminal, IDE-inspired).

### CSS Overrides on Mermaid SVG

Mermaid renders SVG. Override its classes for pixel-perfect control that `themeVariables` can't reach:

```css
/* Container — see css-patterns.md "Mermaid Zoom Controls" for the full zoom pattern */
.mermaid-wrap {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  overflow: auto;
}

/* CRITICAL: Force node/edge text to follow the page's color scheme.
   Without this, themeVariables.primaryTextColor works for DEFAULT nodes,
   but any classDef that sets color: will hardcode a single value that
   breaks in the opposite color scheme. Fix: never set color: in classDef,
   and always include these CSS overrides. */
.mermaid .nodeLabel { color: var(--text) !important; }
.mermaid .edgeLabel { color: var(--text-dim) !important; background-color: var(--bg) !important; }
.mermaid .edgeLabel rect { fill: var(--bg) !important; }

/* Node shapes */
.mermaid .node rect,
.mermaid .node circle,
.mermaid .node polygon {
  stroke-width: 1.5px;
}

/* Edge paths */
.mermaid .edge-pattern-solid {
  stroke-width: 1.5px;
}

/* Edge labels — smaller than node labels for visual hierarchy */
.mermaid .edgeLabel {
  font-family: var(--font-mono) !important;
  font-size: 13px !important;
}

/* Node labels — 16px default; drop to 14px for complex diagrams (20+ nodes) */
.mermaid .nodeLabel {
  font-family: var(--font-body) !important;
  font-size: 16px !important;
}

/* Sequence diagram actors */
.mermaid .actor {
  stroke-width: 1.5px;
}

/* Sequence diagram messages */
.mermaid .messageText {
  font-family: var(--font-mono) !important;
  font-size: 12px !important;
}

/* ER diagram entities */
.mermaid .er.entityBox {
  stroke-width: 1.5px;
}

/* Mind map nodes */
.mermaid .mindmap-node rect {
  stroke-width: 1.5px;
}
```

### classDef and style Gotchas

`classDef` values and per-node `style` directives are static text inside `<pre>` — they can't use CSS variables or JS ternaries. Two rules:

1. **Never set `color:` in classDef or per-node `style` directives.** It hardcodes a text color that breaks in the opposite color scheme. This applies to both `classDef highlight fill:...,color:#2c2a25` and `style I fill:...,color:#2c2a25`. Let the CSS overrides above handle text color via `var(--text)`.

2. **Use semi-transparent fills (8-digit hex) for node backgrounds.** They layer over whatever Mermaid's base theme background is, producing a tint that works in both light and dark modes. Use `20`–`44` alpha for subtle, `55`–`77` for prominent:

```
classDef highlight fill:#b5761433,stroke:#b57614,stroke-width:2px
classDef muted fill:#7c6f6411,stroke:#7c6f6444,stroke-width:1px
```

### Node Label Special Characters

Mermaid uses certain characters for shape syntax. Node labels containing these characters cause syntax errors unless quoted.

**Shape characters to watch:**
- `[/text/]` — parallelogram
- `[\text\]` — trapezoid (alt)
- `[/text\]` — trapezoid
- `[\text/]` — trapezoid (alt)
- `[(text)]` — cylindrical
- `[[text]]` — subroutine
- `((text))` — circle
- `{{text}}` — hexagon

**If your node label starts with `/`, `\`, `(`, or `{`, wrap it in quotes:**

```
%% WRONG — syntax error (/ starts parallelogram shape)
CMD[/gallery command] --> SRV[server]

%% RIGHT — quotes escape the special character
CMD["/gallery command"] --> SRV[server]
```

**Edge labels with special characters also need quotes:**

```
%% WRONG — quotes inside edge label
UI -->|"Use as Reference"| RET

%% RIGHT — use single quotes or escape
UI -->|'Use as Reference'| RET
UI -->|Use as Reference| RET
```

Avoid opaque light fills like `fill:#fefce8` — they render as bright boxes in dark mode.

### stateDiagram-v2 Label Limitations

State diagram transition labels have a strict parser. Avoid:
- `<br/>` — only works in flowcharts; causes a parse error in state diagrams
- Parentheses in labels — `cancel()` can confuse the parser
- Multiple colons — the first `:` is the label delimiter; extra colons in the label text may break parsing

If you need multi-line labels or special characters, use a `flowchart` instead of `stateDiagram-v2`. Flowcharts support quoted labels (`|"label with: special chars"|`) and `<br/>` for line breaks.

### Writing Valid Mermaid

Most Mermaid failures come from a few recurring issues. Follow these rules to avoid invalid diagrams:

**For multi-line flowchart node labels, use `<br/>` (not `\n`).** Mermaid flowcharts interpret `<br/>` as a line break, but escaped `\n` in labels often renders as literal text:

```
%% WRONG — renders literal "\n" in node text
A["Copilot Backend\n/api + /api/voicebot"] --> B["Redis"]

%% RIGHT — renders on two lines
A["Copilot Backend<br/>/api + /api/voicebot"] --> B["Redis"]
```

**Quote labels with special characters.** Parentheses, colons, commas, brackets, and ampersands break the parser when unquoted. Wrap any label containing special characters in double quotes:

```
A["handleRequest(ctx)"] --> B["DB: query users"]
A[handleRequest] --> B[query users]
```

**Keep IDs simple.** Node IDs should be alphanumeric with no spaces or punctuation. Put the readable name in the label, not the ID:

```
userSvc["User Service"] --> authSvc["Auth Service"]
```

**Max 10-12 nodes per Mermaid diagram.** Beyond that, readability collapses even with zoom controls and increased fontSize. For complex architectures (15+ elements), use the **hybrid pattern**: a simple 5-8 node Mermaid overview showing module relationships, followed by CSS Grid cards with detailed function lists. Never cram everything into one diagram. Use `subgraph` blocks to group related nodes when under the limit:

```
subgraph Auth
  login --> validate --> token
end
subgraph API
  gateway --> router --> handler
end
Auth --> API
```

**Arrow styles for semantic meaning:**

| Arrow | Meaning | Use for |
|-------|---------|---------|
| `-->` | Solid | Primary flow |
| `-.->` | Dotted | Optional, async, or fallback paths |
| `==>` | Thick | Critical or highlighted path |
| `--x` | Cross | Rejected or blocked |
| `-->\|label\|` | Labeled | Decision branches, data descriptions |

**Escape pipes in labels.** If a label contains a literal `|`, use `#124;` (HTML entity) or rephrase to avoid it — pipes delimit edge labels in flowcharts.

**Sequence diagram messages must be plain text.** Unlike flowchart labels, sequence diagram messages (the text after `:`) cannot be quoted or escaped. Curly braces `{}`, square brackets `[]`, angle brackets `<>`, and `&` will silently break the parser and the entire diagram renders as raw text. Write human-readable descriptions, not code:

```
%% WRONG — parser chokes on braces, brackets, ampersand
A->>B: web_search({ queries: [...] })
B->>B: User removes query 2, keeps 1 & 3
B->>S: POST /submit { selected: [0, 2] }

%% RIGHT — plain English, no special characters
A->>B: Call web_search with queries
B->>B: User removes query 2, keeps 1 and 3
B->>S: POST /submit with selected indices
```

**Don't mix diagram syntax.** Each diagram type has its own syntax. `-->` works in flowcharts but not in sequence diagrams (`->>` instead). `:::className` works in flowcharts but not in ER diagrams. When in doubt, check the examples below for correct syntax per type.

### Layout Direction: TD vs LR

`flowchart LR` (left-to-right) spreads horizontally. With many nodes, Mermaid scales everything down to fit the width, making text unreadable. `flowchart TD` (top-down) is almost always better.

**When to use each:**

| Direction | Use when | Avoid when |
|-----------|----------|------------|
| `TD` (top-down) | Complex diagrams, 5+ nodes, hierarchies, architecture | Simple A→B→C linear flows |
| `LR` (left-to-right) | Simple linear flows, 3-4 nodes, pipelines | Complex graphs, many branches |

**Rule of thumb:** If the diagram has more than one row of nodes or any branching, use `TD`. The extra vertical space makes labels readable.

```
%% WRONG — LR with many nodes produces wide, short, unreadable diagram
flowchart LR
  A --> B --> C --> D --> E
  A --> F --> G --> H
  
%% RIGHT — TD uses vertical space, labels stay readable
flowchart TD
  A --> B --> C --> D --> E
  A --> F --> G --> H
```

### Diagram Type Examples

**Flowchart with decisions:**
```html
<pre class="mermaid">
graph TD
  A[Request] --> B{Authenticated?}
  B -->|Yes| C[Load Dashboard]
  B -->|No| D[Login Page]
  D --> E[Submit Credentials]
  E --> B
  C --> F{Role?}
  F -->|Admin| G[Admin Panel]
  F -->|User| H[User Dashboard]
</pre>
```

**Sequence diagram:**
```html
<pre class="mermaid">
sequenceDiagram
  participant C as Client
  participant G as Gateway
  participant S as Service
  participant D as Database
  C->>G: POST /api/data
  G->>G: Validate JWT
  G->>S: Forward request
  S->>D: Query
  D-->>S: Results
  S-->>G: Response
  G-->>C: 200 OK
</pre>
```

**ER diagram:**
```html
<pre class="mermaid">
erDiagram
  USERS ||--o{ ORDERS : places
  ORDERS ||--|{ LINE_ITEMS : contains
  LINE_ITEMS }o--|| PRODUCTS : references
  USERS { string email PK }
  ORDERS { int id PK }
  LINE_ITEMS { int quantity }
  PRODUCTS { string name }
</pre>
```

**State diagram:**
```html
<pre class="mermaid">
stateDiagram-v2
  [*] --> Draft
  Draft --> Review : submit
  Review --> Approved : approve
  Review --> Draft : request_changes
  Approved --> Published : publish
  Published --> Archived : archive
  Archived --> [*]
</pre>
```

**Mind map:**
```html
<pre class="mermaid">
mindmap
  root((Project))
    Frontend
      React
      Next.js
      Tailwind
    Backend
      Node.js
      PostgreSQL
      Redis
    Infrastructure
      AWS
      Docker
      Terraform
</pre>
```

**Class diagram:**
```html
<pre class="mermaid">
classDiagram
  class User {
    +string email
    +string name
    +login()
    +logout()
  }
  class Order {
    +int id
    +decimal total
    +submit()
  }
  class Product {
    +string name
    +decimal price
  }
  User "1" --> "*" Order : places
  Order "*" --> "*" Product : contains
</pre>
```

**C4 architecture (flowchart-as-C4):**
```html
<pre class="mermaid">
graph TD
  user("👤 User<br/><small>Browser client</small>")
  subgraph boundary["Web Platform"]
    app["Web App<br/><small>Node.js</small>"]
    db[("Database<br/><small>PostgreSQL</small>")]
  end
  email["📧 Email Service"]:::ext
  payment["💳 Payment Gateway"]:::ext
  user -->|"HTTPS"| app
  app -->|"SQL"| db
  app -->|"SMTP"| email
  app -->|"API"| payment
  classDef ext fill:none,stroke-dasharray:5 5
</pre>
```

Do NOT use native `C4Context` / `C4Container` syntax — it hardcodes sharp corners, its own font, and inline colors that ignore `themeVariables`. Use `graph TD` + `subgraph` for C4 boundaries instead; it inherits all theme settings automatically.

### Which Mermaid Diagram Type?

Quick-reference for choosing the right Mermaid syntax:

| You want to show... | Use | Syntax keyword |
|---|---|---|
| Process flow, decisions, pipelines | Flowchart | `graph TD` / `graph LR` |
| Request/response, API calls, temporal interactions | Sequence diagram | `sequenceDiagram` |
| Database tables and relationships | ER diagram | `erDiagram` |
| OOP classes, domain models with methods | Class diagram | `classDiagram` |
| System architecture at multiple zoom levels | C4 diagram | `graph TD` + `subgraph` (not native `C4Context`) |
| State transitions, lifecycles | State diagram | `stateDiagram-v2` |
| Hierarchical breakdowns, brainstorms | Mind map | `mindmap` |

### Dark Mode Handling

Mermaid initializes once — it can't reactively switch themes. Read the preference at load time inside your `<script type="module">`:

```javascript
const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
// Use isDark to pick light or dark values in themeVariables
```

The CSS overrides on the container (`.mermaid-wrap`) and page will still respond to `prefers-color-scheme` normally — only the Mermaid SVG internals are static.

## Chart.js — Data Visualizations

Use for bar charts, line charts, pie/doughnut charts, radar charts, and other data-driven visualizations in dashboard-type diagrams. Overkill for static numbers — use pure SVG/CSS for simple progress bars and sparklines.

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>

<canvas id="myChart" width="600" height="300"></canvas>

<script>
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const textColor = isDark ? '#8b949e' : '#6b7280';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const fontFamily = getComputedStyle(document.documentElement)
    .getPropertyValue('--font-body').trim() || 'system-ui, sans-serif';

  new Chart(document.getElementById('myChart'), {
    type: 'bar',
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
      datasets: [{
        label: 'Feedback Items',
        data: [45, 62, 78, 91, 120],
        backgroundColor: isDark ? 'rgba(129, 140, 248, 0.6)' : 'rgba(79, 70, 229, 0.6)',
        borderColor: isDark ? '#818cf8' : '#4f46e5',
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: textColor, font: { family: fontFamily } } },
      },
      scales: {
        x: { ticks: { color: textColor, font: { family: fontFamily } }, grid: { color: gridColor } },
        y: { ticks: { color: textColor, font: { family: fontFamily } }, grid: { color: gridColor } },
      }
    }
  });
</script>
```

Wrap the canvas in a styled container:
```css
.chart-container {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 20px;
  position: relative;
}

.chart-container canvas {
  max-height: 300px;
}
```

## anime.js — Orchestrated Animations

Use when a diagram has 10+ elements and you want a choreographed entrance sequence (staggered reveals, path drawing, count-up numbers). For simpler diagrams, CSS `animation-delay` staggering is sufficient.

```html
<script src="https://cdn.jsdelivr.net/npm/animejs@3.2.2/lib/anime.min.js"></script>

<script>
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!prefersReduced) {
    anime({
      targets: '.ve-card',
      opacity: [0, 1],
      translateY: [20, 0],
      delay: anime.stagger(80, { start: 200 }),
      easing: 'easeOutCubic',
      duration: 500,
    });

    anime({
      targets: '.connector path',
      strokeDashoffset: [anime.setDashoffset, 0],
      easing: 'easeInOutCubic',
      duration: 800,
      delay: anime.stagger(150, { start: 600 }),
    });

    document.querySelectorAll('[data-count]').forEach(el => {
      anime({
        targets: { val: 0 },
        val: parseInt(el.dataset.count),
        round: 1,
        duration: 1200,
        delay: 400,
        easing: 'easeOutExpo',
        update: (anim) => { el.textContent = anim.animations[0].currentValue; }
      });
    });
  }
</script>
```

When using anime.js, set initial opacity to 0 in CSS so elements don't flash before the animation:
```css
.ve-card { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .ve-card { opacity: 1 !important; }
}
```

## Prism.js — Syntax Highlighting

Use for code blocks in HTML output. Prism is small (~6KB core + per-language grammars), configurable, and produces predictable class-named tokens that are trivial to re-theme via CSS — which matters because the default Prism themes don't match any of this skill's aesthetics and must be overridden.

**CDN + autoloader** (loads language grammars on demand, so you don't need to enumerate them):

```html
<script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-core.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/plugins/autoloader/prism-autoloader.min.js"
        data-autoloader-path="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/"></script>
```

**Markup:**

```html
<pre class="code-block"><code class="language-ts">const x: number = 42;
function greet(name: string) {
  return `hello, ${name}`;
}
</code></pre>
```

Prism scans for `class="language-*"` on `<code>` elements at load and highlights automatically. For post-load or dynamically inserted code, call `Prism.highlightAll()` or `Prism.highlightElement(el)`.

**Supported languages (common):** `ts`, `tsx`, `js`, `jsx`, `py`, `rust`, `go`, `java`, `c`, `cpp`, `cs`, `sh` / `bash`, `json`, `yaml`, `toml`, `html`, `css`, `scss`, `md` / `markdown`, `sql`, `graphql`, `diff`. See [prismjs.com/#supported-languages](https://prismjs.com/#supported-languages) for the full list.

### Mono-Industrial Terminal Theme

The default Prism themes introduce palettes that clash with Mono-Industrial's rule (no color except status). The theme below uses only the existing CSS variables — string literals and numbers share the `--warn` amber, comments use `--text-disabled`, everything else is the foreground at varying opacities.

Put this in the `<style>` block alongside the code block CSS:

```css
/* Force dark terminal regardless of page theme */
pre.code-block,
pre.code-block[class*="language-"] {
  background: #0a0a0a;
  color: #f2ede5;
  border: 1px solid rgba(242, 237, 229, 0.14);
  border-radius: 4px;
  padding: 16px 18px;
  font-family: 'Space Mono', 'SF Mono', Consolas, monospace;
  font-size: 13px;
  line-height: 1.55;
  overflow-x: auto;
  white-space: pre;
  tab-size: 2;
}

pre.code-block code,
pre.code-block[class*="language-"] code {
  background: none;
  color: inherit;
  font-family: inherit;
  text-shadow: none;
}

/* Prism token palette — restrained, pulls from the page's status colors only */
.token.comment,
.token.prolog,
.token.doctype,
.token.cdata        { color: rgba(242, 237, 229, 0.36); font-style: italic; }
.token.punctuation,
.token.operator     { color: rgba(242, 237, 229, 0.58); }
.token.property,
.token.tag,
.token.constant,
.token.symbol,
.token.deleted      { color: #ef7b7b; }                  /* --err */
.token.boolean,
.token.number       { color: #f0b05a; }                  /* --warn */
.token.selector,
.token.attr-name,
.token.string,
.token.char,
.token.builtin,
.token.inserted     { color: #f0b05a; }                  /* --warn */
.token.atrule,
.token.attr-value,
.token.keyword      { color: #f2ede5; font-weight: 500; } /* --fg */
.token.function,
.token.class-name   { color: #f2ede5; }
.token.regex,
.token.important,
.token.variable     { color: rgba(242, 237, 229, 0.90); }

.token.important,
.token.bold         { font-weight: 700; }
.token.italic       { font-style: italic; }
```

**Diff blocks** (use `language-diff` or `diff-*` prefix to colorize additions/removals):

```css
.token.deleted,
pre.code-block .line-deleted  { background: rgba(239, 123, 123, 0.10); color: #ef7b7b; }
.token.inserted,
pre.code-block .line-inserted { background: rgba(107, 212, 142, 0.10); color: #6bd48e; }
```

**Light mode.** The code block stays dark even when the page is in light mode — terminals are dark, and the contrast against a warm cream page is intentional. If a user explicitly asks for a light code block (reviewer print-out, paper/ink aesthetic), invert the palette and re-map the token colors to darker equivalents.

### File header pattern

Pair the code block with a minimal Space Mono caption for filename + language. The header sits above the dark block, not inside it — keeps the terminal rectangle undivided.

```html
<figure class="code-file">
  <figcaption class="code-file__cap">
    <span class="code-file__name">src/api/auth.ts</span>
    <span class="code-file__lang">TYPESCRIPT</span>
  </figcaption>
  <pre class="code-block"><code class="language-ts">...</code></pre>
</figure>
```

```css
.code-file { margin: 24px 0; }
.code-file__cap {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 0 2px 6px;
  font-family: 'Space Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary, rgba(242, 237, 229, 0.58));
}
.code-file__name { color: var(--text-primary, rgba(242, 237, 229, 0.90)); }
```

### When to skip Prism

- Single-token inline references (`<code>x</code>` inside prose) — plain monospace is fine.
- Prose-heavy pages with one tiny snippet — the runtime script isn't worth it.
- Poster output — `poster export` waits 1500ms after `networkidle`, which is often too short for Prism to finish highlighting large blocks. Pre-render tokens server-side or write them as plain `<code>` with inline color spans.

## Google Fonts — Typography

Always load with `display=swap` for fast rendering. Pick a distinctive pairing — body + mono at minimum, optionally a display font for the title.

**FORBIDDEN as `--font-body` (AI slop signals):**
- Inter — the single most overused AI default font
- Roboto — generic Android/Google default
- Arial, Helvetica — system defaults with no character
- system-ui alone without a named font — signals zero design intent

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Define as CSS variables for easy reference:
```css
:root {
  --font-body: 'Outfit', system-ui, sans-serif;
  --font-mono: 'Space Mono', 'SF Mono', Consolas, monospace;
}
```

**Font pairings** (rotate — never use the same pairing twice in a row):

| Body / Headings | Mono / Labels | Feel | Use for |
|---|---|---|---|
| DM Sans | Fira Code | Friendly, developer | Blueprint, technical docs |
| Instrument Serif | JetBrains Mono | Editorial, refined | Plan reviews, decision logs |
| IBM Plex Sans | IBM Plex Mono | Reliable, readable | Architecture diagrams |
| Bricolage Grotesque | Fragment Mono | Bold, characterful | Data tables, dashboards |
| Plus Jakarta Sans | Azeret Mono | Rounded, approachable | Status reports, audits |
| Outfit | Space Mono | Clean geometric, modern | Flowcharts, pipelines |
| Sora | IBM Plex Mono | Technical, precise | ER diagrams, schemas |
| Crimson Pro | Noto Sans Mono | Scholarly, serious | RFC reviews, specs |
| Fraunces | Source Code Pro | Warm, distinctive | Project recaps |
| Geist | Geist Mono | Vercel-inspired, sharp | Modern API docs |
| Red Hat Display | Red Hat Mono | Cohesive family | System overviews |
| Libre Franklin | Inconsolata | Classic, reliable | Data-dense tables |
| Playfair Display | Roboto Mono | Elegant contrast | Executive summaries |

The first 5 pairings are recommended for most use cases. Vary across consecutive diagrams.

### Typography by Content Voice

For prose-heavy pages (documentation, articles, essays), match typography to the content's voice:

| Voice | Fonts | Best For |
|-------|-------|----------|
| **Literary / Thoughtful** | Literata, Lora, Newsreader, Merriweather | Essays, personal posts, long-form articles |
| **Technical / Precise** | IBM Plex Sans + Mono, Geist + Geist Mono, Source family | Documentation, READMEs, API references |
| **Bold / Contemporary** | Bricolage Grotesque, Space Grotesk, DM Sans | Product pages, feature announcements |
| **Minimal / Focused** | Source Serif 4 + Source Sans 3, Karla + Inconsolata | Tutorials, how-tos, focused reading |

**Literata** deserves special mention — it has optical sizing designed specifically for screen reading. Google's answer to Georgia, but modernized.

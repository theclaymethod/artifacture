# Precise, low-token visual annotations for coding agents

Research date: 2026-08-14

Scope: React Grab and Plannotator's official documentation and source. This note separates the data needed to keep a browser marker attached from the much smaller payload a coding agent needs to find and edit source.

## Conclusion

The preview should copy **resolved source locations, not DOM diagnostics**.

Keep a rich internal anchor for marker restoration (selector, tag, text fingerprint, normalized click point, component/source candidates), but project it into a terse agent envelope:

```text
Visual review: agent-driven-design · slide c0-00

deck/slides/c0/c0-00.tsx
- 31:7 <h1> "Agent-Driven Design" — Shorten this to “Agent Design”.
- 54:9 <MetricCard> "15×" — Make this less visually dominant.
```

That gives the agent its three essential facts—file, source position/component, and instruction—without making it spend tokens interpreting a CSS path or a 2 KB `outerHTML` dump. If source resolution fails, include a compact fallback locator such as `slide c0-00 · h1.hero-title · "Agent-Driven Design"`; only offer full HTML through a separate “Copy diagnostics” action.

The current preview can include up to 2,000 characters of HTML for every note. The proposed locator is usually about 100–250 characters before the user's comment, so ordinary annotations should shed roughly an order of magnitude of machine-generated context while becoming more actionable.

## React Grab

### What it copies

React Grab's normal clipboard representation is intentionally terse:

```text
[<a class="ml-auto inline-block text-sm" href="#">Forgot your password?</a> in LoginForm (at components/login-form.tsx:46:19)]
```

That is the core pattern worth adopting: compact rendered evidence, nearest useful component, and project-relative source coordinates in a single line. [Official README example](https://github.com/aidenybai/react-grab/blob/f8c2c71ad772e8ab5371addd697010f0b3183d69/README.md#L16-L28)

Its clipboard carries three MIME representations: `text/plain`, escaped `text/html`, and a richer `application/x-react-grab` JSON envelope. Structured entries can include tag, component name, compact content, the user's prompt/comment, resolved source, a rendered component trace, and structured stack frames. [Clipboard writer](https://github.com/aidenybai/react-grab/blob/f8c2c71ad772e8ab5371addd697010f0b3183d69/packages/react-grab/src/utils/copy-content.ts#L6-L55), [structured entry types](https://github.com/aidenybai/react-grab/blob/f8c2c71ad772e8ab5371addd697010f0b3183d69/packages/react-grab/src/types.ts#L603-L623)

The per-entry source record carries file, line, column, and component. Stack frames preserve function, file, line, column, and server/symbolication flags, but raw stack-line strings and function arguments are removed from the wire form. This is a good privacy and token-budget boundary. [Payload construction](https://github.com/aidenybai/react-grab/blob/f8c2c71ad772e8ab5371addd697010f0b3183d69/packages/react-grab/src/core/copy.ts#L37-L62)

### How it finds source

React Grab finds the nearest DOM node carrying a React fiber, then resolves dev source metadata and the React owner stack concurrently. Its source-ranking logic prefers trusted application fiber source, then high-signal application owner frames, then other application/shared-UI frames, and uses package source last. [Fiber/source resolution](https://github.com/aidenybai/react-grab/blob/f8c2c71ad772e8ab5371addd697010f0b3183d69/packages/react-grab/src/core/context.ts#L269-L335), [source precedence](https://github.com/aidenybai/react-grab/blob/f8c2c71ad772e8ab5371addd697010f0b3183d69/packages/react-grab/src/core/context.ts#L338-L381)

Next.js virtual frames are batch-symbolicated through `__nextjs_original-stack-frames`. React Grab only displays owner-stack line/column for Next.js; it treats positions supplied by other bundlers such as Vite as unreliable. That is an important warning for this preview: a line number is only useful if the build pipeline can prove it points to the original TSX. [Next.js symbolication](https://github.com/aidenybai/react-grab/blob/f8c2c71ad772e8ab5371addd697010f0b3183d69/packages/react-grab/src/core/next-server-frames.ts#L100-L144), [location display policy](https://github.com/aidenybai/react-grab/blob/f8c2c71ad772e8ab5371addd697010f0b3183d69/packages/react-grab/src/core/context.ts#L472-L500)

Source-resolution work is cached and bounded independently of multi-element selection: source and owner stack resolve in parallel, bundle/source-map work goes through a three-request queue, and the system falls back after eight seconds. [Source-fetch queue](https://github.com/aidenybai/react-grab/blob/f8c2c71ad772e8ab5371addd697010f0b3183d69/packages/react-grab/src/utils/source-fetch-queue.ts#L1-L100), [limits](https://github.com/aidenybai/react-grab/blob/f8c2c71ad772e8ab5371addd697010f0b3183d69/packages/react-grab/src/constants.ts#L36-L68)

### How it keeps payloads small

React Grab does not paste `outerHTML`. It creates a preview with explicit budgets: text is capped at 100 characters; at most eight attributes survive; ordinary attribute values are capped at 15 characters and identifying values at 120; internal/noisy attributes are filtered; and child subtrees collapse to short placeholders/counts. [Preview formatter](https://github.com/aidenybai/react-grab/blob/f8c2c71ad772e8ab5371addd697010f0b3183d69/packages/react-grab/src/core/html-preview.ts#L20-L120), [preview budgets](https://github.com/aidenybai/react-grab/blob/f8c2c71ad772e8ab5371addd697010f0b3183d69/packages/react-grab/src/constants.ts#L127-L175)

Its rendered component trace defaults to three high-signal application frames. Library/shared-UI frames do not consume that soft budget, all traces have a 20-frame hard cap, duplicate frames are removed, and package paths collapse to component/package names instead of long `node_modules` paths. [Trace budgeting and deduplication](https://github.com/aidenybai/react-grab/blob/f8c2c71ad772e8ab5371addd697010f0b3183d69/packages/react-grab/src/core/context.ts#L568-L672)

### Selector and repeated-instance strategy

React Grab makes selectors subordinate to source confidence:

- If trusted application source exists, it only includes a semantic selector when available.
- If source resolution fails, it emits a unique fallback selector.
- Semantic selectors prefer stable unique IDs and identifying attributes such as test IDs, `aria-label`, `href`, `role`, `name`, `title`, and `alt`.
- General fallback uses a scored unique-selector search and then positional selectors; iframe and shadow-root segments are composed explicitly.

[Selector inclusion policy](https://github.com/aidenybai/react-grab/blob/f8c2c71ad772e8ab5371addd697010f0b3183d69/packages/react-grab/src/core/context.ts#L747-L765), [selector construction](https://github.com/aidenybai/react-grab/blob/f8c2c71ad772e8ab5371addd697010f0b3183d69/packages/react-grab/src/utils/create-element-selector.ts#L19-L177), [preferred attributes](https://github.com/aidenybai/react-grab/blob/f8c2c71ad772e8ab5371addd697010f0b3183d69/packages/react-grab/src/utils/preferred-selector-attribute-names.ts#L1-L14)

Mapped siblings can share the same JSX source line, so React Grab also captures the nearest React key as a disambiguation hint. That should inform annotations on repeated stat/card components in a slide. [List-key strategy](https://github.com/aidenybai/react-grab/blob/f8c2c71ad772e8ab5371addd697010f0b3183d69/packages/react-grab/src/core/context.ts#L62-L101), [key emission](https://github.com/aidenybai/react-grab/blob/f8c2c71ad772e8ab5371addd697010f0b3183d69/packages/react-grab/src/core/context.ts#L747-L765)

### Multi-element batching and comments

Multi-select deduplicates identical `Element` references, resolves all entries concurrently, joins their compact plain references, and retains one structured entry per selected element. A user prompt is prepended once to plain text and attached as `commentText` in metadata; if a transform changes the combined text, per-element reference content remains available in each structured entry. [Multi-element batching](https://github.com/aidenybai/react-grab/blob/f8c2c71ad772e8ab5371addd697010f0b3183d69/packages/react-grab/src/core/copy.ts#L65-L75), [prompt and transform handling](https://github.com/aidenybai/react-grab/blob/f8c2c71ad772e8ab5371addd697010f0b3183d69/packages/react-grab/src/core/copy.ts#L78-L137)

## Plannotator

### What it captures internally

Plannotator maintains two complementary anchor types:

- Ordinary document annotations retain the selected `originalText`, block id, start/end offsets, and optional DOM-relative start/end metadata.
- Raw-HTML pinpoint annotations add a unique CSS selector, tag name, a normalized text fingerprint, and an optional normalized click point. Multi-target comments attach additional `{label, text, anchor}` targets to one annotation. [Annotation and HTML-anchor types](https://github.com/backnotprop/plannotator/blob/59ef54be4440898f4418853477e2229fe16968f8/packages/ui/types.ts#L60-L124)

The normalized point is specifically presentation state: Plannotator reprojects it against the element's current rectangle so a visual pin follows responsive layout changes. It is useful for the preview UI, not for an agent payload. [HTML anchor point contract](https://github.com/backnotprop/plannotator/blob/59ef54be4440898f4418853477e2229fe16968f8/packages/ui/types.ts#L96-L108)

### How it identifies and restores an HTML element

Its selector ladder is a strong pattern to adopt for browser-side durability:

1. Prefer a unique `id`.
2. Try unique semantic/identity attributes (`data-annotate`, test ids, `aria-label`, `name`, `role`, `href`, `alt`).
3. Try up to two meaningful, non-generated classes.
4. Fall back to a positional `tag > tag:nth-of-type(...)` path.
5. Prove every candidate is unique with `querySelectorAll` before storing it.

[Selector ladder and uniqueness checks](https://github.com/backnotprop/plannotator/blob/59ef54be4440898f4418853477e2229fe16968f8/packages/ui/components/html-viewer/bridge-script.ts#L2331-L2434)

Plannotator then fails closed rather than silently moving a pin. Weak class/positional/behavioral selectors must still match the captured tag and text fingerprint. Textless elements require stable author-controlled identity (`id` or a test/data attribute); otherwise the system stores no element anchor. [Anchor construction and fail-closed restoration](https://github.com/backnotprop/plannotator/blob/59ef54be4440898f4418853477e2229fe16968f8/packages/ui/components/html-viewer/bridge-script.ts#L2436-L2495)

This is safer than treating “a selector that currently matches once” as durable identity. It also establishes a useful product state: an unresolved annotation should be marked stale/unanchored and re-targeted, not guessed onto a nearby element.

### What reaches the agent

Plannotator deliberately exports a simpler representation than it stores. Its document feedback is sorted by block and offset, numbers each note, quotes the selected text, and emits the user's comment. Multi-target HTML comments add only each extra target's semantic label and a text excerpt capped at 120 characters. The CSS selector and click geometry are not included in normal agent-facing markdown. [Feedback exporter](https://github.com/backnotprop/plannotator/blob/59ef54be4440898f4418853477e2229fe16968f8/packages/ui/utils/parser.ts#L1099-L1225)

For code review, Plannotator uses the more actionable pattern: group annotations by file and sort them by line, emitting headings such as `src/middleware/validate.ts` and `Line 12 (new)`. [Official code-review feedback example](https://github.com/backnotprop/plannotator/blob/59ef54be4440898f4418853477e2229fe16968f8/apps/marketing/src/content/blog/local-diff-review-for-coding-agents.md#L40-L72)

Plannotator also uses compact positional arrays when annotations must travel in a share URL, keeping only type, selected text, comment, author, attachments, and quick-label status. The restore path reconstructs block/offset metadata by searching the document again. This is a useful transport optimization, although it intentionally does not preserve raw-HTML selectors in that sharing representation. [Minimal share representation](https://github.com/backnotprop/plannotator/blob/59ef54be4440898f4418853477e2229fe16968f8/packages/ui/utils/sharing.ts#L15-L31), [serialization and restore note](https://github.com/backnotprop/plannotator/blob/59ef54be4440898f4418853477e2229fe16968f8/packages/ui/utils/sharing.ts#L60-L90)

### Multi-annotation batching

Plannotator has two useful batching levels:

- A review exports all notes in stable document order rather than copying each one separately.
- Shift-click can bind several HTML elements to one comment. The primary target is quoted normally; additional elements are represented by short label/text lines rather than repeating the comment or full HTML for every target.

For this slide preview, stable **slide order → source file → source position** is a better ordering key than annotation creation time. Notes sharing the same resolved source file should share one file heading. A single instruction applied to several repeated cards should be one grouped annotation, not N duplicated comments.

## Recommended design for this preview

### Constraint in the current deck pipeline

The test deck's exporter currently asks Bun for a minified browser bundle, defines `process.env.NODE_ENV` as `production`, and inlines that bundle into the generated HTML; it does not request a source map. Therefore React Grab's fiber/owner-stack technique should be treated as an optional signal here, not assumed to produce trustworthy TSX coordinates. This is an inference from the current exporter at `/Users/claytonkim/dev/f-explainer/agent-driven-design/tools/export-deck.mjs` and React Grab's own policy of suppressing untrusted bundler coordinates.

There are two sound paths:

- Near term: use React Grab-style component/fiber context when available, then verify or resolve the location server-side against the known slide TSX. The current preview already has project source discovery for text edits, so annotation resolution can reuse its read-only matching logic.
- Stronger long term: make the developer export preserve source provenance (source maps or compile-time element/source ids) and strip it from the publishing build. A stable dev-only source id is better than hoping a minified production fiber contains an original TSX location.

### 1. Store a rich internal anchor

Each annotation should retain enough information to re-render, re-resolve, and diagnose drift:

```ts
type VisualAnnotation = {
  id: string
  slideId: string
  comment: string
  dom: {
    selector?: string
    tag: string
    text?: string       // normalized, capped fingerprint
    point?: { x: number; y: number }
  }
  react?: {
    component?: string
    key?: string
    ownerStack?: Array<{ component?: string; file: string; line: number; column: number }>
  }
  source?: {
    file: string
    line: number
    column: number
    endLine?: number
    symbol?: string
    confidence: "exact" | "inferred" | "ambiguous"
  }
}
```

The DOM anchor is for the preview. The React/source fields are for code navigation and export. Keep ambiguity explicit; do not convert a best guess into an exact line.

### 2. Resolve before copying

At annotation time or immediately before copy:

1. Ask the React runtime for the selected element's closest host fiber, owner/source stack, and nearest list key. Treat locations from this step as candidates until verified against the deck source.
2. Normalize absolute locations to project-relative paths.
3. Prefer the closest user-owned source frame that points into the deck project; omit framework/runtime frames. For a reusable component, prefer a call-site frame containing the selected literal/prop over the generic host JSX inside the component definition.
4. If runtime source metadata is unavailable or cannot be verified, reuse the preview's TSX text resolver, narrowed by the slide's owning module, tag, exact normalized text, component context, and React key when present.
5. If exactly one visible JSX occurrence resolves, attach its line/column with `exact` confidence. If several remain, mark the annotation ambiguous and let the user choose before copying.

This should be a read-only resolution endpoint. It must not invoke the edit/publish path.

### 3. Copy a compact projection

Default format:

```text
Visual review: <deck> · <slide>

<relative-file>
- <line>:<column> <Component-or-tag> "<short text>" — <comment>
```

Rules:

- Group by file; print a relative path once.
- Include line and column when exact. A source range is only useful for a multi-line selection.
- Include only the nearest useful component/tag, not the whole owner stack.
- Include at most about 80 normalized characters of visible text, and only when it disambiguates the location.
- Do not include timestamps, UUIDs, status, normalized click point, CSS selector, class list, or `outerHTML` in the default copy.
- Do not repeat boilerplate for every annotation. One opening sentence is enough.
- Sort by slide order, then file, then source line.
- For a multi-target annotation, list compact target references after one comment: `targets: 31:7, 48:7, 65:7`.

### 4. Use a clear fallback hierarchy

If no exact source frame exists:

```text
- [unresolved] slide c0-00 · h1.hero-title · "Agent-Driven Design" — Shorten this.
```

If more than one source candidate exists:

```text
- [ambiguous: 2] "Agent-Driven Design" — Shorten this.
  candidates: deck/slides/c0/c0-00.tsx:31, deck/slides/c0/index.ts:8
```

The second form is still much smaller and safer than pasting full markup. It also tells the agent not to update every matching string blindly.

### 5. Offer two copy modes

- **Copy for agent**: source-first compact envelope above.
- **Copy diagnostics**: DOM selector, HTML excerpt, full React owner stack, and resolution candidates for debugging the annotation machinery.

Keeping those separate prevents rare troubleshooting data from imposing a token tax on every normal edit.

## What to adopt and what not to adopt

Adopt from Plannotator:

- proven-unique selector generation;
- text fingerprints and fail-closed restoration;
- normalized click points for marker placement;
- one comment spanning multiple targets;
- ordered, file-grouped batch export;
- compact presentation distinct from stored annotation state.

Do not copy from Plannotator unchanged:

- selected-text-only agent addressing for raw HTML. It is appropriate for reviewing documents but underuses the source knowledge available in a React deck preview.

Adopt from React Grab:

- source location as the primary agent locator;
- nearest useful component/source context rather than a raw DOM path;
- a compact, single-line context envelope.

Do not make the default payload a diagnostic dump. CSS selectors and HTML excerpts are useful recovery evidence, but source path plus line/column is the lowest-token locator an agent can act on directly.

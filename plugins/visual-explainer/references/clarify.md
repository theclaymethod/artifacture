# Clarify Before Generating — AskUserQuestion Policy

**The principle.** A skill that silently guesses what the user wants produces polished-looking output that misses the brief. Cheap questions prevent expensive misfires. Use `AskUserQuestion` to confirm content direction before generating — especially for high-cost commands like video, magazine, and poster output.

This reference defines *when* to ask, *what* to ask, and *how to bypass* the question step when it's unnecessary.

---

## Tiered Triggers

The policy is tiered — different command costs get different default behavior.

### Tier 0 — Always ask (high-cost commands)

For these commands, ask at least 1–3 questions via `AskUserQuestion` **regardless of how clear the user's request is**, unless `--no-ask` is passed.

- `/generate-video`
- `/render-video`
- `/generate-slides` with `--magazine`
- `/generate-poster`

Rationale: these commands take minutes of wall-clock to produce, use non-trivial compute (render farm / poster-ai / Hyperframes), and are hard to "just tweak" afterward. A 30-second confirmation dialog saves multiple minutes of rework.

**Minimum questions at this tier:**
- Video: style (long-form vs reel), duration, narration preference (TTS auto / user script / silent)
- Magazine: aesthetic, dark-panel rhythm, page count target
- Poster: canvas size, focal element, aesthetic

### Tier 1 — Ask when ambiguous (most commands)

For everything else, ask 1–3 questions via `AskUserQuestion` **only when the skill cannot form a confident 1-sentence brief** covering:
1. **Topic** — what is the content about?
2. **Audience** — who is reading / viewing? (dev / PM / exec / team / public)
3. **Depth** — overview (5 min read) / deep dive (20 min read) / reference doc?
4. **Aesthetic** — Mono-Industrial (default) or a named alternative?

If any of these four is genuinely unclear from the user's prompt + current context, ask. If all four are answerable from the request, generate directly.

Commands at this tier:
- `/generate-web-diagram`
- `/generate-visual-plan`
- `/generate-slides` (vertical, non-magazine)
- `/diff-review`
- `/plan-review`
- `/project-recap`

### Tier 2 — Never ask (mechanical commands)

These commands operate on a target and don't have creative choices to make. Don't ask.

- `/fact-check` (verifies an existing file)
- `/share` (deploys an existing file)

---

## Escape Hatches

The user can always opt out of questions. Respect any of these signals:

- `--no-ask` flag on the command
- Phrases in the prompt: "just generate", "don't ask", "go ahead", "use defaults"
- The prompt explicitly answers every Tier 1 dimension (topic, audience, depth, aesthetic)
- The prompt includes a pre-made outline or structured brief that answers the questions

When any escape hatch applies, skip `AskUserQuestion` entirely and use best defaults + what the user gave you.

---

## How to Phrase Questions

Use `AskUserQuestion` with 1–4 questions per dialog. Each question:
- Has 2–4 **mutually exclusive** options (unless `multiSelect: true`)
- Phrases options as concrete choices, not abstract labels
- Marks the recommended default as the first option, labeled `(recommended)`
- Keeps `header` short (≤ 12 chars) — it shows as a chip

**Bad.** Vague / abstract:
```
Q: "How deep should this go?"
   - Shallow / Medium / Deep
```

**Good.** Concrete / actionable:
```
Q: "How much detail does the audience need?"
   - 5-min overview (recommended) — hero + 3 cards + one diagram
   - 20-min deep dive — full architecture, API surface, decision log
   - Reference doc — every module, every decision, collapsible details
```

### Video dialog template

For `/generate-video`:

```
Q1: What format fits the audience?
    - Long-form 16:9 explainer (recommended) — 60-180s, slide-paced, for meetings / docs / LinkedIn
    - Reel 9:16 — 30-60s, hard-cut brain-rot style, for Shorts / Reels / TikTok

Q2: Target duration?
    - Short — 30s (reel default)
    - Medium — 60s (recommended for long-form)
    - Long — 90s
    - Extended — 180s (requires chunked narrative)

Q3: Narration?
    - Auto TTS (recommended) — pick a voice from Hyperframes' bundled set
    - I'll provide a script — paste it in a follow-up
    - Silent — visuals only, no audio
```

### Magazine dialog template

For `/generate-slides --magazine`:

```
Q1: How many pages?
    - Short magazine — 8-12 pages (recommended)
    - Standard — 14-20 pages
    - Extended — 22-30 pages (year-in-review scale)

Q2: Aesthetic?
    - Mono-Industrial (recommended) — grayscale tints, status color as focal
    - Nothing — instrument-panel black/white surfaces with one urgent red accent
    - Editorial-Diagram — warm stone, rust/coral accent
    - Custom — tell me in free text
```

### Ambiguous-topic dialog template

For Tier 1 commands when the brief is unclear:

```
Q1: Who's the audience?
    - Engineers (recommended)
    - PMs / leadership
    - External / public
    - Mixed — optimize for skim

Q2: How deep?
    - Quick overview (recommended) — read in 3-5 min
    - Thorough — read in 15-20 min
    - Reference doc — full detail, collapsibles for depth
```

---

## What NOT to Ask

Questions that feel like friction kill the flow. Skip these:
- **Layout questions the skill can answer.** Don't ask "should this be a card grid or a table?" — pick the right format.
- **Aesthetic when the default is clearly correct.** If the user didn't name an alternative, Mono-Industrial is fine; don't confirm.
- **Questions with an obvious answer from context.** If the user said "for my team," don't ask "who's the audience?"
- **Technical implementation questions.** Never ask "Mermaid or inline SVG?" — follow the decision table in SKILL.md.
- **Meta questions.** Don't ask "ready to generate?" or "does this plan look good?" — just do the work.

---

## Integration Into Command Workflow

Every command that applies this policy should include, near the top of its workflow section, a note like:

> **Clarify.** This is a Tier [0 / 1 / 2] command under the policy in `./references/clarify.md`. [Always ask at least X / Ask only when ambiguous / Don't ask]. Bypass with `--no-ask`.

Tier 0 commands must explicitly call `AskUserQuestion` before any render / generation work. Tier 1 commands should check the four-dimension brief (topic, audience, depth, aesthetic) and ask only if anything is unclear. Tier 2 commands skip entirely.

---

## Examples

### Example — Tier 1 command, unambiguous request (no ask)

User: "Draw me a diagram of our auth flow, it's for the engineering team, keep it dense."

- Topic: auth flow ✓
- Audience: engineering team ✓
- Depth: dense (deep dive) ✓
- Aesthetic: not specified → default to Mono-Industrial (OK to skip)

**Action:** Generate directly. No AskUserQuestion.

### Example — Tier 1 command, ambiguous request (ask 1 question)

User: "Make something about our caching layer."

- Topic: caching ✓
- Audience: unclear ✗
- Depth: unclear ✗
- Aesthetic: default OK

**Action:** Ask 1 question covering audience + depth combined:
```
Q: Who's the audience for this?
   - Engineers needing a deep dive (recommended)
   - Leadership needing a one-pager
   - External / docs readers
   - Mixed — I'll optimize for skim
```

### Example — Tier 0 command, clear request (still ask minimum)

User: "Make a 45-second reel about our latency improvements, use TTS, long-form."

- The user contradicted themselves (45s is reel duration but they said "long-form"). Ask to resolve.

**Action:** Ask 1 clarifying question:
```
Q: 45 seconds is typically reel duration. Which did you mean?
   - Reel (9:16 vertical, 45s, hard cuts, burned captions) (recommended)
   - Long-form at 45s (16:9, 45s is tight — will be paced fast)
```

### Example — `--no-ask` override

User: "/generate-video make an explainer about our queue redesign --no-ask"

**Action:** Skip AskUserQuestion entirely. Use best defaults: long-form 16:9, 90 seconds, TTS narration, Mono-Industrial aesthetic. Generate.

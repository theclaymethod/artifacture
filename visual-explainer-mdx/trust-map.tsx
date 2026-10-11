// The trust-map explainer: data components that render each data-driven level of an understando
// trust map. The narrative (the story, the loop, why, trade-offs) stays MDX that an agent writes;
// these components drop in the levels that come from data. Each one validates its input and
// throws on bad data, so the static pre-render of `ve:export` fails the export.
// The card plugins/visual-explainer/cards/trust-map.md holds the data contract.
import { Children, cloneElement, Fragment, isValidElement, useContext, useEffect, useId, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { ChapterContext } from './chapter-context';
import { isPlainWord, MAX_TERMS_PER_CHAPTER } from './glossary-policy.mjs';
import { CodeBlock, DiffBlock, TerminalBlock, type DiffRow } from './code-blocks';
import { ChipLinks, Disclosure, Subsection, Term } from './content-blocks';
import { DataTable, Legend, StatusPill, ToneMark, type LegendItem, type StatusTone } from './data-table';
import { DiagramCanvas } from './diagram-canvas';
import { DiagramModes } from './diagram-modes';
import type { DiagramEdge, DiagramNode } from './diagram-types';
import { DiagramWalkthrough } from './diagram-walkthrough';
import { chainOrder, StationFlow } from './station-flow';
import {
  assertAreas, assertRefs, assertTrustMap, brokeOf, capital, changeDiagram, claimAnchor, claimLabel, claimOf, controlWalkthrough, derivedClaim, expansion, findRef,
  FLAG_TONE, GLYPH_FAMILY, glossaryEntries, isAcronym, isTool, KIND_GLYPH, ladder, LADDER_NAMES, lines, MAX_MERGE_ITEMS, MERGE_WORDS,
  norm, OUTCOME, promiseAnchor, promiseRows, reader, repeats, replacedRows, slug, STATE_TONE, strengthOf, strongestTier, STRONG, TIER_WORD,
  TONE, TrustMapError, VERDICT_MEANING, VERDICTS, VISIBLE_UNCLAIMED, weakest,
  type Claim, type CheckResult, type CodeRefSpec, type ResolvedRef, type DerivedBar, type DerivedClaim, type Tone, type UnclaimedFile, type Control, type DiagramSpec, type Explain, type GlossaryEntry, type Ready, type Refs, type TrustMap, type Verdict, type Verifier,
} from './trust-map-rules';
import './trust-map.css';

export { promiseAnchors } from './trust-map-rules';

type Data = { data: TrustMap };
type WithRefs = Data & { refs: Refs };

// ---- Glossary terms in running text ----------------------------------------------------------

type Base = { entries: Array<GlossaryEntry & { expansion: string | null }>; pattern: RegExp | null };

/**
 * The glossary words of one text block. `seen` holds the words that this chapter has marked before
 * the block, `expanded` the abbreviations that the page has spelled out before it. A block adds its
 * own words to `shared` too, so the next block of the chapter (and of the page) skips them.
 */
export type TermState = Base & { seen: Set<string>; expanded: Set<string>; expand: boolean; shared: { seen: Set<string>; expanded: Set<string> } };

const BASES = new WeakMap<TrustMap, Base>();

function termBase(data: TrustMap): Base {
  const hit = BASES.get(data);
  if (hit) return hit;
  const entries = glossaryEntries(data).map((g) => ({ ...g, expansion: expansion(g.term, g.meaning) }));
  const forms = [...new Set(entries.flatMap((g) => [g.term, ...(g.aliases ?? [])]).filter((f) => f.length >= 2 && !isPlainWord(f)))].sort((a, b) => b.length - a.length);
  const alts = forms.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const base = { entries, pattern: alts ? new RegExp(`(?<![\\w-])(${alts})(?:s|es)?(?![\\w-])`, 'gi') : null };
  BASES.set(data, base);
  return base;
}

/** A state of its own, outside any chapter: each word marked once in the block, nothing shared. */
export function termState(data: TrustMap, expand = false): TermState {
  const shared = { seen: new Set<string>(), expanded: new Set<string>() };
  return { ...termBase(data), seen: new Set(), expanded: new Set(), expand, shared };
}

type PageTerms = { chapters: Map<string, Set<string>>; expanded: Set<string>; blocks: Map<string, { seen: string[]; expanded: string[] }> };
const PAGES = new WeakMap<TrustMap, PageTerms>();

/**
 * The glossary words of a block in a chapter: the chapter marks each word once, at its first use,
 * and at most MAX_TERMS_PER_CHAPTER words; the page spells out each abbreviation once (`expand`).
 * A block keeps the state that it started with, so a re-render marks the same words.
 */
export function useTerms(data: TrustMap, expand = false): TermState {
  const chapter = useContext(ChapterContext) ?? '';
  const id = useId();
  let page = PAGES.get(data);
  if (!page) {
    page = { chapters: new Map(), expanded: new Set(), blocks: new Map() };
    PAGES.set(data, page);
  }
  const seen = page.chapters.get(chapter) ?? new Set<string>();
  page.chapters.set(chapter, seen);
  let start = page.blocks.get(id);
  if (!start) {
    start = { seen: [...seen], expanded: [...page.expanded] };
    page.blocks.set(id, start);
  }
  return { ...termBase(data), seen: new Set(start.seen), expanded: new Set(start.expanded), expand, shared: { seen, expanded: page.expanded } };
}

function findTerm(state: TermState, word: string) {
  const w = norm(word);
  return state.entries.find((g) => [g.term, ...(g.aliases ?? [])].some((f) => (isAcronym(f) ? f === word : f.toLowerCase() === word.toLowerCase() || norm(f) === w)));
}

/** Text with a Term at the first use of each glossary word; an abbreviation is spelled out at its first use on the page when `expand` is on. */
function glossed(text: string, state: TermState | null, key = 't'): ReactNode {
  if (!state?.pattern || !text) return text;
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(state.pattern)) {
    const hit = findTerm(state, m[1]);
    if (!hit || isPlainWord(hit.term) || state.seen.has(hit.term) || state.seen.size >= MAX_TERMS_PER_CHAPTER) continue;
    state.seen.add(hit.term);
    state.shared.seen.add(hit.term);
    if (m.index! > last) out.push(text.slice(last, m.index));
    const spell = state.expand && hit.expansion && m[1] === hit.term && !state.expanded.has(hit.term);
    if (spell) {
      state.expanded.add(hit.term);
      state.shared.expanded.add(hit.term);
    }
    out.push(<Term definition={`${hit.term}: ${hit.meaning}`} expansion={spell ? hit.expansion! : undefined} key={`${key}-${m.index}`}>{m[0]}</Term>);
    last = m.index! + m[0].length;
  }
  if (!out.length) return text;
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** STE text from the data: a `backtick` span becomes code, the rest gets reader words and glossary terms. */
export function Rich({ text, terms }: { text: string; terms?: TermState | null }) {
  return <>{text.split('`').map((part, i) => (part ? (i % 2 ? <code key={i}>{part}</code> : <Fragment key={i}>{glossed(reader(part), terms ?? null, `r${i}`)}</Fragment>) : null))}</>;
}

const SKIP_GLOSS = new Set(['code', 'pre', 'a', 'blockquote']);

function glossChildren(node: ReactNode, state: TermState): ReactNode {
  return Children.map(node, (child) => {
    if (typeof child === 'string') return glossed(child, state);
    if (!isValidElement(child)) return child;
    const el = child as ReactElement<{ children?: ReactNode }>;
    if (typeof el.type === 'string' && SKIP_GLOSS.has(el.type)) return el;
    if (el.props.children === undefined) return el;
    return cloneElement(el, undefined, glossChildren(el.props.children, state));
  });
}

/**
 * Narrative prose with glossary terms: the first use of each word of the glossary in this chapter
 * shows its definition on hover, focus or tap. Everyday words (glossary-policy.mjs) stay plain, and a
 * chapter marks at most MAX_TERMS_PER_CHAPTER words. Wrap the Markdown of one level in it. Each
 * abbreviation is spelled out once, at its first use on the page; `expand={false}` turns that off.
 */
export function Glossed({ data, expand = true, children }: Data & { expand?: boolean; children: ReactNode }) {
  assertTrustMap(data);
  return <>{glossChildren(children, useTerms(data, expand))}</>;
}

// ---- Small pieces ----------------------------------------------------------------------------

export function VerdictPill({ verdict }: { verdict: Verdict }) {
  return <StatusPill meaning={`${verdict}: ${VERDICT_MEANING[verdict]}`} tone={TONE[verdict]}>{verdict}</StatusPill>;
}

type MarkRun = { n: number; tone: StatusTone; label: string; hollow?: boolean };

/**
 * Countable marks: one square per item, so "5 of 13" reads at a glance. A filled square is an
 * item that holds (met, caught, the tone of its verdict); a hollow one is an item below its bar.
 * The text beside the marks says the same, so the marks are never the only cue.
 */
export function CountMarks({ runs, label }: { runs: readonly MarkRun[]; label: string }) {
  return (
    <span aria-label={label} className="ve-count-marks" role="img">
      {runs.flatMap((r, i) => Array.from({ length: r.n }, (_, j) => <span data-ve-hollow={r.hollow ? 'true' : undefined} data-ve-tone={r.tone} key={`${i}-${j}`} title={r.label} />))}
    </span>
  );
}

const BAR_LINE = /^(\d+) of (\d+) (.+?) claims? meets? (?:its|their) bar(.*)$/;

/** One evidence-bar line of derive.py: its marks when the line counts claims, then its words. */
function BarLine({ line, terms }: { line: string; terms: TermState }) {
  const m = BAR_LINE.exec(line);
  if (!m) return <li data-ve-bar-line="note"><Rich terms={terms} text={line} /></li>;
  const met = Number(m[1]);
  const total = Number(m[2]);
  return (
    <li data-ve-bar-line="count">
      <CountMarks label={`${met} of ${total} ${m[3]} claims meet their bar`} runs={[{ n: met, tone: 'ok', label: 'meets its bar' }, { n: total - met, tone: 'warn', label: 'below its bar', hollow: true }]} />
      <span><Rich terms={terms} text={line} /></span>
    </li>
  );
}

/**
 * The marks of the page in one line: what a verdict, a bar and a planted-bug result look like.
 * Every pill and mark on the page uses these tones and shapes, and nothing else.
 */
export function MarkKey({ id }: { id?: string }) {
  const items: Array<[StatusTone, string]> = [['ok', 'meets its bar, or caught the bug'], ['info', 'Backed: evidence, not proven'], ['warn', 'below its bar, or missed the bug'], ['err', 'Gap, cannot fail, or risky and below']];
  return (
    <div className="ve-mark-key" data-ve-legend id={id}>
      <p className="ve-legend-title">How to read the marks</p>
      <ul>{items.map(([tone, text]) => <li data-ve-tone={tone} key={tone}><ToneMark tone={tone} /><span>{text}</span></li>)}</ul>
    </div>
  );
}

export function Defs({ items }: { items: Array<[ReactNode, ReactNode, ('ok' | 'info' | 'warn' | 'err')?]> }) {
  return (
    <dl className="ve-definition-list">
      {items.map(([term, body, tone], i) => (
        <Fragment key={i}>
          <dt data-ve-tone={tone}>{term}</dt>
          <dd data-ve-tone={tone}>{body}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

const LANGUAGE: Record<string, string> = { '.py': 'python', '.ts': 'ts', '.tsx': 'tsx', '.js': 'js', '.mjs': 'js', '.json': 'json', '.md': 'markdown', '.sh': 'bash', '.toml': 'toml', '.yml': 'yaml', '.yaml': 'yaml' };
const languageOf = (path: string) => LANGUAGE[path.slice(path.lastIndexOf('.'))] ?? 'text';

/** The lines of a code ref at the PR head, from refs.resolved.json, with a link to them. Code never comes from typed text. */
export function CodeRef({ refs, ...ref }: { refs: Refs } & CodeRefSpec) {
  if (!refs?.refs) throw new TrustMapError('CodeRef needs refs={refs} (refs.resolved.json)');
  return <RefCode r={findRef(refs, ref)} refs={refs} />;
}

type LineKind = 'add' | 'mod' | 'remove' | 'same';
const LINE_SIGN: Record<LineKind, string> = { add: '+', mod: '~', remove: '-', same: ' ' };
const LINE_WORD: Record<LineKind, string> = { add: 'added', mod: 'changed', remove: 'removed', same: '' };
const escapeCode = (text: string) => text.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]!));

/**
 * The highlighted lines of a ref with their diff status: a gutter with the line number and a sign
 * (+ added, ~ changed, - removed), and the removed base lines inline. A head line has its number at
 * the head, a removed line its number at the base. An older refs.resolved.json, with no `changes`,
 * marks the added lines of `diff.added` only. A "look closely" flag marks its own line.
 */
function refLines(refs: Refs, r: ResolvedRef, mark?: { line: number; level: string }) {
  const range = (spans: Array<[number, number]>) => spans.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i));
  const changes = r.changes ?? { added: range(refs.diff.added[r.path] ?? []), modified: [], removed: [] };
  const added = new Set(changes.added);
  const modified = new Set(changes.modified);
  const html = r.html ?? `<pre class="shiki"><code>${r.excerpt.split('\n').map((l) => `<span class="line">${escapeCode(l)}</span>`).join('\n')}</code></pre>`;
  const parts = /^([\s\S]*?<code[^>]*>)([\s\S]*)(<\/code>[\s\S]*)$/.exec(html) ?? ['', '<pre class="shiki"><code>', escapeCode(r.excerpt), '</code></pre>'];
  const inner = (line: string) => line.replace(/^<span class="line">/, '').replace(/<\/span>$/, '');
  const row = (kind: LineKind, no: number, code: string, flag = '') =>
    `<span class="line" data-ve-line="${kind}"${flag}><span class="ve-line-gutter"><span class="ve-line-no">${no}</span><span class="ve-line-sign"${kind === 'same' ? '' : ` title="${LINE_WORD[kind]}"`}>${LINE_SIGN[kind]}</span></span>${code}</span>`;
  const removedBefore = (test: (at: number) => boolean) => changes.removed.filter((x) => test(x.at)).map((x) => row('remove', x.base, x.html ?? escapeCode(x.text)));
  const kinds = new Set<LineKind>(changes.removed.length ? ['remove'] : []);
  const out: string[] = [];
  parts[2].split('\n').forEach((line, i) => {
    const no = r.start + i;
    out.push(...removedBefore((at) => (i === 0 ? at <= no : at === no)));
    const kind: LineKind = modified.has(no) ? 'mod' : added.has(no) ? 'add' : 'same';
    kinds.add(kind);
    out.push(row(kind, no, inner(line), mark && mark.line === no ? ` data-ve-flag="${mark.level}"` : ''));
  });
  out.push(...removedBefore((at) => at > r.end));
  const digits = String(Math.max(r.end, ...changes.removed.map((x) => x.base))).length;
  return { html: parts[1] + out.join('\n') + parts[3], kinds, digits };
}

/** The key of the signs that a ref shows: each sign in its own gutter style, with its word. */
function LineKey({ kinds }: { kinds: Set<LineKind> }) {
  const shown = (['add', 'mod', 'remove'] as const).filter((k) => kinds.has(k));
  if (!shown.length) return null;
  return (
    <span className="ve-line-key">
      {shown.map((k) => <span data-ve-line={k} key={k}><span className="ve-line-sign">{LINE_SIGN[k]}</span> {LINE_WORD[k]}{k === 'remove' ? ' (its number is before the PR)' : ''}</span>)}
    </span>
  );
}

/** A resolved ref as code: its highlighted lines with their diff status, a key of the signs, and a link to the lines at the PR head. */
function RefCode({ refs, r, mark }: { refs: Refs; r: ResolvedRef; mark?: { line: number; level: string } }) {
  const name = `${r.path}:${r.start}` + (r.end !== r.start ? `-${r.end}` : '');
  const created = refs.diff.created.includes(r.path);
  const { html, kinds, digits } = refLines(refs, r, mark);
  const some = kinds.has('add') || kinds.has('mod') || kinds.has('remove');
  return (
    <div className="ve-code-ref" data-ve-changed={created ? 'new' : some ? 'changed' : 'context'} data-ve-code-lines data-ve-code-ref data-ve-marked={mark ? 'true' : undefined} style={{ '--ve-line-digits': digits } as CSSProperties}>
      <CodeBlock code={r.excerpt} filename={name} html={html} language={r.language} />
      <p>{mark ? `Line ${mark.line} is the one to look at. ` : ''}{created ? 'A new file: each line is new. ' : ''}<LineKey kinds={kinds} />{r.permalink ? <a href={r.permalink}>Open these lines at the PR head</a> : null}</p>
    </div>
  );
}

/** A link to a promise, with its label from the map: "Promise: <label>". */
export function PromiseLink({ data, id }: Data & { id: string }) {
  assertTrustMap(data);
  const p = data.promises.find((x) => x.id === id);
  if (!p) throw new TrustMapError(`PromiseLink names the promise ${id}, which the map does not have`);
  return <a className="ve-promise-link" href={'#' + promiseAnchor(p.id)}><span className="ve-promise-link-key">Promise</span> {p.label}</a>;
}

// ---- Diagrams --------------------------------------------------------------------------------

const CODE_LIKE: Array<[RegExp, string]> = [
  [/`/, 'backticked text'], [/\b[a-z][a-z0-9]*_[a-z0-9_]+\b/, 'a snake_case name'], [/\b[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*\b/, 'a CamelCase name'],
  [/\b[a-z]+[A-Z][A-Za-z0-9]*\b/, 'a camelCase name'], [/\b[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]{1,}\b/, 'a dotted module or file name'], [/\w\(\)/, 'a function call'],
];
const codeLike = (text = '') => CODE_LIKE.find(([p]) => p.test(text))?.[1] ?? null;
const graph = (g: DiagramSpec['eli5']) => ({ nodes: g.nodes as unknown as DiagramNode[], edges: g.edges as unknown as DiagramEdge[], ...(g.legend ? { legend: g.legend as LegendItem[] } : {}) });

/**
 * One architecture diagram in two modes: Simple (about four to six boxes in plain words, the
 * default) and Detailed (the same node ids, named by their real modules). The export fails when
 * a mode is missing, when the Detailed mode has more than 1.5 times the boxes, or when the Simple
 * mode shows a code name.
 */
export function ArchitectureDiagram({ spec, name = spec?.title, numbered = false }: { spec: DiagramSpec; name?: string; numbered?: boolean }) {
  if (!spec) throw new TrustMapError(`ArchitectureDiagram ${name ?? ''}: the spec is missing`);
  for (const mode of ['eli5', 'detailed'] as const) if (!spec[mode]?.nodes?.length) throw new TrustMapError(`diagram ${name}: it has no ${mode} mode; each architecture diagram needs eli5 and detailed nodes and edges`);
  const detailIds = new Set(spec.detailed.nodes.map((n) => n.id));
  const missing = spec.eli5.nodes.filter((n) => !detailIds.has(n.id)).map((n) => n.id);
  if (missing.length) throw new TrustMapError(`diagram ${name}: the eli5 nodes ${missing.join(', ')} have no detailed node with the same id`);
  if (spec.detailed.nodes.length > Math.ceil(1.5 * spec.eli5.nodes.length)) throw new TrustMapError(`diagram ${name}: ${spec.detailed.nodes.length} detailed nodes for ${spec.eli5.nodes.length} eli5 nodes; keep it at 1.5 times or less`);
  for (const n of spec.eli5.nodes) for (const text of [n.label, n.detail]) { const hit = codeLike(text); if (hit) throw new TrustMapError(`diagram ${name}: the eli5 node ${n.id} has ${hit}: ${text}`); }
  for (const e of spec.eli5.edges) { const hit = codeLike(e.label); if (hit) throw new TrustMapError(`diagram ${name}: an eli5 edge label has ${hit}: ${e.label}`); }
  // Numbered stations: each Simple box takes its place in the run (1, 2, 3 ...), and the Detailed
  // box with the same id takes the same number, so the figure and a Steps list read as one.
  const station = new Map(spec.eli5.nodes.map((n, i) => [n.id, i + 1]));
  const number = (g: DiagramSpec['eli5']) => (numbered ? { ...g, nodes: g.nodes.map((n) => (station.has(n.id) ? { ...n, label: `${station.get(n.id)}. ${n.label}` } : n)) } : g);
  if (numbered && chainOrder(graph(spec.eli5))) return <StationFlow description={spec.description} detailed={graph(spec.detailed)} simple={graph(spec.eli5)} title={spec.title} />;
  return (
    <DiagramModes description={spec.description} detailed={graph(number(spec.detailed))} direction={spec.direction as 'wrap' | undefined} layout={(spec.layout ?? 'flow') as 'flow'} modes={spec.modes} showTitle simple={graph(number(spec.eli5))} title={spec.title} />
  );
}

const SHAPE_NAMES: Record<string, string> = { rect: 'step', oval: 'input or result', diamond: 'decision' };

/** A step-by-step motion figure, collapsed, with a key for its box shapes. */
export function Walkthrough({ spec, id }: { spec: { title: string; description: string; nodes: unknown[]; edges: unknown[]; steps: unknown[] }; id?: string }) {
  const shapes = [...new Set((spec.nodes as Array<{ shape?: string }>).map((n) => n.shape ?? 'rect'))].sort((a, b) => ['rect', 'oval', 'diamond', 'dot'].indexOf(a) - ['rect', 'oval', 'diamond', 'dot'].indexOf(b));
  const legend = shapes.filter((g) => SHAPE_NAMES[g]).map((g) => ({ label: SHAPE_NAMES[g], glyph: g })) as LegendItem[];
  return (
    <Disclosure id={id} lazy summary={'Worked example: ' + spec.title.charAt(0).toLowerCase() + spec.title.slice(1)}>
      <p>{spec.description}</p>
      <DiagramWalkthrough description={spec.description} edges={spec.edges as DiagramEdge[]} layout="flow" legend={legend} nodes={spec.nodes as DiagramNode[]} steps={spec.steps as never} title={spec.title} />
    </Disclosure>
  );
}

// ---- Level 1: the merge verdict, the promise chips, the legend --------------------------------

/** The four verdicts (and Formal, when the map uses it), each a swatch, its word and its meaning. */
export function VerdictLegend({ data, id = 'story-legend' }: Data & { id?: string }) {
  assertTrustMap(data);
  const used = new Set(data.claims.map((c) => c.verdict));
  const items = VERDICTS.filter((v) => v !== 'Formal' || used.has(v)).map((v) => ({ label: v, tone: TONE[v], detail: capital(VERDICT_MEANING[v]) }));
  return <div data-ve-trust="legend" id={id}><Legend items={items} layout="list" title="What each verdict means" /></div>;
}

/**
 * Can you merge it? First on the page (#merge): the state word, then up to three items, each a
 * link, and the bugs found; then the ready checklist when ready.json is at the map head. Each
 * value comes from the derived block of refs.resolved.json (scripts/derive.py).
 */
export function MergeVerdict({ data, refs }: WithRefs & { explain?: Explain }) {
  assertTrustMap(data);
  assertRefs(data, refs);
  // derive.py derived the verdict once, so the review CLI and the PR body give the same answer.
  const gates: Ready | null = refs.derived.ready;
  const { form, items } = refs.derived.merge;
  const bugs = refs.derived.bugs ?? [];
  const [word, tone, lead] = MERGE_WORDS[form];
  const shown = items.slice(0, MAX_MERGE_ITEMS);
  const rest = items.slice(MAX_MERGE_ITEMS);
  const terms = useTerms(data);
  return (
    <div data-ve-trust="merge">
      <Subsection id="merge" title="Can you merge it?">
        <div className="ve-verdict" data-ve-tone={tone}>
          <p data-merge-verdict={form}><span className="ve-verdict-word"><ToneMark tone={tone} />{word}</span> <span className="ve-verdict-lead">{lead}</span></p>
          {shown.length ? (
            <ol data-merge-items>
              {shown.map((i) => <li key={i.href + i.text}><a href={i.href}>{i.label}</a>: <Rich terms={terms} text={i.text} /></li>)}
            </ol>
          ) : null}
          {rest.length ? <p className="ve-verdict-more">And {rest.length} more: {rest.map((i, n) => <Fragment key={i.href + n}>{n ? ', ' : ''}<a href={i.href}>{i.label}</a></Fragment>)}.</p> : null}
        </div>
        {refs.derived.bars ? (
          <div data-ve-bars>
            <p>By evidence bar: {refs.derived.bars.summary}</p>
            <ul className="ve-bar-lines">{refs.derived.bars.story.map((line, n) => <BarLine key={n} line={line} terms={terms} />)}</ul>
          </div>
        ) : null}
        {bugs.length ? (
          // The find-bugs heading format (P1, P2, P3) is fixed, so the prose checks skip it.
          <div data-ve-bugs data-ve-lint="skip">
            <p><strong>Bugs found: {bugs.length}.</strong> {bugs.filter((b) => b.verified).length} verified, {bugs.filter((b) => !b.verified).length} {bugs.filter((b) => !b.verified).length === 1 ? 'lead' : 'leads'}.</p>
            {bugs.map((b, i) => (
              <Disclosure key={i} summary={b.heading}>
                <div data-ve-lint="skip"><ul>{b.lines.map((line, j) => <li key={j}>{line}</li>)}</ul></div>
              </Disclosure>
            ))}
          </div>
        ) : null}
      </Subsection>
      {gates ? (
        <Subsection id="story-ready" title="Ready checklist">
          <p>Four gates decide if the PR is ready to review.</p>
          <Defs items={gates.gates.map((g) => [`Gate ${g.n}: ${g.name}`, <Rich key={g.n} text={(g.pass ? 'Pass. ' : 'Fail. ') + g.detail} />, g.pass ? 'ok' : 'err'])} />
          {gates.gates.some((g) => g.items?.length) ? (
            <Disclosure summary="Show what each gate found"><ul>{gates.gates.flatMap((g) => (g.items ?? []).map((item, n) => <li key={`${g.n}-${n}`}>Gate {g.n}: {item}</li>))}</ul></Disclosure>
          ) : null}
        </Subsection>
      ) : null}
    </div>
  );
}

/** One chip per promise, weakest first; the pill shows its weakest claim. Then the verdict legend. */
export function PromiseChips({ data, refs }: WithRefs) {
  assertTrustMap(data);
  assertRefs(data, refs);
  const terms = useTerms(data);
  const chips = promiseRows(data, refs).map(({ promise: p, strength }) => ({ label: p.label, href: '#' + promiseAnchor(p.id), tone: TONE[strength], status: strength, meaning: `${strength}: ${VERDICT_MEANING[strength]}` }));
  return (
    <div data-ve-trust="chips">
      <Subsection id="story-promises" title="What the PR promises">
        <p><Rich terms={terms} text="Each row is one promise, weakest first. The pill shows the strength of its weakest claim. Select a promise to see the proof." /></p>
        <ChipLinks items={chips} label="The promises, weakest first" />
        <MarkKey />
        <Disclosure id="story-legend" summary="What each verdict means">
          <VerdictLegend data={data} id="story-legend-list" />
        </Disclosure>
      </Subsection>
    </div>
  );
}

// ---- Level 3: what changed -------------------------------------------------------------------

/** The before-and-after diagram and the "replaced by" table, both from the diff of refs.resolved.json and the areas of explain.json. */
export function WhatChanged({ data, refs, explain = {} }: WithRefs & { explain?: Explain }) {
  assertTrustMap(data);
  assertRefs(data, refs);
  const areas = explain.change?.areas ?? [];
  assertAreas(areas, refs);
  const rows = replacedRows(areas, refs).map((r) => ({ cells: { file: { text: r.file }, removed: lines(r.removed, '-'), by: r.by } }));
  const columns = [{ key: 'file', label: 'Deleted or replaced', kind: 'id' as const, width: '20rem' }, { key: 'removed', label: 'Lines removed', kind: 'number' as const, width: '8rem' }, { key: 'by', label: 'Replaced by' }];
  return (
    <div data-ve-trust="changed">
      <Subsection id="change-diagram" title="Before and after"><ArchitectureDiagram name="before and after (from the diff)" spec={changeDiagram(areas, refs)} /></Subsection>
      <Subsection id="change-table" title="What the PR deletes, and what replaces it">
        {rows.length ? <DataTable columns={columns} label="Deleted or replaced code" rows={rows} /> : <p><em>The PR deletes no code file.</em></p>}
      </Subsection>
    </div>
  );
}

// ---- Level 4: the promises -------------------------------------------------------------------

export function controlEdits(refs: Refs, k: Control) {
  const edits = refs.controls?.[k.id];
  if (!edits) throw new TrustMapError(`control ${k.id} has no patch in refs.resolved.json; run understando explain again`);
  return edits.map((e, i) => {
    if (e.patch || e.before !== undefined) return <DiffBlock after={e.after} before={e.before} filename={e.path} key={i} language={e.language} patch={e.patch} rows={e.rows as DiffRow[] | undefined} />;
    return <p key={i}><code>{e.note ?? 'changed bytes'}</code> {e.path}</p>;
  });
}

/**
 * The recorded e2e video of a frontend check, with its controls, poster frame, captions or text
 * summary and key screenshots, behind a Disclosure. It never plays by itself. With JavaScript off,
 * the browser still shows the poster frame, and a link opens the video.
 */
export function BrowserVideo({ artifact, name }: { artifact: NonNullable<Verifier['artifact']>; name: string }) {
  const shots = artifact.screenshots ?? [];
  return (
    <Disclosure summary={`Show the recorded browser run of ${name}`}>
      <figure data-ve-video>
        <video controls poster={shots[0]} preload="metadata" src={artifact.video}>
          {artifact.captions ? <track default kind="captions" label="Captions" src={artifact.captions} /> : null}
        </video>
        <figcaption>{artifact.summary || 'The recorded e2e run in a real browser.'} <a href={artifact.video}>Open the video</a></figcaption>
      </figure>
      {shots.length ? <div data-ve-screenshots>{shots.map((src, i) => <img alt={`Screenshot ${i + 1} of the browser run`} key={src} loading="lazy" src={src} />)}</div> : null}
    </Disclosure>
  );
}

function VerifierBlock({ v, data, refs }: { v: Verifier; data: TrustMap; refs: Refs }) {
  const label = `${v.name ? v.name + '. ' : ''}${v.kind} check, ${TIER_WORD[v.tier] ?? v.tier}, ${v.state ?? 'unknown'} (${v.id}):`;
  const m = v.mechanical?.result;
  const b = v.baseline ?? {};
  return (
    <div data-ve-lint="skip">
      <p><strong>{label}</strong> {reader(`${v.description} Provenance: ${v.provenance}`)}</p>
      {v.recorded ? <TerminalBlock content={v.recorded.result} title={'Recorded: ' + v.recorded.source} /> : null}
      {v.artifact?.video ? <BrowserVideo artifact={v.artifact} name={v.name ?? v.id} /> : null}
      {v.formal ? <TerminalBlock content={[`${v.formal.tool} ${v.formal.artifact}`, v.formal.conformance.source, v.formal.conformance.detail].filter(Boolean).join('\n')} title={'Conformance link: ' + v.formal.conformance.status} /> : null}
      {m ? <TerminalBlock content={`$ ${m.command}\n${m.detail}`} title={'Mechanical check at the PR head: ' + m.status} /> : null}
      {v.command ? <CodeBlock code={'$ ' + v.command.argv.join(' ')} filename={'At the PR head: ' + (b.status ?? 'not run')} language="bash" /> : null}
      {v.command && b.output_tail ? <TerminalBlock content={b.output_tail} title="Output at the PR head" /> : null}
      {data.controls.filter((k) => k.verifier === v.id).map((k) => {
        const status = k.result?.status ?? 'not run';
        const outcome = status === 'red' ? OUTCOME.caught[0].toLowerCase() : status === 'green' ? OUTCOME.missed[0].toLowerCase() : status;
        const tail = k.result?.output_tail ?? k.result?.note ?? '';
        return (
          <Fragment key={k.id}>
            <p><strong>{status === 'red' || status === 'green' ? `The check ${outcome} (${k.id}).` : `Control ${k.id}: ${status}.`}</strong> {reader(k.description)}</p>
            {controlEdits(refs, k)}
            {tail ? <TerminalBlock content={tail} title={`Control ${k.id} output`} /> : null}
          </Fragment>
        );
      })}
    </div>
  );
}

/** A risk of explain.json names a claim by its id or by an old id that the claim joins. */
export const risksOf = (data: TrustMap, explain: Explain, c: Claim) => (explain.risks ?? []).filter((r) => r.claims.some((id) => claimOf(data, id) === c));

/** The words of a check result, short, for a claim row. */
const RESULT_SHORT: Record<CheckResult, string> = {
  caught: 'caught its bug', missed: 'missed its bug', 'cannot-fail': 'cannot fail', broken: 'fails at the head', 'no-bug': 'no planted bug ran',
  recorded: 'a record, not run again', checked: 'a mechanical check', none: 'no check',
};
const RESULT_TONE: Record<CheckResult, StatusTone> = { caught: 'ok', missed: 'warn', 'cannot-fail': 'err', broken: 'err', 'no-bug': 'info', recorded: 'info', checked: 'info', none: 'err' };

const barTone = (b: DerivedBar): StatusTone => (b.met ? 'ok' : b.risky ? 'err' : 'warn');

/** The bar of a claim as a chip: "Bar: proof · below". */
export function BarChip({ bar }: { bar: DerivedBar }) {
  return <span data-ve-bar-chip={bar.met ? 'met' : 'below'}><StatusPill meaning={bar.text} tone={barTone(bar)}>{bar.met ? `Meets bar: ${bar.need}` : `Below bar: ${bar.need}`}</StatusPill></span>;
}

/** The check of a claim that a reviewer reads first: a flagged check, else a weakest check that did not catch its bug. */
function claimNote(d: DerivedClaim): string | null {
  if (d.flagged) return d.flagged.text.replace(/ Fix it or drop it\.$/, '');
  if (d.weakest && d.weakest.result !== 'caught' && d.weakest.result !== 'none') return `${capital(d.weakest.name)}: ${RESULT_SHORT[d.weakest.result]}.`;
  return null;
}

/**
 * One claim in one line, the same everywhere a claim shows: its strength, its name (a link to its
 * one detail), its bar chip, one square per check (filled when the check caught its bug), and the
 * flagged or weakest check. The full detail of a claim shows once on the page.
 */
export function ClaimRow({ data, refs, claim }: WithRefs & { claim: Claim | string }) {
  const c = typeof claim === 'string' ? claimOf(data, claim) : claim;
  if (!c) throw new TrustMapError(`ClaimRow names the claim ${String(claim)}, which the map does not have`);
  const d = derivedClaim(refs, c.id);
  const note = claimNote(d);
  const tools = d.checks.filter((x) => x.kind !== 'none');
  return (
    <div className="ve-claim-row" data-ve-claim-row={slug(c.id)} data-ve-tone={TONE[d.strength]}>
      <VerdictPill verdict={d.strength} />
      <a className="ve-claim-row-name" href={'#' + claimAnchor(c.id)}><Rich text={capital(claimLabel(c))} /></a>
      {d.bar ? <BarChip bar={d.bar} /> : null}
      <span className="ve-claim-row-checks">
        {tools.length ? <CountMarks label={d.summary} runs={tools.map((x) => ({ n: 1, tone: RESULT_TONE[x.result], label: `${capital(x.name)}: ${RESULT_SHORT[x.result]}`, hollow: x.result !== 'caught' && x.result !== 'missed' && x.result !== 'cannot-fail' }))} /> : null}
        <span>{tools.length ? `${tools.length} ${tools.length === 1 ? 'check' : 'checks'}` : 'No check'}</span>
      </span>
      {note ? <span className="ve-claim-row-note" data-ve-tone={d.flagged ? 'warn' : RESULT_TONE[d.weakest!.result]}><Rich text={note} /></span> : null}
    </div>
  );
}

/**
 * The evidence bar of a claim as a card beside its detail: the state with its mark, a gauge (a
 * full bar when it is met, an empty dashed bar when it is below), the surface and the bar, and why.
 */
export function BarCard({ bar }: { bar: DerivedBar }) {
  const tone = barTone(bar);
  return (
    <div className="ve-bar-card" data-ve-bar={bar.met ? 'met' : 'below'} data-ve-tone={tone}>
      <p className="ve-bar-card-state"><ToneMark tone={tone} /> {bar.met ? 'Meets its bar' : 'Below its bar'}</p>
      <span aria-hidden="true" className="ve-bar-gauge" />
      <p><span className="ve-guide-key">Surface</span> {capital(bar.surfaces.join(' and '))}{bar.risky ? ', risky' : ''}</p>
      <p><span className="ve-guide-key">Bar</span> {capital(bar.need)}</p>
      <p className="ve-bar-card-why">{bar.met ? 'Each part of the claim has this evidence.' : capital(bar.why) + '.'}</p>
    </div>
  );
}

/**
 * The lines of a ref at the PR head, as the diff spine shows them, with their diff status (RefCode).
 * A ref with no lines is a link to read.
 */
export function ChangedCode({ refs, codeRef, label, mark }: { refs: Refs; codeRef: CodeRefSpec; label?: string; mark?: { line: number; level: string } }) {
  const r = findRef(refs, codeRef);
  if (r.link_only || !r.excerpt) {
    return <p className="ve-changed-link" data-ve-code-link>{r.permalink ? <a href={r.permalink}>{label ?? `Read ${codeRef.symbol ?? 'the change'} at the PR head`}</a> : label}<span className="ve-quiet"> Lines {r.start} to {r.end}.</span></p>;
  }
  return <RefCode mark={mark} r={r} refs={refs} />;
}

/** A resolved ref, or null when the build did not resolve it (an older refs.resolved.json). */
export function maybeRef(refs: Refs, ref: CodeRefSpec) {
  try { return findRef(refs, ref); } catch { return null; }
}

const RESULT_LONG: Record<CheckResult, string> = {
  caught: 'caught its planted bug', missed: 'missed its planted bug', 'cannot-fail': 'cannot fail: it passed on each planted bug', broken: 'fails or does not finish at the PR head',
  'no-bug': 'no planted bug ran', recorded: 'a record of a past run, not run again', checked: 'a mechanical check, no planted bug', none: 'no tool checks it',
};

/**
 * One check in one row, the same everywhere a check shows: its result mark, its name and kind, the
 * claims and parts that it backs, and what its planted bug did. Its test and its planted bugs wait
 * behind the row; `lazy` renders them only when the reviewer opens it. `children` replaces that body.
 */
export function CheckRow({ data, refs, id, lazy = false, children, hideClaims = false }: WithRefs & { id: string; lazy?: boolean; children?: ReactNode; hideClaims?: boolean }) {
  const row = refs.derived.checks?.[id];
  const v = data.verifiers.find((x) => x.id === id);
  if (!v) throw new TrustMapError(`CheckRow names the check ${id}, which the map does not have`);
  const result: CheckResult = row?.result ?? (v.kind === 'none' ? 'none' : 'no-bug');
  const tone = RESULT_TONE[result];
  const controls = data.controls.filter((k) => k.verifier === id);
  const test = row?.ref ? maybeRef(refs, row.ref) : null;
  const body = children ?? (
    <div data-ve-lint="skip">
      {test && row?.ref ? <ChangedCode codeRef={row.ref} refs={refs} /> : row?.tests.length ? <p>Runs <code>{row.tests.map((t) => t.file + (t.symbol ? `::${t.symbol}` : '')).join(', ')}</code>.</p> : null}
      {v.command ? <CodeBlock code={'$ ' + v.command.argv.join(' ')} filename={'At the PR head: ' + (v.baseline?.status === 'green' ? 'passes' : v.baseline?.status ?? 'not run')} language="bash" /> : null}
      {controls.map((k) => (
        <Fragment key={k.id}>
          <p><strong>{k.result?.status === 'red' ? 'The check caught this planted bug.' : k.result?.status === 'green' ? 'The check missed this planted bug.' : `Planted bug: ${k.result?.status ?? 'not run'}.`}</strong> {reader(k.description)}</p>
          {controlEdits(refs, k)}
        </Fragment>
      ))}
    </div>
  );
  const name = capital(row?.name ?? v.name ?? id);
  return (
    <div className="ve-check-row" data-ve-check-row={slug(id)} data-ve-result={result} data-ve-tone={tone}>
      <Disclosure lazy={lazy} meta={id} summary={
        <span className="ve-check-row-line">
          <ToneMark tone={tone} />
          <span className="ve-check-row-name">{name}</span>
          <span className="ve-check-row-kind">{v.kind}</span>
          <span className="ve-check-row-result">{RESULT_LONG[result]}</span>
        </span>
      }>
        {body}
      </Disclosure>
      {!hideClaims && row?.claims.length ? (
        <p className="ve-check-row-backs">Backs {row.claims.map((c, i) => <Fragment key={c.id}>{i ? ', ' : ''}<a href={'#' + claimAnchor(c.id)}>{c.name}</a>{c.parts.length ? <span className="ve-quiet"> (the part: {c.parts.map((t) => t.replace(/`/g, '').replace(/\.$/, '')).join('; ')})</span> : null}</Fragment>)}</p>
      ) : null}
    </div>
  );
}

/** The summary row of a claim: its strength, its name and its bar chip. */
export function ClaimSummary({ data, refs, claim }: WithRefs & { claim: Claim }) {
  const d = derivedClaim(refs, claim.id);
  return <><VerdictPill verdict={d.strength} /> <Rich text={capital(claimLabel(claim))} />{d.bar ? <> <BarChip bar={d.bar} /></> : null}</>;
}

/**
 * The body of one claim: the derived check summary and the weakest check with its action; the
 * plain what and proof; the bar card; the statements that it joins; its code as the diff spine
 * shows it; then each check, collapsed, with its controls as real diffs.
 */
export function ClaimBody({ data, refs, claim, explain = {}, said = false }: WithRefs & { claim: Claim | string; explain?: Explain; said?: boolean }) {
  assertTrustMap(data);
  assertRefs(data, refs);
  const c = typeof claim === 'string' ? data.claims.find((x) => x.id === claim) : claim;
  if (!c) throw new TrustMapError(`ClaimDetail names the claim ${String(claim)}, which the map does not have`);
  const d = derivedClaim(refs, c.id);
  const risk = risksOf(data, explain, c)[0];
  const plain = c.plain ?? { what: c.text, proof: c.reason ?? '' };
  const terms = useTerms(data);
  const items: Array<[ReactNode, ReactNode, ('ok' | 'warn' | 'err' | undefined)?]> = [];
  items.push(['Checks', <span data-ve-checks>{d.summary}</span>]);
  if (d.weakest) {
    items.push([d.parts?.length ? 'Weakest part' : 'Evidence', <span data-ve-weakest><Rich text={d.weakest.text} /> <span data-ve-action><Rich text={d.weakest.action} /></span></span>, d.weakest.result === 'caught' && STRONG.includes(d.weakest.strength as Verdict) ? 'ok' : 'warn']);
  }
  if (d.flagged) items.push(['Flagged check', <span data-ve-flagged><Rich text={d.flagged.text} /> <span data-ve-action><Rich text={d.flagged.action} /></span></span>, 'warn']);
  // `said`: the item around the body says what the claim says already.
  if (plain.what && c.name && !said) items.push(['What it says', <Rich terms={terms} text={plain.what} />]);
  if (plain.proof) items.push(['How it is proven', <Rich terms={terms} text={plain.proof} />]);
  if (plain.warning) items.push(['Warning', <Rich terms={terms} text={plain.warning} />, 'warn']);
  if (risk && !STRONG.includes(d.strength)) {
    items.push(['Why it is weak', <Rich terms={terms} text={risk.why} />, 'warn']);
    // The action of a weak check names its cheapest fix already: say it once.
    if (risk.fix && !repeats(d.weakest?.action, risk.fix) && !repeats(d.flagged?.action, risk.fix)) items.push(['Cheapest fix', <Rich terms={terms} text={risk.fix} />]);
  }
  items.push(['Verdict', <Rich text={c.reason ? `${d.strength}. ${c.reason}` : `${d.strength}.`} />]);
  if (d.tier) items.push(['Strongest check', `${capital(LADDER_NAMES[d.tier])}.`]);
  if (c.waiver) items.push(['Waived', <Rich text={c.waiver.reason} />, 'warn']);
  items.push(['Source', c.source]);
  for (const id of [c.invariant, ...(c.invariants ?? [])].filter(Boolean)) {
    const inv = (data.invariants ?? []).find((i) => i.id === id);
    if (!inv) continue;
    const confirmed = inv.author === 'user' && inv.status === 'accepted';
    items.push(['Invariant', (confirmed ? 'Confirmed by the user: ' : 'Proposed, not confirmed by the user: ') + inv.text, confirmed ? undefined : 'warn']);
  }
  const verifiers = new Map(data.verifiers.map((v) => [v.id, v]));
  const evals = (refs.derived.verify.evals ?? []).filter((e) => d.checks.some((x) => x.id === e.check));
  const n = d.checks.length;
  return (
    <div data-ve-trust="claim">
      {(c.legacy_ids ?? []).filter((old) => old !== c.id).map((old) => <span data-ve-legacy-anchor id={claimAnchor(old)} key={old} />)}
      <div className="ve-claim-evidence">
        <Defs items={items} />
        {d.bar ? <BarCard bar={d.bar} /> : null}
      </div>
      {evals.length ? (
        <ul className="ve-eval-lines" data-ve-evals>{evals.map((e) => (
          <li data-ve-eval={e.flagged ? 'flagged' : 'degraded'} key={e.check}><strong>{capital(e.name)}.</strong> <Rich text={e.text} />{e.action ? <> <span data-ve-action><Rich text={e.action} /></span></> : null}</li>
        ))}</ul>
      ) : null}
      {c.parts?.length ? (
        <Disclosure summary={`Show the ${c.parts.length} statements that this claim joins`}>
          <ul data-ve-claim-parts>{c.parts.map((part) => {
            const row = d.parts?.find((x) => x.id === part.id);
            return <li key={part.id}>{row ? <><VerdictPill verdict={row.strength} /> </> : null}<Rich text={part.text} />{row?.check ? ` (${row.check})` : ''}</li>;
          })}</ul>
        </Disclosure>
      ) : null}
      {(c.code ?? []).map((ref, i) => <ChangedCode codeRef={ref} key={i} refs={refs} />)}
      {n ? (
        <div className="ve-check-rows" data-ve-claim-checks>
          <p className="ve-check-rows-title">{n === 1 ? 'Its check' : `Its ${n} checks`}</p>
          {d.checks.map((check) => {
            if (check.kind === 'none') return <p data-ve-lint="skip" key={check.id}><strong>{capital(check.name)} ({check.id}).</strong> No tool checks this claim.</p>;
            const v = verifiers.get(check.id);
            if (!v) throw new TrustMapError(`the derived block names the check ${check.id} of the claim ${c.id}, which the map does not have; run understando explain again`);
            return <CheckRow data={data} hideClaims id={v.id} key={v.id} refs={refs}><VerifierBlock data={data} refs={refs} v={v} /></CheckRow>;
          })}
        </div>
      ) : <p><em>No check backs this claim.</em></p>}
    </div>
  );
}

/** One claim, collapsed: its summary row, then its body. This is the one full detail of the claim on the page. */
export function ClaimDetail({ data, refs, claim, explain = {} }: WithRefs & { claim: Claim | string; explain?: Explain }) {
  assertTrustMap(data);
  assertRefs(data, refs);
  const c = typeof claim === 'string' ? data.claims.find((x) => x.id === claim) : claim;
  if (!c) throw new TrustMapError(`ClaimDetail names the claim ${String(claim)}, which the map does not have`);
  return (
    <Disclosure id={claimAnchor(c.id)} meta={c.id} share summary={<ClaimSummary claim={c} data={data} refs={refs} />}>
      <ClaimBody claim={c} data={data} explain={explain} refs={refs} />
    </Disclosure>
  );
}

/**
 * The promises, weakest first. Each promise: its label as the heading, its sentence, its
 * strongest tier, its strength (the verdict of its weakest claim) and its tally, a reviewer
 * action and the cheapest fix when it is weak; its claims collapsed, each a ClaimDetail.
 */
export function PromiseList({ data, refs, explain = {} }: WithRefs & { explain?: Explain }) {
  assertTrustMap(data);
  assertRefs(data, refs);
  const risks = explain.risks ?? [];
  const terms = useTerms(data);
  for (const r of risks) for (const id of r.claims) if (!claimOf(data, id)) throw new TrustMapError(`explain.json risks name the claim ${id}, which the map does not have`);
  const rows = promiseRows(data, refs);
  return (
    <div data-ve-trust="promises">
      <p><Rich terms={terms} text="The promises come weakest first. Open a promise to see its claims, then a claim to see its code, its checks and the bugs that we planted." /></p>
      <ReadingGuide data={data} refs={refs} rows={rows} terms={terms} />
      <div className="ve-card-stack">
        {rows.map(({ promise: p, strength, claims, count, tally }, i) => {
          const word = count === 1 ? 'claim' : 'claims';
          const defs: Array<[ReactNode, ReactNode, ('warn' | undefined)?]> = [];
          if (p.reviewer_action) defs.push(['Reviewer action', <Rich terms={terms} text={p.reviewer_action} />, STRONG.includes(strength) ? undefined : 'warn']);
          const fixes: Array<[ReactNode, ReactNode, string?]> = [];
          for (const c of claims) {
            const fix = risksOf(data, explain, c).find((r) => r.fix)?.fix;
            if (fix && !STRONG.includes(strengthOf(refs, c.id)) && !repeats(p.reviewer_action, fix) && !fixes.some(([, , f]) => repeats(f, fix))) fixes.push(['Cheapest fix', <><Rich terms={terms} text={fix} /> <a href={'#' + claimAnchor(c.id)}>Open the claim</a></>, fix]);
          }
          defs.push(...fixes.slice(0, 1).map(([a, b]) => [a, b] as [ReactNode, ReactNode]));
          const moreFixes = fixes.slice(1).map(([a, b]) => [a, b] as [ReactNode, ReactNode]);
          const met = refs.derived.promises.find((x) => x.id === p.id)?.bars_met;
          return (
            <article className="ve-card ve-promise" data-ve-tone={TONE[strength]} key={p.id}>
              <Subsection id={promiseAnchor(p.id)} marker={String(i + 1)} share title={p.label}>
                <p className="ve-promise-sentence"><Rich terms={terms} text={p.sentence} /></p>
                <dl className="ve-evidence-lines">
                  <dt>Strength</dt>
                  <dd data-ve-promise-tally><VerdictPill verdict={strength} /> <CountMarks label={`Its ${count} ${word}: ${tally}`} runs={claims.map((c) => ({ n: 1, tone: TONE[strengthOf(refs, c.id)], label: `${capital(claimLabel(c))}: ${strengthOf(refs, c.id)}` }))} /> <span>{`Its ${count} ${word}: ${tally}.`}</span></dd>
                  {met !== undefined ? (
                    <>
                      <dt>Bars</dt>
                      <dd data-ve-promise-bars><CountMarks label={`${met} of ${count} ${word} meet their bar`} runs={[{ n: met, tone: 'ok', label: 'meets its bar' }, { n: count - met, tone: 'warn', label: 'below its bar', hollow: true }]} /> <span>{`${met} of ${count} ${word} meet their bar.`}</span></dd>
                    </>
                  ) : null}
                  <dt>Best check</dt>
                  <dd>{strongestTier(refs, claims).replace(/^Strongest check: /, '')}</dd>
                </dl>
                {claims.filter((c) => c.waiver).map((c) => <p key={c.id}>Waived: {capital(claimLabel(c))}. Reason: {c.waiver!.reason}</p>)}
                {defs.length ? (
                  <div className="ve-todo">
                    <Defs items={defs} />
                    {moreFixes.length ? <Disclosure summary={`Show ${moreFixes.length} more ${moreFixes.length === 1 ? 'fix' : 'fixes'}`}><Defs items={moreFixes} /></Disclosure> : null}
                  </div>
                ) : null}
                <Disclosure id={promiseAnchor(p.id) + '-claims'} summary={`Show the ${count} ${word} behind this promise`}>
                  {claims.map((c) => <ClaimDetail claim={c} data={data} explain={explain} key={c.id} refs={refs} />)}
                </Disclosure>
              </Subsection>
            </article>
          );
        })}
      </div>
    </div>
  );
}

/**
 * How to read a promise, worked on the weakest promise of this PR: its claims as marks, the weakest
 * one named, and one claim through the evidence bar (surface, bar, result). Every value is derived.
 */
function ReadingGuide({ data, refs, rows, terms }: WithRefs & { rows: ReturnType<typeof promiseRows>; terms: TermState }) {
  const first = rows[0];
  if (!first) return null;
  const weakestClaim = first.claims.find((c) => strengthOf(refs, c.id) === first.strength) ?? first.claims[0];
  const barClaim = [...first.claims, ...data.claims].find((c) => derivedClaim(refs, c.id)?.bar && !derivedClaim(refs, c.id).bar!.met) ?? data.claims.find((c) => derivedClaim(refs, c.id)?.bar);
  const bar = barClaim ? derivedClaim(refs, barClaim.id).bar : undefined;
  return (
    <Subsection id="promises-guide" title="How to read a promise">
      <div className="ve-guide">
        <figure className="ve-guide-step" data-ve-guide="strength">
          <figcaption><Rich terms={terms} text={`Take "${first.promise.label}". Its ${first.count} ${first.count === 1 ? 'claim' : 'claims'}: ${first.tally}. The weakest is ${claimLabel(weakestClaim)}, so the promise is ${first.strength}.`} /></figcaption>
          <ul className="ve-guide-claims">
            {first.claims.map((c) => {
              const v = strengthOf(refs, c.id);
              return <li data-ve-weakest-claim={c === weakestClaim ? 'true' : undefined} key={c.id}><VerdictPill verdict={v} /> <Rich text={capital(claimLabel(c))} /></li>;
            })}
          </ul>
        </figure>
        {bar && barClaim ? (
          <figure className="ve-guide-step" data-ve-guide="bar">
            <figcaption><strong>The kind of code sets the bar the evidence must meet.</strong> <Rich terms={terms} text={`A claim meets its bar when each of its parts does. Take ${claimLabel(barClaim)}:`} /></figcaption>
            <ol className="ve-guide-path">
              <li><span className="ve-guide-key">Surface</span> <span>{capital(bar.surfaces.join(' and '))}{bar.risky ? ', risky' : ''}</span></li>
              <li><span className="ve-guide-key">Bar</span> <span>{capital(bar.need)}</span></li>
              <li data-ve-tone={bar.met ? 'ok' : bar.risky ? 'err' : 'warn'}><span className="ve-guide-key">Result</span> <span><ToneMark tone={bar.met ? 'ok' : bar.risky ? 'err' : 'warn'} /> {bar.met ? 'Meets its bar' : `Below its bar: ${bar.why}`}</span></li>
            </ol>
          </figure>
        ) : null}
      </div>
      <MarkKey />
      <p><a href="#story-legend">See what each verdict means</a></p>
    </Subsection>
  );
}

// ---- Level 5: verify the verifiers -----------------------------------------------------------

function verifierMapFigure(data: TrustMap, refs: Refs) {
  const verdictOf = new Map(data.claims.map((c) => [c.id, strengthOf(refs, c.id)]));
  const layerOf = new Map(data.claims.map((c) => [c.id, c.layer ?? 'Claims']));
  const kinds = new Map<string, { n: number; guess: boolean; recorded: number; checked: number }>();
  const links = new Map<string, Set<string>>();
  for (const v of data.verifiers.filter(isTool)) {
    const k = kinds.get(v.kind) ?? { n: 0, guess: false, recorded: 0, checked: 0 };
    k.n += 1; k.guess ||= v.tier === 'guess'; k.recorded += Number(v.state === 'recorded'); k.checked += Number(v.state === 'checked');
    kinds.set(v.kind, k);
    if (['cannot-fail', 'failing', 'broken'].includes(v.state ?? '')) continue;
    for (const id of v.claims) { const key = JSON.stringify([v.kind, layerOf.get(id)]); links.set(key, (links.get(key) ?? new Set()).add(id)); }
  }
  const layers = [...new Set(layerOf.values())];
  const layerVerdict = new Map(layers.map((layer) => [layer, weakest(data.claims.filter((c) => (c.layer ?? 'Claims') === layer).map((c) => verdictOf.get(c.id)))!]));
  const kindIds = new Map([...kinds.keys()].map((kind, i) => [kind, `k${i}`]));
  const layerIds = new Map(layers.map((layer, i) => [layer, `l${i}`]));
  const tier = (k: { n: number; guess: boolean; recorded: number; checked: number }) => (k.guess ? 'a model judgment' : k.recorded === k.n ? 'recorded, not run again' : k.checked === k.n ? 'mechanical check' : 'run again at the PR head');
  const nodes: Array<Record<string, string>> = [...kinds].map(([kind, k]) => ({ id: kindIds.get(kind)!, label: `${kind} (${k.n})`, shape: KIND_GLYPH[kind] ?? 'rect', detail: tier(k), ...(k.guess || k.recorded === k.n ? { stroke: 'dashed' } : {}) }));
  const covered = new Set([...links.keys()].map((key) => JSON.parse(key)[1]));
  nodes.push(...layers.map((layer) => ({ id: layerIds.get(layer)!, label: layer, tone: TONE[layerVerdict.get(layer)!], detail: `weakest: ${layerVerdict.get(layer)}` })));
  const edges: Array<Record<string, string>> = [...links].map(([key, ids]) => { const [kind, layer] = JSON.parse(key); return { from: kindIds.get(kind)!, to: layerIds.get(layer)!, label: ids.size > 1 ? `${ids.size} claims` : '1 claim' }; });
  if (layers.some((layer) => !covered.has(layer))) {
    nodes.push({ id: 'none', label: 'no verifier', shape: 'oval', stroke: 'dashed', tone: 'err', detail: 'only the PR text, or nothing' });
    edges.push(...layers.filter((layer) => !covered.has(layer)).map((layer) => ({ from: 'none', to: layerIds.get(layer)!, label: 'no check' })));
  }
  const used = VERDICTS.filter((v) => [...layerVerdict.values()].includes(v));
  const glyphs = [...new Set([...kinds.keys()].map((k) => KIND_GLYPH[k] ?? 'rect'))].sort((a, b) => Object.keys(GLYPH_FAMILY).indexOf(a) - Object.keys(GLYPH_FAMILY).indexOf(b));
  const legend = [...used.map((v) => ({ label: v, tone: TONE[v] })), ...glyphs.map((g) => ({ label: GLYPH_FAMILY[g], glyph: g })),
    { label: 'run again at the PR head', stroke: 'solid' }, { label: 'a model judgment, or recorded only', stroke: 'dashed' }] as LegendItem[];
  return { nodes: nodes as unknown as DiagramNode[], edges: edges as unknown as DiagramEdge[], legend, verdictOf };
}

/**
 * Can these checks catch a bug? Each value comes from derived.verify (scripts/derive.py). First
 * the result line (the count of checks that caught their planted bug) with a tone for the level,
 * and a quieter line about the checks with no planted bug; then one card per check that missed
 * its bug or cannot fail, each with one reviewer action and the planted bug collapsed; then the
 * checks that caught their bug, by promise and collapsed; the checks per tier; an example motion,
 * the map and the full table, collapsed. The prose shows no ID: IDs wait in the trailing refs.
 */
export function VerifyTheVerifiers({ data, refs, explain = {} }: WithRefs & { explain?: Explain }) {
  assertTrustMap(data);
  assertRefs(data, refs);
  const verify = refs.derived.verify;
  const controls = new Map(data.controls.map((k) => [k.id, k]));
  const promises = new Map(data.promises.map((p) => [p.id, p]));
  const tools = data.verifiers.filter(isTool);
  const { nodes, edges, legend, verdictOf } = verifierMapFigure(data, refs);
  const caughtColumns = [
    { key: 'check', label: 'Check', width: '12rem' }, { key: 'claim', label: 'Claim', width: '12rem' }, { key: 'broke', label: 'What we broke' },
    { key: 'result', label: 'Result', kind: 'status' as const, width: '9rem' }, { key: 'ref', label: 'Ref', kind: 'id' as const, width: '7rem' },
  ];
  return (
    <div data-ve-trust="verifiers">
      <p data-ve-result data-ve-tone={verify.tone}><StatusPill tone={verify.tone}>{verify.tone === 'ok' ? 'All caught' : verify.tone === 'warn' ? 'Some missed' : 'Some cannot fail'}</StatusPill> <strong>{verify.result}</strong> <CountMarks label={verify.result} runs={[{ n: verify.caught, tone: 'ok', label: 'caught its planted bug' }, { n: verify.missed, tone: 'warn', label: 'missed its planted bug' }, { n: verify.cannot, tone: 'err', label: 'cannot fail' }]} /></p>
      <ul aria-hidden="true" className="ve-mark-inline">
        <li data-ve-tone="ok"><span />caught the bug</li>
        {verify.missed ? <li data-ve-tone="warn"><span />missed the bug</li> : null}
        {verify.cannot ? <li data-ve-tone="err"><span />cannot fail</li> : null}
      </ul>
      {verify.other ? <p className="ve-quiet" data-ve-other>{verify.other}</p> : null}
      <p>For each check, we broke the code on purpose and ran the check. A good check fails when the code is wrong: it caught the bug.</p>
      <Subsection id="verifiers-kinds" title="Three ways to break the code">
        <dl className="ve-definition-list">
          <dt id="verifiers-planted">Planted bugs and mutants (backend)</dt>
          <dd data-ve-planted>{verify.result}</dd>
          <dt id="verifiers-evals">Degraded variants for evals (LLM)</dt>
          <dd>
            {verify.evals?.length ? (
              <ul data-ve-evals>{verify.evals.map((e) => (
                <li data-ve-eval={e.flagged ? 'flagged' : 'degraded'} key={e.check}><strong>{capital(e.name)}</strong> ({e.claim}): <Rich text={e.text} />{e.action ? <> <span data-ve-action><Rich text={e.action} /></span></> : null}</li>
              ))}</ul>
            ) : <span>No eval backs a claim of this PR.</span>}
          </dd>
          <dt id="verifiers-ui">Broken-UI runs (frontend)</dt>
          <dd>
            {verify.ui?.length ? (
              <ul data-ve-ui>{verify.ui.map((u) => (
                <li key={u.check}><strong>{capital(u.name)}</strong> ({u.claim}): {u.text}
                  {u.video ? <BrowserVideo artifact={{ video: u.video, screenshots: u.screenshots, captions: u.captions ?? undefined, summary: u.summary }} name={u.name} /> : null}</li>
              ))}</ul>
            ) : <span>No frontend claim in this PR.</span>}
          </dd>
        </dl>
      </Subsection>
      {verify.weak.length ? (
        <Subsection id="verifiers-weak" title={verify.weak.length === 1 ? 'The check that did not catch its bug' : `The ${verify.weak.length} checks that did not catch their bug`}>
          <div className="ve-card-stack">{verify.weak.map((w) => {
            const k = controls.get(w.control);
            if (!k) throw new TrustMapError(`the derived block names the control ${w.control}, which the map does not have; run understando explain again`);
            return (
              <article className="ve-card ve-weak-check" data-ve-weak-check id={'check-' + slug(w.control)} key={w.control}>
                <h4>{capital(w.name)}</h4>
                <Defs items={[
                  ['What we broke', w.broke],
                  ['What happened', w.happened, 'warn'],
                  ['Why it matters', <Rich text={w.why} />],
                  ['Reviewer action', <span data-ve-action><Rich text={w.action} /></span>, 'warn'],
                ]} />
                <Disclosure meta={w.ids} summary="Show the bug that we planted">
                  <div data-ve-lint="skip">
                    <p>{reader(k.description)}</p>
                    {controlEdits(refs, k)}
                    {k.result?.output_tail ? <TerminalBlock content={k.result.output_tail} title="Output of the check" /> : null}
                  </div>
                </Disclosure>
              </article>
            );
          })}</div>
        </Subsection>
      ) : null}
      <Subsection id="verifiers-caught" title="Checks that caught their bug">
        {verify.by_promise.map(({ id, rows: caught }) => {
          const label = promises.get(id)?.label ?? id;
          return (
            <Disclosure key={id} summary={`${label}: ${caught.length} ${caught.length === 1 ? 'check' : 'checks'} caught their bug`}>
              <DataTable columns={caughtColumns} density="compact" label={`Checks for ${label} that caught their bug`}
                rows={caught.map((r) => ({ cells: { check: capital(r.name), claim: capital(r.claim), broke: r.broke.join(' '), result: { text: 'Caught the bug', status: 'ok' }, ref: { text: r.ids } } }))} />
            </Disclosure>
          );
        })}
      </Subsection>
      <p data-ve-tiers>The checks per tier: {verify.tiers.map((t) => `${t.label}: ${t.n}.`).join(' ')}</p>
      {(explain.control_walkthroughs ?? []).map((spec, i) => {
        const motion = controlWalkthrough(data, refs, spec);
        const key = [...(['caught', 'missed'] as const).map((o) => ({ label: OUTCOME[o][0], tone: OUTCOME[o][1] })), { label: 'planted bug', glyph: 'oval' }, { label: 'check', glyph: 'rect' }] as LegendItem[];
        return (
          <Disclosure id={'verifiers-controls' + (i ? String(i) : '')} key={i} lazy summary={'Worked example: ' + spec.title.charAt(0).toLowerCase() + spec.title.slice(1)}>
            <p>{spec.description}</p>
            <DiagramWalkthrough description={motion.description} edges={motion.edges as unknown as DiagramEdge[]} layout="flow" legend={key} nodes={motion.nodes as unknown as DiagramNode[]} steps={motion.steps as never} title={motion.title} />
          </Disclosure>
        );
      })}
      <Disclosure id="verifiers-map" lazy summary="Show the map from checks to claims">
        <p>Each kind of check, with an arrow to each group of claims that it backs. A group takes the colour and the word of its weakest claim. A group with no check is a Gap, and the box marked no verifier points to it.</p>
        <DiagramCanvas description="Each kind of check and the claim groups it backs, with every claim group shown." edges={edges} layout="flow" legend={legend} nodes={nodes} title="From checks to claims" />
      </Disclosure>
      <VerifierTable data={data} id="verifiers-table" refs={refs} />
    </div>
  );
}

/** Every check in one table, collapsed: its kind, its state, the claims it backs and what each planted bug did. */
export function VerifierTable({ data, refs, id }: WithRefs & { id: string }) {
  const tools = data.verifiers.filter(isTool);
  const flags = new Map<string, Array<{ label: string; tone: string }>>();
  for (const f of data.flags ?? []) flags.set(f.subject, [...(flags.get(f.subject) ?? []), { label: f.flag, tone: FLAG_TONE[f.flag] ?? 'warn' }]);
  const columns = [
    { key: 'id', label: 'Verifier', kind: 'id' as const, width: '5.5rem' }, { key: 'kind', label: 'Kind', kind: 'tags' as const, width: '9.5rem' },
    { key: 'state', label: 'State', kind: 'status' as const, width: '8.5rem' }, { key: 'claims', label: 'Claims', kind: 'tags' as const, width: '9rem' }, { key: 'controls', label: 'Controls' },
  ];
  const rows = tools.map((v) => ({
    id: `verifier-${slug(v.id)}`,
    cells: {
      id: { text: v.id, ...(flags.has(v.id) ? { badges: flags.get(v.id) } : {}) },
      kind: { badges: [{ label: v.kind, glyph: KIND_GLYPH[v.kind] ?? 'rect', stroke: v.tier === 'guess' ? 'dashed' : 'solid' }] },
      state: { text: v.state ?? 'unknown', status: STATE_TONE[v.state ?? ''] ?? 'neutral' },
      claims: { badges: v.claims.map((cid) => ({ label: cid, tone: refs.derived.claims[cid] ? TONE[strengthOf(refs, cid)] : 'neutral' })) },
      controls: data.controls.filter((k) => k.verifier === v.id).map((k) => `${k.id} ${brokeOf(refs, k.id)} ${k.result?.status === 'red' ? 'Caught the bug' : k.result?.status === 'green' ? 'Missed the bug' : capital(k.result?.status ?? 'not run')}.`).join(' ') || undefined,
    },
  }));
  return (
    <Disclosure contains={rows.map((r) => r.id)} id={id} summary={`Show all ${tools.length} checks`}>
      <DataTable columns={columns} label="Verifiers" rows={rows as never} />
    </Disclosure>
  );
}

// ---- Level 6: unclaimed changes --------------------------------------------------------------

/**
 * The changed code outside the claims. One summary line with an action; the files that no claim
 * covers, riskiest first (the top five, the rest collapsed), each with its role, what changed,
 * why it is risky and one action; the commands for the author; then the core files, covered in
 * part, with the share of their new lines that claims cite.
 */
export function UnclaimedChanges({ data, refs, explain = {}, addClaimCommand = 'understando close --add-claim' }: WithRefs & { explain?: Explain; addClaimCommand?: string }) {
  assertTrustMap(data);
  assertRefs(data, refs);
  const { files, core, summary } = refs.derived.unclaimed;
  const risky = files.filter((f) => f.risks.length);
  const link = (f: UnclaimedFile) => (f.main ? findRef(refs, f.main).permalink : null);
  const row = (f: UnclaimedFile) => ({
    id: `unclaimed-${files.indexOf(f) + 1}`,
    cells: {
      file: { text: f.file }, role: f.role, size: `${lines(f.added, '+')} / ${lines(f.removed, '−')}`,
      action: { text: f.action.text, status: (f.action.kind === 'skim' ? 'neutral' : f.action.kind === 'check' ? 'err' : 'warn') as Tone },
    },
  });
  const columns = [
    { key: 'file', label: 'File', kind: 'id' as const, width: '18rem' }, { key: 'role', label: 'Role' },
    { key: 'size', label: '+/−', kind: 'number' as const, width: '7rem' }, { key: 'action', label: 'Action', kind: 'status' as const, width: '13rem' },
  ];
  const card = (f: UnclaimedFile) => (
    <article className="ve-card ve-weak-check" data-ve-unclaimed-file id={`unclaimed-${files.indexOf(f) + 1}`} key={f.path}>
      <h3>{capital(f.role)} <code>{f.file}</code></h3>
      <Defs items={[
        ['What changed', f.change],
        ['Why it is risky', f.risks.length ? capital(f.risks.join(', ')) + '.' : 'Low risk: no risk rule matches it.', f.risks.length ? 'warn' : undefined],
        ...(f.note ? [['Why it matters', <Rich key="n" text={f.note} />] as [ReactNode, ReactNode]] : []),
        ['Action', <span data-ve-action key="a">{f.action.text}{link(f) ? <> <a href={link(f)!}>Read the main change at the PR head</a>.</> : null}</span>, f.action.kind === 'skim' ? undefined : 'warn'],
      ]} />
    </article>
  );
  const more = files.slice(VISIBLE_UNCLAIMED);
  const coreRow = (f: (typeof core)[number]) => ({ cells: {
    file: { text: f.file }, role: f.role, claims: String(f.claims),
    share: f.claims ? `Covered in part by ${f.claims} ${f.claims === 1 ? 'claim' : 'claims'}: ${f.cited} of ${f.total} new lines (${Math.round((100 * f.cited) / Math.max(f.total, 1))}%)` : `No claim cites it: 0 of ${f.total} new lines`,
  } });
  const coreColumns = [{ key: 'file', label: 'File', kind: 'id' as const, width: '18rem' }, { key: 'role', label: 'Role', width: '10rem' }, { key: 'claims', label: 'Claims that cite it', kind: 'number' as const, width: '9rem' }, { key: 'share', label: 'New lines that claims cite' }];
  return (
    <div data-ve-trust="unclaimed">
      <p data-ve-result data-ve-tone={summary.risky ? 'warn' : 'ok'}><strong>{summary.lead}</strong></p>
      {summary.quiet ? <p className="ve-quiet">{summary.quiet}</p> : null}
      <div className="ve-card-stack">{files.slice(0, VISIBLE_UNCLAIMED).map(card)}</div>
      {more.length ? <Disclosure summary={`Show ${more.length} more files`}><DataTable columns={columns} density="compact" label="More changed code that no claim covers" rows={more.map(row)} /></Disclosure> : null}
      {risky.length ? (
        <Disclosure summary="Show the commands for the author">
          <p>For each file with risk, the author can add a claim and a check:</p>
          <CodeBlock code={risky.map((f) => `${addClaimCommand} ${f.path}`).join('\n')} filename="For the author" language="bash" />
        </Disclosure>
      ) : null}
      {core.length ? (
        <Subsection id="unclaimed-core" title="Core files, covered in part">
          <p>Claims cite part of each core file. Read the lines that no claim cites.</p>
          <DataTable columns={coreColumns} density="compact" label="Core files, covered in part" rows={core.slice(0, VISIBLE_UNCLAIMED).map(coreRow)} />
          {core.length > VISIBLE_UNCLAIMED ? (
            <Disclosure summary={`Show ${core.length - VISIBLE_UNCLAIMED} more core files`}>
              <DataTable columns={coreColumns} density="compact" label="More core files, covered in part" rows={core.slice(VISIBLE_UNCLAIMED).map(coreRow)} />
            </Disclosure>
          ) : null}
        </Subsection>
      ) : null}
      <p>Tests, documents and data files are not in this list.</p>
    </div>
  );
}

/** The invariants of the map: the rules that must always hold, confirmed by the user or only proposed. */
export function Invariants({ data }: Data) {
  assertTrustMap(data);
  const rows = (data.invariants ?? []).filter((i) => i.status === 'accepted' || i.status === 'proposed');
  if (!rows.length) return null;
  return (
    <div data-ve-trust="invariants">
      <Subsection id="why-invariants" title="The invariants">
        <p>An invariant is a rule that must always hold. Only a rule that the user confirmed can make a claim Proven or Formal.</p>
        <Disclosure summary={`Show the ${rows.length} invariants`}>
          <ul>{rows.map((i) => <li key={i.id}>{(i.author === 'user' && i.status === 'accepted' ? 'Confirmed by the user: ' : 'Proposed, not confirmed: ') + i.text}</li>)}</ul>
        </Disclosure>
      </Subsection>
    </div>
  );
}

// ---- Glossary --------------------------------------------------------------------------------

/**
 * Each word of the map's glossary, then understando's own words. A word in the text shows the same
 * definition. With `only="used"`, the running page keeps the words that its text uses (the server
 * render and the no-JS page keep them all, so the export checks see each one).
 */
export function Glossary({ data, only }: Data & { only?: 'used' }) {
  assertTrustMap(data);
  const entries = glossaryEntries(data);
  const [used, setUsed] = useState<Set<string> | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    if (only !== 'used') return;
    const main = document.querySelector('main');
    const own = document.querySelector('[data-ve-glossary]');
    // The page text without the glossary itself (textContent reads hidden chapters too).
    const text = (main?.textContent ?? '').replace(own?.textContent ?? '', ' ');
    const has = (form: string) => (isAcronym(form) ? new RegExp(`(?<![\\w-])${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?(?![\\w-])`) : new RegExp(`(?<![\\w-])${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:s|es)?(?![\\w-])`, 'i')).test(text);
    setUsed(new Set(entries.filter((g) => [g.term, ...(g.aliases ?? [])].some(has)).map((g) => g.term)));
  }, [only]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = used && !all ? entries.filter((g) => used.has(g.term)) : entries;
  return (
    <div data-ve-trust="glossary">
      <p>Each word below has one meaning on this page. In the text, a word with a dotted line shows its meaning when you point to it, focus it or tap it.</p>
      <dl className="ve-definition-list" data-ve-glossary>
        {shown.map((g) => (
          <Fragment key={g.term}>
            <dt data-ve-aliases={(g.aliases ?? []).join('|') || undefined}>{g.term}</dt>
            <dd>{g.meaning}</dd>
          </Fragment>
        ))}
      </dl>
      {used && used.size < entries.length ? (
        <button className="ve-button" data-ve-glossary-all onClick={() => setAll((v) => !v)} type="button">
          {all ? `Show only the ${used.size} words of this page` : `Show all ${entries.length} words`}
        </button>
      ) : null}
    </div>
  );
}

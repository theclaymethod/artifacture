// The guided review: the trust-map explainer as chapters that walk a reviewer from the change to
// the merge call. The structure comes from the MDX (an ExplainerShell `paged` with one Section per
// chapter); these components drop in the chapters that come from data. Each value comes from the
// derived block of refs.resolved.json (understando's scripts/derive.py): the checklist order, the
// protection of each changed file, the merge state. The reviewer's calls stay in this browser
// (localStorage, keyed by the PR head and the trust-map hash); the page never sends them anywhere.
// Patterns adapted from the MIT `guided-review` plugin: see GUIDED-REVIEW-NOTICE.md.
import { Fragment, useEffect, useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useExplainerShell } from './explainer-nav';
import { CodeBlock } from './code-blocks';
import { Disclosure, Subsection } from './content-blocks';
import { StatusPill, ToneMark, type StatusTone } from './data-table';
import { ArchitectureDiagram, BarCard, BrowserVideo, ChangedCode, CheckRow, ClaimBody, ClaimDetail, ClaimRow, controlEdits, CountMarks, Defs, MarkKey, maybeRef, Rich, risksOf, termState, VerdictLegend, VerdictPill, VerifierTable } from './trust-map';
import { TypedDiagram, type TypedDiagramSpec } from './typed-diagrams';
import {
  assertAreas, assertRefs, assertTrustMap, capital, changeDiagram, claimAnchor, claimLabel, claimOf, derivedClaim, MERGE_WORDS, promiseAnchor, promiseRows,
  reviewItems, slug, STRONG, strengthOf, TONE, TrustMapError,
  type CheckResult, type Claim, type DerivedWeak, type Explain, type LookFlag, type Promise_, type Refs, type ReviewItem, type SpineFile, type SpineGroup, type SpineKind, type TrustMap, type Verdict,
} from './trust-map-rules';
import './guided-review.css';

type Data = { data: TrustMap };
type WithRefs = Data & { refs: Refs };
type All = WithRefs & { explain?: Explain };

// ---- The reviewer's calls: local only ----------------------------------------------------------

export type Call = 'ok' | 'fix' | 'accept';
const CALLS = ['ok', 'fix', 'accept'] as const satisfies readonly Call[];
export const CALL_WORDS = { ok: 'OK', fix: 'Needs a fix', accept: 'Accept the risk' } satisfies Record<Call, string>;
const CALL_TONE = { ok: 'ok', fix: 'err', accept: 'warn' } satisfies Record<Call, StatusTone>;
const UNREVIEWED: StatusTone = 'neutral';
const DONE: StatusTone = 'ok';
type Calls = Record<string, { call?: Call; note?: string; reviewed?: boolean }>;
const EMPTY: Calls = {};
const listeners = new Set<() => void>();
let cache: { key: string; raw: string | null; value: Calls } | null = null;

/** The storage key of the calls: the PR head and the SHA-256 of the trust map that the export stamped. A new map starts a new review. */
export function reviewKey(head: string) {
  const sha = document.querySelector('meta[name="ve-trust-map-sha256"]')?.getAttribute('content') ?? 'unstamped';
  return `understando-review:${head}:${sha}`;
}

function readCalls(head: string): Calls {
  const key = reviewKey(head);
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(key); } catch { /* storage off: the calls last for this view */ }
  if (cache && cache.key === key && cache.raw === raw) return cache.value;
  let value: Calls = {};
  try { value = raw ? JSON.parse(raw).calls ?? {} : {}; } catch { value = {}; }
  if (raw === null && cache?.key === key) value = cache.value;
  cache = { key, raw, value };
  return value;
}

function writeCalls(head: string, next: Calls) {
  const key = reviewKey(head);
  const raw = JSON.stringify({ schema: 1, head, calls: next });
  cache = { key, raw, value: next };
  try { window.localStorage.setItem(key, raw); } catch { cache.raw = null; }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = () => listener();
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}

/** The reviewer's calls for this PR head and trust map, and a setter. The server render has none. */
export function useCalls(head: string): [Calls, (key: string, patch: { call?: Call; note?: string; reviewed?: boolean }) => void] {
  const calls = useSyncExternalStore(subscribe, () => readCalls(head), () => EMPTY);
  const set = (key: string, patch: { call?: Call; note?: string; reviewed?: boolean }) => {
    const now = readCalls(head);
    writeCalls(head, { ...now, [key]: { ...now[key], ...patch } });
  };
  return [calls, set];
}

const reviewed = (calls: Calls, items: ReviewItem[]) => items.filter((i) => calls[i.key]?.call).length;

// ---- Shared pieces ---------------------------------------------------------------------------

/** The anchor of a checklist item: a promise or a claim keeps its own anchor; any other item gets review-<slug>. */
export const itemAnchor = (item: ReviewItem) => (item.kind === 'other' ? `review-${slug(item.href.slice(1))}` : item.href.slice(1));

function claimFor(data: TrustMap, item: ReviewItem): Claim | undefined {
  return item.kind === 'claim' ? data.claims.find((c) => slug(c.id) === item.id) ?? claimOf(data, item.id!.toUpperCase()) : undefined;
}
function promiseFor(data: TrustMap, item: ReviewItem): Promise_ | undefined {
  return item.kind === 'promise' ? data.promises.find((p) => slug(p.id) === item.id) : undefined;
}

/** One square per checklist item: filled with the tone of the reviewer's call, hollow until there is one. */
function ReviewMarks({ items, calls }: { items: ReviewItem[]; calls: Calls }) {
  const n = reviewed(calls, items);
  return (
    <CountMarks label={`${n} of ${items.length} reviewed`} runs={items.map((i) => {
      const c = calls[i.key]?.call;
      return c ? { n: 1, tone: CALL_TONE[c], label: `${i.label}: ${CALL_WORDS[c]}` } : { n: 1, tone: UNREVIEWED, label: `${i.label}: not reviewed`, hollow: true };
    })} />
  );
}

/** "3 of 22 reviewed", with one square per item. */
export function ReviewProgress({ data, refs }: WithRefs) {
  assertRefs(assertTrustMap(data), refs);
  const items = reviewItems(refs);
  const [calls] = useCalls(data.head);
  if (!items.length) return null;
  const n = reviewed(calls, items);
  const counts = CALLS.map((c) => [c, items.filter((i) => calls[i.key]?.call === c).length] as const).filter(([, k]) => k);
  return (
    <div className="ve-review-progress" data-ve-review-progress>
      <p><strong data-ve-reviewed>{n} of {items.length} reviewed</strong>{counts.length ? <span className="ve-quiet">{' '}({counts.map(([c, k]) => `${k} ${CALL_WORDS[c].toLowerCase()}`).join(', ')})</span> : null}</p>
      <ReviewMarks calls={calls} items={items} />
    </div>
  );
}

/** The merge state in words, from derive.py: "Not ready: 22 things to review". */
function mergeLine(refs: Refs) {
  const items = reviewItems(refs);
  const { form } = refs.derived.merge;
  const [word, tone] = MERGE_WORDS[form];
  const blocks = items.filter((i) => i.blocks).length;
  const accept = items.length - blocks;
  const what = items.length ? `${items.length} ${items.length === 1 ? 'thing' : 'things'} to review` : 'nothing to review';
  const split = [blocks ? `${blocks} ${blocks === 1 ? 'blocks' : 'block'} the merge` : '', accept ? `${accept} ${accept === 1 ? 'is a risk' : 'are risks'} to accept` : ''].filter(Boolean).join(', and ');
  return { word, tone, what, split: split ? capital(split) + '.' : 'Each promise is Proven, and no gate fails.', items, form };
}

// ---- Chapter 0: start --------------------------------------------------------------------------

/**
 * The start of the guided review: the merge state ("Not ready: 22 things to review"), how many of
 * them the reviewer has reviewed, the first three items, and the ways in: start the review, go to
 * the checklist, or read every chapter as one page.
 */
export function ReviewStart({ data, refs, start = '#ch-1', checklist = '#ch-7' }: WithRefs & { start?: string; checklist?: string }) {
  assertRefs(assertTrustMap(data), refs);
  const shell = useExplainerShell();
  const { word, tone, what, split, items, form } = mergeLine(refs);
  const terms = termState(data);
  return (
    <div data-ve-trust="start">
      <div className="ve-verdict ve-review-state" data-ve-tone={tone} id="merge">
        <p data-merge-verdict={form}><span className="ve-verdict-word"><ToneMark tone={tone} />{word}:</span> <span className="ve-verdict-lead">{what}</span></p>
        <p>{split}</p>
        {items.length ? (
          <>
            <ReviewProgress data={data} refs={refs} />
            <p className="ve-review-first">The riskiest first:</p>
            <ol data-merge-items>
              {items.slice(0, 3).map((i) => <li key={i.key}><a href={'#' + itemAnchor(i)}>{capital(i.label)}</a>: <Rich terms={terms} text={i.text} /></li>)}
            </ol>
          </>
        ) : null}
        <div className="ve-review-ways">
          <a className="ve-button" data-ve-primary href={start}>Start the guided review</a>
          {items.length ? <a className="ve-button" href={checklist}>Go to the checklist</a> : null}
          {shell ? <button className="ve-button" data-ve-js-only data-ve-one-page onClick={() => { shell.setMode(shell.mode === 'one' ? 'pages' : 'one'); }} type="button">{shell.live && shell.mode === 'one' ? 'Read by chapter' : 'Read it as one page'}</button> : null}
        </div>
      </div>
    </div>
  );
}

// ---- Chapter 3: what changed, chapter by chapter (the diff spine) ----------------------------------

const KIND_TONE = { check: 'err', ask: 'warn', read: 'warn', partial: 'info', protected: 'ok', skim: 'neutral', test: 'neutral', other: 'neutral', deleted: 'neutral' } satisfies Record<SpineKind, StatusTone>;
const READ_KINDS: SpineKind[] = ['check', 'ask', 'read', 'partial', 'protected'];
const VISIBLE_CARDS = 3;
const VISIBLE_ROWS = 5;
const FLAG_TONE = { risk: 'err', question: 'warn', nit: 'info' } satisfies Record<LookFlag['level'], StatusTone>;
const FLAG_WORD = { risk: 'Risk', question: 'Question', nit: 'Nit' } satisfies Record<LookFlag['level'], string>;
const WORDS = [25, 60];

/** The anchor of a changed file: its path, with each run of other characters as one dash (an underscore stays, so _x.py and x.py differ). */
export const fileAnchor = (path: string) => 'file-' + path.toLowerCase().replace(/[^a-z0-9_]+/g, '-').replace(/^-|-$/g, '');
const flagAnchor = (x: LookFlag) => `${fileAnchor(x.path)}-L${x.line}`;
export const chapterAnchor = (id: string) => `spine-${slug(id)}`;

function fileTone(refs: Refs, f: SpineFile): StatusTone {
  return f.status.kind === 'protected' && f.claims.length ? TONE[strengthOf(refs, f.claims[0])] : KIND_TONE[f.status.kind];
}

function Churn({ added, removed }: { added: number; removed: number }) {
  return <span aria-label={`${added} lines added, ${removed} removed`} className="ve-churn" role="img"><span data-ve-churn="add">+{added.toLocaleString('en-US')}</span> <span data-ve-churn="del">−{removed.toLocaleString('en-US')}</span></span>;
}

/** One "look closely" flag: its level, what to look at, and the condition that triggers it. */
function FlagLine({ flag, link }: { flag: LookFlag; link?: boolean }) {
  return (
    <li className="ve-flag" data-ve-flag-level={flag.level}>
      <StatusPill tone={FLAG_TONE[flag.level]}>{FLAG_WORD[flag.level]}</StatusPill>
      <span>
        {link ? <a href={'#' + flagAnchor(flag)}><Rich text={flag.text} /></a> : <Rich text={flag.text} />}
        {flag.trigger ? <span className="ve-flag-when"> When: <Rich text={flag.trigger} />.</span> : null}
      </span>
    </li>
  );
}

/**
 * One changed file: its path and line counts, its protection, its role, the claims that protect it
 * as claim rows, what replaced it when it is deleted, its "look closely" flags on their lines, and
 * its main change at the PR head. `anchored` gives it its anchors; a copy elsewhere has none.
 */
export function FileCard({ data, refs, file: f, group, anchored = true }: WithRefs & { file: SpineFile; group?: SpineGroup; anchored?: boolean }) {
  const tone = fileTone(refs, f);
  const shown = f.claims.slice(0, 3);
  const more = f.claims.slice(3);
  const flags = f.flags ?? [];
  return (
    <article className="ve-file" data-ve-kind={f.status.kind} data-ve-spine-file={f.path} data-ve-tone={tone} id={anchored ? fileAnchor(f.path) : undefined}>
      <header className="ve-file-head">
        <code className="ve-file-path">{f.file}</code>
        <Churn added={f.added} removed={f.removed} />
        <StatusPill tone={tone}>{f.status.label}</StatusPill>
      </header>
      {f.role ? <p className="ve-file-role">{capital(f.role)}{f.created ? ', new in this PR' : ''}.</p> : null}
      {f.note ? <p><Rich text={f.note} /></p> : null}
      {f.status.text ? <p data-ve-action>{f.status.text}</p> : null}
      {f.deleted && group?.replaced_by ? <p>Replaced by <strong>{group.replaced_by.name.charAt(0).toLowerCase() + group.replaced_by.name.slice(1)}</strong>.{group.note ? <> <Rich text={group.note} />.</> : null}</p> : null}
      {shown.length ? (
        <div className="ve-claim-rows" data-ve-file-claims>
          <p className="ve-file-claims-title">{f.status.kind === 'partial' ? 'Claims that cover part of it' : 'Claims that protect it'}</p>
          {shown.map((id) => <ClaimRow claim={id} data={data} key={id} refs={refs} />)}
          {more.length ? <Disclosure summary={`Show ${more.length} more ${more.length === 1 ? 'claim' : 'claims'}`}><div className="ve-claim-rows">{more.map((id) => <ClaimRow claim={id} data={data} key={id} refs={refs} />)}</div></Disclosure> : null}
        </div>
      ) : null}
      {flags.length ? (
        <div className="ve-file-flags" data-ve-file-flags>
          <p className="ve-file-claims-title">Look closely</p>
          {flags.map((x) => (
            <div className="ve-flag-block" id={anchored ? flagAnchor(x) : undefined} key={`${x.line}-${x.source}`}>
              <ul className="ve-flag-list"><FlagLine flag={x} /></ul>
              {maybeRef(refs, x.ref) ? <ChangedCode codeRef={x.ref} mark={{ line: x.line, level: x.level }} refs={refs} /> : <p className="ve-quiet">Line {x.line} at the PR head.</p>}
            </div>
          ))}
        </div>
      ) : null}
      {f.main && !f.deleted ? (
        <Disclosure summary={<>Show the main change: <code>{f.main.symbol ?? f.file}</code></>}>
          <ChangedCode codeRef={f.main} refs={refs} />
        </Disclosure>
      ) : null}
    </article>
  );
}

function FileRows({ refs, files, tests = false }: { refs: Refs; files: SpineFile[]; tests?: boolean }) {
  const link = (f: SpineFile) => (f.main ? maybeRef(refs, f.main)?.permalink : null);
  return (
    <ul className="ve-file-rows" data-ve-file-rows>
      {files.map((f) => (
        <li data-ve-kind={f.status.kind} data-ve-spine-file={f.path} data-ve-tone={fileTone(refs, f)} id={fileAnchor(f.path)} key={f.path}>
          <code className="ve-file-path">{f.file}</code>
          <Churn added={f.added} removed={f.removed} />
          <span className="ve-file-row-status"><ToneMark tone={fileTone(refs, f)} />{f.status.label}</span>
          {tests && f.tests?.length ? <span className="ve-file-row-tests">{f.tests.length === 1 ? 'Test' : 'Tests'}: {f.tests.map((t, i) => <Fragment key={t}>{i ? ', ' : ''}<code>{t.split('.').at(-1)}</code></Fragment>)}</span> : null}
          {link(f) ? <a className="ve-file-row-link" href={link(f)!}>Read it at the PR head</a> : null}
        </li>
      ))}
    </ul>
  );
}

/** The "Reviewed" box of a chapter of the change. It counts toward the chapters reviewed, never toward the checklist. */
function ChapterReviewed({ head, id, title }: { head: string; id: string; title: string }) {
  const [calls, set] = useCalls(head);
  const key = `chapter:${id}`;
  return (
    <label className="ve-chapter-reviewed" data-ve-chapter-reviewed={id} data-ve-js-only>
      <input checked={Boolean(calls[key]?.reviewed)} onChange={(e) => set(key, { reviewed: e.target.checked })} type="checkbox" />
      <span>Reviewed<span className="ve-visually-hidden">: {title}</span></span>
    </label>
  );
}

const reviewable = (g: SpineGroup) => g.reviewable !== false && g.tier !== 'tests' && g.tier !== 'generated';

/** "3 of 9 chapters reviewed". */
export function ChapterProgress({ data, refs }: WithRefs) {
  const [calls] = useCalls(data.head);
  const groups = (refs.derived.spine?.groups ?? []).filter(reviewable);
  if (!groups.length) return null;
  const n = groups.filter((g) => calls[`chapter:${g.id}`]?.reviewed).length;
  return (
    <p className="ve-chapter-progress" data-ve-chapter-progress data-ve-js-only>
      <strong>{n} of {groups.length} chapters reviewed</strong>{' '}
      <CountMarks label={`${n} of ${groups.length} chapters reviewed`} runs={groups.map((g) => ({ n: 1, tone: calls[`chapter:${g.id}`]?.reviewed ? DONE : UNREVIEWED, label: g.name, hollow: !calls[`chapter:${g.id}`]?.reviewed }))} />
    </p>
  );
}

function assertChapters(explain: Explain, refs: Refs) {
  const chapters = explain.change?.chapters ?? [];
  const errors: string[] = [];
  for (const c of chapters) {
    if (/[/\\]|\.\w{1,4}\b/.test(c.title)) errors.push(`the chapter ${c.id} is titled with a file name ("${c.title}"); title it as a plain action, for example "Gate every finding before the editor"`);
    if (!c.explain?.length || c.explain.length > 2) errors.push(`the chapter ${c.id} has ${c.explain?.length ?? 0} paragraphs; write one or two`);
    for (const p of c.explain ?? []) {
      const n = p.trim().split(/\s+/).length;
      if (n < WORDS[0] || n > WORDS[1]) errors.push(`a paragraph of the chapter ${c.id} has ${n} words; write ${WORDS[0]} to ${WORDS[1]}: what happens at runtime and why`);
    }
    for (const d of c.diagrams ?? []) if (!explain.diagrams?.[d]) errors.push(`the chapter ${c.id} names the diagram ${d}, which explain.json does not have`);
  }
  if (errors.length) throw new TrustMapError('explain.json change chapters are invalid:\n  ' + errors.join('\n  '));
}

/** A typed diagram of explain.json; TypedDiagram validates its kind and its elements. */
function typedSpec(explain: Explain, name: string): TypedDiagramSpec {
  const spec: unknown = explain.diagrams?.[name];
  // SAFETY: assertChapters checked that the diagram exists; TypedDiagram rejects a spec of another kind.
  return spec as TypedDiagramSpec;
}

/** One chapter of the change: the idea on the left (sticky from 1024px), its diagrams and files on the right. */
function ChangeChapterBlock({ data, refs, explain = {}, g, first }: All & { g: SpineGroup; first: SpineFile[] }) {
  const chapter = (explain.change?.chapters ?? []).find((c) => c.id === g.id);
  const titles = Object.fromEntries((explain.change?.chapters ?? []).map((c) => [c.id, c.title]));
  const flags = g.files.flatMap((f) => f.flags ?? []);
  // Each file with a flag is a card, so each flag has its line in view; then the riskiest files to read, up to a few.
  const flagged = g.files.filter((f) => (f.flags ?? []).length);
  const cards = [...flagged, ...g.files.filter((f) => !flagged.includes(f) && READ_KINDS.includes(f.status.kind)).slice(0, Math.max(0, VISIBLE_CARDS - flagged.length))];
  const rest = g.files.filter((f) => !cards.includes(f));
  const visible = cards.length ? [] : rest.slice(0, VISIBLE_ROWS);
  const hidden = rest.slice(visible.length);
  const terms = termState(data);
  if (g.tier === 'tests' || g.tier === 'generated') {
    return (
      <section className="ve-change-chapter" data-ve-change-chapter={g.id} data-ve-tier={g.tier} id={chapterAnchor(g.id)}>
        <h3 className="ve-subsection-title">{g.name}</h3>
        <p className="ve-spine-meta">{g.files.length} {g.files.length === 1 ? 'file' : 'files'} · <Churn added={g.added} removed={g.removed} /> · not part of the review progress</p>
        <p>{g.tier === 'tests'
          ? 'The checks of this PR. The chapters above link the ones that back a claim; here each test file lists the tests that it changes. Their diffs stay collapsed.'
          : 'Files that a tool writes. Review the generator instead: a change here follows from it.'}</p>
        <Disclosure contains={g.files.map((f) => fileAnchor(f.path))} summary={`Show the ${g.files.length} ${g.tier === 'tests' ? 'test' : 'generated'} files`}>
          <FileRows files={g.files} refs={refs} tests={g.tier === 'tests'} />
        </Disclosure>
      </section>
    );
  }
  return (
    <section className="ve-change-chapter" data-ve-change-chapter={g.id} data-ve-tier={g.tier} id={chapterAnchor(g.id)}>
      <header className="ve-change-head">
        <h3 className="ve-subsection-title">{g.name}</h3>
        <p className="ve-spine-meta">{g.files.length} {g.files.length === 1 ? 'file' : 'files'} · <Churn added={g.added} removed={g.removed} />{g.unclaimed ? ` · ${g.unclaimed} with no claim` : ''}</p>
      </header>
      {chapter?.diagrams?.length ? <div className="ve-change-diagrams">{chapter.diagrams.map((d) => <TypedDiagram chapters={titles} key={d} name={d} spec={typedSpec(explain, d)} />)}</div> : null}
      <div className="ve-change-side">
        {(g.explain ?? []).map((p, i) => <p className="ve-change-explain" key={i}><Rich terms={terms} text={p} /></p>)}
        {g.id === 'unassigned' ? <p data-ve-action data-ve-unassigned>The explain step put these changed files in no chapter of the change. Add each one to the chapter of its idea, then build the page again.</p> : null}
        {g.replaced_by ? <p>Replaced by <strong>{g.replaced_by.name.charAt(0).toLowerCase() + g.replaced_by.name.slice(1)}</strong>.{g.note ? <> <Rich text={g.note} />.</> : null}</p> : g.note ? <p><Rich text={g.note} /></p> : null}
        {flags.length ? (
          <div className="ve-change-flags">
            <p className="ve-file-claims-title">Look closely ({flags.length})</p>
            <ul className="ve-flag-list">{flags.map((x) => <FlagLine flag={x} key={flagAnchor(x) + x.source} link />)}</ul>
          </div>
        ) : null}
        {reviewable(g) ? <ChapterReviewed head={data.head} id={g.id} title={g.name} /> : null}
      </div>
      <div className="ve-change-files">
        {cards.length ? <div className="ve-file-stack">{cards.map((f) => <FileCard data={data} file={f} group={g} key={f.path} refs={refs} />)}</div> : null}
        {visible.length ? <FileRows files={visible} refs={refs} /> : null}
        {hidden.length ? (
          <Disclosure contains={hidden.map((f) => fileAnchor(f.path))} summary={`Show ${hidden.length} more ${hidden.length === 1 ? 'file' : 'files'}`}>
            <FileRows files={hidden} refs={refs} />
          </Disclosure>
        ) : null}
      </div>
    </section>
  );
}

const MAP_EDGES = 8;

/** How the changed files connect: the chapters as boxes and their imports of each other, from derive.py. */
function FileMapFigure({ refs, explain = {} }: { refs: Refs; explain?: Explain }) {
  const spine = refs.derived.spine;
  const groups = (spine?.groups ?? []).filter((g) => g.tier !== 'tests');
  const ids = new Set(groups.map((g) => g.id));
  const all = (spine?.links ?? []).filter((l) => ids.has(l.from) && ids.has(l.to));
  if (!all.length) return null;
  const edges = [...all].sort((a, b) => b.n - a.n).slice(0, MAP_EDGES);
  const used = new Set(edges.flatMap((e) => [e.from, e.to]));
  const nodes = groups.filter((g) => used.has(g.id)).slice(0, 9).map((g) => ({ id: g.id, label: g.name, chapter: g.id }));
  const kept = new Set(nodes.map((n) => n.id));
  const spec: TypedDiagramSpec = {
    kind: 'map', title: 'How the changed files connect',
    caption: `Each box is a chapter of the change; an arrow is the imports of its files from another chapter. The badge counts the chapters that import it.${all.length > edges.length ? ` The map shows the ${edges.length} links with the most imports; the list below holds all ${all.length}.` : ''}`,
    nodes, edges: edges.filter((e) => kept.has(e.from) && kept.has(e.to)),
  };
  const name = new Map(groups.map((g) => [g.id, g.name]));
  return (
    <div className="ve-file-map" id="spine-map">
      <TypedDiagram chapters={Object.fromEntries((explain.change?.chapters ?? []).map((c) => [c.id, c.title]))} name="map" spec={spec} />
      {all.length > edges.length ? (
        <Disclosure summary={`Show all ${all.length} links`}>
          <ul className="ve-typed-list">{all.map((l) => <li key={l.from + l.to}>{name.get(l.from)} imports {name.get(l.to)}: {l.n} {l.n === 1 ? 'import' : 'imports'}.</li>)}</ul>
        </Disclosure>
      ) : null}
    </div>
  );
}

/**
 * What changed, chapter by chapter. With explain.json change.chapters, each chapter is one idea in
 * reading order (the core change first; then the code that supports it, the wiring, the data and
 * the docs; the generated files and the tests last), with its explanation, its "look closely" flags,
 * a Reviewed box, its diagrams and its files. Without chapters, the change areas group the files.
 * Each file says what protects it, from derive.py: the claim code refs, the claim texts, the coverage
 * record of the checks and the control edits.
 */
export function DiffSpine({ data, refs, explain = {}, checks = '#ch-5' }: All & { checks?: string }) {
  assertRefs(assertTrustMap(data), refs);
  const spine = refs.derived.spine;
  if (!spine) throw new TrustMapError('refs.resolved.json has no derived spine (the changed files and what protects them); run understando explain again');
  const areas = explain.change?.areas ?? [];
  assertAreas(areas, refs);
  assertChapters(explain, refs);
  const first = spine.groups.flatMap((g) => g.files.filter((f) => ['check', 'ask', 'read'].includes(f.status.kind)));
  return (
    <div data-ve-trust="spine">
      <p data-ve-result><strong>{spine.summary}</strong></p>
      {refs.derived.unclaimed.summary.lead ? <p className="ve-quiet">{refs.derived.unclaimed.summary.lead} {refs.derived.unclaimed.summary.quiet}</p> : null}
      <ChapterProgress data={data} refs={refs} />
      <nav aria-label="The chapters of the change" className="ve-change-toc">
        <ol>{spine.groups.filter((g) => g.tier !== 'tests').map((g) => <li data-ve-tier={g.tier} key={g.id}><a href={'#' + chapterAnchor(g.id)}>{g.name}</a>{g.flags ? <span className="ve-change-toc-flags"> · {g.flags} to look at closely</span> : null}</li>)}</ol>
      </nav>
      <FileMapFigure explain={explain} refs={refs} />
      {first.length ? (
        <Subsection id="spine-first" title="Read these first">
          <p>No claim covers these changed files. Each one has its action.</p>
          <ul className="ve-file-rows" data-ve-read-first>
            {first.map((f) => (
              <li data-ve-kind={f.status.kind} data-ve-tone={fileTone(refs, f)} key={f.path}>
                <a className="ve-file-path" href={`#${fileAnchor(f.path)}`}><code>{f.file}</code></a>
                <Churn added={f.added} removed={f.removed} />
                <span className="ve-file-row-status"><ToneMark tone={fileTone(refs, f)} />{f.status.label}</span>
                {f.status.text ? <span className="ve-file-row-action" data-ve-action>{f.status.text}</span> : null}
              </li>
            ))}
          </ul>
        </Subsection>
      ) : null}
      {areas.length ? (
        <Disclosure id="change-diagram" summary="Show the before and after of the diff">
          <ArchitectureDiagram name="before and after (from the diff)" spec={changeDiagram(areas, refs)} />
        </Disclosure>
      ) : null}
      {spine.groups.filter((g) => g.tier !== 'tests').map((g) => <ChangeChapterBlock data={data} explain={explain} first={first} g={g} key={g.id} refs={refs} />)}
      {spine.groups.filter((g) => g.tier === 'tests').map((g) => (
        <p className="ve-spine-tests" data-ve-spine-tests key={g.id}>The PR also changes {g.files.length} test {g.files.length === 1 ? 'file' : 'files'}. They show as the checks they provide: <a href={checks}>see the checks</a>.</p>
      ))}
    </div>
  );
}

/**
 * Every changed file in GitHub's order (by path), for completeness: its chapter, its line counts,
 * its protection, its flags, and a link to its diff on GitHub. The chapters above read the change in
 * the order of its ideas; this list is the whole diff.
 */
export function FullDiff({ data, refs, checks = '#ch-5' }: WithRefs & { checks?: string }) {
  assertRefs(assertTrustMap(data), refs);
  const spine = refs.derived.spine;
  if (!spine) throw new TrustMapError('refs.resolved.json has no derived spine; run understando explain again');
  const where = new Map(spine.groups.flatMap((g) => g.files.map((f) => [f.path, { f, g }] as const)));
  const order = spine.github ?? [...where.keys()].sort();
  const base = data.repo && data.pr ? `https://github.com/${data.repo}/pull/${data.pr}/files` : null;
  return (
    <div data-ve-trust="full-diff">
      <p>{order.length} changed files, in the order GitHub shows them. Each one links to its chapter and to its diff on GitHub.</p>
      <ol className="ve-full-diff" data-ve-full-diff>
        {order.map((p) => {
          const { f, g } = where.get(p)!;
          return (
            <li data-ve-kind={f.status.kind} data-ve-tone={fileTone(refs, f)} key={p}>
              <code className="ve-file-path">{f.file}</code>
              <Churn added={f.added} removed={f.removed} />
              <span className="ve-file-row-status"><ToneMark tone={fileTone(refs, f)} />{f.status.label}{f.flags?.length ? ` · ${f.flags.length} to look at` : ''}</span>
              <span className="ve-full-diff-links"><a href={g.tier === 'tests' ? checks : '#' + chapterAnchor(g.id)}>{g.tier === 'tests' ? 'The checks' : g.name}</a>{base && f.diff ? <> · <a href={`${base}#diff-${f.diff}`}>Its diff on GitHub</a></> : null}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---- The claims of a promise, as a timeline ---------------------------------------------------------

/** The claims of a promise, weakest first, joined by one line: a checkpoint per claim, its row beside it. */
export function ClaimTimeline({ data, refs, claims, weakest }: WithRefs & { claims: Claim[]; weakest?: string }) {
  return (
    <ol className="ve-timeline" data-ve-timeline>
      {claims.map((c) => (
        <li data-ve-tone={TONE[strengthOf(refs, c.id)]} data-ve-weakest-claim={c.id === weakest ? 'true' : undefined} key={c.id}>
          {c.id === weakest ? <span className="ve-timeline-tag">The weakest claim</span> : null}
          <ClaimRow claim={c} data={data} refs={refs} />
        </li>
      ))}
    </ol>
  );
}

// ---- Chapter 4: how to read the evidence ---------------------------------------------------------

const RESULT_WORDS = {
  caught: 'caught its planted bug', missed: 'missed its planted bug', 'cannot-fail': 'cannot fail: it passed on each planted bug', broken: 'fails at the PR head',
  'no-bug': 'no planted bug ran', recorded: 'a record of a past run', checked: 'a mechanical check', none: 'no tool checks it',
} satisfies Record<CheckResult, string>;

/** The weak check with a second check that caught the same planted bug: one bug, two results. */
const pairOf = (refs: Refs): DerivedWeak | undefined => refs.derived.verify.weak.find((w) => w.caught_by);

/**
 * How to read the evidence, worked on this PR: a promise rests on claims (and their parts), a claim
 * on checks; a claim's surface sets its bar, and the bar is met or not; one planted bug can give two
 * results; then whether the checks can catch a bug at all, and the key of the marks.
 */
export function EvidenceGuide({ data, refs }: All) {
  assertRefs(assertTrustMap(data), refs);
  const terms = termState(data);
  const rows = promiseRows(data, refs);
  const first = rows.find((r) => !STRONG.includes(r.strength)) ?? rows[0];
  const weakestClaim = first ? first.claims.find((c) => strengthOf(refs, c.id) === first.strength) ?? first.claims[0] : undefined;
  const wd = weakestClaim ? derivedClaim(refs, weakestClaim.id) : undefined;
  const below = data.claims.find((c) => derivedClaim(refs, c.id).bar && !derivedClaim(refs, c.id).bar!.met && STRONG.includes(strengthOf(refs, c.id)))
    ?? data.claims.find((c) => derivedClaim(refs, c.id).bar && !derivedClaim(refs, c.id).bar!.met);
  const met = data.claims.find((c) => derivedClaim(refs, c.id).bar?.met);
  const pair = pairOf(refs);
  const verify = refs.derived.verify;
  const controls = new Map(data.controls.map((k) => [k.id, k]));
  return (
    <div data-ve-trust="evidence">
      {first && weakestClaim && wd ? (
        <Subsection id="evidence-promise" title="A promise rests on its claims, and a claim on its checks">
          <p><Rich terms={terms} text={`Take the promise "${first.promise.label}". Its ${first.count} ${first.count === 1 ? 'claim' : 'claims'}: ${first.tally}. A promise is only as strong as its weakest claim, so it is ${first.strength}.`} /></p>
          <div className="ve-path" data-ve-path>
            <div className="ve-path-step"><span className="ve-guide-key">Promise</span><span className="ve-path-name">{first.promise.label}</span><VerdictPill verdict={first.strength} /></div>
            <ClaimTimeline claims={first.claims} data={data} refs={refs} weakest={weakestClaim.id} />
            <div className="ve-path-step" data-ve-path="checks">
              <span className="ve-guide-key">The checks of its weakest claim, {claimLabel(weakestClaim)}</span>
              {wd.parts?.length ? (
                <ul className="ve-path-parts">{wd.parts.map((p) => <li key={p.id}><VerdictPill verdict={p.strength} /> <span>Part: <Rich text={p.text} /></span></li>)}</ul>
              ) : null}
              <ul className="ve-path-checks">{wd.checks.map((x) => <li data-ve-tone={x.result === 'caught' ? 'ok' : x.result === 'missed' ? 'warn' : 'err'} key={x.id}><ToneMark tone={x.result === 'caught' ? 'ok' : x.result === 'missed' ? 'warn' : x.result === 'recorded' || x.result === 'checked' ? 'info' : 'err'} /> <span>{capital(x.name)}: {RESULT_WORDS[x.result]}.</span></li>)}</ul>
            </div>
          </div>
        </Subsection>
      ) : null}
      {below ? (
        <Subsection id="evidence-bar" title="The kind of code sets the bar that its evidence must meet">
          <p><Rich terms={terms} text={`A claim meets its bar when each of its parts has the evidence that its surface needs. Strength and bar are separate: ${claimLabel(below)} is ${strengthOf(refs, below.id)}, and it is still below its bar.`} /></p>
          <div className="ve-bar-pair">
            <figure className="ve-bar-example"><figcaption><ClaimRow claim={below} data={data} refs={refs} /></figcaption><BarCard bar={derivedClaim(refs, below.id).bar!} /></figure>
            {met ? <figure className="ve-bar-example"><figcaption><ClaimRow claim={met} data={data} refs={refs} /></figcaption><BarCard bar={derivedClaim(refs, met.id).bar!} /></figure> : null}
          </div>
          {refs.derived.bars ? (
            <div data-ve-bars>
              <p><strong>For the whole PR.</strong> {refs.derived.bars.summary}</p>
              <ul className="ve-bar-lines">{refs.derived.bars.story.filter((l) => /^\d+ of \d+/.test(l)).map((line, n) => {
                const m = /^(\d+) of (\d+)/.exec(line)!;
                return <li data-ve-bar-line="count" key={n}><CountMarks label={line} runs={[{ n: Number(m[1]), tone: 'ok', label: 'meets its bar' }, { n: Number(m[2]) - Number(m[1]), tone: 'warn', label: 'below its bar', hollow: true }]} /><span><Rich terms={terms} text={line} /></span></li>;
              })}</ul>
            </div>
          ) : null}
        </Subsection>
      ) : null}
      {pair && pair.caught_by ? (
        <Subsection id="evidence-one-bug" title="One bug. Two different results.">
          <p><Rich terms={terms} text={`We planted one bug and ran two checks on it. ${capital(pair.broke)}`} /></p>
          {controls.get(pair.control) ? (() => {
            const edits = controlEdits(refs, controls.get(pair.control)!);
            return (
              <div data-ve-lint="skip">
                {edits[0]}
                {edits.length > 1 ? <Disclosure summary={`Show the same edit in ${edits.length - 1} more ${edits.length === 2 ? 'file' : 'files'}`}>{edits.slice(1)}</Disclosure> : null}
              </div>
            );
          })() : null}
          <div className="ve-two-results">
            <div className="ve-result-card" data-ve-tone="warn"><p className="ve-result-card-state"><ToneMark tone="warn" /> Missed the bug</p><p><strong>{capital(pair.name)}</strong></p><p>{pair.happened}</p></div>
            <div className="ve-result-card" data-ve-tone="ok"><p className="ve-result-card-state"><ToneMark tone="ok" /> Caught the bug</p><p><strong>{capital(pair.caught_by.name)}</strong></p><p>It failed on the bug, as a good check must.</p></div>
          </div>
          <p><Rich terms={terms} text={pair.why} /> {pair.claims?.[0] ? <a href={'#' + claimAnchor(pair.claims[0])}>See the claim</a> : null}</p>
        </Subsection>
      ) : null}
      <Subsection id="evidence-checks" title="Can these checks catch a bug?">
        <div data-ve-trust="verifiers">
          <p data-ve-result data-ve-tone={verify.tone}><StatusPill tone={verify.tone}>{verify.tone === 'ok' ? 'All caught' : verify.tone === 'warn' ? 'Some missed' : 'Some cannot fail'}</StatusPill> <strong>{verify.result}</strong> <CountMarks label={verify.result} runs={[{ n: verify.caught, tone: 'ok', label: 'caught its planted bug' }, { n: verify.missed, tone: 'warn', label: 'missed its planted bug' }, { n: verify.cannot, tone: 'err', label: 'cannot fail' }]} /></p>
          {verify.other ? <p className="ve-quiet" data-ve-other>{verify.other}</p> : null}
          {verify.weak.length ? (
            <ul className="ve-weak-lines">{verify.weak.map((w) => (
              <li data-ve-weak-line key={w.control}><strong>{capital(w.name)}.</strong> {w.happened} <span data-ve-action><Rich text={w.action} /></span> {w.claims?.[0] ? <a href={'#' + claimAnchor(w.claims[0])}>See the claim</a> : null}</li>
            ))}</ul>
          ) : null}
          <p>For each check, we broke the code on purpose and ran the check. A good check fails when the code is wrong: it caught the bug. Each kind of work has its own way to break it.</p>
          <dl className="ve-definition-list" data-ve-control-kinds>
            <dt>Planted bugs and mutants (backend)</dt>
            <dd data-ve-planted>{verify.result}</dd>
            <dt>Degraded variants for evals (LLM)</dt>
            <dd>
              {verify.evals?.length ? (
                <ul data-ve-evals>{verify.evals.map((e) => (
                  <li data-ve-eval={e.flagged ? 'flagged' : 'degraded'} key={e.check}><strong>{capital(e.name)}</strong> ({e.claim}): <Rich text={e.text} />{e.action ? <> <span data-ve-action><Rich text={e.action} /></span></> : null}</li>
                ))}</ul>
              ) : <span>No eval backs a claim of this PR.</span>}
            </dd>
            <dt>Broken-UI runs (frontend)</dt>
            <dd>
              {verify.ui?.length ? (
                <ul data-ve-ui>{verify.ui.map((u) => (
                  <li key={u.check}><strong>{capital(u.name)}</strong> ({u.claim}): {u.text}
                    {u.video ? <BrowserVideo artifact={{ video: u.video, screenshots: u.screenshots, captions: u.captions ?? undefined, summary: u.summary }} name={u.name} /> : null}</li>
                ))}</ul>
              ) : <span>No frontend claim in this PR.</span>}
            </dd>
          </dl>
          <p data-ve-tiers><strong>The checks by kind.</strong> {verify.tiers.map((t) => `${t.label}: ${t.n}`).join(' · ')}</p>
          <p><a href="#ch-5">See every check, by promise</a></p>
        </div>
      </Subsection>
      <Subsection id="evidence-marks" title="The marks on this page">
        <MarkKey />
        <Disclosure id="evidence-legend" summary="What each verdict means">
          <VerdictLegend data={data} id="evidence-legend-list" />
        </Disclosure>
      </Subsection>
    </div>
  );
}

// ---- Chapter 5: check your understanding -----------------------------------------------------------

type Question = { id: string; q: string; options: Array<{ text: string; right: boolean }>; why: string; links: Array<{ href: string; label: string }> };

/** Two or three questions from the derived data. The right answer is a derived value; the page computes no verdict. */
export function questionsFor(data: TrustMap, refs: Refs): Question[] {
  const out: Question[] = [];
  const rows = promiseRows(data, refs);
  const byName = (a: Claim, b: Claim) => claimLabel(a).localeCompare(claimLabel(b));
  const weak = rows.find((r) => !STRONG.includes(r.strength) && r.claims.length > 1 && r.claims.filter((c) => strengthOf(refs, c.id) === r.strength).length === 1)
    ?? rows.find((r) => !STRONG.includes(r.strength) && r.claims.length > 1);
  if (weak) {
    const options = [...weak.claims].slice(0, 4).sort(byName);
    const w = weak.claims.find((c) => strengthOf(refs, c.id) === weak.strength)!;
    out.push({
      id: 'q-weakest', q: `The promise "${weak.promise.label}" is ${weak.strength}. Which claim makes it ${weak.strength}?`,
      options: options.map((c) => ({ text: capital(claimLabel(c)), right: strengthOf(refs, c.id) === weak.strength })),
      why: `${capital(claimLabel(w))} is ${weak.strength}, the weakest of its ${weak.count} claims (${weak.tally}). A promise is only as strong as its weakest claim.`,
      links: [{ href: '#' + promiseAnchor(weak.promise.id), label: 'See the promise' }, { href: '#evidence-promise', label: 'How a promise rests on its claims' }],
    });
  }
  const barClaim = data.claims.find((c) => derivedClaim(refs, c.id).bar && !derivedClaim(refs, c.id).bar!.met && STRONG.includes(strengthOf(refs, c.id)))
    ?? data.claims.find((c) => derivedClaim(refs, c.id).bar);
  if (barClaim) {
    const b = derivedClaim(refs, barClaim.id).bar!;
    out.push({
      id: 'q-bar', q: `The claim "${claimLabel(barClaim)}" is ${strengthOf(refs, barClaim.id)}. Does it meet its evidence bar?`,
      options: [{ text: 'Yes, it meets its bar', right: b.met }, { text: 'No, it is below its bar', right: !b.met }],
      why: `Its bar is ${b.need}. ${b.met ? 'Each of its parts has that evidence.' : `It has ${b.why}.`} Strength says how well checks back a claim; the bar says what evidence its kind of code needs.`,
      links: [{ href: '#' + claimAnchor(barClaim.id), label: 'See the claim' }, { href: '#evidence-bar', label: 'How a bar works' }],
    });
  }
  const missed = refs.derived.verify.weak.find((w) => w.happened === 'The check still passed.' && w.claims?.length);
  if (missed) {
    const c = claimOf(data, missed.claims![0])!;
    const names = derivedClaim(refs, c.id).checks.filter((x) => x.kind !== 'none').map((x) => x.name);
    const extra = refs.derived.verify.by_promise.flatMap((p) => p.rows.map((r) => r.name)).filter((n) => !names.includes(n));
    const options = [...new Set([...names, ...extra])].slice(0, Math.max(3, Math.min(names.length, 4))).sort((a, b) => a.localeCompare(b));
    if (!options.includes(missed.name)) options[0] = missed.name;
    out.push({
      id: 'q-missed', q: `We planted a bug for the claim "${claimLabel(c)}". Which check missed it?`,
      options: options.map((n) => ({ text: capital(n), right: n === missed.name })),
      why: `${capital(missed.name)} still passed with the bug in place. ${missed.why}`,
      links: [{ href: '#' + claimAnchor(c.id), label: 'See the claim' }, ...(pairOf(refs) ? [{ href: '#evidence-one-bug', label: 'One bug, two results' }] : [{ href: '#evidence-checks', label: 'Can these checks catch a bug?' }])],
    });
  }
  return out.slice(0, 3);
}

function QuestionCard({ question, n }: { question: Question; n: number }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const answer = question.options.filter((o) => o.right).map((o) => o.text).join(' or ');
  const ok = chosen !== null && question.options[chosen].right;
  return (
    <article className="ve-question" data-ve-question={question.id}>
      <h3 className="ve-question-title"><span className="ve-question-n">{n}</span>{question.q}</h3>
      <div aria-label={question.q} className="ve-question-options" data-ve-js-only role="group">
        {question.options.map((o, i) => (
          <button aria-pressed={chosen === i} className="ve-question-option" data-ve-answer={chosen === null ? undefined : o.right ? 'right' : chosen === i ? 'wrong' : undefined} data-ve-option={i} key={o.text} onClick={() => setChosen(i)} type="button">
            {chosen !== null && (o.right || chosen === i) ? <ToneMark tone={o.right ? 'ok' : 'err'} /> : null}
            <span>{o.text}</span>
          </button>
        ))}
      </div>
      <div aria-live="polite" data-ve-js-only>
        {chosen !== null ? (
          <div className="ve-question-why" data-ve-tone={ok ? 'ok' : 'warn'} data-ve-why>
            <p><strong>{ok ? 'Right.' : `Not quite: the answer is ${answer}.`}</strong> {question.why}</p>
            <p>{question.links.map((l, i) => <Fragment key={l.href}>{i ? ' · ' : ''}<a href={l.href}>{l.label}</a></Fragment>)}</p>
          </div>
        ) : null}
      </div>
      <div data-ve-nojs-only>
        <ul className="ve-question-list">{question.options.map((o) => <li key={o.text}>{o.text}</li>)}</ul>
        <Disclosure summary="Show the answer">
          <p><strong>{answer}.</strong> {question.why}</p>
          <p>{question.links.map((l, i) => <Fragment key={l.href}>{i ? ' · ' : ''}<a href={l.href}>{l.label}</a></Fragment>)}</p>
        </Disclosure>
      </div>
    </article>
  );
}

/** Check your understanding: two or three questions from this PR's data, answered at once with the reason. Nothing is graded or stored. */
export function UnderstandingCheck({ data, refs }: WithRefs) {
  assertRefs(assertTrustMap(data), refs);
  const qs = questionsFor(data, refs);
  if (!qs.length) return <p>This PR has no weak promise or bar to ask about.</p>;
  return (
    <div data-ve-trust="questions">
      <p className="ve-quiet">Your answers stay on this page. Nothing is graded, saved or sent.</p>
      <div className="ve-question-stack">{qs.map((q, i) => <QuestionCard key={q.id} n={i + 1} question={q} />)}</div>
    </div>
  );
}

// ---- Chapter 6: the review -------------------------------------------------------------------------

function CallControls({ item, head }: { item: ReviewItem; head: string }) {
  const [calls, set] = useCalls(head);
  const name = `ve-call-${useId().replace(/:/g, '')}`;
  const now = calls[item.key] ?? {};
  return (
    <fieldset className="ve-review-call" data-ve-js-only data-ve-review-call>
      <legend>Your call</legend>
      <div className="ve-review-call-options">
        {CALLS.map((c) => (
          <label data-ve-checked={now.call === c ? 'true' : undefined} data-ve-tone={CALL_TONE[c]} key={c}>
            <input checked={now.call === c} name={name} onChange={() => set(item.key, { call: c })} type="radio" value={c} />
            <span>{CALL_WORDS[c]}</span>
          </label>
        ))}
      </div>
      <label className="ve-review-note">
        <span>A note, if you want one</span>
        <textarea onChange={(e) => set(item.key, { note: e.target.value })} rows={2} value={now.note ?? ''} />
      </label>
      <p className="ve-quiet">Saved in this browser only. Nothing is sent.</p>
    </fieldset>
  );
}

function CallBadge({ item, head }: { item: ReviewItem; head: string }) {
  const [calls] = useCalls(head);
  const c = calls[item.key]?.call;
  return c ? <span data-ve-call-badge={c}><StatusPill tone={CALL_TONE[c]}>{CALL_WORDS[c]}</StatusPill></span> : <span className="ve-review-todo" data-ve-call-badge="none">To review</span>;
}

type Homes = { claimItem: Map<string, ReviewItem>; promiseItem: Map<string, ReviewItem> };

function homes(data: TrustMap, items: ReviewItem[]): Homes {
  const claimItem = new Map<string, ReviewItem>();
  const promiseItem = new Map<string, ReviewItem>();
  for (const i of items) {
    const c = claimFor(data, i);
    if (c && !claimItem.has(c.id)) claimItem.set(c.id, i);
    const p = promiseFor(data, i);
    if (p && !promiseItem.has(p.id)) promiseItem.set(p.id, i);
  }
  return { claimItem, promiseItem };
}

/** The claims of a promise: a timeline of rows, then the full detail of each claim that has no checklist item of its own. */
function PromiseClaims({ data, refs, explain, claims, h }: All & { claims: Claim[]; h: Homes }) {
  const own = claims.filter((c) => !h.claimItem.has(c.id));
  return (
    <>
      <ClaimTimeline claims={claims} data={data} refs={refs} />
      {own.length ? <div className="ve-claim-details">{own.map((c) => <ClaimDetail claim={c} data={data} explain={explain} key={c.id} refs={refs} />)}</div> : null}
    </>
  );
}

function ItemEvidence({ data, refs, explain = {}, item, h }: All & { item: ReviewItem; h: Homes }) {
  const terms = termState(data);
  const c = claimFor(data, item);
  const p = promiseFor(data, item);
  if (p) {
    const row = promiseRows(data, refs).find((r) => r.promise.id === p.id)!;
    return (
      <>
        <Defs items={[
          ['What it is', <Rich terms={terms} text={p.sentence} />],
          // The summary row says the first sentence of the action already: the body says the rest, if there is more.
          ...(p.reviewer_action && p.reviewer_action.trim() !== item.text.trim() ? [['Why it matters', <Rich terms={terms} text={p.reviewer_action} />, item.blocks ? 'err' : 'warn'] as [ReactNode, ReactNode, 'err' | 'warn']] : []),
          ['Its claims', `${row.count} ${row.count === 1 ? 'claim' : 'claims'}: ${row.tally}.`],
        ]} />
        <PromiseClaims claims={row.claims} data={data} explain={explain} h={h} refs={refs} />
      </>
    );
  }
  if (c) {
    const d = derivedClaim(refs, c.id);
    const risk = risksOf(data, explain, c)[0];
    return (
      <>
        <Defs items={[
          ['What it is', <Rich terms={terms} text={c.plain?.what ?? c.text} />],
          ...(risk && !STRONG.includes(d.strength) ? [['Why it matters', <Rich terms={terms} text={risk.why} />, item.blocks ? 'err' : 'warn'] as [ReactNode, ReactNode, 'err' | 'warn']] : []),
        ]} />
        <ClaimBody claim={c} data={data} explain={explain} refs={refs} said />
      </>
    );
  }
  if (item.href === '#unclaimed') {
    const risky = refs.derived.spine?.groups.flatMap((g) => g.files).filter((f) => ['check', 'ask'].includes(f.status.kind)) ?? [];
    return (
      <>
        <Defs items={[['What it is', 'Changed code that no claim covers, so no check speaks for it.'], ['Why it matters', <Rich terms={terms} text={item.text} />, item.blocks ? 'err' : 'warn']]} />
        <div className="ve-file-stack">{risky.map((f) => <FileCard anchored={false} data={data} file={f} key={f.path} refs={refs} />)}</div>
      </>
    );
  }
  const gates = refs.derived.ready?.gates ?? [];
  return <Defs items={[['Why it matters', <Rich terms={terms} text={item.text} />, item.blocks ? 'err' : 'warn'], ...gates.map((g) => [`Gate ${g.n}: ${g.name}`, <Rich key={g.n} text={(g.pass ? 'Pass. ' : 'Fail. ') + g.detail} />, g.pass ? 'ok' : 'err'] as [ReactNode, ReactNode, 'ok' | 'err'])]} />;
}

function itemStrength(data: TrustMap, refs: Refs, item: ReviewItem): Verdict | null {
  const c = claimFor(data, item);
  if (c) return strengthOf(refs, c.id);
  const p = promiseFor(data, item);
  return p ? refs.derived.promises.find((x) => x.id === p.id)!.strength : null;
}

function ReviewItemCard({ data, refs, explain, item, h }: All & { item: ReviewItem; h: Homes }) {
  const strength = itemStrength(data, refs, item);
  const c = claimFor(data, item);
  const d = c ? derivedClaim(refs, c.id) : null;
  return (
    <li className="ve-review-item" data-ve-blocks={item.blocks ? 'true' : undefined} data-ve-review-item={item.key} value={item.n}>
      <Disclosure id={itemAnchor(item)} meta={item.kind === 'other' ? undefined : item.id!.toUpperCase()} share summary={
        <span className="ve-review-summary">
          <span className="ve-review-n" aria-hidden="true">{item.n}</span>
          <span className="ve-review-title">
            <span className="ve-review-label">{capital(item.label)}</span>
            <span className="ve-review-why"><Rich text={item.text} /></span>
          </span>
          <span className="ve-review-marks">
            {strength ? <VerdictPill verdict={strength} /> : null}
            {d?.bar && !d.bar.met ? <StatusPill meaning={d.bar.text} tone={d.bar.risky ? 'err' : 'warn'}>{`Below bar: ${d.bar.need}`}</StatusPill> : null}
            <CallBadge head={data.head} item={item} />
          </span>
        </span>
      }>
        <div className="ve-review-body">
          <ItemEvidence data={data} explain={explain} h={h} item={item} refs={refs} />
          <CallControls head={data.head} item={item} />
        </div>
      </Disclosure>
    </li>
  );
}

/** The reviewer's calls as Markdown for a PR comment. It names each item in plain words. */
export function reviewMarkdown(data: TrustMap, refs: Refs, calls: Calls): string {
  const items = reviewItems(refs);
  const { word, what } = mergeLine(refs);
  const out = [`## My review of PR #${data.pr ?? ''}${data.title ? `: ${data.title}` : ''}`.replace('PR #:', 'the PR:'), '',
    `Head \`${data.head.slice(0, 10)}\`. The page says: ${word}, ${what}. I reviewed ${reviewed(calls, items)} of ${items.length}.`, ''];
  for (const c of ['fix', 'accept', 'ok'] as const) {
    const mine = items.filter((i) => calls[i.key]?.call === c);
    if (!mine.length) continue;
    out.push(`### ${CALL_WORDS[c]} (${mine.length})`, '');
    for (const i of mine) out.push(`- **${capital(i.label)}** (${i.blocks ? 'blocks the merge' : 'a risk to accept'}): ${i.text}${calls[i.key].note?.trim() ? `\n  - Note: ${calls[i.key].note!.trim().replace(/\n+/g, ' ')}` : ''}`);
    out.push('');
  }
  const left = items.filter((i) => !calls[i.key]?.call);
  if (left.length) out.push(`### Not reviewed yet (${left.length})`, '', ...left.map((i) => `- ${capital(i.label)}`), '');
  const chapters = (refs.derived.spine?.groups ?? []).filter(reviewable);
  if (chapters.length) {
    const done = chapters.filter((g) => calls[`chapter:${g.id}`]?.reviewed);
    out.push(`### Chapters of the change (${done.length} of ${chapters.length} reviewed)`, '', ...chapters.map((g) => `- [${calls[`chapter:${g.id}`]?.reviewed ? 'x' : ' '}] ${g.name}`), '');
  }
  return out.join('\n');
}

/** Copy the reviewer's calls as Markdown. It only copies: it never posts or sends. */
export function ExportReview({ data, refs }: WithRefs) {
  const [calls] = useCalls(data.head);
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [text, setText] = useState('');
  useEffect(() => {
    if (state !== 'copied') return undefined;
    const t = window.setTimeout(() => setState('idle'), 2400);
    return () => window.clearTimeout(t);
  }, [state]);
  const copy = () => {
    const md = reviewMarkdown(data, refs, calls);
    setText(md);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(md).then(() => setState('copied'), () => setState('manual'));
    else setState('manual');
  };
  return (
    <div className="ve-review-export" data-ve-js-only data-ve-review-export>
      <button className="ve-button" data-ve-export onClick={copy} type="button">Copy my review as Markdown</button>
      <span aria-live="polite" className="ve-quiet">{state === 'copied' ? 'Copied. Paste it into a PR comment.' : state === 'manual' ? 'Copy the text below.' : 'It only copies. Nothing is posted.'}</span>
      {state === 'manual' ? <textarea aria-label="Your review as Markdown" className="ve-review-export-text" readOnly rows={8} value={text} /> : null}
    </div>
  );
}

/**
 * The review: every blocker, then every risk to accept, in derive.py's order (the riskiest first).
 * Each item says what it is and why it matters, shows its evidence (the code, the checks, the planted
 * bugs or the eval comparison, and the bar) and takes the reviewer's call with a note. Then the
 * promises with nothing to review. Each claim's full detail shows once: in its own item, else in its
 * promise.
 */
export function ReviewChecklist({ data, refs, explain = {} }: All) {
  assertRefs(assertTrustMap(data), refs);
  const items = reviewItems(refs);
  const h = homes(data, items);
  const blocks = items.filter((i) => i.blocks);
  const accept = items.filter((i) => !i.blocks);
  const rest = promiseRows(data, refs).filter((r) => !h.promiseItem.has(r.promise.id));
  const terms = termState(data);
  return (
    <div data-ve-trust="review">
      <div className="ve-review-bar">
        <ReviewProgress data={data} refs={refs} />
        <ExportReview data={data} refs={refs} />
      </div>
      {/* Both parts always show, so a link to either one has its target: an empty part says so. */}
      <Subsection id="review-blockers" title={`Blocks the merge (${blocks.length})`}>
        {blocks.length ? <ol className="ve-review-list">{blocks.map((i) => <ReviewItemCard data={data} explain={explain} h={h} item={i} key={i.key} refs={refs} />)}</ol> : <p>Nothing blocks the merge.</p>}
      </Subsection>
      <Subsection id="review-accept" title={`Ready if you accept (${accept.length})`}>
        {accept.length ? <ol className="ve-review-list" start={blocks.length + 1}>{accept.map((i) => <ReviewItemCard data={data} explain={explain} h={h} item={i} key={i.key} refs={refs} />)}</ol> : <p>No risk to accept.</p>}
      </Subsection>
      {rest.length ? (
        <Subsection id="review-hold" title="The promises with nothing to review">
          <div className="ve-card-stack">{rest.map((r) => (
            <article className="ve-card ve-promise" data-ve-tone={TONE[r.strength]} key={r.promise.id}>
              <Subsection id={promiseAnchor(r.promise.id)} share title={r.promise.label}>
                <p><VerdictPill verdict={r.strength} /> <Rich terms={terms} text={r.promise.sentence} /></p>
                <PromiseClaims claims={r.claims} data={data} explain={explain} h={h} refs={refs} />
              </Subsection>
            </article>
          ))}</div>
        </Subsection>
      ) : null}
    </div>
  );
}

// ---- Chapter 7: the verdict ------------------------------------------------------------------------

/** The merge state again, with what is left after the reviewer's calls: each item that needs a fix and each item not reviewed yet. */
export function ReviewVerdict({ data, refs }: WithRefs) {
  assertRefs(assertTrustMap(data), refs);
  const [calls] = useCalls(data.head);
  const { word, tone, what, split, items, form } = mergeLine(refs);
  const fix = items.filter((i) => calls[i.key]?.call === 'fix');
  const left = items.filter((i) => !calls[i.key]?.call);
  const bugs = refs.derived.bugs ?? [];
  const link = (i: ReviewItem) => <a href={'#' + itemAnchor(i)}>{capital(i.label)}</a>;
  return (
    <div data-ve-trust="verdict">
      <div className="ve-verdict ve-review-state" data-ve-tone={tone}>
        <p data-ve-verdict-state={form}><span className="ve-verdict-word"><ToneMark tone={tone} />{word}:</span> <span className="ve-verdict-lead">{what}</span></p>
        <p>{split}</p>
        <ReviewProgress data={data} refs={refs} />
        <div data-ve-js-only>
          {fix.length ? <p data-ve-left="fix"><strong>You marked {fix.length} as needing a fix:</strong> {fix.map((i, n) => <Fragment key={i.key}>{n ? ', ' : ''}{link(i)}</Fragment>)}.</p> : null}
          {left.length && left.length < items.length ? <p data-ve-left="todo"><strong>Still to review ({left.length}):</strong> {left.slice(0, 6).map((i, n) => <Fragment key={i.key}>{n ? ', ' : ''}{link(i)}</Fragment>)}{left.length > 6 ? ` and ${left.length - 6} more` : ''}.</p> : null}
          {items.length && left.length === items.length ? <p data-ve-left="none"><strong>You have made no call yet.</strong> Start with the riskiest item: {link(items[0])}.</p> : null}
          {items.length && !left.length && !fix.length ? <p data-ve-left="done"><strong>You reviewed each item.</strong> Copy your review for the PR comment.</p> : null}
        </div>
        <ExportReview data={data} refs={refs} />
      </div>
      {refs.derived.ready ? (
        <div data-ve-ready-gates id="story-ready-gates">
          <p><strong>The ready checklist.</strong> Four gates decide if the PR is ready to review. Each gate passes or fails.</p>
          <Defs items={refs.derived.ready.gates.map((g) => [`Gate ${g.n}: ${g.name}`, <Rich key={g.n} text={(g.pass ? 'Pass. ' : 'Fail. ') + g.detail} />, g.pass ? 'ok' : 'err'] as [ReactNode, ReactNode, 'ok' | 'err'])} />
        </div>
      ) : null}
      {bugs.length ? (
        <div data-ve-bugs data-ve-lint="skip">
          <p><strong>Bugs found: {bugs.length}.</strong> {bugs.filter((b) => b.verified).length} verified, {bugs.filter((b) => !b.verified).length} {bugs.filter((b) => !b.verified).length === 1 ? 'lead' : 'leads'}.</p>
          {bugs.map((b, i) => <Disclosure key={i} summary={b.heading}><div data-ve-lint="skip"><ul>{b.lines.map((line, j) => <li key={j}>{line}</li>)}</ul></div></Disclosure>)}
        </div>
      ) : null}
    </div>
  );
}

// ---- Before you approve -------------------------------------------------------------------------------

/**
 * The checks to finish before you approve, from explain.json verdict.checks. Each one is a thing to
 * do: a command (its own, or the command of a check of the map, read from the trust map), the lines
 * to read at the PR head, a file to compare, or real inputs for a manual test. The export fails on a
 * check with none of these: no generic advice. Each has a box; the boxes stay in this browser.
 */
export function ApproveChecks({ data, refs, explain = {} }: All) {
  assertRefs(assertTrustMap(data), refs);
  const checks = explain.verdict?.checks ?? [];
  const verifiers = new Map(data.verifiers.map((v) => [v.id, v]));
  const bad = checks.filter((c) => !(c.run || c.check || c.ref || c.file || c.inputs)).map((c) => c.text);
  if (bad.length) throw new TrustMapError('explain.json verdict.checks: each check needs a command (run or check), a ref or file to read, or real inputs; these have none:\n  ' + bad.join('\n  '));
  const [calls, set] = useCalls(data.head);
  if (!checks.length) return null;
  return (
    <div data-ve-trust="approve">
      <ol className="ve-approve" data-ve-approve>
        {checks.map((c, i) => {
          // A check that the map no longer has (trim or close removed it) says so, so the reviewer writes the step again.
          const v = c.check && verifiers.get(c.check)?.command?.argv?.length ? verifiers.get(c.check)! : null;
          const r = c.ref ? maybeRef(refs, c.ref) : null;
          const key = `approve:${i}`;
          return (
            <li data-ve-approve-item={i} key={i}>
              <label className="ve-approve-done" data-ve-js-only>
                <input checked={Boolean(calls[key]?.reviewed)} onChange={(e) => set(key, { reviewed: e.target.checked })} type="checkbox" />
                <span className="ve-visually-hidden">Done: </span>
              </label>
              <div className="ve-approve-body">
                <p><Rich text={c.text} /></p>
                {c.check && !v ? <p className="ve-quiet" data-ve-stale-check>Its check is no longer in the trust map, so this step has no command. Run understando explain again after you write it.</p> : null}
                {v ? <CodeBlock code={'$ ' + v.command!.argv.join(' ')} filename={`${capital(v.name ?? 'the check')}, at the PR head${v.command!.cwd ? `, in ${v.command!.cwd}` : ''}`} language="bash" /> : null}
                {c.run ? <CodeBlock code={'$ ' + c.run} filename={`Run at the PR head${c.cwd ? `, in ${c.cwd}` : ''}`} language="bash" /> : null}
                {c.ref ? (r?.permalink ? <p><a href={r.permalink}>Read {c.ref.symbol ?? c.ref.path} at the PR head</a> <span className="ve-quiet">(lines {r.start} to {r.end})</span></p> : <p><code>{c.ref.path}</code></p>) : null}
                {c.file ? <p>Compare: <code>{c.file}</code></p> : null}
                {c.inputs ? <p><strong>Inputs:</strong> <Rich text={c.inputs} /></p> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---- The checks: verifiers, not tests --------------------------------------------------------------

/**
 * The checks of the PR, by promise: each claim, then the checks that back it, each a check row with
 * its result (caught, missed, cannot fail) and, behind it, its test and its planted bugs. Then the
 * changed tests that back no claim, by file, with one action, and the changed test files as the
 * checks they provide. A test shows through what it verifies, never as a list of test names alone.
 */
export function VerifierView({ data, refs }: WithRefs) {
  assertRefs(assertTrustMap(data), refs);
  const tests = refs.derived.tests;
  const verify = refs.derived.verify;
  if (!refs.derived.checks || !tests) throw new TrustMapError('refs.resolved.json has no derived checks or tests; run understando explain again');
  const rows = promiseRows(data, refs);
  return (
    <div data-ve-trust="checks">
      <p data-ve-checks-result><strong>{verify.result}</strong> <CountMarks label={verify.result} runs={[{ n: verify.caught, tone: 'ok', label: 'caught its planted bug' }, { n: verify.missed, tone: 'warn', label: 'missed its planted bug' }, { n: verify.cannot, tone: 'err', label: 'cannot fail' }]} /></p>
      {verify.other ? <p className="ve-quiet">{verify.other}</p> : null}
      {tests.orphan_tests ? (
        <div className="ve-orphans" data-ve-orphans>
          <p><strong data-ve-orphan-count>{tests.summary}</strong> <span data-ve-action>{tests.action}</span></p>
          <Disclosure summary={`Show them by file (${tests.orphans.length} ${tests.orphans.length === 1 ? 'file' : 'files'})`}>
            <ul className="ve-orphan-files">{tests.orphans.map((o) => (
              <li key={o.path}><code className="ve-file-path">{o.file}</code>: {o.tests.map((t, i) => <Fragment key={t}>{i ? ', ' : ''}<code>{t.split('.').at(-1)}</code></Fragment>)}</li>
            ))}</ul>
          </Disclosure>
        </div>
      ) : <p className="ve-quiet">{tests.summary}</p>}
      {rows.map(({ promise: p, strength, claims }) => (
        <section className="ve-checks-promise" data-ve-checks-promise={slug(p.id)} key={p.id}>
          <h3 className="ve-subsection-title"><VerdictPill verdict={strength} /> {p.label}</h3>
          {claims.map((c) => {
            const ids = derivedClaim(refs, c.id).checks.filter((x) => x.kind !== 'none').map((x) => x.id);
            return (
              <div className="ve-checks-claim" key={c.id}>
                <ClaimRow claim={c} data={data} refs={refs} />
                {ids.length ? <div className="ve-check-rows">{ids.map((id) => <CheckRow data={data} hideClaims id={id} key={id} lazy refs={refs} />)}</div> : <p className="ve-quiet">No tool checks this claim.</p>}
              </div>
            );
          })}
        </section>
      ))}
      {tests.files.length ? (
        <Disclosure summary={`Show the checks by test file (${tests.files.length} changed test ${tests.files.length === 1 ? 'file' : 'files'})`}>
          {tests.files.map((f) => (
            <div className="ve-checks-file" key={f.path}>
              <p><code className="ve-file-path">{f.file}</code> provides {f.checks.length} {f.checks.length === 1 ? 'check' : 'checks'}:</p>
              <div className="ve-check-rows">{f.checks.map((id) => <CheckRow data={data} id={id} key={id} lazy refs={refs} />)}</div>
            </div>
          ))}
        </Disclosure>
      ) : null}
      <VerifierTable data={data} id="checks-table" refs={refs} />
    </div>
  );
}

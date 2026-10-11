// The trust-map explainer: data components that render each data-driven level of an understando
// trust map. The narrative (the story, the loop, why, trade-offs) stays MDX that an agent writes;
// these components drop in the levels that come from data. Each one validates its input and
// throws on bad data, so the static pre-render of `ve:export` fails the export.
// The card plugins/visual-explainer/cards/trust-map.md holds the data contract.
import { Children, cloneElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { CodeBlock, DiffBlock, TerminalBlock, type DiffRow } from './code-blocks';
import { ChipLinks, Disclosure, Subsection, Term } from './content-blocks';
import { DataTable, Legend, StatusPill, type LegendItem } from './data-table';
import { DiagramCanvas } from './diagram-canvas';
import { DiagramModes } from './diagram-modes';
import type { DiagramEdge, DiagramNode } from './diagram-types';
import { DiagramWalkthrough } from './diagram-walkthrough';
import {
  assertAreas, assertRefs, assertTrustMap, capital, changeDiagram, claimAnchor, claimLabel, controlOutcome, controlWalkthrough, expansion, findRef,
  FLAG_TONE, GLYPH_FAMILY, glossaryEntries, isAcronym, KIND_GLYPH, ladder, LADDER_NAMES, lines, MAX_MERGE_ITEMS, MERGE_WORDS,
  mutationLabel, norm, verifierReport, checksOf, claimChecks, OUTCOME, promiseAnchor, promiseRows, reader, replacedRows, slug, STATE_TONE, strongestTier, STRONG, tally, TIER_WORD,
  TONE, TrustMapError, VERDICT_MEANING, VERDICTS, VISIBLE_UNCLAIMED, weakest,
  type Claim, type CodeRefSpec, type Tone, type UnclaimedFile, type Control, type DiagramSpec, type Explain, type GlossaryEntry, type Ready, type Refs, type TrustMap, type Verdict, type Verifier,
} from './trust-map-rules';
import './trust-map.css';

export { promiseAnchors } from './trust-map-rules';

type Data = { data: TrustMap };
type WithRefs = Data & { refs: Refs };

// ---- Glossary terms in running text ----------------------------------------------------------

type TermState = { entries: Array<GlossaryEntry & { expansion: string | null }>; pattern: RegExp | null; seen: Set<string>; expand: boolean; expanded: Set<string> };

function termState(data: TrustMap, expand = false): TermState {
  const entries = glossaryEntries(data).map((g) => ({ ...g, expansion: expansion(g.term, g.meaning) }));
  const forms = [...new Set(entries.flatMap((g) => [g.term, ...(g.aliases ?? [])]).filter((f) => f.length >= 2))].sort((a, b) => b.length - a.length);
  const alts = forms.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return { entries, pattern: alts ? new RegExp(`(?<![\\w-])(${alts})(?:s|es)?(?![\\w-])`, 'gi') : null, seen: new Set(), expand, expanded: new Set() };
}

function findTerm(state: TermState, word: string) {
  const w = norm(word);
  return state.entries.find((g) => [g.term, ...(g.aliases ?? [])].some((f) => (isAcronym(f) ? f === word : f.toLowerCase() === word.toLowerCase() || norm(f) === w)));
}

/** Text with a Term at the first use of each glossary word in this level; an abbreviation is spelled out at its first use when `expand` is on. */
function glossed(text: string, state: TermState | null, key = 't'): ReactNode {
  if (!state?.pattern || !text) return text;
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(state.pattern)) {
    const hit = findTerm(state, m[1]);
    if (!hit || state.seen.has(hit.term)) continue;
    if (m[1] === hit.term || !hit.expansion || state.expanded.has(hit.term)) state.seen.add(hit.term);
    if (m.index! > last) out.push(text.slice(last, m.index));
    const spell = state.expand && hit.expansion && m[1] === hit.term && !state.expanded.has(hit.term);
    if (spell) state.expanded.add(hit.term);
    out.push(<Term definition={`${hit.term}: ${hit.meaning}`} expansion={spell ? hit.expansion! : undefined} key={`${key}-${m.index}`}>{m[0]}</Term>);
    last = m.index! + m[0].length;
  }
  if (!out.length) return text;
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** STE text from the data: a `backtick` span becomes code, the rest gets reader words and glossary terms. */
function Rich({ text, terms }: { text: string; terms?: TermState | null }) {
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
 * Narrative prose with glossary terms: the first use of each word of the glossary in this block
 * shows its definition on hover, focus or tap. Wrap the Markdown of one level in it. `expand`
 * spells out each abbreviation at its first use; set it on the first level of the page.
 */
export function Glossed({ data, expand = false, children }: Data & { expand?: boolean; children: ReactNode }) {
  assertTrustMap(data);
  return <>{glossChildren(children, termState(data, expand))}</>;
}

// ---- Small pieces ----------------------------------------------------------------------------

export function VerdictPill({ verdict }: { verdict: Verdict }) {
  return <StatusPill meaning={`${verdict}: ${VERDICT_MEANING[verdict]}`} tone={TONE[verdict]}>{verdict}</StatusPill>;
}

function Defs({ items }: { items: Array<[ReactNode, ReactNode, ('ok' | 'info' | 'warn' | 'err')?]> }) {
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
  const r = findRef(refs, ref);
  const name = `${r.path}:${r.start}` + (r.end !== r.start ? `-${r.end}` : '');
  return (
    <div className="ve-code-ref" data-ve-code-ref>
      <CodeBlock code={r.excerpt} filename={name} html={r.html} language={r.language} />
      {r.permalink ? <p><a href={r.permalink}>Open these lines at the PR head</a></p> : null}
    </div>
  );
}

/** A link to a promise, with its label from the map: "Promise: <label>". */
export function PromiseLink({ data, id }: Data & { id: string }) {
  assertTrustMap(data);
  const p = data.promises.find((x) => x.id === id);
  if (!p) throw new TrustMapError(`PromiseLink names the promise ${id}, which the map does not have`);
  return <a href={'#' + promiseAnchor(p.id)}>Promise: {p.label}</a>;
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
export function ArchitectureDiagram({ spec, name = spec?.title }: { spec: DiagramSpec; name?: string }) {
  if (!spec) throw new TrustMapError(`ArchitectureDiagram ${name ?? ''}: the spec is missing`);
  for (const mode of ['eli5', 'detailed'] as const) if (!spec[mode]?.nodes?.length) throw new TrustMapError(`diagram ${name}: it has no ${mode} mode; each architecture diagram needs eli5 and detailed nodes and edges`);
  const detailIds = new Set(spec.detailed.nodes.map((n) => n.id));
  const missing = spec.eli5.nodes.filter((n) => !detailIds.has(n.id)).map((n) => n.id);
  if (missing.length) throw new TrustMapError(`diagram ${name}: the eli5 nodes ${missing.join(', ')} have no detailed node with the same id`);
  if (spec.detailed.nodes.length > Math.ceil(1.5 * spec.eli5.nodes.length)) throw new TrustMapError(`diagram ${name}: ${spec.detailed.nodes.length} detailed nodes for ${spec.eli5.nodes.length} eli5 nodes; keep it at 1.5 times or less`);
  for (const n of spec.eli5.nodes) for (const text of [n.label, n.detail]) { const hit = codeLike(text); if (hit) throw new TrustMapError(`diagram ${name}: the eli5 node ${n.id} has ${hit}: ${text}`); }
  for (const e of spec.eli5.edges) { const hit = codeLike(e.label); if (hit) throw new TrustMapError(`diagram ${name}: an eli5 edge label has ${hit}: ${e.label}`); }
  return (
    <DiagramModes description={spec.description} detailed={graph(spec.detailed)} direction={spec.direction as 'wrap' | undefined} layout={(spec.layout ?? 'flow') as 'flow'} simple={graph(spec.eli5)} title={spec.title} />
  );
}

const SHAPE_NAMES: Record<string, string> = { rect: 'step', oval: 'input or result', diamond: 'decision' };

/** A step-by-step motion figure, collapsed, with a key for its box shapes. */
export function Walkthrough({ spec, id }: { spec: { title: string; description: string; nodes: unknown[]; edges: unknown[]; steps: unknown[] }; id?: string }) {
  const shapes = [...new Set((spec.nodes as Array<{ shape?: string }>).map((n) => n.shape ?? 'rect'))].sort((a, b) => ['rect', 'oval', 'diamond', 'dot'].indexOf(a) - ['rect', 'oval', 'diamond', 'dot'].indexOf(b));
  const legend = shapes.filter((g) => SHAPE_NAMES[g]).map((g) => ({ label: SHAPE_NAMES[g], glyph: g })) as LegendItem[];
  return (
    <Disclosure id={id} lazy summary={'Show the motion: ' + spec.title.charAt(0).toLowerCase() + spec.title.slice(1)}>
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
  const terms = termState(data);
  return (
    <div data-ve-trust="merge">
      <Subsection id="merge" title="Can you merge it?">
        <p data-merge-verdict={form}><StatusPill tone={tone}>{word}</StatusPill> {lead}</p>
        {shown.length ? (
          <ol data-merge-items>
            {shown.map((i) => <li key={i.href + i.text}><a href={i.href}>{i.label}</a>: <Rich terms={terms} text={i.text} /></li>)}
          </ol>
        ) : null}
        {rest.length ? <p>And {rest.length} more: {rest.map((i, n) => <Fragment key={i.href + n}>{n ? ', ' : ''}<a href={i.href}>{i.label}</a></Fragment>)}.</p> : null}
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
          <p>Four gates decide if the PR is ready to review. Each gate passes or fails.</p>
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
  const chips = promiseRows(data, refs).map(({ promise: p, strength }) => ({ label: p.label, href: '#' + promiseAnchor(p.id), tone: TONE[strength], status: strength, meaning: `${strength}: ${VERDICT_MEANING[strength]}` }));
  return (
    <div data-ve-trust="chips">
      <Subsection id="story-promises" title="What the PR promises">
        <p><Rich terms={termState(data)} text="Each chip is one promise. The pill shows its weakest claim: the promise is only as strong as that claim. Select a chip to see the proof." /></p>
        <ChipLinks items={chips} label="The promises, weakest first" />
        <VerdictLegend data={data} />
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

function controlEdits(refs: Refs, k: Control) {
  const edits = refs.controls?.[k.id];
  if (!edits) throw new TrustMapError(`control ${k.id} has no patch in refs.resolved.json; run understando explain again`);
  return edits.map((e, i) => {
    if (e.patch || e.before !== undefined) return <DiffBlock after={e.after} before={e.before} filename={e.path} key={i} language={e.language} patch={e.patch} rows={e.rows as DiffRow[] | undefined} />;
    return <p key={i}><code>{e.note ?? 'changed bytes'}</code> {e.path}</p>;
  });
}

function VerifierBlock({ v, data, refs }: { v: Verifier; data: TrustMap; refs: Refs }) {
  const rung = ladder(v);
  const label = `${v.name ? v.name + '. ' : ''}${v.kind} check, ${TIER_WORD[v.tier] ?? v.tier}${rung ? `, rung ${rung}` : ''}, ${v.state ?? 'unknown'} (${v.id}):`;
  const m = v.mechanical?.result;
  const b = v.baseline ?? {};
  return (
    <div data-ve-lint="skip">
      <p><strong>{label}</strong> {reader(`${v.description} Provenance: ${v.provenance}`)}</p>
      {v.recorded ? <TerminalBlock content={v.recorded.result} title={'Recorded: ' + v.recorded.source} /> : null}
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

/** One claim: its plain what and proof, the code from resolved refs, each verifier and each control result as a real diff. */
export function ClaimDetail({ data, refs, claim, explain = {} }: WithRefs & { claim: Claim | string; explain?: Explain }) {
  assertTrustMap(data);
  assertRefs(data, refs);
  const c = typeof claim === 'string' ? data.claims.find((x) => x.id === claim) : claim;
  if (!c) throw new TrustMapError(`ClaimDetail names the claim ${String(claim)}, which the map does not have`);
  const risk = (explain.risks ?? []).find((r) => r.claims.includes(c.id));
  const plain = c.plain ?? { what: c.text, proof: c.reason };
  const terms = termState(data);
  const items: Array<[ReactNode, ReactNode, ('warn' | undefined)?]> = [['How it is proven', <Rich terms={terms} text={plain.proof} />]];
  if (plain.warning) items.push(['Warning', <Rich terms={terms} text={plain.warning} />, 'warn']);
  if (risk && c.verdict !== 'Proven') {
    items.push(['Why it is weak', <Rich terms={terms} text={risk.why} />, 'warn']);
    if (risk.fix) items.push(['Cheapest fix', <Rich terms={terms} text={risk.fix} />]);
  }
  items.push(['Verdict', <Rich text={`${c.verdict}. ${c.reason}`} />]);
  if (c.tier) items.push(['Tier', `${c.tier}: ${LADDER_NAMES[c.tier]}.`]);
  if (c.waiver) items.push(['Waived', <Rich text={c.waiver.reason} />, 'warn']);
  items.push(['Source', c.source]);
  const inv = (data.invariants ?? []).find((i) => i.id === c.invariant);
  if (inv) {
    const confirmed = inv.author === 'user' && inv.status === 'accepted';
    items.push(['Invariant', (confirmed ? 'Confirmed by the user: ' : 'Proposed, not confirmed by the user: ') + inv.text, confirmed ? undefined : 'warn']);
  }
  const verifiers = checksOf(data, c);
  const checks = claimChecks(data, refs, c, explain);
  items.unshift(['Checks', checks.summary]);
  if (checks.weakest) items.splice(1, 0, ['Weakest check', <span data-ve-action>{checks.weakest.text} {checks.weakest.action}</span>, 'warn']);
  return (
    <Disclosure id={claimAnchor(c.id)} meta={c.id} share summary={<><VerdictPill verdict={c.verdict} /> <Rich text={claimLabel(c)} /></>}>
      <div data-ve-trust="claim">
        <Defs items={items} />
        {(c.code ?? []).map((ref, i) => <CodeRef key={i} refs={refs} {...ref} />)}
        {verifiers.length ? verifiers.map((v) => <VerifierBlock data={data} key={v.id} refs={refs} v={v} />) : <p><em>No verifier backs this claim.</em></p>}
      </div>
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
  const terms = termState(data);
  for (const r of risks) for (const id of r.claims) if (!data.claims.some((c) => c.id === id)) throw new TrustMapError(`explain.json risks name the claim ${id}, which the map does not have`);
  return (
    <div data-ve-trust="promises">
      <p><Rich terms={terms} text="Each promise below is a plain sentence about the PR. Its strength is the verdict of its weakest claim. The weakest promises come first. Open a promise to see its claims, then open a claim to see its code, its checks and the bugs that we planted." /></p>
      <p><a href="#story-legend">See what each verdict means</a></p>
      {promiseRows(data, refs).map(({ promise: p, strength, claims }, i) => {
        const word = claims.length === 1 ? 'claim' : 'claims';
        const defs: Array<[ReactNode, ReactNode, ('warn' | undefined)?]> = [];
        if (p.reviewer_action) defs.push(['Reviewer action', <Rich terms={terms} text={p.reviewer_action} />, STRONG.includes(strength) ? undefined : 'warn']);
        for (const c of claims) {
          const fix = risks.find((r) => r.claims.includes(c.id))?.fix;
          if (fix && c.verdict !== 'Proven') defs.push(['Cheapest fix', <><Rich terms={terms} text={fix} /> <a href={'#' + claimAnchor(c.id)}>Open the claim</a></>]);
        }
        return (
          <Subsection id={promiseAnchor(p.id)} key={p.id} marker={String(i + 1)} share title={p.label}>
            <p><Rich terms={terms} text={p.sentence} /></p>
            <p><strong>{strongestTier(claims)}</strong></p>
            <p><VerdictPill verdict={strength} /> This is the verdict of its weakest claim. Its {claims.length} {word}: {tally(claims.map((c) => c.verdict))}.</p>
            {claims.filter((c) => c.waiver).map((c) => <p key={c.id}>Waived: {claimLabel(c)} Reason: {c.waiver!.reason}</p>)}
            {defs.length ? <Defs items={defs} /> : null}
            <Disclosure id={promiseAnchor(p.id) + '-claims'} summary={`Show the ${claims.length} ${word} behind this promise`}>
              {claims.map((c) => <ClaimDetail claim={c} data={data} explain={explain} key={c.id} refs={refs} />)}
            </Disclosure>
          </Subsection>
        );
      })}
    </div>
  );
}

// ---- Level 5: verify the verifiers -----------------------------------------------------------

function verifierMapFigure(data: TrustMap) {
  const verdictOf = new Map(data.claims.map((c) => [c.id, c.verdict]));
  const layerOf = new Map(data.claims.map((c) => [c.id, c.layer ?? 'Claims']));
  const kinds = new Map<string, { n: number; guess: boolean; recorded: number; checked: number }>();
  const links = new Map<string, Set<string>>();
  for (const v of data.verifiers) {
    const k = kinds.get(v.kind) ?? { n: 0, guess: false, recorded: 0, checked: 0 };
    k.n += 1; k.guess ||= v.tier === 'guess'; k.recorded += Number(v.state === 'recorded'); k.checked += Number(v.state === 'checked');
    kinds.set(v.kind, k);
    if (['cannot-fail', 'failing', 'broken'].includes(v.state ?? '')) continue;
    for (const id of v.claims) { const key = JSON.stringify([v.kind, layerOf.get(id)]); links.set(key, (links.get(key) ?? new Set()).add(id)); }
  }
  const layers = [...new Set(layerOf.values())];
  const layerVerdict = new Map(layers.map((layer) => [layer, weakest(data.claims.filter((c) => (c.layer ?? 'Claims') === layer).map((c) => c.verdict))!]));
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
 * Can these checks catch a bug? First the result line (the tally of the planted bugs) with a tone
 * for the level, then one card per check that missed its bug or cannot fail, each with one
 * reviewer action and the planted bug collapsed; then the checks that caught their bug, by
 * promise and collapsed; the checks per tier; an example motion, the map and the full table,
 * collapsed. The prose shows no ID: IDs wait in the trailing refs.
 */
export function VerifyTheVerifiers({ data, refs, explain = {} }: WithRefs & { explain?: Explain }) {
  assertTrustMap(data);
  assertRefs(data, refs);
  const report = verifierReport(data, refs, explain);
  const { nodes, edges, legend, verdictOf } = verifierMapFigure(data);
  const flags = new Map<string, Array<{ label: string; tone: string }>>();
  for (const f of data.flags) flags.set(f.subject, [...(flags.get(f.subject) ?? []), { label: f.flag, tone: FLAG_TONE[f.flag] ?? 'warn' }]);
  const columns = [
    { key: 'id', label: 'Verifier', kind: 'id' as const, width: '5.5rem' }, { key: 'kind', label: 'Kind', kind: 'tags' as const, width: '9.5rem' },
    { key: 'state', label: 'State', kind: 'status' as const, width: '8.5rem' }, { key: 'claims', label: 'Claims', kind: 'tags' as const, width: '9rem' }, { key: 'controls', label: 'Controls' },
  ];
  const rows = data.verifiers.map((v) => ({
    id: `verifier-${slug(v.id)}`,
    cells: {
      id: { text: v.id, ...(flags.has(v.id) ? { badges: flags.get(v.id) } : {}) },
      kind: { badges: [{ label: v.kind, glyph: KIND_GLYPH[v.kind] ?? 'rect', stroke: v.tier === 'guess' ? 'dashed' : 'solid' }] },
      state: { text: v.state ?? 'unknown', status: STATE_TONE[v.state ?? ''] ?? 'neutral' },
      claims: { badges: v.claims.map((id) => ({ label: id, tone: TONE[verdictOf.get(id)!] ?? 'neutral' })) },
      controls: data.controls.filter((k) => k.verifier === v.id).map((k) => `${k.id} ${mutationLabel(reader(k.description))}: ${k.result?.status === 'red' ? 'caught the bug' : k.result?.status === 'green' ? 'missed the bug' : k.result?.status ?? 'not run'}`).join('; ') || undefined,
    },
  }));
  const caughtColumns = [{ key: 'check', label: 'Check', width: '14rem' }, { key: 'broke', label: 'What we broke' }, { key: 'result', label: 'Result', kind: 'status' as const, width: '9rem' }, { key: 'ref', label: 'Ref', kind: 'id' as const, width: '7rem' }];
  return (
    <div data-ve-trust="verifiers">
      <p data-ve-result data-ve-tone={report.tone}><StatusPill tone={report.tone}>{report.tone === 'ok' ? 'All caught' : report.tone === 'warn' ? 'Some missed' : 'Some cannot fail'}</StatusPill> <strong>{report.result}</strong></p>
      <p>For each check, we broke the code on purpose and ran the check. A good check fails when the code is wrong.</p>
      {report.weak.length ? (
        <Subsection id="verifiers-weak" title={report.weak.length === 1 ? 'The check that did not catch its bug' : `The ${report.weak.length} checks that did not catch their bug`}>
          {report.weak.map((w) => (
            <article className="ve-weak-check" data-ve-weak-check id={'check-' + slug(w.control.id)} key={w.control.id}>
              <h4>{w.name}</h4>
              <Defs items={[
                ['What we broke', reader(w.broke)],
                ['What happened', w.happened, 'warn'],
                ['Why it matters', <Rich text={w.why} />],
                ['Reviewer action', <span data-ve-action><Rich text={w.action} /></span>, 'warn'],
              ]} />
              <Disclosure meta={w.ids} summary="Show the bug that we planted">
                <div data-ve-lint="skip">
                  <p>{reader(w.control.description)}</p>
                  {controlEdits(refs, w.control)}
                  {w.control.result?.output_tail ? <TerminalBlock content={w.control.result.output_tail} title="Output of the check" /> : null}
                </div>
              </Disclosure>
            </article>
          ))}
        </Subsection>
      ) : null}
      <Subsection id="verifiers-caught" title="Checks that caught their bug">
        {report.byPromise.map(({ promise, rows: caught }) => (
          <Disclosure key={promise.id} summary={`${promise.label}: ${caught.length} ${caught.length === 1 ? 'check' : 'checks'} caught the bug`}>
            <DataTable columns={caughtColumns} density="compact" label={`Checks for ${promise.label} that caught their bug`}
              rows={caught.map((r) => ({ cells: { check: r.name, broke: reader(r.broke), result: { text: 'Caught the bug', status: 'ok' }, ref: { text: r.ids } } }))} />
          </Disclosure>
        ))}
      </Subsection>
      <p data-ve-tiers><strong>The checks per tier:</strong> {report.tiers.map((t) => `${t.label}: ${t.n}`).join(' · ')}</p>
      {(explain.control_walkthroughs ?? []).map((spec, i) => {
        const motion = controlWalkthrough(data, spec);
        const key = [...(['caught', 'missed'] as const).map((o) => ({ label: OUTCOME[o][0], tone: OUTCOME[o][1] })), { label: 'planted bug', glyph: 'oval' }, { label: 'check', glyph: 'rect' }] as LegendItem[];
        return (
          <Disclosure id={'verifiers-controls' + (i ? String(i) : '')} key={i} lazy summary={'See an example: ' + spec.title.charAt(0).toLowerCase() + spec.title.slice(1)}>
            <p>{spec.description}</p>
            <DiagramWalkthrough description={motion.description} edges={motion.edges as unknown as DiagramEdge[]} layout="flow" legend={key} nodes={motion.nodes as unknown as DiagramNode[]} steps={motion.steps as never} title={motion.title} />
          </Disclosure>
        );
      })}
      <Disclosure id="verifiers-map" lazy summary="Show the map from checks to claims">
        <p>Each kind of check, with an arrow to each group of claims that it backs. A group takes the colour and the word of its weakest claim. A group with no check is a Gap, and the box marked no verifier points to it.</p>
        <DiagramCanvas description="Each kind of check and the claim groups it backs, with every claim group shown." edges={edges} layout="flow" legend={legend} nodes={nodes} title="From checks to claims" />
      </Disclosure>
      <Disclosure contains={rows.map((r) => r.id)} id="verifiers-table" summary={`Show all ${data.verifiers.length} checks`}>
        <DataTable columns={columns} label="Verifiers" rows={rows as never} />
      </Disclosure>
    </div>
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
  const { files, core } = refs.derived.unclaimed;
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
    <article className="ve-weak-check" data-ve-unclaimed-file id={`unclaimed-${files.indexOf(f) + 1}`} key={f.path}>
      <h4>{capital(f.role)} <code>{f.file}</code></h4>
      <Defs items={[
        ['What changed', f.change],
        ['Why it is risky', f.risks.length ? capital(f.risks.join(', ')) + '.' : 'Low risk: no risk rule matches it.', f.risks.length ? 'warn' : undefined],
        ...(f.note ? [['Why it matters', <Rich key="n" text={f.note} />] as [ReactNode, ReactNode]] : []),
        ['Action', <span data-ve-action key="a">{f.action.text}{link(f) ? <> <a href={link(f)!}>Read the main change at the PR head</a>.</> : null}</span>, f.action.kind === 'skim' ? undefined : 'warn'],
      ]} />
    </article>
  );
  const summary = !files.length ? 'Each changed source file has a claim.'
    : `${files.length} changed ${files.length === 1 ? 'file has' : 'files have'} no claim. ` + (risky.length ? `${risky.length} of them carry risk. Read ${risky.length === 1 ? 'it' : `these ${risky.length}`} before you approve.` : 'None of them carries risk. Skim them.');
  const more = files.slice(VISIBLE_UNCLAIMED);
  const coreColumns = [{ key: 'file', label: 'File', kind: 'id' as const, width: '18rem' }, { key: 'role', label: 'Role', width: '10rem' }, { key: 'claims', label: 'Claims that cite it', kind: 'number' as const, width: '9rem' }, { key: 'share', label: 'New lines that claims cite' }];
  return (
    <div data-ve-trust="unclaimed">
      <p data-ve-result data-ve-tone={risky.length ? 'warn' : 'ok'}><strong>{summary}</strong></p>
      {files.slice(0, VISIBLE_UNCLAIMED).map(card)}
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
          <DataTable columns={coreColumns} density="compact" label="Core files, covered in part" rows={core.map((f) => ({ cells: {
            file: { text: f.file }, role: f.role, claims: String(f.claims),
            share: f.claims ? `Covered in part by ${f.claims} ${f.claims === 1 ? 'claim' : 'claims'}: ${f.cited} of ${f.total} new lines (${Math.round((100 * f.cited) / Math.max(f.total, 1))}%)` : `No claim cites it: 0 of ${f.total} new lines`,
          } }))} />
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

/** Each word of the map's glossary, then understando's own words. A word in the text shows the same definition. */
export function Glossary({ data }: Data) {
  assertTrustMap(data);
  const entries = glossaryEntries(data);
  return (
    <div data-ve-trust="glossary">
      <p>Each word below has one meaning on this page. In the text, a word with a dotted line shows its meaning when you point to it, focus it or tap it.</p>
      <dl className="ve-definition-list" data-ve-glossary>
        {entries.map((g) => (
          <Fragment key={g.term}>
            <dt data-ve-aliases={(g.aliases ?? []).join('|') || undefined}>{g.term}</dt>
            <dd>{g.meaning}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}


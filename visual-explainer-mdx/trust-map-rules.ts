// The rules of a trust-map explainer, as plain data functions: no JSX, no imports, and only
// erasable TypeScript, so Node runs this file directly (scripts/ve-mdx/trust-map.mjs) and the
// components in trust-map.tsx render from the same rules.
//
// Inputs (the data contract, see plugins/visual-explainer/cards/trust-map.md):
//   trust    trust-map.json, schema_version 1 or 2 (promise -> claim -> check)
//   refs     refs.resolved.json, schema 2: resolved code refs, control patches, the diff and the
//            derived block (scripts/derive.py). Each strength, count, summary and action comes
//            from the derived block; these rules render it and never compute it again.
//   explain  explain.json: diagrams, change areas, unclaimed notes, risks, control walkthroughs

export const TRUST_MAP_SCHEMAS = [1, 2];
export const REFS_SCHEMAS = [2];

export type Verdict = 'Formal' | 'Proven' | 'Backed' | 'Asserted' | 'Gap';
export type Tone = 'ok' | 'info' | 'warn' | 'err' | 'neutral';

export type CodeRefSpec = { path: string; symbol?: string; part?: string; match?: string; context?: number | number[]; start?: number; end?: number; note?: string };
export type ClaimPart = { id: string; text: string; stated?: boolean; invariant?: string };
export type Claim = {
  id: string; name?: string; text: string; verdict?: Verdict; reason?: string; source: string; layer?: string; tier?: number | null; stated?: boolean;
  code?: CodeRefSpec[]; plain?: { what: string; proof: string; warning?: string }; waiver?: { reason: string }; invariant?: string; invariants?: string[];
  /** Schema 2: the ids of the claim's checks (never empty). Schema 1: each verifier that names the claim is one of its checks. */
  checks?: string[];
  /** Schema 2: the old claim ids that this claim joins, and their statements. */
  legacy_ids?: string[]; parts?: ClaimPart[];
};
/** A verifier of kind `none` is a placeholder check: no tool checks the claim. */
export type Verifier = {
  id: string; name?: string; kind: string; claims: string[]; tier: string; description: string; provenance: string; state?: string;
  ladder?: number; at?: string; independence?: { tool?: string }; command?: { argv: string[] }; baseline?: { status?: string; output_tail?: string };
  recorded?: { source: string; result: string }; formal?: { tool: string; artifact: string; conformance: { status: string; source: string; detail?: string } };
  mechanical?: { result?: { status: string; command: string; detail: string } };
};
export type Control = { id: string; name?: string; verifier: string; description: string; edits?: unknown[]; result?: { status?: string; output_tail?: string; note?: string } };
export type Promise_ = { id: string; name?: string; label: string; sentence: string; claims: string[]; reviewer_action?: string };
export type GlossaryEntry = { term: string; meaning: string; aliases?: string[] };
export type TrustMap = {
  schema_version: number; repo: string; pr?: number; title?: string; base: string; head: string;
  claims: Claim[]; verifiers: Verifier[]; controls: Control[]; promises: Promise_[]; flags?: Array<{ flag: string; subject: string; detail: string; loud?: boolean }>;
  summary?: Record<string, number>; glossary?: GlossaryEntry[]; invariants?: Array<{ id: string; text: string; author: string; status: string }>;
};
export type ResolvedRef = { link_only?: boolean; ref: CodeRefSpec; path: string; start: number; end: number; span: [number, number]; language: string; excerpt: string; permalink: string | null; html?: string };
export type ControlEdit = { path: string; language: string; patch?: string; before?: string; after?: string; note?: string; rows?: unknown[] };
/** The values that understando derives once (scripts/derive.py), so the review CLI, the PR body and the page agree. The components render them. */
export type CheckResult = 'none' | 'broken' | 'cannot-fail' | 'missed' | 'no-bug' | 'checked' | 'recorded' | 'caught';
export type DerivedCheck = { id: string; name: string; kind: string; strength: Verdict; result: CheckResult };
/** One claim: its strength (its weakest check), its checks, "5 checks: 4 caught their bug, 1 missed.", and the weakest check with its action. */
export type DerivedClaim = {
  strength: Verdict; tier: number | null; checks: DerivedCheck[]; n: number; counts: Partial<Record<CheckResult, number>>; summary: string;
  weakest: { id: string; name: string; result: CheckResult; strength: Verdict; text: string; action: string } | null;
};
export type DerivedWeak = { check: string; control: string; name: string; broke: string; happened: string; why: string; action: string; ids: string };
/** Can these checks catch a bug? It counts checks, not controls. `broke` holds the full "what we broke" sentence of each control. */
export type DerivedVerify = {
  result: string; other: string; tone: Tone; checks: number; ran: number; caught: number; missed: number; cannot: number; weak: DerivedWeak[];
  by_promise: Array<{ id: string; rows: Array<{ check: string; name: string; claim: string; broke: string[]; ids: string }> }>;
  tiers: Array<{ label: string; n: number }>; broke: Record<string, string>;
};
export type Derived = {
  schema: number; head: string;
  promises: Array<{ id: string; strength: Verdict; claims: string[]; count: number; tally: string }>;
  claims: Record<string, DerivedClaim>;
  verify: DerivedVerify;
  merge: { form: MergeForm; items: MergeItem[]; blockers: number };
  ready: Ready | null;
  unclaimed: { files: UnclaimedFile[]; core: UnclaimedFile[]; summary: { risky: number; rest: number; lead: string; quiet: string } };
  risky_unclaimed: number;
  bugs: Array<{ heading: string; lines: string[]; verified: boolean }>;
};
export type Refs = {
  schema: number; head: string; repo?: string; refs: ResolvedRef[]; controls: Record<string, ControlEdit[]>; derived: Derived;
  diff: {
    files: Record<string, [number, number]>; deleted: string[]; created: string[]; added: Record<string, Array<[number, number]>>;
    /** Per changed code file: the changed symbols, most added lines first, and the ref of the main one. */
    symbols?: Record<string, { names: string[]; main: CodeRefSpec | null }>;
  };
};
export type DiagramGraph = { nodes: Array<{ id: string; label?: string; detail?: string; shape?: string; [k: string]: unknown }>; edges: Array<{ from: string; to: string; label?: string; [k: string]: unknown }>; legend?: unknown[] };
export type DiagramSpec = { title: string; description: string; layout?: string; direction?: string; eli5: DiagramGraph; detailed: DiagramGraph };
export type Area = { id: string; name: string; paths?: string[]; replaced_by?: string; note?: string; rollup?: boolean };
export type Explain = {
  diagrams?: Record<string, DiagramSpec>;
  change?: { areas?: Area[] };
  /** notes: why a file matters; roles: its job in plain words; core: path prefixes of the core files, shown as covered in part. */
  unclaimed?: { notes?: Record<string, string>; roles?: Record<string, string>; core?: string[] };
  risks?: Array<{ claims: string[]; why: string; fix?: string }>;
  control_walkthroughs?: Array<{ title: string; description: string; controls: string[] }>;
  bullets?: string[];
};

export const VERDICTS: Verdict[] = ['Formal', 'Proven', 'Backed', 'Asserted', 'Gap'];
export const STRONG: Verdict[] = ['Formal', 'Proven'];
export const TONE: Record<Verdict, Tone> = { Formal: 'ok', Proven: 'ok', Backed: 'info', Asserted: 'warn', Gap: 'err' };
export const STATE_TONE: Record<string, Tone> = { proven: 'ok', recorded: 'info', checked: 'info', 'cannot-fail': 'err', failing: 'err', broken: 'err' };
export const FLAG_TONE: Record<string, Tone> = { 'cannot-fail': 'err', 'control-missed': 'warn', 'same-family': 'warn' };
export const KIND_GLYPH: Record<string, string> = {
  'type-pin': 'rect', boundary: 'rect', parity: 'rect', golden: 'rect', 'contract-format': 'rect', integration: 'oval', unit: 'oval', e2e: 'oval',
  eval: 'oval', measurement: 'oval', model: 'diamond', property: 'oval', fuzz: 'oval', contract: 'rect', static: 'rect', lean: 'rect', tla: 'rect',
};
export const GLYPH_FAMILY: Record<string, string> = { rect: 'static check', oval: 'run check', diamond: 'model judge' };
export const KIND_LADDER: Record<string, number> = {
  e2e: 1, integration: 1, unit: 1, golden: 1, parity: 1, eval: 1, measurement: 1, property: 2, fuzz: 2,
  'type-pin': 3, contract: 3, 'contract-format': 3, boundary: 3, static: 3, tla: 4, lean: 5,
};
export const LADDER_NAMES: Record<number, string> = {
  1: 'e2e or integration test', 2: 'property or fuzz test', 3: 'types, contracts or static rules', 4: 'model checking', 5: 'proof with conformance',
};
export const TIER_WORD: Record<string, string> = { fact: 'a tool check, run again at the PR head', guess: 'a model judgment' };
export const VISIBLE_UNCLAIMED = 5;
export const MAX_MERGE_ITEMS = 3;

// The one definition of each verdict. The glossary, the legend and every pill tooltip read it.
export const VERDICT_MEANING: Record<Verdict, string> = {
  Formal: 'a proof or a model check backs the claim, a planted bug broke it, and a conformance run ties it to the code.',
  Proven: 'a check backs the claim, and a planted bug proved that the check can fail.',
  Backed: 'evidence backs the claim, but no planted bug proved that the check can fail, or the evidence is a recorded run that we did not run again.',
  Asserted: 'only the PR text says the claim. No check backs it.',
  Gap: 'no check backs the claim, and the PR text does not state it. You decide if it is important.',
};
export type Outcome = 'caught' | 'missed' | 'cannot-fail';
export const OUTCOME: Record<Outcome, [string, Tone, string]> = {
  caught: ['Caught the bug', 'ok', 'the check failed on the planted bug. This is the good result: the check works.'],
  missed: ['Missed the bug', 'warn', 'the check passed on the planted bug. It did not find the bug.'],
  'cannot-fail': ['Cannot fail', 'err', 'the check passed on each planted bug. It checks nothing that the bugs broke, so it backs no claim.'],
};

// understando's own words. The glossary shows them after the words of the map.
export const BUILTIN_GLOSSARY: GlossaryEntry[] = [
  { term: 'PR', meaning: 'pull request: a set of changes that a team reviews before it merges them.' },
  { term: 'Claim', meaning: 'one thing that the PR says is true about its code.' },
  { term: 'Promise', meaning: 'a plain sentence that groups the claims about one property of the PR.' },
  { term: 'Verifier', meaning: 'a check that backs a claim, for example a test, a type check or an eval.', aliases: ['check'] },
  { term: 'Control', meaning: 'a bug that we put in a scratch copy of the code on purpose, to see if a verifier finds it.' },
  ...VERDICTS.map((v) => ({ term: v, meaning: VERDICT_MEANING[v] })),
  { term: 'Tier', meaning: 'the rung of the strongest check that caught a planted bug: 1 an end-to-end test, 2 a property test, 3 a type or contract check, 4 a model check, 5 a proof.' },
  { term: 'Waived', meaning: 'the author chose not to verify the claim, and wrote the reason.' },
  { term: 'Caught the bug', meaning: OUTCOME.caught[2], aliases: ['caught'] },
  { term: 'Missed the bug', meaning: OUTCOME.missed[2], aliases: ['missed'] },
  { term: 'Cannot fail', meaning: OUTCOME['cannot-fail'][2], aliases: ['cannot-fail'] },
  { term: 'ID', meaning: 'a short name, such as C05, for one claim, check or control.' },
];

/** An ID of a claim, verifier or control. Narrative prose shows none outside collapsed detail. */
export const ID_PATTERN = /(?<![\w-])[CVK]\d+[a-z]?(?![\w-])/;

// Reader words: a check "caught the bug" or "missed the bug", never "went red" or "stayed green".
const READER_WORDS: Array<[RegExp, string]> = [
  [/\bwent red on (?:the )?control (\w+)/gi, 'caught the bug of control $1'],
  [/\bwent red on (a|the|each|one|every) (planted )?bug/gi, 'caught $1 $2bug'],
  [/\b(?:went|turned) red\b/gi, 'caught the bug'],
  [/\bgoes red\b/gi, 'catches the bug'],
  [/\b(?:go|turn) red\b/gi, 'catch the bug'],
  [/\b(?:stayed|went|was) green\b/gi, 'missed the bug'],
  [/\bstays green\b/gi, 'misses the bug'],
  [/\bstay green\b/gi, 'miss the bug'],
];
export function reader(text: string): string {
  return READER_WORDS.reduce((out, [pattern, words]) => out.replace(pattern, words), text);
}

export const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
export const claimAnchor = (id: string) => `claim-${slug(id)}`;
export const promiseAnchor = (id: string) => `promise-${slug(id)}`;
export const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
export const firstSentence = (text: string) => text.trim().split(/(?<=[.!?])\s+/)[0];

/** The label of a claim or a verifier: its `name` when the map has one, else its plain sentence. */
export const claimLabel = (c: Claim) => c.name ?? c.plain?.what ?? c.text;

export function weakest(verdicts: Iterable<Verdict | undefined>): Verdict | null {
  const found = [...verdicts].filter((v): v is Verdict => Boolean(v));
  return found.length ? found.reduce((a, b) => (VERDICTS.indexOf(b) > VERDICTS.indexOf(a) ? b : a)) : null;
}
export const ladder = (v: Verifier) => v.ladder ?? KIND_LADDER[v.kind] ?? null;

export type PromiseRow = { promise: Promise_; strength: Verdict; claims: Claim[]; count: number; tally: string };

/** Each promise with its strength (the verdict of its weakest claim), its claims, weakest first, its claim count and tally, as derive.py derived them. */
export function promiseRows(data: TrustMap, refs: Refs): PromiseRow[] {
  const claims = new Map(data.claims.map((c) => [c.id, c]));
  const promises = new Map(data.promises.map((p) => [p.id, p]));
  return refs.derived.promises.map((d) => ({ promise: promises.get(d.id)!, strength: d.strength, claims: d.claims.map((id) => claims.get(id)!), count: d.count, tally: d.tally }));
}

/** The derived values of a claim (scripts/derive.py claim_rows). */
export const derivedClaim = (refs: Refs, id: string): DerivedClaim => refs.derived.claims[id];
/** The strength of a claim: the strength of its weakest check, as derive.py derived it. */
export const strengthOf = (refs: Refs, id: string): Verdict => refs.derived.claims[id].strength;

/** The claim with this id, or the claim that joins this old id (legacy_ids). */
export function claimOf(data: TrustMap, id: string): Claim | undefined {
  return data.claims.find((c) => c.id === id) ?? data.claims.find((c) => c.legacy_ids?.includes(id));
}

/** The section anchors of the promises level, weakest first, for <Section anchors={promiseAnchors(trust, refs)}>. */
export function promiseAnchors(data: TrustMap, refs: Refs) {
  assertRefs(assertTrustMap(data), refs);
  return promiseRows(data, refs).map(({ promise: p }) => ({ id: promiseAnchor(p.id), label: p.label }));
}

/** The first line of a promise: the strongest rung that a planted bug proved, over the derived tiers of its claims. */
export function strongestTier(refs: Refs, claims: Claim[]): string {
  const tiers = claims.map((c) => refs.derived.claims[c.id]?.tier).filter((t): t is number => Boolean(t));
  if (!tiers.length) return 'Strongest check: none. No check of this promise caught a planted bug.';
  const t = Math.max(...tiers);
  return `Strongest check: tier ${t}, ${LADDER_NAMES[t]}.`;
}

export type Ready = { head: string; gates: Array<{ n: number; name: string; pass: boolean; detail: string; items?: string[] }> };
export type MergeForm = 'not-ready' | 'accept' | 'ready';
export type MergeItem = { label: string; text: string; href: string };
export const MERGE_WORDS: Record<MergeForm, [string, Tone, string]> = {
  'not-ready': ['Not ready', 'err', 'Do these first:'],
  accept: ['Ready if you accept', 'warn', 'these risks:'],
  ready: ['Ready', 'ok', 'Each promise is Proven, and no gate fails.'],
};

// ---- Validation: an export fails on bad data -------------------------------------------------

export class TrustMapError extends Error {}

const checked = new WeakMap<object, true>();

/** Throws a TrustMapError that lists each problem. Each component calls it, so a bad map fails the static pre-render of an export. */
export function assertTrustMap(data: TrustMap): TrustMap {
  if (checked.has(data)) return data;
  const errors: string[] = [];
  if (!data || typeof data !== 'object') throw new TrustMapError('trust map: the data is missing; pass data={trust}');
  if (!TRUST_MAP_SCHEMAS.includes(data.schema_version)) errors.push(`schema_version ${data.schema_version} is not supported (supported: ${TRUST_MAP_SCHEMAS.join(', ')})`);
  for (const key of ['claims', 'verifiers', 'controls', 'promises'] as const) if (!Array.isArray(data[key])) errors.push(`${key} must be a list`);
  // The verdict step writes the flags; a map without a verdict run has none.
  if (data.flags !== undefined && !Array.isArray(data.flags)) errors.push('flags must be a list');
  if (errors.length) throw new TrustMapError('trust map is invalid:\n  ' + errors.join('\n  '));
  const claims = new Set(data.claims.map((c) => c.id));
  const member = new Map<string, string[]>();
  for (const p of data.promises) {
    for (const id of p.claims) {
      if (!claims.has(id)) errors.push(`promise ${p.id} names the claim ${id}, which the map does not have`);
      member.set(id, [...(member.get(id) ?? []), p.id]);
    }
    for (const field of ['name', 'label', 'sentence', 'reviewer_action'] as const) {
      const hit = (p[field] ?? '').match(ID_PATTERN);
      if (hit) errors.push(`promise ${p.id}: its ${field} shows the ID ${hit[0]}; a reader sees it without opening anything`);
    }
  }
  for (const c of data.claims) {
    const n = member.get(c.id)?.length ?? 0;
    if (n !== 1) errors.push(`claim ${c.id} is in ${n} promises (${(member.get(c.id) ?? []).join(', ') || 'none'}); it must be in exactly one`);
  }
  const verifiers = new Set(data.verifiers.map((v) => v.id));
  for (const v of data.verifiers) for (const id of v.claims) if (!claims.has(id)) errors.push(`verifier ${v.id} names the claim ${id}, which the map does not have`);
  if (data.schema_version >= 2) {
    const listed = new Set<string>();
    for (const c of data.claims) {
      if (!c.checks?.length) errors.push(`claim ${c.id} lists no checks; each claim of schema 2 lists one or more (a kind none check when no tool checks it)`);
      for (const id of c.checks ?? []) {
        if (!verifiers.has(id)) errors.push(`claim ${c.id} lists the check ${id}, which the map does not have`);
        listed.add(id);
      }
    }
    for (const v of data.verifiers) if (!listed.has(v.id)) errors.push(`verifier ${v.id} is a check of no claim; list it in the checks of a claim, or remove it`);
  }
  const legacy = new Map<string, string>();
  for (const c of data.claims) for (const old of c.legacy_ids ?? []) {
    if (old === c.id) continue;
    if (claims.has(old)) errors.push(`claim ${c.id} lists the legacy id ${old}, which is the id of another claim`);
    else if (legacy.has(old)) errors.push(`claims ${legacy.get(old)} and ${c.id} both list the legacy id ${old}`);
    legacy.set(old, c.id);
  }
  for (const k of data.controls) if (!verifiers.has(k.verifier)) errors.push(`control ${k.id} names the verifier ${k.verifier}, which the map does not have`);
  if (errors.length) throw new TrustMapError('trust map is invalid:\n  ' + errors.join('\n  '));
  checked.set(data, true);
  return data;
}

export function assertRefs(data: TrustMap, refs: Refs): Refs {
  if (!refs || typeof refs !== 'object') throw new TrustMapError('refs: the resolved refs are missing; pass refs={refs} (refs.resolved.json, written by understando explain)');
  if (checked.has(refs)) return refs;
  if (!REFS_SCHEMAS.includes(refs.schema)) throw new TrustMapError(`refs.resolved.json schema ${refs.schema} is not supported (supported: ${REFS_SCHEMAS.join(', ')}); run understando explain again`);
  if (refs.head !== data.head) throw new TrustMapError(`refs.resolved.json is for ${String(refs.head).slice(0, 10)}, the map head is ${data.head.slice(0, 10)}; run understando explain again`);
  const d = refs.derived;
  if (!d || d.head !== data.head) throw new TrustMapError('refs.resolved.json has no derived block for the map head; run understando explain again');
  if (!d.claims || !d.verify) throw new TrustMapError('refs.resolved.json has no derived claims or verify block; run understando explain again');
  const ids = new Set(data.promises.map((p) => p.id));
  if (d.promises.length !== ids.size || d.promises.some((p) => !ids.has(p.id))) throw new TrustMapError('the derived promises do not match the promises of the map; run understando explain again');
  const missing = data.claims.filter((c) => !d.claims[c.id]).map((c) => c.id);
  if (missing.length) throw new TrustMapError(`the derived block has no row for the claims ${missing.join(', ')}; run understando explain again`);
  const promises = new Map(data.promises.map((p) => [p.id, p]));
  const errors = d.promises.filter((p) => !STRONG.includes(p.strength) && !promises.get(p.id)!.reviewer_action).map((p) => `promise ${p.id} is ${p.strength}, so it needs a reviewer_action`);
  if (errors.length) throw new TrustMapError('trust map is invalid:\n  ' + errors.join('\n  '));
  checked.set(refs, true);
  return refs;
}

const refKey = (ref: CodeRefSpec) => JSON.stringify(Object.keys(ref).filter((k) => k !== 'note' && ref[k as keyof CodeRefSpec] !== undefined).sort().map((k) => [k, ref[k as keyof CodeRefSpec]]));

/** The resolved lines of a code ref. A ref that understando did not resolve fails the export. */
export function findRef(refs: Refs, ref: CodeRefSpec): ResolvedRef {
  const key = refKey(ref);
  const hit = refs.refs.find((r) => refKey(r.ref) === key);
  if (!hit) throw new TrustMapError(`code ref ${ref.path}${ref.symbol ? '::' + ref.symbol : ''} is not in refs.resolved.json; run understando explain, which resolves each CodeRef of the MDX`);
  return hit;
}

// ---- Glossary --------------------------------------------------------------------------------

export const isAcronym = (term: string) => /^[0-9]*[A-Z][A-Z0-9]*(?:-[0-9A-Z]+)*$/.test(term);
export const norm = (word: string) => {
  const w = word.toLowerCase();
  return w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
};

/** The full words of an abbreviation: the first clause of its meaning, when it is a short name. */
export function expansion(term: string, meaning: string): string | null {
  if (!isAcronym(term)) return null;
  const head = meaning.split(/[.:;,]/)[0].trim();
  const words = head.split(/\s+/);
  if (!head || words.length > 5 || ['a', 'an', 'the'].includes(words[0].toLowerCase()) || head.toLowerCase() === term.toLowerCase()) return null;
  return head;
}

/** The words of the map first, then understando's own words that the map does not define. */
export function glossaryEntries(data: TrustMap): GlossaryEntry[] {
  const own = data.glossary ?? [];
  const have = new Set(own.map((g) => norm(g.term)));
  const used = new Set(data.claims.map((c) => c.verdict));
  const builtin = BUILTIN_GLOSSARY.filter((g) => !have.has(norm(g.term)) && (g.term !== 'Formal' || used.has('Formal')));
  return [...own, ...builtin].sort((a, b) => a.term.toLowerCase().localeCompare(b.term.toLowerCase()));
}

// ---- The diff --------------------------------------------------------------------------------

const CODE_EXT = new Set(['.py', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '.sh', '.go', '.rs', '.java', '.kt', '.rb', '.swift', '.c', '.h', '.cc', '.cpp', '.cs', '.php', '.scala']);
const ext = (path: string) => { const name = path.split('/').pop() ?? ''; const i = name.lastIndexOf('.'); return i > 0 ? name.slice(i) : ''; };
export function isTest(path: string): boolean {
  const parts = path.split('/');
  const name = parts[parts.length - 1];
  return parts.slice(0, -1).some((p) => ['tests', 'test', '__tests__', 'spec'].includes(p)) || name.startsWith('test_') || /(_test|\.test|\.spec)\.\w+$/.test(name);
}
export const isCode = (path: string) => CODE_EXT.has(ext(path)) && !isTest(path);
export const lines = (n: number, sign: string) => (n ? `${sign}${n.toLocaleString('en-US')}` : '0');

export function diffRoot(refs: Refs): string {
  const code = Object.keys(refs.diff.files).filter(isCode);
  if (code.length < 2) return '';
  let parts = code[0].split('/');
  for (const p of code.slice(1)) {
    const q = p.split('/');
    let i = 0;
    while (i < parts.length && i < q.length && parts[i] === q[i]) i += 1;
    parts = parts.slice(0, i);
  }
  return parts.length ? parts.join('/') + '/' : '';
}
export const shortPath = (root: string, path: string) => (root && path.startsWith(root) ? path.slice(root.length) : path);
const under = (refs: Refs, prefixes: string[]) => Object.keys(refs.diff.files).filter((p) => prefixes.some((x) => p === x || p.startsWith(x.replace(/\/$/, '') + '/')));

/** Each changed file and the area with the longest path prefix that holds it. */
export function areaOwner(areas: Area[], refs: Refs): Map<string, string> {
  const owner = new Map<string, [number, string]>();
  for (const a of areas) for (const prefix of a.paths ?? []) for (const p of under(refs, [prefix])) if (prefix.length > (owner.get(p)?.[0] ?? -1)) owner.set(p, [prefix.length, a.id]);
  return new Map([...owner].map(([p, [, id]]) => [p, id]));
}

export function assertAreas(areas: Area[], refs: Refs) {
  const ids = new Set(areas.map((a) => a.id));
  const errors: string[] = [];
  for (const a of areas) {
    if (a.paths?.length && !under(refs, a.paths).length) errors.push(`change area ${a.id}: no changed file is under ${a.paths.join(', ')}`);
    if (a.replaced_by && !ids.has(a.replaced_by)) errors.push(`change area ${a.id}: replaced_by names ${a.replaced_by}, which is not an area`);
  }
  if (errors.length) throw new TrustMapError('explain.json change areas are invalid:\n  ' + errors.join('\n  '));
}

/** The before-and-after diagram, from the diff: plain area names in the Simple mode, the paths in the Detailed mode. */
export function changeDiagram(areas: Area[], refs: Refs): DiagramSpec {
  const { files, deleted, created } = refs.diff;
  const root = diffRoot(refs);
  if (!areas.length) {
    const gone = deleted.filter(isCode).sort();
    const added = created.filter(isCode).sort();
    const nodes: DiagramGraph['nodes'] = [];
    const edges: DiagramGraph['edges'] = [];
    if (gone.length) nodes.push({ id: 'gone', label: 'Deleted code', detail: `${lines(gone.reduce((s, p) => s + files[p][1], 0), '-')} lines in ${gone.length} files` });
    if (added.length) nodes.push({ id: 'new', label: 'New code', detail: `${lines(added.reduce((s, p) => s + files[p][0], 0), '+')} lines in ${added.length} files` });
    if (gone.length && added.length) edges.push({ from: 'gone', to: 'new', label: 'replaced by' });
    if (!nodes.length) nodes.push({ id: 'edits', label: 'Edits to existing code', detail: `${Object.keys(files).length} files` });
    const detailed = nodes.map((n) => (n.id === 'gone' || n.id === 'new' ? { ...n, label: `${n.label} (${(n.id === 'gone' ? gone : added).slice(0, 3).map((p) => shortPath(root, p)).join(', ')})` } : n));
    return { title: 'Before and after', description: 'The code that the PR deletes and the code that it adds.', eli5: { nodes, edges }, detailed: { nodes: detailed, edges } };
  }
  const owner = areaOwner(areas, refs);
  const nodes: DiagramGraph['nodes'] = [];
  const detailed: DiagramGraph['nodes'] = [];
  const edges: DiagramGraph['edges'] = [];
  for (const a of areas) {
    const own = [...owner].filter(([, id]) => id === a.id).map(([p]) => p);
    const added = own.reduce((s, p) => s + files[p][0], 0);
    const removed = own.reduce((s, p) => s + files[p][1], 0);
    const before = Boolean(a.replaced_by || a.note);
    const node = { id: a.id, label: a.name, ...(a.paths?.length ? { detail: before ? `${lines(removed, '-')} lines` : `${lines(added, '+')} lines` } : { shape: 'oval' }) };
    nodes.push(node);
    const short = (a.paths ?? []).map((p) => shortPath(root, p));
    const label = short.slice(0, 3).join(', ') + (short.length > 3 ? ` and ${short.length - 3} more` : '');
    detailed.push({ ...node, label: label || a.name });
    if (a.replaced_by) edges.push({ from: a.id, to: a.replaced_by, label: 'replaced by' });
  }
  return {
    title: 'Before and after',
    description: 'Each box is a group of changed files, with its line count from the diff. An arrow points from deleted code to the code that replaces it.',
    eli5: { nodes, edges }, detailed: { nodes: detailed, edges },
  };
}

export type ChangeRow = { file: string; removed: number; by: string };
/** The deleted or replaced code, largest first: each deleted code file of 100 lines or more, or one row for a rolled-up area. */
export function replacedRows(areas: Area[], refs: Refs): ChangeRow[] {
  const { files, deleted } = refs.diff;
  const root = diffRoot(refs);
  const byId = new Map(areas.map((a) => [a.id, a]));
  if (!areas.length) return deleted.filter(isCode).map((p) => ({ file: shortPath(root, p), removed: files[p][1], by: 'Not stated' })).sort((a, b) => b.removed - a.removed);
  const owner = areaOwner(areas, refs);
  const rows: ChangeRow[] = [];
  for (const a of areas) {
    if (!a.replaced_by && !a.note) continue;
    const target = a.note || byId.get(a.replaced_by!)!.name;
    const own = [...owner].filter(([, id]) => id === a.id).map(([p]) => p);
    if (a.rollup) {
      rows.push({ file: `${(a.paths ?? []).map((p) => shortPath(root, p)).join(', ')} (${own.length} files)`, removed: own.reduce((s, p) => s + files[p][1], 0), by: target });
      continue;
    }
    rows.push(...own.filter((p) => deleted.includes(p) && isCode(p) && files[p][1] >= 100).sort((x, y) => files[y][1] - files[x][1]).map((p) => ({ file: shortPath(root, p), removed: files[p][1], by: target })));
  }
  return rows.sort((a, b) => b.removed - a.removed);
}

export type UnclaimedAction = { kind: 'read' | 'ask' | 'check' | 'skim'; text: string };
/** A changed file outside the claims, as derive.py derived it: its risks and one action. */
export type UnclaimedFile = {
  path: string; file: string; role: string; change: string; added: number; removed: number; created: boolean;
  risks: string[]; note: string | null; action: UnclaimedAction; main: CodeRefSpec | null; claims: number; cited: number; total: number;
  /** The claims that cover the file, by how: cited by a code ref, named in the text, exercised by a check, edited by a control. */
  by?: { cited: string[]; named: string[]; exercised: string[]; edited: string[] };
};

// ---- Verify the verifiers -----------------------------------------------------------------------

export const controlOutcome = (k: Control, v: Verifier): Outcome => (k.result?.status === 'red' ? 'caught' : v.state === 'cannot-fail' ? 'cannot-fail' : 'missed');

/** What we broke in a control: the full short sentence that derive.py wrote (derived.verify.broke). */
export function brokeOf(refs: Refs, id: string): string {
  const text = refs.derived.verify.broke?.[id];
  if (!text) throw new TrustMapError(`the derived block has no "what we broke" sentence for the control ${id}; run understando explain again`);
  return text;
}

export function controlWalkthrough(data: TrustMap, refs: Refs, spec: { title: string; description: string; controls: string[] }) {
  const controls = new Map(data.controls.map((k) => [k.id, k]));
  const verifiers = new Map(data.verifiers.map((v) => [v.id, v]));
  const nodes: Array<Record<string, string>> = [];
  const edges: Array<Record<string, string>> = [];
  const steps: Array<Record<string, string>> = [];
  const seen = new Set<string>();
  for (const kid of spec.controls) {
    const k = controls.get(kid);
    if (!k) throw new TrustMapError(`explain.json control_walkthroughs names ${kid}, which the map does not have`);
    const v = verifiers.get(k.verifier)!;
    const outcome = controlOutcome(k, v);
    const [word, tone, meaning] = OUTCOME[outcome];
    nodes.push({ id: `plant-${kid}`, label: brokeOf(refs, kid), detail: `control ${kid}`, shape: 'oval' });
    if (!seen.has(v.id)) {
      seen.add(v.id);
      const argv = v.command?.argv ?? [];
      const last = argv[argv.length - 1];
      const target = last && (last.includes('/') || last.includes('.')) ? last : 'the whole project';
      nodes.push({ id: `run-${v.id}`, label: v.independence?.tool ?? v.kind, detail: `${target} (${v.id})` });
    }
    nodes.push({ id: `out-${kid}`, label: word, tone, detail: `control ${kid}` });
    edges.push({ id: `${kid}-run`, from: `plant-${kid}`, to: `run-${v.id}`, label: 'plant, then run' }, { id: `${kid}-out`, from: `run-${v.id}`, to: `out-${kid}`, label: word.toLowerCase() });
    steps.push({ edgeId: `${kid}-run`, caption: `We plant a bug in a scratch copy. ${reader(k.description)} (${kid})` }, { edgeId: `${kid}-out`, caption: `The check ${word.toLowerCase()}. ${capital(meaning)}` });
  }
  return { title: spec.title, description: spec.description, nodes, edges, steps };
}

/** The checks of a claim: `claim.checks` when the map has them, else each verifier that names the claim. */
export function checksOf(data: TrustMap, c: Claim): Verifier[] {
  if (c.checks) return c.checks.map((id) => data.verifiers.find((v) => v.id === id)).filter((v): v is Verifier => Boolean(v));
  return data.verifiers.filter((v) => v.claims.includes(c.id));
}
/** A tool check: each verifier but a kind none placeholder. */
export const isTool = (v: Verifier) => v.kind !== 'none';

// ---- The PR-body section (markdown) ----------------------------------------------------------

function mermaid(data: TrustMap, refs: Refs): string {
  const layers = new Map<string, Record<string, number>>();
  for (const c of data.claims) {
    const layer = c.layer ?? 'Claims';
    if (!layers.has(layer)) layers.set(layer, Object.fromEntries(VERDICTS.map((v) => [v, 0])));
    layers.get(layer)![strengthOf(refs, c.id)] += 1;
  }
  const out = ['```mermaid', 'flowchart LR'];
  [...layers].forEach(([layer, counts], i) => {
    out.push(`  L${i}["${layer}"]`);
    for (const v of VERDICTS) if (counts[v]) out.push(`  L${i} -->|${counts[v]}| ${v}`);
  });
  for (const v of VERDICTS) out.push(`  ${v}(["${v}"])`);
  out.push('  classDef proven fill:#d7f0dd,stroke:#2f7d46', '  classDef gap fill:#fbe0dc,stroke:#b3402f', '  class Proven proven', '  class Gap gap', '```');
  return out.join('\n');
}

/** The trust-map section of the PR body: the same merge answer, promises and verdicts as the page. */
export function prSection(data: TrustMap, refs: Refs, explain: Explain = {}, explainerUrl?: string | null): string {
  assertTrustMap(data);
  assertRefs(data, refs);
  let ready: Ready | null;
  const { form, items } = refs.derived.merge;
  ready = refs.derived.ready;
  const [word, , lead] = MERGE_WORDS[form];
  const link = (i: MergeItem) => (explainerUrl ? `[${i.label}](${explainerUrl}${i.href})` : `**${i.label}**`);
  const out = ['## Trust map', ''];
  if (!items.length) out.push(`**Merge verdict: ${word}.** ${lead}`);
  else {
    out.push(`**Merge verdict: ${word}.** ${capital(lead)}`, '');
    items.slice(0, MAX_MERGE_ITEMS).forEach((i, n) => out.push(`${n + 1}. ${link(i)}. ${reader(i.text)}`));
    const rest = items.slice(MAX_MERGE_ITEMS);
    if (rest.length) out.push('', `And ${rest.length} more: ${rest.map(link).join(', ')}.`);
  }
  out.push('');
  if (ready) {
    out.push('### Ready checklist', '');
    for (const g of ready.gates) out.push(`- [${g.pass ? 'x' : ' '}] **Gate ${g.n}, ${g.name}:** ${g.pass ? 'pass' : 'fail'}. ${g.detail}`);
    out.push('');
  }
  out.push(mermaid(data, refs), '', '| Claim | Strength | Checks | Weakest check |', '|---|---|---|---|');
  const esc = (t: string) => t.replaceAll('|', '\\|');
  for (const c of data.claims) {
    const d = derivedClaim(refs, c.id);
    const first = c.code?.[0];
    const permalink = first ? findRef(refs, first).permalink : null;
    const id = permalink ? `[${c.id}](${permalink})` : c.id;
    const strength = `**${d.strength}**` + (c.waiver ? ` (waived: ${esc(c.waiver.reason)})` : '');
    const weak = d.weakest ? `${capital(d.weakest.name)}. ${d.weakest.action}` : '-';
    out.push(`| ${id}: ${esc(capital(claimLabel(c)))} | ${strength} | ${esc(d.summary)} | ${esc(weak)} |`);
  }
  out.push('');
  if (data.summary) out.push('- **Verdicts:** ' + VERDICTS.map((v) => `${data.summary![v] ?? 0} ${v}`).join(', ') + '.');
  out.push('- **Promises:** ' + promiseRows(data, refs).map(({ promise: p, strength, claims, count, tally }) => {
    const t = strongestTier(refs, claims);
    return `${p.label}: ${strength}. Its ${count} ${count === 1 ? 'claim' : 'claims'}: ${tally}. ${t}`;
  }).join(' '));
  const waived = data.claims.filter((c) => c.waiver);
  if (waived.length) out.push('- **Waived:** ' + waived.map((c) => `${c.id}: ${c.waiver!.reason}`).join(' '));
  const loud = (data.flags ?? []).filter((f) => f.loud);
  const dead = loud.filter((f) => f.flag === 'cannot-fail').map((f) => reader(f.detail));
  out.push('- **Cannot fail:** ' + (dead.length ? dead.join(' ') : 'none.'));
  for (const f of loud) if (f.flag !== 'cannot-fail') out.push(`- **${f.flag}:** ${reader(f.detail)}`);
  out.push(`- **Checks:** ${refs.derived.verify.result}${refs.derived.verify.other ? ' ' + refs.derived.verify.other : ''} The planted bugs ran in scratch worktrees. Cost: $0, with no model call.`);
  for (const b of explain.bullets ?? []) out.push(`- ${b}`);
  if (explainerUrl) out.push(`- **Explainer:** ${explainerUrl}`);
  return out.join('\n') + '\n';
}

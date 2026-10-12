// The rules of a verification explainer, as plain data functions: no JSX, no imports, and only
// erasable TypeScript. The components in trust-map.tsx and verification.tsx render from them.
//
// Inputs (the data contract, see plugins/visual-explainer/cards/trust-map.md):
//   trust    trust-map.json, schema_version 1 or 2: invariants, claims, checks (verifiers) and
//            planted-bug controls; promises (groups of claims) are optional
//   refs     refs.resolved.json, schema 2: resolved code refs, control patches, the diff and the
//            derived results (scripts/derive.py). Each strength, count, summary and action comes
//            from the derived block; these rules render it and never compute it again.
//   explain  explain.json: diagrams, risks, control walkthroughs

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
  ladder?: number; at?: string; independence?: { tool?: string }; command?: { argv: string[]; cwd?: string }; baseline?: { status?: string; output_tail?: string };
  recorded?: { source: string; result: string }; formal?: { tool: string; artifact: string; conformance: { status: string; source: string; detail?: string } };
  mechanical?: { result?: { status: string; command: string; detail: string } };
  /** A browser e2e run: the recorded video, its screenshots, captions and a text summary. */
  artifact?: { video?: string; screenshots?: string[]; captions?: string; summary?: string };
};
export type Control = { id: string; name?: string; verifier: string; description: string; edits?: unknown[]; result?: { status?: string; output_tail?: string; note?: string } };
export type Promise_ = { id: string; name?: string; label: string; sentence: string; claims: string[] };
export type GlossaryEntry = { term: string; meaning: string; aliases?: string[] };
export type TrustMap = {
  schema_version: number; repo: string; pr?: number; title?: string; base: string; head: string;
  claims: Claim[]; verifiers: Verifier[]; controls: Control[]; promises?: Promise_[]; flags?: Array<{ flag: string; subject: string; detail: string; loud?: boolean }>;
  summary?: Record<string, number>; glossary?: GlossaryEntry[]; invariants?: Array<{ id: string; text: string; author: string; status: string }>;
};
/**
 * The diff status of the lines of an excerpt, from `git diff base..head`: the head lines that the PR
 * adds, the head lines that replace removed lines, and the removed base lines (each shows before the
 * head line `at`). The export adds `html` to each removed line.
 */
export type LineChanges = { added: number[]; modified: number[]; removed: Array<{ at: number; base: number; text: string; html?: string }> };
export type ResolvedRef = { link_only?: boolean; ref: CodeRefSpec; path: string; start: number; end: number; span: [number, number]; language: string; excerpt: string; permalink: string | null; html?: string; changes?: LineChanges };
export type ControlEdit = { path: string; language: string; patch?: string; before?: string; after?: string; note?: string; rows?: unknown[] };
/** The values that understando derives once (scripts/derive.py), so its CLI and the page agree. The components render them. */
export type CheckResult = 'none' | 'broken' | 'cannot-fail' | 'missed' | 'no-bug' | 'checked' | 'recorded' | 'caught';
export type DerivedCheck = { id: string; name: string; kind: string; strength: Verdict; result: CheckResult };
/** The evidence bar of a claim: what its surface (frontend, backend, llm, other) needs, and whether each part meets it. */
export type DerivedBar = { surface: string; surfaces: string[]; mixed: boolean; risky: boolean; level: string; need: string; met: boolean; why: string; part: string | null; text: string };
/**
 * One claim: its strength (its weakest part; a part is as strong as its strongest check), its checks,
 * "5 checks: 4 caught their bug, 1 missed.", the evidence of its weakest part with its action, the
 * flagged checks (a warning, not a score), its parts, and its evidence bar.
 */
export type DerivedClaim = {
  strength: Verdict; tier: number | null; checks: DerivedCheck[]; n: number; counts: Partial<Record<CheckResult, number>>; summary: string;
  weakest: { id: string; name: string; result: CheckResult; strength: Verdict; text: string; action: string; part?: string | null } | null;
  flagged?: { text: string; checks: string[]; action: string } | null;
  parts?: Array<{ id: string; text: string; strength: Verdict; check: string | null }>;
  bar?: DerivedBar;
};
/** A check that missed its planted bug or cannot fail. `caught_by` names another check that caught the same planted bug: one bug, two results. */
export type DerivedWeak = {
  check: string; control: string; name: string; broke: string; happened: string; why: string; action: string; ids: string;
  claims?: string[]; caught_by?: { check: string; name: string; control: string; missed: string } | null;
};
/** Can these checks catch a bug? It counts checks, not controls. `broke` holds the full "what we broke" sentence of each control. */
export type DerivedVerify = {
  result: string; other: string; tone: Tone; checks: number; ran: number; caught: number; missed: number; cannot: number; weak: DerivedWeak[];
  by_promise?: Array<{ id: string; rows: Array<{ check: string; name: string; claim: string; broke: string[]; ids: string }> }>;
  tiers?: Array<{ label: string; n: number }>; broke: Record<string, string>;
  /** Degraded variants for evals: the real score against the degraded score, or a flag when no degraded run exists. */
  evals?: Array<{ check: string; name: string; claim: string; real: string; degraded: { variant: string; score: number; baseline: number } | null; flagged: boolean; text: string; action: string }>;
  /** Broken-UI runs for frontend claims, with the recorded video. */
  ui?: Array<{ check: string; name: string; claim: string; video?: string | null; poster?: string | null; screenshots: string[]; captions?: string | null; summary: string; caught: boolean; text: string }>;
};
/** The evidence bars of the whole change (references/evidence-bars.md in understando). */
export type DerivedBars = { met: number; total: number; risky_below: string[]; risky_below_names: string[]; summary: string; story: string[] };
/**
 * The minimal derived block: `head`, `claims` (the result of each claim) and `verify` (can the
 * checks catch a bug). `promises` is there when the map has promises; the rest is optional.
 */
export type Derived = {
  schema: number; head: string;
  promises?: Array<{ id: string; strength: Verdict; claims: string[]; count: number; tally: string; bars_met?: number }>;
  bars?: DerivedBars;
  claims: Record<string, DerivedClaim>;
  verify: DerivedVerify;
  /** Each check: its result, the claims and parts that it backs, and the test that it runs. */
  checks?: Record<string, DerivedCheckRow>;
  /** The changed test files as the checks they provide, and the changed tests that back no claim. */
  tests?: { orphan_tests: number; summary: string; action: string };
};
export type DerivedCheckRow = {
  id: string; name: string; kind: string; result: CheckResult; claims: Array<{ id: string; name: string; parts: string[] }>;
  tests: Array<{ path: string; file: string; symbol: string | null }>; controls: string[]; ref: CodeRefSpec | null;
};
export type Refs = {
  schema: number; head: string; repo?: string; refs: ResolvedRef[]; controls: Record<string, ControlEdit[]>; derived: Derived;
  /** The diff of the change, for the line marks of a code ref. Without it, a ref shows its lines with no marks. */
  diff?: {
    files: Record<string, [number, number]>; deleted: string[]; created: string[]; added: Record<string, Array<[number, number]>>;
    /** Per changed code file: the changed symbols, most added lines first, and the ref of the main one. */
    symbols?: Record<string, { names: string[]; main: CodeRefSpec | null }>;
  };
};
export type DiagramGraph = { nodes: Array<{ id: string; label?: string; detail?: string; shape?: string; [k: string]: unknown }>; edges: Array<{ from: string; to: string; label?: string; [k: string]: unknown }>; legend?: unknown[] };
/** `modes: 'independent'` is a per-PR layout hint: each mode gets its own grid, so the Simple mode has no dead space. */
export type DiagramSpec = { title: string; description: string; layout?: string; direction?: string; modes?: 'shared' | 'independent'; eli5: DiagramGraph; detailed: DiagramGraph };
/** The agent's part, in strict STE: the diagrams (architecture and typed), why a claim is weak and its cheapest fix, and walkthroughs of planted bugs. */
export type Explain = {
  diagrams?: Record<string, DiagramSpec>;
  risks?: Array<{ claims: string[]; why: string; fix?: string }>;
  control_walkthroughs?: Array<{ title: string; description: string; controls: string[] }>;
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
// The kind of the strongest check, in reader words: never a tier number.
export const LADDER_NAMES: Record<number, string> = {
  1: 'an end-to-end or integration test', 2: 'a property or fuzz test', 3: 'types, contracts or static rules', 4: 'a model check that matches the code', 5: 'a proof that matches the code',
};
export const TIER_WORD: Record<string, string> = { fact: 'a tool check, run again at the PR head', guess: 'a model judgment' };

// The one definition of each verdict. The glossary, the legend and every pill tooltip read it.
export const VERDICT_MEANING: Record<Verdict, string> = {
  Formal: 'a proof or a model check backs the claim, and a planted bug broke it. A conformance run ties the proof or the model to the code.',
  Proven: 'a check backs the claim, and a planted bug proved that the check can fail.',
  Backed: 'evidence backs the claim, but no planted bug proved that its check can fail. A recorded run that we did not run again is Backed too.',
  Asserted: 'only the PR text says the claim. No check backs it.',
  Gap: 'no check backs the claim, and the PR text does not state it.',
};
export type Outcome = 'caught' | 'missed' | 'cannot-fail';
export const OUTCOME: Record<Outcome, [string, Tone, string]> = {
  caught: ['Caught the bug', 'ok', 'the check failed on the planted bug, so it can find that bug.'],
  missed: ['Missed the bug', 'warn', 'the check passed on the planted bug. It did not find the bug.'],
  'cannot-fail': ['Cannot fail', 'err', 'the check passed on each planted bug. It checks nothing that the bugs broke, so it backs no claim.'],
};

// understando's own words. The glossary shows them after the words of the map.
export const BUILTIN_GLOSSARY: GlossaryEntry[] = [
  { term: 'Surface', meaning: 'the kind of work that a claim is about: frontend, backend, LLM or other. The surface sets the evidence bar.' },
  { term: 'Bar', meaning: 'the evidence that a claim needs for its surface. Frontend work needs a browser video, and LLM work needs an eval with a degraded variant. Risky backend code needs a proof.', aliases: ['evidence bar'] },
  { term: 'Met', meaning: 'each part of the claim has the evidence that its bar needs.' },
  { term: 'Below the bar', meaning: 'a part of the claim does not have the evidence that its bar needs. A risky claim below its bar needs more evidence before you rely on it.' },
  { term: 'Degraded variant', meaning: 'a planted-worse version of an eval run, for example a prompt without one of its rules. It must score worse, to show that the eval can fail.' },
  { term: 'Recorded run', meaning: 'a run of a check that we did not run again, for example an eval. Its record and its source show the result.' },
  { term: 'UI', meaning: 'user interface: the screens and controls that a person uses.' },
  { term: 'LLM', meaning: 'large language model: a model that writes or grades text, for example a judge or a generator.' },
  { term: 'PR', meaning: 'pull request: a set of changes that a team reviews before it merges them.' },
  { term: 'Claim', meaning: 'one thing that the PR says is true about its code.' },
  { term: 'Promise', meaning: 'a plain sentence that groups the claims about one property of the PR.' },
  { term: 'Verifier', meaning: 'a check that backs a claim, for example a test, a type check or an eval.', aliases: ['check'] },
  { term: 'Control', meaning: 'a bug that we put in a scratch copy of the code on purpose, to see if a verifier finds it.' },
  ...VERDICTS.map((v) => ({ term: v, meaning: VERDICT_MEANING[v] })),
  { term: 'Tier', meaning: 'the kind of the strongest check that caught a planted bug. From weakest to strongest: an end-to-end test, a property test, a type or contract check, a model check, a proof that matches the code.' },
  { term: 'Waived', meaning: 'the author chose not to check the claim, and wrote the reason.' },
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

/** Each promise with its strength (the verdict of its weakest claim), its claims, weakest first, its claim count and tally, as derive.py derived them. None when the map has no promises. */
export function promiseRows(data: TrustMap, refs: Refs): PromiseRow[] {
  const claims = new Map(data.claims.map((c) => [c.id, c]));
  const promises = new Map((data.promises ?? []).map((p) => [p.id, p]));
  return (refs.derived.promises ?? []).map((d) => ({ promise: promises.get(d.id)!, strength: d.strength, claims: d.claims.map((id) => claims.get(id)!), count: d.count, tally: d.tally }));
}

export type ClaimGroup = { promise: Promise_ | null; strength: Verdict | null; claims: Claim[] };

/** The claims by promise, weakest first; a map with no promises gives one group of every claim, weakest first. */
export function claimGroups(data: TrustMap, refs: Refs): ClaimGroup[] {
  const rows = promiseRows(data, refs);
  if (rows.length) return rows.map(({ promise, strength, claims }) => ({ promise, strength, claims }));
  const rank = (c: Claim) => VERDICTS.indexOf(strengthOf(refs, c.id));
  return [{ promise: null, strength: null, claims: [...data.claims].sort((a, b) => rank(b) - rank(a)) }];
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
  return `Strongest check: ${LADDER_NAMES[Math.max(...tiers)]}.`;
}

/** True when `fix` says what `action` says already, so a page shows the action once. */
export function repeats(action: string | undefined, fix: string | undefined): boolean {
  const flat = (t?: string) => (t ?? '').replace(/`/g, '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/[.]+$/, '');
  const a = flat(action);
  const f = flat(fix);
  return Boolean(f) && (a === f || a.includes(f) || f.includes(a));
}

// ---- Validation: an export fails on bad data -------------------------------------------------

export class TrustMapError extends Error {}

const checked = new WeakMap<object, true>();

/** Throws a TrustMapError that lists each problem. Each component calls it, so a bad map fails the static pre-render of an export. */
export function assertTrustMap(data: TrustMap): TrustMap {
  if (checked.has(data)) return data;
  const errors: string[] = [];
  if (!data || typeof data !== 'object') throw new TrustMapError('trust map: the data is missing; pass data={trust}');
  if (!TRUST_MAP_SCHEMAS.includes(data.schema_version)) errors.push(`schema_version ${data.schema_version} is not supported (supported: ${TRUST_MAP_SCHEMAS.join(', ')})`);
  for (const key of ['claims', 'verifiers', 'controls'] as const) if (!Array.isArray(data[key])) errors.push(`${key} must be a list`);
  // Promises group the claims; a map without them is valid.
  if (data.promises !== undefined && !Array.isArray(data.promises)) errors.push('promises must be a list');
  if (data.invariants !== undefined && !Array.isArray(data.invariants)) errors.push('invariants must be a list');
  // The verdict step writes the flags; a map without a verdict run has none.
  if (data.flags !== undefined && !Array.isArray(data.flags)) errors.push('flags must be a list');
  if (errors.length) throw new TrustMapError('trust map is invalid:\n  ' + errors.join('\n  '));
  const claims = new Set(data.claims.map((c) => c.id));
  const member = new Map<string, string[]>();
  const promises = data.promises ?? [];
  for (const p of promises) {
    for (const id of p.claims) {
      if (!claims.has(id)) errors.push(`promise ${p.id} names the claim ${id}, which the map does not have`);
      member.set(id, [...(member.get(id) ?? []), p.id]);
    }
    for (const field of ['name', 'label', 'sentence'] as const) {
      const hit = (p[field] ?? '').match(ID_PATTERN);
      if (hit) errors.push(`promise ${p.id}: its ${field} shows the ID ${hit[0]}; a reader sees it without opening anything`);
    }
  }
  for (const c of promises.length ? data.claims : []) {
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
  const ids = new Set((data.promises ?? []).map((p) => p.id));
  const derived = d.promises ?? [];
  if (derived.length !== ids.size || derived.some((p) => !ids.has(p.id))) throw new TrustMapError('the derived promises do not match the promises of the map; run understando explain again');
  const missing = data.claims.filter((c) => !d.claims[c.id]).map((c) => c.id);
  if (missing.length) throw new TrustMapError(`the derived block has no row for the claims ${missing.join(', ')}; run understando explain again`);
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

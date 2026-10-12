// The verification explainer: the components that explain how the claims of a change are checked.
// The narrative stays MDX that an agent writes; these components drop in the parts that come from
// data. Each value comes from understando's export (trust-map.json and refs.resolved.json, with
// the derived results of scripts/derive.py); the page renders it and never computes it again.
// The card plugins/visual-explainer/cards/trust-map.md holds the data contract.
import { Disclosure, Subsection } from './content-blocks';
import { StatusPill, ToneMark } from './data-table';
import { BarCard, BrowserVideo, ClaimDetail, ClaimRow, controlEdits, CountMarks, MarkKey, Rich, useTerms, VerdictLegend, VerdictPill } from './trust-map';
import { ExamplesFor } from './worked-example';
import {
  assertRefs, assertTrustMap, capital, claimAnchor, claimGroups, claimLabel, derivedClaim, promiseAnchor, promiseRows, slug, STRONG, strengthOf, TONE,
  type CheckResult, type Claim, type DerivedWeak, type Explain, type Refs, type TrustMap,
} from './trust-map-rules';
import './verification.css';

type WithRefs = { data: TrustMap; refs: Refs };

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

// ---- How to read the evidence ------------------------------------------------------------------------

const RESULT_WORDS = {
  caught: 'caught its planted bug', missed: 'missed its planted bug', 'cannot-fail': 'cannot fail: it passed on each planted bug', broken: 'fails at the head',
  'no-bug': 'no planted bug ran', recorded: 'a record of a past run', checked: 'a mechanical check', none: 'no tool checks it',
} satisfies Record<CheckResult, string>;

/** The weak check with a second check that caught the same planted bug: one bug, two results. */
const pairOf = (refs: Refs): DerivedWeak | undefined => refs.derived.verify.weak.find((w) => w.caught_by);

/**
 * How to read the evidence, worked on this change: a promise rests on claims (and their parts), a
 * claim on checks; a claim's surface sets its bar, and the bar is met or not; one planted bug can
 * give two results; then whether the checks can catch a bug at all, and the key of the marks. A
 * part shows only when its data is there: promises, bars, a pair of checks on one planted bug.
 * `checks` is the anchor of the claims and their checks (VerifierView), for a link at the end.
 */
export function EvidenceGuide({ data, refs, checks }: WithRefs & { checks?: string }) {
  assertRefs(assertTrustMap(data), refs);
  const terms = useTerms(data);
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
  // Evals with the same finding and action show as one line: "The note agent eval and the non-inferiority eval".
  const evals: Array<{ checks: string[]; names: string[]; claim: string; text: string; action?: string | null; flagged?: boolean }> = [];
  for (const e of verify.evals ?? []) {
    const same = evals.find((x) => x.claim === e.claim && x.text === e.text && x.action === e.action);
    if (same) { same.checks.push(e.check); same.names.push(e.name); } else evals.push({ checks: [e.check], names: [e.name], claim: e.claim, text: e.text, action: e.action, flagged: e.flagged });
  }
  return (
    <div data-ve-trust="evidence">
      {first && weakestClaim && wd ? (
        <Subsection id="evidence-promise" title="A promise rests on its claims, and a claim on its checks">
          <p><Rich terms={terms} text={`Take the promise "${first.promise.label}". Its ${first.count} ${first.count === 1 ? 'claim' : 'claims'}: ${first.tally}. Its weakest claim is ${first.strength}, so the promise is ${first.strength}.`} /></p>
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
              <p>For the whole change: {refs.derived.bars.summary}</p>
              <ul className="ve-bar-lines">{refs.derived.bars.story.filter((l) => /^\d+ of \d+/.test(l)).map((line, n) => {
                const m = /^(\d+) of (\d+)/.exec(line)!;
                return <li data-ve-bar-line="count" key={n}><CountMarks label={line} runs={[{ n: Number(m[1]), tone: 'ok', label: 'meets its bar' }, { n: Number(m[2]) - Number(m[1]), tone: 'warn', label: 'below its bar', hollow: true }]} /><span><Rich terms={terms} text={line} /></span></li>;
              })}</ul>
            </div>
          ) : null}
        </Subsection>
      ) : null}
      {pair && pair.caught_by ? (
        <Subsection id="evidence-one-bug" title="One bug, two results">
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
            <div className="ve-result-card" data-ve-tone="ok"><p className="ve-result-card-state"><ToneMark tone="ok" /> Caught the bug</p><p><strong>{capital(pair.caught_by.name)}</strong></p><p>It failed on the bug.</p></div>
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
            <dd data-ve-planted>We change one line of the code, for example a condition or a type, and run the check again.</dd>
            <dt>Degraded variants for evals (LLM)</dt>
            <dd>
              {evals.length ? (
                <ul data-ve-evals>{evals.map((e) => (
                  <li data-ve-eval={e.flagged ? 'flagged' : 'degraded'} key={e.checks.join()}><strong>{capital(e.names.join(' and '))}</strong> ({e.claim}): <Rich text={e.text} />{e.action ? <> <span data-ve-action><Rich text={e.action} /></span></> : null}</li>
                ))}</ul>
              ) : <span>No eval backs a claim of this change.</span>}
            </dd>
            <dt>Broken-UI runs (frontend)</dt>
            <dd>
              {verify.ui?.length ? (
                <ul data-ve-ui>{verify.ui.map((u) => (
                  <li key={u.check}><strong>{capital(u.name)}</strong> ({u.claim}): {u.text}
                    {u.video ? <BrowserVideo artifact={{ video: u.video, screenshots: u.screenshots, captions: u.captions ?? undefined, summary: u.summary }} name={u.name} /> : null}</li>
                ))}</ul>
              ) : <span>No frontend claim in this change.</span>}
            </dd>
          </dl>
          {checks ? <p><a href={checks}>See every claim and its checks</a></p> : null}
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

// ---- The claims and their checks ----------------------------------------------------------------

/**
 * The claims and the checks that back them. First how many changed tests back no claim, when the
 * refs hold that count. Then each claim, by promise when the map has promises (weakest first), as
 * its one full detail on the page: its worked examples, its code, each check with its result, its
 * planted bugs as diffs and the conformance link of a formal check. A test shows through what it
 * verifies, never as a list of test names.
 */
export function VerifierView({ data, refs, explain = {} }: WithRefs & { explain?: Explain }) {
  assertRefs(assertTrustMap(data), refs);
  const terms = useTerms(data);
  const tests = refs.derived.tests;
  return (
    <div data-ve-trust="checks">
      {tests ? (
        tests.orphan_tests ? (
          <div className="ve-orphans" data-ve-orphans>
            <p><strong data-ve-orphan-count>{tests.summary}</strong> <span data-ve-action>{tests.action}</span></p>
          </div>
        ) : <p className="ve-quiet">{tests.summary}</p>
      ) : null}
      {claimGroups(data, refs).map(({ promise: p, strength, claims }) => (
        <section className="ve-checks-promise" data-ve-checks-promise={p ? slug(p.id) : 'claims'} key={p?.id ?? 'claims'}>
          {p && strength ? (
            <>
              <h3 className="ve-subsection-title" id={promiseAnchor(p.id)}><VerdictPill verdict={strength} /> {p.label}</h3>
              <p className="ve-promise-sentence"><Rich terms={terms} text={p.sentence} /></p>
            </>
          ) : null}
          <div className="ve-claim-details">
            {claims.map((c) => <ClaimDetail claim={c} data={data} explain={explain} key={c.id} lead={<ExamplesFor claims={[c.id]} refs={refs} />} refs={refs} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

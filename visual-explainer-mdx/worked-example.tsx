// A worked example: one run of real data through the flow that a chapter explains. Each value
// comes from a synthetic source that understando read (scripts/example.py: a scripted test, a TLC
// trace, a replay vector, a control run, a claim of the map) and sits in refs.resolved.json
// `examples`. The page shows the values; it never makes one. Each step names its source pointers,
// so a reviewer can run the source again and compare.
import { Fragment, useEffect, useRef, useState } from 'react';
import { DiffBlock } from './code-blocks';
import { Disclosure } from './content-blocks';
import { maybeRef } from './trust-map';
import { TrustMapError, type CodeRefSpec, type Explain, type Refs } from './trust-map-rules';
import './worked-example.css';

export type ExampleValue = { label: string; value: unknown; from: string };
export type ExampleStep = {
  n: number; station?: string | null; name: string; reason: string;
  in: ExampleValue[]; decision: ExampleValue[]; out: ExampleValue[];
  diff?: { path: string; before?: string; after?: string; patch?: string; from: string[] };
  code?: CodeRefSpec; provenance: string[];
};
export type ExampleSource = { kind: string; commit: string; sha256: string; argv?: string[]; cwd?: string; path?: string; spec?: string; cfg?: string; ids?: string[]; id?: string; index?: number; [k: string]: unknown };
export type WorkedExampleData = { id: string; title: string; lead?: string | null; diagram?: string | null; claims?: string[]; sources: Record<string, ExampleSource>; steps: ExampleStep[] };

// SAFETY: understando explain copies `examples` from scripts/example.py into refs.resolved.json;
// exampleOf and assertExample check each example before the page shows it.
const examplesOf = (refs: Refs) => ((refs as Refs & { examples?: WorkedExampleData[] }).examples ?? []);

/** The example `id` of refs.resolved.json, checked: each step names its source pointers, and each value names its pointer. */
export function exampleOf(refs: Refs, id: string): WorkedExampleData {
  const ex = examplesOf(refs).find((e) => e.id === id);
  if (!ex) throw new TrustMapError(`refs.resolved.json has no example "${id}"; write it in examples.spec.json and run understando's scripts/example.py, then understando explain`);
  assertExample(ex);
  return ex;
}

export function assertExample(ex: WorkedExampleData) {
  if (!ex.sources || !Object.keys(ex.sources).length) throw new TrustMapError(`the example "${ex.id}" has no source`);
  for (const [name, s] of Object.entries(ex.sources)) {
    if (!s.kind || !s.commit || !s.sha256) throw new TrustMapError(`the example "${ex.id}": source ${name} has no kind, commit or sha256; run scripts/example.py again`);
  }
  if (!ex.steps?.length) throw new TrustMapError(`the example "${ex.id}" has no step`);
  for (const st of ex.steps) {
    if (!st.provenance?.length) throw new TrustMapError(`the example "${ex.id}", step ${st.n} (${st.name}): no provenance. Each step shows values from a source, with the pointer of each one.`);
    for (const v of [...st.in, ...st.decision, ...st.out]) {
      const [source] = String(v.from ?? '').split(':');
      if (!v.from || !ex.sources[source]) throw new TrustMapError(`the example "${ex.id}", step ${st.n}: the value "${v.label}" names no source`);
    }
  }
}

/** A value as one line of text: a string as it is, anything else as compact JSON. */
function show(value: unknown): string {
  if (typeof value === 'string') return value.replace(/\n$/, '');
  return JSON.stringify(value);
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const cell = (v: unknown) => (v === null || v === undefined ? '' : show(v));

/**
 * A value as the source holds it. A list of records is a table (an empty cell: the record has no
 * such key); one record is its keys and values; a list of plain values is one code span each; a
 * long or multi-line text is a block.
 */
function ValueView({ value }: { value: unknown }) {
  if (Array.isArray(value) && value.length && value.every(isRecord)) {
    const keys = [...new Set(value.flatMap((r) => Object.keys(r)))].filter((k) => value.some((r) => r[k] !== null && r[k] !== undefined));
    return (
      <div className="ve-example-table-wrap">
        <table className="ve-example-table">
          <thead><tr>{keys.map((k) => <th key={k} scope="col">{k}</th>)}</tr></thead>
          <tbody>{value.map((r, i) => <tr key={i}>{keys.map((k) => <td key={k}>{cell(r[k]) ? <code>{cell(r[k])}</code> : null}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
  if (isRecord(value)) {
    return (
      <span className="ve-example-record">
        {Object.entries(value).map(([k, v]) => <span key={k}><span className="ve-example-key">{k}</span> <code>{show(v)}</code></span>)}
      </span>
    );
  }
  if (Array.isArray(value) && value.length && value.every((v) => !isRecord(v) && !Array.isArray(v))) {
    const long = value.some((v) => show(v).length > 24);
    return <span className="ve-example-record" data-ve-column={long ? 'true' : undefined}>{value.map((v, i) => <code key={i}>{show(v)}</code>)}</span>;
  }
  const text = show(value);
  return text.includes('\n') || text.length > 72 ? <pre className="ve-example-code"><code>{text}</code></pre> : <code>{text}</code>;
}

const wide = (v: unknown) => (Array.isArray(v) && v.length > 0 && v.every(isRecord)) || (typeof v === 'string' && (v.includes('\n') || v.length > 72));

function Values({ part, label, values }: { part: 'in' | 'decision' | 'out'; label: string; values: ExampleValue[] }) {
  if (!values.length) return null;
  return (
    <div className="ve-example-part" data-ve-example-part={part}>
      <p className="ve-example-part-label">{label}</p>
      <dl className="ve-example-values">
        {values.map((v) => (
          <div className="ve-example-value" key={v.label}>
            <dt>{v.label}</dt>
            <dd><ValueView value={v.value} /></dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** A value short enough for one line of the checklist: a number, a flag or a short word. */
const scalar = (v: unknown) => typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 40 && !v.includes('\n'));

type Part = { part: 'in' | 'decision' | 'out'; word: string; values: ExampleValue[] };
const parts = (st: ExampleStep): Part[] => ([
  { part: 'in', word: 'In', values: st.in },
  { part: 'decision', word: 'Decision', values: st.decision },
  { part: 'out', word: 'Out', values: st.out },
] satisfies Part[]).filter((p) => p.values.length);

const ARROW = <span aria-hidden="true" className="ve-example-arrow">→</span>;

const shortSha = (sha: string) => sha.slice(0, 10);

function rerun(s: ExampleSource): string {
  if (s.kind === 'run') return `${s.cwd && s.cwd !== '.' ? `cd ${s.cwd} && ` : ''}${(s.argv ?? []).join(' ')}`;
  if (s.kind === 'tlc') return `python3 scripts/formal_tlc.py check --spec ${s.spec} --cfg ${s.cfg}`;
  if (s.kind === 'vector') return `git show ${shortSha(s.commit)}:${s.path}  # row ${s.index}`;
  if (s.kind === 'controls') return `understando controls  # ${(s.ids ?? []).join(', ')}`;
  return `understando explain --no-html  # claim ${s.id}`;
}

const KIND_WORDS = new Map(Object.entries({ run: 'a scripted test run', tlc: 'a model check of the spec', vector: 'a replay vector', controls: 'the recorded planted-bug runs', claim: 'the map and its verdict rules' }));

export type WorkedExampleProps = { refs: Refs; id: string; explain?: Explain };

/**
 * One example, one row per step: the step name, then in, the decision and out with the real
 * values in code, the reason in plain words, the diff it made and a link to the line that decided.
 * With JavaScript the rows show one at a time, with Previous and Next above the row, and the
 * station strip lights the station of the row. Without JavaScript every row shows in order.
 */
export function WorkedExample({ refs, id, explain }: WorkedExampleProps) {
  const ex = exampleOf(refs, id);
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const [at, setAt] = useState(0);
  const diagram = ex.diagram ? explain?.diagrams?.[ex.diagram] : undefined;
  const stations = diagram?.eli5?.nodes ?? [];
  const rowId = (n: number) => `example-${ex.id}-${n}`;
  useEffect(() => {
    setLive(true);
    // A link to a row opens that row.
    const land = () => {
      let hash = '';
      try { hash = decodeURIComponent(window.location.hash.slice(1)); } catch { hash = window.location.hash.slice(1); }
      const row = hash ? document.getElementById(hash)?.closest('[data-ve-example-step]') : null;
      if (row && ref.current?.contains(row)) setAt(Number(row.getAttribute('data-ve-example-step')) - 1);
    };
    land();
    window.addEventListener('hashchange', land);
    return () => window.removeEventListener('hashchange', land);
  }, []);
  const current = ex.steps[at];
  const label = (station?: string | null) => {
    const i = stations.findIndex((s) => s.id === station);
    return i < 0 ? null : `${i + 1}. ${stations[i].label}`;
  };
  return (
    <section aria-labelledby={`example-${ex.id}`} className="ve-example" data-ve-example={ex.id} data-ve-trust="example">
      <h3 className="ve-example-title" id={`example-${ex.id}`}>{ex.title}</h3>
      {ex.lead ? <p className="ve-example-lead">{ex.lead}</p> : null}
      {stations.length ? (
        <ol aria-label={`${diagram!.title}: the station of each step`} className="ve-example-stations">
          {stations.map((s, i) => {
            const on = live && current?.station === s.id;
            const first = ex.steps.findIndex((st) => st.station === s.id);
            return (
              <li aria-current={on ? 'step' : undefined} className="ve-example-station" data-ve-active={on ? 'true' : undefined} data-ve-used={first >= 0 ? 'true' : undefined} key={s.id}>
                {live && first >= 0
                  ? <button aria-label={`Show the first step at station ${i + 1}: ${s.label}`} data-ve-example-station={s.id} onClick={() => setAt(first)} type="button"><span className="ve-example-station-n">{i + 1}</span><span>{s.label}</span></button>
                  : <span><span className="ve-example-station-n">{i + 1}</span><span>{s.label}</span></span>}
              </li>
            );
          })}
        </ol>
      ) : null}
      {live ? (
        <div className="ve-example-controls">
          <button className="ve-stepper-button" data-ve-example-prev disabled={at === 0} onClick={() => setAt(at - 1)} type="button">Previous step</button>
          <p aria-live="polite" className="ve-example-count">Step {at + 1} of {ex.steps.length}</p>
          <button className="ve-stepper-button" data-ve-example-next data-ve-primary disabled={at === ex.steps.length - 1} onClick={() => setAt(at + 1)} type="button">Next step</button>
        </div>
      ) : null}
      <div className="ve-example-steps" ref={ref} role="list">
        {ex.steps.map((st, i) => {
          const r = st.code ? maybeRef(refs, st.code) : null;
          if (st.code && !r) throw new TrustMapError(`the example "${ex.id}", step ${st.n}: the code ref ${st.code.path} ${st.code.symbol ?? ''} is not in refs.resolved.json; run understando explain again`);
          const at_ = label(st.station);
          return (
            <div className="ve-example-step" data-ve-example-step={st.n} data-ve-station={st.station ?? undefined} hidden={live && i !== at} id={rowId(st.n)} key={st.n} role="listitem">
              <h4 className="ve-example-step-name">
                <span aria-hidden="true" className="ve-example-step-n">{st.n}</span>
                <span>{st.name}</span>
                {at_ ? <span className="ve-example-step-at">Station {at_}</span> : null}
              </h4>
              <div className="ve-example-flow" data-ve-wide={[...st.in, ...st.decision, ...st.out].some((v) => wide(v.value)) ? 'true' : undefined}>
                {parts(st).flatMap((part, i) => [
                  i ? <Fragment key={`a${i}`}>{ARROW}</Fragment> : null,
                  <Values key={part.part} label={part.word} part={part.part} values={part.values} />,
                ])}
              </div>
              {st.diff ? <DiffBlock after={st.diff.after} before={st.diff.before} filename={st.diff.path} patch={st.diff.patch} /> : null}
              <p className="ve-example-reason">{st.reason}</p>
              {r ? <p className="ve-example-line"><a href={r.permalink ?? undefined} rel="noreferrer" target="_blank">The code that decides: <code>{`${r.path}:${r.start}`}</code></a></p> : null}
              <Disclosure id={`${rowId(st.n)}-from`} summary="Where these values come from">
                <ul className="ve-example-provenance" data-ve-provenance>
                  {st.provenance.map((p) => <li key={p}><code>{p}</code></li>)}
                </ul>
              </Disclosure>
            </div>
          );
        })}
      </div>
      <Disclosure id={`example-${ex.id}-sources`} summary="Run this example again">
        <ul className="ve-example-sources" data-ve-example-sources>
          {Object.entries(ex.sources).map(([name, s]) => (
            <li key={name}>
              <p><strong>{name}</strong>: {KIND_WORDS.get(s.kind) ?? s.kind} at <code>{shortSha(s.commit)}</code>, document <code>{s.sha256.slice(0, 19)}</code></p>
              <pre className="ve-example-code"><code>{rerun(s)}</code></pre>
            </li>
          ))}
        </ul>
      </Disclosure>
    </section>
  );
}

/**
 * The examples that show one of `claims`, for a checklist item: each step name and its short
 * values, with a link to the full example. The reasons stay in the example's own chapter.
 */
export function ExamplesFor({ refs, claims }: { refs: Refs; claims: readonly string[] }) {
  const mine = examplesOf(refs).filter((e) => (e.claims ?? []).some((c) => claims.includes(c)));
  if (!mine.length) return null;
  return (
    <div className="ve-example-brief" data-ve-example-for={mine.map((e) => e.id).join(' ')}>
      {mine.map((ex) => {
        assertExample(ex);
        return (
          <div className="ve-example-brief-one" key={ex.id}>
            <p className="ve-example-brief-title"><a href={`#example-${ex.id}`}>The worked example: {ex.title}</a></p>
            <ol className="ve-example-brief-steps">
              {ex.steps.map((st) => (
                <li key={st.n}>
                  <span className="ve-example-brief-name">{st.name}</span>
                  {[...st.decision, ...st.out].filter((v) => scalar(v.value)).slice(0, 2).map((v) => <span className="ve-example-brief-value" key={v.label}>{v.label} <code>{show(v.value)}</code></span>)}
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

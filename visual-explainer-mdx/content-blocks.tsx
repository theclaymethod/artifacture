import { Children, cloneElement, createContext, isValidElement, type MouseEvent as ReactMouseEvent, type ReactNode, type SyntheticEvent, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { StatusPill, type StatusTone } from './data-table';
import type React from 'react';
import './content-blocks.css';

export type PipelineProps = {
  steps: Array<string | { title: string; body?: string }>;
};

type PipelineStep = PipelineProps['steps'][number];

export type DecisionMatrixProps = {
  rows: Array<Record<string, ReactNode>>;
};

export type RiskLedgerProps = {
  risks: Array<{ risk: string; signal: string; mitigation: string; level?: 'low' | 'medium' | 'high' }>;
};

export type DefinitionListProps = {
  /** `lead` sets the pairs one step larger, for the first ideas a reader meets. */
  size?: 'lead';
  children: ReactNode;
};

export type DefinitionProps = { term: ReactNode; tone?: 'ok' | 'info' | 'warn' | 'err' | 'neutral'; children: ReactNode };

export type SubsectionProps = {
  title: ReactNode;
  id?: string;
  level?: 3 | 4;
  marker?: ReactNode;
  /** Add a copy-link control after the title. Needs an id. */
  share?: boolean;
  children: ReactNode;
};

/** Term and detail pairs in two columns. The columns stack below 640px. */
export function DefinitionList({ size, children }: DefinitionListProps) {
  return <dl className="ve-definition-list" data-ve-size={size}>{children}</dl>;
}

/** One term and its detail. A tone colors both; keep a word in the term, so color is never the only cue. */
export function Definition({ term, tone, children }: DefinitionProps) {
  return (
    <>
      <dt data-ve-tone={tone}>{term}</dt>
      <dd data-ve-tone={tone}>{children}</dd>
    </>
  );
}

/** A titled block under a rule inside a Section. An id makes it a chapter-rail anchor. A marker, such as a step number, goes before the title. `share` adds a copy-link control. */
export function Subsection({ title, id, level = 3, marker, share = false, children }: SubsectionProps) {
  const Heading = level === 4 ? 'h4' : 'h3';
  return (
    <section className="ve-subsection" data-ve-anchor={id ? 'true' : undefined} data-ve-level={level} id={id}>
      <Heading className="ve-subsection-title">
        {marker === undefined ? null : <span className="ve-subsection-marker">{marker}</span>}
        <span className="ve-subsection-text">{title}</span>
        {share && id ? <CopyLink id={id} /> : null}
      </Heading>
      {children}
    </section>
  );
}

export type DisclosureProps = {
  /** The always-visible line. Say what the reader gets when they open it. */
  summary: ReactNode;
  /** Short trailing text or a pill, such as a count or a verdict. */
  meta?: ReactNode;
  id?: string;
  open?: boolean;
  /** Add a copy-link control to the summary row. Needs an id. */
  share?: boolean;
  /** Render the body only after the first open, so closed detail costs no DOM. List in `contains` each id inside the body that a link can target. */
  lazy?: boolean;
  contains?: readonly string[];
  children: ReactNode;
};

// Open blocks persist for the session, per page: a reload keeps what the reader opened.
const openKey = () => `ve-open:${window.location.pathname}`;
function readOpen(): Set<string> {
  try {
    return new Set(JSON.parse(window.sessionStorage.getItem(openKey()) ?? '[]'));
  } catch {
    return new Set();
  }
}
function writeOpen(id: string, open: boolean) {
  try {
    const ids = readOpen();
    if (open) ids.add(id); else ids.delete(id);
    window.sessionStorage.setItem(openKey(), JSON.stringify([...ids]));
  } catch {
    // Storage can be off; the open state then lasts for this page view.
  }
}

// Scroll a deep-link target under its headline, then keep it there while the page above it
// settles (diagrams and fonts change height after load). Any reader input stops the correction.
let settling: (() => void) | null = null;
export function scrollToTarget(target: HTMLElement) {
  settling?.();
  // A jump, not a smooth scroll: the correction below would restart a smooth scroll on each resize.
  const place = () => target.scrollIntoView({ block: 'start', behavior: 'instant' });
  requestAnimationFrame(place);
  const observer = new ResizeObserver(place);
  observer.observe(document.body);
  const stop = () => {
    observer.disconnect();
    for (const name of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) window.removeEventListener(name, stop);
    if (settling === stop) settling = null;
  };
  for (const name of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) window.addEventListener(name, stop, { passive: true });
  window.setTimeout(stop, 1500);
  settling = stop;
}

function currentHash() {
  try {
    return decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return window.location.hash.slice(1);
  }
}

/**
 * A native details block for detail that waits until the reader asks for it. The summary row is
 * a 44px target. A fragment link to the block, or to an element inside it, opens it (and each
 * enclosing Disclosure) and scrolls the target under its headline. Opening a block with an id
 * writes its fragment to the address, so the address is a link to it, and the page keeps the
 * open blocks for the session.
 */
export function Disclosure({ summary, meta, id, open = false, share = false, lazy = false, contains, children }: DisclosureProps) {
  const ref = useRef<HTMLDetailsElement>(null);
  // An open that the page makes (a restore or a deep link) must not rewrite the address.
  const quiet = useRef(false);
  const [rendered, setRendered] = useState(!lazy || open);
  const containsKey = (contains ?? []).join('\n');
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (id && readOpen().has(id) && !element.open) {
      setRendered(true);
      quiet.current = true;
      element.open = true;
    }
    const reveal = () => {
      const hash = currentHash();
      if (!hash) return;
      const target = document.getElementById(hash);
      const inside = target ? element === target || element.contains(target) : containsKey.split('\n').includes(hash);
      if (!inside) return;
      setRendered(true);
      if (!element.open) {
        quiet.current = true;
        element.open = true;
      }
      // The innermost block scrolls once every enclosing block is open.
      if (target && (target === element || target.closest('details') === element)) scrollToTarget(target);
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, [id, containsKey, rendered]);
  const onToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const element = ref.current;
    // React passes a nested block's toggle up the tree; each block handles only its own.
    if (!element || event.target !== element) return;
    if (element.open) setRendered(true);
    if (!id) return;
    writeOpen(id, element.open);
    if (quiet.current) {
      quiet.current = false;
      return;
    }
    // The address follows the reader: an open block is the link to share; a closed one hands it back to its parent.
    if (element.open && currentHash() !== id) window.history.replaceState(window.history.state, '', `#${id}`);
    if (!element.open && currentHash() === id) {
      const parent = element.parentElement?.closest<HTMLElement>('details[id], section[id]');
      window.history.replaceState(window.history.state, '', parent ? `#${parent.id}` : window.location.pathname + window.location.search);
    }
  };
  // The browser opens a block itself (a fragment link, find in page) before a pre-rendered page
  // hydrates, so the open attribute can differ from the server markup.
  return (
    <details className="ve-disclosure" data-ve-anchor={id ? 'true' : undefined} id={id} onToggle={onToggle} open={open || undefined} ref={ref} suppressHydrationWarning>
      <summary className="ve-disclosure-summary">
        <span aria-hidden="true" className="ve-disclosure-caret" />
        <span className="ve-disclosure-label">{summary}</span>
        {meta === undefined || meta === null ? null : <span className="ve-disclosure-meta">{meta}</span>}
        {share && id ? <CopyLink id={id} /> : null}
      </summary>
      <div className="ve-disclosure-body">{rendered ? children : null}</div>
    </details>
  );
}

/** A 44px control that copies the page address with this fragment, and writes it to the address bar. */
export function CopyLink({ id, label = 'Copy a link to this part' }: { id: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = (event: ReactMouseEvent<HTMLButtonElement>) => {
    // Inside a summary row, the control must not also open or close the block.
    event.preventDefault();
    event.stopPropagation();
    const url = `${window.location.href.split('#')[0]}#${id}`;
    window.history.replaceState(window.history.state, '', `#${id}`);
    const done = () => setCopied(true);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done, done);
    else done();
  };
  return (
    <button aria-label={label} className="ve-copy-link" data-ve-copied={copied ? 'true' : undefined} onClick={copy} title={label} type="button">
      <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
        <path d="M6.5 9.5l3-3M7.25 4.75l1.1-1.1a2.47 2.47 0 013.5 3.5l-1.1 1.1M8.75 11.25l-1.1 1.1a2.47 2.47 0 01-3.5-3.5l1.1-1.1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      </svg>
      <span aria-live="polite" className="ve-copy-link-status">{copied ? 'Link copied' : ''}</span>
    </button>
  );
}

export type TermProps = {
  /** The definition, in one or two plain sentences. */
  definition: string;
  /** The term in full, for an abbreviation: shows once before it, as in "clinical reasoning (CR)". */
  expansion?: string;
  children: ReactNode;
};

/**
 * A glossary term in running text. Hover, focus or tap shows its definition in a tooltip; the
 * text keeps a dotted underline so the reader knows it has one. Give `expansion` at the first
 * use of an abbreviation, and the full words show in the text.
 */
export function Term({ definition, expansion, children }: TermProps) {
  const tipId = `ve-term-${useId().replace(/:/g, '')}`;
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(false);
  useLayoutEffect(() => {
    if (!shown) return;
    const tip = ref.current?.querySelector<HTMLElement>('.ve-term-tip');
    if (!tip) return;
    // Keep the tooltip inside the viewport: shift it back from the edge it crosses.
    tip.style.setProperty('--ve-term-shift', '0px');
    const box = tip.getBoundingClientRect();
    const edge = 8;
    const shift = box.left < edge ? edge - box.left : box.right > window.innerWidth - edge ? window.innerWidth - edge - box.right : 0;
    tip.style.setProperty('--ve-term-shift', `${shift}px`);
  }, [shown]);
  useEffect(() => {
    if (!shown) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setShown(false); };
    const onPointer = (event: PointerEvent) => { if (!(event.target instanceof Node) || !ref.current?.contains(event.target)) setShown(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [shown]);
  return (
    <>
      {expansion ? `${expansion} (` : null}
      <span
        aria-describedby={tipId}
        className="ve-term"
        data-ve-shown={shown ? 'true' : undefined}
        onBlur={() => setShown(false)}
        onClick={() => setShown((value) => !value)}
        onFocus={() => setShown(true)}
        onMouseEnter={() => setShown(true)}
        onMouseLeave={() => setShown(false)}
        ref={ref}
        tabIndex={0}
      >
        {children}
        <span className="ve-term-tip" id={tipId} role="tooltip">{definition}</span>
      </span>
      {expansion ? ')' : null}
    </>
  );
}

export type LeadProps = { label?: string; children: ReactNode };

/**
 * The opener of a level: its answer in plain words, one step larger than body text, with a
 * run-in label. Write one or two sentences that a newcomer can hold.
 */
export function Lead({ label = 'In plain words', children }: LeadProps) {
  return (
    <div className="ve-lead" data-ve-lead>
      <LeadBody label={label}>{children}</LeadBody>
    </div>
  );
}

// MDX wraps the text in a paragraph: the label runs into the first one.
function LeadBody({ label, children }: { label: string; children: ReactNode }) {
  const items = Children.toArray(children);
  const first = items[0];
  const run = <strong className="ve-lead-label">{label}. </strong>;
  if (isValidElement<{ children?: ReactNode }>(first) && first.type === 'p') {
    return <>{cloneElement(first, undefined, run, first.props.children)}{items.slice(1)}</>;
  }
  return <p>{run}{children}</p>;
}

export type AsideProps = { label?: string; children: ReactNode };

/** A short aside, such as why a thing matters. Keep it to two sentences. */
export function Aside({ label = 'Why this matters', children }: AsideProps) {
  return (
    <aside className="ve-aside" data-ve-aside>
      <LeadBody label={label}>{children}</LeadBody>
    </aside>
  );
}

export type StepsProps = { label?: string; children: ReactNode };
export type StepProps = { id?: string; children: ReactNode };

/**
 * A numbered list of run steps. Each step holds rich content (text, links, a Disclosure). From
 * 1024px the steps sit in two columns, so a five- or six-step run fits one screen.
 */
export function Steps({ label, children }: StepsProps) {
  const stepper = useContext(StepperContext);
  const steps = Children.toArray(children).filter(isValidElement);
  useEffect(() => { stepper?.setCount(steps.length); }, [stepper, steps.length]);
  if (!stepper?.live) return <ol aria-label={label} className="ve-steps">{children}</ol>;
  const at = Math.min(stepper.current, steps.length - 1);
  // SAFETY: Steps holds Step elements, which take `hidden` and `number`.
  const shown = steps.map((step, i) => cloneElement(step as ReactElementWithHidden, { hidden: i !== at, number: i + 1 }));
  return (
    <div className="ve-stepper-steps">
      <ol aria-label={label} className="ve-steps" data-ve-stepping>
        {shown}
      </ol>
      <div className="ve-stepper-controls">
        <button className="ve-stepper-button" data-ve-step-prev disabled={at === 0} onClick={() => stepper.set(at - 1)} type="button">Previous step</button>
        <p aria-live="polite" className="ve-stepper-count">Step {at + 1} of {steps.length}</p>
        <button className="ve-stepper-button" data-ve-step-next data-ve-primary disabled={at === steps.length - 1} onClick={() => stepper.set(at + 1)} type="button">Next step</button>
      </div>
    </div>
  );
}

type ReactElementWithHidden = React.ReactElement<{ hidden?: boolean; number?: number }>;

export function Step({ id, children, hidden, number }: StepProps & { hidden?: boolean; number?: number }) {
  return <li className="ve-step" data-ve-step-number={number} hidden={hidden} id={id} value={number}>{children}</li>;
}

type StepperState = { live: boolean; current: number; count: number; set: (n: number) => void; setCount: (n: number) => void };
const StepperContext = createContext<StepperState | null>(null);

/** The step state of a StepThrough: the current step (0-based), the count and the switch. Null outside one. */
export function useStepThrough() {
  return useContext(StepperContext);
}

export type StepThroughProps = { label?: string; children: ReactNode };

/**
 * A run, one step at a time: wrap a numbered ArchitectureDiagram and its Steps. With JavaScript,
 * the Steps show one step with Previous and Next, and the station with the same number lights up;
 * a station is also a button to its step. A link to a step opens it. Without JavaScript, each step
 * shows in sequence.
 */
export function StepThrough({ label = 'One run, step by step', children }: StepThroughProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);
  useEffect(() => {
    setLive(true);
    const land = () => {
      const target = document.getElementById(currentHash());
      const step = target?.closest('.ve-step');
      const all = ref.current ? [...ref.current.querySelectorAll('.ve-step')] : [];
      if (step && all.includes(step)) setCurrent(all.indexOf(step));
    };
    land();
    window.addEventListener('hashchange', land);
    return () => window.removeEventListener('hashchange', land);
  }, []);
  const set = (n: number) => setCurrent(Math.max(0, Math.min(n, Math.max(count - 1, 0))));
  return (
    <div aria-label={label} className="ve-stepper" data-ve-step={live ? String(current + 1) : undefined} data-ve-stepper ref={ref} role="group">
      <StepperContext.Provider value={{ live, current, count, set, setCount }}>{children}</StepperContext.Provider>
    </div>
  );
}

export type ChipLinkItem = { label: ReactNode; href: string; tone?: StatusTone; status?: string; meaning?: string };
export type ChipLinksProps = { items: readonly ChipLinkItem[]; label: string };

/** A row of link chips, each a 44px target: a label and, when given, a state pill with its word and its meaning. */
export function ChipLinks({ items, label }: ChipLinksProps) {
  return (
    <ul aria-label={label} className="ve-chip-links">
      {items.map((item) => (
        <li key={item.href}>
          <a className="ve-chip-link" href={item.href}>
            <span className="ve-chip-link-label">{item.label}</span>
            {item.status ? <StatusPill meaning={item.meaning} tone={item.tone ?? 'neutral'}>{item.status}</StatusPill> : null}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function Pipeline({ steps }: PipelineProps) {
  return (
    <ol className="ve-pipeline">
      {steps.map((step, index) => {
        const item = normalizePipelineStep(step);
        return (
          <li key={`${item.title}-${index}`} className="ve-pipeline-item">
            <div className="ve-pipeline-position">{String(index + 1).padStart(2, '0')}</div>
            <h3 className="ve-pipeline-title">{item.title}</h3>
            {item.body ? <p className="ve-content-detail">{item.body}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}

function normalizePipelineStep(step: PipelineStep): Exclude<PipelineStep, string> {
  return isPipelineTitle(step) ? { title: step } : step;
}

function isPipelineTitle(step: PipelineStep): step is string {
  return Object.prototype.toString.call(step) === '[object String]';
}

export function DecisionMatrix({ rows }: DecisionMatrixProps) {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return (
    <div className="ve-table-shell ve-decision-matrix">
      <table className="ve-decision-table">
        <thead className="ve-decision-head">
          <tr>
            {columns.map((column) => (
              <th key={column} className="ve-decision-heading">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="ve-decision-row">
              {columns.map((column) => (
                <td key={column} className="ve-decision-cell">
                  {row[column]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RiskLedger({ risks }: RiskLedgerProps) {
  return (
    <div className="ve-risk-ledger">
      {risks.map((risk) => (
        <article data-ve-risk-level={risk.level ?? 'medium'} key={risk.risk} className="ve-risk-card">
          {risk.level ? <p className="ve-risk-level">{risk.level} risk</p> : null}
          <h3 className="ve-risk-title">{risk.risk}</h3>
          <p className="ve-content-detail">
            <span className="ve-content-label">Signal:</span> {risk.signal}
          </p>
          <p className="ve-content-detail ve-risk-mitigation">
            <span className="ve-content-label">Mitigation:</span> {risk.mitigation}
          </p>
        </article>
      ))}
    </div>
  );
}

import { type ReactNode } from 'react';
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

export type DefinitionListProps = { children: ReactNode };

export type DefinitionProps = { term: ReactNode; tone?: 'ok' | 'info' | 'warn' | 'err' | 'neutral'; children: ReactNode };

export type SubsectionProps = {
  title: ReactNode;
  id?: string;
  level?: 3 | 4;
  marker?: ReactNode;
  children: ReactNode;
};

/** Term and detail pairs in two columns. The columns stack below 640px. */
export function DefinitionList({ children }: DefinitionListProps) {
  return <dl className="ve-definition-list">{children}</dl>;
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

/** A titled block under a rule inside a Section. An id makes it a chapter-rail anchor. A marker, such as a step number, goes before the title. */
export function Subsection({ title, id, level = 3, marker, children }: SubsectionProps) {
  const Heading = level === 4 ? 'h4' : 'h3';
  return (
    <section className="ve-subsection" data-ve-anchor={id ? 'true' : undefined} data-ve-level={level} id={id}>
      <Heading className="ve-subsection-title">
        {marker === undefined ? null : <span className="ve-subsection-marker">{marker}</span>}
        <span>{title}</span>
      </Heading>
      {children}
    </section>
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

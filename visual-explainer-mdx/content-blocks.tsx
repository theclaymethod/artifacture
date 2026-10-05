import React, { type ReactNode } from 'react';
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

function normalizePipelineStep(step: PipelineStep): { title: string; body?: string } {
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

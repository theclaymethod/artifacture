import type { ReactNode } from 'react';

export type PipelineProps = {
  steps: Array<string | { title: string; body?: string }>;
};

type PipelineStep = PipelineProps['steps'][number];

export type DecisionMatrixProps = {
  rows: Array<Record<string, ReactNode>>;
};

/**
 * Renders an ordered pipeline strip of numbered stages.
 */
export function Pipeline({ steps }: PipelineProps) {
  const items = steps.map((step, n) => ({ item: normalizePipelineStep(step), key: `${n}` }));
  return (
    <ol className="ve-pipeline">
      {items.map(({ item, key }, ordinal) => (
        <li key={`${item.title}-${key}`} className="ve-pipeline-item">
          <div className="ve-pipeline-position">{String(ordinal + 1).padStart(2, '0')}</div>
          <h3 className="ve-pipeline-title">{item.title}</h3>
          {item.body ? <p className="ve-content-detail">{item.body}</p> : null}
        </li>
      ))}
    </ol>
  );
}

function normalizePipelineStep(step: PipelineStep): Exclude<PipelineStep, string> {
  return typeof step === 'string' ? { title: step } : step;
}

/**
 * Renders a comparison matrix across uniform criteria columns.
 */
export function DecisionMatrix({ rows }: DecisionMatrixProps) {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const keyedRows = rows.map((row, n) => ({ row, key: `row-${n}` }));
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
          {keyedRows.map(({ row, key }) => (
            <tr key={key} className="ve-decision-row">
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

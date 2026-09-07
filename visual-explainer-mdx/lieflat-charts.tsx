/// <reference types="vite/client" />
import React, { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ThreadPlot, validateThreadsSpec } from './lieflat-threads';
import type { BarcodeSpec, BubbleMatrixSpec, LieflatChartProps, LieflatChartSpec, RungBarsSpec, UnitFieldSpec } from './lieflat-types';
import './lieflat-charts.css';

export type { BarcodeSpec, BubbleMatrixSpec, LieflatChartProps, LieflatChartSpec, RungBarsSpec, ThreadsSpec, UnitFieldSpec } from './lieflat-types';

const ink = 'var(--ve-heading, #242424)';
const muted = 'var(--ve-muted, #66645f)';
const rule = 'var(--ve-rule, #d8d6d0)';
const MAX_UNIT_MARKS = 2400;

export function LieflatChart({ spec, title, description, source }: LieflatChartProps) {
  useMemo(() => validateLieflatChartSpec(spec), [spec]);
  const id = `lieflat-${useId().replace(/:/g, '')}`;
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      if (host.clientWidth > 0) setWidth((previous) => previous === host.clientWidth ? previous : host.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  return (
    <figure className="ve-lieflat-chart" data-ve-lieflat-chart={spec.kind}>
      <figcaption className="ve-lieflat-heading">
        <h2 id={`${id}-title`}>{title}</h2>
        {description ? <p>{description}</p> : null}
        <p className="ve-lieflat-encoding" id={`${id}-encoding`}>{encoding(spec)}</p>
      </figcaption>
      <div className="ve-lieflat-host" ref={hostRef}>
        {spec.kind === 'rung-bars' ? <RungPlot id={id} spec={spec} width={width} />
          : spec.kind === 'unit-field' ? <UnitPlot id={id} spec={spec} width={width} />
            : spec.kind === 'barcode' ? <BarcodePlot id={id} spec={spec} width={width} />
              : spec.kind === 'bubble-matrix' ? <MatrixPlot id={id} spec={spec} width={width} />
                : <ThreadPlot spec={spec} />}
      </div>
      {source ? <p className="ve-lieflat-source">Source: {source.url ? <a href={source.url}>{source.label}</a> : source.label}</p> : null}
    </figure>
  );
}

function encoding(spec: LieflatChartSpec): string {
  if (spec.kind === 'rung-bars' || spec.kind === 'unit-field') {
    const fractional = spec.data.some((datum) => datum.value !== null && !Number.isInteger(datum.value / spec.unit));
    const mark = spec.kind === 'rung-bars' ? 'rung' : 'circle';
    const unit = spec.unit === 1 ? 'one' : String(spec.unit);
    return `One ${fractional ? 'full ' : ''}${mark} = ${unit} ${spec.unitLabel}.${fractional ? spec.kind === 'rung-bars' ? ' Short final rungs show fractions.' : ' Smaller final circles show fractions by area.' : ''}`;
  }
  if (spec.kind === 'barcode') return `One mark per observation; position follows date. Height = ${spec.valueLabel}.${spec.data.some((datum) => datum.note?.trim() && datum.value !== null) ? ' Rings mark notes.' : ''}${spec.data.some((datum) => datum.value === null) ? ' Missing measurements have no point.' : ''}`;
  if (spec.kind === 'bubble-matrix') {
    const zero = spec.data.some((datum) => datum.value === 0);
    const missing = spec.data.some((datum) => datum.value === null);
    return `Circle area is proportional to ${spec.valueLabel}.${zero && missing ? ' Zero and missing values have no circle.' : zero ? ' Zero has no circle.' : missing ? ' Missing values have no circle.' : ''}`;
  }
  return `One thread = one ${spec.unitLabel}.`;
}

function PlotScroll({ id, children }: { id: string; children: ReactNode }) {
  return <div aria-label="Chart, scroll to explore" aria-describedby={`${id}-encoding`} className="ve-lieflat-scroll" role="region" tabIndex={0}>{children}</div>;
}

function RungPlot({ spec, id, width }: { spec: RungBarsSpec; id: string; width: number }) {
  if (!spec.data.length) return <EmptyPlot />;
  const plotWidth = Math.max(width, spec.data.length * (spec.data.length <= 4 ? 82 : 104));
  const columnWidth = plotWidth / spec.data.length;
  const maxRungs = Math.max(0, ...spec.data.map((datum) => datum.value === null ? 0 : Math.ceil(datum.value / spec.unit)));
  const valueHeights = spec.data.map((datum) => Math.ceil(String(datum.value ?? 'No data').length * 8 / (columnWidth - 12)) * 23);
  const height = Math.max(192, maxRungs * 7 + Math.max(...valueHeights) + 32);
  const baseline = height - 12;
  const rungWidth = Math.min(46, columnWidth * 0.48);
  return (
    <>
      <PlotScroll id={id}>
        <div className="ve-lieflat-rungs" style={{ width: plotWidth }}>
          <svg aria-labelledby={`${id}-title ${id}-encoding`} height={height} role="img" viewBox={`0 0 ${plotWidth} ${height}`} width={plotWidth}>
            <line stroke={rule} x1="12" x2={plotWidth - 12} y1={baseline} y2={baseline} />
            {spec.data.map((datum, column) => {
              const units = datum.value === null ? 0 : datum.value / spec.unit;
              const full = Math.floor(units);
              const remainder = units - full;
              const cx = (column + 0.5) * columnWidth;
              return <g key={datum.label}><title>{`${datum.label}: ${datum.value ?? 'No data'}`}</title>{Array.from({ length: Math.ceil(units) }, (_, index) => {
                const fraction = index < full ? 1 : remainder;
                return <line data-lieflat-unit-fraction={fraction} key={index} stroke={ink} strokeWidth="1.2" x1={cx - rungWidth / 2} x2={cx - rungWidth / 2 + rungWidth * fraction} y1={baseline - (index + 1) * 7} y2={baseline - (index + 1) * 7} />;
              })}</g>;
            })}
          </svg>
          {spec.data.map((datum, column) => <span className="ve-lieflat-rung-value" key={datum.label} style={{ left: column * columnWidth, width: columnWidth, top: baseline - (datum.value === null ? 0 : Math.ceil(datum.value / spec.unit)) * 7 - valueHeights[column] - 9 }}>{datum.value ?? 'No data'}</span>)}
          <div className="ve-lieflat-column-labels" style={{ gridTemplateColumns: `repeat(${spec.data.length}, minmax(0, 1fr))` }}>{spec.data.map((datum) => <span key={datum.label}>{datum.label}</span>)}</div>
        </div>
      </PlotScroll>
      <ExactTable headers={['Category', spec.unitLabel]} rows={spec.data.map((datum) => [datum.label, datum.value ?? 'No data'])} />
    </>
  );
}

function UnitPlot({ spec, id, width }: { spec: UnitFieldSpec; id: string; width: number }) {
  if (!spec.data.length) return <EmptyPlot />;
  const counts = spec.data.map((datum) => Math.ceil(datum.value / spec.unit));
  const minCell = Math.max(168, Math.ceil(16 * Math.sqrt(Math.max(0, ...counts)) + 24));
  const plotWidth = Math.max(width, minCell);
  const columns = Math.max(1, Math.floor(plotWidth / minCell));
  const cellWidth = plotWidth / columns;
  const height = Math.max(132, minCell - 12);
  return (
    <>
      <PlotScroll id={id}>
        <div className="ve-lieflat-unit-field" style={{ width: plotWidth, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {spec.data.map((datum) => {
            const units = datum.value / spec.unit;
            const full = Math.floor(units);
            return (
              <div className="ve-lieflat-unit-group" key={datum.label}>
                <svg aria-label={`${datum.label}: ${datum.value} ${spec.unitLabel}`} height={height} role="img" viewBox={`0 0 ${cellWidth} ${height}`} width={cellWidth}>
                  {Array.from({ length: Math.ceil(units) }, (_, index) => {
                    const fraction = index < full ? 1 : units - full;
                    const angle = index * Math.PI * (3 - Math.sqrt(5));
                    const distance = 8 * Math.sqrt(index);
                    return <circle cx={cellWidth / 2 + Math.cos(angle) * distance} cy={height / 2 + Math.sin(angle) * distance} data-lieflat-unit-fraction={fraction} fill={ink} key={index} r={3.3 * Math.sqrt(fraction)} />;
                  })}
                </svg>
                <p className="ve-lieflat-unit-label"><span>{datum.label}</span><strong>{datum.value}</strong></p>
              </div>
            );
          })}
        </div>
      </PlotScroll>
      <ExactTable headers={['Category', spec.unitLabel]} rows={spec.data.map((datum) => [datum.label, datum.value])} />
    </>
  );
}

function BarcodePlot({ spec, id, width }: { spec: BarcodeSpec; id: string; width: number }) {
  if (!spec.data.length) return <EmptyPlot />;
  const data = [...spec.data].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const values = data.flatMap((datum) => datum.value === null ? [] : [datum.value]);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const magnitude = Math.max(1, Math.abs(min), Math.abs(max));
  const low = min / magnitude;
  const high = max / magnitude;
  const first = Date.parse(data[0].date);
  const last = Date.parse(data.at(-1)!.date);
  const axisWidth = Math.max(48, String(min).length * 8 + 12, String(max).length * 8 + 12);
  const plotWidth = Math.max(width, axisWidth + 232, data.length * 6 + axisWidth + 24);
  const height = 312;
  const left = axisWidth;
  const right = plotWidth - 20;
  const x = (date: string) => first === last ? (left + right) / 2 : left + (Date.parse(date) - first) / (last - first) * (right - left);
  const y = (value: number) => 284 - (value / magnitude - low) / (high - low || 1) * 256;
  const ticks = [...new Set([max, 0, min])];
  const notes = data.filter((datum) => datum.note?.trim());
  return (
    <>
      <PlotScroll id={id}>
        <div className="ve-lieflat-barcode" style={{ width: plotWidth }}>
          <svg aria-labelledby={`${id}-title ${id}-encoding`} height={height} role="img" viewBox={`0 0 ${plotWidth} ${height}`} width={plotWidth}>
            <line stroke={rule} x1={left} x2={right} y1={y(0)} y2={y(0)} />
            {data.map((datum) => <g key={datum.date}>
              <title>{`${datum.date}: ${datum.value ?? 'No data'} ${spec.valueLabel}${datum.note ? `. ${datum.note}` : ''}`}</title>
              <line stroke={rule} strokeWidth="0.75" x1={x(datum.date)} x2={x(datum.date)} y1="24" y2="288" />
              {datum.value !== null ? <>
                <line stroke={muted} strokeWidth="1" x1={x(datum.date)} x2={x(datum.date)} y1={y(0)} y2={y(datum.value)} />
                <circle cx={x(datum.date)} cy={y(datum.value)} fill={ink} r="2.7" />
                {datum.note?.trim() ? <circle cx={x(datum.date)} cy={y(datum.value)} fill="none" r="6" stroke={ink} strokeWidth="1.2" /> : null}
              </> : null}
            </g>)}
          </svg>
          {ticks.map((value) => <span className="ve-lieflat-value-tick" key={value} style={{ top: y(value), width: axisWidth - 12 }}>{value}</span>)}
          <div className="ve-lieflat-time-labels" style={{ marginLeft: left, marginRight: 20 }}><span>{data[0].date}</span>{data.length > 1 ? <span>{data.at(-1)?.date}</span> : null}</div>
        </div>
      </PlotScroll>
      {notes.length ? <ul className="ve-lieflat-notes">{notes.map((datum) => <li key={datum.date}><time dateTime={datum.date}>{datum.date}</time><span>{datum.note}{datum.value === null ? ' (No measurement)' : ` (${datum.value} ${spec.valueLabel})`}</span></li>)}</ul> : null}
      <ExactTable headers={['Date', spec.valueLabel, 'Note']} rows={data.map((datum) => [datum.date, datum.value ?? 'No data', datum.note ?? ''])} />
    </>
  );
}

function MatrixPlot({ spec, id, width }: { spec: BubbleMatrixSpec; id: string; width: number }) {
  if (!spec.data.length) return <EmptyPlot />;
  const rows = [...new Set(spec.data.map((datum) => datum.row.trim()))];
  const columns = [...new Set(spec.data.map((datum) => datum.column.trim()))];
  const byCoordinate = new Map(spec.data.map((datum) => [JSON.stringify([datum.row.trim(), datum.column.trim()]), datum.value]));
  const max = Math.max(0, ...spec.data.map((datum) => datum.value ?? 0));
  const compact = width < 540 && columns.length <= 4;
  const labelWidth = compact ? Math.max(94, Math.min(104, width * 0.26)) : Math.max(96, Math.min(176, Math.max(...rows.map((row) => row.length)) * 7 + 16));
  const plotWidth = Math.max(width, labelWidth + columns.length * (compact ? 64 : 104));
  const columnWidth = (plotWidth - labelWidth) / columns.length;
  return (
    <>
      <PlotScroll id={id}>
        <div className="ve-lieflat-matrix" role="group" aria-labelledby={`${id}-title`} style={{ width: plotWidth }}>
          <div className="ve-lieflat-matrix-row ve-lieflat-matrix-head" style={{ gridTemplateColumns: `${labelWidth}px repeat(${columns.length}, minmax(0, 1fr))` }}><span />{columns.map((column) => <span key={column}>{column}</span>)}</div>
          {rows.map((row) => <div className="ve-lieflat-matrix-row" key={row} style={{ gridTemplateColumns: `${labelWidth}px repeat(${columns.length}, minmax(0, 1fr))` }}>
            <span className="ve-lieflat-matrix-label">{row}</span>
            {columns.map((column) => {
              const value = byCoordinate.get(JSON.stringify([row, column]));
              return <div className="ve-lieflat-matrix-cell" key={column}>
                <svg aria-hidden="true" height="60" viewBox={`0 0 ${columnWidth} 60`} width={columnWidth}>
                  {value !== undefined && value !== null && value > 0 ? <circle cx={columnWidth / 2} cy="30" data-lieflat-value={value} fill={ink} r={24 * Math.sqrt(value / max)} /> : null}
                </svg>
                <span>{value === undefined ? 'Not supplied' : value === null ? 'No data' : value}</span>
              </div>;
            })}
          </div>)}
        </div>
      </PlotScroll>
      <ExactTable headers={['Row', 'Column', spec.valueLabel]} rows={spec.data.map((datum) => [datum.row, datum.column, datum.value ?? 'No data'])} />
    </>
  );
}

function ExactTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return <details className="ve-lieflat-data"><summary>View exact data</summary><div className="ve-lieflat-table-scroll" role="region" aria-label="Exact chart data" tabIndex={0}><table><thead><tr>{headers.map((header, index) => <th key={index} scope="col">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((value, column) => column === 0 ? <th key={column} scope="row">{value}</th> : <td key={column}>{value}</td>)}</tr>)}</tbody></table></div></details>;
}

function EmptyPlot() {
  return <p className="ve-lieflat-empty" role="status">No data to display.</p>;
}

/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type -- This validator is the JSON input boundary; it establishes the discriminated chart contract before rendering. */
export function validateLieflatChartSpec(spec: unknown): asserts spec is LieflatChartSpec {
  const chart = objectValue(spec, 'spec');
  textValue(chart.kind, 'spec.kind');
  if (chart.kind === 'threads') { validateThreadsSpec(spec); return; }
  if (!['rung-bars', 'unit-field', 'barcode', 'bubble-matrix'].includes(String(chart.kind))) fail('spec.kind must be rung-bars, unit-field, barcode, bubble-matrix, or threads.');
  if (!Array.isArray(chart.data)) fail('spec.data must be an array.');
  if (chart.data.length > 2400) fail('spec.data exceeds 2400 records. Split this chart into smaller comparisons.');
  const data = Array.from(chart.data, (datum, index) => objectValue(datum, `data[${index}]`));
  if (chart.kind === 'rung-bars' || chart.kind === 'unit-field') {
    finiteValue(chart.unit, 'unit', false, false);
    if (chart.unit === null || chart.unit <= 0) fail('unit must be greater than zero.');
    const unit = chart.unit;
    textValue(chart.unitLabel, 'unitLabel');
    const labels = new Set<string>();
    let marks = 0;
    data.forEach((datum, index) => {
      textValue(datum.label, `data[${index}].label`);
      uniqueValue(labels, datum.label.trim(), `duplicate category "${datum.label}"`);
      finiteValue(datum.value, `data[${index}].value`, chart.kind === 'rung-bars', false);
      const units = datum.value === null ? 0 : datum.value / unit;
      if (datum.value !== null && datum.value > 0 && units === 0) fail(`unit is too large to represent "${datum.label}". Choose a smaller unit.`);
      const count = Math.ceil(units);
      marks += count;
      if (!Number.isFinite(count) || marks > MAX_UNIT_MARKS) fail(`this unit would require more than ${MAX_UNIT_MARKS} marks. Increase unit or split the chart; values are never rounded.`);
      if (chart.kind === 'rung-bars' && count > 160) fail(`category "${datum.label}" needs more than 160 rungs. Increase unit or use a unit-field chart.`);
    });
    return;
  }
  textValue(chart.valueLabel, 'valueLabel');
  if (chart.kind === 'barcode') {
    const timestamps = new Set<string>();
    data.forEach((datum, index) => {
      textValue(datum.date, `data[${index}].date`);
      const timestamp = validDate(datum.date, `data[${index}].date`);
      uniqueValue(timestamps, String(timestamp), `duplicate timestamp "${datum.date}"`);
      finiteValue(datum.value, `data[${index}].value`, true, true);
      if (datum.note !== undefined && typeof datum.note !== 'string') fail(`data[${index}].note must be text.`);
    });
    return;
  }
  const coordinates = new Set<string>();
  const rowNames = new Set<string>();
  const columnNames = new Set<string>();
  data.forEach((datum, index) => {
    textValue(datum.row, `data[${index}].row`);
    textValue(datum.column, `data[${index}].column`);
    uniqueValue(coordinates, JSON.stringify([datum.row.trim(), datum.column.trim()]), `duplicate matrix coordinate "${datum.row}" / "${datum.column}"`);
    rowNames.add(datum.row.trim());
    columnNames.add(datum.column.trim());
    finiteValue(datum.value, `data[${index}].value`, true, false);
  });
  if (rowNames.size * columnNames.size > 2400) fail('the matrix would exceed 2400 cells. Split the rows or columns into smaller comparisons.');
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(`${label} must be an object.`);
  // SAFETY: the checks above exclude null and arrays; values are validated before use.
  return value as Record<string, unknown>;
}

function textValue(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be nonempty text.`);
}

function finiteValue(value: unknown, label: string, nullable: boolean, signed: boolean): asserts value is number | null {
  if (nullable && value === null) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || (!signed && value < 0)) fail(`${label} must be a finite ${signed ? '' : 'nonnegative '}number${nullable ? ' or null' : ''}.`);
}

function uniqueValue(seen: Set<string>, value: string, message: string) {
  if (seen.has(value)) fail(`${message}.`);
  seen.add(value);
}

function validDate(value: string, label: string): number {
  const pattern = /^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/u;
  const timestamp = Date.parse(value);
  const day = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  if (!pattern.test(value) || !Number.isFinite(timestamp) || !Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== value.slice(0, 10)) fail(`${label} must be a real ISO date (YYYY-MM-DD) or timestamp with Z or a timezone offset.`);
  return timestamp;
}

function fail(message: string): never {
  throw new Error(`LieflatChart: ${message}`);
}
/* oxlint-enable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type */

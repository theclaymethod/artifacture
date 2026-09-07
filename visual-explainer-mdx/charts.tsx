/// <reference types="vite/client" />
import React, { useId } from 'react';
import './charts.css';

export type ChartDatum = { label: string; value: number | null };
export type DataChartProps = {
  data: ChartDatum[];
  title: string;
  kind?: 'bar' | 'line' | 'dot';
  description?: string;
  valueLabel?: string;
  formatValue?: (value: number) => string;
  source?: { label: string; url?: string };
};

type MeasuredDatum = ChartDatum & { numeric: number | null; display: string; lines: string[] };
const ink = 'var(--ve-heading, #242424)';
const muted = 'var(--ve-muted, #66645f)';
const rule = 'var(--ve-rule, #d8d6d0)';
const font = 'var(--ve-font-body, Inter, sans-serif)';

export function DataChart({ data, title, kind = 'bar', description, valueLabel, formatValue = String, source }: DataChartProps) {
  const id = `ve-chart-${useId().replace(/:/g, '')}`;
  const measured: MeasuredDatum[] = data.map((datum) => {
    const numeric = datum.value !== null && Number.isFinite(datum.value) ? datum.value : null;
    return { ...datum, numeric, display: numeric === null ? 'No data' : formatValue(numeric), lines: wrapLabel(datum.label, 24) };
  });
  const values = measured.flatMap((datum) => datum.numeric === null ? [] : [datum.numeric]);
  // Normalize before subtracting extrema so opposite, very large values stay finite.
  const magnitude = Math.max(1, ...values.map(Math.abs));
  const low = Math.min(0, ...values.map((value) => value / magnitude));
  const high = Math.max(0, ...values.map((value) => value / magnitude));
  const fraction = (value: number) => (value / magnitude - low) / (high - low || 1);
  const valueWidth = Math.max(80, ...measured.map((datum) => datum.display.length * 8 + 16), (valueLabel?.length ?? 0) * 8 + 16);
  const summary = `${description ? `${description} ` : ''}${valueLabel ? `${valueLabel}. ` : ''}${measured.map((datum) => `${datum.label}: ${datum.display}`).join('; ')}.`;
  const isLine = kind === 'line';
  const categoryWidth = Math.max(120, ...measured.map((datum) => Math.min(24, datum.label.length) * 8 + 24));
  const slot = Math.max(104, valueWidth + 24);
  const lineMargin = Math.max(48, slot / 2);
  const width = isLine ? Math.max(640, lineMargin * 2 + Math.max(1, data.length - 1) * slot) : Math.max(640, categoryWidth + valueWidth + 288);
  const plotLeft = isLine ? lineMargin : categoryWidth + 16;
  const plotRight = width - (isLine ? lineMargin : valueWidth + 24);
  const rowHeights = measured.map((datum) => Math.max(48, datum.lines.length * 20 + 20));
  const lineTop = 48;
  const lineBottom = 280;
  const height = isLine ? 320 + Math.max(1, ...measured.map((datum) => wrapLabel(datum.label, Math.floor(slot / 8) - 2).length)) * 20 : rowHeights.reduce((sum, row) => sum + row, 0) + 64;
  const x = (index: number) => data.length < 2 ? (plotLeft + plotRight) / 2 : plotLeft + index / (data.length - 1) * (plotRight - plotLeft);
  const y = (value: number) => lineBottom - fraction(value) * (lineBottom - lineTop);
  const barX = (value: number) => plotLeft + fraction(value) * (plotRight - plotLeft);
  const zero = isLine ? y(0) : barX(0);
  const rowCenters: number[] = [];
  let rowTop = 40;
  rowHeights.forEach((row) => { rowCenters.push(rowTop + row / 2); rowTop += row; });
  const paths: string[] = [];
  let current = '';
  measured.forEach((datum, index) => {
    if (datum.numeric === null) {
      if (current) paths.push(current);
      current = '';
    } else current += `${current ? ' L' : 'M'} ${x(index)} ${y(datum.numeric)}`;
  });
  if (current) paths.push(current);
  return (
    <figure className="ve-data-chart" data-ve-chart={kind} style={{ margin: 0, minWidth: 0, fontFamily: font, color: ink }}>
      <figcaption style={{ marginBottom: 24 }}>
        <h2 id={`${id}-title`} style={{ margin: 0, color: ink, fontFamily: font, fontSize: '1.2rem', fontWeight: 600, lineHeight: 1.35 }}>{title}</h2>
        {description ? <p style={{ margin: '8px 0 0', color: muted, fontSize: '0.95rem', lineHeight: 1.6, maxWidth: '65ch' }}>{description}</p> : null}
      </figcaption>
      {data.length ? (
        <>
        <div aria-label={`${title}, scroll to explore`} className="ve-chart-wide" role="region" style={{ overflowX: 'auto', overscrollBehaviorX: 'contain', scrollbarColor: `${muted} transparent` }} tabIndex={0}>
          <svg aria-labelledby={`${id}-svg-title ${id}-description`} role="img" style={{ display: 'block', minWidth: width, width: '100%', height: 'auto', fontFamily: font, background: 'transparent' }} viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg">
            <title id={`${id}-svg-title`}>{title}</title>
            <desc id={`${id}-description`}>{summary}</desc>
            {isLine ? (
              <>
                <line stroke={rule} x1={plotLeft} x2={plotRight} y1={zero} y2={zero} />
                <text fill={muted} fontSize="14" textAnchor="end" x={plotLeft - 12} y={zero + 5}>0</text>
                {valueLabel ? <text fill={muted} fontSize="14" x={plotLeft} y="20">{valueLabel}</text> : null}
                {paths.map((path, index) => <path d={path} fill="none" key={index} stroke={ink} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />)}
                {measured.map((datum, index) => (
                  <g key={index}>
                    <title>{`${datum.label}: ${datum.display}`}</title>
                    {datum.numeric !== null ? <circle cx={x(index)} cy={y(datum.numeric)} fill={ink} r="4" /> : null}
                    <text fill={datum.numeric === null ? muted : ink} fontSize="14" style={{ fontVariantNumeric: 'tabular-nums' }} textAnchor="middle" x={x(index)} y={datum.numeric === null ? (lineTop + lineBottom) / 2 : y(datum.numeric) - 14}>{datum.display}</text>
                    <text fill={muted} fontSize="14" textAnchor="middle" x={x(index)} y={lineBottom + 32}>
                      {wrapLabel(datum.label, Math.floor(slot / 8) - 2).map((line, lineIndex) => <tspan dy={lineIndex ? 20 : 0} key={lineIndex} x={x(index)}>{line}</tspan>)}
                    </text>
                  </g>
                ))}
              </>
            ) : (
              <>
                <line stroke={rule} x1={zero} x2={zero} y1="32" y2={height - 20} />
                <text fill={muted} fontSize="14" textAnchor="middle" x={zero} y="20">0</text>
                {valueLabel ? <text fill={muted} fontSize="14" textAnchor="end" x={width - 8} y="20">{valueLabel}</text> : null}
                {measured.map((datum, index) => {
                  const cy = rowCenters[index]!;
                  const valueX = datum.numeric === null ? zero : barX(datum.numeric);
                  return (
                    <g key={index}>
                      <title>{`${datum.label}: ${datum.display}`}</title>
                      <text fill={ink} fontSize="14" x="8" y={cy - (datum.lines.length - 1) * 10 + 5}>
                        {datum.lines.map((line, lineIndex) => <tspan dy={lineIndex ? 20 : 0} key={lineIndex} x="8">{line}</tspan>)}
                      </text>
                      {datum.numeric !== null ? kind === 'dot' ? (
                        <circle cx={valueX} cy={cy} fill={ink} r="5" />
                      ) : datum.numeric === 0 ? (
                        <line stroke={ink} strokeWidth="2" x1={zero} x2={zero} y1={cy - 6} y2={cy + 6} />
                      ) : <rect fill={ink} height="12" width={Math.abs(valueX - zero)} x={Math.min(zero, valueX)} y={cy - 6} /> : null}
                      <text fill={datum.numeric === null ? muted : ink} fontSize="14" style={{ fontVariantNumeric: 'tabular-nums' }} textAnchor="end" x={width - 8} y={cy + 5}>{datum.display}</text>
                    </g>
                  );
                })}
              </>
            )}
          </svg>
        </div>
        <NarrowChart fraction={fraction} id={id} kind={kind} measured={measured} summary={summary} valueLabel={valueLabel} />
        </>
      ) : <p role="status" style={{ margin: 0, color: muted, fontSize: '1rem', lineHeight: 1.5 }}>No data to display.</p>}
      {source ? <p style={{ margin: '16px 0 0', color: muted, fontSize: '0.875rem', lineHeight: 1.5 }}>Source: {source.url ? <a href={source.url} style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: '0.2em' }}>{source.label}</a> : source.label}</p> : null}
    </figure>
  );
}

function NarrowChart({ measured, kind, fraction, id, summary, valueLabel }: {
  measured: MeasuredDatum[];
  kind: 'bar' | 'line' | 'dot';
  fraction: (value: number) => number;
  id: string;
  summary: string;
  valueLabel?: string;
}) {
  const zero = fraction(0) * 100;
  const trackPosition = (percent: number) => `calc(${percent}% + ${6 - percent * 0.12}px)`;
  const lineX = (index: number) => measured.length < 2 ? 168 : 32 + index / (measured.length - 1) * 272;
  const lineY = (value: number) => 192 - fraction(value) * 172;
  const paths: string[] = [];
  let path = '';
  measured.forEach((datum, index) => {
    if (datum.numeric === null) {
      if (path) paths.push(path);
      path = '';
    } else path += `${path ? ' L' : 'M'} ${lineX(index)} ${lineY(datum.numeric)}`;
  });
  if (path) paths.push(path);
  return (
    <div className="ve-chart-narrow">
      {valueLabel ? <p className="ve-chart-unit">{valueLabel}</p> : null}
      {kind === 'line' ? (
        <>
          <div className="ve-chart-line-plot">
            <span aria-hidden="true" className="ve-chart-line-zero" style={{ top: `${lineY(0) / 212 * 100}%` }}>0</span>
            <svg aria-describedby={`${id}-narrow-description`} aria-labelledby={`${id}-title`} role="img" viewBox="0 0 320 212" xmlns="http://www.w3.org/2000/svg">
              <desc id={`${id}-narrow-description`}>{summary} Categories run left to right in the order listed below.</desc>
              <line stroke={rule} x1="32" x2="304" y1={lineY(0)} y2={lineY(0)} />
              {paths.map((segment, index) => <path d={segment} fill="none" key={index} stroke={ink} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />)}
              {measured.map((datum, index) => datum.numeric === null ? null : <circle cx={lineX(index)} cy={lineY(datum.numeric)} fill={ink} key={index} r="4"><title>{`${datum.label}: ${datum.display}`}</title></circle>)}
            </svg>
          </div>
          <div aria-hidden="true" className="ve-chart-line-ends"><span>{measured[0]?.label}</span><span>{measured.length > 1 ? measured.at(-1)?.label : null}</span></div>
        </>
      ) : <div aria-hidden="true" className="ve-chart-scale"><span style={{ left: trackPosition(zero) }}>0</span></div>}
      <ul className="ve-chart-values">
        {measured.map((datum, index) => {
          const position = datum.numeric === null ? zero : fraction(datum.numeric) * 100;
          return (
            <li data-ve-chart-row key={index}>
              <div className="ve-chart-value-row"><span>{datum.label}</span><span data-ve-chart-value>{datum.display}</span></div>
              {kind !== 'line' ? (
                <div aria-hidden="true" className="ve-chart-track">
                  <span className="ve-chart-zero" style={{ left: trackPosition(zero) }} />
                  {datum.numeric !== null ? kind === 'dot' ? <span className="ve-chart-dot" style={{ left: trackPosition(position) }} /> : datum.numeric === 0 ? <span className="ve-chart-zero-value" style={{ left: trackPosition(zero) }} /> : <span className="ve-chart-bar" style={{ left: trackPosition(Math.min(zero, position)), width: `calc(${Math.abs(position - zero)}% - ${Math.abs(position - zero) * 0.12}px)` }} /> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function wrapLabel(value: string, limit: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of value.trim().split(/\s+/u).filter(Boolean)) {
    if (line && `${line} ${word}`.length <= limit) { line += ` ${word}`; continue; }
    if (line) lines.push(line);
    const chars = Array.from(word);
    while (chars.length > limit) lines.push(chars.splice(0, limit).join(''));
    line = chars.join('');
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

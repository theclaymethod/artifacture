import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import type { ThreadsSpec } from './lieflat-types';
import './lieflat-threads.css';

// Runtime boundary shared by JSON authoring and direct component use.
/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters */
export function validateThreadsSpec(value: unknown): asserts value is ThreadsSpec {
  if (!value || typeof value !== 'object') throw new Error('Threads: provide a chart specification.');
  // SAFETY: object shape is established; every nested field is checked before returning.
  const spec = value as Partial<ThreadsSpec>;
  const text = (item: unknown): item is string => typeof item === 'string' && item.trim().length > 0;
  if (spec.kind !== 'threads' || !Array.isArray(spec.stages) || spec.stages.length < 2 || spec.stages.length > 5 || !spec.stages.every(text)) {
    throw new Error('Threads: provide two to five named stages.');
  }
  if (new Set(spec.stages).size !== spec.stages.length) throw new Error('Threads: stage names must be unique.');
  if (!text(spec.unitLabel)) throw new Error('Threads: name the real unit represented by each thread.');
  if (!Array.isArray(spec.records) || spec.records.length > 250) throw new Error('Threads: provide up to 250 records; split larger datasets into meaningful cohorts.');
  const ids = new Set<string>();
  for (const record of spec.records) {
    if (!record || !text(record.id) || ids.has(record.id)) throw new Error('Threads: each record needs a unique, nonempty id.');
    if (!Array.isArray(record.path) || record.path.length !== spec.stages.length || !record.path.every(text)) throw new Error(`Threads: ${record.id} needs one named category at every stage.`);
    if (record.note !== undefined && !text(record.note)) throw new Error(`Threads: ${record.id} has an empty or invalid note.`);
    ids.add(record.id);
  }
}
/* oxlint-enable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters */

export function ThreadPlot({ spec }: { spec: ThreadsSpec }) {
  validateThreadsSpec(spec);
  const [selected, setSelected] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(840);
  const id = useId();
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const active = spec.records.find((record) => record.id === selected);
  const groups = spec.stages.map((_, stage) => Array.from(new Set(spec.records.map((record) => record.path[stage]))));
  // Space for each real record, plus a separate label band for each category.
  const maxGroups = Math.max(1, ...groups.map((stage) => stage.length));
  const portrait = availableWidth < 680 && maxGroups <= 4 && groups.every((stage) => stage.every((label) => label.length * 8 <= availableWidth / stage.length));
  const rowHeight = Math.max(3, Math.min(7, 300 / Math.max(1, spec.records.length)));
  const wrap = (text: string) => text.match(/.{1,20}(?:\s|$)|.{1,20}/gu)?.map((line) => line.trim()) ?? [text];
  const labelBand = Math.max(1, ...groups.flat().map((label) => wrap(`${label} · 250`).length)) * 18 + 6;
  const plotHeight = spec.records.length * rowHeight + maxGroups * (labelBand + 18);
  const width = Math.max(availableWidth, 680, spec.stages.length * 260);
  const height = plotHeight + 42;
  const x = (stage: number) => 16 + stage / (spec.stages.length - 1) * (width - 164);
  const positions = spec.stages.map((_, stage) => {
    const points = new Map<string, number>();
    const labels: { label: string; count: number; y: number }[] = [];
    let offset = 14;
    for (const category of groups[stage]) {
      const records = spec.records.filter((record) => record.path[stage] === category);
      labels.push({ label: category, count: records.length, y: offset });
      offset += labelBand;
      records.forEach((record) => { points.set(record.id, offset); offset += rowHeight; });
      offset += 18;
    }
    return { points, labels };
  });
  const path = (recordId: string) => spec.stages.slice(1).map((_, index) => {
    const startX = x(index), endX = x(index + 1);
    const startY = positions[index].points.get(recordId)!, endY = positions[index + 1].points.get(recordId)!;
    const middle = (startX + endX) / 2;
    return `${index === 0 ? `M ${startX} ${startY}` : ''} C ${middle} ${startY}, ${middle} ${endY}, ${endX} ${endY}`;
  }).join(' ');
  return (
    <div className="ve-lieflat-threads" ref={container}>
      {spec.records.length === 0 ? <p>No records to display.</p> : <>
        <div className="ve-thread-control">
          <label htmlFor={`${id}-trace`}>Trace a {spec.unitLabel}</label>
          <select id={`${id}-trace`} value={active?.id ?? ''} onChange={(event) => setSelected(event.target.value)}>
            <option value="">All {spec.records.length} records</option>
            {spec.records.map((record) => <option key={record.id} value={record.id}>{record.id} — {record.path.join(' → ')}</option>)}
          </select>
        </div>
        {portrait ? <PortraitThreads spec={spec} width={availableWidth} activeId={active?.id} /> : <>
        {availableWidth < width ? <p className="ve-thread-scroll-hint">Scroll across to follow all {spec.stages.length} stages, or choose a record to read its complete route below.</p> : null}
        <div className="ve-thread-scroll" role="region" aria-label="Record paths; scroll horizontally on a narrow screen" tabIndex={0}>
          <div className="ve-thread-stage-headings" style={{ width }}>
            {spec.stages.map((stage, index) => <span key={stage} style={{ left: x(index), width: 148 }}>{stage}</span>)}
          </div>
          <svg role="img" aria-labelledby={`${id}-title ${id}-description`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} data-ve-thread-plot>
            <title id={`${id}-title`}>{`${spec.records.length} ${spec.unitLabel} paths through ${spec.stages.join(', ')}`}</title>
            <desc id={`${id}-description`}>Each fine line is one record. The data table lists every path. {active ? `Selected: ${active.id}, ${active.path.join(', ')}.` : ''}</desc>
            {[...spec.records.filter((record) => record.id !== active?.id), ...(active ? [active] : [])].map((record) => <path key={record.id} data-ve-thread={record.id} d={path(record.id)} fill="none" stroke="currentColor" strokeWidth={active?.id === record.id ? 1.8 : 0.85} opacity={active ? active.id === record.id ? 1 : 0.08 : 0.23} />)}
            {positions.map((position, stage) => <g key={spec.stages[stage]}>
              {position.labels.map((group) => <text className="ve-thread-label" key={group.label} x={x(stage)} y={group.y} fontSize="14">{wrap(`${group.label} · ${group.count}`).map((line, index) => <tspan key={index} x={x(stage)} dy={index ? 18 : 0}>{line}</tspan>)}</text>)}
              {spec.records.map((record) => <circle key={record.id} cx={x(stage)} cy={position.points.get(record.id)} r={active?.id === record.id ? 3.2 : 1.5} fill="currentColor" opacity={active && active.id !== record.id ? 0.2 : 0.85}><title>{`${record.id}: ${record.path[stage]}`}</title></circle>)}
            </g>)}
          </svg>
        </div>
        </>}
        <p className="ve-thread-selection" aria-live="polite">{active ? <><strong>{active.id}</strong> · {active.path.join(' → ')}{active.note ? `. ${active.note}` : ''}</> : null}</p>
        <details className="ve-lieflat-data">
          <summary>View the data</summary>
          <div className="ve-thread-table-scroll"><table><caption>Individual {spec.unitLabel} paths</caption><thead><tr><th scope="col">Record</th>{spec.stages.map((stage) => <th key={stage} scope="col">{stage}</th>)}<th scope="col">Note</th></tr></thead><tbody>
            {spec.records.map((record) => <tr key={record.id}><th scope="row">{record.id}</th>{record.path.map((category, index) => <td key={index}>{category}</td>)}<td>{record.note ?? '—'}</td></tr>)}
          </tbody></table></div>
        </details>
      </>}
    </div>
  );
}

function PortraitThreads({ spec, width, activeId }: { spec: ThreadsSpec; width: number; activeId?: string }) {
  const id = useId();
  const stages = spec.stages.map((name, stage) => {
    const categories = Array.from(new Set(spec.records.map((record) => record.path[stage])));
    const cellWidth = width / categories.length;
    const coordinates = new Map<string, number>();
    const groups = categories.map((category, index) => {
      const records = spec.records.filter((record) => record.path[stage] === category);
      const center = (index + 0.5) * cellWidth;
      const spacing = Math.min(5, (cellWidth - 12) / Math.max(1, records.length - 1));
      records.forEach((record, offset) => coordinates.set(record.id, center + (offset - (records.length - 1) / 2) * spacing));
      return { category, count: records.length, center };
    });
    return { name, groups, coordinates, y: 120 + stage * 240, cellWidth };
  });
  const selected = spec.records.find((record) => record.id === activeId);
  const ordered = [...spec.records.filter((record) => record.id !== activeId), ...(selected ? [selected] : [])];
  const path = (recordId: string) => stages.slice(1).map((stage, index) => {
    const previous = stages[index];
    const x1 = previous.coordinates.get(recordId)!, x2 = stage.coordinates.get(recordId)!;
    const y1 = previous.y, y2 = stage.y - 96;
    return `M ${x1} ${y1} C ${x1} ${y1 + 64}, ${x2} ${y2 - 64}, ${x2} ${y2}`;
  }).join(' ');
  return <svg className="ve-thread-portrait" data-ve-thread-plot data-ve-thread-mode="vertical" role="img" aria-labelledby={`${id}-title`} viewBox={`0 0 ${width} ${stages.at(-1)!.y + 8}`} width={width} height={stages.at(-1)!.y + 8}>
    <title id={`${id}-title`}>{`${spec.records.length} record paths, read from top to bottom: ${spec.stages.join(', ')}`}</title>
    {ordered.map((record) => <path key={record.id} data-ve-thread={record.id} d={path(record.id)} fill="none" stroke="currentColor" strokeWidth={record.id === activeId ? 1.8 : 0.8} opacity={activeId ? record.id === activeId ? 1 : 0.08 : 0.3} />)}
    {stages.map((stage, index) => <g key={stage.name}>
      <text className="ve-thread-label" x="0" y={stage.y - 72} fontSize="16" fontWeight="600">{stage.name}</text>
      {stage.groups.map((group) => <g key={group.category}>
        <foreignObject x={group.center - stage.cellWidth / 2} y={stage.y - 62} width={stage.cellWidth} height="58"><div className="ve-thread-portrait-label"><span>{group.category}</span><span>{group.count}</span></div></foreignObject>
      </g>)}
      {spec.records.map((record) => <g key={record.id} opacity={activeId && record.id !== activeId ? 0.2 : 0.9}>
        {index > 0 ? <circle cx={stage.coordinates.get(record.id)} cy={stage.y - 96} r={record.id === activeId ? 2.5 : 1.3} fill="currentColor" /> : null}
        {index < stages.length - 1 ? <circle cx={stage.coordinates.get(record.id)} cy={stage.y} r={record.id === activeId ? 2.5 : 1.3} fill="currentColor" /> : null}
      </g>)}
    </g>)}
  </svg>;
}

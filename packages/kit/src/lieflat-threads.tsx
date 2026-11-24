import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { ThreadsSpec } from './lieflat-types.ts';

export function validateThreadsSpec(value: unknown): asserts value is ThreadsSpec {
  if (!value || typeof value !== 'object') {
    throw new Error('Threads: provide a chart specification.');
  }
  const spec = value as Partial<ThreadsSpec>;
  const text = (item: unknown): item is string =>
    typeof item === 'string' && item.trim().length > 0;
  if (
    spec.kind !== 'threads' ||
    !Array.isArray(spec.stages) ||
    spec.stages.length < 2 ||
    spec.stages.length > 5 ||
    !spec.stages.every(text)
  ) {
    throw new Error('Threads: provide two to five named stages.');
  }
  if (new Set(spec.stages).size !== spec.stages.length) {
    throw new Error('Threads: stage names must be unique.');
  }
  if (!text(spec.unitLabel)) {
    throw new Error('Threads: name the real unit represented by each thread.');
  }
  if (!Array.isArray(spec.records) || spec.records.length > 250) {
    throw new Error(
      'Threads: provide up to 250 records; split larger datasets into meaningful cohorts.',
    );
  }
  const ids = new Set<string>();
  for (const record of spec.records) {
    if (!record || !text(record.id) || ids.has(record.id)) {
      throw new Error('Threads: each record needs a unique, nonempty id.');
    }
    if (
      !Array.isArray(record.path) ||
      record.path.length !== spec.stages.length ||
      !record.path.every(text)
    ) {
      throw new Error(`Threads: ${record.id} needs one named category at every stage.`);
    }
    if (record.note !== undefined && !text(record.note)) {
      throw new Error(`Threads: ${record.id} has an empty or invalid note.`);
    }
    ids.add(record.id);
  }
}

export function ThreadPlot({ spec }: { spec: ThreadsSpec }) {
  validateThreadsSpec(spec);
  const [selected, setSelected] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(840);
  const id = useId();
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setAvailableWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const active = spec.records.find((record) => record.id === selected);
  const groups = spec.stages.map((_, stage) =>
    Array.from(new Set(spec.records.map((record) => record.path[stage]))),
  );
  const maxGroups = Math.max(1, ...groups.map((stage) => stage.length));
  const portrait =
    availableWidth < 680 &&
    maxGroups <= 4 &&
    groups.every((stage) =>
      stage.every((label) => label.length * 8 <= availableWidth / stage.length),
    );
  const rowHeight = Math.max(3, Math.min(7, 300 / Math.max(1, spec.records.length)));
  const wrap = (text: string) =>
    text.match(/.{1,20}(?:\s|$)|.{1,20}/gu)?.map((line) => line.trim()) ?? [text];
  const labelBand =
    Math.max(1, ...groups.flat().map((label) => wrap(`${label} · 250`).length)) * 18 + 6;
  const plotHeight = spec.records.length * rowHeight + maxGroups * (labelBand + 18);
  const width = Math.max(availableWidth, 680, spec.stages.length * 260);
  const height = plotHeight + 42;
  const x = (stage: number) => 16 + (stage / (spec.stages.length - 1)) * (width - 164);
  const positions = spec.stages.map((_, stage) => {
    const points = new Map<string, number>();
    const labels: { label: string; count: number; y: number }[] = [];
    let offset = 14;
    for (const category of groups[stage]) {
      const records = spec.records.filter((record) => record.path[stage] === category);
      labels.push({ label: category, count: records.length, y: offset });
      offset += labelBand;
      for (const record of records) {
        points.set(record.id, offset);
        offset += rowHeight;
      }
      offset += 18;
    }
    return { points, labels };
  });
  const path = (recordId: string) =>
    spec.stages
      .slice(1)
      .map((_, index) => {
        const startX = x(index);
        const endX = x(index + 1);
        const startY = positions[index].points.get(recordId)!;
        const endY = positions[index + 1].points.get(recordId)!;
        const middle = (startX + endX) / 2;
        return `${index === 0 ? `M ${startX} ${startY}` : ''} C ${middle} ${startY}, ${middle} ${endY}, ${endX} ${endY}`;
      })
      .join(' ');
  return (
    <div className="ve-lieflat-threads" ref={container}>
      {spec.records.length === 0 ? (
        <p>No records to display.</p>
      ) : (
        <>
          <div className="ve-thread-control">
            <label htmlFor={`${id}-trace`}>Trace a {spec.unitLabel}</label>
            <select
              id={`${id}-trace`}
              value={active?.id ?? ''}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">All {spec.records.length} records</option>
              {spec.records.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.id} — {record.path.join(' → ')}
                </option>
              ))}
            </select>
          </div>
          {portrait ? (
            <PortraitThreads spec={spec} width={availableWidth} activeId={active?.id} />
          ) : (
            <>
              {availableWidth < width ? (
                <p className="ve-thread-scroll-hint">
                  Scroll across to follow all {spec.stages.length} stages, or choose a record to
                  read its complete route below.
                </p>
              ) : null}
              <section
                className="ve-thread-scroll"
                aria-label="Record paths; scroll horizontally on a narrow screen"
              >
                <div className="ve-thread-stage-headings" style={{ width }}>
                  {spec.stages.map((stage, index) => (
                    <span key={stage} style={{ left: x(index), width: 148 }}>
                      {stage}
                    </span>
                  ))}
                </div>
                <svg
                  role="img"
                  aria-labelledby={`${id}-title ${id}-description`}
                  width={width}
                  height={height}
                  viewBox={`0 0 ${width} ${height}`}
                  data-ve-thread-plot
                >
                  <title id={`${id}-title`}>
                    {`${spec.records.length} ${spec.unitLabel} paths through ${spec.stages.join(', ')}`}
                  </title>
                  <desc id={`${id}-description`}>
                    Each fine line is one record. The data table lists every path.{' '}
                    {active ? `Selected: ${active.id}, ${active.path.join(', ')}.` : ''}
                  </desc>
                  {[
                    ...spec.records.filter((record) => record.id !== active?.id),
                    ...(active ? [active] : []),
                  ].map((record) => (
                    <path
                      key={record.id}
                      data-ve-thread={record.id}
                      d={path(record.id)}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={
                        active?.id === record.id
                          ? 'var(--ve-chart-active-stroke)'
                          : 'var(--ve-chart-stroke)'
                      }
                      opacity={active ? (active.id === record.id ? 1 : 0.08) : 0.23}
                    />
                  ))}
                  {positions.map((position, stage) => (
                    <g key={spec.stages[stage]}>
                      {position.labels.map((group) => (
                        <text
                          className="ve-thread-label"
                          key={group.label}
                          x={x(stage)}
                          y={group.y}
                          fontSize="14"
                        >
                          {wrap(`${group.label} · ${group.count}`).map((line, index) => (
                            <tspan key={line} x={x(stage)} dy={index ? 18 : 0}>
                              {line}
                            </tspan>
                          ))}
                        </text>
                      ))}
                      {spec.records.map((record) => (
                        <circle
                          key={record.id}
                          cx={x(stage)}
                          cy={position.points.get(record.id)}
                          r={active?.id === record.id ? 3.2 : 1.5}
                          fill="currentColor"
                          opacity={active && active.id !== record.id ? 0.2 : 0.85}
                        >
                          <title>{`${record.id}: ${record.path[stage]}`}</title>
                        </circle>
                      ))}
                    </g>
                  ))}
                </svg>
              </section>
            </>
          )}
          <p className="ve-thread-selection" aria-live="polite">
            {active ? (
              <>
                <strong>{active.id}</strong> · {active.path.join(' → ')}
                {active.note ? `. ${active.note}` : ''}
              </>
            ) : null}
          </p>
          <details className="ve-lieflat-data">
            <summary>View the data</summary>
            <div className="ve-thread-table-scroll">
              <table>
                <caption>Individual {spec.unitLabel} paths</caption>
                <thead>
                  <tr>
                    <th scope="col">Record</th>
                    {spec.stages.map((stage) => (
                      <th key={stage} scope="col">
                        {stage}
                      </th>
                    ))}
                    <th scope="col">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {spec.records.map((record) => (
                    <tr key={record.id}>
                      <th scope="row">{record.id}</th>
                      {record.path.map((category, index) => (
                        <td key={`${record.id}-${spec.stages[index]}`}>{category}</td>
                      ))}
                      <td>{record.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function PortraitThreads({
  spec,
  width,
  activeId,
}: {
  spec: ThreadsSpec;
  width: number;
  activeId?: string;
}) {
  const id = useId();
  const stages = spec.stages.map((name, stage) => {
    const categories = Array.from(new Set(spec.records.map((record) => record.path[stage])));
    const cellWidth = width / categories.length;
    const coordinates = new Map<string, number>();
    const groups = categories.map((category, index) => {
      const records = spec.records.filter((record) => record.path[stage] === category);
      const center = (index + 0.5) * cellWidth;
      const spacing = Math.min(5, (cellWidth - 12) / Math.max(1, records.length - 1));
      const start = center - ((records.length - 1) * spacing) / 2;
      records.forEach((record, offset) => {
        coordinates.set(record.id, start + offset * spacing);
      });
      return { label: category, count: records.length };
    });
    return { name, groups, coordinates };
  });
  const stageGap = 152;
  const height = 28 + (spec.stages.length - 1) * stageGap + 24;
  const y = (stage: number) => 28 + stage * stageGap;
  const path = (recordId: string) =>
    stages
      .slice(1)
      .map((_, index) => {
        const sx = stages[index].coordinates.get(recordId)!;
        const ex = stages[index + 1].coordinates.get(recordId)!;
        const sy = y(index);
        const ey = y(index + 1);
        const mid = (sy + ey) / 2;
        return `${index === 0 ? `M ${sx} ${sy}` : ''} C ${sx} ${mid}, ${ex} ${mid}, ${ex} ${ey}`;
      })
      .join(' ');
  return (
    <div style={{ position: 'relative' }}>
      <svg
        role="img"
        aria-label={`${spec.records.length} ${spec.unitLabel} paths`}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        {spec.records.map((record) => (
          <path
            key={record.id}
            d={path(record.id)}
            fill="none"
            stroke="currentColor"
            strokeWidth={
              activeId === record.id ? 'var(--ve-chart-active-stroke)' : 'var(--ve-chart-stroke)'
            }
            opacity={activeId ? (activeId === record.id ? 1 : 0.08) : 0.25}
          />
        ))}
        {stages.map((stage, sIdx) =>
          spec.records.map((record) => (
            <circle
              key={`${id}-${record.id}-${stage.name}`}
              cx={stage.coordinates.get(record.id)}
              cy={y(sIdx)}
              r={activeId === record.id ? 3.2 : 1.5}
              fill="currentColor"
              opacity={activeId && activeId !== record.id ? 0.2 : 0.85}
            />
          )),
        )}
      </svg>
    </div>
  );
}

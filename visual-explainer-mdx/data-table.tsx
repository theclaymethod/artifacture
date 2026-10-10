import type { ReactNode } from 'react';
import './data-table.css';

/** Factual-state tones. Each maps to one --ve-status-* ink and soft fill. */
export type StatusTone = 'ok' | 'info' | 'warn' | 'err' | 'neutral';
/** The outline cue that separates evidence tiers without color: solid (fact) or dashed and hatched (guess). */
export type KeyStroke = 'solid' | 'dashed';
export type KeyGlyph = 'rect' | 'oval' | 'diamond';

export type StatusPillProps = { tone: StatusTone; children: ReactNode };

/** A state label: one tone color, a tone dot and the visible text, so color is never the only cue. */
export function StatusPill({ tone, children }: StatusPillProps) {
  return (
    <span className="ve-status-pill" data-ve-tone={tone}>
      <span aria-hidden="true" className="ve-status-dot" />
      {children}
    </span>
  );
}

export type BadgeProps = { tone?: StatusTone; stroke?: KeyStroke; glyph?: KeyGlyph; children: ReactNode };

/** An outlined tag for flags, tiers and kinds. A dashed stroke adds hatching. */
export function Badge({ tone = 'neutral', stroke = 'solid', glyph, children }: BadgeProps) {
  return (
    <span className="ve-badge" data-ve-stroke={stroke} data-ve-tone={tone}>
      {glyph ? <KeySwatch glyph={glyph} stroke={stroke} tone={tone} /> : null}
      {children}
    </span>
  );
}

export type LegendItem = { label: string; tone?: StatusTone; stroke?: KeyStroke; glyph?: KeyGlyph; detail?: string };
export type LegendProps = { title?: string; items: readonly LegendItem[] };

/** A compact key. Each swatch repeats the exact tone, stroke and glyph that the figure uses. */
export function Legend({ title = 'Key', items }: LegendProps) {
  return (
    <div className="ve-legend" data-ve-legend>
      <p className="ve-legend-title">{title}</p>
      <ul>
        {items.map((item) => (
          <li key={`${item.label}-${item.tone ?? ''}-${item.stroke ?? ''}-${item.glyph ?? ''}`}>
            <KeySwatch glyph={item.glyph ?? 'rect'} stroke={item.stroke ?? 'solid'} tone={item.tone ?? 'neutral'} />
            <span className="ve-legend-label">{item.label}</span>
            {item.detail ? <span className="ve-legend-detail">{item.detail}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function KeySwatch({ tone, stroke, glyph }: { tone: StatusTone; stroke: KeyStroke; glyph: KeyGlyph }) {
  const paint = { fill: `var(--ve-status-${tone}-soft)`, stroke: `var(--ve-status-${tone})`, strokeWidth: 1.5, strokeDasharray: stroke === 'dashed' ? '3 2' : undefined };
  return (
    <svg aria-hidden="true" className="ve-key-swatch" height="16" viewBox="0 0 22 16" width="22">
      {glyph === 'diamond' ? <polygon {...paint} points="11,1.5 20.5,8 11,14.5 1.5,8" />
        : <rect {...paint} height="13" rx={glyph === 'oval' ? 6.5 : 3} width="19" x="1.5" y="1.5" />}
      {stroke === 'dashed' ? <path d="M4 13 L13 3 M10 14 L19 4" stroke={`var(--ve-status-${tone})`} strokeWidth="1" /> : null}
    </svg>
  );
}

export type DataTableBadge = { label: string; tone?: StatusTone; stroke?: KeyStroke; glyph?: KeyGlyph };
/** A rich cell. `status` draws a StatusPill; `badges` draws flags after the text. */
/** `text` and `note` show `backtick` spans as inline code. */
export type DataTableCell = {
  text?: string;
  href?: string;
  status?: StatusTone;
  badges?: readonly DataTableBadge[];
  note?: string;
};
export type DataTableValue = string | number | null | DataTableCell;
/**
 * Column kinds set the scan treatment: `id` is monospace and unwrapped, `number` is right-aligned
 * with tabular figures, `status` holds a pill, and `text` wraps long prose.
 */
export type DataTableColumn = { key: string; label: string; kind?: 'text' | 'id' | 'number' | 'status' | 'tags'; width?: string };
export type DataTableRow = { id?: string; cells: Readonly<Partial<Record<string, DataTableValue>>> };
export type DataTableProps = { columns: readonly DataTableColumn[]; rows: readonly DataTableRow[]; caption?: string; label?: string };

/**
 * A table built for scanning: a sticky header, subtle zebra rows, right-aligned numbers,
 * monospace identifiers, state pills and flag badges. Below 640px each row becomes a labelled card,
 * so it never scrolls sideways.
 */
export function DataTable({ columns, rows, caption, label }: DataTableProps) {
  return (
    <div className="ve-data-table" data-ve-data-table>
      <table aria-label={caption ? undefined : label}>
        {caption ? <caption>{caption}</caption> : null}
        <colgroup>
          {columns.map((column) => <col key={column.key} style={column.width ? { width: column.width } : undefined} />)}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => <th data-ve-kind={column.kind ?? 'text'} key={column.key} scope="col">{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr id={row.id} key={row.id ?? index}>
              {columns.map((column) => (
                <td data-label={column.label} data-ve-kind={column.kind ?? 'text'} key={column.key}>
                  <TableCell kind={column.kind ?? 'text'} value={row.cells[column.key] ?? null} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Text with `backtick` spans shown as inline code. The text stays React text, never markup. */
function InlineText({ text }: { text: string }) {
  if (!text.includes('`')) return <>{text}</>;
  return <>{text.split('`').map((part, index) => index % 2 ? <code className="ve-cell-code" key={index}>{part}</code> : part)}</>;
}

function isRichCell(value: DataTableValue): value is DataTableCell {
  return value !== null && Object(value) === value;
}

function TableCell({ value, kind }: { value: DataTableValue; kind: NonNullable<DataTableColumn['kind']> }) {
  if (value === null) return <span className="ve-cell-empty">none</span>;
  const cell: DataTableCell = isRichCell(value) ? value : { text: String(value) };
  const text = cell.text ?? '';
  const body = cell.status ? <StatusPill tone={cell.status}>{text}</StatusPill>
    : kind === 'id' ? <code className="ve-cell-id">{text}</code>
      : <InlineText text={text} />;
  return (
    <span className="ve-cell">
      {cell.href ? <a className="ve-cell-link" href={cell.href}>{body}</a> : body}
      {cell.badges?.length ? (
        <span className="ve-cell-badges">
          {cell.badges.map((badge) => <Badge glyph={badge.glyph} key={badge.label} stroke={badge.stroke} tone={badge.tone}>{badge.label}</Badge>)}
        </span>
      ) : null}
      {cell.note ? <span className="ve-cell-note"><InlineText text={cell.note} /></span> : null}
    </span>
  );
}

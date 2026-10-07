export type DiffRow = {
  kind: 'context' | 'add' | 'remove' | 'hunk';
  oldNo?: number;
  newNo?: number;
  code: string;
  html?: string;
};

export function diffLines(before: string, after: string): DiffRow[];
export type AlignedDiffRow = { kind: 'context' | 'change'; before?: DiffRow; after?: DiffRow } | { kind: 'hunk'; code: string };
export function alignDiffRows(rows: readonly DiffRow[]): AlignedDiffRow[];

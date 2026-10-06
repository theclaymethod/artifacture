export type DiffRow = {
  kind: 'context' | 'add' | 'remove' | 'hunk';
  oldNo?: number;
  newNo?: number;
  code: string;
  html?: string;
};

export function diffLines(before: string, after: string): DiffRow[];

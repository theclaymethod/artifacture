export type RungBarsSpec = {
  kind: 'rung-bars';
  data: { label: string; value: number | null }[];
  unit: number;
  unitLabel: string;
};

export type UnitFieldSpec = {
  kind: 'unit-field';
  data: { label: string; value: number }[];
  unit: number;
  unitLabel: string;
};

export type BarcodeSpec = {
  kind: 'barcode';
  data: { date: string; value: number | null; note?: string }[];
  valueLabel: string;
};

export type BubbleMatrixSpec = {
  kind: 'bubble-matrix';
  data: { row: string; column: string; value: number | null }[];
  valueLabel: string;
};

export type ThreadsSpec = {
  kind: 'threads';
  stages: string[];
  records: { id: string; path: string[]; note?: string }[];
  unitLabel: string;
};

export type LieflatChartSpec = RungBarsSpec | UnitFieldSpec | BarcodeSpec | BubbleMatrixSpec | ThreadsSpec;

export type LieflatChartProps = {
  spec: LieflatChartSpec;
  title: string;
  description?: string;
  source?: { label: string; url?: string };
};

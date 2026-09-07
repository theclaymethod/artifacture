import type { LieflatChartSpec, ThreadsSpec } from '../../visual-explainer-mdx/lieflat-types';

// Invented workshop records for demonstrating chart authoring, not research data.
const cohorts: [string, string, string, number][] = [
  ['Lamps', 'Cable', 'Repaired', 10],
  ['Lamps', 'Switch', 'Repaired', 8],
  ['Lamps', 'Circuit', 'Awaiting parts', 4],
  ['Lamps', 'Circuit', 'Beyond repair', 2],
  ['Headphones', 'Cable', 'Repaired', 9],
  ['Headphones', 'Battery', 'Repaired', 5],
  ['Headphones', 'Circuit', 'Beyond repair', 4],
  ['Kettles', 'Switch', 'Repaired', 9],
  ['Kettles', 'Cable', 'Repaired', 3],
  ['Kettles', 'Circuit', 'Awaiting parts', 4],
  ['Radios', 'Battery', 'Repaired', 6],
  ['Radios', 'Switch', 'Repaired', 4],
  ['Radios', 'Circuit', 'Awaiting parts', 2],
  ['Radios', 'Circuit', 'Beyond repair', 2],
];

const arrivals = [1, 1, 2, 1, 2, 4, 3, 1, 2, 2, 1, 3, 5, 4, 1, 1, 2, 2, 2, 7, 4, 1, 2, 2, 1, 2, 5, 3, 2, 3];
const dates = arrivals.flatMap((count, index) => Array.from({ length: count }, () => `2026-06-${String(index + 1).padStart(2, '0')}`));
let recordIndex = 0;
export const repairRecords: (ThreadsSpec['records'][number] & { date: string })[] = cohorts.flatMap(([device, fault, outcome, count]) =>
  Array.from({ length: count }, () => ({ date: dates[recordIndex], id: `Repair ${String(++recordIndex).padStart(2, '0')}`, path: [device, fault, outcome] })),
);
repairRecords[0].note = 'A replacement cable returned this lamp to use.';
const devices = ['Lamps', 'Headphones', 'Kettles', 'Radios'];
const faults = ['Cable', 'Switch', 'Battery', 'Circuit'];
const outcomes = ['Repaired', 'Awaiting parts', 'Beyond repair'];

export const repairOutcomes = { kind: 'unit-field', unit: 1, unitLabel: 'device', data: outcomes.map((label) => ({ label, value: repairRecords.filter((record) => record.path[2] === label).length })) } satisfies LieflatChartSpec;
export const repairDevices = { kind: 'rung-bars', unit: 1, unitLabel: 'device', data: devices.map((label) => ({ label, value: repairRecords.filter((record) => record.path[0] === label).length })) } satisfies LieflatChartSpec;
export const repairTimeline = { kind: 'barcode', valueLabel: 'Devices brought in', data: Array.from(new Set(dates), (date) => {
  const value = repairRecords.filter((record) => record.date === date).length;
  if (date === '2026-06-20') return { date, value, note: 'Open repair session' };
  return { date, value };
}) } satisfies LieflatChartSpec;
export const repairFaults = { kind: 'bubble-matrix', valueLabel: 'Devices', data: devices.flatMap((row) => faults.map((column) => ({ row, column, value: repairRecords.filter((record) => record.path[0] === row && record.path[1] === column).length }))) } satisfies LieflatChartSpec;
export const repairPaths = { kind: 'threads', stages: ['Device', 'Fault', 'Outcome'], records: repairRecords, unitLabel: 'device' } satisfies ThreadsSpec;

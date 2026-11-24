import { describe, expect, it } from 'vitest';
import {
  alignDiffRows,
  assertValidSlideSpec,
  type ComparisonSlideSpec,
  createDagScene,
  diffLines,
  KIT_CATALOG,
  validateSlideSpec,
} from '../src/index.ts';

describe('@artifacture/kit contracts', () => {
  it('validates all semantic slide layouts and rejects overlong or empty specs', () => {
    const validComparison: ComparisonSlideSpec = {
      id: 'compare-ok',
      layout: 'comparison',
      title: 'Stock host comparison',
      takeaway: 'Keep slide orchestration in open-slide.',
      items: [
        { name: 'Stock open-slide', summary: 'Shared stage device and transitions.' },
        { name: 'Bespoke shell', summary: 'Custom dev scripts and presentation UI.' },
      ],
    };
    expect(validateSlideSpec(validComparison)).toEqual([]);
    expect(() => assertValidSlideSpec(validComparison)).not.toThrow();

    const invalid = validateSlideSpec({
      id: 'bad-case',
      layout: 'case',
      title: 'Too sparse case slide',
      takeaway: Array.from({ length: 32 }, (_, i) => `w${i}`).join(' '),
      subject: '',
      facts: [{ label: 'Only one', value: '1' }],
      outcome: 'Missing second fact and empty subject',
    });
    expect(invalid.map((issue) => issue.field)).toContain('subject');
    expect(invalid.map((issue) => issue.field)).toContain('facts');
    expect(invalid.map((issue) => issue.field)).toContain('takeaway');
  });

  it('computes unified and split diff alignment rows', () => {
    const rows = diffLines('alpha\nbeta\ngamma', 'alpha\nbeta2\ngamma');
    expect(rows.some((row) => row.kind === 'remove' && row.code === 'beta')).toBe(true);
    expect(rows.some((row) => row.kind === 'add' && row.code === 'beta2')).toBe(true);
    const aligned = alignDiffRows(rows);
    expect(aligned.some((row) => row.kind === 'change')).toBe(true);
  });

  it('constructs a valid DAG graphic scene from parent references', () => {
    const scene = createDagScene({
      id: 'test-dag',
      title: 'Pipeline graph',
      nodes: [
        { id: 'wgsl', label: 'WGSL source', parentIds: [] },
        { id: 'dawn', label: 'Dawn still', parentIds: ['wgsl'] },
      ],
    });
    expect(scene.objects.length).toBeGreaterThanOrEqual(2);
    expect(KIT_CATALOG.length).toBe(10);
  });
});

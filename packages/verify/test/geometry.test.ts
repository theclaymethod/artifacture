import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import {
  analyzePngBuffer,
  evaluateGeometryIssues,
  evaluateSvgGeometryIssues,
  type RawElementMetric,
} from '../src/index.ts';

function sampleMetric(overrides: Partial<RawElementMetric> = {}): RawElementMetric {
  return {
    tag: 'p',
    textSample: 'Sample readable caption',
    clientWidth: 400,
    scrollWidth: 400,
    clientHeight: 32,
    scrollHeight: 32,
    overflowX: 'visible',
    overflowY: 'visible',
    fontSizePx: 16,
    insideDenseCard: false,
    localScaleX: 1,
    ...overrides,
  };
}

describe('@artifacture/verify geometry and PNG inspection', () => {
  it('evaluates font scale without inverting scaled open-slide coordinates', () => {
    // Stage scaled to 0.6x with element inside matching stageScale (localScale = 1):
    // 10px stage font stays 10px logical (< 12.5px floor) and MUST be flagged!
    const undersizedOnScaledStage = evaluateGeometryIssues(
      [sampleMetric({ fontSizePx: 10, localScaleX: 0.6 })],
      0.6,
    );
    expect(undersizedOnScaledStage.undersizedCount).toBe(1);
    expect(undersizedOnScaledStage.violations[0]?.measured).toBe(10);

    // 16px stage font stays 16px logical (>= 12.5px floor) and MUST pass cleanly!
    const okOnScaledStage = evaluateGeometryIssues(
      [sampleMetric({ fontSizePx: 16, localScaleX: 0.6 })],
      0.6,
    );
    expect(okOnScaledStage.violations).toEqual([]);
  });

  it('flags horizontal overflow and vertical clipping on hidden containers', () => {
    const result = evaluateGeometryIssues([
      sampleMetric({ overflowX: 'hidden', clientWidth: 200, scrollWidth: 260 }),
      sampleMetric({ overflowY: 'hidden', clientHeight: 40, scrollHeight: 88 }),
    ]);
    expect(result.overflowCount).toBe(1);
    expect(result.clippedCount).toBe(1);
  });

  it('catches SVG label overlaps, SVG box spill, and viewport-edge clipping (past benchmark defects)', () => {
    const svgViolations = evaluateSvgGeometryIssues([
      { svgIndex: 0, textSample: 'twistAng', left: 100, top: 200, right: 170, bottom: 216 },
      { svgIndex: 0, textSample: 'quat', left: 145, top: 204, right: 190, bottom: 220 },
      {
        svgIndex: 1,
        textSample: 'SplatCollection([arrays(fileArrays, matrixWorld)])',
        left: 92,
        top: 300,
        right: 340,
        bottom: 316,
        parentBox: { left: 100, top: 290, right: 280, bottom: 330 },
      },
    ]);
    expect(svgViolations.filter((v) => v.kind === 'svg-text-overlap')).toHaveLength(1);
    expect(svgViolations.filter((v) => v.kind === 'svg-box-overflow')).toHaveLength(1);

    const vpClip = evaluateGeometryIssues([
      sampleMetric({
        textSample: 'DETERMINISTIC HASH & CORRIDOR MASK',
        rect: { left: 24, top: 695, right: 320, bottom: 738 },
        viewport: { width: 1280, height: 720 },
      }),
    ]);
    expect(vpClip.viewportClipCount).toBe(1);
  });

  it('computes non-zero RGB stddev from encoded PNG pixel data', () => {
    const png = new PNG({ width: 4, height: 4 });
    for (let i = 0; i < png.data.length; i += 4) {
      const shade = i * 8;
      png.data[i] = shade & 0xff;
      png.data[i + 1] = (shade + 40) & 0xff;
      png.data[i + 2] = (shade + 80) & 0xff;
      png.data[i + 3] = 255;
    }
    const metrics = analyzePngBuffer(PNG.sync.write(png));
    expect(metrics.width).toBe(4);
    expect(metrics.height).toBe(4);
    expect(metrics.stddev).toBeGreaterThan(0);
  });
});

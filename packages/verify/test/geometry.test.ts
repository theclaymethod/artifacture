import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import {
  analyzePngBuffer,
  checkStandaloneHtml,
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

  it('catches SVG frame edge clipping, tiny SVG labels, and body-to-nav overlaps', () => {
    const svgIssues = evaluateSvgGeometryIssues([
      {
        svgIndex: 0,
        textSample: '44.1 = 758.8 - 714.7',
        left: 1090,
        top: 40,
        right: 1185,
        bottom: 54,
        fontSizePx: 12,
        svgBox: { left: 0, top: 0, right: 1140, bottom: 420 },
      },
      {
        svgIndex: 0,
        textSample: 'micro label',
        left: 100,
        top: 120,
        right: 150,
        bottom: 130,
        fontSizePx: 8.5,
        svgBox: { left: 0, top: 0, right: 1140, bottom: 420 },
      },
    ]);
    expect(svgIssues.filter((v) => v.kind === 'svg-edge-clip')).toHaveLength(1);
    expect(svgIssues.filter((v) => v.kind === 'svg-undersized-text')).toHaveLength(1);

    const navCollision = evaluateGeometryIssues(
      [
        sampleMetric({
          textSample: 'Bottom bullet colliding with fixed footer nav',
          insideNav: false,
          rect: { left: 60, top: 650, right: 560, bottom: 684 },
          viewport: { width: 1280, height: 720 },
        }),
        sampleMetric({
          textSample: '01 / 04',
          insideNav: true,
          rect: { left: 1080, top: 664, right: 1240, bottom: 704 },
          viewport: { width: 1280, height: 720 },
        }),
      ],
      1,
      undefined,
      [],
      [{ left: 0, top: 660, right: 1280, bottom: 720 }],
    );
    expect(navCollision.navOverlapCount).toBe(1);
  });

  it('flags invalid HTML tags inside SVG, framework tag typos, and broken inline scripts', () => {
    const broken = `<!doctype html>
<html><body>
  <motion-div class="card"></motion-div>
  <svg viewBox="0 0 200 100"><text x="10" y="20"><code>bad()</code></text></svg>
  <script>function broken( { return 1; }</script>
</body></html>`;
    const issues = checkStandaloneHtml(broken, 'broken.html');
    expect(issues.map((i) => i.kind).sort()).toEqual([
      'inline-script-syntax',
      'malformed-tag',
      'svg-invalid-html-tag',
    ]);

    const clean = `<!doctype html>
<html><body>
  <div class="card"><code>ok()</code></div>
  <svg viewBox="0 0 200 100"><text x="10" y="20"><tspan>ok()</tspan></text></svg>
  <script>const x = 1 + 2; console.log(x);</script>
</body></html>`;
    expect(checkStandaloneHtml(clean, 'clean.html')).toEqual([]);
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

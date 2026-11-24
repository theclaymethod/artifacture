import type { Page } from 'playwright';

export interface GeometryThresholds {
  readonly stageFontMinPx: number;
  readonly denseCardFontMinPx: number;
  readonly overflowTolerancePx: number;
}

export const DEFAULT_GEOMETRY_THRESHOLDS: GeometryThresholds = {
  stageFontMinPx: 12.5,
  denseCardFontMinPx: 11,
  overflowTolerancePx: 1.5,
};

export interface GeometryViolation {
  readonly kind: 'overflow-x' | 'clipped-y' | 'undersized-text';
  readonly tag: string;
  readonly textSample: string;
  readonly measured: number;
  readonly threshold: number;
}

export interface GeometrySummary {
  readonly stageScale: number;
  readonly violations: readonly GeometryViolation[];
  readonly overflowCount: number;
  readonly clippedCount: number;
  readonly undersizedCount: number;
}

export interface RawElementMetric {
  readonly tag: string;
  readonly textSample: string;
  readonly clientWidth: number;
  readonly scrollWidth: number;
  readonly clientHeight: number;
  readonly scrollHeight: number;
  readonly overflowX: string;
  readonly overflowY: string;
  readonly fontSizePx: number;
  readonly insideDenseCard: boolean;
  readonly localScaleX: number;
}

/**
 * Pure evaluator computing overflow, vertical clipping, and logical font floors from element snapshots.
 */
export function evaluateGeometryIssues(
  elements: readonly RawElementMetric[],
  stageScale = 1,
  thresholds: GeometryThresholds = DEFAULT_GEOMETRY_THRESHOLDS,
): GeometrySummary {
  const violations: GeometryViolation[] = [];
  const safeStageScale = stageScale > 0.05 ? stageScale : 1;

  for (const el of elements) {
    if (
      (el.overflowX === 'hidden' || el.overflowX === 'clip') &&
      el.clientWidth > 0 &&
      el.scrollWidth > el.clientWidth + thresholds.overflowTolerancePx
    ) {
      violations.push({
        kind: 'overflow-x',
        tag: el.tag,
        textSample: el.textSample,
        measured: Number(el.scrollWidth.toFixed(1)),
        threshold: Number(el.clientWidth.toFixed(1)),
      });
    }

    if (
      (el.overflowY === 'hidden' || el.overflowY === 'clip') &&
      el.clientHeight > 0 &&
      el.textSample.length > 0 &&
      el.scrollHeight > el.clientHeight + thresholds.overflowTolerancePx
    ) {
      violations.push({
        kind: 'clipped-y',
        tag: el.tag,
        textSample: el.textSample,
        measured: Number(el.scrollHeight.toFixed(1)),
        threshold: Number(el.clientHeight.toFixed(1)),
      });
    }

    if (el.textSample.length > 0 && el.fontSizePx > 0) {
      const measuredScale = el.localScaleX > 0.05 ? el.localScaleX : safeStageScale;
      const localScale = measuredScale / safeStageScale;
      const logicalFontPx = el.fontSizePx * (localScale > 0.05 ? localScale : 1);
      const floor = el.insideDenseCard ? thresholds.denseCardFontMinPx : thresholds.stageFontMinPx;
      if (logicalFontPx < floor) {
        violations.push({
          kind: 'undersized-text',
          tag: el.tag,
          textSample: el.textSample,
          measured: Number(logicalFontPx.toFixed(2)),
          threshold: floor,
        });
      }
    }
  }

  return {
    stageScale: safeStageScale,
    violations,
    overflowCount: violations.filter((v) => v.kind === 'overflow-x').length,
    clippedCount: violations.filter((v) => v.kind === 'clipped-y').length,
    undersizedCount: violations.filter((v) => v.kind === 'undersized-text').length,
  };
}

/**
 * Walks the visible slide stage or document body in Playwright and flags clipping, overflow, and undersized text.
 */
export async function auditPageGeometry(
  page: Page,
  opts: { rootSelector?: string; thresholds?: GeometryThresholds } = {},
): Promise<GeometrySummary> {
  const { stageScale, elements } = await page.evaluate((rootSelector) => {
    const activeSlide = rootSelector
      ? document.querySelector<HTMLElement>(rootSelector)
      : (document.querySelector<HTMLElement>('[data-osd-current-page]') ?? document.body);

    const root = activeSlide ?? document.body;
    const scaledCandidate =
      Array.from([root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]).find(
        (el) =>
          el.offsetWidth >= 640 && Math.abs(el.getBoundingClientRect().width - el.offsetWidth) > 1,
      ) ?? root;
    const stageRect = scaledCandidate.getBoundingClientRect();
    const layoutWidth = scaledCandidate.offsetWidth || stageRect.width || 1920;
    const computedStageScale = layoutWidth > 0 ? stageRect.width / layoutWidth : 1;

    const collected: RawElementMetric[] = [];
    const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];

    for (const node of nodes) {
      if (
        node.closest(
          '[data-layout-audit-ignore="true"], [data-osd-freeze-motion], [data-artifacture-gpu], svg, .katex, .ve-code-shiki',
        )
      ) {
        continue;
      }
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        continue;
      }
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      let directText = '';
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          directText += child.textContent ?? '';
        }
      }
      const cleanDirectText = directText.replace(/\s+/g, ' ').trim();
      const anyText = (node.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 64);

      const localScaleX = node.offsetWidth > 0 ? rect.width / node.offsetWidth : computedStageScale;
      const fontSizePx = Number.parseFloat(style.fontSize) || 0;

      collected.push({
        tag: node.tagName.toLowerCase(),
        textSample: cleanDirectText
          ? cleanDirectText.slice(0, 64)
          : style.overflowY === 'hidden'
            ? anyText
            : '',
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        fontSizePx: cleanDirectText ? fontSizePx : 0,
        insideDenseCard: Boolean(
          node.closest(
            '[data-ve-chart], table, pre, code, .ve-code-block, .ve-diff-block, .ve-drill-card-hint',
          ),
        ),
        localScaleX,
      });
    }

    return {
      stageScale: computedStageScale,
      elements: collected,
    };
  }, opts.rootSelector);

  return evaluateGeometryIssues(elements, stageScale, opts.thresholds);
}

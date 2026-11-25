import type { Page } from 'playwright';

export interface RectBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface GeometryThresholds {
  readonly stageFontMinPx: number;
  readonly denseCardFontMinPx: number;
  readonly svgFontMinPx: number;
  readonly overflowTolerancePx: number;
}

export const DEFAULT_GEOMETRY_THRESHOLDS: GeometryThresholds = {
  stageFontMinPx: 12.5,
  denseCardFontMinPx: 11,
  svgFontMinPx: 10.5,
  overflowTolerancePx: 1.5,
};

export interface GeometryViolation {
  readonly kind:
    | 'overflow-x'
    | 'clipped-y'
    | 'undersized-text'
    | 'viewport-clip'
    | 'html-nav-overlap'
    | 'svg-text-overlap'
    | 'svg-box-overflow'
    | 'svg-edge-clip'
    | 'svg-undersized-text';
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
  readonly viewportClipCount: number;
  readonly navOverlapCount: number;
  readonly svgOverlapCount: number;
  readonly svgBoxOverflowCount: number;
  readonly svgEdgeClipCount: number;
  readonly svgUndersizedCount: number;
}

export interface RawSvgTextMetric {
  readonly svgIndex: number;
  readonly textSample: string;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly fontSizePx?: number;
  /** Enclosing `<svg>` element bounding box to catch viewBox/edge clipping */
  readonly svgBox?: RectBox;
  /** Optional enclosing SVG container shape (`rect` / `circle`) when text sits inside a node box */
  readonly parentBox?: RectBox;
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
  readonly insideNav?: boolean;
  readonly localScaleX: number;
  /** Optional viewport-relative bounding rect for viewport-edge & nav-overlap clipping detection */
  readonly rect?: RectBox;
  readonly viewport?: {
    readonly width: number;
    readonly height: number;
  };
}

/**
 * Pure evaluator checking SVG label overlaps, box spill, SVG frame edge clipping, and font floor.
 */
export function evaluateSvgGeometryIssues(
  svgTexts: readonly RawSvgTextMetric[],
  tolerancePx = 3,
  svgFontMinPx = DEFAULT_GEOMETRY_THRESHOLDS.svgFontMinPx,
): readonly GeometryViolation[] {
  const violations: GeometryViolation[] = [];
  const bySvg = new Map<number, RawSvgTextMetric[]>();

  for (const t of svgTexts) {
    const list = bySvg.get(t.svgIndex) ?? [];
    list.push(t);
    bySvg.set(t.svgIndex, list);

    if (t.svgBox) {
      const edgeSpill = Math.max(
        t.right - t.svgBox.right,
        t.svgBox.left - t.left,
        t.bottom - t.svgBox.bottom,
        t.svgBox.top - t.top,
      );
      if (edgeSpill > tolerancePx) {
        violations.push({
          kind: 'svg-edge-clip',
          tag: 'svg:text',
          textSample: t.textSample,
          measured: Number(edgeSpill.toFixed(1)),
          threshold: tolerancePx,
        });
      }
    }

    if (t.parentBox) {
      const spillRight = t.right - t.parentBox.right;
      const spillLeft = t.parentBox.left - t.left;
      const spillBottom = t.bottom - t.parentBox.bottom;
      const spillTop = t.parentBox.top - t.top;
      const maxSpill = Math.max(spillRight, spillLeft, spillBottom, spillTop);
      if (maxSpill > tolerancePx) {
        violations.push({
          kind: 'svg-box-overflow',
          tag: 'svg:text',
          textSample: t.textSample,
          measured: Number((t.right - t.left).toFixed(1)),
          threshold: Number((t.parentBox.right - t.parentBox.left).toFixed(1)),
        });
      }
    }

    if (typeof t.fontSizePx === 'number' && t.fontSizePx > 0 && t.fontSizePx < svgFontMinPx) {
      violations.push({
        kind: 'svg-undersized-text',
        tag: 'svg:text',
        textSample: t.textSample,
        measured: Number(t.fontSizePx.toFixed(2)),
        threshold: svgFontMinPx,
      });
    }
  }

  for (const texts of bySvg.values()) {
    for (let i = 0; i < texts.length; i += 1) {
      for (let j = i + 1; j < texts.length; j += 1) {
        const a = texts[i];
        const b = texts[j];
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > tolerancePx && oy > tolerancePx) {
          violations.push({
            kind: 'svg-text-overlap',
            tag: 'svg:text',
            textSample: `${a.textSample} ∩ ${b.textSample}`.slice(0, 64),
            measured: Number(Math.min(ox, oy).toFixed(1)),
            threshold: tolerancePx,
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Pure evaluator computing overflow, vertical clipping, viewport clipping, nav collision,
 * SVG issues, and logical font floors from element snapshots.
 */
export function evaluateGeometryIssues(
  elements: readonly RawElementMetric[],
  stageScale = 1,
  thresholds: GeometryThresholds = DEFAULT_GEOMETRY_THRESHOLDS,
  svgTexts: readonly RawSvgTextMetric[] = [],
  navBoxes: readonly RectBox[] = [],
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

    if (el.rect && el.viewport && el.textSample.length > 0) {
      const margin = 4;
      const outBottom = el.rect.bottom - el.viewport.height;
      const outRight = el.rect.right - el.viewport.width;
      const outTop = -el.rect.top;
      const outLeft = -el.rect.left;
      const worst = Math.max(outBottom, outRight, outTop, outLeft);
      if (worst > margin) {
        violations.push({
          kind: 'viewport-clip',
          tag: el.tag,
          textSample: el.textSample,
          measured: Number(worst.toFixed(1)),
          threshold: margin,
        });
      }
    }

    if (el.rect && !el.insideNav && el.textSample.length > 0 && navBoxes.length > 0) {
      const overlapTol = 4;
      for (const nav of navBoxes) {
        const ox = Math.min(el.rect.right, nav.right) - Math.max(el.rect.left, nav.left);
        const oy = Math.min(el.rect.bottom, nav.bottom) - Math.max(el.rect.top, nav.top);
        if (ox > overlapTol && oy > overlapTol) {
          violations.push({
            kind: 'html-nav-overlap',
            tag: el.tag,
            textSample: el.textSample,
            measured: Number(Math.min(ox, oy).toFixed(1)),
            threshold: overlapTol,
          });
          break;
        }
      }
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

  violations.push(...evaluateSvgGeometryIssues(svgTexts, 3, thresholds.svgFontMinPx));

  return {
    stageScale: safeStageScale,
    violations,
    overflowCount: violations.filter((v) => v.kind === 'overflow-x').length,
    clippedCount: violations.filter((v) => v.kind === 'clipped-y').length,
    undersizedCount: violations.filter((v) => v.kind === 'undersized-text').length,
    viewportClipCount: violations.filter((v) => v.kind === 'viewport-clip').length,
    navOverlapCount: violations.filter((v) => v.kind === 'html-nav-overlap').length,
    svgOverlapCount: violations.filter((v) => v.kind === 'svg-text-overlap').length,
    svgBoxOverflowCount: violations.filter((v) => v.kind === 'svg-box-overflow').length,
    svgEdgeClipCount: violations.filter((v) => v.kind === 'svg-edge-clip').length,
    svgUndersizedCount: violations.filter((v) => v.kind === 'svg-undersized-text').length,
  };
}

/**
 * Walks the visible slide stage or document body (including inline SVG diagrams) in Playwright
 * and flags clipping, overflow, nav collision, SVG overlaps/spill/edge-clip, and undersized text.
 */
export async function auditPageGeometry(
  page: Page,
  opts: { rootSelector?: string; thresholds?: GeometryThresholds } = {},
): Promise<GeometrySummary> {
  const { stageScale, elements, svgTexts, navBoxes } = await page.evaluate((rootSelector) => {
    const isEffectivelyHidden = (el: Element | null): boolean => {
      let cur: Element | null = el;
      while (cur && cur.nodeType === Node.ELEMENT_NODE) {
        if ((cur as HTMLElement).hidden) return true;
        const st = window.getComputedStyle(cur);
        if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.05) {
          return true;
        }
        cur = cur.parentElement;
      }
      return false;
    };

    const activeSlide = rootSelector
      ? document.querySelector<HTMLElement>(rootSelector)
      : (document.querySelector<HTMLElement>('[data-osd-current-page]') ?? document.body);

    const root = activeSlide ?? document.body;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const scaledCandidate =
      Array.from([root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]).find(
        (el) =>
          !isEffectivelyHidden(el) &&
          el.offsetWidth >= 640 &&
          Math.abs(el.getBoundingClientRect().width - el.offsetWidth) > 1,
      ) ?? root;
    const stageRect = scaledCandidate.getBoundingClientRect();
    const layoutWidth = scaledCandidate.offsetWidth || stageRect.width || 1920;
    const computedStageScale = layoutWidth > 0 ? stageRect.width / layoutWidth : 1;

    // Collect fixed/absolute bottom/top nav/footer controls to detect body-text collisions
    const navSelector = 'nav, footer, [role="navigation"], .nav, .footer, .deck-nav, .slide-nav';
    const collectedNavBoxes: RectBox[] = [];
    for (const navEl of Array.from(root.querySelectorAll<HTMLElement>(navSelector))) {
      if (isEffectivelyHidden(navEl)) continue;
      const st = window.getComputedStyle(navEl);
      if (st.position !== 'fixed' && st.position !== 'absolute') continue;
      const nr = navEl.getBoundingClientRect();
      if (nr.width < 40 || nr.height < 14 || nr.height > viewport.height * 0.22) continue;
      collectedNavBoxes.push({
        left: nr.left,
        top: nr.top,
        right: nr.right,
        bottom: nr.bottom,
      });
    }

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
      if (isEffectivelyHidden(node)) continue;
      const style = window.getComputedStyle(node);
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
        insideNav: Boolean(node.closest(navSelector)),
        localScaleX,
        rect: cleanDirectText
          ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
          : undefined,
        viewport,
      });
    }

    // Audit visible inline SVG diagrams for label overlaps, node-box overflow, edge clipping, and tiny labels
    const collectedSvgTexts: RawSvgTextMetric[] = [];
    const svgs = Array.from(root.querySelectorAll('svg')).filter((svg) => {
      if (svg.closest('[data-layout-audit-ignore="true"], [data-artifacture-gpu]')) return false;
      if (isEffectivelyHidden(svg)) return false;
      const r = svg.getBoundingClientRect();
      return r.width > 40 && r.height > 40;
    });

    svgs.forEach((svg, svgIndex) => {
      const svgRect = svg.getBoundingClientRect();
      const svgArea = Math.max(1, svgRect.width * svgRect.height);
      const svgBox: RectBox = {
        left: svgRect.left,
        top: svgRect.top,
        right: svgRect.right,
        bottom: svgRect.bottom,
      };
      const shapes = Array.from(svg.querySelectorAll('rect, circle'))
        .map((el) => {
          const b = el.getBoundingClientRect();
          const st = window.getComputedStyle(el);
          const hasFill = st.fill !== 'none' && st.fill !== 'rgba(0, 0, 0, 0)';
          const isDashed = st.strokeDasharray !== 'none' && st.strokeDasharray !== '';
          return {
            el,
            tag: el.tagName.toLowerCase(),
            left: b.left,
            top: b.top,
            right: b.right,
            bottom: b.bottom,
            area: b.width * b.height,
            hasFill,
            isDashed,
          };
        })
        .filter(
          (s) =>
            s.hasFill &&
            !s.isDashed &&
            s.right > s.left + 20 &&
            s.bottom > s.top + 14 &&
            s.area < svgArea * 0.65,
        );

      for (const t of Array.from(svg.querySelectorAll('text'))) {
        if (isEffectivelyHidden(t)) continue;
        const txt = (t.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (!txt) continue;
        const b = t.getBoundingClientRect();
        if (b.width <= 0 || b.height <= 0) continue;
        const cx = (b.left + b.right) * 0.5;
        const cy = (b.top + b.bottom) * 0.5;
        const st = window.getComputedStyle(t);
        // Compute rendered CSS font size accounting for SVG viewBox scaling
        const ctm = (t as SVGTextElement).getScreenCTM?.();
        const ctmScale = ctm ? Math.hypot(ctm.a, ctm.b) : 1;
        const rawFontPx = Number.parseFloat(st.fontSize) || 0;
        const renderedFontPx = rawFontPx > 0 ? rawFontPx * (ctmScale > 0.05 ? ctmScale : 1) : 0;

        // Find tightest filled container shape wrapping this text (same <g>, or an immediately enclosing filled <rect> box)
        let parentBox: RectBox | undefined;
        let bestArea = Infinity;
        for (const s of shapes) {
          const sameGroup = s.el.parentElement === t.parentElement;
          const precedesText =
            s.tag === 'rect' &&
            (s.el.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
          if (!sameGroup && !precedesText) continue;
          if (cx >= s.left && cx <= s.right && cy >= s.top && cy <= s.bottom && s.area < bestArea) {
            bestArea = s.area;
            parentBox = { left: s.left, top: s.top, right: s.right, bottom: s.bottom };
          }
        }

        collectedSvgTexts.push({
          svgIndex,
          textSample: txt.slice(0, 64),
          left: b.left,
          top: b.top,
          right: b.right,
          bottom: b.bottom,
          fontSizePx: renderedFontPx || undefined,
          svgBox,
          parentBox,
        });
      }
    });

    return {
      stageScale: computedStageScale,
      elements: collected,
      svgTexts: collectedSvgTexts,
      navBoxes: collectedNavBoxes,
    };
  }, opts.rootSelector);

  return evaluateGeometryIssues(elements, stageScale, opts.thresholds, svgTexts, navBoxes);
}

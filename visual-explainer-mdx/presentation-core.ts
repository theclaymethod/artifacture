/*
 * presentation-core.ts — pure, DOM-light logic for the PresentationDeck
 * engine. No JSX and no React imports so node:test (and the eval harness)
 * can import this file directly under Node's type stripping, the same way
 * diagram-layout.test.mjs imports diagram-layout.ts.
 */

/** Signature easing used for every deck transition. */
export const presentationEase = 'cubic-bezier(0.22,1,0.36,1)';

/** Rail geometry, shared with the eval harness so the numbers cannot drift. */
export const RAIL_EXPANDED_WIDTH = 260;
export const RAIL_COLLAPSED_WIDTH = 44;

export interface StageFit {
  scale: number;
  left: number;
  top: number;
}

/**
 * Scale-to-fit math for the fixed-size stage: the stage renders at
 * stageWidth×stageHeight and is scaled by min(availW/stageW, availH/stageH),
 * then centered (letterboxed) in the leftover space. Scale is clamped at 0 so
 * a transiently unmeasured (0×0) container can never produce a negative or
 * NaN transform.
 */
export function fitStage(
  availWidth: number,
  availHeight: number,
  stageWidth = 1920,
  stageHeight = 1080,
): StageFit {
  if (stageWidth <= 0 || stageHeight <= 0) {
    throw new Error(`fitStage: stage dimensions must be positive, got ${stageWidth}x${stageHeight}`);
  }
  const scale = Math.max(0, Math.min(availWidth / stageWidth, availHeight / stageHeight));
  return {
    scale,
    left: (availWidth - stageWidth * scale) / 2,
    top: (availHeight - stageHeight * scale) / 2,
  };
}

/** Clamp a requested slide index into [0, count-1]. Empty decks pin to 0. */
export function clampSlideIndex(next: number, count: number): number {
  return Math.max(0, Math.min(Math.max(0, count - 1), next));
}

/**
 * Click-anywhere-to-close guard (hard rule carried over from the production
 * deck this module was generalized from): a click on an open DrillSheet
 * closes it UNLESS it lands on (or inside) an interactive element — a
 * button, link, form control, a region opted out via data-interactive, or a
 * still-mounted drill trigger (so the opening click can never immediately
 * re-close the sheet it just opened).
 */
export const DRILL_DISMISS_GUARD_SELECTOR =
  'button, a, input, select, textarea, [data-interactive], [data-drill-target]';

interface ClosestLike {
  closest?: (selector: string) => unknown;
}

/**
 * Returns true when a click landing on `target` should dismiss the sheet.
 * Accepts anything Element-like (needs only .closest) so it is testable with
 * linkedom and reusable outside React.
 */
export function shouldDismissDrillSheet(target: ClosestLike | null | undefined): boolean {
  if (!target || typeof target.closest !== 'function') return true;
  return !target.closest(DRILL_DISMISS_GUARD_SELECTOR);
}

/** Alpha-suffix tinting idiom for 6-digit hex colors: tint('#336699', '10'). */
export function tint(color: string, alphaHex: string): string {
  return `${color}${alphaHex}`;
}

/**
 * Opaque equivalent of tint(): composites `fg` at the given hex alpha over an
 * opaque `bg` and returns the resulting SOLID hex. Required for any fill that
 * sits on a grid-paper backdrop — grid lines must never show through a box.
 * Both inputs must be 6-digit hex colors. When colors are only available as
 * CSS custom properties, use the equivalent CSS idiom instead: an opaque
 * background-color layered under a translucent background-image gradient
 * (see .ve-pres-solid in presentation.tsx).
 */
export function solidTint(fg: string, bg: string, alphaHex: string): string {
  const hexPattern = /^#[0-9a-fA-F]{6}$/;
  if (!hexPattern.test(fg) || !hexPattern.test(bg)) {
    throw new Error(`solidTint: fg and bg must be 6-digit hex colors, got ${fg} / ${bg}`);
  }
  const alpha = parseInt(alphaHex, 16) / 255;
  if (!Number.isFinite(alpha)) throw new Error(`solidTint: invalid alphaHex "${alphaHex}"`);
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round(alpha * channel(fg, i) + (1 - alpha) * channel(bg, i))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`.toUpperCase();
}

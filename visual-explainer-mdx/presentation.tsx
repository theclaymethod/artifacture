/*
 * presentation.tsx — PresentationDeck engine + deck primitives.
 *
 * An alternative to SlideDeck/Slide for interactive, presenter-driven decks:
 * a fixed-size stage (default 1920×1080) scaled to fit the viewport, a
 * collapsible slide rail, keyboard navigation, and drill-down primitives
 * (click-to-expand cards and sheets) for progressive disclosure.
 *
 * Generalized from a production deck. Every color and font is consumed from
 * the pipeline's --ve-* custom properties so any preset skins it; slide tones
 * reuse the same data-ve-tone="dark|light|accent" → --ve-slide-* mapping that
 * Slide uses. Hard-won behaviors preserved:
 *   - solid-fill-over-grid: boxes on grid-paper backdrops are always opaque
 *     (opaque background-color under a translucent gradient — the CSS
 *     equivalent of presentation-core's solidTint()).
 *   - CTA variant discipline: primary = solid accent fill, secondary =
 *     accent outline. Drill triggers never look like passive content.
 *   - click-anywhere-to-close on sheets, guarded by
 *     closest('button, a, input, select, textarea, [data-interactive], …').
 *   - corner-anchored expansion (transform-origin per card position).
 *   - keyboard accessibility everywhere (real <button>s, Escape, focus
 *     management, focus-visible rings) and prefers-reduced-motion support.
 */
import React, {
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  RAIL_COLLAPSED_WIDTH,
  RAIL_EXPANDED_WIDTH,
  clampSlideIndex,
  fitStage,
  presentationEase,
  shouldDismissDrillSheet,
} from './presentation-core';

export type PresentationTone = 'dark' | 'light' | 'accent';

const EASE = presentationEase;

/* ==================================================================== */
/* Deck-scoped CSS (token-driven; injected once per deck root)          */
/* ==================================================================== */

const PRESENTATION_CSS = `
.ve-pres-root button { font: inherit; color: inherit; background: none; border: none; padding: 0; margin: 0; text-align: inherit; cursor: pointer; }
.ve-pres-root button:focus-visible { outline: 2px solid var(--ve-pres-cta, var(--ve-accent)); outline-offset: 3px; }
.ve-pres-slide {
  --ve-pres-ink: var(--ve-slide-text);
  --ve-pres-muted: var(--ve-slide-muted);
  --ve-pres-hair: var(--ve-slide-rule);
  --ve-pres-panel: color-mix(in srgb, var(--ve-slide-text) 6%, transparent);
  --ve-pres-grid-line: color-mix(in srgb, var(--ve-slide-text) 11%, transparent);
  --ve-pres-cta: var(--ve-accent);
  --ve-pres-cta-ink: var(--ve-accent-contrast);
}
/* On accent-tone slides the accent color IS the surface, so CTAs flip to the
   tone's ink color (accent-on-accent would vanish). */
.ve-pres-slide[data-ve-tone="accent"] { --ve-pres-cta: var(--ve-slide-text); --ve-pres-cta-ink: var(--ve-slide-bg); }
.ve-pres-card, .ve-pres-chip { transition: border-color .25s ${EASE}, background-color .25s ${EASE}, transform .25s ${EASE}; }
.ve-pres-card { position: relative; }
.ve-pres-card:hover { transform: translateY(-2px); border-color: var(--ve-pres-cta) !important; }
.ve-pres-chip:hover { border-color: var(--ve-pres-cta) !important; }
.ve-pres-shine { position: absolute; inset: 0; opacity: 0; pointer-events: none; z-index: 2; transition: opacity .3s ease; }
.ve-pres-card:hover > .ve-pres-shine, .ve-pres-card:focus-visible > .ve-pres-shine { opacity: 1; }
.ve-pres-hint { opacity: 0; transition: opacity .18s ease; }
.ve-pres-card:hover .ve-pres-hint, .ve-pres-card:focus-visible .ve-pres-hint,
.ve-pres-chip:hover .ve-pres-hint, .ve-pres-chip:focus-visible .ve-pres-hint { opacity: 1; }
.ve-pres-chip-primary:hover, .ve-pres-chip-primary:focus-visible { background-color: color-mix(in srgb, var(--ve-pres-cta) 82%, black) !important; border-color: color-mix(in srgb, var(--ve-pres-cta) 82%, black) !important; }
/* Solid-fill-over-grid idiom: opaque surface color underneath, translucent
   accent tint layered above via background-image — the composite is fully
   opaque, so grid lines can never show through (CSS solidTint()). */
.ve-pres-solid { background-color: var(--ve-slide-bg); background-image: linear-gradient(var(--ve-pres-fill, transparent), var(--ve-pres-fill, transparent)); }
.ve-pres-grid-paper { background-image: linear-gradient(var(--ve-pres-grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--ve-pres-grid-line) 1px, transparent 1px); background-size: 40px 40px; }
@keyframes vePresSlideIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes vePresDrillIn { from { opacity: 0; transform: scale(.955); } to { opacity: 1; transform: none; } }
@keyframes vePresPanelIn { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .ve-pres-root *, .ve-pres-root *::before, .ve-pres-root *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
}
`;

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/* ==================================================================== */
/* Text primitives                                                      */
/* ==================================================================== */

export function MonoLabel({
  children,
  size = 13,
  color,
  ls = 1.5,
  caps = true,
  block = false,
  style,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
  ls?: number;
  caps?: boolean;
  block?: boolean;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: block ? 'block' : undefined,
        fontFamily: 'var(--ve-font-mono)',
        fontSize: size,
        letterSpacing: `${ls}px`,
        textTransform: caps ? 'uppercase' : 'none',
        color,
        fontVariantNumeric: 'tabular-nums',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Display-font paragraph (the preset's --ve-font-display voice). */
export function DisplayText({
  children,
  size = 34,
  lh = 1.24,
  color,
  italic = false,
  maxW,
  style,
}: {
  children: ReactNode;
  size?: number;
  lh?: number;
  color?: string;
  italic?: boolean;
  maxW?: number;
  style?: CSSProperties;
}) {
  return (
    <p
      style={{
        fontFamily: 'var(--ve-font-display)',
        fontWeight: 'var(--ve-display-weight)' as CSSProperties['fontWeight'],
        fontStyle: italic ? 'italic' : 'normal',
        fontSize: size,
        lineHeight: lh,
        letterSpacing: 0,
        color,
        maxWidth: maxW,
        margin: 0,
        ...style,
      }}
    >
      {children}
    </p>
  );
}

/* ==================================================================== */
/* Geometric icons (1.5px strokes, currentColor, no icon libraries)     */
/* ==================================================================== */

export function IconBase({
  children,
  size = 15,
  color = 'currentColor',
}: {
  children: ReactNode;
  size?: number;
  color?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} aria-hidden="true">
      {children}
    </svg>
  );
}

type IconProps = { color?: string; size?: number };

export function IconFile(p: IconProps) {
  return (
    <IconBase {...p}>
      <rect x="4.5" y="3" width="15" height="18" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="12.5" y2="16" />
    </IconBase>
  );
}

export function IconTool(p: IconProps) {
  return (
    <IconBase {...p}>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2.5" x2="12" y2="6.5" />
      <line x1="12" y1="17.5" x2="12" y2="21.5" />
      <line x1="2.5" y1="12" x2="6.5" y2="12" />
      <line x1="17.5" y1="12" x2="21.5" y2="12" />
    </IconBase>
  );
}

export function IconAction(p: IconProps) {
  return (
    <IconBase {...p}>
      <rect x="10" y="6" width="11" height="12" />
      <line x1="2.5" y1="12" x2="9" y2="12" />
      <polyline points="6,8.5 9.5,12 6,15.5" />
    </IconBase>
  );
}

export function IconLoop(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M 19 12 A 7 7 0 1 1 12 5" />
      <polyline points="12,1.5 15.5,5 12,8.5" />
    </IconBase>
  );
}

export function IconGauge(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M 4 18 A 9 9 0 0 1 20 18" />
      <line x1="12" y1="16" x2="16.5" y2="9.5" />
    </IconBase>
  );
}

export function IconTag(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M 3.5 3.5 L 11 3.5 L 20.5 13 L 13 20.5 L 3.5 11 Z" />
      <circle cx="8" cy="8" r="1.4" />
    </IconBase>
  );
}

export function IconFit(p: IconProps) {
  return (
    <IconBase {...p}>
      <polyline points="3,19 8.5,13 12.5,15.5 20.5,5.5" />
      <polyline points="16,5.5 20.5,5.5 20.5,10" />
    </IconBase>
  );
}

export function IconFilter(p: IconProps) {
  return (
    <IconBase {...p}>
      <polyline points="3,4.5 21,4.5 14,12.5 14,20 10,17.5 10,12.5 3,4.5" />
    </IconBase>
  );
}

export function IconCorpus(p: IconProps) {
  return (
    <IconBase {...p}>
      <rect x="4" y="4" width="16" height="5" />
      <rect x="4" y="11" width="16" height="5" />
      <line x1="4" y1="19.5" x2="20" y2="19.5" />
    </IconBase>
  );
}

export function IconArrowDown(p: IconProps) {
  return (
    <IconBase {...p}>
      <line x1="12" y1="3" x2="12" y2="19" />
      <polyline points="6,14 12,20.5 18,14" />
    </IconBase>
  );
}

export function IconArrowRight(p: IconProps) {
  return (
    <IconBase {...p}>
      <line x1="3" y1="12" x2="19" y2="12" />
      <polyline points="14,6 20.5,12 14,18" />
    </IconBase>
  );
}

/** Square icon chip tinted with the tone's CTA color (or a custom accent). */
export function IconChip({
  icon,
  accent,
  size = 26,
}: {
  icon: ReactNode;
  /** custom CSS color; defaults to the tone's CTA color */
  accent?: string;
  size?: number;
}) {
  const color = accent ?? 'var(--ve-pres-cta)';
  return (
    <span
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        color,
        flexShrink: 0,
      }}
    >
      {icon}
    </span>
  );
}

/* ==================================================================== */
/* Mouse-follow shine                                                   */
/* ==================================================================== */

/**
 * onMouseMove handler that records the pointer position on the hovered
 * element as --mx/--my CSS vars (percentages, so the value survives the
 * deck's scale() transform). Pair with <ShineOverlay/> inside any element
 * carrying className="ve-pres-card".
 */
export function trackShine(e: React.MouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  el.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width) * 100}%`);
  el.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height) * 100}%`);
}

/**
 * Pointer-tracked radial-gradient shine overlay. Fades in on hover/focus of
 * the parent .ve-pres-card (which must set --mx/--my via trackShine and be
 * position:relative — .ve-pres-card is, via the deck CSS).
 */
export function ShineOverlay({
  color,
  radius = 500,
}: {
  /** custom CSS color; defaults to the tone's CTA color */
  color?: string;
  radius?: number;
}) {
  const c = color ?? 'var(--ve-pres-cta)';
  return (
    <span
      aria-hidden="true"
      className="ve-pres-shine"
      style={{
        background: `radial-gradient(${radius}px circle at var(--mx, 50%) var(--my, 50%), color-mix(in srgb, ${c} 12%, transparent), transparent 70%)`,
      }}
    />
  );
}

/* ==================================================================== */
/* Drill-down machinery                                                 */
/* ==================================================================== */

/** Close-on-Escape for any drill-down. */
export function useEscape(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [active, onClose]);
}

export function CloseX({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <button
      ref={ref}
      type="button"
      aria-label="Close drill-down"
      data-drill-close="true"
      onClick={onClose}
      className="ve-pres-chip"
      style={{
        width: 40,
        height: 40,
        borderRadius: 999,
        border: '1px solid var(--ve-pres-hair)',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <line x1="1" y1="1" x2="11" y2="11" />
        <line x1="11" y1="1" x2="1" y2="11" />
      </svg>
    </button>
  );
}

/**
 * Mono trigger chip for drill-downs. Renders a real <button>, so Enter/Space
 * work natively. `drillId` lands on data-drill-target.
 *
 * CTA discipline (hard rule): every drill trigger reads as a CTA.
 * variant="primary"   — SOLID CTA fill, contrast mono text (the encouraged,
 *                       always-visible EXPAND-style trigger).
 * variant="secondary" — CTA outline + CTA mono text (inline triggers).
 */
export function DrillChip({
  label,
  onClick,
  drillId,
  variant = 'secondary',
  hint = 'Click to expand',
}: {
  label: string;
  onClick: () => void;
  drillId: string;
  variant?: 'primary' | 'secondary';
  hint?: string;
}) {
  const primary = variant === 'primary';
  return (
    <button
      type="button"
      className={primary ? 've-pres-chip ve-pres-chip-primary' : 've-pres-chip'}
      data-drill-target={drillId}
      data-drill-variant={variant}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        border: '1px solid var(--ve-pres-cta)',
        background: primary ? 'var(--ve-pres-cta)' : 'transparent',
        color: primary ? 'var(--ve-pres-cta-ink)' : 'var(--ve-pres-cta)',
        padding: '11px 18px',
      }}
    >
      <svg width="11" height="11" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <line x1="6" y1="1" x2="6" y2="11" />
        <line x1="1" y1="6" x2="11" y2="6" />
      </svg>
      <MonoLabel size={12} ls={1.8}>
        {label}
      </MonoLabel>
      <MonoLabel size={10} ls={1.5} style={{ opacity: 0.75 }}>
        <span className="ve-pres-hint">{hint}</span>
      </MonoLabel>
    </button>
  );
}

/**
 * Expanding drill-down surface. Absolutely fills the NEAREST POSITIONED
 * ANCESTOR (PresentationSlide's content wrapper is position:relative, so by
 * default a sheet covers the slide content area). Escape closes; the X is
 * focused on open. Click-anywhere-to-close: any click that does not land on
 * an interactive element (see presentation-core's guard selector) closes it.
 */
export function DrillSheet({
  eyebrow,
  onClose,
  origin,
  children,
}: {
  eyebrow: string;
  onClose: () => void;
  /** transform-origin for the corner-anchored open animation, e.g. "left center" */
  origin?: string;
  children: ReactNode;
}) {
  useEscape(true, onClose);
  const handleSurfaceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (shouldDismissDrillSheet(e.target as Element | null)) onClose();
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={eyebrow}
      data-drill-open="true"
      onClick={handleSurfaceClick}
      className="ve-pres-solid"
      style={
        {
          position: 'absolute',
          inset: 0,
          zIndex: 40,
          '--ve-pres-fill': 'color-mix(in srgb, var(--ve-slide-text) 5%, transparent)',
          border: '1px solid var(--ve-pres-hair)',
          padding: '36px 44px',
          display: 'flex',
          flexDirection: 'column',
          animation: `vePresDrillIn .26s ${EASE}`,
          transformOrigin: origin,
          color: 'var(--ve-slide-text)',
        } as CSSProperties
      }
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--ve-pres-hair)',
          paddingBottom: 18,
          marginBottom: 26,
        }}
      >
        <MonoLabel size={13} ls={2} color="var(--ve-pres-cta)">
          {eyebrow}
        </MonoLabel>
        <CloseX onClose={onClose} />
      </div>
      {/* overflow:hidden guarantees sheet content can never cross the sheet
          border or overprint the slide footer below it; slides remain
          responsible for sizing content to fit unclipped. */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

/**
 * Click-to-expand card. Collapsed: bordered card (real button; Enter/Space
 * native; data-drill-target; always-visible secondary CTA hint). Open: a
 * DrillSheet expanding over the neighbors within the nearest positioned
 * ancestor, corner-anchored via `origin`.
 */
export function DrillCard({
  drillId,
  eyebrow,
  title,
  body,
  hint = 'Click for detail',
  accent,
  detailEyebrow,
  origin = 'left center',
  minHeight = 158,
  cardStyle,
  children,
}: {
  drillId: string;
  eyebrow?: string;
  title: string;
  body?: ReactNode;
  hint?: string;
  /** custom accent CSS color for border/fill tint; defaults to the tone CTA */
  accent?: string;
  detailEyebrow?: string;
  origin?: string;
  minHeight?: number;
  cardStyle?: CSSProperties;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const cta = accent ?? 'var(--ve-pres-cta)';
  return (
    <>
      <button
        type="button"
        className="ve-pres-card ve-pres-solid"
        data-drill-target={drillId}
        onClick={() => setOpen(true)}
        onMouseMove={trackShine}
        style={
          {
            display: 'block',
            width: '100%',
            border: `1px solid ${accent ?? 'var(--ve-pres-hair)'}`,
            '--ve-pres-fill': accent ? `color-mix(in srgb, ${accent} 8%, transparent)` : 'transparent',
            padding: '18px 20px',
            minHeight,
            ...cardStyle,
          } as CSSProperties
        }
      >
        <ShineOverlay color={cta} />
        {eyebrow ? (
          <MonoLabel size={13} ls={2} color={accent ?? 'var(--ve-pres-muted)'} block>
            {eyebrow}
          </MonoLabel>
        ) : null}
        <span
          style={{
            display: 'block',
            marginTop: eyebrow ? 10 : 0,
            fontFamily: 'var(--ve-font-mono)',
            fontSize: 15,
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </span>
        {body ? (
          <span style={{ display: 'block', marginTop: 10, fontSize: 15.5, lineHeight: 1.35, color: 'var(--ve-pres-muted)' }}>
            {body}
          </span>
        ) : null}
        {hint ? (
          /* Always-visible secondary CTA (hard rule: no drill trigger may
             look like passive content). Outline + mono text in the tone's
             CTA color; opaque fill keeps it grid-safe. */
          <span style={{ display: 'flex', marginTop: 14 }}>
            <span
              className="ve-pres-solid"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                border: `1px solid ${cta}`,
                color: cta,
                padding: '5px 11px',
              }}
            >
              <svg width="9" height="9" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <line x1="6" y1="1" x2="6" y2="11" />
                <line x1="1" y1="6" x2="11" y2="6" />
              </svg>
              <MonoLabel size={10.5} ls={1.6}>
                {hint}
              </MonoLabel>
            </span>
          </span>
        ) : null}
      </button>
      {open ? (
        <DrillSheet
          eyebrow={detailEyebrow ?? [eyebrow, title].filter(Boolean).join(' · ')}
          onClose={() => setOpen(false)}
          origin={origin}
        >
          {children}
        </DrillSheet>
      ) : null}
    </>
  );
}

/* ==================================================================== */
/* Composition primitives                                               */
/* ==================================================================== */

/** Hairline-ruled pull quote. panel=true wraps it in a soft opaque surface. */
export function PullQuote({
  quote,
  attribution,
  size = 29,
  panel = false,
}: {
  quote: string;
  attribution: string;
  size?: number;
  panel?: boolean;
}) {
  const inner = (
    <>
      <DisplayText size={size} lh={1.3} italic>
        &#8220;{quote}&#8221;
      </DisplayText>
      <p style={{ margin: '18px 0 0' }}>
        <MonoLabel size={12} ls={2} color="var(--ve-pres-muted)">
          {attribution}
        </MonoLabel>
      </p>
    </>
  );
  if (panel) {
    return (
      <div
        className="ve-pres-solid"
        style={
          {
            '--ve-pres-fill': 'color-mix(in srgb, var(--ve-slide-text) 5%, transparent)',
            border: '1px solid var(--ve-pres-hair)',
            padding: '44px 48px',
          } as CSSProperties
        }
      >
        {inner}
      </div>
    );
  }
  return <div style={{ borderTop: '1px solid var(--ve-pres-hair)', paddingTop: 26 }}>{inner}</div>;
}

/** Single large metric (display-font number + mono label). */
export function Metric({ value, label, size = 54 }: { value: string; label: string; size?: number }) {
  /* Wide display fonts (e.g. mono-display presets) can push long values past
     their cell: the value must never wrap ("1920×1080" breaking into two
     lines reads as a different number). nowrap keeps it on one line, and the
     character-count clamp shrinks values longer than 8 chars proportionally
     so they still fit at any preset's glyph width. Pinned by the
     metric-value-no-wrap eval against the widest built-in display font. */
  const fitSize = value.length > 8 ? Math.round((size * 8) / value.length) : size;
  return (
    <div>
      <p
        data-ve-metric-value="true"
        style={{
          margin: 0,
          fontFamily: 'var(--ve-font-display)',
          fontWeight: 'var(--ve-display-weight)' as CSSProperties['fontWeight'],
          fontSize: fitSize,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </p>
      <p style={{ margin: '12px 0 0' }}>
        <MonoLabel size={11.5} ls={1.6} color="var(--ve-pres-muted)">
          {label}
        </MonoLabel>
      </p>
    </div>
  );
}

/** Row of metrics separated by hairlines. */
export function StatRow({ stats }: { stats: Array<{ value: string; label: string }> }) {
  return (
    <div style={{ display: 'flex', borderTop: '1px solid var(--ve-pres-hair)', borderBottom: '1px solid var(--ve-pres-hair)' }}>
      {stats.map((s, i) => (
        <div
          key={s.label}
          style={{
            flex: s.label.length > 10 ? 1.5 : 1,
            borderLeft: i === 0 ? 'none' : '1px solid var(--ve-pres-hair)',
            padding: '24px 26px',
          }}
        >
          <Metric value={s.value} label={s.label} />
        </div>
      ))}
    </div>
  );
}

export type HairlineItem = string | { head: string; body: string };

/** Left-hairline list rows. Accepts plain strings or {head, body} pairs. */
export function HairlineList({
  items,
  accent,
  gap = 16,
  columns = 1,
}: {
  items: HairlineItem[];
  /** border color override (any CSS color) */
  accent?: string;
  gap?: number;
  columns?: number;
}) {
  const border = accent ?? 'var(--ve-pres-hair)';
  return (
    <div
      style={
        columns > 1
          ? { display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap }
          : { display: 'flex', flexDirection: 'column', gap }
      }
    >
      {items.map((item, i) => {
        const isPair = typeof item !== 'string';
        return (
          <div key={isPair ? item.head : `${item}-${i}`} style={{ borderLeft: `1px solid ${border}`, paddingLeft: 22 }}>
            {isPair ? (
              <>
                <MonoLabel size={12.5} ls={1.8} color="var(--ve-pres-cta)" block>
                  {item.head}
                </MonoLabel>
                <p style={{ margin: '9px 0 0', fontSize: 17.5, lineHeight: 1.42, color: 'var(--ve-pres-muted)' }}>{item.body}</p>
              </>
            ) : (
              <span style={{ fontSize: 19, lineHeight: 1.36, color: 'var(--ve-pres-muted)' }}>{item}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Numbered, hairline-connected horizontal stepper. */
export function Stepper({
  steps,
  accentIndex = 0,
}: {
  steps: Array<{ num: string; name: string; body: string }>;
  accentIndex?: number;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', position: 'relative', height: '100%' }}>
      <div aria-hidden="true" style={{ position: 'absolute', top: 21, left: 20, right: 20, borderTop: '1px solid var(--ve-pres-hair)' }} />
      {steps.map((s, i) => (
        <div
          key={s.num}
          style={{
            flex: 1,
            paddingRight: i < steps.length - 1 ? 44 : 0,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            className="ve-pres-solid"
            style={{
              width: 42,
              height: 42,
              border: `1px solid ${i === accentIndex ? 'var(--ve-pres-cta)' : 'var(--ve-pres-hair)'}`,
              display: 'grid',
              placeItems: 'center',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <MonoLabel size={13} ls={1} color={i === accentIndex ? 'var(--ve-pres-cta)' : undefined}>
              {s.num}
            </MonoLabel>
          </div>
          <p style={{ margin: '22px 0 0', fontFamily: 'var(--ve-font-mono)', fontSize: 16, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
            {s.name}
          </p>
          <p style={{ margin: '14px 0 0', fontSize: 18.5, lineHeight: 1.45, color: 'var(--ve-pres-muted)', maxWidth: 360 }}>{s.body}</p>
        </div>
      ))}
    </div>
  );
}

/** Code/JSON panel on the preset's code surface. rows render a JSON object. */
export function CodePanel({
  rows,
  lines,
  fontSize = 14.5,
}: {
  /** JSON mode: [key, value] string pairs */
  rows?: Array<[string, string]>;
  /** raw mode: plain mono lines */
  lines?: string[];
  fontSize?: number;
}) {
  return (
    <div
      style={{
        background: 'var(--ve-code-bg, #0a0a0a)',
        border: '1px solid var(--ve-code-rule)',
        padding: '26px 30px',
        fontFamily: 'var(--ve-font-mono)',
        fontSize,
        lineHeight: 1.85,
        color: 'var(--ve-code-muted)',
        overflowWrap: 'break-word',
      }}
    >
      {rows ? (
        <>
          <div>{'{'}</div>
          {rows.map(([k, v], i) => (
            <div key={k} style={{ paddingLeft: 28 }}>
              <span style={{ color: 'var(--ve-code-accent, var(--ve-accent))' }}>&quot;{k}&quot;</span>
              {': '}
              <span style={{ color: 'var(--ve-code-text)' }}>&quot;{v}&quot;</span>
              {i < rows.length - 1 ? ',' : ''}
            </div>
          ))}
          <div>{'}'}</div>
        </>
      ) : null}
      {lines
        ? lines.map((l, i) => (
            <div key={i} style={{ color: 'var(--ve-code-text)' }}>
              {l}
            </div>
          ))
        : null}
    </div>
  );
}

/* ==================================================================== */
/* LadderDiagram — ascending staircase of stage cards on grid paper     */
/* ==================================================================== */

export interface LadderStage {
  num: string;
  name: string;
  short?: string;
  /** mono tag rendered above the card, e.g. "◀ THIS DECK" */
  tag?: string;
  /** dim the stage content (the box stays opaque — grid-safe) */
  dim?: boolean;
  /** accent CSS color: colored border + solid tinted fill */
  accent?: string;
}

/**
 * Ascending staircase of stage cards on a grid-paper backdrop with a dashed
 * ascent line. Pass renderStage to substitute your own card (e.g. a
 * DrillCard); the container is position:relative, so expanded DrillCards
 * cover the ladder area. Stage fills are opaque (solid-over-grid rule).
 */
export function LadderDiagram({
  stages,
  stepOffset = 58,
  gridBackdrop = true,
  renderStage,
  framed = true,
}: {
  stages: LadderStage[];
  stepOffset?: number;
  gridBackdrop?: boolean;
  renderStage?: (stage: LadderStage, i: number) => ReactNode;
  framed?: boolean;
}) {
  const defaultStage = (s: LadderStage, i: number) => (
    <div
      className="ve-pres-solid"
      style={
        {
          border: `1px solid ${s.dim ? 'var(--ve-pres-hair)' : s.accent ?? 'var(--ve-pres-hair)'}`,
          '--ve-pres-fill': !s.dim && s.accent ? `color-mix(in srgb, ${s.accent} 8%, transparent)` : 'transparent',
          padding: '18px 20px',
          minHeight: 148,
        } as CSSProperties
      }
    >
      <div style={{ opacity: s.dim ? 0.55 : 1 }}>
        <MonoLabel size={12.5} ls={2} color={s.dim ? 'var(--ve-pres-muted)' : s.accent ?? 'var(--ve-pres-muted)'} block>
          {s.num}
        </MonoLabel>
        <p style={{ margin: '10px 0 0', fontFamily: 'var(--ve-font-mono)', fontSize: 14.5, letterSpacing: '1px', textTransform: 'uppercase' }}>
          {s.name}
        </p>
        {s.short ? (
          <p style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.38, color: 'var(--ve-pres-muted)' }}>{s.short}</p>
        ) : null}
      </div>
    </div>
  );
  return (
    <div
      className={gridBackdrop ? 've-pres-grid-paper' : undefined}
      style={{
        height: '100%',
        border: framed ? '1px solid var(--ve-pres-hair)' : 'none',
        padding: framed ? '36px 40px 28px' : 0,
        position: 'relative',
      }}
    >
      <svg
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        viewBox="0 0 1656 430"
        preserveAspectRatio="none"
      >
        <line x1="60" y1="400" x2="1600" y2="80" stroke="var(--ve-pres-hair)" strokeWidth="1" strokeDasharray="6 6" />
      </svg>
      <div style={{ display: 'flex', gap: 22, alignItems: 'flex-end', height: '100%', position: 'relative' }}>
        {stages.map((s, i) => (
          <div key={s.num} style={{ flex: 1, marginBottom: i * stepOffset, display: 'flex', flexDirection: 'column' }}>
            {s.tag ? (
              <p style={{ margin: '0 0 8px' }}>
                <MonoLabel size={12} ls={2} color="var(--ve-pres-cta)">
                  {s.tag}
                </MonoLabel>
              </p>
            ) : null}
            {(renderStage ?? defaultStage)(s, i)}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==================================================================== */
/* FanoutDiagram — one source node → N outputs                          */
/* ==================================================================== */

export interface FanoutOutput {
  label: string;
  cap?: string;
  icon?: ReactNode;
}

export function FanoutDiagram({
  source,
  outputs,
  sourceWidth = 340,
  connectorWidth = 140,
}: {
  source: { label: string; body?: string; icon?: ReactNode; accent?: string };
  outputs: FanoutOutput[];
  sourceWidth?: number;
  connectorWidth?: number;
}) {
  const n = outputs.length;
  const H = 440;
  const ys = outputs.map((_, i) => ((i + 0.5) / n) * H);
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div
          className="ve-pres-solid"
          style={
            {
              width: sourceWidth,
              border: `1px solid ${source.accent ?? 'var(--ve-pres-hair)'}`,
              '--ve-pres-fill': source.accent ? `color-mix(in srgb, ${source.accent} 8%, transparent)` : 'transparent',
              padding: '26px 26px',
            } as CSSProperties
          }
        >
          {source.icon ? <IconChip icon={source.icon} accent={source.accent} /> : null}
          <p style={{ margin: source.icon ? '14px 0 0' : 0 }}>
            <MonoLabel size={15} ls={2}>
              {source.label}
            </MonoLabel>
          </p>
          {source.body ? (
            <p style={{ margin: '12px 0 0', fontSize: 15.5, lineHeight: 1.4, color: 'var(--ve-pres-muted)' }}>{source.body}</p>
          ) : null}
        </div>
      </div>
      <svg width={connectorWidth} height="100%" viewBox={`0 0 ${connectorWidth} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {ys.map((y) => (
          <path
            key={y}
            d={`M 0 ${H / 2} C ${connectorWidth / 2} ${H / 2}, ${connectorWidth / 2} ${y}, ${connectorWidth} ${y}`}
            stroke="var(--ve-pres-hair)"
            strokeWidth="1.5"
            fill="none"
          />
        ))}
      </svg>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 13, justifyContent: 'center' }}>
        {outputs.map((o) => (
          <div
            className="ve-pres-solid"
            key={o.label}
            style={{
              border: '1px solid var(--ve-pres-hair)',
              padding: o.cap ? '17px 24px' : '13px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 18,
            }}
          >
            {o.icon ? <IconChip icon={o.icon} /> : null}
            <MonoLabel size={o.cap ? 14 : 13} ls={1.8}>
              {o.label}
            </MonoLabel>
            {o.cap ? <span style={{ fontSize: 16, color: 'var(--ve-pres-muted)' }}>{o.cap}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==================================================================== */
/* LayerExplorer — clickable layer cards + right detail panel           */
/* ==================================================================== */

export interface ExplorerLayer {
  id: string;
  num: string;
  name: string;
  lead: string;
  icon?: ReactNode;
  points: string[];
  foot?: string;
}

export function LayerExplorer({
  layers,
  initialIndex = 0,
  drillIdPrefix = 'layer',
  listWidth = 560,
}: {
  layers: ExplorerLayer[];
  initialIndex?: number;
  drillIdPrefix?: string;
  listWidth?: number;
}) {
  const [sel, setSel] = useState(initialIndex);
  useEscape(sel !== initialIndex, () => setSel(initialIndex));
  const layer = layers[sel];
  return (
    <div style={{ display: 'flex', gap: 40, height: '100%' }}>
      <div style={{ width: listWidth, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {layers.map((l, i) => {
          const active = i === sel;
          return (
            <button
              key={l.id}
              type="button"
              className="ve-pres-card ve-pres-solid"
              data-drill-target={`${drillIdPrefix}-${l.id}`}
              aria-pressed={active}
              onClick={() => setSel(i)}
              onMouseMove={trackShine}
              style={
                {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 18,
                  border: `1px solid ${active ? 'var(--ve-pres-cta)' : 'var(--ve-pres-hair)'}`,
                  '--ve-pres-fill': active ? 'color-mix(in srgb, var(--ve-pres-cta) 12%, transparent)' : 'transparent',
                  padding: '22px 24px',
                  flex: 1,
                } as CSSProperties
              }
            >
              <ShineOverlay />
              {l.icon ? <IconChip icon={l.icon} /> : null}
              <span style={{ flex: 1 }}>
                <MonoLabel size={12} ls={2} color={active ? 'var(--ve-pres-cta)' : 'var(--ve-pres-muted)'}>
                  LAYER {l.num}
                </MonoLabel>
                <span style={{ display: 'block', marginTop: 6 }}>
                  <MonoLabel size={16} ls={1.5}>
                    {l.name}
                  </MonoLabel>
                </span>
                <span style={{ display: 'block', marginTop: 6, fontSize: 15.5, color: 'var(--ve-pres-muted)' }}>{l.lead}</span>
              </span>
              <MonoLabel size={10} ls={1.5} color="var(--ve-pres-muted)">
                <span className="ve-pres-hint">{active ? 'Selected' : 'Click to open'}</span>
              </MonoLabel>
            </button>
          );
        })}
      </div>
      <div
        key={layer.id}
        data-drill-open={sel !== initialIndex ? 'true' : undefined}
        className="ve-pres-solid"
        style={
          {
            flex: 1,
            border: '1px solid var(--ve-pres-hair)',
            '--ve-pres-fill': 'color-mix(in srgb, var(--ve-slide-text) 5%, transparent)',
            padding: '36px 44px',
            animation: `vePresPanelIn .28s ${EASE}`,
            display: 'flex',
            flexDirection: 'column',
          } as CSSProperties
        }
      >
        <MonoLabel size={13} ls={2} color="var(--ve-pres-cta)">
          LAYER {layer.num} · {layer.name}
        </MonoLabel>
        <DisplayText size={34} lh={1.15} style={{ marginTop: 18 }}>
          {layer.lead}
        </DisplayText>
        <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 28px' }}>
          {layer.points.map((p) => (
            <div key={p} style={{ borderLeft: '1px solid var(--ve-pres-hair)', paddingLeft: 18, fontSize: 18, lineHeight: 1.35 }}>
              {p}
            </div>
          ))}
        </div>
        {layer.foot ? (
          <p style={{ marginTop: 'auto', marginBottom: 0, paddingTop: 22, borderTop: '1px solid var(--ve-pres-hair)' }}>
            <MonoLabel size={12.5} ls={1.6} color="var(--ve-pres-muted)">
              {layer.foot}
            </MonoLabel>
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ==================================================================== */
/* PresentationSlide chrome                                             */
/* ==================================================================== */

const DeckContext = createContext<{ index: number; count: number } | null>(null);

export interface PresentationSlideProps {
  /** Kicker text next to the dot, e.g. "01 · Thesis" */
  kicker: string;
  /** Display-font headline. Omit for fully custom layouts. */
  title?: ReactNode;
  /** Short label for the slide rail; falls back to string titles. */
  shortTitle?: string;
  /** Surface polarity, same contract as Slide: dark = preset base surface,
      light = --ve-bg-alt (opposite polarity), accent = --ve-accent. */
  tone?: PresentationTone;
  titleSize?: number;
  titleMax?: number;
  /** Top-right mono label */
  rightLabel?: string;
  /** Footer-left mono motif text */
  footer?: string;
  /** Optional node rendered directly under the title */
  sub?: ReactNode;
  contentMarginTop?: number;
  children: ReactNode;
}

export function PresentationSlide({
  kicker,
  title,
  tone = 'dark',
  children,
  titleSize,
  titleMax = 1500,
  rightLabel,
  footer,
  sub,
  contentMarginTop = 36,
}: PresentationSlideProps) {
  const deck = useContext(DeckContext);
  const autoSize = titleSize ?? (typeof title === 'string' && title.length > 44 ? 70 : 76);
  return (
    <section
      data-ve-slide
      data-ve-tone={tone}
      data-slide={deck ? deck.index + 1 : undefined}
      className="ve-pres-slide"
      style={{
        width: '100%',
        height: '100%',
        padding: '64px 92px',
        background: 'var(--ve-slide-bg)',
        color: 'var(--ve-slide-text)',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'var(--ve-font-body)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 999, background: 'var(--ve-pres-cta)', display: 'inline-block' }} />
          <MonoLabel size={13} ls={2}>
            {kicker}
          </MonoLabel>
        </div>
        {rightLabel ? (
          <MonoLabel size={13} ls={2} color="var(--ve-pres-muted)">
            {rightLabel}
          </MonoLabel>
        ) : null}
      </div>
      {title ? (
        <h1
          style={{
            fontFamily: 'var(--ve-font-display)',
            fontWeight: 'var(--ve-display-weight)' as CSSProperties['fontWeight'],
            fontSize: autoSize,
            lineHeight: 0.96,
            letterSpacing: 0,
            maxWidth: titleMax,
            margin: 0,
          }}
        >
          {title}
        </h1>
      ) : null}
      {sub}
      {/* position:relative — drill sheets fill this content area */}
      <div style={{ marginTop: title ? contentMarginTop : 0, flex: 1, minHeight: 0, position: 'relative' }}>{children}</div>
      <div
        style={{
          marginTop: 28,
          borderTop: '1px solid var(--ve-pres-hair)',
          paddingTop: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <MonoLabel size={12} ls={2} color="var(--ve-pres-muted)">
          {footer ?? ''}
        </MonoLabel>
        {/* spacer: the deck root overlays prev/next + counter here */}
        <span style={{ width: 220 }} />
      </div>
    </section>
  );
}

/* ==================================================================== */
/* Slide rail (collapsible)                                             */
/* ==================================================================== */

function NavChevron({ dir }: { dir: 'prev' | 'next' }) {
  return (
    <svg width="9" height="14" viewBox="0 0 9 14" stroke="currentColor" strokeWidth="1.5" fill="none" aria-hidden="true">
      {dir === 'prev' ? <polyline points="7.5,1 1.5,7 7.5,13" /> : <polyline points="1.5,1 7.5,7 1.5,13" />}
    </svg>
  );
}

/**
 * Collapsible left rail. Starts expanded, auto-collapses after
 * `autoCollapseDelay` ms, re-expands on hover, collapses 320ms after the
 * pointer leaves. Expanded: mono slide numbers + short titles with a 2px
 * accent indicator on the active row. Collapsed: dot column (accent =
 * active, filled = visited, outline = ahead).
 */
function SlideRail({
  entries,
  index,
  onNavigate,
  title,
  eyebrow,
  autoCollapseDelay,
}: {
  entries: string[];
  index: number;
  onNavigate: (i: number) => void;
  title: string;
  eyebrow?: string;
  autoCollapseDelay: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setExpanded(false), autoCollapseDelay);
    return () => {
      clearTimeout(t);
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    };
  }, [autoCollapseDelay]);

  const handleEnter = () => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    setExpanded(true);
  };
  const handleLeave = () => {
    leaveTimer.current = setTimeout(() => setExpanded(false), 320);
  };

  return (
    <nav
      aria-label="Slides"
      data-rail="true"
      data-rail-expanded={expanded ? 'true' : 'false'}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      style={{
        width: expanded ? RAIL_EXPANDED_WIDTH : RAIL_COLLAPSED_WIDTH,
        transition: `width .34s ${EASE}`,
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
        height: '100%',
        background: 'var(--ve-nav-bg)',
        borderRight: '1px solid var(--ve-rule)',
        color: 'var(--ve-heading)',
        fontFamily: 'var(--ve-font-body)',
        zIndex: 70,
      }}
    >
      {/* Expanded content (fixed inner width so text never rewraps mid-transition) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          width: RAIL_EXPANDED_WIDTH,
          display: 'flex',
          flexDirection: 'column',
          opacity: expanded ? 1 : 0,
          pointerEvents: expanded ? 'auto' : 'none',
          transition: `opacity .14s ease ${expanded ? '.08s' : '0s'}`,
        }}
        aria-hidden={expanded ? undefined : true}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '15px 14px', borderBottom: '1px solid var(--ve-rule)' }}>
          <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: 999, background: 'var(--ve-accent)', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--ve-font-display)',
                fontWeight: 'var(--ve-display-weight)' as CSSProperties['fontWeight'],
                fontSize: 15,
                lineHeight: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {title}
            </p>
            {eyebrow ? (
              <p style={{ margin: '6px 0 0' }}>
                <MonoLabel size={9.5} ls={1.2} color="var(--ve-muted)">
                  {eyebrow}
                </MonoLabel>
              </p>
            ) : null}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '6px 0',
            scrollbarWidth: 'thin',
          }}
        >
          {entries.map((entry, i) => {
            const active = i === index;
            return (
              <button
                key={`${entry}-${i}`}
                type="button"
                data-rail-item={i + 1}
                aria-current={active ? 'true' : undefined}
                onClick={() => onNavigate(i)}
                style={
                  {
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '8px 14px',
                    background: active ? 'color-mix(in srgb, var(--ve-accent) 14%, transparent)' : 'transparent',
                    color: active ? 'var(--ve-heading)' : 'var(--ve-muted)',
                    transition: 'background-color .2s ease, color .2s ease',
                  } as CSSProperties
                }
              >
                {active ? (
                  <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: 'var(--ve-accent)' }} />
                ) : null}
                <span
                  style={{
                    width: 24,
                    flexShrink: 0,
                    fontFamily: 'var(--ve-font-mono)',
                    fontSize: 11,
                    fontVariantNumeric: 'tabular-nums',
                    color: active ? 'var(--ve-accent)' : 'var(--ve-faint)',
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {entry}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ borderTop: '1px solid var(--ve-rule)', padding: '11px 14px' }}>
          <MonoLabel size={9.5} ls={1.2} color="var(--ve-muted)">
            {String(index + 1).padStart(2, '0')} / {String(entries.length).padStart(2, '0')}
          </MonoLabel>
        </div>
      </div>

      {/* Collapsed content: dot column */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: RAIL_COLLAPSED_WIDTH,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          opacity: expanded ? 0 : 1,
          pointerEvents: expanded ? 'none' : 'auto',
          transition: `opacity .14s ease ${expanded ? '0s' : '.08s'}`,
        }}
        aria-hidden={expanded ? true : undefined}
      >
        <div style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '15px 0 13px', borderBottom: '1px solid var(--ve-rule)' }}>
          <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: 999, background: 'var(--ve-accent)' }} />
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            padding: '12px 0',
            overflow: 'hidden',
          }}
        >
          {entries.map((entry, i) => {
            const active = i === index;
            const past = i < index;
            return (
              <button
                key={`${entry}-${i}`}
                type="button"
                aria-label={`Go to slide ${i + 1}: ${entry}`}
                tabIndex={expanded ? -1 : 0}
                onClick={() => onNavigate(i)}
                style={{ width: 20, height: 20, display: 'grid', placeItems: 'center', flexShrink: 0 }}
              >
                <span
                  style={{
                    display: 'block',
                    width: active ? 8 : 5,
                    height: active ? 8 : 5,
                    borderRadius: 999,
                    background: active ? 'var(--ve-accent)' : past ? 'var(--ve-muted)' : 'transparent',
                    border: active ? 'none' : '1px solid var(--ve-rule)',
                    transition: 'all .2s ease',
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

/* ==================================================================== */
/* PresentationDeck root                                                */
/* ==================================================================== */

export interface PresentationDeckProps {
  /** Deck title (rail header) */
  title: string;
  /** Small mono subtitle under the rail title */
  eyebrow?: string;
  preset?: string;
  /** Fixed stage size the slides are designed against */
  stageWidth?: number;
  stageHeight?: number;
  /** ms before the rail auto-collapses (hover re-expands) */
  railAutoCollapseMs?: number;
  children: ReactNode;
}

/**
 * Deck root: fixed stageWidth×stageHeight stage scaled to fit the area right
 * of the collapsible rail (ResizeObserver keeps it fitted while the rail
 * animates), letterboxed on --ve-deck-letterbox, keyboard nav
 * (arrows/Space/PageUp/PageDown/Home/End), 80px edge click zones, and a
 * bottom-right mono slide counter. Children are PresentationSlide elements;
 * only the active slide is mounted.
 */
export function PresentationDeck({
  title,
  eyebrow,
  preset = 'mono-industrial',
  stageWidth = 1920,
  stageHeight = 1080,
  railAutoCollapseMs = 900,
  children,
}: PresentationDeckProps) {
  const slides = React.Children.toArray(children).filter((child): child is ReactElement<PresentationSlideProps> =>
    isValidElement(child),
  );
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const mainRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState<{ w: number; h: number }>({ w: stageWidth, h: stageHeight });

  /* Measure the area right of the rail; ResizeObserver keeps the stage
     scaled while the rail's width transition runs. */
  useIsoLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const measure = () => setAvail({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('orientationchange', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  const go = useCallback(
    (n: number) => {
      setIndex(clampSlideIndex(n, count));
    },
    [count],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        typeof t.closest === 'function' &&
        t.closest("button, input, textarea, select, [role='dialog']") &&
        (e.key === ' ' || e.key === 'Enter')
      ) {
        return; // let focused drill-down triggers handle Enter/Space
      }
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        go(index - 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        go(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        go(count - 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [index, count, go]);

  const { scale, left, top } = fitStage(avail.w, avail.h, stageWidth, stageHeight);
  const entries = slides.map((slide, i) => {
    const p = slide.props;
    return p.shortTitle ?? (typeof p.title === 'string' ? p.title : p.kicker) ?? `Slide ${i + 1}`;
  });
  const active = slides[index] ?? null;

  /* The root deliberately does NOT carry data-ve-deck: the verifier's slides
     profile asserts scroll-snap decks; a fixed-stage presentation verifies as
     a page. */
  return (
    <div
      className="ve-pres-root"
      data-ve-preset={preset}
      data-ve-presentation="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--ve-deck-letterbox, #161616)',
        overflow: 'hidden',
        display: 'flex',
        fontFamily: 'var(--ve-font-body)',
      }}
    >
      <style>{PRESENTATION_CSS}</style>
      <SlideRail entries={entries} index={index} onNavigate={go} title={title} eyebrow={eyebrow} autoCollapseDelay={railAutoCollapseMs} />
      <main ref={mainRef} style={{ position: 'relative', flex: 1, minWidth: 0, height: '100%', overflow: 'hidden' }}>
        <div
          data-slide-index={index}
          data-stage="true"
          style={{
            position: 'absolute',
            width: stageWidth,
            height: stageHeight,
            left,
            top,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <DeckContext.Provider value={{ index, count }}>
            <div key={index} style={{ width: '100%', height: '100%', animation: `vePresSlideIn .22s ${EASE}` }}>
              {active}
            </div>
          </DeckContext.Provider>
          <div
            className="ve-pres-slide"
            data-ve-tone={active?.props.tone ?? 'dark'}
            style={{
              position: 'absolute',
              right: 92,
              bottom: 64,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              zIndex: 60,
              color: 'var(--ve-pres-muted)',
              /* Opaque and identical to the slide surface it overlays: keeps
                 the overlay visually seamless while giving contrast tooling a
                 resolvable effective background (ancestors are transparent
                 down to the letterbox). */
              background: 'var(--ve-slide-bg)',
              padding: '6px 8px',
            }}
          >
            <button
              type="button"
              aria-label="Previous slide"
              data-nav-prev="true"
              className="ve-pres-chip"
              onClick={() => go(index - 1)}
              style={{
                width: 34,
                height: 34,
                border: '1px solid var(--ve-pres-hair)',
                display: 'grid',
                placeItems: 'center',
                opacity: index === 0 ? 0.35 : 1,
              }}
            >
              <NavChevron dir="prev" />
            </button>
            <MonoLabel size={13} ls={2} color="var(--ve-pres-muted)" style={{ whiteSpace: 'nowrap' }}>
              <span data-ve-deck-counter="true">
                {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
              </span>
            </MonoLabel>
            <button
              type="button"
              aria-label="Next slide"
              data-nav-next="true"
              className="ve-pres-chip"
              onClick={() => go(index + 1)}
              style={{
                width: 34,
                height: 34,
                border: '1px solid var(--ve-pres-hair)',
                display: 'grid',
                placeItems: 'center',
                opacity: index === count - 1 ? 0.35 : 1,
              }}
            >
              <NavChevron dir="next" />
            </button>
          </div>
        </div>
        <div
          aria-hidden="true"
          data-edge-prev="true"
          onClick={() => go(index - 1)}
          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 80, zIndex: 50, cursor: index === 0 ? 'default' : 'w-resize' }}
        />
        <div
          aria-hidden="true"
          data-edge-next="true"
          onClick={() => go(index + 1)}
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: 80,
            zIndex: 50,
            cursor: index === count - 1 ? 'default' : 'e-resize',
          }}
        />
      </main>
    </div>
  );
}

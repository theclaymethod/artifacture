import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

export type DrillChipProps = {
  drillId: string;
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  className?: string;
  style?: CSSProperties;
};

export type DrillSheetProps = {
  eyebrow: string;
  onClose: () => void;
  origin?: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export type DrillCardProps = {
  drillId: string;
  eyebrow?: string;
  title: string;
  body?: ReactNode;
  hint?: string;
  detailEyebrow?: string;
  origin?: string;
  minHeight?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

/**
 * Compact interactive trigger button annotated for Artifacture drill verification.
 */
export function DrillChip({
  drillId,
  label,
  onClick,
  variant = 'secondary',
  className,
  style,
}: DrillChipProps) {
  return (
    <button
      type="button"
      className={className ? `ve-drill-chip ${className}` : 've-drill-chip'}
      data-drill-target={drillId}
      data-variant={variant}
      onClick={onClick}
      style={style}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 12 12"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <line x1="6" y1="1" x2="6" y2="11" />
        <line x1="1" y1="6" x2="11" y2="6" />
      </svg>
      <span>{label}</span>
    </button>
  );
}

/**
 * Slide-local expanding sheet with capture-phase Escape handling, focus trap, and surface-click dismiss.
 */
export function DrillSheet({
  eyebrow,
  onClose,
  origin,
  children,
  className,
  style,
}: DrillSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(
    globalThis.document === undefined
      ? null
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null,
  );

  useEffect(() => {
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusable = Array.from(
        sheet.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        sheet.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      previousFocus.current?.focus();
    };
  }, [onClose]);

  const handleSurfaceClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (
      target?.closest('button, a, input, select, textarea, [data-interactive], [data-drill-target]')
    ) {
      return;
    }
    onClose();
  };

  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-modal="true"
      aria-label={eyebrow}
      tabIndex={-1}
      data-drill-open="true"
      className={className ? `ve-drill-sheet ${className}` : 've-drill-sheet'}
      onClick={handleSurfaceClick}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
      style={{ transformOrigin: origin, ...style }}
    >
      <div className="ve-drill-sheet-header">
        <span className="ve-drill-sheet-eyebrow">{eyebrow}</span>
        <button
          ref={closeButtonRef}
          type="button"
          className="ve-drill-close"
          aria-label="Close drill-down"
          data-drill-close="true"
          onClick={onClose}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <line x1="1" y1="1" x2="11" y2="11" />
            <line x1="11" y1="1" x2="1" y2="11" />
          </svg>
        </button>
      </div>
      <div className="ve-drill-sheet-body">{children}</div>
    </div>
  );
}

/**
 * Click-to-expand card opening a slide-scoped DrillSheet over its nearest positioned ancestor.
 */
export function DrillCard({
  drillId,
  eyebrow,
  title,
  body,
  hint = 'Inspect detail',
  detailEyebrow,
  origin = 'left center',
  minHeight = 144,
  className,
  style,
  children,
}: DrillCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: open-slide VirtualThumbList wraps thumbnails in <button> */}
      <div
        role="button"
        tabIndex={0}
        className={className ? `ve-drill-card ${className}` : 've-drill-card'}
        data-drill-target={drillId}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        style={{ minHeight, ...style }}
      >
        {eyebrow ? <span className="ve-drill-card-eyebrow">{eyebrow}</span> : null}
        <span className="ve-drill-card-title">{title}</span>
        {body ? <span className="ve-drill-card-body">{body}</span> : null}
        {hint ? (
          <span className="ve-drill-card-hint">
            <svg
              width="9"
              height="9"
              viewBox="0 0 12 12"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <line x1="6" y1="1" x2="6" y2="11" />
              <line x1="1" y1="6" x2="11" y2="6" />
            </svg>
            <span>{hint}</span>
          </span>
        ) : null}
      </div>
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

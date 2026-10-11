import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import './explainer-nav.css';

export type ChapterAnchor = { id: string; label: string };
export type Chapter = { id: string; label: string; anchors?: readonly ChapterAnchor[] };
export type ExplainerAppearance = 'light' | 'dark' | 'auto';

export type ReadMode = 'pages' | 'one';
/** The chapter state of a paged ExplainerShell. `live` is false in the server render and until hydration. */
export type ShellState = { paged: boolean; live: boolean; mode: ReadMode; current: string; chapters: Chapter[]; setMode: (mode: ReadMode) => void };
export const ShellContext = createContext<ShellState | null>(null);

/** The chapter state of a paged ExplainerShell: the reading mode, the current chapter and the switch. Null outside a paged shell. */
export function useExplainerShell() {
  return useContext(ShellContext);
}

/** A stable fragment id for a chapter title. */
export function chapterSlug(text: string) {
  const slug = text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'section';
}

const darkQuery = '(prefers-color-scheme: dark)';

function subscribeToScheme(onChange: () => void) {
  const media = window.matchMedia(darkQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

/** Resolve `auto` from prefers-color-scheme in the browser; static renders stay light. */
export function useResolvedAppearance(appearance: ExplainerAppearance): 'light' | 'dark' {
  const prefersDark = useSyncExternalStore(
    subscribeToScheme,
    () => window.matchMedia(darkQuery).matches,
    () => false,
  );
  if (appearance === 'auto') return prefersDark ? 'dark' : 'light';
  return appearance;
}

// The reading line sits a third of the way down the viewport: the chapter whose top has
// crossed it is the current chapter.
function currentTarget(ids: readonly string[]) {
  const line = window.innerHeight * 0.32;
  let current = ids[0] ?? '';
  for (const id of ids) {
    const element = document.getElementById(id);
    if (element && element.getBoundingClientRect().top <= line) current = id;
  }
  const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
  return atEnd ? ids.at(-1) ?? current : current;
}

/**
 * A persistent chapter rail: a sticky side rail on wide screens and a compact sticky top bar
 * with a disclosure list on narrow screens (the list lies over the page, so opening it moves
 * nothing). Links are plain fragment anchors, so the rail works without script and with the
 * keyboard; every jump is instant. The rail follows the scroll quietly: it never scrolls itself
 * or the page.
 */
export function ChapterRail({ chapters, label = 'Chapters', current, mode, onMode }: {
  chapters: readonly Chapter[];
  label?: string;
  /** A paged shell names its current chapter; the rail then marks it instead of following the scroll. */
  current?: string;
  /** The reading mode of a paged shell, and its switch: "Read as one page" or "Read by chapter". */
  mode?: 'pages' | 'one';
  onMode?: (mode: 'pages' | 'one') => void;
}) {
  const listId = `ve-chapter-list-${useId().replace(/:/g, '')}`;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(chapters[0]?.id ?? '');
  const targets = chapters.flatMap((chapter) => [chapter.id, ...(chapter.anchors ?? []).map((anchor) => anchor.id)]);
  const targetKey = targets.join('\n');
  const follow = current === undefined;

  useEffect(() => {
    // A paged shell names the current chapter itself; the rail then has no scroll to follow.
    if (!follow) return undefined;
    const ids = targetKey.split('\n').filter(Boolean);
    let frame = 0;
    const update = () => {
      frame = 0;
      setActive(currentTarget(ids));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('hashchange', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('hashchange', schedule);
    };
  }, [targetKey, follow]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const shown = current ?? active;
  const activeChapter = chapters.find((chapter) => chapter.id === shown || chapter.anchors?.some((anchor) => anchor.id === shown)) ?? chapters[0];
  const position = activeChapter ? chapters.indexOf(activeChapter) + 1 : 0;

  return (
    <nav aria-label={label} className="ve-chapter-rail" data-ve-chapter-rail data-ve-open={open ? 'true' : 'false'}>
      <button
        aria-controls={listId}
        aria-expanded={open}
        className="ve-chapter-toggle"
        onClick={() => setOpen((value) => !value)}
        ref={toggleRef}
        type="button"
      >
        <span className="ve-chapter-count">{position}/{chapters.length}</span>
        <span className="ve-chapter-current">{activeChapter?.label ?? label}</span>
        <span aria-hidden="true" className="ve-chapter-caret">{open ? '−' : '+'}</span>
      </button>
      <div className="ve-chapter-panel">
        <p className="ve-chapter-heading">{label}</p>
        <ol className="ve-chapter-list" id={listId}>
          {chapters.map((chapter, index) => {
            const isCurrent = chapter === activeChapter;
            const here = current !== undefined && isCurrent;
            return (
              <li data-ve-current={isCurrent ? 'true' : undefined} data-ve-here={here ? 'true' : undefined} key={chapter.id}>
                <a aria-current={here ? 'page' : current === undefined && active === chapter.id ? 'location' : undefined} href={`#${chapter.id}`} onClick={() => setOpen(false)}>
                  <span aria-hidden="true" className="ve-chapter-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="ve-chapter-label">{chapter.label}{here ? <span className="ve-chapter-here">You are here</span> : null}</span>
                </a>
                {chapter.anchors?.length ? (
                  <ol className="ve-chapter-anchors">
                    {chapter.anchors.map((anchor) => (
                      <li key={anchor.id}>
                        <a aria-current={current === undefined && active === anchor.id ? 'location' : undefined} href={`#${anchor.id}`} onClick={() => setOpen(false)}>{anchor.label}</a>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </li>
            );
          })}
        </ol>
        {mode && onMode ? (
          <button className="ve-read-mode" data-ve-read-mode={mode} onClick={() => { onMode(mode === 'pages' ? 'one' : 'pages'); setOpen(false); }} type="button">
            {mode === 'pages' ? 'Read as one page' : 'Read by chapter'}
          </button>
        ) : null}
      </div>
    </nav>
  );
}

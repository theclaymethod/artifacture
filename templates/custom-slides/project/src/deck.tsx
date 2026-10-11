import { useEffect, useRef, useState, type ComponentType } from 'react';

interface PresentationStateNavigationOptions { index: number; count: number; onChange: (index: number) => void; }

const PRESENTATION_STATE_NAV_EVENT = 'presentation-state-navigate';
function getPresentationStateDirection(event: Event) {
  if (!(event instanceof CustomEvent)) return null;
  return event.detail?.direction === 'next' || event.detail?.direction === 'previous' ? event.detail.direction : null;
}

export function usePresentationStateNavigation({
  index,
  count,
  onChange,
}: PresentationStateNavigationOptions) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('usePresentationStateNavigation: count must be a positive integer');
  }
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new Error(`usePresentationStateNavigation: index ${index} must be within 0..${count - 1}`);
  }
  const ref = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ index, count, onChange });
  stateRef.current = { index, count, onChange };

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const handleStateNavigation = (rawEvent: Event) => {
      const direction = getPresentationStateDirection(rawEvent);
      if (!direction) return;
      const current = stateRef.current;
      const nextIndex = Math.max(0, Math.min(current.count - 1, current.index + (direction === 'next' ? 1 : -1)));
      if (nextIndex === current.index) return;
      rawEvent.preventDefault();
      // Advance the live ref before React commits so rapid key repeats cannot
      // collapse into repeated updates from the same stale index.
      current.index = nextIndex;
      current.onChange(nextIndex);
    };
    node.addEventListener(PRESENTATION_STATE_NAV_EVENT, handleStateNavigation);
    return () => node.removeEventListener(PRESENTATION_STATE_NAV_EVENT, handleStateNavigation);
  }, []);

  return {
    ref,
    'data-presentation-state-nav': 'true',
    'data-presentation-state-index': index,
    'data-presentation-state-count': count,
  } as const;
}

export type Slide = { id: string; title: string; component: ComponentType };

export function Deck({ slides }: { slides: Slide[] }) {
  if (!slides.length || new Set(slides.map(slide => slide.id)).size !== slides.length) {
    throw new Error('A deck needs slides with unique IDs.');
  }
  const fromHash = () => Math.max(0, slides.findIndex(slide => '#' + encodeURIComponent(slide.id) === window.location.hash));
  const [index, setIndex] = useState(fromHash);
  const stage = useRef<HTMLDivElement>(null);
  const go = (next: number) => {
    const target = Math.max(0, Math.min(slides.length - 1, next));
    window.location.hash = encodeURIComponent(slides[target].id);
    setIndex(target);
  };
  useEffect(() => {
    const sync = () => setIndex(fromHash());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [slides]);
  useEffect(() => { document.title = slides[index].title; }, [index, slides]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof Element && event.target.closest('button,a,input,textarea,select,video,audio,[contenteditable],[role="dialog"],[data-no-deck-nav]')) return;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'ArrowRight' || event.key === 'ArrowDown';
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const node = stage.current?.querySelector('[data-presentation-state-nav]');
        if (node && !node.dispatchEvent(new CustomEvent(PRESENTATION_STATE_NAV_EVENT, {
          cancelable: true, detail: { direction: next ? 'next' : 'previous' },
        }))) return;
      }
      go(index + (next ? 1 : -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, slides]);
  const Active = slides[index].component;
  return <main className="deck">
    <section ref={stage} key={slides[index].id} className="slide" aria-label={slides[index].title} data-slide-id={slides[index].id}><Active /></section>
    <nav aria-label="Slide navigation">
      <button onClick={() => go(index - 1)} disabled={index === 0}>Previous</button>
      {slides.map((slide, at) => <a key={slide.id} href={'#' + encodeURIComponent(slide.id)} aria-current={at === index ? 'page' : undefined}>{slide.title}</a>)}
      <button onClick={() => go(index + 1)} disabled={index === slides.length - 1}>Next</button>
    </nav>
  </main>;
}

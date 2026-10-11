// Calm scrolling for an explainer page. Every jump is instant and happens once; a control the
// reader clicks keeps its place on the screen while the content around it changes height.

const INPUT = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

/**
 * When a landing scrolls: `load` waits for the fonts and two frames (diagrams measure their column
 * in the frame after hydration), `frame` for the fonts and one frame (it lands before that frame
 * paints), `now` at once, for a chapter the shell has just shown in this task.
 */
export type LandingTime = 'load' | 'frame' | 'now';

let pending: { target: HTMLElement; cancel: () => void } | null = null;
// The target this task already landed: the blocks around it ask for the same landing.
let landed: HTMLElement | null = null;

function jump(target: HTMLElement) {
  releaseRoom();
  target.scrollIntoView({ block: 'start', behavior: 'instant' });
  landed = target;
  window.setTimeout(() => { if (landed === target) landed = null; }, 0);
}

/**
 * Scroll a fragment target under the sticky top bar, once. A call for the target that is pending
 * or has just landed joins it, a call for another replaces it, and reader input cancels a wait.
 */
export function landOn(target: HTMLElement, when: LandingTime = 'frame') {
  if (landed === target || (pending?.target === target && when !== 'now')) return;
  pending?.cancel();
  if (when === 'now') {
    // The blocks around the target open first, whichever handler runs first.
    for (let block = target.parentElement?.closest('details'); block; block = block.parentElement?.closest('details')) block.open = true;
    jump(target);
    return;
  }
  let frame = 0;
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    if (frame) cancelAnimationFrame(frame);
    for (const name of INPUT) window.removeEventListener(name, cancel);
    if (pending?.cancel === cancel) pending = null;
  };
  pending = { target, cancel };
  for (const name of INPUT) window.addEventListener(name, cancel, { passive: true });
  let frames = when === 'load' ? 2 : 1;
  let tries = 0;
  const step = () => {
    frame = 0;
    if (cancelled) return;
    // A chapter that is still hidden has no box yet: wait for it a few frames.
    if (--frames > 0 || (!target.getClientRects().length && tries++ < 10)) {
      frame = requestAnimationFrame(step);
      return;
    }
    cancel();
    jump(target);
  };
  const wait = () => { if (!cancelled) frame = requestAnimationFrame(step); };
  (document.fonts?.ready ?? Promise.resolve()).then(wait, wait);
}

// Room below the page: a block that closes near the end makes the page shorter, and the browser
// would pull the page down to fill the screen. A spacer holds the place, and shrinks as the reader
// scrolls back up (only ever below the screen).
let room: HTMLDivElement | null = null;
function setRoom(height: number) {
  if (height <= 0) {
    room?.remove();
    room = null;
    return;
  }
  if (!room) {
    room = document.createElement('div');
    room.setAttribute('aria-hidden', 'true');
    room.dataset.veScrollRoom = '';
    document.body.append(room);
  }
  room.style.height = `${Math.ceil(height)}px`;
}
function roomHeight() {
  return room ? room.getBoundingClientRect().height : 0;
}
function releaseRoom() {
  setRoom(0);
}
function trimRoom() {
  if (!room) return;
  const used = window.scrollY + window.innerHeight - (document.documentElement.scrollHeight - roomHeight());
  if (used < roomHeight()) setRoom(used);
}

/**
 * Keep an element at its place on the screen while the page changes around it: the next frame (and
 * one after, for a layout that lands late) scrolls by its drift. A browser that anchors the scroll
 * itself leaves no drift, and nothing scrolls.
 */
export function keepInPlace(element: Element, frames = 2) {
  const top = element.getBoundingClientRect().top;
  let left = frames;
  const check = () => {
    if (!element.isConnected) return;
    const drift = element.getBoundingClientRect().top - top;
    if (Math.abs(drift) >= 1) {
      const want = window.scrollY + drift;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (want > max) setRoom(roomHeight() + want - max);
      window.scrollTo({ top: want, behavior: 'instant' });
    }
    if (--left > 0) requestAnimationFrame(check);
    else trimRoom();
  };
  requestAnimationFrame(check);
}

// The controls that change the height of the page around themselves: a disclosure summary, and a
// figure's view switch (Simple / Detailed, Before / After).
const HOLD = 'summary, .ve-diagram-mode-switch';
let installed = false;

/** Install the page-wide handlers once: a clicked control keeps its place; the spacer trims. */
export function installCalmScroll() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  // Capture: runs before the block toggles and before React renders the new view.
  document.addEventListener('click', (event) => {
    const control = event.target instanceof Element ? event.target.closest(HOLD) : null;
    if (!control) return;
    // Room first, so the page never gets shorter than the screen and the browser never pulls it.
    const block = control.matches('summary') ? control.parentElement : null;
    const closing = block instanceof HTMLDetailsElement && block.open ? block.getBoundingClientRect().height : 0;
    setRoom(roomHeight() + Math.max(closing, window.innerHeight));
    keepInPlace(control);
  }, true);
  window.addEventListener('scroll', trimRoom, { passive: true });
}

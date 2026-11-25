/**
 * Swipe-to-dismiss for mobile surfaces (bottom sheet: swipe down, side drawer: swipe left).
 * - Decides the gesture direction after a few pixels; perpendicular movement is left to the browser (scrolling).
 * - While dragging, reports the offset (always >= 0) so the surface can follow the finger.
 * - On release dismisses when dragged past `threshold` of the surface size or flicked faster than `flickVelocity`.
 */
export interface SwipeToDismissOptions {
  direction: 'down' | 'left';
  /** Surface size along the gesture axis (px), used for the distance threshold. */
  size: () => number;
  /** Return false to ignore a touch (e.g. it started inside a list that is not scrolled to the top). */
  canStart?: (target: EventTarget | null) => boolean;
  onMove: (offset: number) => void;
  onRelease: (dismiss: boolean) => void;
  threshold?: number;
  flickVelocity?: number;
}

const DECIDE_AFTER_PX = 6;

export function attachSwipeToDismiss(element: HTMLElement, options: SwipeToDismissOptions): () => void {
  const threshold = options.threshold ?? 0.3;
  const flick = options.flickVelocity ?? 0.5; // px/ms
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let state: 'idle' | 'pending' | 'dragging' | 'ignored' = 'idle';
  let offset = 0;

  const main = (t: Touch) => (options.direction === 'down' ? t.clientY - startY : startX - t.clientX);
  const cross = (t: Touch) => (options.direction === 'down' ? t.clientX - startX : t.clientY - startY);

  const onStart = (e: TouchEvent) => {
    if (e.touches.length !== 1 || (options.canStart && !options.canStart(e.target))) {
      state = 'ignored';
      return;
    }
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    startTime = performance.now();
    offset = 0;
    state = 'pending';
  };

  const onMove = (e: TouchEvent) => {
    if (state === 'idle' || state === 'ignored') return;
    const t = e.touches[0];
    const m = main(t);
    if (state === 'pending') {
      if (Math.abs(m) < DECIDE_AFTER_PX && Math.abs(cross(t)) < DECIDE_AFTER_PX) return;
      // Only a gesture in the dismiss direction that dominates the other axis becomes a drag.
      state = m > 0 && Math.abs(m) > Math.abs(cross(t)) ? 'dragging' : 'ignored';
      if (state === 'ignored') return;
      startTime = performance.now();
    }
    e.preventDefault(); // stop page/list scrolling while the surface follows the finger
    offset = Math.max(0, m);
    options.onMove(offset);
  };

  const onEnd = () => {
    if (state === 'dragging') {
      const velocity = offset / Math.max(1, performance.now() - startTime);
      options.onRelease(offset > options.size() * threshold || (velocity > flick && offset > 24));
    }
    state = 'idle';
  };

  const onCancel = () => {
    if (state === 'dragging') options.onRelease(false);
    state = 'idle';
  };

  element.addEventListener('touchstart', onStart, { passive: true });
  element.addEventListener('touchmove', onMove, { passive: false });
  element.addEventListener('touchend', onEnd);
  element.addEventListener('touchcancel', onCancel);
  return () => {
    element.removeEventListener('touchstart', onStart);
    element.removeEventListener('touchmove', onMove);
    element.removeEventListener('touchend', onEnd);
    element.removeEventListener('touchcancel', onCancel);
  };
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

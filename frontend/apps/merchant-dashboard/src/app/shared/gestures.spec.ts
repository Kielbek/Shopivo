import { attachSwipeToDismiss } from '@shopivo/shared-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function touch(el: HTMLElement, type: string, x: number, y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const point = { clientX: x, clientY: y };
  Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [point] });
  el.dispatchEvent(event);
  return event;
}

describe('attachSwipeToDismiss', () => {
  let el: HTMLElement;
  let now = 0;
  beforeEach(() => {
    el = document.createElement('div');
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => vi.restoreAllMocks());

  function setup(direction: 'down' | 'left' = 'down', canStart?: () => boolean) {
    const moves: number[] = [];
    const releases: boolean[] = [];
    const detach = attachSwipeToDismiss(el, {
      direction, size: () => 400, canStart,
      onMove: (o) => moves.push(o), onRelease: (d) => releases.push(d),
    });
    return { moves, releases, detach };
  }

  it('follows the finger and dismisses after dragging past 30% of the size', () => {
    const { moves, releases } = setup();
    touch(el, 'touchstart', 100, 100);
    const move = touch(el, 'touchmove', 100, 160);
    now = 1000;
    touch(el, 'touchmove', 100, 260);
    touch(el, 'touchend', 0, 0);
    expect(move.defaultPrevented).toBe(true);
    expect(moves).toEqual([60, 160]);
    expect(releases).toEqual([true]);
  });

  it('snaps back after a short slow drag', () => {
    const { releases } = setup();
    touch(el, 'touchstart', 100, 100);
    touch(el, 'touchmove', 100, 140);
    now = 800;
    touch(el, 'touchend', 0, 0);
    expect(releases).toEqual([false]);
  });

  it('dismisses on a fast flick even over a short distance', () => {
    const { releases } = setup();
    touch(el, 'touchstart', 100, 100);
    touch(el, 'touchmove', 100, 110);
    now = 50;
    touch(el, 'touchmove', 100, 150);
    touch(el, 'touchend', 0, 0);
    expect(releases).toEqual([true]);
  });

  it('ignores movement in the opposite direction or across the axis (scrolling)', () => {
    const { moves, releases } = setup();
    touch(el, 'touchstart', 100, 300);
    const up = touch(el, 'touchmove', 100, 200);
    touch(el, 'touchend', 0, 0);
    touch(el, 'touchstart', 100, 100);
    touch(el, 'touchmove', 180, 110);
    touch(el, 'touchend', 0, 0);
    expect(up.defaultPrevented).toBe(false);
    expect(moves).toEqual([]);
    expect(releases).toEqual([]);
  });

  it('supports left swipes and the canStart guard', () => {
    let allowed = false;
    const { moves, detach } = setup('left', () => allowed);
    touch(el, 'touchstart', 300, 100);
    touch(el, 'touchmove', 200, 100);
    expect(moves).toEqual([]);
    allowed = true;
    touch(el, 'touchstart', 300, 100);
    touch(el, 'touchmove', 200, 102);
    expect(moves).toEqual([100]);
    detach();
    touch(el, 'touchstart', 300, 100);
    touch(el, 'touchmove', 100, 100);
    expect(moves).toEqual([100]);
  });
});

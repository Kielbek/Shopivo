import { DOCUMENT } from '@angular/common';
import { Directive, ElementRef, OnDestroy, inject, input } from '@angular/core';

/**
 * Small dark tooltip beside an element (e.g. icons of the collapsed navigation): shown on hover and keyboard focus,
 * rendered on <body> so scroll containers never clip it. The text should also be the element's accessible name.
 */
@Directive({
  selector: '[svTooltip]',
  host: {
    '(mouseenter)': 'show()', '(mouseleave)': 'hide()', '(focusin)': 'show()', '(focusout)': 'hide()', '(click)': 'hide()',
  },
})
export class TooltipDirective implements OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly doc = inject(DOCUMENT);
  readonly svTooltip = input<string | null | undefined>();
  readonly svTooltipSide = input<'right' | 'bottom'>('right');
  /** Only on desktop sizes (the drawer on phones shows the labels anyway). */
  readonly svTooltipDesktopOnly = input(true);
  private tip: HTMLElement | null = null;

  protected show(): void {
    const text = this.svTooltip();
    const view = this.doc.defaultView;
    if (!text || !view || (this.svTooltipDesktopOnly() && !view.matchMedia('(min-width: 1024px)').matches)) return;
    this.hide();
    const r = (this.host.nativeElement as HTMLElement).getBoundingClientRect();
    const tip = this.doc.createElement('div');
    tip.setAttribute('role', 'tooltip');
    tip.className = 'sv-tooltip';
    tip.textContent = text;
    this.doc.body.appendChild(tip);
    const t = tip.getBoundingClientRect();
    if (this.svTooltipSide() === 'right') {
      tip.style.left = `${r.right + 10}px`;
      tip.style.top = `${r.top + r.height / 2 - t.height / 2}px`;
    } else {
      tip.style.left = `${r.left + r.width / 2 - t.width / 2}px`;
      tip.style.top = `${r.bottom + 8}px`;
      tip.dataset['side'] = 'bottom';
    }
    requestAnimationFrame(() => tip.classList.add('is-open'));
    this.tip = tip;
  }

  protected hide(): void {
    this.tip?.remove();
    this.tip = null;
  }

  ngOnDestroy(): void {
    this.hide();
  }
}

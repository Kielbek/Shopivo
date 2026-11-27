import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { money } from '../core/format';
import { ProductCard } from '../storefront-api';

/**
 * Spotlight slider (promotions): one product in the middle, its neighbours smaller at the sides. Arrows, dots,
 * keyboard (← →) and swipe; only the middle product is a link, the others move into the middle. Endless (wraps).
 */
@Component({
  selector: 'sf-spotlight-carousel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let list = items();
    <div class="mx-auto grid max-w-[1120px] grid-cols-[clamp(30px,5vw,48px)_minmax(0,1fr)_clamp(30px,5vw,48px)] items-center gap-[clamp(2px,1vw,12px)]">
      <button type="button" class="grid aspect-square w-full place-items-center rounded-full border border-sf-line bg-sf-bg transition hover:border-sf-primary hover:bg-sf-primary hover:text-sf-on-primary"
        aria-label="Poprzedni produkt" [attr.aria-controls]="uid" (click)="go(-1)" [disabled]="list.length < 2">
        <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <div [id]="uid" class="sf-spot-stage" role="group" aria-roledescription="karuzela" aria-label="Produkty w promocji" tabindex="0"
        (keydown.arrowleft)="go(-1)" (keydown.arrowright)="go(1)" (pointerdown)="down($event)" (pointerup)="up($event)" (pointercancel)="startX = null">
        @for (p of list; track p.id; let i = $index) {
          @let off = offset(i);
          @let sale = !!p.compareAtMinor && p.compareAtMinor > p.priceMinor;
          <a class="sf-spot-slide" [attr.href]="'/produkt/' + p.slug" [style.--offset]="off" [style.--scale]="off === 0 ? 1 : 0.69"
            [style.--visible]="abs(off) <= 1 ? 1 : 0" [attr.data-visible]="abs(off) <= 1" [attr.tabindex]="off === 0 ? 0 : -1"
            [attr.aria-hidden]="off !== 0" [style.z-index]="off === 0 ? 2 : 1" draggable="false" (click)="open($event, i, p)">
            @if (p.imageUrl) {<img [src]="p.imageUrl" [alt]="p.imageAlt || p.name" draggable="false" decoding="async" loading="lazy" />}
            @if (sale) {<span class="absolute right-[4%] top-[3%] rotate-[8deg] rounded-full bg-[#a84b11] px-[0.6em] py-[0.35em] text-[clamp(12px,1.5vw,17px)] font-black text-white">−{{ off0(p) }}%</span>}
            <h3 class="mb-1 mt-3 flex min-h-[2.26em] items-center justify-center text-[clamp(15px,1.8vw,22px)] font-extrabold leading-[1.13]">{{ p.name }}</h3>
            <span class="flex flex-wrap items-baseline justify-center gap-x-2 text-[clamp(14px,1.7vw,20px)] font-extrabold" style="color: var(--sf-accent-ink)">
              <strong class="whitespace-nowrap">{{ fmt(p.priceMinor, p.currency) }}</strong>
              @if (sale) {<del class="whitespace-nowrap text-[0.76em] font-semibold text-sf-muted">{{ fmt(p.compareAtMinor!, p.currency) }}</del>}
            </span>
          </a>
        }
      </div>
      <button type="button" class="grid aspect-square w-full place-items-center rounded-full border border-sf-line bg-sf-bg transition hover:border-sf-primary hover:bg-sf-primary hover:text-sf-on-primary"
        aria-label="Następny produkt" [attr.aria-controls]="uid" (click)="go(1)" [disabled]="list.length < 2">
        <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
      </button>
    </div>
    @if (list.length > 1) {
      <div class="mt-3 flex justify-center gap-2" role="group" aria-label="Pozycja w karuzeli">
        @for (p of list; track p.id; let i = $index) {
          <button type="button" class="sf-spot-dot" [attr.aria-current]="i === index()" [attr.aria-label]="'Pokaż: ' + p.name" (click)="index.set(i)"></button>
        }
      </div>
    }
    <p class="sr-only" aria-live="polite">{{ status() }}</p>
  `,
})
export class SpotlightCarouselComponent {
  readonly items = input.required<ProductCard[]>();
  protected readonly index = signal(0);
  protected readonly uid = 'spot-' + Math.random().toString(36).slice(2, 8);
  protected startX: number | null = null;
  private dragged = false;
  private readonly router = inject(Router);
  protected readonly status = computed(() => {
    const list = this.items();
    const p = list[this.index() % Math.max(1, list.length)];
    return p ? `Produkt ${this.index() + 1} z ${list.length}: ${p.name}` : '';
  });

  /** Signed distance from the middle, the shorter way round (the slider wraps). */
  protected offset(i: number): number {
    const n = this.items().length;
    let d = i - this.index();
    if (d > n / 2) d -= n;
    if (d < -n / 2) d += n;
    return d;
  }

  protected go(step: number): void {
    const n = this.items().length;
    if (n) this.index.update((i) => (i + step + n) % n);
  }

  protected down(e: PointerEvent): void {
    this.startX = e.clientX;
    this.dragged = false;
  }

  /** The middle product opens; a side one moves to the middle; a swipe never opens anything. */
  protected open(e: MouseEvent, i: number, p: ProductCard): void {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (this.dragged) return;
    if (this.offset(i) === 0) void this.router.navigate(['/produkt', p.slug]);
    else this.index.set(i);
  }

  protected up(e: PointerEvent): void {
    if (this.startX === null) return;
    const dx = e.clientX - this.startX;
    this.startX = null;
    if (Math.abs(dx) > 40) {
      this.dragged = true;
      this.go(dx < 0 ? 1 : -1);
    }
  }

  protected abs(n: number): number {
    return Math.abs(n);
  }

  protected off0(p: ProductCard): number {
    return p.compareAtMinor ? Math.round((1 - p.priceMinor / p.compareAtMinor) * 100) : 0;
  }

  protected fmt(minor: number, currency: string): string {
    return money(minor, currency);
  }
}

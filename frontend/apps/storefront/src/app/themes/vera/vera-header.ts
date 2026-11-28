import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CustomerSession } from '../../core/account';
import { CartState } from '../../core/cart';
import { routeOf } from '../../core/link-token';
import { StoreState } from '../../core/store-state';
import { Wishlist } from '../../core/wishlist';

/**
 * VÉRA header: dark announcement strip, sticky translucent bar with a spaced serif wordmark (or the store's logo),
 * underlined navigation, a search pill, wishlist, an account pill and a cart button that opens the cart drawer.
 * Everything comes from the store: its name, menu (or top categories), customer session, wishlist and cart.
 */
@Component({
  selector: 'sf-vera-header',
  imports: [FormsModule, RouterLink, RouterLinkActive, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = store.store()!;
    @let ts = store.settings();
    @let logo = store.image(ts['logoImage'], 'w400');
    @if (ts['announcement']) {
      <div class="bg-sf-text px-4 py-2.5 text-center text-[12px] font-medium uppercase tracking-[0.12em] text-sf-bg">{{ ts['announcement'] }}</div>
    }
    <header class="z-30 border-b border-sf-line bg-sf-bg/90 backdrop-blur-md" [class.sticky]="ts['stickyHeader'] !== 'no'" [class.top-0]="ts['stickyHeader'] !== 'no'">
      <div class="sf-container flex h-[72px] items-center justify-between gap-3 lg:h-20">
        <div class="flex min-w-0 items-center gap-3">
          <button type="button" class="-ml-2 flex size-10 items-center justify-center lg:hidden" aria-label="Menu" aria-controls="sf-drawer" (click)="menu.emit()">
            <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
          <a routerLink="/" class="flex min-w-0 items-center" [attr.aria-label]="s.name + ' — strona główna'">
            @if (logo) {<img [src]="logo" [alt]="s.name" class="h-9 w-auto max-w-[180px] object-contain" />}
            @else {<span class="sf-display truncate text-[19px] font-bold uppercase tracking-[0.1em] sm:text-[28px] sm:tracking-[0.18em]">{{ s.name }}<span class="font-normal text-sf-accent">.</span></span>}
          </a>
        </div>

        <nav class="hidden items-center gap-8 text-[14px] font-medium tracking-wide lg:flex" aria-label="Kategorie">
          @for (m of links(); track $index) {
            <a [routerLink]="m.path" [queryParams]="m.query" routerLinkActive="!border-sf-text !text-sf-text" [routerLinkActiveOptions]="{ exact: false }"
              class="border-b-2 border-transparent pb-1 text-sf-muted transition hover:text-sf-text">{{ m.label }}</a>
          }
        </nav>

        <div class="flex items-center gap-1 sm:gap-2">
          @if (ts['showSearch'] !== 'no') {
            <form class="hidden items-center rounded-full border border-sf-line bg-sf-surface px-3.5 py-1.5 transition focus-within:border-sf-text md:flex" role="search" (ngSubmit)="search()">
              <svg viewBox="0 0 24 24" class="mr-2 size-4 text-sf-muted" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m21 21-4.35-4.35M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z"/></svg>
              <label class="sr-only" for="vera-search">Szukaj produktów</label>
              <input id="vera-search" name="q" type="search" class="w-32 bg-transparent text-[14px] outline-none placeholder:text-sf-muted lg:w-44" placeholder="Szukaj…" [(ngModel)]="query" />
            </form>
          }
          <a routerLink="/ulubione" class="relative flex size-10 items-center justify-center" [attr.aria-label]="'Ulubione, produktów: ' + wishlist.ids().length">
            <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4.3 6.3a4.5 4.5 0 0 0 0 6.4L12 20.4l7.7-7.7a4.5 4.5 0 0 0-6.4-6.4L12 7.6l-1.3-1.3a4.5 4.5 0 0 0-6.4 0Z" stroke-linejoin="round"/></svg>
            @if (wishlist.ids().length > 0) {<span class="absolute right-1.5 top-1.5 size-2 rounded-full bg-sf-accent" aria-hidden="true"></span>}
          </a>
          <a [routerLink]="customer.account() ? '/konto' : '/konto/logowanie'"
            class="hidden items-center gap-2 rounded-full border border-sf-line px-3 py-1.5 text-[13px] font-medium transition hover:border-sf-text sm:flex">
            <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7Z"/></svg>
            <span class="max-w-[110px] truncate">{{ customer.account() ? (customer.account()!.firstName || 'Moje konto') : 'Zaloguj się' }}</span>
          </a>
          <a [routerLink]="customer.account() ? '/konto' : '/konto/logowanie'" class="flex size-10 items-center justify-center sm:hidden"
            [attr.aria-label]="customer.account() ? 'Moje konto' : 'Zaloguj się'">
            <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7Z"/></svg>
          </a>
          <!-- Cart: side panel or the cart page ("Koszyk" in the editor) -->
          <ng-template #cartIcon>
            <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M16 11V7a4 4 0 0 0-8 0v4M5 9h14l1 12H4L5 9Z"/></svg>
            <span class="flex size-5 items-center justify-center rounded-full bg-sf-text text-[11px] font-semibold text-sf-bg" aria-hidden="true">{{ cart.count() }}</span>
          </ng-template>
          @if (store.cartDrawer()) {
            <button type="button" class="flex h-10 items-center gap-1.5 px-1.5" aria-haspopup="dialog" aria-controls="sf-cart-drawer"
              [attr.aria-label]="'Koszyk, produktów: ' + cart.count()" (click)="cart.drawer.set(true)"><ng-container [ngTemplateOutlet]="cartIcon" /></button>
          } @else {
            <a routerLink="/koszyk" class="flex h-10 items-center gap-1.5 px-1.5" [attr.aria-label]="'Koszyk, produktów: ' + cart.count()"><ng-container [ngTemplateOutlet]="cartIcon" /></a>
          }
        </div>
      </div>
    </header>
  `,
})
export class VeraHeaderComponent {
  protected readonly store = inject(StoreState);
  protected readonly cart = inject(CartState);
  protected readonly customer = inject(CustomerSession);
  protected readonly wishlist = inject(Wishlist);
  private readonly router = inject(Router);
  readonly menu = output<void>();
  protected query = '';

  /** The store's menu, or its top categories when no menu is set. */
  protected readonly links = computed(() => {
    const s = this.store.store();
    if (s?.menu.length) return s.menu.map((m) => ({ label: m.label, ...routeOf(m.path) }));
    return this.store.topCategories().slice(0, 6).map((c) => ({ label: c.name, path: `/kategoria/${c.slug}`, query: null }));
  });

  protected search(): void {
    const q = this.query.trim();
    if (q) void this.router.navigate(['/szukaj'], { queryParams: { q } });
  }
}

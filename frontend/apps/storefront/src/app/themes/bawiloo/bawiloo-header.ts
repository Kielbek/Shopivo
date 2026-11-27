import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CustomerSession } from '../../core/account';
import { CartState } from '../../core/cart';
import { routeOf } from '../../core/link-token';
import { StoreState } from '../../core/store-state';
import { Wishlist } from '../../core/wishlist';

/**
 * Bawiloo header: warm gradient bar (from the theme's accent colour), rounded display wordmark (or the store's logo),
 * bold uppercase menu, wishlist, account and a cart button opening the side cart. Data: store menu or top categories.
 */
@Component({
  selector: 'sf-bawiloo-header',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = store.store()!;
    @let ts = store.settings();
    @let logo = store.image(ts['logoImage'], 'w400');
    @if (ts['announcement']) {
      <div class="bg-sf-text px-4 py-2 text-center text-[12px] font-extrabold uppercase tracking-[0.14em] text-sf-bg">{{ ts['announcement'] }}</div>
    }
    <header class="sf-play-gradient z-30 shadow-[0_2px_12px_rgba(159,89,24,0.05)]" style="color: var(--sf-on-accent)" [class.sticky]="ts['stickyHeader'] !== 'no'" [class.top-0]="ts['stickyHeader'] !== 'no'">
      <div class="mx-auto flex h-16 w-full max-w-[1500px] items-center justify-between gap-3 px-3 sm:h-[72px] sm:px-8">
        <div class="flex min-w-0 items-center gap-2">
          <button type="button" class="-ml-1 flex size-10 items-center justify-center lg:hidden" aria-label="Menu" aria-controls="sf-drawer" (click)="menu.emit()">
            <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
          </button>
          <a routerLink="/" class="flex min-w-0 items-center" [attr.aria-label]="s.name + ' — strona główna'">
            @if (logo) {<img [src]="logo" [alt]="s.name" class="h-10 w-auto max-w-[170px] object-contain" />}
            @else {<span class="sf-display truncate text-[26px] font-bold tracking-[-0.02em] sm:text-[30px]">{{ s.name }}</span>}
          </a>
        </div>
        <nav class="hidden min-w-0 flex-1 items-center justify-center gap-x-6 text-[12px] font-extrabold uppercase tracking-wide lg:flex" aria-label="Kategorie">
          <a routerLink="/" routerLinkActive="underline decoration-2 underline-offset-8" [routerLinkActiveOptions]="{ exact: true }" class="hover:opacity-80">Start</a>
          <a routerLink="/produkty" routerLinkActive="underline decoration-2 underline-offset-8" class="hover:opacity-80">Sklep</a>
          @for (m of links(); track $index) {
            <a [routerLink]="m.path" [queryParams]="m.query" routerLinkActive="underline decoration-2 underline-offset-8" class="whitespace-nowrap hover:opacity-80">{{ m.label }}</a>
          }
          <a routerLink="/produkty" [queryParams]="{ promocje: 'tak' }" class="rounded-full bg-sf-text px-4 py-2 text-sf-bg hover:opacity-90">Promocje</a>
        </nav>
        <div class="flex items-center">
          <a routerLink="/ulubione" class="relative flex size-10 items-center justify-center" [attr.aria-label]="'Ulubione, produktów: ' + wishlist.ids().length">
            <svg viewBox="0 0 24 24" class="size-[22px]" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20s-7-4.4-9.2-8.6C1.3 8.5 3 5 6.4 5c2 0 3.3 1.1 4.1 2.3h3C14.3 6.1 15.6 5 17.6 5 21 5 22.7 8.5 21.2 11.4 19 15.6 12 20 12 20Z" stroke-linejoin="round"/></svg>
            @if (wishlist.ids().length > 0) {<span class="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-sf-text px-1 text-[10px] font-bold text-sf-bg">{{ wishlist.ids().length }}</span>}
          </a>
          <a [routerLink]="customer.account() ? '/konto' : '/konto/logowanie'" class="flex size-10 items-center justify-center" [attr.aria-label]="customer.account() ? 'Moje konto' : 'Zaloguj się'">
            <svg viewBox="0 0 24 24" class="size-[22px]" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"/></svg>
          </a>
          <button type="button" class="relative flex size-10 items-center justify-center" aria-haspopup="dialog" aria-controls="sf-cart-drawer"
            [attr.aria-label]="'Koszyk, produktów: ' + cart.count()" (click)="cart.drawer.set(true)">
            <svg viewBox="0 0 24 24" class="size-[22px]" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6"/><circle cx="10" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/></svg>
            @if (cart.count() > 0) {<span class="absolute right-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-sf-text px-1 text-[10px] font-bold text-sf-bg">{{ cart.count() }}</span>}
          </button>
        </div>
      </div>
    </header>
  `,
})
export class BawilooHeaderComponent {
  protected readonly store = inject(StoreState);
  protected readonly cart = inject(CartState);
  protected readonly customer = inject(CustomerSession);
  protected readonly wishlist = inject(Wishlist);
  readonly menu = output<void>();

  protected readonly links = computed(() => {
    const s = this.store.store();
    if (s?.menu.length) return s.menu.slice(0, 6).map((m) => ({ label: m.label, ...routeOf(m.path) }));
    return this.store.topCategories().slice(0, 4).map((c) => ({ label: c.name, path: `/kategoria/${c.slug}`, query: null }));
  });
}

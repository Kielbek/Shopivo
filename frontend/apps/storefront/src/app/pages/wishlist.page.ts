import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { CustomerSession } from '../core/account';
import { Seo } from '../core/seo';
import { StoreState } from '../core/store-state';
import { Wishlist } from '../core/wishlist';
import { StorefrontApi } from '../storefront-api';
import { ProductCardComponent } from '../ui/product-card';

/** Favourite products (browser-rendered: the list lives in this browser or in the customer's account). */
@Component({
  selector: 'sf-wishlist',
  imports: [RouterLink, ProductCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sf-container py-10">
      <h1 class="text-[28px] font-semibold tracking-tight">Ulubione</h1>
      @if (!session.account() && session.ready()) {
        <p class="mt-2 text-sf-muted">Ulubione zapisujemy w tej przeglądarce.
          <a routerLink="/konto/logowanie" class="sf-link">Zaloguj się</a>, aby mieć je na każdym urządzeniu.</p>
      }
      @if (wishlist.error(); as e) {<p class="mt-4 text-sf-danger" role="alert">{{ e }}</p>}
      @if (loading()) {
        <ul class="mt-8 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-4" role="status" aria-busy="true">
          <span class="sr-only">Wczytywanie…</span>
          @for (i of [1, 2, 3, 4]; track i) {<li><span class="sf-shimmer block aspect-square rounded-[10px]"></span><span class="sf-shimmer mt-3 block h-4 w-2/3 rounded"></span></li>}
        </ul>
      } @else if (cards().length) {
        <ul class="mt-8 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-4">
          @for (p of cards(); track p.id) {<li><sf-product-card [product]="p" /></li>}
        </ul>
      } @else {
        <div class="mt-10 max-w-md">
          <p class="text-[17px] font-medium">Nie masz jeszcze ulubionych produktów.</p>
          <p class="mt-1 text-sf-muted">Kliknij serduszko przy produkcie, aby wrócić do niego później.</p>
          <a routerLink="/produkty" class="sf-btn mt-5">Przeglądaj produkty</a>
        </div>
      }
    </div>
  `,
})
export class WishlistPage {
  private readonly api = inject(StorefrontApi);
  private readonly store = inject(StoreState);
  private readonly seo = inject(Seo);
  protected readonly session = inject(CustomerSession);
  protected readonly wishlist = inject(Wishlist);
  private readonly data = rxResource({
    params: () => this.wishlist.ids().join(','),
    stream: ({ params }) => (params ? this.api.productCards(params.split(',')) : of([])),
  });
  /** Cards follow the heart clicks at once (a removed product disappears without waiting for the API). */
  protected readonly cards = computed(() => {
    const ids = new Set(this.wishlist.ids());
    return (this.data.hasValue() ? this.data.value() : []).filter((c) => ids.has(c.id));
  });
  protected readonly loading = computed(() => this.data.isLoading() && !this.data.hasValue());

  constructor() {
    effect(() => {
      const s = this.store.store();
      if (s) this.seo.set({ title: 'Ulubione', path: '/ulubione', noindex: true }, s.name);
    });
  }
}

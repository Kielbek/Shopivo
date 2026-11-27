import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { NavigationStart, Router, RouterLink } from '@angular/router';
import { firstValueFrom, filter } from 'rxjs';
import { CartState } from '../../core/cart';
import { money } from '../../core/format';
import { StorefrontApi } from '../../storefront-api';

/**
 * Side cart: the real server cart (prices, availability, quantities), with a progress bar towards free delivery when
 * the store's shipping methods offer it. Checkout happens on the normal checkout page.
 */
@Component({
  selector: 'sf-cart-drawer',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    @let c = cart.cart();
    <div class="fixed inset-0 z-50" [class.pointer-events-none]="!cart.drawer()" [attr.aria-hidden]="!cart.drawer()">
      <div class="absolute inset-0 bg-black/50 transition-opacity duration-300" [class.opacity-0]="!cart.drawer()" (click)="close()"></div>
      <aside id="sf-cart-drawer" class="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-sf-bg transition-transform duration-300"
        [class.translate-x-full]="!cart.drawer()" [class.shadow-2xl]="cart.drawer()" role="dialog" aria-modal="true" aria-labelledby="sf-cart-title" [attr.inert]="cart.drawer() ? null : ''">
        <div class="flex items-center justify-between border-b border-sf-line px-6 py-5">
          <h2 id="sf-cart-title" class="text-[26px] font-semibold">Twój koszyk ({{ cart.count() }})</h2>
          <button type="button" class="flex size-10 items-center justify-center text-sf-muted hover:text-sf-text" aria-label="Zamknij koszyk" (click)="close()">
            <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </div>

        @if (freeFrom(); as limit) {
          @let sub = c?.subtotalMinor ?? 0;
          <div class="border-b border-sf-line bg-sf-surface px-6 py-4 text-[13px]">
            @if (sub >= limit) {<p class="font-medium">Masz darmową dostawę!</p>}
            @else {<p class="font-medium">Brakuje Ci {{ fmt(limit - sub) }} do darmowej dostawy.</p>}
            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-sf-line" role="progressbar" aria-label="Postęp do darmowej dostawy"
              [attr.aria-valuenow]="progress()" aria-valuemin="0" aria-valuemax="100">
              <div class="h-full bg-sf-accent transition-all duration-300" [style.width.%]="progress()"></div>
            </div>
          </div>
        }

        <div class="flex-1 overflow-y-auto px-6 py-5">
          @if (!c?.lines?.length) {
            <div class="flex h-full flex-col items-center justify-center text-center">
              <p class="text-[22px] font-semibold sf-display">Koszyk jest pusty</p>
              <p class="mt-2 text-[14px] text-sf-muted">Dodaj coś, co Ci się spodoba.</p>
              <a routerLink="/produkty" class="sf-btn sf-btn-caps mt-6" (click)="close()">Przeglądaj produkty</a>
            </div>
          } @else {
            <ul class="space-y-5">
              @for (l of c!.lines; track l.variantId) {
                <li class="flex gap-4 border-b border-sf-line pb-5 last:border-0">
                  <div class="min-w-0 flex-1">
                    <p class="font-medium leading-snug">{{ l.name }}</p>
                    @if (l.variantTitle) {<p class="text-[13px] text-sf-muted">{{ l.variantTitle }}</p>}
                    @if (!l.available) {<p class="text-[13px] text-sf-danger">Niedostępny</p>}
                    <div class="mt-2 flex items-center gap-3">
                      <div class="flex items-center rounded-lg border border-sf-line">
                        <button type="button" class="size-8 text-[16px] disabled:opacity-40" [disabled]="cart.busy() || l.quantity <= 1" [attr.aria-label]="'Zmniejsz ilość: ' + l.name" (click)="set(l.variantId, l.quantity - 1)">−</button>
                        <span class="w-7 text-center text-[13px] font-semibold" aria-live="polite">{{ l.quantity }}</span>
                        <button type="button" class="size-8 text-[16px] disabled:opacity-40" [disabled]="cart.busy()" [attr.aria-label]="'Zwiększ ilość: ' + l.name" (click)="set(l.variantId, l.quantity + 1)">+</button>
                      </div>
                      <button type="button" class="text-[12px] text-sf-muted underline hover:text-sf-danger" [disabled]="cart.busy()" (click)="set(l.variantId, 0)">Usuń</button>
                    </div>
                  </div>
                  <p class="shrink-0 text-[14px] font-semibold">{{ fmt(l.lineTotalMinor, c!.currency) }}</p>
                </li>
              }
            </ul>
          }
        </div>

        @if (c?.lines?.length) {
          <div class="space-y-4 border-t border-sf-line bg-sf-surface px-6 py-5">
            @if (error(); as e) {<p class="text-[13px] text-sf-danger" role="alert">{{ e }}</p>}
            <div class="flex items-center justify-between"><span class="text-[14px] text-sf-muted">Suma</span>
              <span class="text-[18px] font-semibold">{{ fmt(c!.subtotalMinor, c!.currency) }}</span></div>
            <p class="text-[12px] text-sf-muted">Koszt dostawy wybierzesz w następnym kroku.</p>
            <a routerLink="/zamowienie" class="sf-btn sf-btn-caps w-full" (click)="close()">Przejdź do kasy</a>
            <a routerLink="/koszyk" class="block text-center text-[13px] underline" (click)="close()">Zobacz koszyk</a>
          </div>
        }
      </aside>
    </div>
  `,
})
export class CartDrawerComponent {
  protected readonly cart = inject(CartState);
  private readonly api = inject(StorefrontApi);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  /** Lowest "free from" amount among the store's delivery methods (null = no free delivery offered). */
  protected readonly freeFrom = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  private loaded = false;
  protected readonly progress = computed(() => {
    const limit = this.freeFrom();
    return limit ? Math.min(100, Math.round(((this.cart.cart()?.subtotalMinor ?? 0) / limit) * 100)) : 0;
  });

  constructor() {
    effect(() => {
      if (this.cart.drawer() && !this.loaded && this.browser) {
        this.loaded = true;
        void firstValueFrom(this.api.checkoutOptions()).then((o) => {
          const limits = o.shippingMethods.map((m) => m.freeFromMinor).filter((v): v is number => v !== null && v > 0);
          this.freeFrom.set(limits.length ? Math.min(...limits) : null);
        }, () => this.freeFrom.set(null));
      }
    });
    inject(Router).events.pipe(filter((e) => e instanceof NavigationStart)).subscribe(() => this.cart.drawer.set(false));
  }

  protected close(): void {
    this.cart.drawer.set(false);
  }

  protected fmt(minor: number, currency = 'PLN'): string {
    return money(minor, currency);
  }

  protected async set(variantId: string, quantity: number): Promise<void> {
    this.error.set(null);
    try {
      await this.cart.update(variantId, quantity);
    } catch {
      this.error.set('Nie udało się zmienić ilości. Spróbuj ponownie.');
    }
  }
}

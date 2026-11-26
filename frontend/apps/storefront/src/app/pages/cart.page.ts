import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartState } from '../core/cart';
import { money } from '../core/format';
import { Seo } from '../core/seo';
import { StoreState } from '../core/store-state';

@Component({
  selector: 'sf-cart',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sf-container py-8">
      <h1 class="text-[30px] font-semibold tracking-tight">Koszyk</h1>
      @if (error(); as e) {<p class="mt-4 text-sf-danger" role="alert">{{ e }}</p>}
      @if (!cart.cart()?.lines?.length) {
        <p class="mt-6 text-sf-muted">Twój koszyk jest pusty.</p>
        <a routerLink="/produkty" class="sf-btn mt-6">Przeglądaj produkty</a>
      } @else {
        @let c = cart.cart()!;
        <div class="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <ul class="divide-y divide-sf-line border-y border-sf-line">
            @for (l of c.lines; track l.variantId) {
              <li class="flex flex-wrap items-center gap-4 py-4">
                <div class="min-w-0 flex-1">
                  <p class="font-medium">{{ l.name }}</p>
                  @if (l.variantTitle) {<p class="text-[13px] text-sf-muted">{{ l.variantTitle }}</p>}
                  <p class="text-[13px] text-sf-muted">{{ fmt(l.unitPriceMinor) }} / szt.</p>
                  @if (!l.available) {<p class="text-[13px] font-medium text-sf-danger">Niedostępny w tej ilości{{ l.availableQuantity !== null && l.availableQuantity > 0 ? ' (dostępne: ' + l.availableQuantity + ')' : '' }} — zmień ilość lub usuń.</p>}
                </div>
                <div class="flex items-center gap-2">
                  <label class="sr-only" [for]="'q-' + l.variantId">Ilość: {{ l.name }}</label>
                  <input [id]="'q-' + l.variantId" type="number" min="1" max="999" class="sf-input !h-10 !w-20 text-center" [value]="l.quantity"
                    (change)="set(l.variantId, $any($event.target).value)" />
                  <button type="button" class="px-2 text-[13px] text-sf-muted underline" (click)="remove(l.variantId)">Usuń</button>
                </div>
                <p class="w-24 text-right font-semibold tabular-nums">{{ fmt(l.lineTotalMinor) }}</p>
              </li>
            }
          </ul>
          <aside class="sf-panel h-fit p-5">
            <dl class="flex justify-between text-[15px]"><dt>Produkty ({{ c.itemCount }})</dt><dd class="font-semibold tabular-nums">{{ fmt(c.subtotalMinor) }}</dd></dl>
            <p class="mt-1 text-[13px] text-sf-muted">Koszt dostawy wybierzesz w następnym kroku.</p>
            <a routerLink="/zamowienie" class="sf-btn mt-5 w-full" [class.pointer-events-none]="!c.checkoutReady" [class.opacity-55]="!c.checkoutReady"
              [attr.aria-disabled]="!c.checkoutReady">Przejdź do zamówienia</a>
            <a routerLink="/produkty" class="mt-3 block text-center text-[14px] hover:underline">Kontynuuj zakupy</a>
          </aside>
        </div>
      }
    </div>
  `,
})
export class CartPage {
  protected readonly cart = inject(CartState);
  private readonly store = inject(StoreState);
  protected readonly error = signal<string | null>(null);

  constructor() {
    const s = this.store.store();
    inject(Seo).set({ title: 'Koszyk', path: '/koszyk', noindex: true }, s?.name ?? '');
    void this.cart.refresh();
  }

  protected fmt(v: number): string {
    return money(v, this.cart.cart()?.currency);
  }

  protected async set(variantId: string, value: string): Promise<void> {
    await this.run(() => this.cart.update(variantId, Math.min(999, Math.max(1, Math.round(Number(value) || 1)))));
  }

  protected async remove(variantId: string): Promise<void> {
    await this.run(() => this.cart.update(variantId, 0));
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.error.set(null);
    try {
      await action();
    } catch (e: unknown) {
      this.error.set((e as { error?: { detail?: string } }).error?.detail ?? 'Nie udało się zmienić koszyka.');
      await this.cart.refresh();
    }
  }
}

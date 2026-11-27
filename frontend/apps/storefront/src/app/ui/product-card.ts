import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CartState } from '../core/cart';
import { money } from '../core/format';
import { StoreState } from '../core/store-state';
import { ProductCard, StorefrontApi } from '../storefront-api';
import { FavouriteButtonComponent } from './favourite-button';
import { PriceComponent } from './price';

@Component({
  selector: 'sf-product-card',
  imports: [RouterLink, PriceComponent, FavouriteButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = product();
    @let sale = !!p.compareAtMinor && p.compareAtMinor > p.priceMinor;
    @if (store.layout() === 'vera') {
      <!-- VÉRA: tall 3:4 photo, quick actions on hover (always visible on touch screens), price on the right -->
      <div class="group flex h-full flex-col">
        <div class="relative mb-3.5 aspect-[3/4] overflow-hidden rounded-xl bg-sf-surface">
          <a [routerLink]="['/produkt', p.slug]" class="block size-full" [attr.aria-label]="p.name" tabindex="-1">
            @if (p.imageUrl) {
              <img [src]="p.imageUrl" [alt]="p.imageAlt || p.name" loading="lazy" decoding="async" width="400" height="533"
                class="size-full object-cover transition duration-500 group-hover:scale-105" />
            } @else {
              <span class="flex size-full items-center justify-center text-[13px] text-sf-muted">Brak zdjęcia</span>
            }
          </a>
          @if (sale) {<span class="absolute left-3 top-3 rounded bg-sf-danger px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">Promocja</span>}
          @else if (!p.available) {<span class="absolute left-3 top-3 rounded bg-sf-bg/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider">Wyprzedane</span>}
          <sf-favourite-button class="absolute right-2.5 top-2.5" [productId]="p.id" [name]="p.name" />
          <div class="absolute inset-x-3 bottom-3 flex gap-2 transition duration-300 [@media(hover:hover)]:translate-y-2 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:translate-y-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:translate-y-0 [@media(hover:hover)]:group-hover:opacity-100">
            @if (p.available) {
              <button type="button" class="flex-1 rounded-lg bg-sf-text/95 py-2.5 text-[12px] font-medium text-sf-bg transition hover:bg-sf-text disabled:opacity-60"
                [disabled]="adding()" [attr.aria-label]="'Dodaj do koszyka: ' + p.name" (click)="quickAdd()">{{ adding() ? 'Dodawanie…' : '+ Do koszyka' }}</button>
            }
            <a [routerLink]="['/produkt', p.slug]" class="rounded-lg bg-sf-bg/95 px-3 py-2.5 text-[12px] font-medium transition hover:bg-sf-bg" [class.flex-1]="!p.available" [class.max-sm:hidden]="p.available"
              [class.text-center]="!p.available" [attr.aria-label]="'Szczegóły: ' + p.name">Szczegóły</a>
          </div>
        </div>
        @if (note(); as n) {<p class="mb-1 text-[12px] text-sf-danger" role="alert">{{ n }}</p>}
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            @if (p.brand) {<p class="text-[11px] uppercase tracking-wider text-sf-muted">{{ p.brand }}</p>}
            <a [routerLink]="['/produkt', p.slug]" class="mt-0.5 line-clamp-2 font-medium transition hover:text-sf-accent">{{ p.name }}</a>
          </div>
          <div class="shrink-0 text-right">
            <p class="text-[14px] font-semibold" [class.text-sf-danger]="sale">@if (p.maxPriceMinor > p.priceMinor) {od }{{ fmt(p.priceMinor, p.currency) }}</p>
            @if (sale) {<p class="text-[12px] text-sf-muted line-through">{{ fmt(p.compareAtMinor!, p.currency) }}</p>}
          </div>
        </div>
        @if (sale && p.lowestPrice30dMinor !== null) {<p class="mt-1 text-[11px] text-sf-muted">Najniższa cena z 30 dni przed obniżką: {{ fmt(p.lowestPrice30dMinor, p.currency) }}</p>}
      </div>
    } @else {
      <div class="relative h-full">
      <a [routerLink]="['/produkt', p.slug]" class="group flex h-full flex-col" [class]="cardClass()">
        <div class="sf-media relative aspect-square">
          @if (p.imageUrl) {
            <img [src]="p.imageUrl" [alt]="p.imageAlt || p.name" loading="lazy" decoding="async" width="400" height="400"
              class="size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
          } @else {
            <span class="flex size-full items-center justify-center text-[13px] text-sf-muted">Brak zdjęcia</span>
          }
          @if (sale) {
            <span class="absolute left-2.5 top-2.5 rounded-full bg-sf-danger px-2.5 py-1 text-[11px] font-semibold text-white">Promocja</span>
          }
        </div>
        <div class="flex flex-1 flex-col gap-1" [class]="padded() ? 'p-3.5' : 'pt-3'">
          @if (p.brand) {<span class="text-[12px] uppercase tracking-wide text-sf-muted">{{ p.brand }}</span>}
          <span class="line-clamp-2 text-[15px] font-medium leading-snug group-hover:underline">{{ p.name }}</span>
          <sf-price class="mt-auto pt-1" [price]="p.priceMinor" [compareAt]="p.compareAtMinor" [lowest30]="p.lowestPrice30dMinor"
            [currency]="p.currency" [from]="p.maxPriceMinor > p.priceMinor" />
          @if (!p.available) {<span class="text-[12px] text-sf-muted">Chwilowo niedostępny</span>}
        </div>
      </a>
      <sf-favourite-button class="absolute right-2.5 top-2.5" [productId]="p.id" [name]="p.name" />
      </div>
    }
  `,
})
export class ProductCardComponent {
  protected readonly store = inject(StoreState);
  private readonly api = inject(StorefrontApi);
  private readonly cart = inject(CartState);
  private readonly router = inject(Router);
  readonly product = input.required<ProductCard>();
  protected readonly style = computed(() => this.store.settings()['productCard'] ?? 'plain');
  protected readonly cardClass = computed(() => `sf-card-${this.style()}`);
  protected readonly padded = computed(() => this.style() !== 'plain');
  protected readonly adding = signal(false);
  protected readonly note = signal<string | null>(null);

  protected fmt(minor: number, currency: string): string {
    return money(minor, currency);
  }

  /**
   * Adds straight to the cart when there is nothing to choose (a single available variant); a product with sizes or
   * colours opens its page so the customer picks one.
   */
  protected async quickAdd(): Promise<void> {
    const p = this.product();
    this.adding.set(true);
    this.note.set(null);
    try {
      const detail = await firstValueFrom(this.api.product(p.slug));
      const available = detail.variants.filter((v) => v.available);
      if (available.length !== 1 || detail.variants.length !== 1) {
        await this.router.navigate(['/produkt', p.slug]);
        return;
      }
      await this.cart.add(available[0].id, 1);
      this.cart.drawer.set(true);
    } catch {
      this.note.set('Nie udało się dodać do koszyka.');
    } finally {
      this.adding.set(false);
    }
  }
}

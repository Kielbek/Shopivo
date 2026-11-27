import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StoreState } from '../core/store-state';
import { ProductCard } from '../storefront-api';
import { FavouriteButtonComponent } from './favourite-button';
import { PriceComponent } from './price';

@Component({
  selector: 'sf-product-card',
  imports: [RouterLink, PriceComponent, FavouriteButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = product();
    <div class="relative h-full">
    <a [routerLink]="['/produkt', p.slug]" class="group flex h-full flex-col" [class]="cardClass()">
      <div class="sf-media relative aspect-square">
        @if (p.imageUrl) {
          <img [src]="p.imageUrl" [alt]="p.imageAlt || p.name" loading="lazy" decoding="async" width="400" height="400"
            class="size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
        } @else {
          <span class="flex size-full items-center justify-center text-[13px] text-sf-muted">Brak zdjęcia</span>
        }
        @if (p.compareAtMinor && p.compareAtMinor > p.priceMinor) {
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
  `,
})
export class ProductCardComponent {
  private readonly store = inject(StoreState);
  readonly product = input.required<ProductCard>();
  protected readonly style = computed(() => this.store.settings()['productCard'] ?? 'plain');
  protected readonly cardClass = computed(() => `sf-card-${this.style()}`);
  protected readonly padded = computed(() => this.style() !== 'plain');
}

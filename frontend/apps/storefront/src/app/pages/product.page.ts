import { ChangeDetectionStrategy, Component, RESPONSE_INIT, computed, effect, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { CartState } from '../core/cart';
import { Seo } from '../core/seo';
import { StoreState } from '../core/store-state';
import { PublicVariant, StorefrontApi } from '../storefront-api';
import { BreadcrumbsComponent, Crumb } from '../ui/breadcrumbs';
import { PriceComponent } from '../ui/price';

@Component({
  selector: 'sf-product',
  imports: [RouterLink, BreadcrumbsComponent, PriceComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sf-container py-8">
      @if (product.error()) {
        <h1 class="text-[26px] font-semibold">Nie znaleziono produktu</h1>
        <p class="mt-3 text-sf-muted">Produkt mógł zostać wycofany ze sprzedaży.</p>
        <a routerLink="/produkty" class="sf-btn mt-6">Zobacz inne produkty</a>
      } @else if (loaded(); as p) {
        <sf-breadcrumbs [items]="crumbs()" />
        <div class="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
          <div>
            <div class="sf-media aspect-square">
              @if (activeImage(); as img) {
                <img [src]="img.urls['w1200']" [alt]="img.alt || p.name" class="size-full object-contain" width="1200" height="1200" fetchpriority="high" />
              } @else {
                <span class="flex size-full items-center justify-center text-sf-muted">Brak zdjęcia</span>
              }
            </div>
            @if (p.images.length > 1) {
              <ul class="mt-3 grid grid-cols-5 gap-2" aria-label="Zdjęcia produktu">
                @for (img of p.images; track img.id; let i = $index) {
                  <li><button type="button" class="sf-media block aspect-square w-full border-2" [style.border-color]="i === imageIndex() ? 'var(--sf-primary)' : 'transparent'"
                    [attr.aria-label]="'Zdjęcie ' + (i + 1)" [attr.aria-pressed]="i === imageIndex()" (click)="imageIndex.set(i)">
                    <img [src]="img.urls['w400']" [alt]="img.alt || ''" class="size-full object-cover" loading="lazy" width="400" height="400" /></button></li>
                }
              </ul>
            }
          </div>

          <div>
            @if (p.brand) {<p class="text-[13px] uppercase tracking-wide text-sf-muted">{{ p.brand }}</p>}
            <h1 class="mt-1 text-[30px] font-semibold leading-tight tracking-tight">{{ p.name }}</h1>
            @if (variant(); as v) {
              <sf-price class="mt-4 block" [large]="true" [price]="v.priceMinor" [compareAt]="v.compareAtMinor" [lowest30]="v.lowestPrice30dMinor" [currency]="p.currency" />
              <p class="mt-1 text-[12px] text-sf-muted">Cena zawiera VAT</p>
            }

            @for (o of p.options; track o.name) {
              <fieldset class="mt-6">
                <legend class="text-[14px] font-medium">{{ o.name }}: <span class="text-sf-muted">{{ selection()[o.name] }}</span></legend>
                <div class="mt-2 flex flex-wrap gap-2">
                  @for (value of o.values; track value) {
                    <button type="button" class="min-w-12 border px-3.5 py-2 text-[14px] transition"
                      [style.border-radius]="'var(--sf-radius)'"
                      [style.border-color]="selection()[o.name] === value ? 'var(--sf-text)' : 'color-mix(in srgb, var(--sf-text) 12%, var(--sf-bg))'"
                      [style.background]="selection()[o.name] === value ? 'var(--sf-text)' : 'var(--sf-surface)'"
                      [style.color]="selection()[o.name] === value ? 'var(--sf-bg)' : 'var(--sf-text)'"
                      [class.opacity-45]="!optionAvailable(o.name, value)"
                      [attr.aria-pressed]="selection()[o.name] === value" (click)="choose(o.name, value)">{{ value }}</button>
                  }
                </div>
              </fieldset>
            }

            <div class="mt-6 text-[14px]" aria-live="polite">
              @if (!variant()) {
                <p class="text-sf-muted">Wybierz wariant.</p>
              } @else if (!variant()!.available) {
                <p class="font-medium text-sf-danger">Chwilowo niedostępny</p>
              } @else if (variant()!.lowStock) {
                <p class="font-medium text-sf-success">Dostępny — ostatnie sztuki</p>
              } @else {
                <p class="font-medium text-sf-success">Dostępny</p>
              }
            </div>

            <div class="mt-5 flex gap-3">
              <label class="sr-only" for="qty">Ilość</label>
              <input id="qty" type="number" min="1" max="99" class="sf-input !w-20 text-center" [value]="quantity()"
                (change)="quantity.set(clamp($any($event.target).value))" />
              <button type="button" class="sf-btn flex-1" [disabled]="!variant()?.available || cart.busy()" (click)="add()">
                {{ cart.busy() ? 'Dodawanie…' : 'Dodaj do koszyka' }}
              </button>
            </div>
            @if (message(); as m) {
              <p class="mt-3 text-[14px]" [class.text-sf-danger]="m.error" role="status">{{ m.text }}
                @if (!m.error) { <a routerLink="/koszyk" class="sf-link">Przejdź do koszyka</a>}</p>
            }

            @if (p.description) {
              <section class="mt-10 border-t border-sf-line pt-6" aria-labelledby="desc">
                <h2 id="desc" class="text-[17px] font-semibold">Opis</h2>
                <p class="mt-3 whitespace-pre-line leading-relaxed">{{ p.description }}</p>
              </section>
            }
            @if (variant()?.sku) {<p class="mt-6 text-[12px] text-sf-muted">Kod produktu: {{ variant()!.sku }}</p>}
          </div>
        </div>
      }
    </div>
  `,
})
export class ProductPage {
  private readonly api = inject(StorefrontApi);
  private readonly store = inject(StoreState);
  private readonly seo = inject(Seo);
  private readonly response = inject(RESPONSE_INIT, { optional: true });
  protected readonly cart = inject(CartState);

  readonly slug = input.required<string>();
  protected readonly product = rxResource({ params: () => this.slug(), stream: ({ params }) => this.api.product(params) });
  /** resource.value() throws while the resource is in error state; read through this instead. */
  protected readonly loaded = computed(() => (this.product.hasValue() ? this.product.value() : undefined));
  protected readonly selection = signal<Record<string, string>>({});
  protected readonly imageIndex = signal(0);
  protected readonly quantity = signal(1);
  protected readonly message = signal<{ text: string; error: boolean } | null>(null);

  protected readonly variant = computed<PublicVariant | undefined>(() => {
    const p = this.loaded();
    if (!p) return undefined;
    if (!p.options.length) return p.variants[0];
    const sel = this.selection();
    return p.variants.find((v) => p.options.every((o) => v.optionValues[o.name] === sel[o.name]));
  });
  protected readonly activeImage = computed(() => this.loaded()?.images[this.imageIndex()] ?? this.loaded()?.images[0]);
  protected readonly crumbs = computed<Crumb[]>(() => {
    const p = this.loaded();
    if (!p) return [];
    return [...p.breadcrumbs.map((c) => ({ label: c.name, link: ['/kategoria', c.slug] as unknown[] })), { label: p.name, link: null }];
  });

  constructor() {
    // Preselect the first available variant.
    effect(() => {
      const p = this.loaded();
      if (!p || !p.options.length) return;
      const first = p.variants.find((v) => v.available) ?? p.variants[0];
      if (first) this.selection.set({ ...first.optionValues });
      this.imageIndex.set(0);
    });
    effect(() => {
      const s = this.store.store();
      if (!s) return;
      if (this.product.error()) {
        if (this.response) this.response.status = 404;
        this.seo.set({ title: 'Nie znaleziono produktu', path: '/produkt/' + this.slug(), noindex: true }, s.name);
        return;
      }
      const p = this.loaded();
      if (!p) return;
      const origin = this.seo.origin();
      const image = p.images[0]?.urls['w1200'] ?? null;
      this.seo.set({
        title: p.seoTitle || p.name, description: p.seoDescription || p.description || p.name, path: '/produkt/' + p.slug, image, type: 'product',
        jsonLd: [{
          '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: (p.description ?? '').slice(0, 5000),
          ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
          ...(image ? { image: p.images.map((i) => origin + i.urls['w1200']) } : {}),
          offers: p.variants.map((v) => ({
            '@type': 'Offer', price: (v.priceMinor / 100).toFixed(2), priceCurrency: p.currency, ...(v.sku ? { sku: v.sku } : {}),
            availability: v.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: origin + '/produkt/' + p.slug,
          })),
        }, ...(p.breadcrumbs.length ? [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
          ...p.breadcrumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: origin + '/kategoria/' + c.slug })),
          { '@type': 'ListItem', position: p.breadcrumbs.length + 1, name: p.name }] }] : [])],
      }, s.name);
    });
  }

  protected choose(option: string, value: string): void {
    this.selection.update((s) => ({ ...s, [option]: value }));
    this.message.set(null);
  }

  /** Whether some available variant has this value together with the other current choices. */
  protected optionAvailable(option: string, value: string): boolean {
    const p = this.loaded();
    if (!p) return true;
    const sel = { ...this.selection(), [option]: value };
    return p.variants.some((v) => v.available && p.options.every((o) => o.name === option ? v.optionValues[o.name] === value : v.optionValues[o.name] === sel[o.name]));
  }

  protected clamp(value: string): number {
    return Math.min(99, Math.max(1, Math.round(Number(value) || 1)));
  }

  protected async add(): Promise<void> {
    const v = this.variant();
    if (!v) return;
    try {
      await this.cart.add(v.id, this.quantity());
      this.message.set({ text: 'Dodano do koszyka.', error: false });
    } catch (e: unknown) {
      const err = e as { error?: { detail?: string } };
      this.message.set({ text: err.error?.detail ?? 'Nie udało się dodać produktu. Spróbuj ponownie.', error: true });
    }
  }
}
